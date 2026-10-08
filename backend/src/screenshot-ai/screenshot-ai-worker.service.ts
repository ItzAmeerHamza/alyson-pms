import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../common/s3.service';
import { DeepseekVisionService } from './deepseek-vision.service';
import { ScreenshotAiApiClientService } from './screenshot-ai-api-client.service';
import { ScreenshotImageContextService } from './screenshot-image-context.service';
import { writeScreenshotThumb } from '../lib/screenshot-thumb';
import { ScreenshotAiJobMessage } from './screenshot-ai.types';
import { applyMeetingAiClassification } from './meeting-classification';
import { visionAnalysisPayload } from './screenshot-ai-copy';

/**
 * Runs outside VPC: S3 + OpenRouter (DeepSeek model) + persists via API Lambda (RDS).
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
      const thumbS3Key = await writeScreenshotThumb(this.s3, s3Key, buffer);
      const extracted = await this.imageContext.extractFromImage(buffer);
      const { result: rawResult, raw } = await this.deepseek.analyzeScreenshot({
        imageBase64: buffer.toString('base64'),
        mimeType: contentType,
        appName: job.appName,
        windowTitle: job.windowTitle,
        capturedAt: job.capturedAt,
        imageContext: extracted,
      });
      const result = applyMeetingAiClassification(rawResult, {
        appName: job.appName,
        windowTitle: job.windowTitle,
        ocrText: extracted.ocrText,
      });

      await this.api.markCompleted({
        screenshotId: job.screenshotId,
        source: job.source,
        ai_model_used: String(raw.model || 'deepseek/deepseek-chat'),
        activity_type: result.activity_type,
        category: result.category,
        is_work_related: result.is_work_related,
        confidence_score: result.confidence_score,
        distraction_score: result.distraction_score,
        vision_summary: result.description,
        vision_analysis: visionAnalysisPayload(raw, result, {
          meeting_override:
            rawResult.category !== result.category ||
            rawResult.is_work_related !== result.is_work_related ||
            rawResult.productivity_flag !== result.productivity_flag,
          source: job.source,
          analyzed_at: new Date().toISOString(),
          image_context: {
            ...(((raw.image_context as Record<string, unknown> | undefined) || {}) as Record<
              string,
              unknown
            >),
            ocr_excerpt: extracted.ocrText ? extracted.ocrText.slice(0, 2500) : null,
          },
        }),
        thumb_s3_key: thumbS3Key,
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
