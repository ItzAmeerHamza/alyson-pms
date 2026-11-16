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

/**
 * EventBridge cron claims the historical backlog.
 * A manual invoke with `{ sinceMinutes }` only re-queues screenshots from that window.
 */
export const handler: Handler = async (event?: { sinceMinutes?: number; limit?: number }) => {
  const service = await getBackfillService();
  const sinceMinutes = Number(event?.sinceMinutes);
  if (Number.isFinite(sinceMinutes) && sinceMinutes > 0) {
    const start = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
    const limit = Math.max(1, Math.min(Number(event?.limit) || 200, 500));
    const result = await service.requeueSince(start, limit);
    return { ok: true, mode: 'recent', start, ...result };
  }
  const result = await service.enqueuePending();
  return { ok: true, ...result };
};
