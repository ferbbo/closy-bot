import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ImageProcessorService } from './image-processor.service';

// ─── Mock sharp using jest.mock factory (hoisted — cannot reference external vars) ──
// Use module-level references resolved via jest.mocks map
const mockToBuffer = jest.fn();
const mockWebp = jest.fn(() => ({ toBuffer: mockToBuffer }));
const mockResize = jest.fn(() => ({ webp: mockWebp }));
const mockSharpFn = jest.fn(() => ({ resize: mockResize }));

jest.mock('sharp', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSharpFn(...args),
}));

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImageProcessorService],
    }).compile();
    service = module.get<ImageProcessorService>(ImageProcessorService);
  });

  // AC-02: processProductImage converts buffer to WebP with correct options
  describe('AC-02: processProductImage()', () => {
    it('should call sharp with resize(1200, withoutEnlargement) and webp(quality 80)', async () => {
      const outputBuffer = Buffer.from('webp-output');
      mockToBuffer.mockResolvedValueOnce(outputBuffer);

      const input = Buffer.from('fake-jpeg-data');
      const result = await service.processProductImage(input);

      expect(mockSharpFn).toHaveBeenCalledWith(input);
      expect(mockResize).toHaveBeenCalledWith({ width: 1200, withoutEnlargement: true });
      expect(mockWebp).toHaveBeenCalledWith({ quality: 80 });
      expect(mockToBuffer).toHaveBeenCalledTimes(1);
      expect(result).toBe(outputBuffer);
    });

    it('should throw InternalServerErrorException when sharp processing fails', async () => {
      mockToBuffer.mockRejectedValueOnce(new Error('Corrupt image data'));
      await expect(
        service.processProductImage(Buffer.from('bad-data')),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
