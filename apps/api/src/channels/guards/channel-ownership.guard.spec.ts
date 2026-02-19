import { Test, TestingModule } from '@nestjs/testing';
import { ChannelOwnershipGuard } from './channel-ownership.guard';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { ExecutionContext, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';

/**
 * Unit tests for ChannelOwnershipGuard
 * AC-12: Ownership check
 */
describe('ChannelOwnershipGuard', () => {
  let guard: ChannelOwnershipGuard;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelOwnershipGuard,
        {
          provide: PrismaService,
          useValue: {
            channel: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    guard = module.get<ChannelOwnershipGuard>(ChannelOwnershipGuard);
    prisma = module.get<PrismaService>(PrismaService);
  });

  const createMockContext = (channelId: string, merchantId: string): ExecutionContext => {
    const mockRequest = {
      params: { id: channelId },
      merchant: { id: merchantId },
    } as AuthenticatedRequest;

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;
  };

  it('should allow access when merchant owns the channel', async () => {
    jest.spyOn(prisma.channel, 'findUnique').mockResolvedValue({
      id: 'ch_123',
      merchantId: 'merch_123',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const context = createMockContext('ch_123', 'merch_123');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('AC-12: should deny access when merchant does not own the channel', async () => {
    jest.spyOn(prisma.channel, 'findUnique').mockResolvedValue({
      id: 'ch_123',
      merchantId: 'merch_999', // Different merchant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const context = createMockContext('ch_123', 'merch_123');

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when channel does not exist', async () => {
    jest.spyOn(prisma.channel, 'findUnique').mockResolvedValue(null);

    const context = createMockContext('ch_999', 'merch_123');

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });
});
