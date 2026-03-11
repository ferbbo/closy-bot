import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
  MinLength,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a product variant
 */
export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * DTO for creating a new product
 */
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  categoryName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}

/**
 * DTO for updating a product (partial)
 */
export class UpdateProductDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * DTO for querying product list
 */
export class ProductListQueryDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @IsString()
  @IsOptional()
  cursor?: string;
}

/**
 * Response DTO for bulk import
 */
export interface ImportResponseDto {
  success: boolean;
  created: number;
  updated: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

/**
 * Request DTO for CSV import
 */
export class ImportCsvDto {
  @IsString()
  @IsNotEmpty()
  csv!: string;
}

/**
 * Response DTO for product image upload (PR-18)
 */
export class UploadImageResponseDto {
  imageKey!: string;
  imageUrl!: string;
}
