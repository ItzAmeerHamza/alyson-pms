import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ScreenshotAiController } from './screenshot-ai.controller';

const admin = { id: '1', role: 'admin', organization_id: '10' };
const superAdmin = { id: '9', role: 'employee', is_super_admin: true };
const superInCompany = {
  id: '9',
  role: 'employee',
  is_super_admin: true,
  organization_id: '10',
};

function makeController() {
  const repo = {
    getStatusCounts: vi.fn(async () => ({
      pending: 1,
      queued: 0,
      processing: 0,
      completed: 2,
      failed: 0,
      skipped: 0,
      total: 3,
    })),
    resetFailedToPending: vi.fn(async () => 0),
  };
  const backfill = { enqueuePending: vi.fn(async () => ({ claimed: 0 })) };
  const queue = { isEnabled: vi.fn(() => true) };
  return {
    controller: new ScreenshotAiController(
      repo as never,
      backfill as never,
      queue as never,
    ),
    repo,
  };
}

describe('ScreenshotAiController status', () => {
  it('lets a company admin load status for their selected company', async () => {
    const { controller, repo } = makeController();
    const result = await controller.status({ user: admin });
    expect(result.counts.total).toBe(3);
    expect(repo.getStatusCounts).toHaveBeenCalledWith(10);
  });

  it('asks a super-admin without a selected company to pick one', async () => {
    const { controller, repo } = makeController();
    await expect(controller.status({ user: superAdmin })).rejects.toMatchObject({
      message: 'Select a company',
    });
    expect(repo.getStatusCounts).not.toHaveBeenCalled();
  });

  it('lets a super-admin with a selected company load status', async () => {
    const { controller, repo } = makeController();
    await controller.status({ user: superInCompany });
    expect(repo.getStatusCounts).toHaveBeenCalledWith(10);
  });

  it('blocks employees', async () => {
    const { controller, repo } = makeController();
    await expect(
      controller.status({ user: { id: '4', role: 'employee', organization_id: '10' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.getStatusCounts).not.toHaveBeenCalled();
  });
});
