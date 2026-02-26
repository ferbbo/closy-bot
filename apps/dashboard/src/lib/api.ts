const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { message?: string }).message ?? `API Error: ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return res.json();
}

// Backend /auth/me response structure
export interface AuthMeResponse {
  authenticated: boolean;
  merchant: {
    id: string;
    name: string;
    email: string;
    status: 'onboarding' | 'active' | 'suspended';
    industry?: 'ropa' | 'belleza' | 'minimarket' | null;
  };
}

// Onboarding API types
export type OnboardingStepKey =
  | 'channel'
  | 'catalog'
  | 'config'
  | 'test';

export interface OnboardingProgress {
  completedSteps: OnboardingStepKey[];
  pendingSteps: OnboardingStepKey[];
  percentage: number; // 0-100
  nextStep: OnboardingStepKey | null;
}

export interface ApplyPresetRequest {
  industry: 'ropa' | 'belleza' | 'minimarket';
}

export interface ApplyPresetResponse {
  success: true;
}

export interface ActivateResponse {
  activated: boolean;
  status: 'active';
}

export interface ActivateErrorResponse {
  error: string;
  details: string[];
}

export interface PaymentMethodsConfig {
  acceptsCash: boolean;
  acceptsTransfer: boolean;
  acceptsPaymentLink: boolean;
  bankName?: string;
  bankAccount?: string;
  bankHolder?: string;
}

// PR-FE-OB-2: Typed interfaces for step-customize
export interface PaymentMethodItem {
  type: 'cod' | 'transfer' | 'payment_link';
  label: string;
  instructions?: string;
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    accountType: 'ahorros' | 'corriente';
    accountHolder: string;
  };
  paymentLinkUrl?: string;
}

export interface PoliciesConfig {
  shippingPolicy?: string;
  returnPolicy?: string;
  businessHours?: string;
}

export interface Faq {
  question: string;
  keywords: string[];
  answer: string;
}

export interface CustomizeConfigRequest {
  paymentMethods?: PaymentMethodItem[];
  shippingConfig?: {
    shippingPolicy?: string;
  };
  returnPolicy?: string;
  businessHours?: string;
}

export interface SaveFaqsRequest {
  faqs: Faq[];
}

async function apiFetchMultipart<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
    // Do NOT set Content-Type — browser sets it with boundary automatically
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (body as { message?: string }).message ?? `API Error: ${res.status}`,
    );
  }

  return res.json();
}

export const api = {
  getMe: () => apiFetch<AuthMeResponse>('/auth/me'),
  getGoogleAuthUrl: () => `${API_URL}/auth/login/google`,
  getMicrosoftAuthUrl: () => `${API_URL}/auth/login/microsoft`,

  // Onboarding endpoints
  getOnboardingProgress: () =>
    apiFetch<OnboardingProgress>('/onboarding/progress'),
  applyPreset: (body: ApplyPresetRequest) =>
    apiFetch<ApplyPresetResponse>('/onboarding/apply-preset', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  activateMerchant: () =>
    apiFetch<ActivateResponse>('/onboarding/activate', {
      method: 'POST',
    }),

  // Catalog import (CSV file upload — PR-17)
  importCatalogFile: (formData: FormData) =>
    apiFetchMultipart<{ imported: number; errors: string[] }>(
      '/catalog/import-file',
      formData,
    ),

  // Payment methods config (PR-04.5)
  savePaymentConfig: (body: PaymentMethodsConfig) =>
    apiFetch<{ success: true }>('/merchants/me/config', {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethods: body }),
    }),

  // PR-FE-OB-2: Customize step — pagos + políticas + businessHours
  saveCustomizeConfig: (body: CustomizeConfigRequest) =>
    apiFetch<{ success: true }>('/merchants/me/config', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // PR-FE-OB-2: Save FAQs via PATCH /merchants/me/playbook
  saveFaqs: (body: SaveFaqsRequest) =>
    apiFetch<{ id: string }>('/merchants/me/playbook', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
