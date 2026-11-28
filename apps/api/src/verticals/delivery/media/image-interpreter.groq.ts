import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import type {
  FetchedMedia,
  ImageInterpretation,
  ImageInterpreter,
  ImageKind,
  MediaResult,
} from '../contracts';

export const VISION_TIMEOUT_MS = 9_000;
const MAX_ITEMS = 5; // contracts: ImageInterpretation.items máximo 5
const MAX_QUERY_CHARS = 80;
const MAX_CAPTION_CHARS = 300;
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const KINDS: readonly ImageKind[] = ['product', 'payment_receipt', 'menu', 'other'];
const CONFIDENCES: ReadonlyArray<ImageInterpretation['confidence']> = ['HIGH', 'MED', 'LOW'];

/**
 * Prompt de SOLO descripción (RN-25). No lleva precios, productos, ids ni datos del comercio:
 * el modelo describe qué se ve; el catálogo de la BD decide qué existe y cuánto cuesta.
 */
export function buildVisionPrompt(merchantCategories: string[]): string {
  const categories = merchantCategories
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 10);
  return [
    'Eres un clasificador de imágenes para un restaurante de comidas rápidas. Solo DESCRIBES lo que ves.',
    'Responde ÚNICAMENTE un JSON con esta forma exacta:',
    '{"kind":"product"|"payment_receipt"|"menu"|"other","items":[{"query":string,"quantity":number|null}],"confidence":"HIGH"|"MED"|"LOW"}',
    'Reglas:',
    '- kind="product" si la foto muestra comida o bebida que el cliente quiere pedir; "payment_receipt" si es un comprobante de pago o transferencia; "menu" si es una carta o menú; "other" en cualquier otro caso.',
    '- items solo si kind="product": máximo 5; query = nombre corto y genérico del producto en español (ej. "hamburguesa con tocineta", "coca cola"); quantity = cuántas unidades se ven o dice el texto del cliente, o null.',
    '- NUNCA escribas precios, montos, valores, códigos ni identificadores. No inventes marcas que no se lean.',
    ...(categories.length ? [`- Categorías de referencia: ${categories.join(', ')}.`] : []),
  ].join('\n');
}

/**
 * Validación estricta de la salida del modelo → `ImageInterpretation` (o null si no es válida).
 * Solo se copian `query` y `quantity`: cualquier otra clave (precio, id, …) se descarta.
 */
export function parseInterpretation(raw: unknown): ImageInterpretation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind as ImageKind;
  if (!KINDS.includes(kind)) return null;
  const confidence = CONFIDENCES.includes(obj.confidence as ImageInterpretation['confidence'])
    ? (obj.confidence as ImageInterpretation['confidence'])
    : 'LOW';
  const items: ImageInterpretation['items'] = [];
  if (kind === 'product' && Array.isArray(obj.items)) {
    for (const entry of obj.items) {
      if (items.length >= MAX_ITEMS) break;
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.query !== 'string') continue;
      // Sin cifras de dinero en la consulta (RN-25): "$19.000", "19000 pesos"
      const query = e.query
        .replace(/\$\s*\d[\d.,]*/g, ' ')
        .replace(/\d[\d.,]*\s*(pesos|cop)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_QUERY_CHARS);
      if (!query) continue;
      const q = e.quantity;
      const quantity = typeof q === 'number' && Number.isInteger(q) && q >= 1 ? q : null;
      items.push({ query, quantity });
    }
  }
  return { kind, items, confidence };
}

/**
 * GroqVisionInterpreter (S5.3-T1): visión vía Groq (`DELIVERY_VISION_MODEL`), imagen como data URL
 * base64 (la media no se persiste). Nunca lanza: timeout → TIMEOUT, error/JSON inválido →
 * PROVIDER_ERROR, sin `GROQ_API_KEY` o mime no soportado → UNSUPPORTED. No loguea caption ni media.
 */
@Injectable()
export class GroqVisionInterpreter implements ImageInterpreter {
  private readonly logger = new Logger(GroqVisionInterpreter.name);
  private readonly client: Groq | null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY', '');
    this.client = apiKey ? new Groq({ apiKey, maxRetries: 0, timeout: VISION_TIMEOUT_MS }) : null;
    this.model = this.configService.get<string>(
      'DELIVERY_VISION_MODEL',
      'meta-llama/llama-4-scout-17b-16e-instruct',
    );
  }

  async interpret(
    media: FetchedMedia,
    opts: { caption?: string; merchantCategories: string[] },
  ): Promise<MediaResult<ImageInterpretation>> {
    if (!this.client) return { ok: false, reason: 'UNSUPPORTED' };
    const mime = media.mimeType.toLowerCase().split(';')[0].trim();
    if (!SUPPORTED_MIME.has(mime)) return { ok: false, reason: 'UNSUPPORTED' };
    if (!media.buffer.length) return { ok: false, reason: 'EMPTY' };

    const caption = opts.caption?.trim().slice(0, MAX_CAPTION_CHARS);
    const dataUrl = `data:${mime};base64,${media.buffer.toString('base64')}`;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'TIMEOUT'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('TIMEOUT');
      }, VISION_TIMEOUT_MS);
    });

    try {
      const pending = this.client.chat.completions.create(
        {
          model: this.model,
          temperature: 0,
          max_tokens: 300,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildVisionPrompt(opts.merchantCategories) },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: caption
                    ? `Texto que el cliente envió con la foto: "${caption}"`
                    : 'El cliente envió esta foto sin texto.',
                },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        },
        { signal: controller.signal },
      );
      pending.catch(() => undefined); // evita unhandled rejection si gana el timeout
      const outcome = await Promise.race([pending, timeout]);
      if (outcome === 'TIMEOUT') return this.fail('TIMEOUT', startedAt);
      const content = outcome.choices?.[0]?.message?.content ?? '';
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return this.fail('PROVIDER_ERROR', startedAt);
      }
      const interpretation = parseInterpretation(parsed);
      if (!interpretation) return this.fail('PROVIDER_ERROR', startedAt);
      this.logger.debug(
        `vision ok kind=${interpretation.kind} items=${interpretation.items.length} latencyMs=${Date.now() - startedAt}`,
      );
      return { ok: true, value: interpretation };
    } catch (error) {
      const name = (error as { name?: string } | undefined)?.name ?? '';
      const reason = ['AbortError', 'APIUserAbortError', 'APIConnectionTimeoutError'].includes(name)
        ? 'TIMEOUT'
        : 'PROVIDER_ERROR';
      return this.fail(reason, startedAt);
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(
    reason: 'TIMEOUT' | 'PROVIDER_ERROR',
    startedAt: number,
  ): MediaResult<ImageInterpretation> {
    this.logger.warn(`vision failed reason=${reason} latencyMs=${Date.now() - startedAt}`);
    return { ok: false, reason };
  }
}
