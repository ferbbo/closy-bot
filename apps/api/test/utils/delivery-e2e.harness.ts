import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/persistence/prisma/prisma.service';
import { DELIVERY_LLM_PROVIDER } from '../../src/verticals/delivery/agent/delivery-agent.service';
import { FakeLlmProvider } from './fake-llm.provider';
import { FakeGraphApi } from '../meta-sandbox/fake-graph-api';
import { applySandboxEnv } from '../meta-sandbox/env';
import { SANDBOX_APP } from '../meta-sandbox/sandbox-app';
import { inboundText, signPayload } from '../meta-sandbox/webhook-builders';

/** Comercio demo de `prisma/seed-delivery.ts`. */
export const DELIVERY_MERCHANT_ID = 'dlv_merchant_burger_barrio';

export interface DeliveryE2eHarness {
  app: INestApplication;
  prisma: PrismaService;
  fake: FakeLlmProvider;
  /** sku → variantId del seed. */
  variants: Record<string, string>;
  /** Envía un webhook de texto firmado y devuelve la última respuesta (texto o interactivo) encolada para el comercio. */
  sendText(from: string, text: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Arranque compartido de los e2e de la vertical delivery (deuda de S4.1/S4.2):
 * Meta Sandbox + seed demo + flag activo + FakeLlm + horario 24/7 + canal sandbox.
 * La limpieza borra solo los datos del comercio demo.
 */
export async function startDeliveryApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<DeliveryE2eHarness> {
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  const { baseUrl } = await graph.start();
  const restoreEnv = applySandboxEnv(baseUrl);
  const prev = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };
  process.env.FEATURES_MODE = 'dev';
  process.env.DELIVERY_ENABLED = 'true';

  await promisify(execFile)('npx', ['tsx', 'prisma/seed-delivery.ts'], {
    cwd: resolve(__dirname, '../../../..'),
    env: process.env,
  });

  const { AppModule } = await import('../../src/app.module');
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DELIVERY_LLM_PROVIDER)
    .useValue(fake);
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  const where = { merchantId: DELIVERY_MERCHANT_ID };

  const cfg = await prisma.merchantConfig.findUniqueOrThrow({ where });
  const deliveryConfig = cfg.deliveryConfig as Record<string, unknown>;
  deliveryConfig.openingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: '00:00',
    close: '23:59',
  }));
  await prisma.merchantConfig.update({
    where,
    data: { deliveryConfig: deliveryConfig as unknown as Prisma.InputJsonValue },
  });
  await prisma.channel.upsert({
    where: { type_externalId: { type: 'WHATSAPP', externalId: SANDBOX_APP.phoneNumberId } },
    create: {
      merchantId: DELIVERY_MERCHANT_ID,
      type: 'WHATSAPP',
      externalId: SANDBOX_APP.phoneNumberId,
      displayName: 'Sandbox',
      credentials: {
        accessToken: SANDBOX_APP.accessToken,
        phoneNumberId: SANDBOX_APP.phoneNumberId,
      },
      wabaId: SANDBOX_APP.wabaId,
      status: 'connected',
    },
    update: { merchantId: DELIVERY_MERCHANT_ID },
  });

  const variants: Record<string, string> = {};
  for (const variant of await prisma.productVariant.findMany({ where: { product: where } })) {
    variants[variant.sku] = variant.id;
  }

  const sendText = async (from: string, text: string): Promise<string> => {
    const raw = JSON.stringify(inboundText(from, text));
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);
    // S5.4 (AC-28): el turno del resumen responde con SEND_INTERACTIVE (body = bloque del
    // presenter). `not: SEND_TEMPLATE` es válido con y sin el valor nuevo del enum.
    const recent = await prisma.outboxMessage.findMany({
      where: { ...where, type: { not: 'SEND_TEMPLATE' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const msg of recent) {
      const payload = msg.payloadJson as { text?: string; interactive?: { body?: string } } | null;
      const body = payload?.text ?? payload?.interactive?.body;
      if (body) return String(body);
    }
    return '';
  };

  const close = async (): Promise<void> => {
    try {
      await prisma.orderItem.deleteMany({ where: { order: where } });
      await prisma.order.deleteMany({ where });
      await prisma.cartItem.deleteMany({ where: { cart: where } });
      await prisma.cart.deleteMany({ where });
      await prisma.outboxMessage.deleteMany({ where });
      await prisma.messageLog.deleteMany({ where });
      await prisma.handoff.deleteMany({ where: { conversation: where } });
      await prisma.conversation.deleteMany({ where });
      await prisma.productVariant.deleteMany({ where: { product: where } });
      await prisma.product.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.merchantConfig.deleteMany({ where });
      await prisma.channel.deleteMany({ where });
      await prisma.merchant.deleteMany({ where: { id: DELIVERY_MERCHANT_ID } });
    } finally {
      await app.close();
      await graph.stop();
      restoreEnv();
      for (const [k, val] of [
        ['FEATURES_MODE', prev.mode],
        ['DELIVERY_ENABLED', prev.enabled],
      ] as const) {
        if (val === undefined) delete process.env[k];
        else process.env[k] = val;
      }
    }
  };

  return { app, prisma, fake, variants, sendText, close };
}

/** Crea un pedido de domicilio directo en BD (sin pasar por el checkout) para probar estados. */
export async function createDeliveryOrder(
  prisma: PrismaService,
  opts: {
    phone: string;
    orderCode: string;
    status: Prisma.OrderCreateInput['status'];
    items: Array<{
      variantId: string;
      quantity: number;
      unitPrice: number;
      name: string;
      notes?: string;
    }>;
    etaMinutes?: number;
  },
) {
  // Mismo formato que guarda el orquestador desde el webhook (`from` de Meta, sin "+")
  const phone = opts.phone.replace(/\D/g, '');
  const customer = await prisma.customer.upsert({
    where: { phone },
    create: { phone, name: 'Cliente Sandbox' },
    update: {},
  });
  const subtotal = opts.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  return prisma.order.create({
    data: {
      orderCode: opts.orderCode,
      merchant: { connect: { id: DELIVERY_MERCHANT_ID } },
      customer: { connect: { id: customer.id } },
      status: opts.status,
      totalAmount: subtotal + 4000,
      shippingCost: 4000,
      shippingAddress: 'Cra 27 #45-12, Cabecera',
      customerName: 'Cliente Sandbox',
      customerPhone: phone,
      paymentMethod: 'cod',
      deliveryZone: 'Cabecera',
      etaMinutes: opts.etaMinutes ?? 35,
      confirmedAt: new Date(),
      items: {
        create: opts.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          snapshotName: i.name,
          notes: i.notes ?? null,
        })),
      },
    },
  });
}
