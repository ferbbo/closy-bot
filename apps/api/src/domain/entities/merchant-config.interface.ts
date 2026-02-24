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
}

export interface ShippingConfig {
  zones?: string[];
  flatRate?: number;
  freeAbove?: number;
  estimatedDays?: string;
}

export interface MerchantConfigData {
  paymentMethods: PaymentMethodConfig[];
  shippingConfig: ShippingConfig;
  returnPolicy?: string | null;
  currency: string;
  orderCodePrefix: string;
  autoConfirmCod: boolean;
}
