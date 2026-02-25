/**
 * PR-06: Payment domain entity interface
 * REQ-01, REQ-02: Payment model with PaymentStatus
 */

export type PaymentStatusValue = 'pending' | 'confirmed' | 'failed';

export interface PaymentEntity {
  id: string;
  orderId: string;
  amount: number;
  method: string; // 'cod' | 'transfer' | 'payment_link'
  status: PaymentStatusValue;
  externalId?: string | null;
  paymentIntentId: string; // Idempotency key (unique)
  confirmedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ConfirmPaymentDto — internal input for PaymentService.confirmPayment()
 * REQ-03, AC-02
 */
export interface ConfirmPaymentDto {
  orderId: string;
  amount: number;
  method: string;
  paymentIntentId: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * PaymentWebhookPayload — external webhook payload from payment gateway
 * REQ-04, AC-04
 */
export interface PaymentWebhookPayload {
  payment_intent_id: string; // Deduplication key
  order_code: string; // Human-readable order code (e.g. ORD-001)
  amount: number; // Amount in centavos or base unit
  status: 'approved' | 'rejected';
  method: string; // 'transfer' | 'payment_link' | 'cod'
  external_id?: string;
  timestamp: string; // ISO 8601
  metadata?: Record<string, unknown>;
}

/**
 * WebhookResponseDto — standard response for payment webhook endpoint
 * REQ-04, AC-04, AC-05, AC-08
 */
export interface WebhookResponseDto {
  success: boolean;
  payment_id?: string;
  order_code?: string;
  status?: string;
  message?: string;
  error?: string;
}

/**
 * MerchantPaymentNotification — internal type for payment confirmation notifications
 * REQ-09, AC-12
 */
export interface MerchantPaymentNotification {
  type: 'PAYMENT_CONFIRMED';
  orderCode: string;
  amount: string; // Formatted (e.g. "$120,000 COP")
  method: string;
  timestamp: string; // ISO timestamp
  isManual?: boolean; // true if confirmed via fallback command
}

/**
 * ConfirmPaymentResult — internal result of confirmPayment()
 */
export interface ConfirmPaymentResult {
  success: boolean;
  paymentId: string;
  /** true if same paymentIntentId was already confirmed previously */
  alreadyProcessed?: boolean;
  /** true if order was already in 'paid' status */
  alreadyPaid?: boolean;
}
