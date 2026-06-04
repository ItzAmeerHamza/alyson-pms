import { backendGet } from '@/lib/backend-api';
import { getLogDuration } from '@/lib/time-utils';

export interface UrlLogRow {
  id?: string;
  site_url: string | null;
  domain: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  title: string | null;
  browser: string | null;
  category: string | null;
  user_id?: string;
  url?: string | null;
  timestamp?: string | null;
}

export interface UrlUsageStat {
  domain: string;
  site_url: string;
  total_duration: number;
  total_visits: number;
  avg_duration: number;
  category: string;
  percentage: number;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

function extractDomain(url: string): string {
  try {
    if (!url) return 'Unknown';
    if (!url.startsWith('http')) url = 'https://' + url;
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url || 'Unknown';
  }
}

export async function fetchUrlLogs(
  start: Date,
  end: Date,
  ctx: OrgContext,
  selectedUser?: string,
): Promise<UrlLogRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '10000',
  });
  if (selectedUser && selectedUser !== 'all') {
    params.set('userId', selectedUser);
  }

  const rows = await backendGet<UrlLogRow[]>(`/data/url-logs?${params.toString()}`);

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    return rows.filter((r) => r.user_id && ids.has(r.user_id));
  }
  return rows;
}

export function aggregateUrlUsage(logs: UrlLogRow[]): UrlUsageStat[] {
  const stats = new Map<string, { url: string; total: number; count: number; category: string }>();

  for (const log of logs) {
    const siteUrl = log.site_url || log.url || '';
    const domain = log.domain || extractDomain(siteUrl);
    const dur = getLogDuration(log);
    const existing = stats.get(domain) || {
      url: siteUrl,
      total: 0,
      count: 0,
      category: log.category || 'Other',
    };
    existing.total += dur;
    existing.count += 1;
    stats.set(domain, existing);
  }

  const totalDuration = Array.from(stats.values()).reduce((s, v) => s + v.total, 0);

  return Array.from(stats.entries())
    .map(([domain, v]) => ({
      domain,
      site_url: v.url,
      total_duration: v.total,
      total_visits: v.count,
      avg_duration: v.count > 0 ? Math.round(v.total / v.count) : 0,
      category: v.category,
      percentage: totalDuration > 0 ? Math.round((v.total / totalDuration) * 100) : 0,
    }))
    .sort((a, b) => b.total_duration - a.total_duration);
}
