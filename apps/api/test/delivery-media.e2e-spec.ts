import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { DELIVERY_LLM_PROVIDER } from '../src/verticals/delivery/agent/delivery-agent.service';
import { DELIVERY_TEXTS } from '../src/verticals/delivery/agent/delivery-agent.prompt';
import {
  MEDIA_FETCHER,
  TRANSCRIBER,
  type FetchedMedia,
  type MediaFetcher,
  type MediaResult,
  type Transcriber,
} from '../src/verticals/delivery/contracts';
import { GraphMediaFetcher } from '../src/verticals/delivery/media/media-fetcher.service';
import { FakeLlmProvider } from './utils/fake-llm.provider';
import { FakeMediaFetcher, FakeTranscriber } from './utils/fake-media';
import { FakeGraphApi, FIXTURE_AUDIO_ID } from './meta-sandbox/fake-graph-api';
import { applySandboxEnv } from './meta-sandbox/env';
import { SANDBOX_APP } from './meta-sandbox/sandbox-app';
import { inboundAudio, signPayload } from './meta-sandbox/webhook-builders';

jest.setTimeout(60000); // beforeAll runs the demo seed with tsx

const VOICE_ORDER = '2 hamburguesas sencillas sin cebolla y una coca 400';

/**
 * S5.2-T2 — Nota de voz de punta a punta: webhook firmado (`inboundAudio`) → orquestador →
 * DeliveryVerticalHandler → MediaRouter → MediaFetcher (Graph API falso del Meta Sandbox) →
 * Transcriber (FakeTranscriber, nunca Groq) → mismo turno del agente (FakeLlmProvider) → BD.
 * AC-26 (F-16, RN-24).
 */
describe('Delivery media — voice (e2e)', () => {
  const MERCHANT_ID = 'dlv_merchant_burger_barrio'; // prisma/seed-delivery.ts
  const customerPhone = SANDBOX_APP.customers[1];
  const graph = new FakeGraphApi();
  const fake = new FakeLlmProvider([]);
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreEnv: () => void;
  const prev = { mode: process.env.FEATURES_MODE, enabled: process.env.DELIVERY_ENABLED };
  const v: Record<string, string> = {};

  // Swappable per test: real GraphMediaFetcher (against the sandbox) unless a fake is set.
  let fetcherOverride: MediaFetcher | null = null;
  let transcriber: Transcriber = new FakeTranscriber(VOICE_ORDER);
  let seq = 0;

  const sendAudio = async (mediaId: string): Promise<{ reply: string; wamid: string }> => {
    const wamid = `wamid.S52_AUDIO_${Date.now()}_${seq++}`;
    const payload = inboundAudio(customerPhone, mediaId, { id: wamid });
    const raw = JSON.stringify(payload);
    const outboxWhere = { merchantId: MERCHANT_ID, type: 'SEND_TEXT' as const };
    const before = await prisma.outboxMessage.count({ where: outboxWhere });
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signPayload(raw))
      .send(raw)
      .expect(200);
    expect(await prisma.outboxMessage.count({ where: outboxWhere })).toBe(before + 1);
    const last = await prisma.outboxMessage.findFirst({
      where: outboxWhere,
      orderBy: { createdAt: 'desc' },
    });
    return { reply: String((last?.payloadJson as { text?: string } | null)?.text ?? ''), wamid };
  };
  const cartLines = () =>
    prisma.cartItem.findMany({
      where: { cart: { merchantId: MERCHANT_ID, status: 'active' } },
      include: { variant: true },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    ({ baseUrl: v.base } = await graph.start());
    restoreEnv = applySandboxEnv(v.base);
    process.env.FEATURES_MODE = 'dev';
    process.env.DELIVERY_ENABLED = 'true';

    await promisify(execFile)('npx', ['tsx', 'prisma/seed-delivery.ts'], {
      cwd: resolve(__dirname, '../../..'),
      env: process.env,
    });

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DELIVERY_LLM_PROVIDER)
      .useValue(fake)
      .overrideProvider(TRANSCRIBER)
      .useValue({
        transcribe: (media: FetchedMedia, opts: { language: 'es'; maxDurationSec: number }) =>
          transcriber.transcribe(media, opts),
      } satisfies Transcriber)
      .overrideProvider(MEDIA_FETCHER)
      .useFactory({
        factory: (graphFetcher: GraphMediaFetcher): MediaFetcher => ({
          fetch: (...args: Parameters<MediaFetcher['fetch']>) =>
            (fetcherOverride ?? graphFetcher).fetch(...args),
        }),
        inject: [GraphMediaFetcher],
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Always open for the test, regardless of the wall clock
    const cfg = await prisma.merchantConfig.findUniqueOrThrow({
      where: { merchantId: MERCHANT_ID },
    });
    const deliveryConfig = cfg.deliveryConfig as Record<string, unknown>;
    deliveryConfig.openingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      open: '00:00',
      close: '23:59',
    }));
    await prisma.merchantConfig.update({
      where: { merchantId: MERCHANT_ID },
      data: { deliveryConfig: deliveryConfig as unknown as Prisma.InputJsonValue },
    });
    await prisma.channel.upsert({
      where: { type_externalId: { type: 'WHATSAPP', externalId: SANDBOX_APP.phoneNumberId } },
      create: {
        merchantId: MERCHANT_ID,
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
      update: { merchantId: MERCHANT_ID },
    });

    const variants = await prisma.productVariant.findMany({
      where: { product: { merchantId: MERCHANT_ID } },
    });
    for (const variant of variants) v[variant.sku] = variant.id;
  });

  beforeEach(() => {
    fetcherOverride = null;
    transcriber = new FakeTranscriber(VOICE_ORDER);
    graph.reset();
  });

  afterAll(async () => {
    try {
      const where = { merchantId: MERCHANT_ID };
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
      await prisma.merchant.deleteMany({ where: { id: MERCHANT_ID } });
    } finally {
      await app?.close();
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
  });

  it('AC-26: voice note → same cart as AC-03 and the reply starts with the echo "🎙️ Entendí: «…»"', async () => {
    const fakeTranscriber = new FakeTranscriber(VOICE_ORDER);
    transcriber = fakeTranscriber;
    // Same script as AC-03 in delivery-order.e2e-spec.ts
    fake.enqueue(
      {
        toolCalls: [
          { name: 'buscar_producto', arguments: { query: 'hamburguesa sencilla' } },
          { name: 'buscar_producto', arguments: { query: 'coca' } },
        ],
      },
      {
        toolCalls: [
          {
            name: 'agregar_al_carrito',
            arguments: { variantId: v['HAM-SEN'], cantidad: 2, notas: 'sin cebolla' },
          },
          { name: 'agregar_al_carrito', arguments: { variantId: v['BEB-COCA-400'], cantidad: 1 } },
        ],
      },
      {
        text: '¡Listo! Te anoté 2 hamburguesas sencillas sin cebolla y una Coca-Cola de 400, van $36.000. ¿A qué dirección te lo enviamos?',
      },
    );
    const callsBefore = fake.calls.length;

    const { reply, wamid } = await sendAudio(FIXTURE_AUDIO_ID);

    expect(reply.startsWith(`🎙️ Entendí: «${VOICE_ORDER}»`)).toBe(true);
    expect(reply).toContain('$36.000');
    const lines = await cartLines();
    expect(lines.map((l) => [l.variant.sku, l.quantity, l.notes])).toEqual([
      ['HAM-SEN', 2, 'sin cebolla'],
      ['BEB-COCA-400', 1, ''],
    ]);
    const subtotal = lines.reduce((acc, l) => acc + Number(l.priceSnapshot) * l.quantity, 0);
    expect(subtotal).toBe(36000);
    expect(fake.remaining).toBe(0);

    // The audio was downloaded from the sandbox Graph API and transcribed with the RN-24 limits
    expect(fakeTranscriber.calls).toHaveLength(1);
    expect(fakeTranscriber.calls[0].media.mimeType).toBe('audio/ogg');
    expect(fakeTranscriber.calls[0].opts).toEqual({ language: 'es', maxDurationSec: 120 });
    // The agent received the transcription as the user's text, in the same turn
    const firstCall = JSON.stringify(fake.calls[callsBefore].request);
    expect(firstCall).toContain(VOICE_ORDER);

    // RN-24: the inbound log keeps the message id, never the transcription
    const inbound = await prisma.messageLog.findFirst({
      where: { merchantId: MERCHANT_ID, providerMessageId: wamid, direction: 'IN' },
    });
    expect(inbound).not.toBeNull();
    expect(inbound?.text ?? '').not.toContain(VOICE_ORDER);
  });

  const expectAskForText = async (mediaId: string) => {
    const callsBefore = fake.calls.length;
    const linesBefore = (await cartLines()).length;
    const { reply } = await sendAudio(mediaId); // asserts HTTP 200 (never 500)
    expect(reply).toBe(DELIVERY_TEXTS.mediaFallback);
    expect(fake.calls.length).toBe(callsBefore); // the agent is not invoked
    expect((await cartLines()).length).toBe(linesBefore);
  };

  it('AC-26: audio longer than 120 s → asks for text, no 500', async () => {
    const longAudio: MediaResult<FetchedMedia> = {
      ok: true,
      value: {
        buffer: Buffer.from('long-ogg'),
        mimeType: 'audio/ogg',
        sizeBytes: 8,
        durationSec: 121,
      },
    };
    fetcherOverride = new FakeMediaFetcher(longAudio);
    const fakeTranscriber = new FakeTranscriber(VOICE_ORDER);
    transcriber = fakeTranscriber;

    await expectAskForText('media-long-audio');
    expect(fakeTranscriber.calls).toHaveLength(1);
  });

  it('AC-26: transcriber reports TOO_LONG → asks for text, no 500', async () => {
    transcriber = new FakeTranscriber({ ok: false, reason: 'TOO_LONG' });
    await expectAskForText(FIXTURE_AUDIO_ID);
  });

  it('AC-26: failed download (Graph API 500 in the sandbox) → asks for text, no 500', async () => {
    const fakeTranscriber = new FakeTranscriber(VOICE_ORDER);
    transcriber = fakeTranscriber;
    graph.failNext('media', {
      httpStatus: 500,
      code: 2,
      message: 'Service temporarily unavailable',
    });

    await expectAskForText(FIXTURE_AUDIO_ID);
    expect(fakeTranscriber.calls).toHaveLength(0);
  });

  it('AC-26: unknown media id in the sandbox (404) → asks for text, no 500', async () => {
    await expectAskForText('media-does-not-exist');
  });

  it('AC-26: fetcher DOWNLOAD_FAILED → asks for text, no 500', async () => {
    fetcherOverride = new FakeMediaFetcher({ ok: false, reason: 'DOWNLOAD_FAILED' });
    await expectAskForText('media-any');
  });

  it('AC-26: empty transcription → asks for text, no 500', async () => {
    transcriber = new FakeTranscriber('   ');
    await expectAskForText(FIXTURE_AUDIO_ID);
  });

  it('AC-26: transcriber EMPTY / TIMEOUT / PROVIDER_ERROR → asks for text, no 500', async () => {
    for (const reason of ['EMPTY', 'TIMEOUT', 'PROVIDER_ERROR'] as const) {
      transcriber = new FakeTranscriber({ ok: false, reason });
      await expectAskForText(FIXTURE_AUDIO_ID);
    }
  });
});
