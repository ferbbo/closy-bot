import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from '../../services/payment.service';
import { MerchantRepository } from '../../persistence/repositories/merchant.repository';
import type {
  PaymentWebhookPayload,
  WebhookResponseDto,
} from '../../domain/entities/payment.entity';

/**
 * PaymentWebhookController
 * PR-06: Payments — REQ-04, REQ-05, AC-04, AC-05, AC-08
 *
 * POST /webhooks/payments — receives payment confirmations from external gateways.
 *
 * Auth:
 *   - Merchant identified by `X-Merchant-Api-Key` header (consistent with catalog API)
 *   - Signature validated via HMAC SHA-256 (header configurable via PAYMENT_WEBHOOK_HEADER)
 *
 * Idempotency:
 *   - DB-level unique constraint on paymentIntentId (AC-08)
 *   - Duplicate webhook → 200 OK with message "Payment already processed"
 *
 * Consumer-first (AC-04):
 *   - Testable with cURL + HMAC signature (see BACKEND-EXECUTION-GUIDE.md Flujo 7)
 *   - JSON response with success + payment_id + order_code + status
 */
@Controller('webhooks/payments')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);
  private readonly webhookSecret: string;
  private readonly webhookHeader: string;

  constructor(
    private readonly paymentService: PaymentService,
    private readonly merchantRepository: MerchantRepository,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    this.webhookHeader = this.configService
      .get<string>('PAYMENT_WEBHOOK_HEADER', 'X-Payment-Signature')
      .toLowerCase();

    if (!this.webhookSecret) {
      this.logger.warn(
        'PAYMENT_WEBHOOK_SECRET not set. Signature validation will be skipped (dev mode).',
      );
    }
  }

  /**
   * POST /webhooks/payments
   *
   * AC-04: Accept JSON webhook payload from payment gateway
   * AC-05: Validate HMAC SHA-256 signature → 401 if invalid
   * AC-08: Idempotent — duplicate paymentIntentId → 200 OK "already processed"
   * AC-13: Order already paid → 200 OK graceful
   * REQ-10: Order not found → 404
   *
   * @example cURL (see BACKEND-EXECUTION-GUIDE.md Flujo 7)
   * ```
   * BODY='{"payment_intent_id":"pi_abc","order_code":"ORD-001","amount":120000,"status":"approved","method":"transfer","timestamp":"2026-02-24T10:00:00Z"}'
   * SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "your-secret" | awk '{print "sha256="$2}')
   * curl -X POST http://localhost:3000/webhooks/payments \
   *   -H "Content-Type: application/json" \
   *   -H "X-Merchant-Api-Key: <api-key>" \
   *   -H "X-Payment-Signature: $SIG" \
   *   -d "$BODY"
   * ```
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receivePaymentWebhook(
    @Body() body: PaymentWebhookPayload,
    @Headers('x-merchant-api-key') merchantApiKey: string,
    @Headers() allHeaders: Record<string, string>,
  ): Promise<WebhookResponseDto> {
    this.logger.log(`Payment webhook received: paymentIntentId=${body?.payment_intent_id}`);

    // AC-05: Validate signature (if secret is configured)
    if (this.webhookSecret) {
      const signature = allHeaders[this.webhookHeader];
      if (!this.validateSignature(body, signature)) {
        this.logger.warn('Payment webhook signature validation failed');
        throw new UnauthorizedException('Invalid signature');
      }
    }

    // Resolve merchant by API key (consistent with catalog mgmt auth)
    if (!merchantApiKey) {
      throw new UnauthorizedException('Missing X-Merchant-Api-Key header');
    }

    const merchant = await this.merchantRepository.findByApiKey(merchantApiKey);
    if (!merchant) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Validate required fields
    if (!body?.payment_intent_id || !body?.order_code || !body?.status) {
      const err = new NotFoundException('Missing required webhook fields');
      this.logger.warn(`Invalid webhook payload: ${JSON.stringify(body)}`);
      throw err;
    }

    try {
      const result = await this.paymentService.processWebhook(body, merchant.id);
      return result;
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        throw err;
      }
      this.logger.error(`Payment webhook processing error: ${(err as Error).message}`, err);
      throw err;
    }
  }

  /**
   * AC-05: Validate HMAC SHA-256 signature
   * Expected format: "sha256=<hex-digest>"
   *
   * @param payload  raw parsed JSON body (re-serialized for comparison)
   * @param signature  value from signature header
   */
  validateSignature(payload: unknown, signature: string | undefined): boolean {
    if (!signature) return false;

    const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expected =
      'sha256=' + crypto.createHmac('sha256', this.webhookSecret).update(bodyStr).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
