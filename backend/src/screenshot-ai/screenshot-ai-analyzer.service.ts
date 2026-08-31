import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../common/s3.service';
import { DeepseekVisionService } from './deepseek-vision.service';
import { ScreenshotImageContextService } from './screenshot-image-context.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { writeScreenshotThumb } from '../lib/screenshot-thumb';
import { ScreenshotAiJobMessage, ScreenshotRowForAnalysis } from './screenshot-ai.types';

const MAX_RETRIES = 3;

@Injectable()
export class ScreenshotAiAnalyzerService {
  private readonly logger = new Logger(ScreenshotAiAnalyzerService.name);

  constructor(
    private readonly repo: ScreenshotAiRepository,
    private readonly s3: S3Service,
    private readonly deepseek: DeepseekVisionService,
    private readonly imageContext: ScreenshotImageContextService,
  ) {}

  buildJob(row: ScreenshotRowForAnalysis, source: ScreenshotAiJobMessage['source']): ScreenshotAiJobMessage {
    return {
      screenshotId: row.id,
      s3Key: row.s3_key,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      appName: row.app_name,
      windowTitle: row.window_title,
      capturedAt: row.captured_at,
      source,
    };
  }

  async processJob(job: ScreenshotAiJobMessage): Promise<void> {
    const claimed = await this.repo.markProcessing(job.screenshotId);
    if (!claimed) {
      this.logger.warn(`Screenshot ${job.screenshotId} was not claimable — skipping`);
      return;
    }

    const row = await this.repo.findById(job.screenshotId);
    if (!row) {
      this.logger.warn(`Screenshot ${job.screenshotId} not found`);
      return;
    }

    try {
      if (!this.s3.isValidScreenshotObjectKey(row.s3_key)) {
        throw new Error('Invalid or missing S3 key');
      }

      const { buffer, contentType } = await this.s3.getObjectBuffer(row.s3_key);
      const thumbS3Key = await writeScreenshotThumb(this.s3, row.s3_key, buffer);
      const extracted = await this.imageContext.extractFromImage(buffer);
      const { result, raw } = await this.deepseek.analyzeScreenshot({
        imageBase64: buffer.toString('base64'),
        mimeType: contentType,
        appName: row.app_name,
        windowTitle: row.window_title,
        capturedAt: row.captured_at,
        imageContext: extracted,
      });

      await this.repo.markCompleted(job.screenshotId, {
        ai_model_used: String(raw.model || 'deepseek'),
        activity_type: result.activity_type,
        category: result.category,
        is_work_related: result.is_work_related,
        confidence_score: result.confidence_score,
        distraction_score: result.distraction_score,
        vision_summary: result.description,
        vision_analysis: {
          ...raw,
          description: result.description,
          source: job.source,
          analyzed_at: new Date().toISOString(),
        },
        thumb_s3_key: thumbS3Key,
      });

      this.logger.log(
        `AI analysis completed for ${job.screenshotId}: ${result.description.slice(0, 80)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analysis error';
      this.logger.error(`AI analysis failed for ${job.screenshotId}: ${message}`);
      const retry = row.ai_retry_count + 1 < MAX_RETRIES;
      await this.repo.markFailed(job.screenshotId, message, retry);
      if (retry) {
        throw error;
      }
    }
  }
}
