import { ImageValidatorService } from './image-validator.service';
import { BadRequestException } from '@nestjs/common';

describe('ImageValidatorService', () => {
  let service: ImageValidatorService;

  beforeEach(() => {
    service = new ImageValidatorService();
  });

  // ─── Helpers to build minimal valid magic-byte headers ──────────────────────

  function makeJpegBuffer(size = 100): Buffer {
    const buf = Buffer.alloc(size);
    buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff; buf[3] = 0xe0;
    return buf;
  }

  function makePngBuffer(size = 100): Buffer {
    const buf = Buffer.alloc(size);
    buf[0] = 0x89; buf[1] = 0x50; buf[2] = 0x4e; buf[3] = 0x47; // PNG
    buf[4] = 0x0d; buf[5] = 0x0a; buf[6] = 0x1a; buf[7] = 0x0a; // CRLF
    return buf;
  }

  function makeWebpBuffer(size = 100): Buffer {
    const buf = Buffer.alloc(size);
    buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46; // RIFF
    // bytes 4-7: file size (not checked)
    buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50; // WEBP
    return buf;
  }

  function makeExeBufferAsJpeg(size = 100): Buffer {
    // MZ header (EXE) but with image/jpeg MIME claim
    const buf = Buffer.alloc(size);
    buf[0] = 0x4d; buf[1] = 0x5a; // MZ
    return buf;
  }

  // AC-03: valid images are accepted
  describe('AC-03: accepts valid image types', () => {
    it('should accept a valid JPEG buffer', () => {
      expect(() =>
        service.validateImageFile(makeJpegBuffer(), 'image/jpeg', 100),
      ).not.toThrow();
    });

    it('should accept a valid PNG buffer', () => {
      expect(() =>
        service.validateImageFile(makePngBuffer(), 'image/png', 100),
      ).not.toThrow();
    });

    it('should accept a valid WebP buffer', () => {
      expect(() =>
        service.validateImageFile(makeWebpBuffer(), 'image/webp', 100),
      ).not.toThrow();
    });
  });

  // AC-04: magic bytes check rejects spoofed files
  describe('AC-04: rejects EXE disguised as JPG (magic bytes)', () => {
    it('should throw BadRequestException for EXE file with image/jpeg MIME', () => {
      expect(() =>
        service.validateImageFile(makeExeBufferAsJpeg(), 'image/jpeg', 100),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for PNG buffer declared as image/jpeg', () => {
      expect(() =>
        service.validateImageFile(makePngBuffer(), 'image/jpeg', 100),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for JPEG buffer declared as image/png', () => {
      expect(() =>
        service.validateImageFile(makeJpegBuffer(), 'image/png', 100),
      ).toThrow(BadRequestException);
    });
  });

  // Size and MIME rejections
  describe('rejects files that violate size or MIME rules', () => {
    it('should throw BadRequestException for file exceeding 5 MB', () => {
      const oversizedBuffer = Buffer.alloc(12); // Actual size doesn't matter — we check reported size
      expect(() =>
        service.validateImageFile(oversizedBuffer, 'image/jpeg', 6 * 1024 * 1024),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for unsupported MIME type (PDF)', () => {
      const fakePdf = Buffer.alloc(12);
      fakePdf[0] = 0x25; fakePdf[1] = 0x50; fakePdf[2] = 0x44; fakePdf[3] = 0x46; // %PDF
      expect(() =>
        service.validateImageFile(fakePdf, 'application/pdf', 100),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for SVG (text-based, no magic bytes but MIME rejected)', () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      expect(() =>
        service.validateImageFile(svgBuf, 'image/svg+xml', svgBuf.length),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for buffer too small to check magic bytes', () => {
      const tiny = Buffer.alloc(5);
      expect(() =>
        service.validateImageFile(tiny, 'image/jpeg', 5),
      ).toThrow(BadRequestException);
    });
  });
});
