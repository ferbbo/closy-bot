import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionService } from '../session/session.service';

describe('SessionAuthGuard (AC-13)', () => {
  let guard: SessionAuthGuard;
  let sessionService: SessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionAuthGuard,
        {
          provide: SessionService,
          useValue: {
            validate: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SessionAuthGuard>(SessionAuthGuard);
    sessionService = module.get<SessionService>(SessionService);
  });

  describe('AC-13: rejects request without cookie or with expired session', () => {
    it('should throw UnauthorizedException if no cookie', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            cookies: {},
          }),
        }),
      } as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if session invalid', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            cookies: { session_id: 'invalid-session' },
          }),
        }),
      } as ExecutionContext;

      jest.spyOn(sessionService, 'validate').mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow request if session valid', async () => {
      const mockMerchant = {
        id: 'merchant-1',
        name: 'Test',
        whatsappNumber: 'test@example.com',
        apiKey: 'key',
        industry: null,
        playbookConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRequest = { cookies: { session_id: 'valid-session' } };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      jest.spyOn(sessionService, 'validate').mockResolvedValue(mockMerchant);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      // Verify merchant was attached to request
      expect((mockRequest as unknown as { merchant: unknown }).merchant).toBe(mockMerchant);
    });
  });
});
