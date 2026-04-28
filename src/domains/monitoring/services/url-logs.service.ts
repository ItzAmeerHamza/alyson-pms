import { supabase } from '@/integrations/supabase/client';
import { getLogDuration } from '@/lib/time-utils';
import { fetchPaginated } from '@/lib/supabase-utils';

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
  selectedUser?: string
): Promise<UrlLogRow[]> {
  let query = supabase
    .from('url_logs_compat')
    .select('site_url, domain, started_at, ended_at, duration_seconds, title, browser, user_id')
    .gte('started_at', start.toISOString())
    .lte('started_at', end.toISOString())
    .not('site_url', 'is', null)
    .not('site_url', 'ilike', '%browser-activity-detected.local%');

  if (selectedUser && selectedUser !== 'all') {
    query = query.eq('user_id', selectedUser);
  }

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    query = query.in('user_id', ctx.orgUserIds);
  }

  return await fetchPaginated<UrlLogRow>(query);
}

export function aggregateUrlUsage(logs: UrlLogRow[]): UrlUsageStat[] {
  const stats = new Map<string, { url: string; total: number; count: number; category: string }>();

  for (const log of logs) {
    const domain = log.domain || extractDomain(log.site_url || '');
    const dur = getLogDuration(log);
    const existing = stats.get(domain) || {
      url: log.site_url || '',
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
