import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ScopedAuthUser,
  parseTenantUserId,
  parseWorkspaceId,
} from '../database/time-doctor-sql';
import { normalizeWorkTimezone } from '../lib/work-timezone';
import { UsersService } from '../users/users.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceSettingsDto,
} from './dto/workspace-admin.dto';

export interface OrgSettings {
  hours_threshold: number;
  high_activity_threshold: number;
  low_activity_threshold: number;
  screenshot_interval_minutes: number;
  screenshot_count_per_window: number;
  screenshot_window_minutes: number;
  timezone: string;
}

export const WORKSPACE_SETTING_DEFAULTS: OrgSettings = {
  hours_threshold: 7,
  high_activity_threshold: 60,
  low_activity_threshold: 10,
  screenshot_interval_minutes: 5,
  screenshot_count_per_window: 2,
  screenshot_window_minutes: 10,
  timezone: normalizeWorkTimezone(null),
};

export function derivedScreenshotIntervalMinutes(
  windowMinutes: number,
  countPerWindow: number,
): number {
  const window = Math.max(1, Number(windowMinutes) || 1);
  const count = Math.max(1, Number(countPerWindow) || 1);
  return Math.max(1, Math.round(window / count));
}

export interface WorkspaceAdminView extends OrgSettings {
  organization_id: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
  } | null;
}

export function slugifyWorkspaceKey(name: string): string {
  const slug = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'workspace';
}

export function assertValidIanaTimezone(tz: string): string {
  const raw = String(tz || '').trim();
  if (!raw) {
    throw new BadRequestException('timezone is required');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    throw new BadRequestException('timezone must be a valid IANA name');
  }
}

function clampNumber(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const bounded = Math.min(Math.max(n, min), max);
  return integer ? Math.round(bounded) : bounded;
}

export function normalizeOrgSettings(
  raw: Record<string, unknown> | null | undefined,
  patch: Partial<OrgSettings> = {},
): OrgSettings {
  const src = raw && typeof raw === 'object' ? raw : {};
  const timezoneSource =
    typeof patch.timezone === 'string'
      ? patch.timezone
      : typeof src.timezone === 'string'
        ? src.timezone
        : WORKSPACE_SETTING_DEFAULTS.timezone;
  return {
    hours_threshold: clampNumber(
      patch.hours_threshold ?? src.hours_threshold,
      WORKSPACE_SETTING_DEFAULTS.hours_threshold,
      1,
      24,
    ),
    high_activity_threshold: clampNumber(
      patch.high_activity_threshold ?? src.high_activity_threshold,
      WORKSPACE_SETTING_DEFAULTS.high_activity_threshold,
      1,
      100,
    ),
    low_activity_threshold: clampNumber(
      patch.low_activity_threshold ?? src.low_activity_threshold,
      WORKSPACE_SETTING_DEFAULTS.low_activity_threshold,
      0,
      10,
    ),
    ...normalizeScreenshotSchedule(src, patch),
    timezone: assertValidIanaTimezone(timezoneSource),
  };
}

function normalizeScreenshotSchedule(
  src: Record<string, unknown>,
  patch: Partial<OrgSettings>,
): Pick<
  OrgSettings,
  | 'screenshot_interval_minutes'
  | 'screenshot_count_per_window'
  | 'screenshot_window_minutes'
> {
  const count = clampNumber(
    patch.screenshot_count_per_window ?? src.screenshot_count_per_window,
    WORKSPACE_SETTING_DEFAULTS.screenshot_count_per_window,
    1,
    8,
    true,
  );
  const windowMinutes = clampNumber(
    patch.screenshot_window_minutes ?? src.screenshot_window_minutes,
    WORKSPACE_SETTING_DEFAULTS.screenshot_window_minutes,
    5,
    120,
    true,
  );
  const schedulePatched =
    patch.screenshot_count_per_window != null ||
    patch.screenshot_window_minutes != null;
  const hasStoredSchedule =
    src.screenshot_count_per_window != null ||
    src.screenshot_window_minutes != null;
  const interval = clampNumber(
    schedulePatched || hasStoredSchedule
      ? derivedScreenshotIntervalMinutes(windowMinutes, count)
      : (patch.screenshot_interval_minutes ?? src.screenshot_interval_minutes),
    WORKSPACE_SETTING_DEFAULTS.screenshot_interval_minutes,
    1,
    120,
    true,
  );
  return {
    screenshot_count_per_window: count,
    screenshot_window_minutes: windowMinutes,
    screenshot_interval_minutes: interval,
  };
}

@Injectable()
export class WorkspaceAdminService {
  private readonly logger = new Logger(WorkspaceAdminService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
  ) {}

  async getAdminView(user: ScopedAuthUser): Promise<WorkspaceAdminView> {
    const wsId = parseWorkspaceId(user.organization_id);
    if (!wsId) {
      return {
        ...WORKSPACE_SETTING_DEFAULTS,
        organization_id: null,
        organization: null,
      };
    }

    const result = await this.db.query<{
      name: string;
      slug: string;
      is_active: boolean;
      settings: Record<string, unknown> | null;
    }>(
      `SELECT
         w.name,
         coalesce(nullif(lower(trim(w.key)), ''), w.id::text) AS slug,
         coalesce(w.active, true) AS is_active,
         ws.settings
       FROM tenant.workspace w
       LEFT JOIN time_doctor.workspace_settings ws ON ws.workspace_id = w.id
       WHERE w.id = $1
       LIMIT 1`,
      [wsId],
    );
    const row = result.rows[0];
    if (!row) {
      return {
        ...WORKSPACE_SETTING_DEFAULTS,
        organization_id: String(wsId),
        organization: null,
      };
    }
    const settings = normalizeOrgSettings(row.settings);
    return {
      organization_id: String(wsId),
      organization: {
        id: String(wsId),
        name: row.name,
        slug: row.slug,
        is_active: row.is_active,
      },
      ...settings,
    };
  }

  async updateSettings(
    user: ScopedAuthUser,
    dto: UpdateWorkspaceSettingsDto,
  ): Promise<WorkspaceAdminView> {
    const wsId = parseWorkspaceId(user.organization_id);
    if (!wsId) {
      throw new BadRequestException(
        'Your account is not linked to an organization',
      );
    }

    const current = await this.db.query<{ settings: Record<string, unknown> | null }>(
      `SELECT settings FROM time_doctor.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
      [wsId],
    );
    const settings = normalizeOrgSettings(current.rows[0]?.settings, dto);

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO time_doctor.workspace_settings (workspace_id, settings, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (workspace_id) DO UPDATE SET
           settings = COALESCE(time_doctor.workspace_settings.settings, '{}'::jsonb) || EXCLUDED.settings,
           updated_at = NOW()`,
        [wsId, JSON.stringify(settings)],
      );

      if (dto.name != null || dto.key != null) {
        const nextName = dto.name?.trim();
        const nextKey = dto.key ? slugifyWorkspaceKey(dto.key) : null;
        if (nextKey) {
          await this.assertKeyAvailable(client, nextKey, wsId);
        }
        await client.query(
          `UPDATE tenant.workspace
           SET name = COALESCE($2, name),
               key = COALESCE($3, key),
               last_modified = NOW()
           WHERE id = $1`,
          [wsId, nextName || null, nextKey],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw this.asWriteError(error, 'Failed to update workspace settings');
    } finally {
      client.release();
    }

    return this.getAdminView(user);
  }

  async createWorkspace(
    user: ScopedAuthUser,
    dto: CreateWorkspaceDto,
  ): Promise<{
    organization: { id: string; name: string; slug: string; is_active: boolean };
    settings: OrgSettings;
    project: { id: string; name: string };
    admin: Record<string, unknown>;
    bootstrapped_existing: boolean;
  }> {
    const adminEmail = dto.admin_email.trim().toLowerCase();
    const projectName = (dto.project_name || 'Default Project').trim();
    const creatorId = parseTenantUserId(user.id);

    const existingId = dto.existing_workspace_id
      ? parseWorkspaceId(dto.existing_workspace_id)
      : null;
    if (dto.existing_workspace_id && !existingId) {
      throw new BadRequestException('existing_workspace_id is invalid');
    }

    await this.assertAdminEmailAvailable(adminEmail, existingId);

    const client = await this.db.getClient();
    let workspaceId: number;
    let workspaceName: string;
    let workspaceKey: string;
    let projectId: string;
    const settings = normalizeOrgSettings({}, dto);
    try {
      await client.query('BEGIN');

      if (existingId) {
        const existing = await client.query<{
          id: number;
          name: string;
          key: string | null;
        }>(
          `SELECT id, name, key FROM tenant.workspace WHERE id = $1 LIMIT 1`,
          [existingId],
        );
        if (!existing.rows[0]) {
          throw new BadRequestException('Workspace not found');
        }
        workspaceId = existing.rows[0].id;
        workspaceName = dto.name?.trim() || existing.rows[0].name;
        workspaceKey = dto.key
          ? slugifyWorkspaceKey(dto.key)
          : existing.rows[0].key || slugifyWorkspaceKey(workspaceName);
        if (dto.name || dto.key) {
          if (dto.key) {
            await this.assertKeyAvailable(client, workspaceKey, workspaceId);
          }
          await client.query(
            `UPDATE tenant.workspace
             SET name = $2,
                 key = COALESCE($3, key),
                 last_modified = NOW()
             WHERE id = $1`,
            [workspaceId, workspaceName, dto.key ? workspaceKey : null],
          );
        }
      } else {
        const name = dto.name?.trim();
        if (!name) {
          throw new BadRequestException('name is required');
        }
        workspaceName = name;
        workspaceKey = dto.key
          ? slugifyWorkspaceKey(dto.key)
          : slugifyWorkspaceKey(name);
        await this.assertKeyAvailable(client, workspaceKey, null);

        const accountId = await this.ensureCreatorAccount(client, creatorId, adminEmail);
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO tenant.workspace (name, key, account_id, active, short_description, created, last_modified)
           VALUES ($1, $2, $3, true, $4, NOW(), NOW())
           RETURNING id`,
          [
            workspaceName,
            workspaceKey,
            accountId,
            'Alyson Pulse time-tracking company',
          ],
        );
        workspaceId = inserted.rows[0].id;
      }

      await this.linkCreatorAsOwner(client, creatorId, workspaceId);

      await client.query(
        `INSERT INTO time_doctor.workspace_settings (workspace_id, settings, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (workspace_id) DO UPDATE SET
           settings = COALESCE(time_doctor.workspace_settings.settings, '{}'::jsonb) || EXCLUDED.settings,
           updated_at = NOW()`,
        [workspaceId, JSON.stringify(settings)],
      );

      const existingProject = await client.query<{ id: string }>(
        `SELECT id::text AS id
         FROM time_doctor.projects
         WHERE workspace_id = $1 AND lower(trim(name)) = lower(trim($2))
         LIMIT 1`,
        [workspaceId, projectName],
      );
      if (existingProject.rows[0]) {
        projectId = existingProject.rows[0].id;
      } else {
        const createdProject = await client.query<{ id: string }>(
          `INSERT INTO time_doctor.projects (id, workspace_id, name, description, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
           RETURNING id::text AS id`,
          [
            workspaceId,
            projectName,
            'Default project for Alyson Pulse time tracking',
          ],
        );
        projectId = createdProject.rows[0].id;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw this.asWriteError(error, 'Failed to create workspace');
    } finally {
      client.release();
    }

    const admin = await this.users.createUser(
      { ...user, organization_id: String(workspaceId) },
      {
        email: adminEmail,
        first_name: dto.admin_first_name.trim(),
        last_name: dto.admin_last_name.trim(),
        role: 'admin',
        project_ids: [projectId],
      },
    );

    this.logger.log(
      `Pulse workspace ${workspaceId} (${workspaceName}) ready; admin ${adminEmail}`,
    );

    return {
      organization: {
        id: String(workspaceId),
        name: workspaceName,
        slug: workspaceKey,
        is_active: true,
      },
      settings,
      project: { id: projectId, name: projectName },
      admin,
      bootstrapped_existing: Boolean(existingId),
    };
  }

  private async assertAdminEmailAvailable(
    email: string,
    targetWorkspaceId: number | null,
  ): Promise<void> {
    const existing = await this.db.query<{ workspace_id: number | null }>(
      `SELECT ext.workspace_id
       FROM time_doctor.user_extensions ext
       JOIN tenant."user" u ON u.id = ext.user_id
       WHERE lower(u.email) = $1
       LIMIT 1`,
      [email],
    );
    const current = existing.rows[0]?.workspace_id ?? null;
    if (current && current !== targetWorkspaceId) {
      throw new BadRequestException(
        'That email is already assigned to another Pulse company. Use a different admin email.',
      );
    }
  }

  private async assertKeyAvailable(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
    key: string,
    currentWorkspaceId: number | null,
  ): Promise<void> {
    const result = await client.query(
      `SELECT 1
       FROM tenant.workspace
       WHERE lower(trim(key)) = $1
         AND ($2::int IS NULL OR id <> $2)
       LIMIT 1`,
      [key, currentWorkspaceId],
    );
    if (result.rows[0]) {
      throw new BadRequestException('That workspace key is already in use');
    }
  }

  private async ensureCreatorAccount(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
    creatorId: number,
    fallbackEmail: string,
  ): Promise<number> {
    const existing = await client.query(
      `SELECT id::text AS id FROM tenant.account WHERE user_id = $1::int LIMIT 1`,
      [creatorId],
    );
    if (existing.rows[0]) {
      return parseInt(existing.rows[0].id, 10);
    }
    const created = await client.query(
      `INSERT INTO tenant.account (name, user_id, contact_name, contact_email, active)
       VALUES ('default', $1::int, 'Admin', $2, true)
       RETURNING id::text AS id`,
      [creatorId, fallbackEmail],
    );
    return parseInt(created.rows[0].id, 10);
  }

  private async linkCreatorAsOwner(
    client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id?: string }> }> },
    creatorId: number,
    workspaceId: number,
  ): Promise<void> {
    const profile = await client.query(
      `SELECT id::text AS id FROM tenant.profile WHERE user_id = $1::int ORDER BY id LIMIT 1`,
      [creatorId],
    );
    const profileId = profile.rows[0]?.id;
    if (!profileId) return;
    const existing = await client.query(
      `SELECT 1
       FROM tenant.profile_workspace
       WHERE profile_id = $1::int AND workspace_id = $2
       LIMIT 1`,
      [profileId, workspaceId],
    );
    if (existing.rows[0]) return;
    await client.query(
      `INSERT INTO tenant.profile_workspace
         (profile_id, workspace_id, account_role, workspace_role, active)
       VALUES ($1::int, $2, 'seller', 'owner', true)`,
      [profileId, workspaceId],
    );
  }

  private asWriteError(error: unknown, fallback: string): BadRequestException {
    if (error instanceof BadRequestException) return error;
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.error(`${fallback}: ${detail}`);
    const permissionDenied = /permission denied/i.test(detail);
    return new BadRequestException(
      permissionDenied
        ? 'Failed to write workspace: database role is missing write grants (run migration 027_grant_tenant_workspace_write.sql as postgres)'
        : fallback,
    );
  }
}
