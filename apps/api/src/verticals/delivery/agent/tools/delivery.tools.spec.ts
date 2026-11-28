import { buildDeliveryToolsHarness } from '../../checkout/testing/delivery-tools.harness';

describe('DeliveryTools (S3.1-T2)', () => {
  it('expone fijar_entrega y cotizar_domicilio con handlers', () => {
    const { tools, handlers } = buildDeliveryToolsHarness();
    expect(tools.definitions.map((d) => d.name)).toEqual(['fijar_entrega', 'cotizar_domicilio']);
    expect(Object.keys(handlers)).toEqual(['fijar_entrega', 'cotizar_domicilio']);
  });

  describe('fijar_entrega', () => {
    it('persiste en el CheckoutDraft sin pisar el resto de metadata', async () => {
      const h = buildDeliveryToolsHarness({
        metadata: { expecting: { a: 1 }, delivery: { privacyNoticeAt: 'x' } },
      });
      const res = await h.handlers.fijar_entrega(
        { direccion: 'Cra 27 #45-12', barrio: 'Cabecera', referencia: 'portón negro' },
        h.ctx,
      );
      expect(res).toEqual({
        ok: true,
        data: {
          modalidad: 'delivery',
          direccion: 'Cra 27 #45-12',
          barrio: 'Cabecera',
          referencia: 'portón negro',
          pendiente: [],
        },
      });
      expect(h.state.metadata).toEqual({
        expecting: { a: 1 },
        delivery: {
          privacyNoticeAt: 'x',
          checkout: {
            cartId: 'cart-1',
            fulfillment: 'delivery',
            address: 'Cra 27 #45-12',
            neighborhood: 'Cabecera',
            reference: 'portón negro',
          },
        },
      });
    });

    it('merge: lo dado en llamadas distintas se conserva y reporta lo pendiente', async () => {
      const h = buildDeliveryToolsHarness();
      const first = await h.handlers.fijar_entrega({ referencia: 'casa azul' }, h.ctx);
      expect(first.data).toMatchObject({ pendiente: ['direccion', 'barrio'] });
      const second = await h.handlers.fijar_entrega({ barrio: 'Provenza' }, h.ctx);
      expect(second.data).toMatchObject({ referencia: 'casa azul', pendiente: ['direccion'] });
      const third = await h.handlers.fijar_entrega({ direccion: 'Calle 10 #5-20' }, h.ctx);
      expect(third.data).toMatchObject({
        direccion: 'Calle 10 #5-20',
        barrio: 'Provenza',
        referencia: 'casa azul',
        pendiente: [],
      });
    });

    it('el barrio se extrae de la dirección cuando no viene explícito', async () => {
      const h = buildDeliveryToolsHarness();
      const res = await h.handlers.fijar_entrega({ direccion: 'Cra 27 #45-12, Cabecera' }, h.ctx);
      expect(res.data).toMatchObject({ barrio: 'Cabecera', pendiente: [] });
    });

    it('corrección de barrio: reemplaza el barrio y borra la cotización previa', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ direccion: 'Cra 27 #45-12, Cabecera' }, h.ctx);
      await h.handlers.cotizar_domicilio({}, h.ctx);
      expect(h.draft()?.quote).toMatchObject({ zoneId: 'cabecera' });
      await h.handlers.fijar_entrega({ barrio: 'Provenza' }, h.ctx);
      expect(h.draft()).toMatchObject({ neighborhood: 'Provenza' });
      expect(h.draft()).not.toHaveProperty('quote');
    });

    it('cambiar solo la referencia no invalida la cotización', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ barrio: 'Cabecera' }, h.ctx);
      await h.handlers.cotizar_domicilio({}, h.ctx);
      await h.handlers.fijar_entrega({ referencia: 'tienda de la esquina' }, h.ctx);
      expect(h.draft()?.quote).toMatchObject({ zoneId: 'cabecera' });
    });

    it('pickup habilitado → modalidad pickup sin pendientes', async () => {
      const h = buildDeliveryToolsHarness();
      const res = await h.handlers.fijar_entrega({ modalidad: 'pickup' }, h.ctx);
      expect(res.data).toMatchObject({ modalidad: 'pickup', pendiente: [] });
    });

    it('pickup deshabilitado en la BD → PICKUP_DISABLED sin escribir', async () => {
      const h = buildDeliveryToolsHarness();
      h.state.deliveryConfig = { ...h.state.deliveryConfig, pickupEnabled: false };
      const res = await h.handlers.fijar_entrega({ modalidad: 'pickup' }, h.ctx);
      expect(res).toEqual({ ok: false, error: 'PICKUP_DISABLED' });
      expect(h.prisma.conversation.update).not.toHaveBeenCalled();
    });

    it.each([[{}], [{ modalidad: 'moto' }], [{ direccion: '   ' }]])(
      'argumentos inválidos %j → INVALID_ARGS',
      async (args) => {
        const h = buildDeliveryToolsHarness();
        await expect(h.handlers.fijar_entrega(args, h.ctx)).resolves.toEqual({
          ok: false,
          error: 'INVALID_ARGS',
        });
      },
    );

    it('nunca lanza: error de BD → DELIVERY_ERROR', async () => {
      const h = buildDeliveryToolsHarness();
      h.prisma.merchantConfig.findUnique.mockRejectedValueOnce(new Error('db down'));
      await expect(h.handlers.fijar_entrega({ barrio: 'Cabecera' }, h.ctx)).resolves.toEqual({
        ok: false,
        error: 'DELIVERY_ERROR',
      });
    });
  });

  describe('cotizar_domicilio', () => {
    it('AC-11: zona en cobertura → tarifa, ETA, subtotal y total de la BD; guarda la quote', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ direccion: 'Cra 27 #45-12', barrio: 'Cabecera' }, h.ctx);
      const res = await h.handlers.cotizar_domicilio({}, h.ctx);
      expect(res).toEqual({
        ok: true,
        data: {
          status: 'OK',
          modalidad: 'delivery',
          zona: 'Cabecera',
          tarifa: 4000,
          etaMinutos: 45,
          subtotal: 32000,
          total: 36000,
        },
      });
      expect(h.draft()?.quote).toEqual({
        ok: true,
        zoneId: 'cabecera',
        zoneName: 'Cabecera',
        fee: 4000,
        etaMinutes: 45,
        fulfillment: 'delivery',
      });
    });

    it('RN-00: lee config y carrito en cada llamada (un cambio en la BD se refleja)', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ barrio: 'Cabecera' }, h.ctx);
      h.state.deliveryConfig = {
        ...h.state.deliveryConfig,
        zones: h.state.deliveryConfig.zones.map((z) => ({ ...z, fee: z.fee + 1000 })),
      };
      h.state.lines = [{ price: 20000, quantity: 1 }];
      const res = await h.handlers.cotizar_domicilio({}, h.ctx);
      expect(res.data).toMatchObject({ tarifa: 5000, subtotal: 20000, total: 25000 });
    });

    it('sin barrio → status NEEDS_NEIGHBORHOOD como dato', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ direccion: 'Calle 10 #5-20' }, h.ctx);
      await expect(h.handlers.cotizar_domicilio({}, h.ctx)).resolves.toEqual({
        ok: true,
        data: { status: 'NEEDS_NEIGHBORHOOD' },
      });
    });

    it('AC-11: barrio fuera de cobertura → OUT_OF_COVERAGE con pickupDisponible y zonas', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ barrio: 'San Francisco' }, h.ctx);
      await expect(h.handlers.cotizar_domicilio({}, h.ctx)).resolves.toEqual({
        ok: true,
        data: {
          status: 'OUT_OF_COVERAGE',
          barrio: 'San Francisco',
          pickupDisponible: true,
          zonas: ['Cabecera', 'Provenza', 'Cañaveral'],
        },
      });
      expect(h.draft()).not.toHaveProperty('quote');
    });

    it('AC-12: bajo el mínimo de la zona → BELOW_MINIMUM con minimo y faltante', async () => {
      const h = buildDeliveryToolsHarness({ lines: [{ price: 12000, quantity: 2 }] });
      await h.handlers.fijar_entrega({ barrio: 'Cañaveral' }, h.ctx);
      await expect(h.handlers.cotizar_domicilio({}, h.ctx)).resolves.toEqual({
        ok: true,
        data: { status: 'BELOW_MINIMUM', subtotal: 24000, minimo: 30000, faltante: 6000 },
      });
    });

    it('pickup → tarifa 0 y total = subtotal', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ modalidad: 'pickup' }, h.ctx);
      const res = await h.handlers.cotizar_domicilio({}, h.ctx);
      expect(res.data).toMatchObject({
        status: 'OK',
        modalidad: 'pickup',
        tarifa: 0,
        total: 32000,
      });
    });

    it('pickup guardado pero deshabilitado después en la BD → PICKUP_DISABLED', async () => {
      const h = buildDeliveryToolsHarness();
      await h.handlers.fijar_entrega({ modalidad: 'pickup' }, h.ctx);
      h.state.deliveryConfig = { ...h.state.deliveryConfig, pickupEnabled: false };
      await expect(h.handlers.cotizar_domicilio({}, h.ctx)).resolves.toEqual({
        ok: false,
        error: 'PICKUP_DISABLED',
      });
    });

    it('carrito vacío → CART_EMPTY', async () => {
      const h = buildDeliveryToolsHarness({ lines: [] });
      await expect(h.handlers.cotizar_domicilio({}, h.ctx)).resolves.toEqual({
        ok: false,
        error: 'CART_EMPTY',
      });
    });
  });
});
