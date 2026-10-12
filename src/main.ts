import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { createRateLimiter } from './common/security/rate-limit.js';
import { PrismaService } from './prisma/prisma.service.js';
import { warnAboutPendingMigrations } from './prisma/migration-check.js';

async function bootstrap() {
  // rawBody keeps the exact bytes WhatsApp signed, which the webhook needs to check the signature.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  void warnAboutPendingMigrations(app.get(PrismaService));
  const port = configService.get<number>('PORT') || 3000;
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  const production = configService.get<string>('NODE_ENV') === 'production';

  // WhatsApp sends receipts and STOP replies to the webhook, which only trusts a signed request.
  const waOn = !!configService.get<string>('WHATSAPP_TOKEN') && !!configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  if (waOn && !configService.get<string>('WHATSAPP_APP_SECRET')) {
    console.warn('WhatsApp is on but WHATSAPP_APP_SECRET is not set: delivery status and STOP replies are off. See docs/whatsapp-setup.md.');
  }

  // Never run in production with a missing or weak signing secret: every login token depends on it.
  const secret = configService.get<string>('JWT_SECRET') ?? '';
  if (production && secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
  }

  // Behind nginx the real client address comes from the proxy's X-Forwarded-For (one hop). Without this
  // every request would appear to come from 127.0.0.1 and share one rate-limit / lockout bucket.
  const trustProxy = configService.get<string>('TRUST_PROXY');
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set(
    'trust proxy',
    trustProxy !== undefined ? Number(trustProxy) : production ? 1 : false,
  );

  app.setGlobalPrefix('api');

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS: only the listed origins. With none configured, allow any origin in development only.
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : production ? false : true,
    credentials: true,
  });

  // Rate limits per client IP: a general ceiling for the API, and a much tighter one on the PIN endpoints.
  const loginLimit = createRateLimiter({
    windowMs: 60_000,
    max: 20,
    message: 'Too many sign-in attempts. Please wait a minute and try again.',
  });
  app.use('/api/auth', loginLimit);
  app.use('/api/admin/auth/login', loginLimit);
  // Sending things to customers or admins: a handful per hour is plenty, and a stuck button or a script must not spam.
  const hourly = (max: number, message: string) => {
    const limiter = createRateLimiter({ windowMs: 3_600_000, max, message });
    return (req: Request, res: Response, next: NextFunction) => (req.method === 'POST' ? limiter(req, res, next) : next());
  };
  app.use('/api/admin/whatsapp/test', hourly(10, 'Too many test reports. Try again in an hour.'));
  app.use('/api/admin/whatsapp/offers', hourly(6, 'Too many offers sent this hour. Try again later.'));
  app.use('/api', createRateLimiter({ windowMs: 60_000, max: 600 }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API docs are for development; in production they are off unless ENABLE_DOCS=true.
  if (production && configService.get<string>('ENABLE_DOCS') !== 'true') {
    await app.listen(port, configService.get<string>('HOST') || '0.0.0.0');
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('CAVE Backend API')
    .setDescription('CAVE Salon Management Application Backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Behind nginx the API only needs to listen on localhost (set HOST=0.0.0.0 to expose it directly).
  await app.listen(port, configService.get<string>('HOST') || '0.0.0.0');
}
bootstrap();
