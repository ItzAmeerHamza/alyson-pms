import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(
    `Alyson Time Doctor API running on port ${port} (${isProduction ? 'production' : 'development'})`,
  );
  if (!isProduction) {
    logger.log(`API Documentation: http://localhost:${port}/api`);
  }
}

bootstrap();
