import { describe, expect, it, vi } from 'vitest';
import { DataService } from './data.service';

function makeService(rows: unknown[] = []) {
  const database = {
    query: vi.fn(async () => ({ rows })),
    getClient: vi.fn(),
  };
  const s3 = { deleteObject: vi.fn() };
  const accessGrants = { getGrantedTargetIds: vi.fn(async () => []) };
  const service = new DataService(database as never, s3 as never, accessGrants as never);
  return { service, database, accessGrants };
}

const admin = { id: '1', role: 'admin', organization_id: '511' };
const otherAdmin = { id: '2', role: 'admin', organization_id: '99' };
const superInCompany = {
  id: '9',
  role: 'employee',
  is_super_admin: true,
  organization_id: '511',
};

describe('DataService.canAccessUserData', () => {
  it('allows self', async () => {
    const { service, database } = makeService();
    await expect(service.canAccessUserData(admin, '1')).resolves.toBe(true);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('allows an org admin for a user in the same workspace', async () => {
    const { service } = makeService([{ ok: 1 }]);
    await expect(service.canAccessUserData(admin, '42')).resolves.toBe(true);
  });

  it('denies an org admin for a user in another workspace', async () => {
    const { service, database } = makeService([]);
    await expect(service.canAccessUserData(otherAdmin, '42')).resolves.toBe(false);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('ext.workspace_id = $2'),
      [42, 99],
    );
  });

  it('denies a super-admin without a selected company', async () => {
    const { service, database } = makeService([{ ok: 1 }]);
    await expect(
      service.canAccessUserData({ id: '9', role: 'employee', is_super_admin: true }, '42'),
    ).resolves.toBe(false);
    expect(database.query).not.toHaveBeenCalled();
  });

  it('allows a super-admin only for users in the selected company', async () => {
    const { service } = makeService([{ ok: 1 }]);
    await expect(service.canAccessUserData(superInCompany, '42')).resolves.toBe(true);
  });
});
