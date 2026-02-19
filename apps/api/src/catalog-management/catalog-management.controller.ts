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
  PayloadTooLargeException,
  Logger,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Merchant } from '@prisma/client';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard';
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
} from './dto/catalog.dto';

/**
 * CatalogManagementController handles merchant catalog operations
 * All endpoints require API key authentication and enforce multi-tenancy
 */
@Controller('api')
@UseGuards(ApiKeyAuthGuard)
export class CatalogManagementController {
  private readonly logger = new Logger(CatalogManagementController.name);

  constructor(
    private readonly importService: ImportService,
    private readonly catalogService: CatalogService,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
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

    // Convert buffer to UTF-8 string
    const csvContent = file.buffer.toString('utf-8');

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
}
