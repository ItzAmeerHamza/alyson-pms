import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';

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
  opts?: FetchOptions
): Promise<IdleLogRow[]> {
  let query = supabase
    .from('idle_logs')
    .select('id, user_id, idle_start, idle_end, duration_seconds, project_id, organization_id')
    .gte('idle_start', start.toISOString())
    .lte('idle_start', end.toISOString())
    .order('idle_start', { ascending: false });

  if (opts?.userId) {
    query = query.eq('user_id', opts.userId);
  }

  if (opts?.projectId) {
    query = query.eq('project_id', opts.projectId);
  }

  if (ctx.organizationId && !ctx.isSuperAdmin) {
    query = query.eq('organization_id', ctx.organizationId);
  }

  return await fetchPaginated<IdleLogRow>(query);
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
