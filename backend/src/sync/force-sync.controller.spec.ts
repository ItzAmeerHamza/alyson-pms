import { describe, expect, it, vi } from 'vitest';
import { ForceSyncController } from './force-sync.controller';
import {
  AUTHORIZED_CUT_END_SQL,
  COMPLETED_ROW_KEEPS_END_SQL,
  updateTimeLogEndSql,
  updateTimeLogLastAliveSql,
} from '../lib/time-log-update-sql';

function makeController() {
  const query = vi.fn(async () => ({
    rowCount: 1,
    rows: [{ id: 'sess-1', end_time: '2026-08-31T10:17:26.000Z' }],
  }));
  const controller = new ForceSyncController(
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, query };
}

describe('ForceSyncController update_time_log', () => {
  it('persists an authorized idle cut at now−10m and freezes last_alive there', async () => {
    const { controller, query } = makeController();
    const cutEnd = '2026-08-31T10:17:26.000Z';

    await controller.desktopAction({
      action: 'update_time_log',
      data: {
        id: '4b2ebd54-0000-4000-8000-000000000001',
        updates: {
          end_time: cutEnd,
          status: 'completed',
          authorized_idle_cut: true,
        },
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(updateTimeLogEndSql(true));
    expect(sql).toContain(updateTimeLogLastAliveSql(true));
    expect(sql).toContain(AUTHORIZED_CUT_END_SQL);
    expect(sql).not.toMatch(/last_alive_at = CASE\s+WHEN t\.end_time IS NOT NULL THEN t\.last_alive_at/);
    expect(params[1]).toBe(cutEnd);
  });

  it('does not query Postgres for offline temp- ids', async () => {
    const { controller, query } = makeController();

    const result = await controller.desktopAction({
      action: 'update_time_log',
      data: {
        id: 'temp-1785518624300-4oeivdesv',
        updates: { status: 'completed' },
      },
    });

    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      id: 'temp-1785518624300-4oeivdesv',
      updated: 0,
      reason: 'no_row',
    });
  });

  it('a follow-up without the flag does not use the authorized-cut end SQL', async () => {
    const { controller, query } = makeController();

    await controller.desktopAction({
      action: 'update_time_log',
      data: {
        id: '4b2ebd54-0000-4000-8000-000000000001',
        updates: {
          end_time: '2026-08-31T10:27:26.000Z',
          status: 'completed',
        },
      },
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain(updateTimeLogEndSql(false));
    expect(sql).toContain('COALESCE(t.last_alive_at,');
    expect(sql).not.toBe(updateTimeLogEndSql(true));
  });
});

describe('ForceSyncController close_active_sessions', () => {
  it('does not kill-all a live session id', async () => {
    const { controller, query } = makeController();

    await controller.desktopAction({
      action: 'close_active_sessions',
      data: {
        user_id: 1233,
        device_id: 'c72a2bb3-7817-4be7-ae7c-241c2c9ba0c3',
        close_at_own_liveness: true,
        except_time_log_id: '090c3598-4505-4d58-b3c9-5cabca29d649',
      },
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('t.id <>');
    expect(params).toContain('090c3598-4505-4d58-b3c9-5cabca29d649');
  });
});

describe('ForceSyncController create_time_log conflict', () => {
  it('keeps a completed billed end on insert retry', async () => {
    const { controller, query } = makeController();
    query.mockResolvedValueOnce({
      rows: [{ workspace_id: 511 }],
    });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'sess-1',
          user_id: 1224,
          project_id: null,
          start_time: '2026-08-31T05:37:00.000Z',
          end_time: '2026-08-31T10:17:26.000Z',
          status: 'completed',
          device_id: null,
        },
      ],
    });

    await controller.desktopAction({
      action: 'create_time_log',
      data: {
        log: {
          id: 'sess-1',
          user_id: 1224,
          start_time: '2026-08-31T05:37:00.000Z',
          end_time: '2026-08-31T10:27:26.000Z',
          status: 'completed',
        },
      },
    });

    const insertSql = query.mock.calls[1][0];
    expect(insertSql).toContain(COMPLETED_ROW_KEEPS_END_SQL);
  });
});
