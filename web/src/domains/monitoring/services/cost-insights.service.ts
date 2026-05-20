import { supabase } from '@/integrations/supabase/client';

export interface StorageTotals {
  bytes: number;
  screenshot_count: number;
}

export interface StorageByUserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  bytes: number;
  screenshot_count: number;
  avg_bytes_per_shot: number;
}

export interface LlmTotals {
  completed_analyses: number;
  non_pattern_model_rows: number;
  rows_with_token_usage: number;
  total_deepseek_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  /** Sum of `deepseek_usage.text.*` across rows */
  text_prompt_tokens?: number;
  text_completion_tokens?: number;
  text_total_tokens?: number;
  /** Sum of `deepseek_usage.vision.*` across rows */
  vision_prompt_tokens?: number;
  vision_completion_tokens?: number;
  vision_total_tokens?: number;
  /** Mean total_tokens among rows that logged usage */
  avg_total_tokens_per_logged_row?: number;
}

export interface LlmByModelRow {
  ai_model_used: string;
  count: number;
}

/** Per stored `ai_model_used`, including token sums when logged */
export interface LlmTokensByModelRow {
  model: string;
  analysis_rows: number;
  rows_with_token_log: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface OrganizationCostInsights {
  organization_id: string;
  storage_totals: StorageTotals;
  storage_by_user: StorageByUserRow[];
  llm_totals: LlmTotals;
  llm_by_model: LlmByModelRow[];
  /** Present after DB migration `20260506120000_cost_insights_token_breakdown` */
  llm_tokens_by_model?: LlmTokensByModelRow[];
}

export interface OrgCostInsightsRpcError {
  error: 'not_authenticated' | 'forbidden';
}

export type OrgCostInsightsRpcResult = OrganizationCostInsights | OrgCostInsightsRpcError;

export async function fetchOrganizationCostInsights(
  organizationId: string,
): Promise<OrganizationCostInsights> {
  const { data, error } = await supabase.rpc('get_organization_cost_insights', {
    p_organization_id: organizationId,
  });

  if (error) {
    throw error;
  }

  const row = data as OrgCostInsightsRpcResult | null;
  if (!row || typeof row !== 'object') {
    throw new Error('Invalid cost insights response');
  }
  if ('error' in row && row.error === 'forbidden') {
    throw new Error('You do not have access to cost insights for this organization.');
  }
  if ('error' in row && row.error === 'not_authenticated') {
    throw new Error('Sign in required.');
  }

  return row as OrganizationCostInsights;
}

export interface DeepseekAccountInsightsResponse {
  ok: boolean;
  models_status: number;
  balance_status: number;
  models: unknown;
  balance: unknown;
}

export async function fetchDeepseekAccountInsights(): Promise<DeepseekAccountInsightsResponse> {
  const { data, error } = await supabase.functions.invoke<DeepseekAccountInsightsResponse>(
    'deepseek-account-insights',
    { body: {} },
  );

  if (error) {
    throw error;
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Empty response from deepseek-account-insights');
  }
  return data;
}
