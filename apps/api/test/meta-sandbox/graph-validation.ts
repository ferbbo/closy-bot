/**
 * Meta Sandbox (S1.5-T2) — reglas de validación y formato de errores de Graph API
 * que aplica el Graph API falso (mensajes, plantillas). Errores con el JSON de Meta.
 */

export interface SentMessage {
  id: string;
  to: string;
  type: 'text' | 'template' | 'interactive'; // contrato FakeGraphApi (S5.4 añadirá image)
  payload: Record<string, unknown>;
  at: Date;
}
export interface RegisteredTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  paramNames: string[];
  components: unknown[];
}

const PARAM_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;
const CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];

export class GraphError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number,
    message: string,
    readonly details?: string,
  ) {
    super(message);
  }
}

export function metaErrorBody(err: {
  code: number;
  message: string;
  details?: string;
}): Record<string, unknown> {
  return {
    error: {
      message: err.message,
      type: 'OAuthException',
      code: err.code,
      error_data: { messaging_product: 'whatsapp', details: err.details ?? err.message },
      fbtrace_id: 'SANDBOX_TRACE',
    },
  };
}

/** Valida un POST /messages con las reglas de Cloud API; devuelve destinatario y tipo. */
export function validateMessage(
  body: Record<string, unknown>,
  templates: RegisteredTemplate[],
): { to: string; type: SentMessage['type'] } {
  if (body.messaging_product !== 'whatsapp') {
    throw new GraphError(400, 100, '(#100) The parameter messaging_product is required.');
  }
  const to = typeof body.to === 'string' ? body.to : '';
  if (!/^\d{8,15}$/.test(to))
    throw new GraphError(400, 100, '(#100) Invalid parameter', 'to must be digits only');
  const type = body.type as SentMessage['type'];

  if (type === 'text') {
    const text = body.text as { body?: unknown } | undefined;
    if (typeof text?.body !== 'string' || !text.body.trim()) {
      throw new GraphError(400, 100, '(#100) The parameter text[body] is required.');
    }
  } else if (type === 'template') {
    validateTemplateMessage(body.template, templates);
  } else if (type === 'interactive') {
    const interactive = body.interactive as
      | { type?: string; body?: { text?: string }; action?: Record<string, unknown> }
      | undefined;
    if (!interactive?.type || !interactive.body?.text || !interactive.action) {
      throw new GraphError(
        400,
        100,
        '(#100) Invalid interactive message',
        'type, body.text and action are required',
      );
    }
  } else {
    throw new GraphError(400, 100, `(#100) Unsupported message type: ${String(type)}`);
  }

  return { to, type };
}

export function validateTemplateMessage(raw: unknown, templates: RegisteredTemplate[]): void {
  const template = raw as
    | {
        name?: string;
        language?: { code?: string };
        components?: Array<{
          type?: string;
          parameters?: Array<{ type?: string; text?: string; parameter_name?: string }>;
        }>;
      }
    | undefined;
  if (!template?.name || !template.language?.code) {
    throw new GraphError(400, 100, '(#100) template.name and template.language.code are required');
  }
  const registered = templates.find(
    (t) => t.name === template.name && t.language === template.language!.code,
  );
  if (!registered) {
    throw new GraphError(
      404,
      132001,
      'Template name does not exist in the translation',
      `template name (${template.name}) does not exist in ${template.language.code}`,
    );
  }
  if (registered.status !== 'APPROVED') {
    throw new GraphError(
      400,
      132015,
      'Template is paused',
      `template ${template.name} status ${registered.status}`,
    );
  }
  const params = (template.components ?? [])
    .filter((c) => (c.type ?? '').toLowerCase() === 'body')
    .flatMap((c) => c.parameters ?? []);
  for (const p of params) {
    if (typeof p.text !== 'string' || /[\n\t]|\s{5,}/.test(p.text)) {
      throw new GraphError(
        400,
        132018,
        'There was an issue with the parameters in your template.',
        'Param text cannot have new-line/tab characters or more than 4 consecutive spaces',
      );
    }
  }
  const given = new Set(params.map((p) => p.parameter_name).filter(Boolean));
  const missing = registered.paramNames.filter((n) => !given.has(n));
  if (missing.length > 0 || params.length !== registered.paramNames.length) {
    throw new GraphError(
      400,
      132000,
      'Number of parameters does not match the expected number of params',
      `expected ${registered.paramNames.join(',')}`,
    );
  }
}

/** Valida un POST /message_templates (nombre, categoría, cuerpo, ejemplos, duplicados). */
export function validateTemplateCreate(
  body: Record<string, unknown>,
  templates: RegisteredTemplate[],
): Omit<RegisteredTemplate, 'id' | 'status'> {
  const name = String(body.name ?? '');
  const language = String(body.language ?? '');
  const category = String(body.category ?? '');
  const components = Array.isArray(body.components)
    ? (body.components as Array<Record<string, unknown>>)
    : [];
  if (!TEMPLATE_NAME_RE.test(name))
    throw new GraphError(
      400,
      100,
      'Invalid parameter',
      'name must be lowercase letters, digits and underscores',
    );
  if (!language) throw new GraphError(400, 100, 'Invalid parameter', 'language is required');
  if (!CATEGORIES.includes(category))
    throw new GraphError(
      400,
      100,
      'Invalid parameter',
      `category must be one of ${CATEGORIES.join(', ')}`,
    );
  const bodyComponent = components.find((c) => String(c.type).toUpperCase() === 'BODY');
  const text = typeof bodyComponent?.text === 'string' ? bodyComponent.text : '';
  if (!text.trim())
    throw new GraphError(400, 100, 'Invalid parameter', 'BODY component with text is required');
  const paramNames = [...text.matchAll(PARAM_RE)].map((m) => m[1]);
  if (paramNames.length > 0) {
    if (!text.replace(PARAM_RE, '').trim()) {
      throw new GraphError(400, 2388299, 'Template body cannot contain only variables');
    }
    const example = bodyComponent?.example as
      | { body_text_named_params?: Array<{ param_name?: string; example?: string }> }
      | undefined;
    const examples = new Map(
      (example?.body_text_named_params ?? []).map((e) => [e.param_name, e.example]),
    );
    const withoutExample = paramNames.filter((n) => !examples.get(n));
    if (withoutExample.length > 0) {
      throw new GraphError(
        400,
        100,
        'Invalid parameter',
        `missing examples for: ${withoutExample.join(', ')}`,
      );
    }
  }
  if (templates.some((t) => t.name === name && t.language === language)) {
    throw new GraphError(
      400,
      100,
      'Invalid parameter',
      `Content in this language already exists for ${name}`,
    );
  }
  return { name, language, category, paramNames, components };
}
