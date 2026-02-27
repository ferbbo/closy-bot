import { IsOptional, IsArray, IsEnum, IsISO8601, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

/**
 * OrderListQueryDto
 * REQ-04: DTO para filtrar pedidos por status, fecha y orderCode
 * AC-06: Validación correcta con class-validator
 */
export class OrderListQueryDto {
  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((s: string) => s.trim()) : value,
  )
  status?: OrderStatus[];

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  orderCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
