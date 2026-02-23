import { Test, TestingModule } from '@nestjs/testing';
import { CartRepository } from './cart.repository';
import { PrismaService } from '../prisma/prisma.service';
import { CartStatus } from '@prisma/client';

/**
 * CartRepository Unit Tests
 * PR-04: Tests for cart persistence layer
 */
describe('CartRepository', () => {
  let repository: CartRepository;
  let prismaService: jest.Mocked<PrismaService>;

  const mockCart = {
    id: 'cart-1',
    customerId: 'customer-1',
    merchantId: 'merchant-1',
    status: CartStatus.active,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartRepository,
        {
          provide: PrismaService,
          useValue: {
            cart: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    repository = module.get<CartRepository>(CartRepository);
    prismaService = module.get(PrismaService);
  });

  describe('AC-03: findActiveCart (findActiveByCustomerAndMerchant)', () => {
    it('should return active cart for customer and merchant', async () => {
      prismaService.cart.findFirst.mockResolvedValue(mockCart);

      const result = await repository.findActiveCart('customer-1', 'merchant-1');

      expect(result).toEqual(mockCart);
      expect(prismaService.cart.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'customer-1',
          merchantId: 'merchant-1',
          status: CartStatus.active,
          expiresAt: {
            gt: expect.any(Date),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should return null when no active cart exists', async () => {
      prismaService.cart.findFirst.mockResolvedValue(null);

      const result = await repository.findActiveCart('customer-1', 'merchant-1');

      expect(result).toBeNull();
      expect(prismaService.cart.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'customer-1',
            merchantId: 'merchant-1',
            status: CartStatus.active,
          }),
        }),
      );
    });

    it('should filter out expired carts even if status is active', async () => {
      // Cart with status=active but expiresAt in the past should not be returned
      prismaService.cart.findFirst.mockResolvedValue(null);

      await repository.findActiveCart('customer-1', 'merchant-1');

      expect(prismaService.cart.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expiresAt: {
              gt: expect.any(Date), // Only future dates
            },
          }),
        }),
      );
    });
  });

  describe('findByIdWithItems', () => {
    it('should return cart with items', async () => {
      const mockCartWithItems = {
        ...mockCart,
        items: [],
      };

      prismaService.cart.findUnique.mockResolvedValue(mockCartWithItems);

      const result = await repository.findByIdWithItems('cart-1');

      expect(result).toEqual(mockCartWithItems);
      expect(prismaService.cart.findUnique).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        include: expect.objectContaining({
          items: expect.any(Object),
        }),
      });
    });
  });

  describe('create', () => {
    it('should create new cart', async () => {
      prismaService.cart.create.mockResolvedValue(mockCart);

      const result = await repository.create({
        customer: { connect: { id: 'customer-1' } },
        merchant: { connect: { id: 'merchant-1' } },
        status: CartStatus.active,
        expiresAt: mockCart.expiresAt,
      });

      expect(result).toEqual(mockCart);
      expect(prismaService.cart.create).toHaveBeenCalled();
    });
  });

  describe('AC-13: refreshTTL', () => {
    it('should update expiresAt', async () => {
      const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      prismaService.cart.update.mockResolvedValue({
        ...mockCart,
        expiresAt: newExpiresAt,
      });

      const result = await repository.refreshTTL('cart-1', newExpiresAt);

      expect(result.expiresAt).toEqual(newExpiresAt);
      expect(prismaService.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-1' },
        data: { expiresAt: newExpiresAt },
      });
    });
  });
});
