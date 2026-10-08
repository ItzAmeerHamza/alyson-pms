import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DataService } from './data.service';

function makeService() {
  const queries: Array<{ text: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queries.push({ text, params });
      if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
        return { rows: [] };
      }
      if (text.includes('paused_at = COALESCE') && text.includes('RETURNING')) {
        return { rows: [{ user_id: 42 }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const database = {
    query: vi.fn(async (text: string) => {
      if (text.includes('SELECT ext.user_id, ext.pulse_role')) {
        return {
          rows: [{ user_id: 42, pulse_role: 'employee', workspace_id: 511 }],
        };
      }
      if (text.includes('FROM time_doctor.screenshots')) {
        return { rows: [{ s3_key: 'shots/a.jpg', thumb_s3_key: 'shots/a.thumb.jpg', file_path: null }] };
      }
      return { rows: [] };
    }),
    getClient: vi.fn(async () => client),
  };
  const s3 = { deleteObject: vi.fn(async () => true) };
  const accessGrants = { getGrantedTargetIds: vi.fn(async () => []) };
  const service = new DataService(database as never, s3 as never, accessGrants as never);
  return { service, database, client, s3, queries: () => queries };
}

const admin = { id: '1', role: 'admin', organization_id: '511' };

describe('DataService.deleteUser', () => {
  it('rejects employees', async () => {
    const { service } = makeService();
    await expect(
      service.deleteUser({ id: '9', role: 'employee', organization_id: '511' }, '42'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects self-delete', async () => {
    const { service } = makeService();
    await expect(service.deleteUser(admin, '1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pauses the workspace user and keeps their Pulse data', async () => {
    const { service, client, s3 } = makeService();
    const ok = await service.deleteUser(admin, '42');
    expect(ok).toBe(true);

    const pause = client.query.mock.calls.find((call) =>
      String(call[0]).includes('paused_at = COALESCE'),
    );
    expect(pause?.[1]).toEqual([511, 42, 1, 'removed_from_workspace']);
    const sql = client.query.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.time_logs'))).toBe(false);
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.user_extensions'))).toBe(false);
    expect(s3.deleteObject).not.toHaveBeenCalled();
  });

  it('allows removing a team leader and unassigns their reports', async () => {
    const { service, database, client } = makeService();
    database.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT ext.user_id, ext.pulse_role')) {
        return { rows: [{ user_id: 42, pulse_role: 'team_leader', workspace_id: 511 }] };
      }
      return { rows: [] };
    });
    const ok = await service.deleteUser(admin, '42');
    expect(ok).toBe(true);
    const sql = client.query.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => text.includes('SET manager_id = $3'))).toBe(true);
  });

  it('moves reports to another lead when deleting', async () => {
    const { service, database, client } = makeService();
    database.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT ext.user_id, ext.pulse_role, ext.workspace_id')) {
        return { rows: [{ user_id: 42, pulse_role: 'team_leader', workspace_id: 511 }] };
      }
      if (text.includes('SELECT ext.pulse_role')) {
        return { rows: [{ pulse_role: 'team_leader' }] };
      }
      return { rows: [] };
    });
    await service.deleteUser(admin, '42', { reassignManagerId: '99' });
    const move = client.query.mock.calls.find((call) =>
      String(call[0]).includes('SET manager_id = $3'),
    );
    expect(move?.[1]).toEqual([511, 42, 99]);
  });

  it('reassigns a whole team to another lead', async () => {
    const { service, database } = makeService();
    database.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT ext.workspace_id')) {
        return { rows: [{ workspace_id: 511 }] };
      }
      if (text.includes('SELECT ext.pulse_role')) {
        return { rows: [{ pulse_role: 'manager' }] };
      }
      if (text.includes('SET manager_id = $3') && text.includes('RETURNING')) {
        return { rows: [{ user_id: 7 }, { user_id: 8 }] };
      }
      return { rows: [] };
    });
    const result = await service.reassignReports(admin, '42', '99');
    expect(result).toEqual({
      moved: 2,
      from_manager_id: '42',
      to_manager_id: '99',
    });
  });

  it('blocks removing the last workspace admin', async () => {
    const { service, database } = makeService();
    database.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT ext.user_id, ext.pulse_role')) {
        return { rows: [{ user_id: 42, pulse_role: 'admin', workspace_id: 511 }] };
      }
      if (text.includes("ext.pulse_role = 'admin'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    await expect(service.deleteUser(admin, '42')).rejects.toBeInstanceOf(BadRequestException);
  });
});
