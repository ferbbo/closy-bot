import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  // CORS
  CORS_ORIGINS: Joi.string().optional().allow('').default('http://localhost:3001'),

  // WhatsApp Cloud API configuration
  WHATSAPP_ACCESS_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().optional(),
  WHATSAPP_API_VERSION: Joi.string().default('v18.0'),
  WHATSAPP_API_URL: Joi.string().default('https://graph.facebook.com'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().optional().default('your-verify-token'),
  WHATSAPP_APP_SECRET: Joi.string().optional(),
  // Delivery S1.5: Meta Sandbox (fake Graph API) — only tests / local demo; never in production
  WHATSAPP_SANDBOX: Joi.boolean().default(false),

  // LLM Configuration
  LLM_ENABLED: Joi.boolean().default(false),
  LLM_PROVIDER: Joi.string().valid('groq').default('groq'),
  GROQ_API_KEY: Joi.string().when('LLM_ENABLED', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  LLM_MODEL: Joi.string().default('llama-3.1-70b-versatile'),
  LLM_TIMEOUT_MS: Joi.number().default(30000),
  LLM_MAX_TOKENS: Joi.number().default(500),
  LLM_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),

  // PR-03.5.1: Granular LLM feature flags
  LLM_INTENT_ASSIST: Joi.boolean().default(false),
  LLM_FALLBACK_ENABLED: Joi.boolean().default(false),
  LLM_SUMMARY_ENABLED: Joi.boolean().default(false),

  // PR-03.5.1: Intent classification thresholds
  INTENT_CONFIDENCE_THRESHOLD_HIGH: Joi.number().default(5),
  INTENT_CONFIDENCE_THRESHOLD_LOW: Joi.number().default(2),

  // PR-03.10: Message retention configuration
  MESSAGE_HISTORY_DAYS: Joi.number().min(1).max(365).default(30),
  MESSAGE_HISTORY_MAX_PER_CONVO: Joi.number().min(10).max(500).default(50),
  LLM_CONTEXT_LAST_K: Joi.number().min(1).max(50).default(10),
  SUMMARIZATION_BATCH_SIZE: Joi.number().min(1).max(100).default(20),

  // Outbox dispatcher configuration
  OUTBOX_DISPATCHER_ENABLED: Joi.string().valid('true', 'false').default('true'),
  OUTBOX_BATCH_SIZE: Joi.number().integer().min(1).default(10),
  OUTBOX_LOCK_TTL_SECONDS: Joi.number().integer().min(1).default(300),
  OUTBOX_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),

  // PR-03.5.2: Catalog Full-Text Search configuration
  CATALOG_FTS_ENABLED: Joi.boolean().default(true),

  // PR-17: Catalog import
  CATALOG_IMPORT_MAX_SIZE_MB: Joi.number().min(1).default(5),

  // PR-04: Cart configuration
  CART_TTL_HOURS: Joi.number().min(1).default(24),

  // PR-GAP-2: FAQ keyword matching
  FAQ_MATCH_THRESHOLD: Joi.number().min(0).default(1),

  // PR-06: Payment webhook
  PAYMENT_WEBHOOK_SECRET: Joi.string().optional().allow(''),
  PAYMENT_WEBHOOK_HEADER: Joi.string().default('X-Payment-Signature'),

  // PR-12: Auth OIDC configuration
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  AUTH_REDIRECT_URL: Joi.string().uri().default('http://localhost:3000'),
  AUTH_SESSION_TTL_HOURS: Joi.number().min(1).max(720).default(24), // Max 30 days
  AUTH_COOKIE_DOMAIN: Joi.string().optional(),
  AUTH_SESSION_CLEANUP_CRON: Joi.string().optional(),

  // GAP-3: Dashboard URL for postMessage targetOrigin security (never use '*')
  DASHBOARD_URL: Joi.string().uri().required(),

  // PR-13: Meta Embedded Signup configuration
  META_APP_ID: Joi.string().optional(),
  META_APP_SECRET: Joi.string().optional(),
  META_CONFIG_ID: Joi.string().optional(),
  META_REDIRECT_URI: Joi.string().uri().optional(),

  // PR-MVP-01: Feature Flags infrastructure
  // Kill-switch global: mvp → all B2 flags return false (safe default for production)
  FEATURES_MODE: Joi.string().valid('mvp', 'dev', 'full').default('mvp'),
  // Granular flags (only respected when FEATURES_MODE != mvp)
  MULTI_CHANNEL_ENABLED: Joi.boolean().default(false),
  INSTAGRAM_ENABLED: Joi.boolean().default(false),
  PLAYBOOK_EDITOR_ENABLED: Joi.boolean().default(false),
  INDUSTRIES_ENABLED: Joi.boolean().default(false),

  // Delivery vertical (B2, gated by FEATURES_MODE != mvp + DELIVERY_ENABLED)
  DELIVERY_ENABLED: Joi.boolean().default(false),
  DELIVERY_LLM_MODEL: Joi.string().default('llama-3.3-70b-versatile'),
  DELIVERY_STT_MODEL: Joi.string().default('whisper-large-v3-turbo'),
  DELIVERY_VISION_MODEL: Joi.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),
  // S5.1: ventana de debounce de ráfagas (ms); 0 = desactivado (procesamiento inmediato)
  DELIVERY_DEBOUNCE_MS: Joi.number().integer().min(0).default(4000),

  // PR-INFRA-R2: Cloudflare R2 Object Storage (pre-requisito de PR-18)
  // Todas opcionales: la API arranca sin ellas. PR-18 retorna 503 si no están configuradas.
  R2_ACCOUNT_ID: Joi.string().optional(),
  R2_ACCESS_KEY_ID: Joi.string().optional(),
  R2_SECRET_ACCESS_KEY: Joi.string().optional(),
  R2_BUCKET_NAME: Joi.string().optional(),
  R2_PUBLIC_URL: Joi.string().uri().optional(),
});
