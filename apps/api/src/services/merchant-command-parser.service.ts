import { Injectable } from '@nestjs/common';

// ---------------------------------------------------------------------------
// ParsedCommand — output of MerchantCommandParser.parse()
// PR-05.1 REQ-05, REQ-06, AC-04, AC-05
// ---------------------------------------------------------------------------
export interface ParsedCommand {
  command: string;
  args: Record<string, string>;
}

/**
 * MerchantCommandParser
 * PR-05.1 — REQ-05, REQ-06
 *
 * Parses textual commands sent by the merchant via WhatsApp.
 *
 * Normalization (AC-04):
 * - lowercase
 * - strip diacritics / tildes (é→e, á→a, etc.)
 * - collapse whitespace + trim
 *
 * Returns null for unknown or malformed commands (AC-05).
 */
@Injectable()
export class MerchantCommandParserService {
  /**
   * Normalize text for case-insensitive, accent-insensitive matching.
   * AC-04: "Confirmar ORD-001" === "confirmar ORD-001"
   */
  normalize(text: string): string {
    return text
      .normalize('NFD') // decompose accents
      .replace(/[\u0300-\u036f]/g, '') // strip combining marks
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse a merchant command text.
   * Returns ParsedCommand if recognized, null otherwise (AC-05).
   *
   * Supported commands:
   *  confirmar <orderCode>
   *  rechazar <orderCode> [motivo...]
   *  pagado <orderCode>
   *  enviado <orderCode>
   *  pedido <orderCode>
   *  pendientes
   *  hoy
   *  ayuda
   *  pausar bot
   *  activar bot
   */
  parse(text: string): ParsedCommand | null {
    const normalized = this.normalize(text);

    // pausar bot / activar bot — multi-word commands first
    if (normalized === 'pausar bot') {
      return { command: 'pausar_bot', args: {} };
    }
    if (normalized === 'activar bot') {
      return { command: 'activar_bot', args: {} };
    }
    // PR-05.2: cerrar handoff — multi-word, must be checked before single-word commands
    if (normalized === 'cerrar handoff') {
      return { command: 'cerrar_handoff', args: {} };
    }
    if (normalized === 'pendientes') {
      return { command: 'pendientes', args: {} };
    }
    if (normalized === 'hoy') {
      return { command: 'hoy', args: {} };
    }
    if (normalized === 'ayuda') {
      return { command: 'ayuda', args: {} };
    }

    // confirmar <orderCode>
    const confirmarMatch = normalized.match(/^confirmar\s+([a-z0-9_-]+)$/i);
    if (confirmarMatch) {
      return { command: 'confirmar', args: { orderCode: confirmarMatch[1].toUpperCase() } };
    }

    // pagado <orderCode>
    const pagadoMatch = normalized.match(/^pagado\s+([a-z0-9_-]+)$/i);
    if (pagadoMatch) {
      return { command: 'pagado', args: { orderCode: pagadoMatch[1].toUpperCase() } };
    }

    // enviado <orderCode>
    const enviadoMatch = normalized.match(/^enviado\s+([a-z0-9_-]+)$/i);
    if (enviadoMatch) {
      return { command: 'enviado', args: { orderCode: enviadoMatch[1].toUpperCase() } };
    }

    // pedido <orderCode>
    const pedidoMatch = normalized.match(/^pedido\s+([a-z0-9_-]+)$/i);
    if (pedidoMatch) {
      return { command: 'pedido', args: { orderCode: pedidoMatch[1].toUpperCase() } };
    }

    // rechazar <orderCode> [motivo…]  — after pedido to avoid overlap
    const rechazarMatch = normalized.match(/^rechazar\s+([a-z0-9_-]+)(?:\s+(.+))?$/i);
    if (rechazarMatch) {
      const args: Record<string, string> = {
        orderCode: rechazarMatch[1].toUpperCase(),
      };
      if (rechazarMatch[2]) {
        args['reason'] = rechazarMatch[2].trim();
      }
      return { command: 'rechazar', args };
    }

    // PR-05.2: handoff <orderCode>
    const handoffMatch = normalized.match(/^handoff\s+([a-z0-9_-]+)$/i);
    if (handoffMatch) {
      return { command: 'handoff', args: { orderCode: handoffMatch[1].toUpperCase() } };
    }

    // PR-05.2: msg <orderCode> <texto…>
    // Use original text (not normalized) to preserve diacritics and casing in message body
    const msgMatch = normalized.match(/^msg\s+([a-z0-9_-]+)\s+(.+)$/i);
    if (msgMatch) {
      // Extract original text by matching against raw input (case-insensitive prefix)
      const originalMsgMatch = text.trim().match(/^msg\s+([a-z0-9_-]+)\s+(.+)$/i);
      const originalText = originalMsgMatch ? originalMsgMatch[2].trim() : msgMatch[2].trim();
      return {
        command: 'msg',
        args: { orderCode: msgMatch[1].toUpperCase(), text: originalText },
      };
    }

    // PR-05.2: msg without required args → null (AC-02)
    if (normalized.startsWith('msg')) {
      return null;
    }

    // Unknown command → null (AC-05)
    return null;
  }
}
