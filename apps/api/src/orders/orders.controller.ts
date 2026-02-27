import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { OrdersService } from './orders.service';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  OrderListResponseDto,
  OrderDetailResponseDto,
  UpdateOrderStatusResponseDto,
} from './dto/order-response.dto';

/**
 * OrdersController
 * REQ-01..03, REQ-05..06
 * Endpoints REST para gestión de órdenes desde el dashboard.
 * Auth: Session Cookie (consistente con MerchantSettingsController)
 * Multi-tenancy: todas las queries filtradas por req.merchant.id
 *
 * cURL examples en BACKEND-EXECUTION-GUIDE.md
 */
@Controller('orders')
@UseGuards(SessionAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
  }),
)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * GET /orders
   * Lista paginada de órdenes del merchant con filtros opcionales
   * REQ-01, AC-01, AC-02, AC-07
   *
   * cURL:
   * curl -X GET "http://localhost:3000/orders?status=pending_payment,confirmed&limit=20" \
   *   -H "Cookie: session_id=<session_id>"
   */
  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: OrderListQueryDto,
  ): Promise<OrderListResponseDto> {
    this.logger.log(`GET /orders - merchant: ${req.merchant.id} filters: ${JSON.stringify(query)}`);
    return this.ordersService.findAll(req.merchant.id, query);
  }

  /**
   * GET /orders/pending-count
   * Contador de órdenes pendientes para sidebar badge
   * REQ-14, AC-18
   *
   * cURL:
   * curl -X GET "http://localhost:3000/orders/pending-count" \
   *   -H "Cookie: session_id=<session_id>"
   */
  @Get('pending-count')
  async pendingCount(@Req() req: AuthenticatedRequest): Promise<{ count: number }> {
    const count = await this.ordersService.countPending(req.merchant.id);
    return { count };
  }

  /**
   * GET /orders/:id
   * Detalle completo de una orden con items
   * REQ-02, AC-03, AC-08
   *
   * cURL:
   * curl -X GET "http://localhost:3000/orders/clxx123abc" \
   *   -H "Cookie: session_id=<session_id>"
   */
  @Get(':id')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<OrderDetailResponseDto> {
    this.logger.log(`GET /orders/${id} - merchant: ${req.merchant.id}`);
    return this.ordersService.findOne(id, req.merchant.id);
  }

  /**
   * PATCH /orders/:id/status
   * Cambiar status de orden con validación FSM
   * REQ-03, AC-04, AC-05, AC-08
   *
   * cURL:
   * curl -X PATCH "http://localhost:3000/orders/clxx123abc/status" \
   *   -H "Cookie: session_id=<session_id>" \
   *   -H "Content-Type: application/json" \
   *   -d '{"status": "confirmed"}'
   */
  @Patch(':id/status')
  async updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<UpdateOrderStatusResponseDto> {
    this.logger.log(
      `PATCH /orders/${id}/status - merchant: ${req.merchant.id} newStatus: ${dto.status}`,
    );
    return this.ordersService.updateStatus(id, req.merchant.id, dto.status);
  }
}
