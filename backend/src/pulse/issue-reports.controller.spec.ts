import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IssueReportsController } from './issue-reports.controller';

const employee = { id: '4', role: 'employee', organization_id: '10', email: 'a@tavilo.ai' };
const admin = { id: '2', role: 'admin', organization_id: '10', email: 'admin@tavilo.ai' };
const superAdmin = { id: '9', role: 'employee', is_super_admin: true, email: 'root@tavilo.ai' };

function makeController() {
  const reports = {
    create: vi.fn(async () => ({ id: 'rep-1', created_at: '2026-10-12T00:00:00.000Z' })),
    list: vi.fn(async () => []),
  };
  return { controller: new IssueReportsController(reports as never), reports };
}

const body = {
  category: 'screenshots' as const,
  message: 'Screenshots stopped after I locked the screen.',
};

describe('IssueReportsController', () => {
  it('lets a signed-in employee send a report', async () => {
    const { controller, reports } = makeController();
    await controller.create({ user: employee }, body);
    expect(reports.create).toHaveBeenCalledWith(employee, body);
  });

  it('lets an org admin list reports for the selected company', async () => {
    const { controller, reports } = makeController();
    await controller.list({ user: admin }, { limit: 25 });
    expect(reports.list).toHaveBeenCalledWith(10, 25);
  });

  it('hides the inbox from employees', async () => {
    const { controller, reports } = makeController();
    await expect(controller.list({ user: employee }, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.list).not.toHaveBeenCalled();
  });

  it('asks a super-admin to pick a company first', async () => {
    const { controller } = makeController();
    await expect(controller.list({ user: superAdmin }, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a super-admin list reports after a company is selected', async () => {
    const { controller, reports } = makeController();
    const scoped = { ...superAdmin, organization_id: '10' };
    await controller.list({ user: scoped }, {});
    expect(reports.list).toHaveBeenCalledWith(10, 50);
  });

  it('hides the inbox from managers', async () => {
    const { controller, reports } = makeController();
    const manager = { id: '3', role: 'manager', organization_id: '10', email: 'lead@tavilo.ai' };
    await expect(controller.list({ user: manager }, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(reports.list).not.toHaveBeenCalled();
  });
});
