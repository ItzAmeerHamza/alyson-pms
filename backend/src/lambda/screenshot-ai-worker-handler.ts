import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { DeepseekVisionService } from '../screenshot-ai/deepseek-vision.service';
import { ScreenshotAiApiClientService } from '../screenshot-ai/screenshot-ai-api-client.service';
import { ScreenshotImageContextService } from '../screenshot-ai/screenshot-image-context.service';
import { ScreenshotAiWorkerService } from '../screenshot-ai/screenshot-ai-worker.service';
import { ScreenshotAiJobMessage } from '../screenshot-ai/screenshot-ai.types';

/** Minimal Nest context — no VPC/DB; worker calls API Lambda for Postgres writes. */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule],
  providers: [DeepseekVisionService, ScreenshotAiApiClientService, ScreenshotAiWorkerService, ScreenshotImageContextService],
})
class ScreenshotAiWorkerAppModule {}

let worker: ScreenshotAiWorkerService | null = null;

async function getWorker(): Promise<ScreenshotAiWorkerService> {
  if (!worker) {
    const app = await NestFactory.createApplicationContext(ScreenshotAiWorkerAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    worker = app.get(ScreenshotAiWorkerService);
  }
  return worker;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  const service = await getWorker();

  for (const record of event.Records) {
    const job = JSON.parse(record.body) as ScreenshotAiJobMessage;
    await service.processJob(job);
  }
};
