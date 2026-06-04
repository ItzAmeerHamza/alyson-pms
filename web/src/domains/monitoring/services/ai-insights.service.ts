import { backendGet } from '@/lib/backend-api';

export interface AiInsightRow {
  id?: string;
  user_id: string;
  period_start: string;
  period_end: string;
  productivity_score?: number | null;
  summary?: string | null;
  recommendations?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  insights?: Record<string, unknown>;
  analysis_version?: string | null;
  users?: { id: string; full_name: string; email?: string; role?: string; organization_id?: string | null } | null;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
  orgUserIds?: string[];
}

export async function fetchAiInsights(
  start: Date,
  end: Date,
  ctx: OrgContext,
  opts?: { userId?: string; limit?: number },
): Promise<AiInsightRow[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: String(opts?.limit ?? 5000),
  });
  if (opts?.userId) params.set('userId', opts.userId);

  let rows = await backendGet<AiInsightRow[]>(`/data/ai-insights?${params.toString()}`);

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    rows = rows.filter((r) => ids.has(r.user_id));
  }

  return rows;
}

export async function fetchLatestAiInsight(): Promise<AiInsightRow | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  const rows = await backendGet<AiInsightRow[]>(
    `/data/ai-insights?start=${start.toISOString()}&end=${end.toISOString()}&limit=1`,
  );
  return rows[0] || null;
}

export async function fetchOrganizations(): Promise<{ id: string; name: string; slug?: string; logo_url?: string }[]> {
  return backendGet('/data/organizations');
}
