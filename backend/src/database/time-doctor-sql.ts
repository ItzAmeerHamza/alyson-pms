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

export function isPulseAdmin(user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>): boolean {
  return Boolean(
    user.is_super_admin || user.role === 'admin' || user.role === 'manager',
  );
}

/** Admin or super-admin — org-wide Pulse access (all employees). */
export function isPulseOrgAdmin(user: Pick<ScopedAuthUser, 'role' | 'is_super_admin'>): boolean {
  return Boolean(user.is_super_admin || user.role === 'admin');
}

/** Manager or team lead — may view direct reports. */
export function isPulseTeamManager(user: Pick<ScopedAuthUser, 'role'>): boolean {
  return user.role === 'manager' || user.role === 'team_leader';
}

/** Non-admins may only access their own tenant.user id. */
export function scopedPulseUserId(
  user: ScopedAuthUser,
  requestedUserId?: string,
): string {
  if (isPulseAdmin(user)) {
    return requestedUserId ?? user.id;
  }
  return user.id;
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
    true AS is_active,
    ext.paused_at,
    ext.paused_by::text AS paused_by,
    ext.pause_reason,
    ext.last_activity,
    ext.workspace_id::text AS organization_id,
    ext.manager_id::text AS manager_id,
    ext.department,
    ext.location,
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
