import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for webhook signature validation (Meta WhatsApp)
  });
  const logger = new Logger('Bootstrap');

  // Get config service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Enable cookie parser (for auth sessions)
  app.use(cookieParser());

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // PR-FE-00: Configure CORS for dashboard frontend
  // Allows cross-origin requests with credentials (session cookies)
  const corsOriginsEnv = configService.get<string>('CORS_ORIGINS', '');
  const defaultOrigins = ['http://localhost:3001']; // Dashboard dev default

  let allowedOrigins: string[];
  if (corsOriginsEnv) {
    // Parse comma-separated origins, trim whitespace
    allowedOrigins = corsOriginsEnv
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    logger.log(`CORS enabled for origins: ${allowedOrigins.join(', ')}`);
  } else {
    // Fallback to defaults, log warning in production
    allowedOrigins = defaultOrigins;
    if (nodeEnv === 'production') {
      logger.warn(
        'CORS_ORIGINS not configured. Using default origins. Set CORS_ORIGINS env var for production.',
      );
    } else {
      logger.log(`CORS enabled for default origins: ${allowedOrigins.join(', ')}`);
    }
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Allow cookies (session_id)
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Cookie', 'x-api-key', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
  });

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📊 Environment: ${nodeEnv}`);
}

bootstrap();
