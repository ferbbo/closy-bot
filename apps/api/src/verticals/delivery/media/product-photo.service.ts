import { Injectable, Logger } from '@nestjs/common';
import { CatalogMatcherService } from '../catalog/catalog-matcher.service';
import type { ImageInterpretation, VariantCandidate } from '../contracts';

/** Candidato de una foto de producto: el de la BD + la cantidad que sugirió la foto o el caption. */
export type PhotoCandidate = VariantCandidate & { suggestedQuantity: number | null };

export const PHOTO_TEXTS = {
  notFound: 'No encontré ese producto en la carta. ¿Te muestro el menú?',
  describe: '¿Me cuentas con texto qué producto es? Así lo busco en la carta 🙂',
} as const;

const MAX_CANDIDATES = 10;
const ECHO_MAX_CHARS = 200;

export type ProductPhotoResult =
  | { status: 'NOT_FOUND' }
  | { status: 'FOUND'; candidates: PhotoCandidate[]; agentText: string; echo: string };

/**
 * ProductPhotoResolver (S5.3-T2, F-20, RN-25): las consultas que describió la visión pasan por
 * `CatalogMatcherService` (BD en el turno, RN-00). Nunca agrega al carrito: devuelve los
 * candidatos (para `lastCandidates`, RN-02) y un texto para que el agente busque, presente las
 * opciones con precios de sus herramientas y pida la elección del cliente.
 */
@Injectable()
export class ProductPhotoResolver {
  private readonly logger = new Logger(ProductPhotoResolver.name);

  constructor(private readonly matcher: CatalogMatcherService) {}

  async resolve(
    merchantId: string,
    items: ImageInterpretation['items'],
    caption?: string,
  ): Promise<ProductPhotoResult> {
    const candidates: PhotoCandidate[] = [];
    const found: ImageInterpretation['items'] = [];
    for (const item of items.slice(0, 5)) {
      const match = await this.matcher.search(merchantId, item.query, 5).catch((error) => {
        this.logger.error(`photo match failed: ${(error as Error).message}`);
        return null;
      });
      if (!match || match.status === 'NOT_FOUND') continue;
      found.push(item);
      const list = match.status === 'MATCHED' ? [match.candidate] : match.candidates;
      for (const c of list) {
        if (candidates.some((x) => x.variantId === c.variantId)) continue;
        candidates.push({ ...c, suggestedQuantity: item.quantity });
      }
    }
    if (candidates.length === 0) return { status: 'NOT_FOUND' };
    return {
      status: 'FOUND',
      candidates: candidates.slice(0, MAX_CANDIDATES),
      agentText: buildAgentText(found, caption),
      echo: buildEcho(found),
    };
  }
}

const describeItem = (i: { query: string; quantity: number | null }): string =>
  i.quantity ? `${i.quantity} × ${i.query}` : i.query;

/** Mensaje sintético para el turno del agente (no se persiste como texto del cliente). */
function buildAgentText(items: ImageInterpretation['items'], caption?: string): string {
  const lines = [
    `[foto de producto] El cliente envió una foto. Se ve: ${items.map(describeItem).join('; ')}.`,
    'Búscalo con buscar_producto (con la cantidad si la hay), muéstrale las opciones que encuentres y pregúntale cuál quiere.',
    'No agregues nada al carrito hasta que el cliente elija; cuando elija, usa la cantidad de la foto salvo que diga otra.',
  ];
  const text = caption?.trim();
  if (text) lines.push(`Texto que escribió con la foto: "${text.slice(0, 300)}"`);
  return lines.join('\n');
}

/** Eco visible para el cliente; queda en el historial y lleva la cantidad al turno en que elige. */
function buildEcho(items: ImageInterpretation['items']): string {
  const body = items.map((i) => (i.quantity ? `${i.query} ×${i.quantity}` : i.query)).join(', ');
  const prefix = '📷 En tu foto veo: ';
  const budget = ECHO_MAX_CHARS - prefix.length;
  return `${prefix}${body.length > budget ? `${body.slice(0, budget - 1)}…` : body}`;
}

const HINT_TTL_MS = 30 * 60 * 1000; // igual que lastCandidates (RN-02)

/**
 * Pista para el turno en que el cliente elige ("la primera"): cantidades sugeridas por la foto
 * en los `lastCandidates` vigentes. Solo labels de la BD y cantidades; nunca precios.
 */
export function photoQuantityHint(
  last:
    | { items: Array<VariantCandidate & { suggestedQuantity?: number | null }>; createdAt: string }
    | null
    | undefined,
  now: Date,
): string {
  if (!last?.items?.length) return '';
  const age = now.getTime() - new Date(last.createdAt).getTime();
  if (!(age >= 0 && age <= HINT_TTL_MS)) return '';
  const withQty = last.items.filter((c) => c.suggestedQuantity);
  if (!withQty.length) return '';
  const list = withQty.map((c) => `${c.label} ×${c.suggestedQuantity}`).join(', ');
  return `[nota interna] De la foto anterior, cantidades sugeridas: ${list}. Úsalas si el cliente elige una de esas opciones sin decir otra cantidad.`;
}

/** Quita las cantidades sugeridas una vez usadas (para no repetir la pista en turnos siguientes). */
export function withoutSuggestedQuantity<T extends VariantCandidate>(
  items: T[],
): VariantCandidate[] {
  return items.map((c) => {
    const copy: VariantCandidate & { suggestedQuantity?: unknown } = { ...c };
    delete copy.suggestedQuantity;
    return copy;
  });
}
