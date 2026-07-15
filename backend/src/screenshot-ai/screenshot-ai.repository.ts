import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  BackfillOptions,
  ScreenshotAiStatus,
  ScreenshotAiStatusCounts,
  ScreenshotRowForAnalysis,
} from './screenshot-ai.types';

@Injectable()
export class ScreenshotAiRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Rows eligible for S3 + DeepSeek analysis (valid object key, retries remaining). */
  private readonly analyzableWhere = `
    s3_key IS NOT NULL
    AND btrim(s3_key) <> ''
    AND length(btrim(s3_key)) >= 12
    AND btrim(s3_key) LIKE '%/%'
    AND ai_retry_count < 3
  `;

  async getStatusCounts(): Promise<ScreenshotAiStatusCounts> {
    const result = await this.db.query<{ status: string; count: string }>(
      `SELECT ai_analysis_status AS status, COUNT(*)::text AS count
       FROM time_doctor.screenshots
       GROUP BY ai_analysis_status`,
    );

    const counts: ScreenshotAiStatusCounts = {
      pending: 0,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    };

    for (const row of result.rows) {
      const n = parseInt(row.count, 10) || 0;
      if (row.status in counts) {
        counts[row.status as keyof Omit<ScreenshotAiStatusCounts, 'total'>] = n;
      }
      counts.total += n;
    }

    return counts;
  }

  async claimPendingBatch(options: BackfillOptions = {}): Promise<ScreenshotRowForAnalysis[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));
    const statuses: ScreenshotAiStatus[] = options.includeFailed
      ? ['pending', 'failed']
      : ['pending'];

    const filters = [`ai_analysis_status = ANY($1::text[])`, this.analyzableWhere];
    const params: unknown[] = [statuses];

    if (options.userId) {
      params.push(parseInt(options.userId, 10));
      filters.push(`user_id = $${params.length}`);
    }
    if (options.startDate) {
      params.push(options.startDate);
      filters.push(`captured_at >= $${params.length}::timestamptz`);
    }
    if (options.endDate) {
      params.push(options.endDate);
      filters.push(`captured_at <= $${params.length}::timestamptz`);
    }

    const order = options.newestFirst ? 'DESC' : 'ASC';
    params.push(limit);

    const result = await this.db.query<ScreenshotRowForAnalysis>(
      `UPDATE time_doctor.screenshots s
       SET ai_analysis_status = 'queued', ai_queued_at = NOW()
       WHERE s.id IN (
         SELECT id FROM time_doctor.screenshots
         WHERE ${filters.join(' AND ')}
         ORDER BY captured_at ${order}
         LIMIT $${params.length}
         FOR UPDATE SKIP LOCKED
       )
       RETURNING s.id, s.user_id, s.workspace_id, s.s3_key, s.captured_at,
                 s.app_name, s.window_title, s.ai_analysis_status, s.ai_retry_count`,
      params,
    );

    return result.rows;
  }

  /** Queued in DB but SQS message may be missing — re-send without changing status. */
  async findQueuedForReenqueue(limit: number): Promise<ScreenshotRowForAnalysis[]> {
    const batch = Math.max(1, Math.min(limit, 1000));
    const result = await this.db.query<ScreenshotRowForAnalysis>(
      `SELECT id, user_id, workspace_id, s3_key, captured_at, app_name, window_title,
              ai_analysis_status, ai_retry_count
       FROM time_doctor.screenshots
       WHERE ai_analysis_status = 'queued'
         AND ${this.analyzableWhere}
       ORDER BY ai_queued_at ASC NULLS LAST, captured_at ASC
       LIMIT $1`,
      [batch],
    );
    return result.rows;
  }

  /** Worker crashed mid-job — return to pending for a new claim/enqueue cycle. */
  async resetStaleProcessing(limit = 100): Promise<number> {
    const batch = Math.max(1, Math.min(limit, 1000));
    const result = await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'pending', ai_error_message = 'stale_processing_reset'
       WHERE id IN (
         SELECT id FROM time_doctor.screenshots
         WHERE ai_analysis_status = 'processing'
           AND ai_queued_at < NOW() - INTERVAL '1 hour'
           AND ${this.analyzableWhere}
         ORDER BY ai_queued_at ASC NULLS LAST
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [batch],
    );
    return result.rowCount;
  }

  async findById(id: string): Promise<ScreenshotRowForAnalysis | null> {
    const result = await this.db.query<ScreenshotRowForAnalysis>(
      `SELECT id, user_id, workspace_id, s3_key, captured_at, app_name, window_title,
              ai_analysis_status, ai_retry_count
       FROM time_doctor.screenshots
       WHERE id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async markQueued(id: string): Promise<void> {
    await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'queued', ai_queued_at = NOW()
       WHERE id = $1`,
      [id],
    );
  }

  async markProcessing(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'processing'
       WHERE id = $1 AND ai_analysis_status IN ('queued', 'processing', 'pending')
       RETURNING id`,
      [id],
    );
    return result.rowCount > 0;
  }

  async markCompleted(
    id: string,
    payload: {
      ai_model_used: string;
      activity_type: string;
      category: string;
      is_work_related: boolean;
      confidence_score: number;
      distraction_score: number;
      vision_summary: string;
      vision_analysis: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'completed',
           ai_analyzed_at = NOW(),
           ai_error_message = NULL,
           ai_model_used = $2,
           activity_type = $3,
           category = $4,
           is_work_related = $5,
           confidence_score = $6,
           distraction_score = $7,
           vision_summary = $8,
           vision_analysis = $9::jsonb
       WHERE id = $1`,
      [
        id,
        payload.ai_model_used,
        payload.activity_type,
        payload.category,
        payload.is_work_related,
        payload.confidence_score,
        payload.distraction_score,
        payload.vision_summary,
        JSON.stringify(payload.vision_analysis),
      ],
    );
  }

  async markFailed(id: string, errorMessage: string, retry: boolean): Promise<void> {
    if (retry) {
      await this.db.query(
        `UPDATE time_doctor.screenshots
         SET ai_analysis_status = 'pending',
             ai_retry_count = ai_retry_count + 1,
             ai_error_message = $2
         WHERE id = $1`,
        [id, errorMessage.slice(0, 500)],
      );
      return;
    }

    await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'failed',
           ai_retry_count = ai_retry_count + 1,
           ai_error_message = $2
       WHERE id = $1`,
      [id, errorMessage.slice(0, 500)],
    );
  }

  async resetFailedToPending(limit = 500): Promise<number> {
    const result = await this.db.query(
      `UPDATE time_doctor.screenshots
       SET ai_analysis_status = 'pending', ai_retry_count = 0, ai_error_message = NULL
       WHERE id IN (
         SELECT id FROM time_doctor.screenshots
         WHERE ai_analysis_status = 'failed'
         LIMIT $1
       )
       RETURNING id`,
      [Math.min(limit, 5000)],
    );
    return result.rowCount;
  }
}
