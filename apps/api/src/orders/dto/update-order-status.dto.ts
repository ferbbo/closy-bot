import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * UpdateOrderStatusDto
 * REQ-04: DTO para cambiar status de orden
 * AC-06: Validación enum con class-validator
 */
export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
