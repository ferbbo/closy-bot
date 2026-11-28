import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import type { CheckoutDraft } from '../contracts';

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};
}

/**
 * CheckoutDraftStore — estado del checkout conversacional en
 * `Conversation.metadata.delivery.checkout` (CONTRACTS §1, F3).
 *
 * - read-merge-write: nunca pisa otras claves de `metadata` ni de `metadata.delivery`.
 * - `patch` con una clave en `undefined` la BORRA del draft (p. ej. `quote: undefined`
 *   invalida una cotización vieja tras corregir el barrio).
 * - Sin logs de contenido (la dirección es PII).
 */
@Injectable()
export class CheckoutDraftStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(conversationId: string): Promise<CheckoutDraft | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const checkout = asObject(asObject(asObject(conv?.metadata).delivery).checkout);
    return typeof checkout.cartId === 'string' ? (checkout as unknown as CheckoutDraft) : null;
  }

  /** Mezcla `partial` sobre el draft actual y devuelve el draft resultante. */
  async patch(conversationId: string, partial: Partial<CheckoutDraft>): Promise<CheckoutDraft> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { metadata: true },
    });
    const metadata = asObject(conv?.metadata);
    const delivery = asObject(metadata.delivery);
    const merged: Json = { ...asObject(delivery.checkout), ...partial };
    for (const key of Object.keys(merged)) {
      if (merged[key] === undefined) delete merged[key];
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: {
          ...metadata,
          delivery: { ...delivery, checkout: merged },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return merged as unknown as CheckoutDraft;
  }
}
