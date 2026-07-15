import type { Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { ScreenshotAiModule } from '../screenshot-ai/screenshot-ai.module';
import { ScreenshotAiBackfillService } from '../screenshot-ai/screenshot-ai-backfill.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
    ScreenshotAiModule,
  ],
})
class ScreenshotAiBackfillAppModule {}

let backfill: ScreenshotAiBackfillService | null = null;

async function getBackfillService(): Promise<ScreenshotAiBackfillService> {
  if (!backfill) {
    const app = await NestFactory.createApplicationContext(ScreenshotAiBackfillAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    backfill = app.get(ScreenshotAiBackfillService);
  }
  return backfill;
}

/** EventBridge cron: claim pending screenshots and enqueue to SQS. */
export const handler: Handler = async () => {
  const service = await getBackfillService();
  const result = await service.enqueuePending();
  return { ok: true, ...result };
};
