import { Injectable, Logger } from '@nestjs/common';
import type { VerticalContext, VerticalHandler, VerticalResult } from './vertical.types';

/**
 * VerticalRouterService — registro de handlers verticales (S1.1-T3).
 *
 * El orquestador llama a `tryHandle(ctx)` después de resolver la conversación.
 * - Sin handlers registrados → `null` (flujos legacy, sin consultas extra).
 * - Cada handler decide con `canHandle` (feature flag + industria) y puede devolver
 *   `null` para caer a los flujos legacy.
 * - Un error de un handler nunca rompe la conversación: se loguea y se cae a legacy.
 */
@Injectable()
export class VerticalRouterService {
  private readonly logger = new Logger(VerticalRouterService.name);
  private readonly handlers: VerticalHandler[] = [];

  register(handler: VerticalHandler): void {
    if (this.handlers.some((h) => h.name === handler.name)) {
      this.logger.warn(`Vertical handler '${handler.name}' already registered — ignoring`);
      return;
    }
    this.handlers.push(handler);
    this.logger.log(`Vertical handler registered: ${handler.name}`);
  }

  get registeredHandlers(): readonly string[] {
    return this.handlers.map((h) => h.name);
  }

  async tryHandle(ctx: VerticalContext): Promise<VerticalResult | null> {
    for (const handler of this.handlers) {
      try {
        if (!(await handler.canHandle(ctx))) continue;
        const result = await handler.handle(ctx);
        if (result) return result;
      } catch (error) {
        this.logger.error(
          `Vertical handler '${handler.name}' failed for conversation ${ctx.conversation.id}: ${(error as Error).message}`,
        );
        return null;
      }
    }
    return null;
  }
}
