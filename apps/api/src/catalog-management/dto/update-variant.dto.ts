import { IsNumber, IsInt, IsBoolean, IsOptional, Min } from 'class-validator';

/**
 * DTO for updating a product variant (partial update)
 * Used by PATCH /api/product-variants/:id (PR-FE-04.1)
 * All fields are optional — only provided fields are updated.
 */
export class UpdateVariantDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
