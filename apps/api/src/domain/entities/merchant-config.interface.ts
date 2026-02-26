/**
 * PR-04.5: MerchantConfig domain interfaces
 * Defines the TypeScript types for operational merchant configuration
 */

export type PaymentMethodType = 'cod' | 'transfer' | 'payment_link';

export interface BankInfo {
  bankName: string;
  accountNumber: string;
  accountType: 'ahorros' | 'corriente';
  accountHolder: string;
}

export interface PaymentMethodConfig {
  type: PaymentMethodType;
  label: string;
  instructions?: string;
  bankInfo?: BankInfo;
  /** PR-FE-OB-2: URL for payment link methods (MercadoPago, Stripe, etc.) */
  paymentLinkUrl?: string;
}

export interface ShippingConfig {
  zones?: string[];
  flatRate?: number;
  freeAbove?: number;
  estimatedDays?: string;
  /** PR-FE-OB-2: Human-readable shipping policy text */
  shippingPolicy?: string;
}

export interface MerchantConfigData {
  paymentMethods: PaymentMethodConfig[];
  shippingConfig: ShippingConfig;
  returnPolicy?: string | null;
  /** PR-FE-OB-2: Business hours text (e.g. "Lunes a Viernes 9am-6pm") */
  businessHours?: string | null;
  currency: string;
  orderCodePrefix: string;
  autoConfirmCod: boolean;
}
