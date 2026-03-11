import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
  Logger,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { Merchant } from '@prisma/client';
import type { ProductVariant } from '@prisma/client';
import { MerchantAuthGuard } from '../common/guards/merchant-auth.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentMerchant } from '../common/decorators/merchant.decorator';
import { ImportService } from '../services/import.service';
import { CatalogService } from '../services/catalog.service';
import {
  ProductRepository,
  ProductWithVariants,
} from '../persistence/repositories/product.repository';
import { CategoryRepository } from '../persistence/repositories/category.repository';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductListQueryDto,
  ImportResponseDto,
  ImportCsvDto,
  UploadImageResponseDto,
} from './dto/catalog.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { StorageService } from '../storage/storage.service';
import { ImageProcessorService } from '../storage/image/image-processor.service';
import { ImageValidatorService } from '../storage/image/image-validator.service';

/**
 * CatalogManagementController handles merchant catalog operations
 * Accepts both session cookie (dashboard) and API key (external integrations)
 */
@Controller('api')
@UseGuards(MerchantAuthGuard)
export class CatalogManagementController {
  private readonly logger = new Logger(CatalogManagementController.name);

  constructor(
    private readonly importService: ImportService,
    private readonly catalogService: CatalogService,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly storageService: StorageService,
    private readonly imageProcessorService: ImageProcessorService,
    private readonly imageValidatorService: ImageValidatorService,
  ) {}

  /**
   * Bulk import products from CSV file (multipart/form-data)
   * POST /api/catalog/import-file
   * Form field: file (CSV)
   * @returns Import statistics and errors
   */
  @Post('catalog/import-file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @CurrentMerchant() merchant: Merchant,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResponseDto> {
    this.logger.log(`File import requested by merchant ${merchant.id}`);

    // Validate file exists
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Validate file extension (case-insensitive)
    const fileExt = file.originalname.toLowerCase().split('.').pop();
    if (fileExt !== 'csv') {
      throw new BadRequestException('Only CSV files are allowed');
    }

    // Validate file size
    const maxSizeMB = parseInt(process.env.CATALOG_IMPORT_MAX_SIZE_MB || '5', 10);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new PayloadTooLargeException(`File size exceeds maximum allowed (${maxSizeMB}MB)`);
    }

    // Validate file is not empty
    if (file.size === 0) {
      throw new BadRequestException('File is empty');
    }

    // Content sniffing: detect binary files disguised as CSV
    this.validateCsvBuffer(file.buffer);

    // Convert buffer to UTF-8 string
    const csvContent = file.buffer.toString('utf-8');

    // Sanitize against CSV formula injection and XSS
    this.validateCsvContent(csvContent);

    // Reuse existing import service
    const result = await this.importService.importFromCSV(merchant.id, csvContent);
    this.logger.log(
      `File import completed for merchant ${merchant.id}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * Bulk import products from CSV (JSON payload)
   * POST /api/catalog/import
   * Body: { csv: "name,description,category,sku,price,stock\n..." }
   * @deprecated Use POST /api/catalog/import-file instead
   * @returns Import statistics and errors
   */
  @Post('catalog/import')
  @HttpCode(HttpStatus.OK)
  async importCsv(
    @CurrentMerchant() merchant: Merchant,
    @Body() dto: ImportCsvDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ImportResponseDto> {
    this.logger.log(`Bulk import requested by merchant ${merchant.id}`);

    // Add deprecation headers
    res.setHeader('Deprecation', 'version="2026-04"');
    res.setHeader('Link', '<https://docs.closy.bot/api/catalog-import-file>; rel="alternate"');

    const result = await this.importService.importFromCSV(merchant.id, dto.csv);
    this.logger.log(
      `Import completed for merchant ${merchant.id}: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
    );

    return result;
  }

  /**
   * List products with optional filters
   * GET /api/products?q=<query>&category=<name>&limit=20
   */
  @Get('products')
  async listProducts(
    @CurrentMerchant() merchant: Merchant,
    @Query() query: ProductListQueryDto,
  ): Promise<{ data: ProductWithVariants[]; total?: number }> {
    this.logger.log(
      `List products for merchant ${merchant.id} with query: ${JSON.stringify(query)}`,
    );

    let products: ProductWithVariants[];

    if (query.q) {
      // Text search
      products = await this.catalogService.searchProducts(merchant.id, query.q, query.limit);
    } else if (query.category) {
      // Filter by category name
      const category = await this.categoryRepository.findByNameAndMerchant(
        query.category,
        merchant.id,
      );
      if (!category) {
        return { data: [], total: 0 };
      }
      products = await this.catalogService.getByCategory(category.id, merchant.id);
      // Apply limit if provided
      if (query.limit) {
        products = products.slice(0, query.limit);
      }
    } else {
      // Get all merchant products
      products = await this.catalogService.getByMerchant(merchant.id);
      // Apply limit if provided
      if (query.limit) {
        products = products.slice(0, query.limit);
      }
    }

    return {
      data: products,
      total: products.length,
    };
  }

  /**
   * Get product by ID
   * GET /api/products/:id
   */
  @Get('products/:id')
  async getProduct(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
  ): Promise<ProductWithVariants> {
    this.logger.log(`Get product ${id} for merchant ${merchant.id}`);

    const product = await this.productRepository.findByIdAndMerchant(id, merchant.id);

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Create a new product with variants
   * POST /api/products
   */
  @Post('products')
  async createProduct(
    @CurrentMerchant() merchant: Merchant,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithVariants> {
    this.logger.log(`Create product for merchant ${merchant.id}: ${dto.name}`);

    // Find or create category
    let category = await this.categoryRepository.findByNameAndMerchant(
      dto.categoryName,
      merchant.id,
    );
    if (!category) {
      this.logger.log(`Creating new category: ${dto.categoryName}`);
      category = await this.categoryRepository.create({
        name: dto.categoryName,
        merchant: { connect: { id: merchant.id } },
      });
    }

    // Create product with variants
    const product = await this.productRepository.create({
      name: dto.name,
      description: dto.description,
      isActive: true,
      category: { connect: { id: category.id } },
      merchant: { connect: { id: merchant.id } },
      variants: {
        create: dto.variants.map((v) => ({
          sku: v.sku,
          name: v.name,
          price: v.price,
          stock: v.stock,
          isActive: v.isActive ?? true,
        })),
      },
    });

    this.logger.log(`Product created: ${product.id}`);
    return product;
  }

  /**
   * Update product
   * PATCH /api/products/:id
   */
  @Patch('products/:id')
  async updateProduct(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithVariants> {
    this.logger.log(`Update product ${id} for merchant ${merchant.id}`);

    // Verify ownership
    const existing = await this.productRepository.findByIdAndMerchant(id, merchant.id);
    if (!existing) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // Update only provided fields
    const product = await this.productRepository.update(id, dto);

    this.logger.log(`Product updated: ${product.id}`);
    return product;
  }

  /**
   * Soft delete product (set isActive to false)
   * DELETE /api/products/:id
   */
  @Delete('products/:id')
  async deleteProduct(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
  ): Promise<{ success: boolean; id: string }> {
    this.logger.log(`Delete product ${id} for merchant ${merchant.id}`);

    // Verify ownership
    const existing = await this.productRepository.findByIdAndMerchant(id, merchant.id);
    if (!existing) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.productRepository.softDelete(id);

    this.logger.log(`Product soft deleted: ${id}`);
    return { success: true, id };
  }

  /**
   * Update product variant (inline edit from dashboard)
   * PATCH /api/product-variants/:id
   * Body: UpdateVariantDto (price, stock, isActive — all optional)
   * Auth: Session Cookie (dashboard) or API Key
   * Ownership: variant → product → merchantId must match authenticated merchant
   */
  @Patch('product-variants/:id')
  async updateVariant(
    @CurrentMerchant() merchant: Merchant,
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<ProductVariant> {
    this.logger.log(`Update variant ${id} for merchant ${merchant.id}`);

    // Ownership check: variant must belong to a product of this merchant
    const variant = await this.productRepository.findVariantByIdWithProduct(id);
    if (!variant || variant.product.merchantId !== merchant.id) {
      throw new NotFoundException(`Product variant with ID ${id} not found`);
    }

    const updated = await this.productRepository.updateVariantById(id, dto);

    this.logger.log(`Variant updated: ${updated.id}`);
    return updated;
  }

  // ─── Product Image Endpoints (PR-18) ────────────────────────────────────────

  /**
   * Upload / replace the primary image for a product.
   * POST /api/products/:productId/image
   *
   * Auth: Session Cookie only (dashboard — not API key).
   * Body: multipart/form-data, field name "image" (JPEG / PNG / WebP, ≤5 MB).
   * Response: { imageKey, imageUrl }
   *
   * Security notes:
   *  - @UseGuards(SessionAuthGuard) is listed BEFORE @UseInterceptors(FileInterceptor)
   *    to make the guard order explicit (guards always execute before interceptors
   *    in the NestJS lifecycle regardless of decorator order).
   *  - Magic bytes validation prevents MIME-type spoofing (OWASP A03).
   *  - Ownership check prevents cross-merchant access (OWASP A01).
   */
  @Post('products/:productId/image')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async uploadProductImage(
    @CurrentMerchant() merchant: Merchant,
    @Param('productId') productId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadImageResponseDto> {
    if (!file) {
      throw new BadRequestException('Image file is required (field name: image)');
    }

    // Ownership check (OWASP A01)
    const product = await this.productRepository.findById(productId);
    if (!product || product.merchantId !== merchant.id) {
      throw new ForbiddenException('Product not found or access denied');
    }

    // Validate MIME + magic bytes + size (OWASP A03)
    this.imageValidatorService.validateImageFile(file.buffer, file.mimetype, file.size);

    // Process: resize ≤1200px width, convert to WebP quality 80
    const webpBuffer = await this.imageProcessorService.processProductImage(file.buffer);

    // If product already has an image, delete the old one first (no accumulation)
    if (product.imageKey) {
      this.logger.debug(`Deleting previous image: ${product.imageKey}`);
      await this.storageService.delete(product.imageKey);
    }

    // Build R2 key: {merchantId}/products/{productId}/{timestamp}-{hash}.webp
    const hash = randomBytes(6).toString('hex');
    const key = `${merchant.id}/products/${productId}/${Date.now()}-${hash}.webp`;

    // Upload to R2
    const imageUrl = await this.storageService.upload(key, webpBuffer, 'image/webp');

    // Persist key + url to DB
    await this.productRepository.update(productId, { imageKey: key, imageUrl });

    this.logger.log(`Product image uploaded: productId=${productId}`);

    return { imageKey: key, imageUrl };
  }

  /**
   * Delete the primary image for a product.
   * DELETE /api/products/:productId/image
   *
   * Auth: Session Cookie only (dashboard).
   * Response: 204 No Content (silent if no image was set).
   */
  @Delete('products/:productId/image')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProductImage(
    @CurrentMerchant() merchant: Merchant,
    @Param('productId') productId: string,
  ): Promise<void> {
    // Ownership check (OWASP A01)
    const product = await this.productRepository.findById(productId);
    if (!product || product.merchantId !== merchant.id) {
      throw new ForbiddenException('Product not found or access denied');
    }

    // Silent 204 if no image: REQ-05 edge case
    if (!product.imageKey) {
      return;
    }

    // Delete from R2
    await this.storageService.delete(product.imageKey);

    // Clear fields in DB
    await this.productRepository.update(productId, { imageKey: null, imageUrl: null });

    this.logger.log(`Product image deleted: productId=${productId}`);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Content sniffing: inspect the first 512 bytes of the buffer to detect
   * binary files (executables, archives, images…) disguised with a .csv name.
   *
   * Checks:
   *  1. Null bytes → any binary format
   *  2. Known magic-byte signatures for common binary formats
   *  3. JSON structure (text-based, no magic bytes — detected via first non-whitespace char)
   */
  private validateCsvBuffer(buffer: Buffer): void {
    const sample = buffer.slice(0, 512);

    // 1. Null bytes → binary content
    if (sample.includes(0x00)) {
      throw new BadRequestException(
        'File does not appear to be a valid CSV (binary content detected).',
      );
    }

    // 2. Magic-byte signatures
    const isExeOrDll = sample[0] === 0x4d && sample[1] === 0x5a; // MZ  → EXE/DLL
    const isZip =
      sample[0] === 0x50 && sample[1] === 0x4b && sample[2] === 0x03 && sample[3] === 0x04; // PK  → ZIP/DOCX/XLSX
    const isPdf =
      sample[0] === 0x25 && sample[1] === 0x50 && sample[2] === 0x44 && sample[3] === 0x46; // %PDF
    const isPng =
      sample[0] === 0x89 && sample[1] === 0x50 && sample[2] === 0x4e && sample[3] === 0x47; // PNG
    const isJpeg = sample[0] === 0xff && sample[1] === 0xd8 && sample[2] === 0xff; // JPEG
    const isElf =
      sample[0] === 0x7f && sample[1] === 0x45 && sample[2] === 0x4c && sample[3] === 0x46; // ELF
    const isGif = sample[0] === 0x47 && sample[1] === 0x49 && sample[2] === 0x46; // GIF
    const isBmp = sample[0] === 0x42 && sample[1] === 0x4d; // BMP

    if (isExeOrDll || isZip || isPdf || isPng || isJpeg || isElf || isGif || isBmp) {
      throw new BadRequestException(
        'File does not appear to be a valid CSV (binary format detected).',
      );
    }

    // 3. JSON detection — text-based, no magic bytes.
    // Find first non-whitespace byte and check for { (0x7B) or [ (0x5B).
    // A valid CSV header can never start with these characters.
    const firstSignificant = sample.find(
      (b) => b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d,
    );
    if (firstSignificant === 0x7b || firstSignificant === 0x5b) {
      throw new BadRequestException(
        'File does not appear to be a valid CSV (JSON format detected).',
      );
    }
  }

  /**
   * Sanitize CSV text content against:
   *
   * 1. **CSV / Formula injection** — cells that start with =, +, -, @, \t, \r
   *    can trigger formula execution when the file is opened in a spreadsheet.
   *    We reject the upload if any cell value begins with these characters.
   *
   * 2. **XSS patterns** — HTML/script tags embedded in CSV values that could
   *    be reflected back in a browser-rendered report.
   */
  private validateCsvContent(csvContent: string): void {
    const formulaInjectionPattern = /(?:^|,)([ \t]*)([=+\-@\t\r])/m;
    if (formulaInjectionPattern.test(csvContent)) {
      throw new BadRequestException(
        'CSV contains potentially dangerous content (formula injection attempt detected).',
      );
    }

    const xssPattern =
      /<\s*(script|img|svg|iframe|object|embed|link|style|base|form|input|button|a)[^>]*>/i;
    if (xssPattern.test(csvContent)) {
      throw new BadRequestException(
        'CSV contains potentially dangerous content (HTML/script tags detected).',
      );
    }
  }
}
