import { FakeLlmProvider, type FakeLlmStep } from '../../../../../test/utils/fake-llm.provider';
import { runToolLoop } from '../../../../llm/tool-loop';
import type { ToolHandler, ToolResult } from '../../contracts';
import {
  buildDeliveryToolsHarness,
  type FakeDeliveryDb,
} from '../../checkout/testing/delivery-tools.harness';

type Call = { name: string; args: Record<string, unknown>; result: ToolResult };

/**
 * S3.1-T3: conversaciones con FakeLlmProvider + runToolLoop real sobre DeliveryTools
 * (BD en memoria). Cada `say` es un turno del cliente con su guion de LLM.
 */
function conversation(db: Partial<FakeDeliveryDb> = {}) {
  const h = buildDeliveryToolsHarness(db);
  const calls: Call[] = [];
  const handlers: Record<string, ToolHandler> = {};
  for (const [name, fn] of Object.entries(h.handlers)) {
    handlers[name] = async (args, ctx) => {
      const result = await fn(args, ctx);
      calls.push({ name, args, result });
      return result;
    };
  }
  const say = async (text: string, steps: FakeLlmStep[]) => {
    const llm = new FakeLlmProvider(steps, { strict: true });
    const from = calls.length;
    const out = await runToolLoop(llm, {
      request: {
        systemPrompt: 'test',
        messages: [{ role: 'user', content: text }],
        tools: h.tools.definitions,
      },
      handlers,
      ctx: { ...h.ctx, text },
    });
    expect(llm.remaining).toBe(0);
    return { ...out, calls: calls.slice(from) };
  };
  return { h, calls, say };
}

const data = (c: Call) => c.result.data as Record<string, unknown>;

describe('Entrega y cotización conversacional (S3.1-T3)', () => {
  it('AC-32: datos en un solo mensaje → fija y cotiza en el mismo turno, sin preguntar nada', async () => {
    const { h, say } = conversation();
    const turn = await say('a la cra 27 #45-12 cabecera, timbre 2', [
      {
        toolCalls: [
          {
            name: 'fijar_entrega',
            arguments: { direccion: 'cra 27 #45-12 cabecera', referencia: 'timbre 2' },
          },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Listo, a Cabecera.' },
    ]);
    expect(turn.fallbackReason).toBeUndefined();
    expect(turn.toolTrace).toEqual([
      { name: 'fijar_entrega', ok: true },
      { name: 'cotizar_domicilio', ok: true },
    ]);
    expect(data(turn.calls[0])).toMatchObject({ barrio: 'Cabecera', pendiente: [] });
    expect(data(turn.calls[1])).toEqual({
      status: 'OK',
      modalidad: 'delivery',
      zona: 'Cabecera',
      tarifa: 4000,
      etaMinutos: 45,
      subtotal: 32000,
      total: 36000,
    });
    expect(h.draft()).toMatchObject({
      address: 'cra 27 #45-12 cabecera',
      neighborhood: 'Cabecera',
      reference: 'timbre 2',
      quote: { zoneId: 'cabecera', fee: 4000 },
    });
  });

  it('AC-32: datos en desorden en 3 turnos → lo ya dado no vuelve a quedar pendiente', async () => {
    const { h, calls, say } = conversation();
    const t1 = await say('es en provenza', [
      { toolCalls: [{ name: 'fijar_entrega', arguments: { barrio: 'Provenza' } }] },
      { text: '¿Me pasas la dirección?' },
    ]);
    expect(data(t1.calls[0]).pendiente).toEqual(['direccion']);

    const t2 = await say('dejalo en la portería', [
      { toolCalls: [{ name: 'fijar_entrega', arguments: { referencia: 'portería' } }] },
      { text: '¿Y la dirección?' },
    ]);
    expect(data(t2.calls[0])).toMatchObject({ barrio: 'Provenza', pendiente: ['direccion'] });

    const t3 = await say('calle 10 #5-20', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { direccion: 'calle 10 #5-20' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Listo.' },
    ]);
    expect(data(t3.calls[0])).toMatchObject({ pendiente: [] });
    expect(data(t3.calls[1])).toMatchObject({ status: 'OK', zona: 'Provenza', total: 37000 });

    // La traza: el barrio se dio una sola vez y nunca volvió a estar pendiente
    const pendings = calls
      .filter((c) => c.name === 'fijar_entrega')
      .map((c) => data(c).pendiente as string[]);
    expect(pendings.every((p) => !p.includes('barrio'))).toBe(true);
    expect(calls.filter((c) => c.args.barrio !== undefined)).toHaveLength(1);
    expect(h.draft()).toMatchObject({
      address: 'calle 10 #5-20',
      neighborhood: 'Provenza',
      reference: 'portería',
      quote: { zoneId: 'provenza' },
    });
  });

  it('corrección "no, es en Provenza" → reemplaza barrio, recotiza y conserva la dirección', async () => {
    const { h, say } = conversation();
    const t1 = await say('cra 27 #45-12, Cabecera', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { direccion: 'cra 27 #45-12, Cabecera' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Domicilio a Cabecera.' },
    ]);
    expect(data(t1.calls[1])).toMatchObject({ zona: 'Cabecera', tarifa: 4000 });

    const t2 = await say('no, es en Provenza', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { barrio: 'Provenza' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Corregido.' },
    ]);
    expect(data(t2.calls[0])).toMatchObject({
      direccion: 'cra 27 #45-12, Cabecera',
      barrio: 'Provenza',
      pendiente: [],
    });
    expect(data(t2.calls[1])).toMatchObject({ zona: 'Provenza', tarifa: 5000, total: 37000 });
    expect(h.draft()?.quote).toMatchObject({ zoneId: 'provenza', fee: 5000 });
  });

  it('AC-11: sin barrio → NEEDS_NEIGHBORHOOD y el barrio queda pendiente', async () => {
    const { say } = conversation();
    const turn = await say('calle 10 #5-20', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { direccion: 'calle 10 #5-20' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: '¿En qué barrio?' },
    ]);
    expect(data(turn.calls[0]).pendiente).toEqual(['barrio']);
    expect(data(turn.calls[1])).toEqual({ status: 'NEEDS_NEIGHBORHOOD' });
  });

  it('AC-11: fuera de cobertura → OUT_OF_COVERAGE con pickup; el cliente pasa a recoger', async () => {
    const { h, say } = conversation();
    const t1 = await say('calle 10 #5-20, San Francisco', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { direccion: 'calle 10 #5-20, San Francisco' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'No llegamos allá, ¿pasas a recoger?' },
    ]);
    expect(data(t1.calls[1])).toMatchObject({
      status: 'OUT_OF_COVERAGE',
      barrio: 'San Francisco',
      pickupDisponible: true,
    });
    expect(h.draft()).not.toHaveProperty('quote');

    const t2 = await say('listo, paso yo', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { modalidad: 'pickup' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Te esperamos.' },
    ]);
    expect(data(t2.calls[1])).toMatchObject({ status: 'OK', modalidad: 'pickup', tarifa: 0 });
  });

  it('AC-12: subtotal bajo el mínimo → BELOW_MINIMUM con faltante y sin cotización guardada', async () => {
    const { h, say } = conversation({ lines: [{ price: 12000, quantity: 2 }] });
    const turn = await say('a Cañaveral', [
      {
        toolCalls: [
          { name: 'fijar_entrega', arguments: { barrio: 'Cañaveral' } },
          { name: 'cotizar_domicilio', arguments: {} },
        ],
      },
      { text: 'Te faltan para el mínimo.' },
    ]);
    expect(data(turn.calls[1])).toEqual({
      status: 'BELOW_MINIMUM',
      subtotal: 24000,
      minimo: 30000,
      faltante: 6000,
    });
    // No avanza al pago: sin quote en el draft no hay resumen ni confirmación (S3.3)
    expect(h.draft()).not.toHaveProperty('quote');
  });
});
