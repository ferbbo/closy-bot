import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { createHash } from 'crypto';
import type { FakeGraphApi as FakeGraphApiContract } from '../../src/verticals/delivery/contracts';
import { SANDBOX_APP } from './sandbox-app';
import {
  GraphError,
  metaErrorBody,
  RegisteredTemplate,
  SentMessage,
  validateMessage,
  validateTemplateCreate,
} from './graph-validation';

export type { RegisteredTemplate, SentMessage } from './graph-validation';

/**
 * Meta Sandbox (S1.5-T2) — Graph API falso de WhatsApp Cloud API.
 *
 * Servidor HTTP local (módulo `http` de Node, sin dependencias) en un puerto efímero.
 * Lo usan los e2e de la vertical (y la demo local con `pnpm meta:sandbox`). Ningún test
 * habla con graph.facebook.com.
 *
 * Endpoints (`:v` = versión, p. ej. v21.0):
 *   POST /:v/:phoneNumberId/messages        text | template | interactive | image → { messages:[{id:'wamid.SANDBOX…'}] }
 *   GET  /:v/:mediaId                        metadatos del media → { url, mime_type, file_size, sha256 }
 *   GET  /__media/:mediaId                   binario del media (requiere Bearer)
 *   POST /:v/:wabaId/message_templates       registro de plantilla (valida categoría, nombre, ejemplos) → APPROVED
 *   GET  /:v/:wabaId/message_templates       listado
 *   POST /__sandbox/fail-next                { endpoint, httpStatus, code, message } → la próxima llamada falla
 *   GET  /__sandbox/sent                     mensajes registrados
 *   GET  /__sandbox/templates                plantillas registradas
 *   POST /__sandbox/reset                    limpia mensajes, plantillas y fallos
 */

export type SandboxEndpoint = 'messages' | 'media' | 'templates';
export interface SandboxError {
  httpStatus: number;
  code: number;
  message: string;
}

/** Bytes mínimos con las firmas de formato reales (OggS / JPEG SOI…EOI). */
export const FIXTURE_AUDIO_ID = 'sandbox-media-audio-1';
export const FIXTURE_IMAGE_ID = 'sandbox-media-image-1';
export const FIXTURE_AUDIO = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.alloc(60, 1)]);
export const FIXTURE_IMAGE = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(60, 2),
  Buffer.from([0xff, 0xd9]),
]);

export class FakeGraphApi implements FakeGraphApiContract {
  private server: Server | null = null;
  private baseUrl = '';
  private messages: SentMessage[] = [];
  private templates: RegisteredTemplate[] = [];
  private media = new Map<string, { buffer: Buffer; mimeType: string }>();
  private failures = new Map<SandboxEndpoint, SandboxError>();
  private seq = 0;

  constructor(
    private readonly opts: {
      port?: number;
      accessToken?: string;
      preloadTemplates?: Array<Omit<RegisteredTemplate, 'id'>>;
    } = {},
  ) {
    this.reset();
  }

  async start(): Promise<{ baseUrl: string }> {
    if (this.server) return { baseUrl: this.baseUrl };
    this.server = createServer((req, res) => {
      void this.handle(req, res);
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(this.opts.port ?? 0, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
    return { baseUrl: this.baseUrl };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  reset(): void {
    this.messages = [];
    this.failures.clear();
    this.templates = (this.opts.preloadTemplates ?? []).map((t) => ({
      ...t,
      id: this.nextId('tpl'),
    }));
    this.media.clear();
    this.media.set(FIXTURE_AUDIO_ID, { buffer: FIXTURE_AUDIO, mimeType: 'audio/ogg' });
    this.media.set(FIXTURE_IMAGE_ID, { buffer: FIXTURE_IMAGE, mimeType: 'image/jpeg' });
  }

  sent(): SentMessage[] {
    return [...this.messages];
  }

  registeredTemplates(): Array<{
    name: string;
    language: string;
    category: string;
    status: string;
  }> {
    return this.templates.map(({ name, language, category, status }) => ({
      name,
      language,
      category,
      status,
    }));
  }

  failNext(endpoint: SandboxEndpoint, error: SandboxError): void {
    this.failures.set(endpoint, error);
  }

  putMedia(mediaId: string, file: { buffer: Buffer; mimeType: string }): void {
    this.media.set(mediaId, file);
  }

  // ---------------------------------------------------------------------------

  private nextId(prefix: string): string {
    return `${prefix}_${Date.now()}_${++this.seq}`;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://sandbox');
      const parts = url.pathname.split('/').filter(Boolean);
      const method = req.method ?? 'GET';
      const body = method === 'POST' ? await this.readJson(req) : {};

      // Control endpoints (sin auth)
      if (parts[0] === '__sandbox') {
        return this.handleControl(method, parts[1], body, res);
      }
      this.assertAuth(req);

      if (parts[0] === '__media' && parts[1] && method === 'GET') {
        this.consumeFailure('media');
        const file = this.media.get(parts[1]);
        if (!file) throw new GraphError(404, 100, 'Media not found');
        res.writeHead(200, { 'Content-Type': file.mimeType, 'Content-Length': file.buffer.length });
        res.end(file.buffer);
        return;
      }
      if (parts.length === 3 && parts[2] === 'messages' && method === 'POST') {
        this.consumeFailure('messages');
        return this.send(res, 200, this.handleMessage(parts[1], body));
      }
      if (parts.length === 3 && parts[2] === 'message_templates') {
        this.consumeFailure('templates');
        if (method === 'POST') return this.send(res, 200, this.handleTemplateCreate(body));
        return this.send(res, 200, {
          data: this.templates.map(({ id, name, language, category, status }) => ({
            id,
            name,
            language,
            category,
            status,
          })),
        });
      }
      if (parts.length === 2 && method === 'GET') {
        this.consumeFailure('media');
        const file = this.media.get(parts[1]);
        if (!file)
          throw new GraphError(
            404,
            100,
            `Unsupported get request. Object with ID '${parts[1]}' does not exist`,
          );
        return this.send(res, 200, {
          messaging_product: 'whatsapp',
          id: parts[1],
          url: `${this.baseUrl}/__media/${encodeURIComponent(parts[1])}`,
          mime_type: file.mimeType,
          file_size: file.buffer.length,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
        });
      }
      throw new GraphError(404, 100, `Unknown path ${method} ${url.pathname}`);
    } catch (error) {
      if (error instanceof GraphError) {
        return this.send(res, error.httpStatus, metaErrorBody(error));
      }
      return this.send(res, 500, metaErrorBody({ code: 1, message: (error as Error).message }));
    }
  }

  private handleControl(
    method: string,
    action: string | undefined,
    body: Record<string, unknown>,
    res: ServerResponse,
  ): void {
    if (action === 'fail-next' && method === 'POST') {
      const endpoint = body.endpoint as SandboxEndpoint;
      if (!['messages', 'media', 'templates'].includes(endpoint))
        throw new GraphError(400, 100, 'invalid endpoint');
      this.failNext(endpoint, {
        httpStatus: Number(body.httpStatus ?? 500),
        code: Number(body.code ?? 1),
        message: String(body.message ?? 'Sandbox forced failure'),
      });
      return this.send(res, 200, { ok: true });
    }
    if (action === 'sent' && method === 'GET') return this.send(res, 200, { data: this.sent() });
    if (action === 'templates' && method === 'GET')
      return this.send(res, 200, { data: this.registeredTemplates() });
    if (action === 'reset' && method === 'POST') {
      this.reset();
      return this.send(res, 200, { ok: true });
    }
    throw new GraphError(404, 100, `Unknown sandbox action ${action}`);
  }

  private assertAuth(req: IncomingMessage): void {
    const expected = this.opts.accessToken ?? SANDBOX_APP.accessToken;
    if (req.headers.authorization !== `Bearer ${expected}`) {
      throw new GraphError(401, 190, 'Invalid OAuth access token - Cannot parse access token');
    }
  }

  private consumeFailure(endpoint: SandboxEndpoint): void {
    const failure = this.failures.get(endpoint);
    if (!failure) return;
    this.failures.delete(endpoint);
    throw new GraphError(failure.httpStatus, failure.code, failure.message);
  }

  private handleMessage(
    phoneNumberId: string,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const { to, type } = validateMessage(body, this.templates);
    const id = `wamid.SANDBOX_${phoneNumberId}_${++this.seq}`;
    this.messages.push({ id, to, type, payload: body, at: new Date() });
    return {
      messaging_product: 'whatsapp',
      contacts: [{ input: to, wa_id: to }],
      messages: [{ id }],
    };
  }

  private handleTemplateCreate(body: Record<string, unknown>): Record<string, unknown> {
    const valid = validateTemplateCreate(body, this.templates);
    const tpl: RegisteredTemplate = { ...valid, id: this.nextId('tpl'), status: 'APPROVED' };
    this.templates.push(tpl);
    return { id: tpl.id, status: tpl.status, category: tpl.category };
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new GraphError(400, 100, 'Invalid JSON body');
    }
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}
