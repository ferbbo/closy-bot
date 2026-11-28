import type { TemplateName } from '../contracts';
import {
  WHATSAPP_TEMPLATES,
  extractBodyParams,
  getTemplateDefinition,
  renderTemplateBody,
  sanitizeTemplateParam,
  toGraphTemplatePayload,
} from './whatsapp-templates.catalog';

/** RN-31: lint del catálogo de plantillas (AC-34). */
describe('WhatsApp templates catalog — lint (RN-31, AC-34)', () => {
  const EXPECTED: TemplateName[] = [
    'pedido_confirmado',
    'pago_pendiente',
    'pago_confirmado',
    'pedido_en_preparacion',
    'pedido_en_camino',
    'pedido_entregado',
    'pedido_cancelado',
    'seguimiento_atencion',
    'comanda_nuevo_pedido',
    'alerta_operacion',
  ];
  const PROMO =
    /\b(descuentos?|promos?|promoci[oó]n(es)?|ofertas?|gratis|cup[oó]n(es)?|vuelve|vuelvas|aprovecha)\b/i;

  it('contains exactly the 10 templates of SPEC §4.6a', () => {
    expect(WHATSAPP_TEMPLATES.map((t) => t.name).sort()).toEqual([...EXPECTED].sort());
  });

  it.each(WHATSAPP_TEMPLATES.map((t) => [t.name, t] as const))('%s passes lint', (_n, t) => {
    expect(t.category).toBe('UTILITY');
    expect(t.language).toBe('es');
    expect(t.name).toMatch(/^[a-z0-9_]{1,512}$/);
    expect(t.body).not.toMatch(PROMO);
    expect(t.body).not.toMatch(/\n/);
    expect(t.body.length).toBeLessThanOrEqual(1024);

    // ningún cuerpo solo de variables: debe quedar texto fijo significativo
    const fixed = t.body.replace(/\{\{[^}]+\}\}/g, '').replace(/[\s.,:;!?¿¡-]/g, '');
    expect(fixed.length).toBeGreaterThanOrEqual(15);
    // Meta rechaza cuerpos que empiezan o terminan en variable
    expect(t.body.trim()).not.toMatch(/^\{\{/);
    expect(t.body.trim()).not.toMatch(/\}\}$/);

    // parámetros declarados == parámetros del cuerpo, con ejemplos válidos
    expect([...new Set(extractBodyParams(t.body))].sort()).toEqual(
      t.params.map((x) => x.name).sort(),
    );
    for (const param of t.params) {
      expect(param.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(param.example.trim().length).toBeGreaterThan(0);
      expect(param.example).not.toMatch(/[\r\n\t]/);
      expect(param.example).not.toMatch(PROMO);
      expect(param.example.length).toBeLessThanOrEqual(param.maxLength);
      expect(param.maxLength).toBeGreaterThan(0);
    }
  });

  it('getTemplateDefinition resolves known names and throws on unknown', () => {
    expect(getTemplateDefinition('pedido_en_camino').audience).toBe('customer');
    expect(getTemplateDefinition('comanda_nuevo_pedido').audience).toBe('merchant');
    expect(() => getTemplateDefinition('promo_x' as TemplateName)).toThrow('Unknown');
  });

  it('sanitizeTemplateParam removes newlines/tabs, trims and truncates', () => {
    expect(sanitizeTemplateParam('  2x Perro\n1x Gaseosa\t ', 100)).toBe('2x Perro 1x Gaseosa');
    expect(sanitizeTemplateParam('abcdefghij', 5)).toBe('abcd…');
    expect(sanitizeTemplateParam(undefined, 5)).toBe('');
  });

  it('renderTemplateBody fills named params', () => {
    const t = getTemplateDefinition('pedido_en_camino');
    expect(renderTemplateBody(t, { order_code: 'ORD-1', merchant_name: 'BB' })).toBe(
      'Tu pedido ORD-1 de BB va en camino.',
    );
  });

  it('toGraphTemplatePayload builds a valid Graph API message_templates payload (dry-run)', () => {
    const payloads = WHATSAPP_TEMPLATES.map((t) => toGraphTemplatePayload(t));
    expect(payloads).toHaveLength(10);
    const camino = payloads.find((x) => x.name === 'pedido_en_camino');
    expect(camino).toEqual({
      name: 'pedido_en_camino',
      language: 'es',
      category: 'UTILITY',
      parameter_format: 'named',
      components: [
        {
          type: 'BODY',
          text: 'Tu pedido {{order_code}} de {{merchant_name}} va en camino.',
          example: {
            body_text_named_params: [
              { param_name: 'order_code', example: 'ORD-0042' },
              { param_name: 'merchant_name', example: 'Burger Barrio' },
            ],
          },
        },
      ],
    });
  });
});
