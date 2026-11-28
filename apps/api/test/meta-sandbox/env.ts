import { SANDBOX_APP } from './sandbox-app';

/**
 * Meta Sandbox (S1.5-T1) — variables de entorno para apuntar la API al Graph API falso.
 *
 * Opt-in por suite (llamar en `beforeAll` ANTES de crear la app Nest): fijarlas de forma
 * global en `jest-e2e.setup.ts` activaría `MetaSignatureGuard` (WHATSAPP_APP_SECRET) en las
 * suites legacy que envían webhooks sin firmar. Devuelve una función que restaura los valores
 * previos (llamar en `afterAll`).
 */
export const SANDBOX_ENV_KEYS = [
  'WHATSAPP_API_URL',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_SANDBOX',
  'META_APP_ID',
  'META_APP_SECRET',
] as const;

export function sandboxEnv(baseUrl: string): Record<(typeof SANDBOX_ENV_KEYS)[number], string> {
  return {
    WHATSAPP_API_URL: baseUrl,
    WHATSAPP_API_VERSION: SANDBOX_APP.apiVersion,
    WHATSAPP_ACCESS_TOKEN: SANDBOX_APP.accessToken,
    WHATSAPP_PHONE_NUMBER_ID: SANDBOX_APP.phoneNumberId,
    WHATSAPP_APP_SECRET: SANDBOX_APP.appSecret,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: SANDBOX_APP.verifyToken,
    WHATSAPP_SANDBOX: 'true',
    META_APP_ID: SANDBOX_APP.appId,
    META_APP_SECRET: SANDBOX_APP.appSecret,
  };
}

export function applySandboxEnv(baseUrl: string): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(sandboxEnv(baseUrl))) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
