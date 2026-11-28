import { Injectable, Logger } from '@nestjs/common';
import { OutboxService } from '../../../persistence/outbox/outbox.service';

/** S5.4 (F-18): ids estables de los botones de confirmación; títulos ≤ 20 caracteres (Meta). */
export const DELIVERY_CONFIRM_YES_ID = 'delivery_confirm_yes';
export const DELIVERY_CONFIRM_NO_ID = 'delivery_confirm_no';
export const DELIVERY_CONFIRM_BUTTONS = [
  { id: DELIVERY_CONFIRM_YES_ID, title: 'Sí, confirmo' },
  { id: DELIVERY_CONFIRM_NO_ID, title: 'No, cambiar algo' },
] as const;
/** Pregunta fija (sin cifras) bajo el bloque exacto del presenter. */
export const DELIVERY_CONFIRM_QUESTION = '¿Confirmamos tu pedido?';
/** Límite de Meta para `interactive.body.text`. */
export const INTERACTIVE_BODY_MAX = 1024;

export interface InteractiveConfirmationInput {
  merchantId: string;
  conversationId: string;
  channelId: string | null;
  to: string;
  inboundMessageId: string;
  /** Prefijos deterministas del turno (eco de voz, aviso de privacidad); nunca texto del LLM. */
  prefix: string;
  /** Bloque EXACTO de OrderSummaryPresenter (RN-12). */
  summaryBlock: string;
}

/**
 * S5.4-T2 (F-18, AC-28): la confirmación sale como mensaje interactivo con botones Sí/No.
 * El cuerpo es el bloque exacto del presenter + una pregunta fija. Si no aplica (sin canal,
 * cuerpo > 1024 o fallo al encolar) devuelve `null` y el handler cae al texto actual.
 * dedupeKey `reply:<messageId>`: la misma clave que la respuesta de texto del controller.
 */
@Injectable()
export class InteractiveConfirmationSender {
  private readonly logger = new Logger(InteractiveConfirmationSender.name);

  constructor(private readonly outbox: OutboxService) {}

  buildBody(prefix: string, summaryBlock: string): string {
    return `${prefix}${summaryBlock}\n\n${DELIVERY_CONFIRM_QUESTION}`;
  }

  async send(input: InteractiveConfirmationInput): Promise<string | null> {
    const body = this.buildBody(input.prefix, input.summaryBlock);
    if (!input.channelId || body.length > INTERACTIVE_BODY_MAX) return null;
    try {
      await this.outbox.enqueueWhatsAppInteractive({
        merchantId: input.merchantId,
        conversationId: input.conversationId,
        channelId: input.channelId,
        to: input.to,
        body,
        buttons: DELIVERY_CONFIRM_BUTTONS.map((b) => ({ ...b })),
        dedupeKey: `reply:${input.inboundMessageId}`,
      });
      return body;
    } catch (error) {
      this.logger.warn(`Interactive confirmation not enqueued: ${(error as Error).message}`);
      return null;
    }
  }
}
