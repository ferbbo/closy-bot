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

// NODE_ENV for test mode
process.env.NODE_ENV = 'test';

// Note: DATABASE_URL should be set in .env or .env.test
// E2E tests require a real database connection
