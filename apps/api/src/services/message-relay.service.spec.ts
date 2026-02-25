/**
 * MessageRelayService Unit Tests
 * PR-05.2 REQ-04
 * AC-03: MessageRelayService implements all relay methods
 * AC-11: Unit tests pass (parser + relay service)
 */
import { MessageRelayService } from './message-relay.service';
import { MessageDirection } from '@prisma/client';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------
const mockPrisma = {
  merchant: {
    findUnique: jest.fn(),
  },
  order: {
    findFirst: jest.fn(),
  },
};

const mockOrderRepository = {
  findByOrderCode: jest.fn(),
};

const mockOutboxRepository = {
  create: jest.fn(),
};

const mockConversationRepository = {
  findByCustomerAndChannel: jest.fn(),
  findActiveHandoffByMerchant: jest.fn(),
  updateHandoffActive: jest.fn(),
};

const mockMessageLogRepository = {
  create: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildService() {
  return new MessageRelayService(
    mockPrisma as never,
    mockOrderRepository as never,
    mockOutboxRepository as never,
    mockConversationRepository as never,
    mockMessageLogRepository as never,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MessageRelayService (PR-05.2)', () => {
  let service: MessageRelayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ---------------------------------------------------------------------------
  // AC-08: formatMessageForCustomer
  // ---------------------------------------------------------------------------
  describe('AC-08: formatMessageForCustomer()', () => {
    it('should return "Mensaje de {name}: {text}"', () => {
      expect(service.formatMessageForCustomer('Tienda Maria', 'Tu pedido sale mañana')).toBe(
        'Mensaje de Tienda Maria: Tu pedido sale mañana',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-09: formatMessageForMerchant
  // ---------------------------------------------------------------------------
  describe('AC-09: formatMessageForMerchant()', () => {
    it('should return "Cliente {orderCode} dice: {text}"', () => {
      expect(service.formatMessageForMerchant('ORD-001', 'Hola, ¿a qué hora llega?')).toBe(
        'Cliente ORD-001 dice: Hola, ¿a qué hora llega?',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // AC-04: sendMessageToCustomer
  // ---------------------------------------------------------------------------
  describe('AC-04: sendMessageToCustomer()', () => {
    it('should return error when order not found', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue(null);

      const result = await service.sendMessageToCustomer('merchant-1', 'ORD-999', 'hola');
      expect(result).toContain('❌');
      expect(result).toContain('ORD-999');
    });

    it('should enqueue OutboxMessage and return success', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        customerPhone: '+573001234567',
      });
      mockPrisma.merchant.findUnique.mockResolvedValue({
        name: 'La Tienda',
        whatsappNumber: '+5730099900001',
      });
      mockConversationRepository.findByCustomerAndChannel.mockResolvedValue({
        id: 'conv-1',
      });
      mockOutboxRepository.create.mockResolvedValue({});
      mockMessageLogRepository.create.mockResolvedValue({});

      const result = await service.sendMessageToCustomer(
        'merchant-1',
        'ORD-001',
        'Tu pedido sale mañana',
      );

      expect(mockOutboxRepository.create).toHaveBeenCalledTimes(1);
      const outboxArg = mockOutboxRepository.create.mock.calls[0][0];
      expect(outboxArg.payloadJson.text).toContain('La Tienda');
      expect(outboxArg.payloadJson.text).toContain('Tu pedido sale mañana');
      expect(result).toContain('✅');
    });

    it('should return error if merchant tries to message itself', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        customerPhone: '+5730099900001', // Same as merchant
      });
      mockPrisma.merchant.findUnique.mockResolvedValue({
        name: 'La Tienda',
        whatsappNumber: '+5730099900001',
      });

      const result = await service.sendMessageToCustomer('merchant-1', 'ORD-001', 'hola');
      expect(result).toContain('❌');
      expect(result).toContain('ti mismo');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05: activateHandoff
  // ---------------------------------------------------------------------------
  describe('AC-05: activateHandoff()', () => {
    it('should return error when order not found', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue(null);

      const result = await service.activateHandoff('merchant-1', 'ORD-999');
      expect(result).toContain('❌');
    });

    it('should update handoffActive = true and return confirmation', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
      });
      mockConversationRepository.findByCustomerAndChannel.mockResolvedValue({
        id: 'conv-1',
      });
      mockConversationRepository.updateHandoffActive.mockResolvedValue({
        id: 'conv-1',
        handoffActive: true,
      });

      const result = await service.activateHandoff('merchant-1', 'ORD-001');

      expect(mockConversationRepository.updateHandoffActive).toHaveBeenCalledWith('conv-1', true);
      expect(result).toContain('✅');
      expect(result).toContain('ORD-001');
    });

    it('should be idempotent: calling activateHandoff twice does not cause errors', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
      });
      mockConversationRepository.findByCustomerAndChannel.mockResolvedValue({ id: 'conv-1' });
      mockConversationRepository.updateHandoffActive.mockResolvedValue({
        id: 'conv-1',
        handoffActive: true,
      });

      await service.activateHandoff('merchant-1', 'ORD-001');
      const result2 = await service.activateHandoff('merchant-1', 'ORD-001');

      expect(result2).toContain('✅');
      expect(mockConversationRepository.updateHandoffActive).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-06: deactivateHandoff
  // ---------------------------------------------------------------------------
  describe('AC-06: deactivateHandoff()', () => {
    it('should return info message when no active handoff', async () => {
      mockConversationRepository.findActiveHandoffByMerchant.mockResolvedValue(null);

      const result = await service.deactivateHandoff('merchant-1');
      expect(result).toContain('ℹ️');
      expect(result).toContain('No hay handoff activo');
    });

    it('should update handoffActive = false and return confirmation', async () => {
      mockConversationRepository.findActiveHandoffByMerchant.mockResolvedValue({ id: 'conv-1' });
      mockConversationRepository.updateHandoffActive.mockResolvedValue({
        id: 'conv-1',
        handoffActive: false,
      });

      const result = await service.deactivateHandoff('merchant-1');

      expect(mockConversationRepository.updateHandoffActive).toHaveBeenCalledWith('conv-1', false);
      expect(result).toContain('✅');
      expect(result).toContain('cerrado');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-07, AC-09: sendMessageToMerchant
  // ---------------------------------------------------------------------------
  describe('sendMessageToMerchant()', () => {
    it('should enqueue OutboxMessage to merchant with formatted text', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ whatsappNumber: '+5730099900001' });
      mockOutboxRepository.create.mockResolvedValue({});
      mockMessageLogRepository.create.mockResolvedValue({});

      await service.sendMessageToMerchant(
        'merchant-1',
        'ORD-001',
        'Hola, ¿cuándo llega?',
        'conv-1',
      );

      expect(mockOutboxRepository.create).toHaveBeenCalledTimes(1);
      const outboxArg = mockOutboxRepository.create.mock.calls[0][0];
      expect(outboxArg.to).toBe('+5730099900001');
      expect(outboxArg.payloadJson.text).toContain('ORD-001');
      expect(outboxArg.payloadJson.text).toContain('Hola, ¿cuándo llega?');
    });

    it('should not enqueue if merchant has no whatsappNumber', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ whatsappNumber: null });

      await service.sendMessageToMerchant('merchant-1', 'ORD-001', 'Hola', 'conv-1');

      expect(mockOutboxRepository.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-10: MessageLog source = 'relay'
  // ---------------------------------------------------------------------------
  describe('AC-10: relay messages logged with source = "relay"', () => {
    it('should create MessageLog with source = "relay" when sending to customer', async () => {
      mockOrderRepository.findByOrderCode.mockResolvedValue({
        id: 'order-1',
        customerId: 'cust-1',
        customerPhone: '+573001234567',
      });
      mockPrisma.merchant.findUnique.mockResolvedValue({
        name: 'La Tienda',
        whatsappNumber: '+5730099900001',
      });
      mockConversationRepository.findByCustomerAndChannel.mockResolvedValue({ id: 'conv-1' });
      mockOutboxRepository.create.mockResolvedValue({});
      mockMessageLogRepository.create.mockResolvedValue({});

      await service.sendMessageToCustomer('merchant-1', 'ORD-001', 'hola');

      expect(mockMessageLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'relay', direction: MessageDirection.OUT }),
      );
    });

    it('should create MessageLog with source = "relay" when relaying to merchant', async () => {
      mockPrisma.merchant.findUnique.mockResolvedValue({ whatsappNumber: '+5730099900001' });
      mockOutboxRepository.create.mockResolvedValue({});
      mockMessageLogRepository.create.mockResolvedValue({});

      await service.sendMessageToMerchant('merchant-1', 'ORD-001', 'texto', 'conv-1');

      expect(mockMessageLogRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'relay', direction: MessageDirection.IN }),
      );
    });
  });
});
