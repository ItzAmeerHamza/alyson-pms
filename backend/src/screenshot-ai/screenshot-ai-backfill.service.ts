import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScreenshotAiAnalyzerService } from './screenshot-ai-analyzer.service';
import { ScreenshotAiQueueService } from './screenshot-ai-queue.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { BackfillOptions } from './screenshot-ai.types';

@Injectable()
export class ScreenshotAiBackfillService {
  private readonly logger = new Logger(ScreenshotAiBackfillService.name);
  private readonly defaultBatchSize: number;

  constructor(
    private readonly config: ConfigService,
    private readonly repo: ScreenshotAiRepository,
    private readonly queue: ScreenshotAiQueueService,
    private readonly analyzer: ScreenshotAiAnalyzerService,
  ) {
    this.defaultBatchSize = parseInt(
      this.config.get<string>('SCREENSHOT_AI_BACKFILL_BATCH_SIZE') || '100',
      10,
    );
  }

  async enqueuePending(
    options: BackfillOptions = {},
  ): Promise<{ reenqueued: number; claimed: number; enqueued: number; resetProcessing: number }> {
    if (!this.queue.isEnabled()) {
      this.logger.debug('AI pipeline disabled — skip backfill enqueue');
      return { reenqueued: 0, claimed: 0, enqueued: 0, resetProcessing: 0 };
    }

    const limit = options.limit ?? this.defaultBatchSize;
    const resetProcessing = await this.repo.resetStaleProcessing(Math.min(limit, 50));

    const orphanedQueued = await this.repo.findQueuedForReenqueue(limit);
    const reenqueued = await this.queue.enqueueMany(
      orphanedQueued.map((row) => this.analyzer.buildJob(row, 'backfill')),
    );

    const pendingLimit = Math.max(0, limit - orphanedQueued.length);
    const rows =
      pendingLimit > 0
        ? await this.repo.claimPendingBatch({ ...options, limit: pendingLimit })
        : [];

    const jobs = rows.map((row) => this.analyzer.buildJob(row, 'backfill'));
    const enqueued = await this.queue.enqueueMany(jobs);

    this.logger.log(
      `Backfill reset ${resetProcessing} stale processing, re-enqueued ${reenqueued} orphaned queued, ` +
        `claimed ${rows.length} pending, enqueued ${enqueued} new`,
    );
    return { reenqueued, claimed: rows.length, enqueued, resetProcessing };
  }

  async enqueueAfterUpload(row: {
    id: string;
    user_id: number;
    workspace_id: number | null;
    s3_key: string;
    captured_at: string;
    app_name: string | null;
    window_title: string | null;
  }): Promise<void> {
    if (!this.queue.isEnabled()) return;

    await this.repo.markQueued(row.id);
    await this.queue.enqueue(
      this.analyzer.buildJob(
        {
          id: row.id,
          user_id: row.user_id,
          workspace_id: row.workspace_id,
          s3_key: row.s3_key,
          captured_at: row.captured_at,
          app_name: row.app_name,
          window_title: row.window_title,
          ai_analysis_status: 'queued',
          ai_retry_count: 0,
        },
        'upload',
      ),
    );
  }
}
