import type { KitchenTicket, PosContext, PosIntegrationConfig } from '../../contracts';

/** Fixtures compartidas por los specs del puerto POS (sin PII real). */
export const CONTRACT_SECRET_REF = 'POS_CONTRACT_TEST_SECRET';
export const CONTRACT_SECRET_VALUE = 'sk_live_contract_secret_value_9f3a';

export function makeTicket(
  orderId = 'order-1',
  overrides: Partial<KitchenTicket> = {},
): KitchenTicket {
  return {
    orderId,
    orderCode: 'ORD-0042',
    createdAt: new Date('2026-11-28T18:00:00Z'),
    lines: [{ quantity: 2, label: 'Hamburguesa sencilla', notes: 'sin cebolla' }],
    fulfillment: 'delivery',
    address: 'Cra 1 # 2-3',
    neighborhood: 'Cabecera',
    paymentMethod: 'efectivo',
    cashChangeFor: 50000,
    total: 28000,
    etaMinutes: 40,
    customerName: 'Cliente',
    customerPhoneMasked: '+57*******123',
    ...overrides,
  };
}

export function makePosConfig(overrides: Partial<PosIntegrationConfig> = {}): PosIntegrationConfig {
  return {
    provider: 'fake',
    enabled: true,
    settings: { storeId: 's-1' },
    secretRef: CONTRACT_SECRET_REF,
    ...overrides,
  };
}

export function makePosContext(
  config: PosIntegrationConfig = makePosConfig(),
  merchantId = 'm-1',
): PosContext {
  return { merchantId, config, resolveSecret: () => CONTRACT_SECRET_VALUE };
}
