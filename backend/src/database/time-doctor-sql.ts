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
 * Roles expected to meet the daily hours goal (Team Time, Check-in, pacing, low-hours).
 * Admins who track are included. Managers are omitted so they do not inflate under-hours metrics.
 */
export const HOURS_GOAL_PULSE_ROLES = ['employee', 'team_leader', 'admin'] as const;

export const HOURS_GOAL_PULSE_ROLES_SQL = `coalesce(ext.pulse_role, 'employee') IN ('employee', 'team_leader', 'admin')`;

/** Has signed into Pulse / the agent at least once (not merely invited). */
export const HOURS_GOAL_SIGNED_IN_SQL = `ext.signed_in_at IS NOT NULL`;

/**
 * Team Time / hours-goal grids omit managers and people who have never
 * signed in so they do not inflate under-hours metrics.
 * A specific-user lookup (self Coach, one employee) must still return hours.
 */
export function hoursGoalRosterSql(restrictToUserId?: string | null): string[] {
  if (restrictToUserId) return [];
  return [HOURS_GOAL_PULSE_ROLES_SQL, HOURS_GOAL_SIGNED_IN_SQL];
}

/** Header super-admins send to operate inside one company. Express lowercases it. */
export const PULSE_WORKSPACE_HEADER = 'x-pulse-workspace-id';

export const SELECT_PULSE_COMPANY_MESSAGE = 'Select a company';

/** Header or `pulseWorkspaceId` query — query survives API Gateway CORS allowlists. */
export function pulseWorkspaceFromRequest(
  headers?: Record<string, unknown>,
  query?: Record<string, unknown>,
): unknown {
  const fromHeader =
    headers?.[PULSE_WORKSPACE_HEADER] ?? headers?.['X-Pulse-Workspace-Id'];
  if (fromHeader != null && String(fromHeader).trim() !== '') {
    return fromHeader;
  }
  return query?.pulseWorkspaceId ?? query?.[PULSE_WORKSPACE_HEADER];
}

export function hasPulseWorkspace(
  user: Pick<ScopedAuthUser, 'organization_id'>,
): boolean {
  return Boolean(parseWorkspaceId(user.organization_id));
}

/** Platform operator — list/create companies; not a workspace membership. */
export function isPulsePlatformAdmin(
  user: Pick<ScopedAuthUser, 'is_super_admin'>,
): boolean {
  return Boolean(user.is_super_admin);
}

/**
 * Super-admins act as org admin only when a company is selected
 * (X-Pulse-Workspace-Id overlay). Missing org is never a cross-tenant bypass.
 */
export function isPulseOrgAdmin(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  if (user.is_super_admin) return hasPulseWorkspace(user);
  return user.role === 'admin';
}

/**
 * Org-wide Pulse dashboards/reports access.
 * Admin only — managers may manage users but do not get org report access.
 */
export function isPulseAdmin(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  return isPulseOrgAdmin(user);
}

/** Manager or team lead — may view direct reports (time/progress, not screenshots). */
export function isPulseTeamManager(user: Pick<ScopedAuthUser, 'role'>): boolean {
  return user.role === 'manager' || user.role === 'team_leader';
}

/** Admin or manager — may add/remove/update team members. */
export function canManagePulseUsers(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  if (user.is_super_admin) return hasPulseWorkspace(user);
  return user.role === 'admin' || user.role === 'manager';
}

/**
 * Admin only — may add/remove time on employee work days.
 * Managers invite users/projects; they cannot adjust hours.
 */
export function canAdjustPulseTime(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  return isPulseOrgAdmin(user);
}

/**
 * Org-wide / team time-progress reports (Team Time, individual employee).
 * Admin only — managers invite members and do not see team reports.
 */
export function canAccessPulseTeamReports(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  return isPulseOrgAdmin(user);
}

/**
 * Who may view the team directory (roster).
 * Admin/manager: full org. Team lead: their own team only (service-scoped).
 */
export function canViewPulseTeam(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  if (user.is_super_admin) return hasPulseWorkspace(user);
  return (
    user.role === 'admin' ||
    user.role === 'manager' ||
    user.role === 'team_leader'
  );
}

/** Only org admins may view other employees' screenshots. */
export function canViewOrgScreenshots(
  user: Pick<ScopedAuthUser, 'role' | 'is_super_admin' | 'organization_id'>,
): boolean {
  return isPulseOrgAdmin(user);
}

/** Why a super-admin tenant call should 403, or null if the request may continue. */
export function pulseTenantForbiddenMessage(
  user: Pick<ScopedAuthUser, 'is_super_admin' | 'organization_id'>,
): string | null {
  if (user.is_super_admin && !hasPulseWorkspace(user)) {
    return SELECT_PULSE_COMPANY_MESSAGE;
  }
  return null;
}

/**
 * Overlay selected company for platform operators.
 * Company admins keep their membership workspace; the header is ignored.
 */
export function applyPulseWorkspaceContext<T extends ScopedAuthUser>(
  user: T,
  headerValue: unknown,
): T {
  if (!user.is_super_admin) return user;
  const wsId = parseWorkspaceId(headerValue);
  return { ...user, organization_id: wsId ? String(wsId) : null };
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

/** Scope queries to a workspace. Missing org is fail-closed (no rows), never all tenants. */
export function workspaceScope(
  user: ScopedAuthUser,
  alias: string,
): { clause: string; params: unknown[] } {
  const wsId = parseWorkspaceId(user.organization_id);
  if (!wsId) return { clause: '1=0', params: [] };
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
    coalesce(ext.is_super_admin, false) AS is_super_admin,
    ext.signed_in_at::text AS signed_in_at,
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
    ext.country,
    ext.started_on::text AS started_on,
    ext.signed_in_at::text AS signed_in_at,
    (coalesce(ext.pulse_role, 'employee') = 'admin') AS is_org_admin,
    coalesce(ext.is_super_admin, false) AS is_super_admin
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
  if (Array.isArray(raw)) {
    return parseWorkspaceId(raw[0]);
  }
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
