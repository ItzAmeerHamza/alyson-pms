import { backendGet } from '@/lib/backend-api';
import { getLogDuration } from '@/lib/time-utils';

export interface AppLogRow {
  id?: string;
  app_name: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  window_title: string | null;
  category: string | null;
  user_id?: string;
  organization_id?: string | null;
  timestamp?: string | null;
}

export interface AppUsageStat {
  app_name: string;
  total_duration: number;
  total_sessions: number;
  avg_duration: number;
  category: string;
  percentage: number;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

export async function fetchAppLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  selectedUser?: string,
): Promise<AppLogRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '10000',
  });
  if (selectedUser && selectedUser !== 'all') {
    params.set('userId', selectedUser);
  }

  const rows = await backendGet<AppLogRow[]>(`/data/app-logs?${params.toString()}`);

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    return rows.filter((r) => r.user_id && ids.has(r.user_id));
  }
  return rows;
}

export function aggregateAppUsage(logs: AppLogRow[]): AppUsageStat[] {
  const stats = new Map<string, { total: number; count: number; category: string }>();

  for (const log of logs) {
    const name = log.app_name || 'Unknown App';
    const dur = getLogDuration(log);
    const existing = stats.get(name) || { total: 0, count: 0, category: log.category || 'Other' };
    existing.total += dur;
    existing.count += 1;
    stats.set(name, existing);
  }

  const totalDuration = Array.from(stats.values()).reduce((s, v) => s + v.total, 0);

  return Array.from(stats.entries())
    .map(([app_name, v]) => ({
      app_name,
      total_duration: v.total,
      total_sessions: v.count,
      avg_duration: v.count > 0 ? Math.round(v.total / v.count) : 0,
      category: v.category,
      percentage: totalDuration > 0 ? Math.round((v.total / totalDuration) * 100) : 0,
    }))
    .sort((a, b) => b.total_duration - a.total_duration);
}
