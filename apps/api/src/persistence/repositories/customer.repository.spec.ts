import { Test, TestingModule } from '@nestjs/testing';
import { CustomerRepository } from './customer.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Customer } from '@prisma/client';

describe('CustomerRepository', () => {
  let repository: CustomerRepository;
  let prisma: jest.Mocked<PrismaService>;

  const mockCustomer: Customer = {
    id: 'cust_123',
    phone: '+573001234567',
    name: 'John Doe',
    language: 'es',
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockPrisma = {
      customer: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerRepository,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    repository = module.get<CustomerRepository>(CustomerRepository);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('create', () => {
    it('should create a new customer', async () => {
      prisma.customer.create.mockResolvedValue(mockCustomer);

      const result = await repository.create({
        phone: '+573001234567',
        name: 'John Doe',
        language: 'es',
      });

      expect(result).toEqual(mockCustomer);
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          phone: '+573001234567',
          name: 'John Doe',
          language: 'es',
        },
      });
    });

    it('should throw error on duplicate phone', async () => {
      const duplicateError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prisma.customer.create.mockRejectedValue(duplicateError);

      await expect(
        repository.create({
          phone: '+573001234567',
          name: 'John Doe',
        }),
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('findByPhone', () => {
    it('should find customer by phone', async () => {
      prisma.customer.findUnique.mockResolvedValue(mockCustomer);

      const result = await repository.findByPhone('+573001234567');

      expect(result).toEqual(mockCustomer);
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { phone: '+573001234567' },
      });
    });

    it('should return null if customer not found', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      const result = await repository.findByPhone('+999999999');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find customer by ID', async () => {
      prisma.customer.findUnique.mockResolvedValue(mockCustomer);

      const result = await repository.findById('cust_123');

      expect(result).toEqual(mockCustomer);
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { id: 'cust_123' },
      });
    });
  });

  describe('update', () => {
    it('should update customer data', async () => {
      const updatedCustomer = { ...mockCustomer, name: 'Jane Doe' };
      prisma.customer.update.mockResolvedValue(updatedCustomer);

      const result = await repository.update('cust_123', { name: 'Jane Doe' });

      expect(result).toEqual(updatedCustomer);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust_123' },
        data: { name: 'Jane Doe' },
      });
    });
  });
});
