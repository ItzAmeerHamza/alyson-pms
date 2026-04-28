import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { initSentry } from './lib/sentry';
import helmet from 'helmet';

async function bootstrap() {
  initSentry();
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';
  
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());
  
  // Global validation pipe — strip unknown properties, reject unwhitelisted fields
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  // CORS — restrict to known origins
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Swagger/OpenAPI — only in non-production
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('TimeFlow Backend API')
      .setDescription('TimeFlow Employee Tracking Backend Service with AI Analysis')
      .setVersion('1.0')
      .addTag('ai-analysis', 'AI Analysis endpoints for screenshot processing')
      .addTag('auth', 'Authentication endpoints')
      .addTag('screenshots', 'Screenshot management')
      .addTag('insights', 'Analytics and insights')
      .addTag('notifications', 'Notification system')
      .addTag('reports', 'Reporting system')
      .build();
    
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  logger.log(`TimeFlow Backend running on port ${port} (${isProduction ? 'production' : 'development'})`);
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/api`);
  }
}

bootstrap(); 