import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { ScreenshotAiAnalyzerService } from './screenshot-ai-analyzer.service';
import { ScreenshotAiBackfillService } from './screenshot-ai-backfill.service';
import { ScreenshotAiController } from './screenshot-ai.controller';
import { ScreenshotAiInternalController } from './screenshot-ai-internal.controller';
import { ScreenshotAiQueueService } from './screenshot-ai-queue.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { DeepseekVisionService } from './deepseek-vision.service';
import { ScreenshotImageContextService } from './screenshot-image-context.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [ScreenshotAiController, ScreenshotAiInternalController],
  providers: [
    ScreenshotAiRepository,
    ScreenshotAiQueueService,
    DeepseekVisionService,
    ScreenshotImageContextService,
    ScreenshotAiAnalyzerService,
    ScreenshotAiBackfillService,
  ],
  exports: [
    ScreenshotAiBackfillService,
    ScreenshotAiAnalyzerService,
    DeepseekVisionService,
  ],
})
export class ScreenshotAiModule {}
