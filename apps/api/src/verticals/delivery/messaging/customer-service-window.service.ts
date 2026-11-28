import { Injectable } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../../../persistence/prisma/prisma.service';
import type { CustomerServiceWindow } from '../contracts';

/** Ventana de atención de WhatsApp: 24 h desde el último mensaje entrante, con 5 min de margen. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

/** Variantes de un teléfono (con y sin `+`) para casar `Customer.phone` con el `from` de Meta. */
export function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  return Array.from(new Set([phone, digits, `+${digits}`].filter((v) => v.length > 1)));
}

/**
 * CustomerServiceWindow (S1.4-T3). Fuente: `MessageLog` con `direction=IN` del comercio
 * (está acotado por merchantId; `InboundMessage` no lo está, así que no sirve para decidir
 * la ventana de un comercio concreto).
 */
@Injectable()
export class CustomerServiceWindowService implements CustomerServiceWindow {
  constructor(private readonly prisma: PrismaService) {}

  async isOpen(merchantId: string, phone: string, now: Date = new Date()): Promise<boolean> {
    const since = new Date(now.getTime() - CUSTOMER_SERVICE_WINDOW_MS);
    const last = await this.prisma.messageLog.findFirst({
      where: {
        merchantId,
        direction: MessageDirection.IN,
        createdAt: { gt: since, lte: now },
        conversation: { customer: { phone: { in: phoneVariants(phone) } } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return last !== null;
  }
}
