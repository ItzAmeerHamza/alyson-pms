import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../common/s3.service';
import { DeepseekVisionService } from './deepseek-vision.service';
import { ScreenshotAiApiClientService } from './screenshot-ai-api-client.service';
import { ScreenshotImageContextService } from './screenshot-image-context.service';
import { ScreenshotAiJobMessage } from './screenshot-ai.types';

/**
 * Runs outside VPC: S3 + DeepSeek + persists via API Lambda (RDS).
 */
@Injectable()
export class ScreenshotAiWorkerService {
  private readonly logger = new Logger(ScreenshotAiWorkerService.name);

  constructor(
    private readonly s3: S3Service,
    private readonly deepseek: DeepseekVisionService,
    private readonly api: ScreenshotAiApiClientService,
    private readonly imageContext: ScreenshotImageContextService,
  ) {}

  async processJob(job: ScreenshotAiJobMessage): Promise<void> {
    if (!this.api.isConfigured()) {
      throw new Error('Screenshot AI API client is not configured');
    }

    const claim = await this.api.claimProcessing(job.screenshotId);
    if (!claim.claimed) {
      this.logger.warn(`Screenshot ${job.screenshotId} was not claimable — skipping`);
      return;
    }

    const s3Key = job.s3Key?.trim() || '';
    try {
      if (!this.s3.isValidScreenshotObjectKey(s3Key)) {
        throw new Error('Invalid or missing S3 key');
      }

      const { buffer, contentType } = await this.s3.getObjectBuffer(s3Key);
      const extracted = await this.imageContext.extractFromImage(buffer);
      const { result, raw } = await this.deepseek.analyzeScreenshot({
        imageBase64: buffer.toString('base64'),
        mimeType: contentType,
        appName: job.appName,
        windowTitle: job.windowTitle,
        capturedAt: job.capturedAt,
        imageContext: extracted,
      });

      await this.api.markCompleted({
        screenshotId: job.screenshotId,
        source: job.source,
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
      });

      this.logger.log(
        `AI analysis completed for ${job.screenshotId}: ${result.description.slice(0, 80)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analysis error';
      this.logger.error(`AI analysis failed for ${job.screenshotId}: ${message}`);
      const { retry } = await this.api.markFailed(job.screenshotId, message);
      if (retry) {
        throw error;
      }
    }
  }
}
