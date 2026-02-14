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
});
