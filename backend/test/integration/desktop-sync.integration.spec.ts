/**
 * Desktop sync against a real Postgres. The unit specs use a fake db, which
 * cannot see SQL/bind mismatches such as the 08P01 that failed every Stop.
 *
 * Requests go through the desktop agent's own client (backend-time-logs.js)
 * over HTTP to ForceSyncController, so payloads are exactly what the app sends.
 *
 *   bash backend/test/integration/local-db.sh start
 *   cd backend && INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:55432/revclouddb \
 *     npm run test:integration
 *   bash backend/test/integration/local-db.sh stop
 */
import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createRequire } from 'module';
import { resolve } from 'path';
import { HttpException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../../src/database/database.service';
import { EffectiveTimeService } from '../../src/pulse/effective-time.service';
import { ForceSyncController } from '../../src/sync/force-sync.controller';

const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL || '';
const API_KEY = 'desktop-sync-integration-key';
const DEVICE_ID = '0253b244-74a3-44a6-9b89-c23d6af0ad47';

if (DATABASE_URL && !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  throw new Error('INTEGRATION_DATABASE_URL must point at a local throwaway database');
}

type DesktopClient = {
  createTimeLog: (payload: Record<string, unknown>, config: object) => Promise<unknown>;
  updateTimeLog: (id: string, updates: Record<string, unknown>, config: object) => Promise<unknown>;
  getTimeLog: (id: string, config: object) => Promise<{ end_time: string | null } | null>;
  callDesktopAction: (action: string, data: unknown, config: object) => Promise<any>;
};

type TimeLogRow = { end_time: Date | null; last_alive_at: Date | null; status: string };

const desktop: DesktopClient = createRequire(__filename)(
  resolve(__dirname, '../../../desktop-agent/src/modules/utils/backend-time-logs.js'),
);

function serve(controller: ForceSyncController): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url !== '/sync/desktop-action' || req.headers['x-api-key'] !== API_KEY) {
        send(401, { message: 'Invalid or missing API key' });
        return;
      }
      try {
        send(201, await controller.desktopAction(JSON.parse(raw || '{}')));
      } catch (err) {
        if (err instanceof HttpException) {
          const body = err.getResponse();
          send(err.getStatus(), typeof body === 'string' ? { message: body } : body);
        } else {
          send(500, { message: 'Internal server error' });
        }
      }
    });
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

describe.skipIf(!DATABASE_URL)('desktop sync against real Postgres', () => {
  let db: DatabaseService;
  let server: Server;
  let config: Record<string, unknown>;
  let userId: number;
  let projectId: string;
  const base = Date.now() - 3 * 3600_000;
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

  const row = async (id: string): Promise<TimeLogRow> =>
    (
      await db.query<TimeLogRow>(
        'SELECT end_time, last_alive_at, status FROM time_doctor.time_logs WHERE id = $1',
        [id],
      )
    ).rows[0];

  const start = (id: string, minute: number) =>
    desktop.createTimeLog(
      {
        id,
        user_id: userId,
        project_id: projectId,
        device_id: DEVICE_ID,
        start_time: at(minute),
        status: 'active',
      },
      config,
    );

  const checkpoint = (id: string, minute: number) =>
    desktop.updateTimeLog(id, { status: 'active', last_alive_at: at(minute), client_last_seen_at: at(minute) }, config);

  // Same updates object GracefulShutdownManager._syncClosedSession sends.
  const stop = (id: string, minute: number, idleCut = false) =>
    desktop.updateTimeLog(
      id,
      {
        end_time: at(minute),
        status: 'completed',
        last_alive_at: at(minute),
        client_last_seen_at: at(minute),
        idle_seconds: 0,
        frozen_end: true,
        ...(idleCut ? { authorized_idle_cut: true } : {}),
      },
      config,
    );

  beforeAll(async () => {
    db = new DatabaseService({
      get: (key: string, fallback?: string) =>
        ({ DATABASE_URL, DATABASE_SSL: 'false' } as Record<string, string>)[key] ?? fallback,
    } as never);

    const email = `desktop-sync-${randomUUID()}@alyson.test`;
    userId = (
      await db.query<{ id: number }>(
        `INSERT INTO tenant."user" (first_name, last_name, phone_number, email)
         VALUES ('Desktop', 'Sync', '0', $1) RETURNING id`,
        [email],
      )
    ).rows[0].id;
    const accountId = (
      await db.query<{ id: number }>(
        `INSERT INTO tenant.account (name, user_id, contact_name, contact_email)
         VALUES ('Integration', $1, 'Integration', $2) RETURNING id`,
        [userId, email],
      )
    ).rows[0].id;
    const workspaceId = (
      await db.query<{ id: number }>(
        `INSERT INTO tenant.workspace (name, account_id) VALUES ('Integration', $1) RETURNING id`,
        [accountId],
      )
    ).rows[0].id;
    await db.query(
      'INSERT INTO time_doctor.user_extensions (user_id, workspace_id) VALUES ($1, $2)',
      [userId, workspaceId],
    );
    await db.query(
      `INSERT INTO time_doctor.workspace_settings (workspace_id, settings)
       VALUES ($1, '{"timezone": "America/Chicago", "low_activity_threshold": 10, "screenshot_interval_minutes": 1}')`,
      [workspaceId],
    );
    projectId = (
      await db.query<{ id: string }>(
        `INSERT INTO time_doctor.projects (workspace_id, name) VALUES ($1, 'Integration') RETURNING id`,
        [workspaceId],
      )
    ).rows[0].id;

    const controller = new ForceSyncController(
      db,
      {} as never,
      { enqueueAfterUpload: async () => undefined } as never,
      new EffectiveTimeService(db),
      { recordFirstSignIn: async () => false } as never,
    );
    server = await serve(controller);
    const { port } = server.address() as AddressInfo;
    config = { BACKEND_API_URL: `http://127.0.0.1:${port}`, INTERNAL_API_KEY: API_KEY, user_id: userId };
  });

  afterAll(async () => {
    await new Promise((done) => server?.close(done));
    await db?.onModuleDestroy();
  });

  it('a Stop saves on the first try at the exact Stop time', async () => {
    const id = randomUUID();
    await start(id, 0);
    await checkpoint(id, 10);

    await expect(stop(id, 10.5)).resolves.toMatchObject({ success: true });

    const saved = await row(id);
    expect(saved.status).toBe('completed');
    expect(saved.end_time?.toISOString()).toBe(at(10.5));
    expect(saved.last_alive_at?.toISOString()).toBe(at(10.5));
    expect((await desktop.getTimeLog(id, config))?.end_time).toBeTruthy();
  });

  it('a replayed Stop, the next Start, and a stale checkpoint leave the close alone', async () => {
    const id = randomUUID();
    await start(id, 12);
    await stop(id, 15);

    await stop(id, 15);
    await start(randomUUID(), 15.1);
    await checkpoint(id, 20);

    const saved = await row(id);
    expect(saved.status).toBe('completed');
    expect(saved.end_time?.toISOString()).toBe(at(15));
  });

  it('an unanswered still-working alert cuts the session and later checkpoints cannot undo it', async () => {
    const id = randomUUID();
    await start(id, 20);
    await checkpoint(id, 40);

    await expect(stop(id, 30, true)).resolves.toMatchObject({ success: true });
    await checkpoint(id, 41);

    const saved = await row(id);
    expect(saved.end_time?.toISOString()).toBe(at(30));
    expect(saved.last_alive_at?.toISOString()).toBe(at(30));
  });

  it('the offline fallback still lands the exact Stop after the next Start auto-closed the row', async () => {
    const id = randomUUID();
    await start(id, 45);
    await checkpoint(id, 50);
    await start(randomUUID(), 51);
    expect((await row(id)).status).toBe('auto_closed');
    expect((await row(id)).end_time?.toISOString()).toBe(at(50));

    // TrackingManager._upsertQueuedCloseAsCreate
    await desktop.createTimeLog(
      {
        id,
        user_id: userId,
        project_id: projectId,
        start_time: at(45),
        end_time: at(50.75),
        status: 'completed',
        is_manual: false,
        idle_seconds: 0,
        device_id: DEVICE_ID,
      },
      config,
    );

    const saved = await row(id);
    expect(saved.status).toBe('completed');
    expect(saved.end_time?.toISOString()).toBe(at(50.75));
  });

  it('Pulse stats run on real SQL and ignore 0% shots taken after the session ended', async () => {
    const id = randomUUID();
    await start(id, 70);
    await stop(id, 90);

    const shot = (minute: number) =>
      db.query(
        `INSERT INTO time_doctor.screenshots (user_id, time_log_id, captured_at, activity_percent, app_name)
         VALUES ($1, $2, $3, 0, 'Code')`,
        [userId, id, at(minute)],
      );
    for (let m = 80; m < 90; m += 1) await shot(m);
    for (let m = 91; m < 100; m += 1) await shot(m);
    await db.query(
      `INSERT INTO time_doctor.idle_logs (user_id, time_log_id, idle_start, idle_end, duration_seconds)
       VALUES ($1, $2, $3, $4, 330), ($1, $2, $5, $6, 180)`,
      [userId, id, at(71), at(76.5), at(77), at(80)],
    );

    const stats = await desktop.callDesktopAction(
      'get_effective_stats',
      { user_id: userId, start: at(60), end: at(120) },
      config,
    );

    expect(stats.success).toBe(true);
    expect(stats.idle_seconds).toBe(330);
    // Ten in-session minutes count; the nine after the session's end do not.
    expect(stats.low_activity_seconds).toBeGreaterThanOrEqual(8 * 60);
    expect(stats.low_activity_seconds).toBeLessThanOrEqual(11 * 60);
  });

  it('shots from an agent with no input source are stored as unknown and are not low activity', async () => {
    const id = randomUUID();
    await start(id, 130);
    const shotIds: string[] = [];
    for (let m = 131; m < 143; m += 1) {
      const shotId = randomUUID();
      shotIds.push(shotId);
      // Same metadata shape screenshot-storage.js uploadScreenshotViaS3Api sends.
      await desktop.callDesktopAction(
        'screenshot_upload_complete',
        {
          metadata: {
            id: shotId,
            user_id: userId,
            s3_key: `screenshots/${userId}/${shotId}.jpg`,
            time_log_id: id,
            captured_at: at(m),
            activity_percent: null,
            focus_percent: null,
            mouse_clicks: 0,
            keystrokes: 0,
            mouse_movements: 0,
            app_name: 'Code',
          },
        },
        config,
      );
    }
    await stop(id, 145);

    const stored = await db.query<{ activity_percent: number | null; focus_percent: number | null }>(
      'SELECT activity_percent, focus_percent FROM time_doctor.screenshots WHERE id = ANY($1::uuid[])',
      [shotIds],
    );
    expect(stored.rows).toHaveLength(12);
    expect(stored.rows.every((r) => r.activity_percent === null && r.focus_percent === null)).toBe(true);

    const stats = await desktop.callDesktopAction(
      'get_effective_stats',
      { user_id: userId, start: at(125), end: at(150) },
      config,
    );
    expect(stats.success).toBe(true);
    expect(stats.low_activity_seconds).toBe(0);
  });
});
