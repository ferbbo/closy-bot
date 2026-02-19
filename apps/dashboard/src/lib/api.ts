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
    throw new ApiError(res.status, `API Error: ${res.status}`);
  }

  return res.json();
}

export interface MerchantInfo {
  id: string;
  email: string;
  businessName: string;
  industry?: string;
}

export const api = {
  getMe: () => apiFetch<MerchantInfo>('/auth/me'),
  getGoogleAuthUrl: () => `${API_URL}/auth/login/google`,
  getMicrosoftAuthUrl: () => `${API_URL}/auth/login/microsoft`,
};
