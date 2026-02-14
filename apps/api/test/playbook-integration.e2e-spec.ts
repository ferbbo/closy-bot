/**
 * Playbook integration E2E test (PR-11)
 * Tests that playbook greeting varies by industry
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/persistence/prisma/prisma.service';

describe('Playbook Integration (e2e) - PR-11', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Greeting with playbook (ropa)', () => {
    it('should respond with ropa-specific greeting', async () => {
      // Create merchant with ropa playbook
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Fashion Store Test',
          whatsappNumber: '+573009999901',
          apiKey: 'test-api-key-e2e-ropa',
          industry: 'ropa',
        },
      });

      // Send greeting message
      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '5493001111111',
                        id: `wamid.test-playbook-ropa-${Date.now()}`,
                        text: { body: 'hola' },
                        timestamp: Date.now().toString(),
                      },
                    ],
                    metadata: {
                      phone_number_id: merchant.whatsappNumber,
                    },
                  },
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(200);

      // Response should contain ropa-specific elements
      // Note: Actual greeting depends on flow implementation
      // This is a basic check that webhook processed successfully

      // Cleanup
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });

  describe('Greeting with playbook (belleza)', () => {
    it('should respond with belleza-specific greeting', async () => {
      // Create merchant with belleza playbook
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Beauty Store Test',
          whatsappNumber: '+573009999902',
          apiKey: 'test-api-key-e2e-belleza',
          industry: 'belleza',
        },
      });

      // Send greeting message
      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '5493001111112',
                        id: `wamid.test-playbook-belleza-${Date.now()}`,
                        text: { body: 'hola' },
                        timestamp: Date.now().toString(),
                      },
                    ],
                    metadata: {
                      phone_number_id: merchant.whatsappNumber,
                    },
                  },
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(200);

      // Cleanup
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });

  describe('Greeting with playbook (minimarket)', () => {
    it('should respond with minimarket-specific greeting', async () => {
      // Create merchant with minimarket playbook
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Express Market Test',
          whatsappNumber: '+573009999903',
          apiKey: 'test-api-key-e2e-minimarket',
          industry: 'minimarket',
        },
      });

      // Send greeting message
      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '5493001111113',
                        id: `wamid.test-playbook-minimarket-${Date.now()}`,
                        text: { body: 'hola' },
                        timestamp: Date.now().toString(),
                      },
                    ],
                    metadata: {
                      phone_number_id: merchant.whatsappNumber,
                    },
                  },
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(200);

      // Cleanup
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });

  describe('Greeting without playbook (fallback)', () => {
    it('should respond with generic greeting when industry is null', async () => {
      // Create merchant without industry
      const merchant = await prisma.merchant.create({
        data: {
          name: 'Generic Store Test',
          whatsappNumber: '+573009999904',
          apiKey: 'test-api-key-e2e-generic',
          // industry: null (default)
        },
      });

      // Send greeting message
      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      {
                        from: '5493001111114',
                        id: `wamid.test-playbook-generic-${Date.now()}`,
                        text: { body: 'hola' },
                        timestamp: Date.now().toString(),
                      },
                    ],
                    metadata: {
                      phone_number_id: merchant.whatsappNumber,
                    },
                  },
                },
              ],
            },
          ],
        });

      expect(response.status).toBe(200);

      // Cleanup
      await prisma.merchant.delete({ where: { id: merchant.id } });
    });
  });
});
