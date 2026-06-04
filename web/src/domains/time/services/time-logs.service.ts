import { backendGet } from '@/lib/backend-api';
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

export async function fetchTimeLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions
): Promise<TimeLogRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  });
  if (opts?.userId) params.set('userId', opts.userId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const logs = await backendGet<TimeLogRow[]>(`/data/time-logs?${params.toString()}`);
  if (opts?.onlyCompleted) {
    return logs.filter((l) => Boolean(l.end_time));
  }
  return logs;
}

export async function fetchDetailedTimeLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions
): Promise<TimeLogRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    detailed: '1',
  });
  if (opts?.userId) params.set('userId', opts.userId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const logs = await backendGet<TimeLogRow[]>(`/data/time-logs?${params.toString()}`);
  if (opts?.onlyCompleted) {
    return logs.filter((l) => Boolean(l.end_time));
  }
  return logs;
}

export async function fetchActiveSession(
  userId: string,
  ctx: OrgContext
): Promise<TimeLogRow | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date();
  const params = new URLSearchParams({
    start: today.toISOString(),
    end: end.toISOString(),
    userId,
    limit: '20',
  });
  const logs = await backendGet<TimeLogRow[]>(`/data/time-logs?${params.toString()}`);
  return logs.find((l) => !l.end_time) || null;
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
