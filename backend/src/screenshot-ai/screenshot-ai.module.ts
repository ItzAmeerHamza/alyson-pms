import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ScreenshotAiAnalyzerService } from './screenshot-ai-analyzer.service';
import { ScreenshotAiBackfillService } from './screenshot-ai-backfill.service';
import { ScreenshotAiController } from './screenshot-ai.controller';
import { ScreenshotAiInternalController } from './screenshot-ai-internal.controller';
import { ScreenshotAiQueueService } from './screenshot-ai-queue.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { DeepseekVisionService } from './deepseek-vision.service';
import { LlmChatClient } from './llm-chat.client';
import { ScreenshotImageContextService } from './screenshot-image-context.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [ConfigModule, AuthModule, CommonModule, BillingModule],
  controllers: [ScreenshotAiController, ScreenshotAiInternalController],
  providers: [
    ScreenshotAiRepository,
    ScreenshotAiQueueService,
    DeepseekVisionService,
    LlmChatClient,
    ScreenshotImageContextService,
    ScreenshotAiAnalyzerService,
    ScreenshotAiBackfillService,
  ],
  exports: [
    ScreenshotAiBackfillService,
    ScreenshotAiAnalyzerService,
    DeepseekVisionService,
    LlmChatClient,
  ],
})
export class ScreenshotAiModule {}
