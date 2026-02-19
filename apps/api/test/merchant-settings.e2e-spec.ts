/**
 * PR-15: Merchant Settings E2E Tests
 * Tests GET/PATCH /merchants/me and PUT/PATCH /merchants/me/playbook
 * Covers AC-01 through AC-11
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';
import { Industry } from '@prisma/client';

describe('MerchantSettings (e2e) - PR-15', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testMerchant: {
    id: string;
    name: string;
    whatsappNumber: string;
    apiKey: string;
    industry: Industry;
    playbookConfig: null;
  };
  let sessionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up test data
    await prisma.session.deleteMany({});
    await prisma.merchantIdentity.deleteMany({});
    await prisma.merchant.deleteMany({ where: { whatsappNumber: { startsWith: 'test-pr15-' } } });

    // Create test merchant with session
    testMerchant = await prisma.merchant.create({
      data: {
        name: 'PR15 Test Store',
        whatsappNumber: `test-pr15-${Date.now()}@example.com`,
        apiKey: `test-api-key-pr15-${Date.now()}`,
        industry: Industry.ropa,
        playbookConfig: null,
      },
    });

    const session = await prisma.session.create({
      data: {
        sessionId: `test-session-pr15-${Date.now()}`,
        merchantId: testMerchant.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    sessionId = session.sessionId;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.merchant.deleteMany({ where: { id: testMerchant.id } });
    await app.close();
  });

  describe('AC-01: GET /merchants/me returns merchant profile', () => {
    it('should return merchant with id, name, industry, playbookConfig', async () => {
      const response = await request(app.getHttpServer())
        .get('/merchants/me')
        .set('Cookie', [`session_id=${sessionId}`])
        .expect(200);

      expect(response.body).toMatchObject({
        id: testMerchant.id,
        name: 'PR15 Test Store',
        industry: 'ropa',
        playbookConfig: null,
      });
    });
  });

  describe('AC-02: GET without auth returns 401', () => {
    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer()).get('/merchants/me').expect(401);
    });
  });

  describe('AC-03: PATCH /merchants/me updates name', () => {
    it('should update merchant name', async () => {
      const response = await request(app.getHttpServer())
        .patch('/merchants/me')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ name: 'Updated Store Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Store Name');

      // Verify in DB
      const updated = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      expect(updated?.name).toBe('Updated Store Name');
    });
  });

  describe('AC-04: PATCH /merchants/me updates industry', () => {
    it('should update merchant industry', async () => {
      const response = await request(app.getHttpServer())
        .patch('/merchants/me')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ industry: 'belleza' })
        .expect(200);

      expect(response.body.industry).toBe('belleza');

      // Verify in DB
      const updated = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      expect(updated?.industry).toBe('belleza');
    });
  });

  describe('AC-05: PUT /merchants/me/playbook replaces config', () => {
    it('should replace entire playbookConfig', async () => {
      const newConfig = {
        industry: 'ropa',
        llmPrompt: {
          tone: 'Professional and elegant',
          focusAreas: ['Size', 'Color', 'Style'],
          commonQuestions: ['What sizes do you have?', 'Free shipping?'],
          upsellStrategy: 'Suggest matching accessories',
          emojiUsage: 'moderate',
        },
        messages: {
          greeting: '¡Hola! Bienvenido a nuestra tienda',
          addToCartConfirm: '✅ Agregado al carrito',
          noStock: '😔 Producto agotado',
          upsellTemplate: 'También te puede interesar: {product}',
          checkoutStart: '¡Genial! Vamos a finalizar tu pedido',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 3,
        },
        checkoutQuestions: [],
      };

      const response = await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(newConfig)
        .expect(200);

      expect(response.body.playbookConfig).toMatchObject(newConfig);
    });
  });

  describe('AC-06: PUT with incomplete config returns 400', () => {
    it('should reject invalid config on PUT', async () => {
      // Config with only industry (missing 4 of 5 required top-level fields)
      const incompleteConfig = {
        industry: 'ropa',
      };

      const response = await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(incompleteConfig)
        .expect(400);

      // Expect error message about missing fields (from validatePlaybookConfig)
      expect(response.body.message).toMatch(/incomplete|Missing fields/);
    });
  });

  describe('AC-07: PATCH /merchants/me/playbook merges partial config', () => {
    it('should merge partial playbook config', async () => {
      // First set a complete config
      const baseConfig = {
        industry: 'ropa',
        llmPrompt: {
          tone: 'Original tone',
          focusAreas: ['Size'],
          commonQuestions: [],
          upsellStrategy: 'Original strategy',
          emojiUsage: 'moderate',
        },
        messages: {
          greeting: 'Original greeting',
          addToCartConfirm: 'Added',
          noStock: 'Out',
          upsellTemplate: 'Try',
          checkoutStart: 'Start',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 3,
        },
        checkoutQuestions: [],
      };

      await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(baseConfig)
        .expect(200);

      // Now merge partial config
      const partialConfig = {
        llmPrompt: {
          tone: 'Updated tone via PATCH',
        },
      };

      const response = await request(app.getHttpServer())
        .patch('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(partialConfig)
        .expect(200);

      // Check that tone was updated but other fields remain
      expect(response.body.playbookConfig.llmPrompt.tone).toBe('Updated tone via PATCH');
      expect(response.body.playbookConfig.llmPrompt.upsellStrategy).toBe('Original strategy');
      expect(response.body.playbookConfig.messages.greeting).toBe('Original greeting');
    });
  });

  describe('AC-08: PATCH with nested llmPrompt updates only tone', () => {
    it('should merge nested llmPrompt fields', async () => {
      // Set base config
      const baseConfig = {
        industry: 'ropa',
        llmPrompt: {
          tone: 'Base tone',
          focusAreas: ['Size', 'Color'],
          commonQuestions: ['Q1', 'Q2'],
          upsellStrategy: 'Base strategy',
          emojiUsage: 'frequent',
        },
        messages: {
          greeting: 'Hello',
          addToCartConfirm: 'Added',
          noStock: 'Out',
          upsellTemplate: 'Try',
          checkoutStart: 'Start',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 5,
        },
        checkoutQuestions: [],
      };

      await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(baseConfig)
        .expect(200);

      // Update only tone
      const response = await request(app.getHttpServer())
        .patch('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ llmPrompt: { tone: 'Only tone updated' } })
        .expect(200);

      expect(response.body.playbookConfig.llmPrompt.tone).toBe('Only tone updated');
      expect(response.body.playbookConfig.llmPrompt.focusAreas).toEqual(['Size', 'Color']);
      expect(response.body.playbookConfig.llmPrompt.emojiUsage).toBe('frequent');
    });
  });

  describe('AC-09: All endpoints protected with SessionAuthGuard', () => {
    it('should protect all endpoints with SessionAuthGuard', async () => {
      await request(app.getHttpServer()).get('/merchants/me').expect(401);

      await request(app.getHttpServer()).patch('/merchants/me').send({ name: 'Test' }).expect(401);

      await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .send({ industry: 'ropa' })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/merchants/me/playbook')
        .send({ llmPrompt: { tone: 'test' } })
        .expect(401);
    });
  });

  describe('AC-10: Validate PlaybookConfig structure', () => {
    it('should validate PlaybookConfig structure', async () => {
      const invalidConfig = {
        industry: 'ropa',
        llmPrompt: {
          focusAreas: 'not-an-array', // Should be array
        },
        messages: {},
        rules: {},
        checkoutQuestions: [],
      };

      const response = await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(invalidConfig)
        .expect(400);

      // Message can be string or array from class-validator
      const message = Array.isArray(response.body.message)
        ? response.body.message.join(' ')
        : response.body.message;
      expect(message).toContain('focusAreas must be an array');
    });
  });

  describe('P1-2: Unknown keys should be stripped (not rejected)', () => {
    it('PATCH /merchants/me with unknown field should return 200 and strip unknown key', async () => {
      const response = await request(app.getHttpServer())
        .patch('/merchants/me')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({ name: 'Valid Name', unknownField: 'should be ignored' })
        .expect(200);

      expect(response.body.name).toBe('Valid Name');
      expect(response.body.unknownField).toBeUndefined();
    });

    it('PUT /merchants/me/playbook with unknown field should return 200 and strip unknown key', async () => {
      const configWithExtra = {
        industry: 'ropa',
        llmPrompt: {
          tone: 'Professional',
          focusAreas: ['Size'],
          commonQuestions: [],
          upsellStrategy: 'Test',
          emojiUsage: 'moderate',
        },
        messages: {
          greeting: 'Hello',
          addToCartConfirm: 'Added',
          noStock: 'Out',
          upsellTemplate: 'Try',
          checkoutStart: 'Start',
        },
        rules: {
          askSizeBeforeCart: true,
          askSkinTypeOnSearch: false,
          autoSubstitutions: false,
          upsellEnabled: true,
          maxRecommendations: 3,
        },
        checkoutQuestions: [],
        unknownTopLevel: 'should be ignored',
      };

      const response = await request(app.getHttpServer())
        .put('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send(configWithExtra)
        .expect(200);

      expect(response.body.playbookConfig.industry).toBe('ropa');
      expect(response.body.playbookConfig.unknownTopLevel).toBeUndefined();

      // Verify in DB
      const merchant = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      const playbookConfig = merchant?.playbookConfig as Record<string, unknown> | null;
      expect(playbookConfig?.['unknownTopLevel']).toBeUndefined();
    });

    it('PATCH /merchants/me/playbook strips unknown top-level field (brief compliance)', async () => {
      const response = await request(app.getHttpServer())
        .patch('/merchants/me/playbook')
        .set('Cookie', [`session_id=${sessionId}`])
        .send({
          llmPrompt: {
            tone: 'Updated tone',
          },
          unknownTopLevel: 'should be stripped',
        })
        .expect(200);

      expect(response.body.playbookConfig.llmPrompt.tone).toBe('Updated tone');
      expect(response.body.playbookConfig.unknownTopLevel).toBeUndefined();

      // Verify in DB that unknown key was not persisted
      const merchant = await prisma.merchant.findUnique({ where: { id: testMerchant.id } });
      const playbookConfig = merchant?.playbookConfig as Record<string, unknown> | null;
      expect(playbookConfig?.['unknownTopLevel']).toBeUndefined();
    });
  });
});
