import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ScreenshotAiRepository } from './screenshot-ai.repository';

const MAX_RETRIES = 3;

@Controller('sync/screenshot-ai')
@UseGuards(ApiKeyGuard)
@SkipThrottle({ default: true, strict: true })
export class ScreenshotAiInternalController {
  constructor(private readonly repo: ScreenshotAiRepository) {}

  /** Worker Lambda (no VPC): claim row before S3 + DeepSeek analysis. */
  @Post('claim')
  async claim(@Body() body: { screenshotId?: string }) {
    const screenshotId = body?.screenshotId?.trim();
    if (!screenshotId) {
      return { claimed: false };
    }

    const claimed = await this.repo.markProcessing(screenshotId);
    if (!claimed) {
      return { claimed: false };
    }

    const row = await this.repo.findById(screenshotId);
    return { claimed: true, aiRetryCount: row?.ai_retry_count ?? 0 };
  }

  /** Worker Lambda: persist successful analysis (upload + backfill jobs). */
  @Post('complete')
  async complete(
    @Body()
    body: {
      screenshotId?: string;
      source?: string;
      ai_model_used?: string;
      activity_type?: string;
      category?: string;
      is_work_related?: boolean;
      confidence_score?: number;
      distraction_score?: number;
      vision_summary?: string;
      vision_analysis?: Record<string, unknown>;
    },
  ) {
    const screenshotId = body?.screenshotId?.trim();
    if (!screenshotId) {
      return { success: false };
    }

    await this.repo.markCompleted(screenshotId, {
      ai_model_used: body.ai_model_used || 'deepseek',
      activity_type: body.activity_type || 'general',
      category: body.category || 'neutral',
      is_work_related: Boolean(body.is_work_related),
      confidence_score: Number(body.confidence_score) || 0,
      distraction_score: Number(body.distraction_score) || 0,
      vision_summary: body.vision_summary || '',
      vision_analysis: {
        ...(body.vision_analysis || {}),
        source: body.source,
      },
    });

    return { success: true };
  }

  /** Worker Lambda: record failure; returns whether SQS should retry. */
  @Post('fail')
  async fail(@Body() body: { screenshotId?: string; errorMessage?: string }) {
    const screenshotId = body?.screenshotId?.trim();
    if (!screenshotId) {
      return { retry: false };
    }

    const row = await this.repo.findById(screenshotId);
    const retry = (row?.ai_retry_count ?? 0) + 1 < MAX_RETRIES;
    const message = (body.errorMessage || 'Unknown analysis error').slice(0, 500);
    await this.repo.markFailed(screenshotId, message, retry);
    return { retry };
  }
}
