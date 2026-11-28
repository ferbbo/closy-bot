import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { HandoffService } from '../../../../services/handoff.service';
import type { Industry } from '../../../../domain/entities/playbook-config.interface';
import type { DeliveryConfig, DeliveryTurnContext } from '../../contracts';

/** Texto fijo para el cliente (sin cifras: el LLM no escribe montos, RN-28). */
export const AMOUNT_LIMIT_HANDOFF_MESSAGE =
  'Por el valor de tu pedido, una persona del equipo tiene que revisarlo antes de confirmarlo. Ya les avisé y te escriben por aquí en breve.';
export const AMOUNT_LIMIT_HANDOFF_FAILED_MESSAGE =
  'Por el valor de tu pedido, una persona del equipo tiene que revisarlo antes de confirmarlo, pero ahora no pude avisarles. Intenta de nuevo en unos minutos, por favor.';

export interface AmountLimitEscalation {
  handoffOpened: boolean;
  response: string;
}

/**
 * Límite de monto sin humano (S3.2-T3, RN-17, AC-24 base).
 * `exceeds` es puro; `escalate` abre el handoff con el servicio existente (idempotente por
 * conversación: si ya hay uno pendiente o activo lo reutiliza) y devuelve el texto para el
 * cliente. La conexión con `confirmar_pedido` (pedido `pending_payment`) la hace S3.3.
 * HandoffService se resuelve con ModuleRef (strict:false) para evitar ciclos de módulos.
 */
@Injectable()
export class AmountLimitGuard {
  private readonly logger = new Logger(AmountLimitGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  exceeds(total: number, cfg: DeliveryConfig): boolean {
    return total > cfg.maxOrderAmountWithoutHuman;
  }

  async escalate(ctx: DeliveryTurnContext, activeCartId?: string): Promise<AmountLimitEscalation> {
    try {
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: ctx.merchantId },
        select: { id: true, name: true, industry: true, playbookConfig: true },
      });
      if (!merchant) throw new Error('merchant not found');
      const handoff = this.moduleRef.get(HandoffService, { strict: false });
      await handoff.createHandoff(
        {
          conversationId: ctx.conversationId,
          customerId: ctx.customerId,
          merchantId: ctx.merchantId,
          merchant: {
            id: merchant.id,
            name: merchant.name,
            industry: merchant.industry as Industry | null,
            playbookConfig: merchant.playbookConfig as Record<string, unknown> | null,
          },
          ...(activeCartId ? { activeCartId } : {}),
        },
        'auto_escalation',
      );
      return { handoffOpened: true, response: AMOUNT_LIMIT_HANDOFF_MESSAGE };
    } catch (error) {
      this.logger.error(`Amount-limit handoff failed: ${(error as Error).message}`);
      return { handoffOpened: false, response: AMOUNT_LIMIT_HANDOFF_FAILED_MESSAGE };
    }
  }
}
