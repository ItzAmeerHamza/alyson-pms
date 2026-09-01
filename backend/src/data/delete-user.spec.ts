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
      if (text.includes('DELETE FROM time_doctor.user_extensions')) {
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

  it('purges Pulse rows and screenshot objects for the workspace user', async () => {
    const { service, client, s3 } = makeService();
    const ok = await service.deleteUser(admin, '42');
    expect(ok).toBe(true);

    const sql = client.query.mock.calls.map((call) => String(call[0]));
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.screenshots'))).toBe(true);
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.time_logs'))).toBe(true);
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.employee_project_assignments'))).toBe(
      true,
    );
    expect(sql.some((text) => text.includes('DELETE FROM time_doctor.user_extensions'))).toBe(true);
    expect(s3.deleteObject).toHaveBeenCalledWith('shots/a.jpg');
    expect(s3.deleteObject).toHaveBeenCalledWith('shots/a.thumb.jpg');
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
