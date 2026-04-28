import { supabase } from '@/integrations/supabase/client';

export interface AiInsightRow {
  id?: string;
  user_id: string;
  period_start: string;
  period_end: string;
  productivity_score?: number | null;
  summary?: string | null;
  recommendations?: string | null;
  created_at?: string | null;
  users?: { full_name: string; email?: string } | null;
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
  opts?: { userId?: string; limit?: number }
): Promise<AiInsightRow[]> {
  let query = supabase
    .from('ai_employee_insights')
    .select('*, users(full_name, email)')
    .gte('period_start', start.toISOString())
    .lte('period_start', end.toISOString())
    .order('created_at', { ascending: false });

  if (opts?.userId) {
    query = query.eq('user_id', opts.userId);
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data || []) as AiInsightRow[];

  if (ctx.organizationId && !ctx.isSuperAdmin && ctx.orgUserIds?.length) {
    const ids = new Set(ctx.orgUserIds);
    rows = rows.filter((r) => ids.has(r.user_id));
  }

  return rows;
}

export async function fetchLatestAiInsight(): Promise<AiInsightRow | null> {
  const { data, error } = await supabase
    .from('ai_employee_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function fetchOrganizations(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data || []) as { id: string; name: string }[];
}
