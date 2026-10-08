import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TimeDoctorService } from './timedoctor.service';

const superAdmin = { id: '9', role: 'employee', is_super_admin: true };
const superInCompany = {
  id: '9',
  role: 'employee',
  is_super_admin: true,
  organization_id: '10',
};

function makeService() {
  const database = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  };
  return {
    service: new TimeDoctorService(database as never),
    database,
  };
}

describe('TimeDoctorService company access', () => {
  it('asks a super-admin without a selected company to pick one', async () => {
    const { service, database } = makeService();
    await expect(service.listUsers(superAdmin, 99, 0, 20)).rejects.toMatchObject({
      message: 'Select a company',
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('blocks a super-admin from a company they did not select', async () => {
    const { service, database } = makeService();
    await expect(service.listUsers(superInCompany, 99, 0, 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it('lets a super-admin with a selected company read that company', async () => {
    const { service, database } = makeService();
    await service.listUsers(superInCompany, 10, 0, 20);
    expect(database.query).toHaveBeenCalled();
  });
});
