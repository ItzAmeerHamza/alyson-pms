import { backendGet } from '@/lib/backend-api';

export interface IdleLogRow {
  id?: string;
  user_id: string;
  idle_start: string;
  idle_end: string | null;
  duration_seconds: number | null;
  project_id?: string | null;
  organization_id?: string | null;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

interface FetchOptions {
  userId?: string;
  projectId?: string;
}

export async function fetchIdleLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions,
): Promise<IdleLogRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '10000',
  });
  if (opts?.userId) params.set('userId', opts.userId);

  let rows = await backendGet<IdleLogRow[]>(`/data/idle-logs?${params.toString()}`);

  if (opts?.projectId) {
    rows = rows.filter((r) => r.project_id === opts.projectId);
  }

  return rows;
}

export function computeIdleStats(logs: IdleLogRow[]) {
  const totalIdleSeconds = logs.reduce((sum, log) => sum + (log.duration_seconds || 0), 0);
  const uniqueUsers = new Set(logs.map((l) => l.user_id));
  return {
    totalIdleSeconds,
    totalIdleHours: Math.round((totalIdleSeconds / 3600) * 100) / 100,
    uniqueUserCount: uniqueUsers.size,
    logCount: logs.length,
  };
}
