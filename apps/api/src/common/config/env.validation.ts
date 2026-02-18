import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),

  // WhatsApp Cloud API configuration
  WHATSAPP_ACCESS_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().optional(),
  WHATSAPP_API_VERSION: Joi.string().default('v18.0'),
  WHATSAPP_API_URL: Joi.string().default('https://graph.facebook.com'),

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

  // PR-03.10: Message retention configuration
  MESSAGE_HISTORY_DAYS: Joi.number().min(1).max(365).default(30),
  MESSAGE_HISTORY_MAX_PER_CONVO: Joi.number().min(10).max(500).default(50),
  LLM_CONTEXT_LAST_K: Joi.number().min(1).max(50).default(10),
  SUMMARIZATION_BATCH_SIZE: Joi.number().min(1).max(100).default(20),

  // PR-12: Auth OIDC configuration
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  AUTH_REDIRECT_URL: Joi.string().uri().default('http://localhost:3000'),
  AUTH_SESSION_TTL_HOURS: Joi.number().min(1).max(720).default(24), // Max 30 days
  AUTH_COOKIE_DOMAIN: Joi.string().optional(),
  AUTH_SESSION_CLEANUP_CRON: Joi.string().optional(),
});
