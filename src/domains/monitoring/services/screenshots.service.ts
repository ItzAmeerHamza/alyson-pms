import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';

export interface ScreenshotRow {
  id: string;
  user_id: string;
  image_url?: string | null;
  file_path?: string | null;
  captured_at: string;
  activity_percent?: number | null;
  ai_analysis_status?: string | null;
  is_duplicate?: boolean | null;
  idle_inferred?: boolean | null;
  agent_version?: string | null;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

interface FetchOptions {
  userId?: string;
  userIds?: string[];
  limit?: number;
  orderBy?: string;
  ascending?: boolean;
  aiStatus?: string | null;
  isDuplicate?: boolean;
  idleInferred?: boolean;
}

function applyUserFilter<T>(query: T, ctx: OrgContext, opts?: FetchOptions): T {
  if (opts?.userId) {
    return (query as any).eq('user_id', opts.userId);
  }
  if (opts?.userIds?.length) {
    return (query as any).in('user_id', opts.userIds);
  }
  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    return (query as any).in('user_id', ctx.orgUserIds);
  }
  return query;
}

export async function fetchScreenshots(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: FetchOptions
): Promise<ScreenshotRow[]> {
  let query = supabase
    .from('screenshots')
    .select('id, user_id, image_url, file_path, captured_at, activity_percent, ai_analysis_status, is_duplicate, idle_inferred, agent_version')
    .gte('captured_at', start.toISOString())
    .lte('captured_at', end.toISOString());

  query = applyUserFilter(query, ctx, opts);

  if (opts?.aiStatus !== undefined) {
    if (opts.aiStatus === null) {
      query = query.is('ai_analysis_status', null);
    } else {
      query = query.eq('ai_analysis_status', opts.aiStatus);
    }
  }

  if (opts?.isDuplicate !== undefined) {
    query = query.eq('is_duplicate', opts.isDuplicate);
  }

  if (opts?.idleInferred !== undefined) {
    query = query.eq('idle_inferred', opts.idleInferred);
  }

  if (opts?.orderBy) {
    query = query.order(opts.orderBy, { ascending: opts.ascending ?? false });
  }

  const attachSignedUrls = async (rows: ScreenshotRow[]) => {
    // Storage bucket is private in production; use signed URLs.
    const out = await Promise.all(
      rows.map(async (row) => {
        const filePath = row.file_path;
        if (!filePath) return row;
        const { data } = await supabase.storage.from('screenshots').createSignedUrl(filePath, 60 * 60);
        return { ...row, image_url: data?.signedUrl || row.image_url || null };
      })
    );
    return out;
  };

  if (opts?.limit) {
    query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error) throw error;
    return await attachSignedUrls((data || []) as ScreenshotRow[]);
  }
  const rows = await fetchPaginated<ScreenshotRow>(query);
  return await attachSignedUrls(rows);
}

export async function countScreenshots(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: Omit<FetchOptions, 'limit' | 'orderBy' | 'ascending'>
): Promise<number> {
  let query = supabase
    .from('screenshots')
    .select('id', { count: 'exact', head: true })
    .gte('captured_at', start.toISOString())
    .lte('captured_at', end.toISOString());

  query = applyUserFilter(query, ctx, opts);

  if (opts?.aiStatus !== undefined) {
    if (opts.aiStatus === null) {
      query = query.is('ai_analysis_status', null);
    } else {
      query = query.eq('ai_analysis_status', opts.aiStatus);
    }
  }

  if (opts?.isDuplicate !== undefined) {
    query = query.eq('is_duplicate', opts.isDuplicate);
  }

  if (opts?.idleInferred !== undefined) {
    query = query.eq('idle_inferred', opts.idleInferred);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

export async function fetchLatestAgentVersions(
  ctx: OrgContext,
  opts?: { userIds?: string[]; limit?: number }
): Promise<ScreenshotRow[]> {
  let query = supabase
    .from('screenshots')
    .select('id, user_id, agent_version, captured_at')
    .not('agent_version', 'is', null)
    .order('captured_at', { ascending: false });

  if (opts?.userIds?.length) {
    query = query.in('user_id', opts.userIds);
  } else if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    query = query.in('user_id', ctx.orgUserIds);
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ScreenshotRow[];
  }
  return await fetchPaginated<ScreenshotRow>(query);
}
