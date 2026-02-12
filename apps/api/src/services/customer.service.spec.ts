import { Test, TestingModule } from '@nestjs/testing';
import { CustomerService } from './customer.service';
import { CustomerRepository } from '../persistence/repositories/customer.repository';
import { Customer, Prisma } from '@prisma/client';

describe('CustomerService', () => {
  let service: CustomerService;
  let repository: jest.Mocked<CustomerRepository>;

  const mockCustomer: Customer = {
    id: 'cust_123',
    phone: '+573001234567',
    name: 'John Doe',
    language: 'es',
    createdAt: new Date('2026-02-12T00:00:00Z'),
    updatedAt: new Date('2026-02-12T00:00:00Z'),
  };

  beforeEach(async () => {
    const mockRepository = {
      findByPhone: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: CustomerRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CustomerService>(CustomerService);
    repository = module.get(CustomerRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveByPhone', () => {
    it('should return existing customer if found', async () => {
      repository.findByPhone.mockResolvedValue(mockCustomer);

      const result = await service.resolveByPhone('+57 300-123-4567');

      expect(result).toEqual(mockCustomer);
      expect(repository.findByPhone).toHaveBeenCalledWith('+573001234567');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should create new customer if not found', async () => {
      repository.findByPhone.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCustomer);

      const result = await service.resolveByPhone('+573001234567', 'John Doe', 'es');

      expect(result).toEqual(mockCustomer);
      expect(repository.findByPhone).toHaveBeenCalledWith('+573001234567');
      expect(repository.create).toHaveBeenCalledWith({
        phone: '+573001234567',
        name: 'John Doe',
        language: 'es',
      });
    });

    it('should normalize phone number before lookup', async () => {
      repository.findByPhone.mockResolvedValue(mockCustomer);

      await service.resolveByPhone('+57 (300) 123-4567');

      expect(repository.findByPhone).toHaveBeenCalledWith('+573001234567');
    });

    it('should create customer with default language if not provided', async () => {
      repository.findByPhone.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockCustomer);

      await service.resolveByPhone('+573001234567');

      expect(repository.create).toHaveBeenCalledWith({
        phone: '+573001234567',
        name: null,
        language: 'es',
      });
    });

    it('should be idempotent (same phone returns same customer)', async () => {
      repository.findByPhone.mockResolvedValue(mockCustomer);

      const result1 = await service.resolveByPhone('+573001234567');
      const result2 = await service.resolveByPhone('+573001234567');

      expect(result1).toEqual(result2);
      expect(repository.findByPhone).toHaveBeenCalledTimes(2);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should handle race condition (P2002) by retrying find', async () => {
      // First find: not found
      repository.findByPhone.mockResolvedValueOnce(null);
      // Create throws P2002 (unique constraint violation)
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`phone`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      repository.create.mockRejectedValueOnce(prismaError);
      // Second find: found (created by concurrent request)
      repository.findByPhone.mockResolvedValueOnce(mockCustomer);

      const result = await service.resolveByPhone('+573001234567');

      expect(result).toEqual(mockCustomer);
      expect(repository.findByPhone).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('should find customer by ID', async () => {
      repository.findById.mockResolvedValue(mockCustomer);

      const result = await service.findById('cust_123');

      expect(result).toEqual(mockCustomer);
      expect(repository.findById).toHaveBeenCalledWith('cust_123');
    });
  });

  describe('updateName', () => {
    it('should update customer name', async () => {
      const updatedCustomer = { ...mockCustomer, name: 'Jane Doe' };
      repository.update.mockResolvedValue(updatedCustomer);

      const result = await service.updateName('cust_123', 'Jane Doe');

      expect(result).toEqual(updatedCustomer);
      expect(repository.update).toHaveBeenCalledWith('cust_123', {
        name: 'Jane Doe',
      });
    });
  });

  describe('updateLanguage', () => {
    it('should update customer language', async () => {
      const updatedCustomer = { ...mockCustomer, language: 'en' };
      repository.update.mockResolvedValue(updatedCustomer);

      const result = await service.updateLanguage('cust_123', 'en');

      expect(result).toEqual(updatedCustomer);
      expect(repository.update).toHaveBeenCalledWith('cust_123', {
        language: 'en',
      });
    });
  });
});
