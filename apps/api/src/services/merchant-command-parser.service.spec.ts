/**
 * MerchantCommandParserService Unit Tests
 * PR-05.1 REQ-05, REQ-06
 * AC-04: Parser normalizes commands (case-insensitive, no tildes)
 * AC-05: Returns null for unknown commands
 */
import { MerchantCommandParserService } from './merchant-command-parser.service';

describe('MerchantCommandParserService', () => {
  let parser: MerchantCommandParserService;

  beforeEach(() => {
    parser = new MerchantCommandParserService();
  });

  // ---------------------------------------------------------------------------
  // AC-04: Normalization
  // ---------------------------------------------------------------------------
  describe('AC-04: normalize()', () => {
    it('should convert to lowercase', () => {
      expect(parser.normalize('CONFIRMAR')).toBe('confirmar');
    });

    it('should strip diacritics (tildes)', () => {
      expect(parser.normalize('Confirmár')).toBe('confirmar');
      expect(parser.normalize('Rechazár')).toBe('rechazar');
      expect(parser.normalize('envíado')).toBe('enviado');
    });

    it('should collapse extra whitespace', () => {
      expect(parser.normalize('confirmar  ORD-001')).toBe('confirmar ord-001');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(parser.normalize('  hoy  ')).toBe('hoy');
    });
  });

  // ---------------------------------------------------------------------------
  // AC-04: Command parsing with normalization
  // ---------------------------------------------------------------------------
  describe('AC-04: parse() — normalization in action', () => {
    it('should parse "Confirmar ORD-001" (mixed case) same as "confirmar ORD-001"', () => {
      const result1 = parser.parse('confirmar ORD-001');
      const result2 = parser.parse('Confirmar ORD-001');
      expect(result1).toEqual(result2);
    });

    it('should parse "CONFIRMAR ORD-001" (all caps)', () => {
      const result = parser.parse('CONFIRMAR ORD-001');
      expect(result).toEqual({ command: 'confirmar', args: { orderCode: 'ORD-001' } });
    });

    it('should parse "Pausar Bot" (mixed case, multi-word)', () => {
      const result = parser.parse('Pausar Bot');
      expect(result).toEqual({ command: 'pausar_bot', args: {} });
    });

    it('should parse command with diacritics stripped: "Confirmár ORD-001"', () => {
      const result = parser.parse('Confirmár ORD-001');
      expect(result).toEqual({ command: 'confirmar', args: { orderCode: 'ORD-001' } });
    });
  });

  // ---------------------------------------------------------------------------
  // AC-04: Individual command parsing
  // ---------------------------------------------------------------------------
  describe('parse() — confirmar', () => {
    it('should parse "confirmar ORD-001"', () => {
      expect(parser.parse('confirmar ORD-001')).toEqual({
        command: 'confirmar',
        args: { orderCode: 'ORD-001' },
      });
    });

    it('should uppercase the orderCode', () => {
      const result = parser.parse('confirmar ord-001');
      expect(result?.args['orderCode']).toBe('ORD-001');
    });

    it('should return null for "confirmar" without orderCode', () => {
      expect(parser.parse('confirmar')).toBeNull();
    });
  });

  describe('parse() — rechazar', () => {
    it('should parse "rechazar ORD-002" without reason', () => {
      expect(parser.parse('rechazar ORD-002')).toEqual({
        command: 'rechazar',
        args: { orderCode: 'ORD-002' },
      });
    });

    it('should parse "rechazar ORD-002 no hay stock" with reason', () => {
      expect(parser.parse('rechazar ORD-002 no hay stock')).toEqual({
        command: 'rechazar',
        args: { orderCode: 'ORD-002', reason: 'no hay stock' },
      });
    });

    it('should return null for "rechazar" without orderCode', () => {
      expect(parser.parse('rechazar')).toBeNull();
    });
  });

  describe('parse() — pagado', () => {
    it('should parse "pagado ORD-003"', () => {
      expect(parser.parse('pagado ORD-003')).toEqual({
        command: 'pagado',
        args: { orderCode: 'ORD-003' },
      });
    });
  });

  describe('parse() — enviado', () => {
    it('should parse "enviado ORD-004"', () => {
      expect(parser.parse('enviado ORD-004')).toEqual({
        command: 'enviado',
        args: { orderCode: 'ORD-004' },
      });
    });
  });

  describe('parse() — pedido', () => {
    it('should parse "pedido ORD-001"', () => {
      expect(parser.parse('pedido ORD-001')).toEqual({
        command: 'pedido',
        args: { orderCode: 'ORD-001' },
      });
    });
  });

  describe('parse() — no-arg commands', () => {
    it('should parse "pendientes"', () => {
      expect(parser.parse('pendientes')).toEqual({ command: 'pendientes', args: {} });
    });

    it('should parse "hoy"', () => {
      expect(parser.parse('hoy')).toEqual({ command: 'hoy', args: {} });
    });

    it('should parse "ayuda"', () => {
      expect(parser.parse('ayuda')).toEqual({ command: 'ayuda', args: {} });
    });

    it('should parse "pausar bot"', () => {
      expect(parser.parse('pausar bot')).toEqual({ command: 'pausar_bot', args: {} });
    });

    it('should parse "activar bot"', () => {
      expect(parser.parse('activar bot')).toEqual({ command: 'activar_bot', args: {} });
    });
  });

  // ---------------------------------------------------------------------------
  // AC-05: Unknown / malformed commands return null
  // ---------------------------------------------------------------------------
  describe('AC-05: parse() — unknown commands return null', () => {
    it('should return null for "inventario"', () => {
      expect(parser.parse('inventario')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parser.parse('')).toBeNull();
    });

    it('should return null for random text', () => {
      expect(parser.parse('hola como estas')).toBeNull();
    });

    it('should return null for "confirmar" alone (no orderCode)', () => {
      expect(parser.parse('confirmar')).toBeNull();
    });

    it('should return null for "pagado" alone (no orderCode)', () => {
      expect(parser.parse('pagado')).toBeNull();
    });

    it('PR-05.2 AC-02: should return null for "msg" alone (no orderCode or text)', () => {
      expect(parser.parse('msg')).toBeNull();
    });

    it('PR-05.2 AC-02: should return null for "msg ORD-001" without text', () => {
      expect(parser.parse('msg ORD-001')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // PR-05.2 AC-02: Relay command parsing
  // ---------------------------------------------------------------------------
  describe('AC-02 (PR-05.2): parse() — msg / handoff / cerrar handoff', () => {
    it('should parse "msg ORD-001 Hola cliente"', () => {
      expect(parser.parse('msg ORD-001 Hola cliente')).toEqual({
        command: 'msg',
        args: { orderCode: 'ORD-001', text: 'Hola cliente' },
      });
    });

    it('should parse "msg ORD-002 Tu pedido sale mañana por la mañana" (long text)', () => {
      const result = parser.parse('msg ORD-002 Tu pedido sale mañana por la mañana');
      expect(result).not.toBeNull();
      expect(result!.command).toBe('msg');
      expect(result!.args['orderCode']).toBe('ORD-002');
      // Original text preserved (diacritics intact)
      expect(result!.args['text']).toContain('mañana');
    });

    it('should uppercase orderCode in msg command', () => {
      const result = parser.parse('msg ord-001 hola');
      expect(result?.args['orderCode']).toBe('ORD-001');
    });

    it('should parse "handoff ORD-001"', () => {
      expect(parser.parse('handoff ORD-001')).toEqual({
        command: 'handoff',
        args: { orderCode: 'ORD-001' },
      });
    });

    it('should uppercase orderCode in handoff command', () => {
      const result = parser.parse('handoff ord-abc');
      expect(result?.args['orderCode']).toBe('ORD-ABC');
    });

    it('should parse "cerrar handoff"', () => {
      expect(parser.parse('cerrar handoff')).toEqual({
        command: 'cerrar_handoff',
        args: {},
      });
    });

    it('should parse "Cerrar Handoff" (mixed case)', () => {
      expect(parser.parse('Cerrar Handoff')).toEqual({
        command: 'cerrar_handoff',
        args: {},
      });
    });

    it('should return null for "handoff" alone (no orderCode)', () => {
      expect(parser.parse('handoff')).toBeNull();
    });
  });
});
