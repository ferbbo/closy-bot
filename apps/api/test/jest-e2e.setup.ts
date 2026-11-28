/**
 * PR-12: E2E Test Setup
 * Sets dummy env vars for OIDC providers to allow e2e tests to run
 */

// Set dummy OIDC env vars for testing (not real credentials)
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-microsoft-secret';
process.env.AUTH_REDIRECT_URL = 'http://localhost:3000';
process.env.AUTH_SESSION_TTL_HOURS = '24';

// PR-13: Meta Embedded Signup env vars
process.env.META_APP_ID = 'test-meta-app-id';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.META_CONFIG_ID = 'test-meta-config-id';
process.env.META_REDIRECT_URI = 'http://localhost:3000/onboarding/whatsapp/callback';

// NODE_ENV for test mode
process.env.NODE_ENV = 'test';

// Note: DATABASE_URL should be set in .env or .env.test
// E2E tests require a real database connection

// Delivery S1.5: Meta Sandbox. WhatsApp vars are NOT set globally here (WHATSAPP_APP_SECRET
// would enable MetaSignatureGuard for legacy suites that post unsigned webhooks). Delivery
// suites opt in with `applySandboxEnv(baseUrl)` from test/meta-sandbox/env.ts before
// importing AppModule.

// Delivery S5.1: debounce off by default (legacy suites expect a synchronous reply);
// delivery-burst.e2e-spec.ts overrides it with a short window.
process.env.DELIVERY_DEBOUNCE_MS = '0';
