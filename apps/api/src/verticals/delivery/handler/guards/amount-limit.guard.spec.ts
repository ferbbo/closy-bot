import type { ModuleRef } from '@nestjs/core';
import type { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { HandoffService } from '../../../../services/handoff.service';
import { buildRestauranteDefaults } from '../../config/restaurante.defaults';
import type { DeliveryTurnContext } from '../../contracts';
import {
  AMOUNT_LIMIT_HANDOFF_FAILED_MESSAGE,
  AMOUNT_LIMIT_HANDOFF_MESSAGE,
  AmountLimitGuard,
} from './amount-limit.guard';

describe('AmountLimitGuard (RN-17)', () => {
  const cfg = { ...buildRestauranteDefaults(), maxOrderAmountWithoutHuman: 300000 };
  const ctx: DeliveryTurnContext = {
    merchantId: 'm1',
    customerId: 'c1',
    conversationId: 'conv1',
    customerPhone: '+570000000000',
    text: 'x',
    config: cfg,
    now: new Date(),
    seenVariantIds: new Set(),
  };
  const merchant = { id: 'm1', name: 'Burger', industry: 'restaurante', playbookConfig: null };
  let createHandoff: jest.Mock;
  let findUnique: jest.Mock;
  let moduleRef: { get: jest.Mock };
  let guard: AmountLimitGuard;

  beforeEach(() => {
    createHandoff = jest.fn().mockResolvedValue({ id: 'h1' });
    findUnique = jest.fn().mockResolvedValue(merchant);
    moduleRef = { get: jest.fn().mockReturnValue({ createHandoff }) };
    guard = new AmountLimitGuard(
      { merchant: { findUnique } } as unknown as PrismaService,
      moduleRef as unknown as ModuleRef,
    );
  });

  it.each([
    [299999, false],
    [300000, false],
    [300001, true],
  ])('exceeds(%d) con límite 300.000 → %s', (total, expected) => {
    expect(guard.exceeds(total, cfg)).toBe(expected);
  });

  it('AC-24: escalate abre handoff auto_escalation y devuelve el aviso fijo sin cifras', async () => {
    const res = await guard.escalate(ctx, 'cart-1');
    expect(moduleRef.get).toHaveBeenCalledWith(HandoffService, { strict: false });
    expect(createHandoff).toHaveBeenCalledWith(
      {
        conversationId: 'conv1',
        customerId: 'c1',
        merchantId: 'm1',
        merchant: { id: 'm1', name: 'Burger', industry: 'restaurante', playbookConfig: null },
        activeCartId: 'cart-1',
      },
      'auto_escalation',
    );
    expect(res).toEqual({ handoffOpened: true, response: AMOUNT_LIMIT_HANDOFF_MESSAGE });
    expect(res.response).not.toMatch(/\d/);
  });

  it('idempotente: llamadas repetidas delegan en HandoffService (que reutiliza el abierto)', async () => {
    await guard.escalate(ctx);
    await guard.escalate(ctx);
    expect(createHandoff).toHaveBeenCalledTimes(2);
    expect(createHandoff.mock.calls[0][0]).not.toHaveProperty('activeCartId');
  });

  it('nunca lanza: si el handoff falla devuelve el aviso de fallo', async () => {
    createHandoff.mockRejectedValue(new Error('db down'));
    await expect(guard.escalate(ctx)).resolves.toEqual({
      handoffOpened: false,
      response: AMOUNT_LIMIT_HANDOFF_FAILED_MESSAGE,
    });
    findUnique.mockResolvedValue(null);
    expect((await guard.escalate(ctx)).handoffOpened).toBe(false);
  });
});
