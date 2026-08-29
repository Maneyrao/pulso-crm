import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AppConfig } from './common/config/app-config.js';
import { createRootLogger, getLogger } from './common/logging/logger.js';

async function bootstrap(): Promise<void> {
  // La configuración se valida ANTES de levantar nada: si falta una variable,
  // el proceso no arranca y dice cuál.
  const config = new AppConfig();

  createRootLogger({
    level: config.env.LOG_LEVEL,
    pretty: config.isDevelopment,
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El logger de Nest se silencia: los logs estructurados salen por pino.
    logger: config.isDevelopment ? ['error', 'warn', 'log'] : ['error', 'warn'],
    bufferLogs: false,
    bodyParser: false,
  });

  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // La API sirve JSON; no necesita nada de lo que habilita CORP por defecto.
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  app.enableCors({
    origin: config.env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Idempotency-Replayed'],
    maxAge: 600,
  });

  // Necesario para que req.ip resuelva el cliente real detrás del proxy del
  // proveedor. Sin esto, el rate limiting por IP agrupa a todos bajo la misma.
  app.set('trust proxy', 1);

  app.enableShutdownHooks();

  await app.listen(config.env.PORT, '0.0.0.0');
  getLogger().info({ port: config.env.PORT, env: config.env.NODE_ENV }, 'API escuchando');
}

void bootstrap();
