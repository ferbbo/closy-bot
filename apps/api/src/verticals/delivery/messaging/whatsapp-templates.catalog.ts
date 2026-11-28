import type { TemplateDefinition, TemplateName } from '../contracts';

/**
 * Catálogo v1 de plantillas utility de WhatsApp (SPEC §4.6a, F-22).
 *
 * Es la fuente de verdad (RN-31): `register-whatsapp-templates` registra exactamente esto y
 * `BusinessMessenger` solo envía plantillas de aquí. Idioma `es`, categoría UTILITY,
 * `parameter_format: named`. Los ejemplos son ficticios (revisión de Meta), nunca datos reales.
 */
export const TEMPLATE_LANGUAGE_DEFAULT = 'es';

type ParamSpec = TemplateDefinition['params'][number];
const p = (name: string, example: string, maxLength: number): ParamSpec => ({
  name,
  example,
  maxLength,
});

const CUSTOMER_NAME = p('customer_name', 'Ana', 60);
const ORDER_CODE = p('order_code', 'ORD-0042', 20);
const MERCHANT_NAME = p('merchant_name', 'Burger Barrio', 60);
const TOTAL = p('total', '$28.000', 20);
const ETA = p('eta_minutes', '35', 4);

const def = (
  name: TemplateName,
  audience: TemplateDefinition['audience'],
  body: string,
  params: ParamSpec[],
): TemplateDefinition => ({
  name,
  category: 'UTILITY',
  language: TEMPLATE_LANGUAGE_DEFAULT,
  audience,
  body,
  params,
});

export const WHATSAPP_TEMPLATES: readonly TemplateDefinition[] = [
  def(
    'pedido_confirmado',
    'customer',
    'Hola {{customer_name}}, tu pedido {{order_code}} en {{merchant_name}} quedó confirmado. Total: {{total}}. Tiempo estimado: {{eta_minutes}} minutos.',
    [CUSTOMER_NAME, ORDER_CODE, MERCHANT_NAME, TOTAL, ETA],
  ),
  def(
    'pago_pendiente',
    'customer',
    'Tu pedido {{order_code}} en {{merchant_name}} está pendiente de pago por {{total}}. Cuando hagas la transferencia, envía el comprobante por este chat.',
    [ORDER_CODE, MERCHANT_NAME, TOTAL],
  ),
  def(
    'pago_confirmado',
    'customer',
    'Recibimos el pago de tu pedido {{order_code}} por {{total}}. Ya está en preparación.',
    [ORDER_CODE, TOTAL],
  ),
  def(
    'pedido_en_preparacion',
    'customer',
    'Tu pedido {{order_code}} de {{merchant_name}} está en preparación. Llega en aproximadamente {{eta_minutes}} minutos.',
    [ORDER_CODE, MERCHANT_NAME, ETA],
  ),
  def(
    'pedido_en_camino',
    'customer',
    'Tu pedido {{order_code}} de {{merchant_name}} va en camino.',
    [ORDER_CODE, MERCHANT_NAME],
  ),
  def(
    'pedido_entregado',
    'customer',
    'Tu pedido {{order_code}} de {{merchant_name}} fue entregado. Si hay algún problema con el pedido, responde a este mensaje.',
    [ORDER_CODE, MERCHANT_NAME],
  ),
  def(
    'pedido_cancelado',
    'customer',
    'Tu pedido {{order_code}} de {{merchant_name}} fue cancelado. Motivo: {{reason}}. Si ya pagaste, responde a este mensaje para gestionar la devolución.',
    [ORDER_CODE, MERCHANT_NAME, p('reason', 'el local cerró antes de tiempo', 120)],
  ),
  def(
    'seguimiento_atencion',
    'customer',
    'Hola {{customer_name}}, te escribimos de {{merchant_name}} sobre tu pedido {{order_code}}. Responde a este mensaje para continuar la atención.',
    [CUSTOMER_NAME, MERCHANT_NAME, ORDER_CODE],
  ),
  def(
    'comanda_nuevo_pedido',
    'merchant',
    'Nuevo pedido {{order_code}}: {{items}}. Entrega: {{fulfillment}} {{address}}. Pago: {{payment}}. Total: {{total}}.',
    [
      ORDER_CODE,
      p('items', '2x Hamburguesa sencilla (sin cebolla); 1x Gaseosa 400 ml', 600),
      p('fulfillment', 'Domicilio', 30),
      p('address', 'Calle 45 # 30-12, Cabecera', 200),
      p('payment', 'Efectivo', 60),
      TOTAL,
    ],
  ),
  def(
    'alerta_operacion',
    'merchant',
    'Aviso de Closy para {{merchant_name}}: {{alert}}. Pedido: {{order_code}}.',
    [MERCHANT_NAME, p('alert', 'hay un cliente esperando atención humana', 200), ORDER_CODE],
  ),
];

const BY_NAME = new Map<string, TemplateDefinition>(WHATSAPP_TEMPLATES.map((t) => [t.name, t]));

export function getTemplateDefinition(name: TemplateName): TemplateDefinition {
  const found = BY_NAME.get(name);
  if (!found) throw new Error(`Unknown WhatsApp template: ${name}`);
  return found;
}

/** Nombres `{{param}}` en el orden en que aparecen en el cuerpo. */
export function extractBodyParams(body: string): string[] {
  return Array.from(body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g), (m) => m[1]);
}

/** Sanea un parámetro (RN-31): sin saltos de línea/tabs, espacios colapsados, trim, maxLength. */
export function sanitizeTemplateParam(value: string | null | undefined, maxLength: number): string {
  const clean = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 1))}…` : clean;
}

/** Renderiza el cuerpo con los parámetros (vacíos → "-"), p. ej. para MessageLog o texto libre. */
export function renderTemplateBody(
  def: TemplateDefinition,
  params: Record<string, string>,
): string {
  return def.body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_m, key: string) => params[key] || '-');
}

/** Payload de Graph API `POST /{waba_id}/message_templates` (parameter_format named). */
export function toGraphTemplatePayload(def: TemplateDefinition, language = def.language) {
  return {
    name: def.name,
    language,
    category: def.category,
    parameter_format: 'named',
    components: [
      {
        type: 'BODY',
        text: def.body,
        example: {
          body_text_named_params: def.params.map((x) => ({
            param_name: x.name,
            example: x.example,
          })),
        },
      },
    ],
  };
}
