import { supabase } from '@/integrations/supabase/client';
import { calculateMergedHoursByUser } from '@/lib/time-utils';

export interface TimeLogRow {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  project_id: string | null;
  idle_seconds: number | null;
  deducted_seconds: number | null;
  organization_id: string | null;
  device_id?: string | null;
  duration_seconds?: number | null;
  users?: { full_name: string; email?: string } | null;
  projects?: { name: string } | null;
}

export interface TimeLogStats {
  totalHours: number;
  totalMinutes: number;
  activeUserIds: Set<string>;
  logs: TimeLogRow[];
}

export interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

interface FetchOptions {
  userId?: string;
  limit?: number;
  onlyCompleted?: boolean;
}

function applyOrgFilter<T>(query: T, ctx: OrgContext): T {
  if (ctx.organizationId && !ctx.isSuperAdmin) {
    return (query as any).eq('organization_id', ctx.organizationId);
  }
  return query;
}

export async function fetchTimeLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions
): Promise<TimeLogRow[]> {
  let query = supabase
    .from('time_logs')
    .select('*')
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString());

  query = applyOrgFilter(query, ctx);

  if (opts?.userId) {
    query = query.eq('user_id', opts.userId);
  }

  if (opts?.onlyCompleted) {
    query = query.not('end_time', 'is', null);
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  let logs = data || [];

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    logs = logs.filter((log: TimeLogRow) => ids.has(log.user_id));
  }

  return logs as TimeLogRow[];
}

export async function fetchDetailedTimeLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions
): Promise<TimeLogRow[]> {
  let query = supabase
    .from('time_logs')
    .select('*, users(full_name, email), projects(name)')
    .gte('start_time', start.toISOString())
    .lte('start_time', end.toISOString())
    .order('start_time', { ascending: false });

  query = applyOrgFilter(query, ctx);

  if (opts?.userId) {
    query = query.eq('user_id', opts.userId);
  }

  if (opts?.onlyCompleted) {
    query = query.not('end_time', 'is', null);
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  let logs = data || [];

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    logs = logs.filter((log: TimeLogRow) => ids.has(log.user_id));
  }

  return logs as TimeLogRow[];
}

export async function fetchActiveSession(
  userId: string,
  ctx: OrgContext
): Promise<TimeLogRow | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let query = supabase
    .from('time_logs')
    .select('*')
    .eq('user_id', userId)
    .is('end_time', null)
    .gte('start_time', today.toISOString())
    .order('start_time', { ascending: false })
    .limit(1);

  query = applyOrgFilter(query, ctx);

  const { data, error } = await query;
  if (error) throw error;

  return data?.[0] || null;
}

export function computeTimeLogStats(logs: TimeLogRow[]): TimeLogStats {
  const activeUserIds = new Set(logs.map((log) => log.user_id));

  // Use merged intervals per user to prevent double-counting from multi-device sessions
  const hoursByUser = calculateMergedHoursByUser(
    logs.filter(l => !!l.start_time).map(l => ({
      start_time: l.start_time,
      end_time: l.end_time,
      idle_seconds: l.idle_seconds,
      deducted_seconds: l.deducted_seconds,
      user_id: l.user_id,
    }))
  );

  let totalHours = 0;
  for (const hours of hoursByUser.values()) {
    totalHours += hours;
  }

  const roundedHours = Math.round(totalHours * 100) / 100;
  const totalMinutes = Math.round(totalHours * 60);
  return { totalHours: roundedHours, totalMinutes, activeUserIds, logs };
}
