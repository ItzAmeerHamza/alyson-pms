/** Shared SQL for tenant.user + time_doctor schema (Palisade revclouddb).
 *  Do NOT query public.users / public.organizations — those are legacy Supabase tables.
 */

export interface ScopedAuthUser {
  id: string;
  role?: string;
  organization_id?: string | null;
  is_super_admin?: boolean;
}

/** Roles that may run the desktop agent and appear in hours reports. */
export const TRACKABLE_PULSE_ROLES = [
  'employee',
  'team_leader',
  'admin',
  'manager',
] as const;

export const TRACKABLE_PULSE_ROLES_SQL = `ext.pulse_role IN ('employee', 'team_leader', 'admin', 'manager')`;

/**
 * Org-wide Pulse dashboards/reports access.
 * Admin only — managers may manage users but do not get org report access.
 */
export function isPulseAdmin(user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>): boolean {
  return Boolean(user.is_super_admin || user.role === 'admin');
}

/** Admin or super-admin — org-wide Pulse access (all employees). */
export function isPulseOrgAdmin(user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>): boolean {
  return Boolean(user.is_super_admin || user.role === 'admin');
}

/** Manager or team lead — may view direct reports (time/progress, not screenshots). */
export function isPulseTeamManager(user: Pick<ScopedAuthUser, 'role'>): boolean {
  return user.role === 'manager' || user.role === 'team_leader';
}

/** Admin or manager — may add/remove/update team members. */
export function canManagePulseUsers(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>,
): boolean {
  return Boolean(
    user.is_super_admin || user.role === 'admin' || user.role === 'manager',
  );
}

/**
 * Admin or manager — may add/remove time on employee work days.
 * Employees, team leads, and delegated viewers cannot adjust.
 */
export function canAdjustPulseTime(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>,
): boolean {
  return canManagePulseUsers(user);
}

/**
 * Org-wide / team time-progress reports (Team Time, individual employee).
 * Admin and manager — team leads see their own report only.
 */
export function canAccessPulseTeamReports(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>,
): boolean {
  return Boolean(
    user.is_super_admin || user.role === 'admin' || user.role === 'manager',
  );
}

/**
 * Who may view the team directory (roster).
 * Admin/manager: full org. Team lead: their own team only (service-scoped).
 */
export function canViewPulseTeam(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>,
): boolean {
  return Boolean(
    user.is_super_admin ||
      user.role === 'admin' ||
      user.role === 'manager' ||
      user.role === 'team_leader',
  );
}

/** Only org admins may view other employees' screenshots. */
export function canViewOrgScreenshots(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>,
): boolean {
  return isPulseOrgAdmin(user);
}

/**
 * Resolve which user id a caller is asking for.
 * Authorization (role / access grant) is enforced separately via canAccessUserData.
 */
export function scopedPulseUserId(
  user: ScopedAuthUser,
  requestedUserId?: string,
): string {
  return requestedUserId ?? user.id;
}

/** Scope queries to a workspace (organization_id in JWT = tenant.workspace.id). */
export function workspaceScope(
  user: ScopedAuthUser,
  alias: string,
): { clause: string; params: unknown[] } {
  if (user.is_super_admin || !user.organization_id) {
    return { clause: '1=1', params: [] };
  }
  const wsId = parseWorkspaceId(user.organization_id);
  if (!wsId) return { clause: '1=1', params: [] };
  return { clause: `${alias}.workspace_id = $1`, params: [wsId] };
}

export const USER_PROFILE_SELECT = `
  SELECT
    u.id::text AS id,
    u.email,
    trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
    coalesce(ext.pulse_role, 'employee') AS role,
    u.image_uri AS avatar_url,
    ext.workspace_id::text AS organization_id,
    ext.cognito_sub,
    (coalesce(ext.pulse_role, 'employee') = 'admin') AS is_org_admin,
    false AS is_super_admin,
    coalesce(ext.created_at, u.created::timestamptz)::text AS created_at,
    coalesce(ext.updated_at, u.last_modified::timestamptz)::text AS updated_at
  FROM tenant."user" u
  LEFT JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
`;

export const WORKSPACE_AS_ORG_SELECT = `
  SELECT
    w.id::text AS id,
    w.name,
    coalesce(nullif(lower(trim(w.key)), ''), w.id::text) AS slug,
    w.image_uri AS logo_url,
    coalesce(w.active, true) AS is_active
  FROM tenant.workspace w
`;

/** List/detail user rows for admin APIs (integer ids as text). */
export const EMPLOYEE_USER_SELECT = `
  SELECT
    u.id::text AS id,
    u.email,
    trim(both ' ' from coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS full_name,
    coalesce(ext.pulse_role, 'employee') AS role,
    u.image_uri AS avatar_url,
    (ext.paused_at IS NULL) AS is_active,
    ext.paused_at,
    ext.paused_by::text AS paused_by,
    ext.pause_reason,
    ext.last_activity,
    ext.workspace_id::text AS organization_id,
    ext.manager_id::text AS manager_id,
    ext.department,
    ext.location,
    ext.started_on::text AS started_on,
    (coalesce(ext.pulse_role, 'employee') = 'admin') AS is_org_admin,
    false AS is_super_admin
  FROM tenant."user" u
  JOIN time_doctor.user_extensions ext ON ext.user_id = u.id
`;

export function parseTenantUserId(raw: unknown): number {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) {
    throw new Error(`Invalid user_id (expected tenant.user integer, got: ${s.slice(0, 64)})`);
  }
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Invalid user_id');
  }
  return n;
}

export function parseWorkspaceId(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
