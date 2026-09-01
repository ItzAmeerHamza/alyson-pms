import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  assertValidIanaTimezone,
  normalizeOrgSettings,
  slugifyWorkspaceKey,
  WorkspaceAdminService,
} from './workspace-admin.service';

describe('workspace admin helpers', () => {
  it('slugifies company names', () => {
    expect(slugifyWorkspaceKey('Acme Corp')).toBe('acme-corp');
    expect(slugifyWorkspaceKey('  Hello!!! World  ')).toBe('hello-world');
  });

  it('rejects invalid IANA timezones', () => {
    expect(assertValidIanaTimezone('America/Chicago')).toBe('America/Chicago');
    expect(() => assertValidIanaTimezone('Not/AZone')).toThrow(BadRequestException);
  });

  it('clamps settings and applies patches', () => {
    const settings = normalizeOrgSettings(
      { hours_threshold: 7, low_activity_threshold: 30 },
      { hours_threshold: 8, timezone: 'America/New_York' },
    );
    expect(settings.hours_threshold).toBe(8);
    expect(settings.low_activity_threshold).toBe(10);
    expect(settings.timezone).toBe('America/New_York');
    expect(settings.screenshot_interval_minutes).toBe(5);
    expect(settings.screenshot_count_per_window).toBe(2);
    expect(settings.screenshot_window_minutes).toBe(10);
  });

  it('stores a custom random screenshot schedule and derives report interval', () => {
    const settings = normalizeOrgSettings(
      {},
      { screenshot_count_per_window: 3, screenshot_window_minutes: 20, timezone: 'UTC' },
    );
    expect(settings.screenshot_count_per_window).toBe(3);
    expect(settings.screenshot_window_minutes).toBe(20);
    expect(settings.screenshot_interval_minutes).toBe(7);
  });
});

describe('WorkspaceAdminService.createWorkspace', () => {
  function makeService() {
    const queries: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        queries.push({ text, params });
        if (text.startsWith('BEGIN') || text.startsWith('COMMIT') || text.startsWith('ROLLBACK')) {
          return { rows: [] };
        }
        if (text.includes('INSERT INTO tenant.workspace')) {
          return { rows: [{ id: 99 }] };
        }
        if (text.includes('INSERT INTO time_doctor.projects')) {
          return { rows: [{ id: 'proj-1' }] };
        }
        if (text.includes('FROM tenant.account')) {
          return { rows: [{ id: '7' }] };
        }
        if (text.includes('FROM tenant.profile')) {
          return { rows: [{ id: '3' }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const db = {
      query: vi.fn(async (text: string) => {
        if (text.includes('user_extensions')) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      getClient: vi.fn(async () => client),
    };
    const users = {
      createUser: vi.fn(async () => ({
        id: '55',
        email: 'admin@acme.test',
        role: 'admin',
        invite_email_sent: true,
      })),
    };
    return {
      service: new WorkspaceAdminService(db as never, users as never),
      db,
      users,
      client,
      queries,
    };
  }

  const admin = { id: '12', role: 'admin', organization_id: '10' };

  it('creates a workspace, settings, project, and invites the first admin', async () => {
    const { service, users, client } = makeService();
    const result = await service.createWorkspace(admin, {
      name: 'Acme Corp',
      timezone: 'America/Chicago',
      hours_threshold: 8,
      admin_email: 'admin@acme.test',
      admin_first_name: 'Ada',
      admin_last_name: 'Admin',
    });

    expect(result.organization.id).toBe('99');
    expect(result.organization.name).toBe('Acme Corp');
    expect(result.settings.timezone).toBe('America/Chicago');
    expect(result.settings.hours_threshold).toBe(8);
    expect(result.project.name).toBe('Default Project');
    expect(result.bootstrapped_existing).toBe(false);
    expect(users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: '99' }),
      expect.objectContaining({
        email: 'admin@acme.test',
        role: 'admin',
        project_ids: ['proj-1'],
      }),
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('refuses an admin email already assigned to another Pulse company', async () => {
    const { service, db, users } = makeService();
    db.query.mockResolvedValueOnce({ rows: [{ workspace_id: 10 }] });
    await expect(
      service.createWorkspace(admin, {
        name: 'Other Co',
        admin_email: 'taken@acme.test',
        admin_first_name: 'Ada',
        admin_last_name: 'Admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.createUser).not.toHaveBeenCalled();
  });
});
