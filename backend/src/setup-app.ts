import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

export function setupApp(app: NestExpressApplication): void {
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:8080,http://localhost:5173'
  )
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      // Electron desktop agent sends no Origin or null — allow those requests.
      if (!origin || origin === 'null') {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  if (!isProduction && process.env.DISABLE_SWAGGER !== '1') {
    const config = new DocumentBuilder()
      .setTitle('Alyson Time Doctor API')
      .setDescription('Employee time tracking API')
      .setVersion('2.0')
      .addTag('pulse', 'Dashboard aggregates and team management')
      .addTag('data', 'CRUD and log reads')
      .addTag('auth', 'Authentication')
      .addTag('sync', 'Desktop agent sync')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }
}
