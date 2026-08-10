import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { S3Service } from '../common/s3.service';

type Watermark = {
  last_updated_at: string;
  last_id: string;
};

type TimeLogRow = {
  id: string;
  user_id: number;
  workspace_id: number | null;
  project_id: string | null;
  device_id: string | null;
  start_time: Date | string;
  end_time: Date | string | null;
  status: string;
  idle_seconds: number;
  deducted_seconds: number;
  created_at: Date | string;
  updated_at: Date | string;
};

/** Structured NDJSON line for Athena JsonSerDe (one object per line). */
export type TimeLogAthenaRecord = {
  id: string;
  user_id: number;
  workspace_id: number | null;
  project_id: string | null;
  device_id: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  idle_seconds: number;
  deducted_seconds: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_PREFIX = 'tracked-time/time_logs';
const BATCH_SIZE = 5000;
/** Leave headroom under Lambda max timeout for S3/DB teardown. */
const DEFAULT_BUDGET_MS = 240_000;

@Injectable()
export class TimeLogsExportService {
  private readonly logger = new Logger(TimeLogsExportService.name);
  private readonly prefix: string;
  private readonly watermarkKey: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {
    this.prefix = (
      this.config.get<string>('TRACKED_TIME_LOGS_S3_PREFIX') || DEFAULT_PREFIX
    ).replace(/^\/+|\/+$/g, '');
    this.watermarkKey = `${this.prefix}/_state/watermark.json`;
  }

  async exportIncremental(opts?: { budgetMs?: number }): Promise<{
    exported: number;
    files_written: number;
    watermark: Watermark;
    done: boolean;
  }> {
    if (!this.s3.isEnabled()) {
      throw new Error('S3 is not configured — set AWS_S3_SCREENSHOTS_BUCKET');
    }

    const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;
    const started = Date.now();
    let watermark = await this.readWatermark();
    let totalExported = 0;
    let filesWritten = 0;
    let done = false;

    for (;;) {
      if (Date.now() - started > budgetMs) {
        this.logger.warn(
          `time_logs export budget exhausted after ${totalExported} rows; will continue next run`,
        );
        break;
      }

      const rows = await this.db.query<TimeLogRow>(
        `SELECT id, user_id, workspace_id, project_id, device_id,
                start_time, end_time, status, idle_seconds, deducted_seconds,
                created_at, updated_at
           FROM time_doctor.time_logs
          WHERE updated_at > $1::timestamptz
             OR (updated_at = $1::timestamptz AND id::text > $2)
          ORDER BY updated_at ASC, id ASC
          LIMIT $3`,
        [watermark.last_updated_at, watermark.last_id, BATCH_SIZE],
      );

      if (rows.rows.length === 0) {
        done = true;
        break;
      }

      const runTs = Date.now();
      const groups = this.groupByUpdatedDate(rows.rows);
      for (const [dt, groupRows] of groups) {
        const fromId = groupRows[0].id;
        const toId = groupRows[groupRows.length - 1].id;
        const key = `${this.prefix}/dt=${dt}/part-${runTs}-${fromId}-${toId}.ndjson`;
        const body = groupRows.map((r) => JSON.stringify(this.toAthenaRecord(r))).join('\n') + '\n';
        await this.s3.putObject(key, body, 'application/x-ndjson');
        filesWritten++;
      }

      totalExported += rows.rows.length;
      const last = rows.rows[rows.rows.length - 1];
      watermark = {
        last_updated_at: this.toIso(last.updated_at)!,
        last_id: String(last.id),
      };
      await this.writeWatermark(watermark);

      if (rows.rows.length < BATCH_SIZE) {
        done = true;
        break;
      }
    }

    this.logger.log(
      `time_logs export: exported=${totalExported} files=${filesWritten} done=${done} watermark=${watermark.last_updated_at}`,
    );
    return { exported: totalExported, files_written: filesWritten, watermark, done };
  }

  private async readWatermark(): Promise<Watermark> {
    const body = await this.s3.getObjectText(this.watermarkKey);
    if (!body) {
      return {
        last_updated_at: '1970-01-01T00:00:00.000Z',
        last_id: '00000000-0000-0000-0000-000000000000',
      };
    }
    const parsed = JSON.parse(body) as Partial<Watermark>;
    return {
      last_updated_at: parsed.last_updated_at || '1970-01-01T00:00:00.000Z',
      last_id: parsed.last_id || '00000000-0000-0000-0000-000000000000',
    };
  }

  private async writeWatermark(wm: Watermark): Promise<void> {
    await this.s3.putObject(
      this.watermarkKey,
      JSON.stringify({
        ...wm,
        updated_at: new Date().toISOString(),
      }),
      'application/json',
    );
  }

  toAthenaRecord(row: TimeLogRow): TimeLogAthenaRecord {
    const startIso = this.toIso(row.start_time)!;
    const endIso = this.toIso(row.end_time);
    const startMs = Date.parse(startIso);
    const endMs = endIso ? Date.parse(endIso) : NaN;
    const durationSeconds =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
        ? Math.floor((endMs - startMs) / 1000)
        : null;

    return {
      id: String(row.id),
      user_id: Number(row.user_id),
      workspace_id: row.workspace_id == null ? null : Number(row.workspace_id),
      project_id: row.project_id == null ? null : String(row.project_id),
      device_id: row.device_id == null ? null : String(row.device_id),
      start_time: startIso,
      end_time: endIso,
      status: String(row.status),
      idle_seconds: Number(row.idle_seconds) || 0,
      deducted_seconds: Number(row.deducted_seconds) || 0,
      duration_seconds: durationSeconds,
      created_at: this.toIso(row.created_at)!,
      updated_at: this.toIso(row.updated_at)!,
    };
  }

  private toIso(v: Date | string | null | undefined): string | null {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
  }

  private groupByUpdatedDate(rows: TimeLogRow[]): Map<string, TimeLogRow[]> {
    const groups = new Map<string, TimeLogRow[]>();
    for (const row of rows) {
      const dt = this.toIso(row.updated_at)!.slice(0, 10);
      if (!groups.has(dt)) groups.set(dt, []);
      groups.get(dt)!.push(row);
    }
    return groups;
  }
}
