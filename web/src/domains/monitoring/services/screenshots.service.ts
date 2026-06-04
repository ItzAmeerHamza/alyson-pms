import { backendGet } from '@/lib/backend-api';
import { resolveScreenshotImageUrl } from '@/lib/screenshot-image-url';

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
  start?: Date;
  end?: Date;
  userId?: string;
  userIds?: string[];
  limit?: number;
  orderBy?: string;
  ascending?: boolean;
  aiStatus?: string | null;
  isDuplicate?: boolean;
  idleInferred?: boolean;
}

export async function fetchScreenshots(
  ctx: OrgContext,
  opts?: FetchOptions,
): Promise<ScreenshotRow[]> {
  const params = new URLSearchParams();
  if (opts?.start) params.set('start', opts.start.toISOString());
  if (opts?.end) params.set('end', opts.end.toISOString());
  if (opts?.userId) params.set('userId', opts.userId);
  if (opts?.limit) params.set('limit', String(opts.limit));

  const query = params.toString();
  const rows = await backendGet<ScreenshotRow[]>(
    `/data/screenshots${query ? `?${query}` : ''}`,
  );
  let filtered = rows;
  if (opts?.userIds?.length) {
    const ids = new Set(opts.userIds);
    filtered = filtered.filter((r) => ids.has(r.user_id));
  }
  if (opts?.aiStatus !== undefined) {
    filtered = filtered.filter((r) =>
      opts.aiStatus === null ? !r.ai_analysis_status : r.ai_analysis_status === opts.aiStatus,
    );
  }
  if (opts?.isDuplicate !== undefined) {
    filtered = filtered.filter((r) => Boolean(r.is_duplicate) === opts.isDuplicate);
  }
  if (opts?.idleInferred !== undefined) {
    filtered = filtered.filter((r) => Boolean(r.idle_inferred) === opts.idleInferred);
  }
  return filtered.map((row) => ({
    ...row,
    image_url: resolveScreenshotImageUrl(row) || row.image_url,
  }));
}

export async function countScreenshots(
  ctx: OrgContext,
  opts?: Omit<FetchOptions, 'orderBy' | 'ascending'>,
): Promise<number> {
  const rows = await fetchScreenshots(ctx, opts);
  return rows.length;
}

export async function fetchLatestAgentVersions(
  ctx: OrgContext,
  opts?: { userIds?: string[]; limit?: number },
): Promise<ScreenshotRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  let rows = await fetchScreenshots(ctx, { start, end, limit: opts?.limit || 500 });
  rows = rows.filter((r) => !!r.agent_version);
  if (opts?.userIds?.length) {
    const ids = new Set(opts.userIds);
    rows = rows.filter((r) => ids.has(r.user_id));
  }
  return rows;
}
