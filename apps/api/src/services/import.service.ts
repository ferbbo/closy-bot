import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CategoryRepository } from '../persistence/repositories/category.repository';
import {
  ProductRepository,
  ProductWithVariants,
} from '../persistence/repositories/product.repository';

/**
 * CSV row structure for product import
 */
export interface ProductCsvRow {
  name: string;
  description?: string;
  category: string;
  sku: string; // Required for idempotency
  price: string;
  stock: string;
}

/**
 * Result of import operation
 */
export interface ImportResult {
  success: boolean;
  created: number;
  updated: number;
  errors: ImportError[];
}

/**
 * Error during import
 */
export interface ImportError {
  row: number;
  field?: string;
  message: string;
}

/**
 * ImportService handles CSV product import with validation
 * Implements idempotency via SKU upsert
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly BATCH_SIZE = 500;

  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  /**
   * Import products from CSV content
   * @param merchantId - Merchant ID
   * @param csvContent - Raw CSV content
   * @returns Import result with stats and errors
   */
  async importFromCSV(merchantId: string, csvContent: string): Promise<ImportResult> {
    this.logger.log(`Starting CSV import for merchant ${merchantId}`);

    const result: ImportResult = {
      success: true,
      created: 0,
      updated: 0,
      errors: [],
    };

    try {
      
      const rows = this.parseCSV(csvContent);
      this.logger.log(`Parsed ${rows.length} rows from CSV`);

      if (rows.length === 0) {
        throw new BadRequestException('CSV file is empty');
      }

      // Process in batches
      const batches = this.chunkArray(rows, this.BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const baseRowNumber = batchIndex * this.BATCH_SIZE + 2; // +2 for header + 1-indexed

        await this.processBatch(merchantId, batch, baseRowNumber, result);
      }

      result.success = result.errors.length === 0;
      this.logger.log(
        `Import completed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
      );
    } catch (error) {
      this.logger.error('Import failed:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Import failed');
    }

    return result;
  }

  /**
   * Normalize a CSV column header to its canonical English key.
   * Accepts Spanish aliases so merchants can upload files in Spanish.
   *
   * Canonical → accepted aliases
   *   name        → nombre
   *   description → descripcion, descripción
   *   category    → categoria, categoría
   *   price       → precio
   *   stock       → stock (unchanged)
   *   sku         → sku   (unchanged)
   */
  private normalizeHeader(raw: string): string {
    const normalized = raw
      .toLowerCase()
      .normalize('NFD')                // decompose accents (á → a + ́)
      .replace(/[\u0300-\u036f]/g, '') // strip combining marks
      .trim();

    const ALIASES: Record<string, string> = {
      nombre:      'name',
      descripcion: 'description',
      categoria:   'category',
      precio:      'price',
      // stock / sku are identical in both languages — no alias needed
    };

    return ALIASES[normalized] ?? normalized;
  }

  /**
   * Parse CSV content into rows.
   * Simple parser - assumes comma-separated, no quotes handling for MVP.
   * Supports both English and Spanish column headers.
   */
  private parseCSV(csvContent: string): ProductCsvRow[] {
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
      throw new BadRequestException('CSV must have header and at least one row');
    }

    const header = lines[0]
      .split(',')
      .map((h) => this.normalizeHeader(h));
    const requiredFields = ['name', 'category', 'price', 'stock'];

    // Validate header
    for (const field of requiredFields) {
      if (!header.includes(field)) {
        throw new BadRequestException(`Missing required column: ${field}`);
      }
    }

    const rows: ProductCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};

      for (let j = 0; j < header.length; j++) {
        row[header[j]] = values[j] || '';
      }

      rows.push(row as unknown as ProductCsvRow);
    }

    return rows;
  }

  /**
   * Process a batch of rows
   */
  private async processBatch(
    merchantId: string,
    batch: ProductCsvRow[],
    baseRowNumber: number,
    result: ImportResult,
  ): Promise<void> {
    // Load all products once for the batch to avoid N+1
    const existingProducts = await this.productRepository.findByMerchant(merchantId);
    const productCache = new Map<string, (typeof existingProducts)[0]>();
    for (const p of existingProducts) {
      const key = `${p.name}:${p.categoryId}`;
      productCache.set(key, p);
    }

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const rowNumber = baseRowNumber + i;

      try {
        // Validate row
        const validation = this.validateRow(row);
        if (!validation.valid) {
          result.errors.push({
            row: rowNumber,
            field: validation.field,
            message: validation.message!,
          });
          continue;
        }

        // Process row (upsert)
        const isUpdate = await this.processRow(merchantId, row, productCache);
        if (isUpdate) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch (error) {
        this.logger.error(`Error processing row ${rowNumber}:`, error);
        result.errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Validate a CSV row
   */
  private validateRow(row: ProductCsvRow): { valid: boolean; field?: string; message?: string } {
    if (!row.name || row.name.trim().length === 0) {
      return { valid: false, field: 'name', message: 'Name is required' };
    }

    if (!row.category || row.category.trim().length === 0) {
      return {
        valid: false,
        field: 'category',
        message: 'Category is required',
      };
    }

    const price = parseFloat(row.price);
    if (isNaN(price) || price <= 0) {
      return {
        valid: false,
        field: 'price',
        message: 'Price must be a positive number',
      };
    }

    const stock = parseInt(row.stock, 10);
    if (isNaN(stock) || stock < 0) {
      return {
        valid: false,
        field: 'stock',
        message: 'Stock must be a non-negative integer',
      };
    }

    if (!row.sku || row.sku.trim().length === 0) {
      return {
        valid: false,
        field: 'sku',
        message: 'SKU is required for idempotency',
      };
    }

    return { valid: true };
  }

  /**
   * Process a single row (create/update product and variant)
   * @returns true if updated, false if created
   */
  private async processRow(
    merchantId: string,
    row: ProductCsvRow,
    productCache: Map<string, ProductWithVariants>,
  ): Promise<boolean> {
    const categoryName = row.category.trim();
    const productName = row.name.trim();
    const sku = row.sku.trim();
    const price = new Decimal(row.price);
    const stock = parseInt(row.stock, 10);
    const description = row.description?.trim() || null;

    // Find or create category
    let category = await this.categoryRepository.findByNameAndMerchant(categoryName, merchantId);

    if (!category) {
      category = await this.categoryRepository.create({
        name: categoryName,
        merchant: { connect: { id: merchantId } },
      });
      this.logger.debug(`Created category: ${categoryName}`);
    }

    // Check if product exists in cache
    const cacheKey = `${productName}:${category.id}`;
    let product = productCache.get(cacheKey);

    let isUpdate = false;

    if (!product) {
      // Create new product with variant
      product = await this.productRepository.create({
        name: productName,
        description,
        category: { connect: { id: category.id } },
        merchant: { connect: { id: merchantId } },
        isActive: true,
        variants: {
          create: [
            {
              sku,
              name: 'Default', // Default variant name
              price,
              stock,
              isActive: true,
            },
          ],
        },
      });
      // Update cache
      productCache.set(cacheKey, product);
      this.logger.debug(`Created product: ${productName}`);
    } else {
      // Update existing product and upsert variant
      if (description && product.description !== description) {
        await this.productRepository.update(product.id, { description });
      }

      // Upsert variant by SKU
      const existingVariant = await this.productRepository.findVariantBySku(product.id, sku);
      isUpdate = !!existingVariant;

      await this.productRepository.upsertVariant(product.id, sku, {
        product: { connect: { id: product.id } },
        sku,
        name: 'Default',
        price,
        stock,
        isActive: true,
      });

      this.logger.debug(`${isUpdate ? 'Updated' : 'Created'} variant for product: ${productName}`);
    }

    return isUpdate;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
