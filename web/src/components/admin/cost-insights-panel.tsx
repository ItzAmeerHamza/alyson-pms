import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  fetchOrganizationCostInsights,
  fetchDeepseekAccountInsights,
  type OrganizationCostInsights,
  type DeepseekAccountInsightsResponse,
  type LlmTokensByModelRow,
} from '@/domains/monitoring/services/cost-insights.service';

/** Planning-only placeholder rates (USD per 1M tokens); confirm against current DeepSeek pricing. */
const INDICATIVE_USD_PROMPT_PER_1M = 0.14;
const INDICATIVE_USD_COMPLETION_PER_1M = 0.42;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

function formatTokensCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function pct(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return '0%';
  return `${Math.min(100, Math.round((100 * part) / whole))}%`;
}

function indicativeSpendUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens / 1_000_000) * INDICATIVE_USD_PROMPT_PER_1M +
    (completionTokens / 1_000_000) * INDICATIVE_USD_COMPLETION_PER_1M
  );
}

function summarizeDeepseekBalance(balance: unknown): string[] {
  const lines: string[] = [];
  if (balance == null) return lines;
  if (typeof balance !== 'object') {
    lines.push(String(balance));
    return lines;
  }
  const b = balance as Record<string, unknown>;
  if (typeof b.total_balance === 'number' || typeof b.total_balance === 'string') {
    lines.push(`Total balance: ${b.total_balance}`);
  }
  if (typeof b.currency === 'string') {
    lines.push(`Currency: ${b.currency}`);
  }
  if (Array.isArray(b.balance_infos)) {
    for (const raw of b.balance_infos) {
      if (!raw || typeof raw !== 'object') continue;
      const i = raw as Record<string, unknown>;
      const cur = i.currency ?? i.currency_code;
      const amt = i.total_balance ?? i.balance ?? i.amount;
      if (cur != null || amt != null) {
        lines.push([amt, cur].filter((x) => x != null).join(' '));
      }
    }
  }
  return lines;
}

function extractModelIds(modelsPayload: unknown): string[] {
  if (!modelsPayload || typeof modelsPayload !== 'object') return [];
  const data = (modelsPayload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'string') {
        return (item as { id: string }).id;
      }
      return null;
    })
    .filter((x): x is string => !!x);
}

interface OrgOption {
  id: string;
  name: string;
}

export interface CostInsightsPanelProps {
  /** When false, skips data fetching (e.g. closed modal). */
  enabled: boolean;
}

export function CostInsightsPanel({ enabled }: CostInsightsPanelProps) {
  const { userDetails, isSuperAdmin } = useAuth();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgInsights, setOrgInsights] = useState<OrganizationCostInsights | null>(null);
  const [deepseek, setDeepseek] = useState<DeepseekAccountInsightsResponse | null>(null);

  useEffect(() => {
    if (!enabled || !userDetails) return;

    if (isSuperAdmin) {
      let cancelled = false;
      void (async () => {
        const { data, error } = await supabase.from('organizations').select('id, name').order('name');
        if (cancelled) return;
        if (error) {
          toast.error('Could not load organizations');
          return;
        }
        const list = (data || []) as OrgOption[];
        setOrgs(list);
        setSelectedOrgId((prev) => {
          if (prev && list.some((o) => o.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      })();
      return () => {
        cancelled = true;
      };
    }

    setSelectedOrgId(userDetails.organization_id ?? null);
    return undefined;
  }, [enabled, isSuperAdmin, userDetails]);

  const loadInsights = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [org, ds] = await Promise.all([
        fetchOrganizationCostInsights(selectedOrgId),
        fetchDeepseekAccountInsights(),
      ]);
      setOrgInsights(org);
      setDeepseek(ds);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || 'Failed to load cost insights');
      setOrgInsights(null);
      setDeepseek(null);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (!enabled || !selectedOrgId) return;
    void loadInsights();
  }, [enabled, selectedOrgId, loadInsights]);

  const modelIds = extractModelIds(deepseek?.models);
  const balanceSummaryLines = summarizeDeepseekBalance(deepseek?.balance);
  const totals = orgInsights?.storage_totals;
  const llm = orgInsights?.llm_totals;
  const tokensByModel: LlmTokensByModelRow[] = orgInsights?.llm_tokens_by_model ?? [];
  const headcount = orgInsights?.storage_by_user?.length ?? 0;
  const avgStoragePerPerson =
    headcount > 0 && totals ? Math.round(totals.bytes / headcount) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        {isSuperAdmin && orgs.length > 0 && (
          <div className="space-y-1 flex-1">
            <Label htmlFor="cost-org">Organization</Label>
            <Select value={selectedOrgId ?? ''} onValueChange={(v) => setSelectedOrgId(v)}>
              <SelectTrigger id="cost-org">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || !selectedOrgId}
          onClick={() => void loadInsights()}
          className="shrink-0"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {loading && !orgInsights ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Screenshot storage</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-muted-foreground">Total stored</div>
                <div className="text-lg font-medium">{formatBytes(totals?.bytes ?? 0)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatNumber(totals?.screenshot_count ?? 0)} files
                </div>
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-muted-foreground">Avg per person</div>
                <div className="text-lg font-medium">{formatBytes(avgStoragePerPerson)}</div>
                <div className="text-xs text-muted-foreground">
                  {headcount} user{headcount === 1 ? '' : 's'} with screenshots
                </div>
              </div>
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-muted-foreground">Note</div>
                <p className="text-xs text-muted-foreground leading-snug">
                  Multiply by your Supabase Storage rate for dollar estimates. Figures reflect{' '}
                  <code className="text-[10px]">screenshots.file_size</code> only.
                </p>
              </div>
            </div>

            {orgInsights?.storage_by_user && orgInsights.storage_by_user.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="text-right">Screenshots</TableHead>
                    <TableHead className="text-right">Storage</TableHead>
                    <TableHead className="text-right">Avg / shot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgInsights.storage_by_user.map((row) => (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <div className="font-medium">{row.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{row.email || row.user_id}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(row.screenshot_count)}</TableCell>
                      <TableCell className="text-right">{formatBytes(row.bytes)}</TableCell>
                      <TableCell className="text-right">{formatBytes(row.avg_bytes_per_shot)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No screenshots for this organization.</p>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">LLM tokens & usage (DeepSeek)</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Totals come from <code className="text-[10px]">ai_metadata.deepseek_usage</code> on each
                screenshot after the analyzer records usage. Older rows may have counts but no tokens.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 lg:col-span-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Logged tokens (org)
                </div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {formatNumber(llm?.total_deepseek_tokens ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ≈ {formatTokensCompact(llm?.total_deepseek_tokens ?? 0)} compact
                </div>
                <div className="mt-3 text-xs space-y-1 border-t border-primary/10 pt-3">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Prompt tokens</span>
                    <span className="font-medium tabular-nums">
                      {formatNumber(llm?.total_prompt_tokens ?? 0)}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({pct(llm?.total_prompt_tokens ?? 0, llm?.total_deepseek_tokens ?? 0)} of logged)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Completion tokens</span>
                    <span className="font-medium tabular-nums">
                      {formatNumber(llm?.total_completion_tokens ?? 0)}{' '}
                      <span className="text-muted-foreground font-normal">
                        ({pct(llm?.total_completion_tokens ?? 0, llm?.total_deepseek_tokens ?? 0)} of logged)
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-muted/30 lg:col-span-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Volume & cadence</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">Completed analyses</div>
                    <div className="text-lg font-medium tabular-nums">{formatNumber(llm?.completed_analyses ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Rows with token log</div>
                    <div className="text-lg font-medium tabular-nums">{formatNumber(llm?.rows_with_token_usage ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Avg tokens / logged row</div>
                    <div className="text-lg font-medium tabular-nums">
                      {formatNumber(llm?.avg_total_tokens_per_logged_row ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Non-pattern AI rows</div>
                    <div className="text-lg font-medium tabular-nums">{formatNumber(llm?.non_pattern_model_rows ?? 0)}</div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
                  Indicative LLM spend (placeholder rates ${INDICATIVE_USD_PROMPT_PER_1M}/1M prompt + $
                  {INDICATIVE_USD_COMPLETION_PER_1M}/1M completion):{' '}
                  <span className="font-medium text-foreground">
                    ~
                    {indicativeSpendUsd(
                      llm?.total_prompt_tokens ?? 0,
                      llm?.total_completion_tokens ?? 0,
                    ).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}
                  </span>
                  . Replace constants in code with your real tariff.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Text classification calls</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Prompt</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.text_prompt_tokens ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Completion</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.text_completion_tokens ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reported total</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.text_total_tokens ?? 0)}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Vision / multimodal calls</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Prompt</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.vision_prompt_tokens ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Completion</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.vision_completion_tokens ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reported total</div>
                    <div className="font-medium tabular-nums">{formatNumber(llm?.vision_total_tokens ?? 0)}</div>
                  </div>
                </div>
              </div>
            </div>

            {tokensByModel.length > 0 ? (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  Tokens by stored model (<code className="text-[10px]">ai_model_used</code>)
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">AI rows</TableHead>
                      <TableHead className="text-right">With token log</TableHead>
                      <TableHead className="text-right">Total tokens</TableHead>
                      <TableHead className="text-right">Prompt</TableHead>
                      <TableHead className="text-right">Completion</TableHead>
                      <TableHead className="text-right">Avg / logged row</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokensByModel.map((row) => {
                      const avg =
                        row.rows_with_token_log > 0
                          ? Math.round(row.total_tokens / row.rows_with_token_log)
                          : 0;
                      return (
                        <TableRow key={row.model}>
                          <TableCell className="font-mono text-xs">{row.model}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.analysis_rows)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.rows_with_token_log)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatNumber(row.total_tokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.prompt_tokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(row.completion_tokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(avg)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : orgInsights?.llm_by_model && orgInsights.llm_by_model.length > 0 ? (
              <div className="space-y-1">
                <div className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-200/80 bg-amber-50/80 dark:bg-amber-950/40 px-3 py-2">
                  Per-model token columns require DB function update{' '}
                  <code className="text-[10px]">20260506120000_cost_insights_token_breakdown</code>. Showing
                  analysis counts only.
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgInsights.llm_by_model.map((row) => (
                      <TableRow key={row.ai_model_used}>
                        <TableCell className="font-mono text-xs">{row.ai_model_used}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <div className="text-xs font-medium text-muted-foreground">DeepSeek account API (project key)</div>
              {deepseek?.models_status && deepseek.models_status >= 400 ? (
                <p className="text-xs text-amber-700">
                  Models request returned HTTP {deepseek.models_status}. Check Edge secrets and DeepSeek project.
                </p>
              ) : null}
              {deepseek?.balance_status && deepseek.balance_status >= 400 ? (
                <p className="text-xs text-amber-700">
                  Balance request returned HTTP {deepseek.balance_status}.
                </p>
              ) : null}
              {modelIds.length > 0 ? (
                <p className="text-xs">
                  <span className="text-muted-foreground">Models available to key: </span>
                  <span className="font-mono">{modelIds.slice(0, 16).join(', ')}</span>
                  {modelIds.length > 16 ? <span className="text-muted-foreground"> …</span> : null}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No model list returned.</p>
              )}
              {balanceSummaryLines.length > 0 ? (
                <ul className="text-xs list-disc pl-4 space-y-0.5">
                  {balanceSummaryLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <Collapsible className="text-xs">
                <CollapsibleTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground py-1">
                  <ChevronDown className="h-3 w-3" />
                  Raw balance JSON
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-background border p-2 text-[10px] leading-relaxed">
                    {JSON.stringify(deepseek?.balance ?? {}, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <p className="text-xs text-muted-foreground">
              Official pricing:{' '}
              <a className="underline" href="https://api-docs.deepseek.com" target="_blank" rel="noreferrer">
                DeepSeek API docs
              </a>
              . Tune indicative rates at top of <code className="text-[10px]">cost-insights-panel.tsx</code>.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
