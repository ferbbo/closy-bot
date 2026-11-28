import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { PlaybookService } from '../../../../services/playbook.service';
import { DeliveryConfigService } from '../../config/delivery-config.service';
import { fxTurnContext } from '../../catalog/testing/catalog.fixtures';
import { BusinessInfo } from '../../contracts';
import { BusinessInfoTool } from './business-info.tool';

const NEQUI =
  'Nequi 300 000 0001 a nombre de Burger Barrio SAS. Envía el comprobante por este chat.';
const deliveryConfig = {
  openingHours: [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, open: '11:00', close: '22:00' })),
  prepTimeMinutes: 25,
  zones: [
    { id: 'cabecera', name: 'Cabecera', aliases: [], fee: 4000, minOrder: 15000, etaMinutes: 20 },
  ],
  pickupEnabled: true,
  privacyPolicyUrl: 'https://burger.example/privacidad',
};
const fullMerchant = {
  id: 'm1',
  name: 'Burger Barrio',
  industry: 'restaurante',
  playbookConfig: {
    faqs: [{ question: '¿Tienen parqueadero?', keywords: ['parqueadero'], answer: 'Sí, al frente.' }],
  },
  merchantConfig: {
    paymentMethods: [
      { type: 'cod', label: 'Efectivo contra entrega' },
      { type: 'transfer', label: 'Transferencia Nequi', instructions: NEQUI },
      {
        type: 'transfer',
        label: 'Bancolombia',
        bankInfo: { bankName: 'Bancolombia', accountType: 'ahorros', accountNumber: '123-456789-01', accountHolder: 'Burger Barrio SAS' },
      },
    ],
    shippingConfig: { shippingPolicy: 'Domicilios en Cabecera, Provenza y Cañaveral.' },
    returnPolicy: null,
    deliveryConfig,
  },
}; // prettier-ignore

function makeTool(row: unknown) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const prisma = { merchant: { findUnique } } as unknown as PrismaService;
  const tool = new BusinessInfoTool(
    prisma,
    new PlaybookService(),
    new DeliveryConfigService(prisma),
  );
  return { tool, handler: tool.handlers().consultar_negocio, findUnique };
}

// 2026-11-28 es sábado; 18:00Z = 13:00 en Bogotá (abierto) · 04:00Z = 23:00 del viernes (cerrado)
const OPEN_NOW = new Date('2026-11-28T18:00:00Z');
const CLOSED_NOW = new Date('2026-11-28T04:00:00Z');

describe('BusinessInfoTool (consultar_negocio)', () => {
  it('define consultar_negocio con tema enum', () => {
    const { tool } = makeTool(null);
    expect(tool.definitions[0].name).toBe('consultar_negocio');
    expect(tool.definitions[0].parameters).toMatchObject({
      properties: { tema: { enum: ['faq', 'politicas', 'horario', 'zonas', 'pagos', 'todo'] } },
    });
  });

  it('AC-42: devuelve FAQ, políticas, horario, zonas y pagos leídos de la BD (pagos literales)', async () => {
    const { handler, findUnique } = makeTool(fullMerchant);
    const r = await handler({}, fxTurnContext({ now: OPEN_NOW }));
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'm1' } }));
    expect(r.ok).toBe(true);
    const info = r.data as BusinessInfo;
    expect(info).toEqual({
      merchantName: 'Burger Barrio',
      faqs: [{ question: '¿Tienen parqueadero?', answer: 'Sí, al frente.' }],
      policies: {
        returns: null,
        delivery: 'Domicilios en Cabecera, Provenza y Cañaveral.',
        privacyUrl: 'https://burger.example/privacidad',
      },
      hours: { openNow: true, nextOpening: null, windows: deliveryConfig.openingHours },
      zones: [{ name: 'Cabecera', fee: 4000, minOrder: 15000, etaMinutes: 20 }],
      payments: [
        { type: 'cod', label: 'Efectivo contra entrega', instructions: null },
        { type: 'transfer', label: 'Transferencia Nequi', instructions: NEQUI },
        {
          type: 'transfer',
          label: 'Bancolombia',
          instructions: 'Bancolombia · ahorros · 123-456789-01 · Burger Barrio SAS',
        },
      ],
      pickupEnabled: true,
    });
  });

  it('horario: cerrado usa ctx.now y devuelve la próxima apertura', async () => {
    const { handler } = makeTool(fullMerchant);
    const r = await handler({ tema: 'horario' }, fxTurnContext({ now: CLOSED_NOW }));
    expect(r.data).toEqual({
      merchantName: 'Burger Barrio',
      hours: {
        openNow: false,
        nextOpening: { day: 6, time: '11:00' },
        windows: deliveryConfig.openingHours,
      },
    });
  });

  it('tema filtra las claves devueltas', async () => {
    const { handler } = makeTool(fullMerchant);
    const zonas = await handler({ tema: 'zonas' }, fxTurnContext());
    expect(Object.keys(zonas.data as object).sort()).toEqual([
      'merchantName',
      'pickupEnabled',
      'zones',
    ]);
    const pagos = await handler({ tema: 'pagos' }, fxTurnContext());
    expect((pagos.data as BusinessInfo).payments?.[1].instructions).toBe(NEQUI);
  });

  it('AC-39 base: sin datos en la BD todo va como null explícito (sin defaults ni FAQ genéricas)', async () => {
    const { handler } = makeTool({
      id: 'm1',
      name: 'Nuevo',
      industry: 'restaurante',
      playbookConfig: null,
      merchantConfig: null,
    });
    const r = await handler({ tema: 'todo' }, fxTurnContext());
    expect(r).toEqual({
      ok: true,
      data: {
        merchantName: 'Nuevo',
        faqs: null,
        policies: { returns: null, delivery: null, privacyUrl: null },
        hours: null,
        zones: null,
        payments: null,
        pickupEnabled: null,
      },
    });
  });

  it('deliveryConfig sin horario ni zonas → hours/zones null; FAQ vacías → null', async () => {
    const { handler } = makeTool({
      ...fullMerchant,
      playbookConfig: { faqs: [] },
      merchantConfig: { ...fullMerchant.merchantConfig, paymentMethods: [], deliveryConfig: {} },
    });
    const info = (await handler({}, fxTurnContext())).data as BusinessInfo;
    expect(info.hours).toBeNull();
    expect(info.zones).toBeNull();
    expect(info.faqs).toBeNull();
    expect(info.payments).toBeNull();
    expect(info.pickupEnabled).toBe(false);
  });

  it('cambios en la BD se reflejan en la siguiente llamada (sin caché)', async () => {
    const { handler, findUnique } = makeTool(fullMerchant);
    await handler({ tema: 'horario' }, fxTurnContext({ now: OPEN_NOW }));
    findUnique.mockResolvedValueOnce({
      ...fullMerchant,
      merchantConfig: {
        ...fullMerchant.merchantConfig,
        deliveryConfig: { ...deliveryConfig, temporarilyClosed: true },
      },
    });
    const r = await handler({ tema: 'horario' }, fxTurnContext({ now: OPEN_NOW }));
    expect((r.data as BusinessInfo).hours).toMatchObject({ openNow: false, nextOpening: null });
  });

  it('errores → ok:false sin lanzar', async () => {
    const { handler, findUnique } = makeTool(null);
    expect(await handler({ tema: 'clima' }, fxTurnContext())).toEqual({
      ok: false,
      error: 'TEMA_INVALIDO',
    });
    expect(await handler({}, fxTurnContext())).toEqual({
      ok: false,
      error: 'COMERCIO_NO_ENCONTRADO',
    });
    findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await handler({}, fxTurnContext())).toEqual({ ok: false, error: 'ERROR_NEGOCIO' });
  });
});
