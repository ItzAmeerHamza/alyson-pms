import { supabase } from '@/integrations/supabase/client';
import { getLogDuration } from '@/lib/time-utils';
import { fetchPaginated } from '@/lib/supabase-utils';

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
  selectedUser?: string
): Promise<AppLogRow[]> {
  let query = supabase
    .from('app_logs')
    .select('app_name, started_at, ended_at, duration_seconds, window_title, category, user_id')
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString())
    .not('app_name', 'is', null);

  if (selectedUser && selectedUser !== 'all') {
    query = query.eq('user_id', selectedUser);
  }

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    query = query.in('user_id', ctx.orgUserIds);
  }

  return await fetchPaginated<AppLogRow>(query);
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
