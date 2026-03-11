import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { StorageService } from './storage.service';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

// ─── Mock @aws-sdk/client-s3 ────────────────────────────────────────────────
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

const BASE_CONFIG: Record<string, string> = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET_NAME: 'test-bucket',
  R2_PUBLIC_URL: 'https://pub-test.r2.dev',
};

function createConfigService(overrides: Partial<Record<string, string>> = {}) {
  const config = { ...BASE_CONFIG, ...overrides };
  return { get: jest.fn((key: string) => config[key]) };
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    mockSend.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: createConfigService() },
      ],
    }).compile();
    service = module.get<StorageService>(StorageService);
  });

  // AC-01: upload() submits PutObjectCommand and returns public URL
  describe('AC-01: upload()', () => {
    it('should call PutObjectCommand with correct params and return public URL', async () => {
      mockSend.mockResolvedValueOnce({});
      const buffer = Buffer.from('fake-image-data');
      const url = await service.upload('merchants/abc/products/xyz/1-abc.webp', buffer, 'image/webp');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [cmd] = mockSend.mock.calls[0];
      expect(cmd).toBeInstanceOf(PutObjectCommand);
      expect(url).toBe('https://pub-test.r2.dev/merchants/abc/products/xyz/1-abc.webp');
    });

    it('should throw InternalServerErrorException when S3Client.send fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));
      await expect(
        service.upload('some/key.webp', Buffer.from('data'), 'image/webp'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException when R2 is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          { provide: ConfigService, useValue: createConfigService({ R2_BUCKET_NAME: undefined }) },
        ],
      }).compile();
      const unconfiguredService = module.get<StorageService>(StorageService);
      await expect(
        unconfiguredService.upload('key.webp', Buffer.from('data'), 'image/webp'),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // AC-01: delete() submits DeleteObjectCommand
  describe('AC-01: delete()', () => {
    it('should call DeleteObjectCommand with correct key', async () => {
      mockSend.mockResolvedValueOnce({});
      await service.delete('merchants/abc/products/xyz/1-abc.webp');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [cmd] = mockSend.mock.calls[0];
      expect(cmd).toBeInstanceOf(DeleteObjectCommand);
    });

    it('should throw InternalServerErrorException when S3Client.send fails on delete', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access denied'));
      await expect(service.delete('some/key.webp')).rejects.toThrow(InternalServerErrorException);
    });
  });
});
