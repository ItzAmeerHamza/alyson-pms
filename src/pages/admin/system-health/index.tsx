import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Database,
  Mail,
  Brain,
  Eye,
  Monitor,
  Bell,
  Clock,
  Shield,
  Activity,
  Settings,
  BellOff,
  UserX,
  Camera,
  Cpu,
  Timer,
  Globe,
  Users,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────
type CheckStatus = 'healthy' | 'warn' | 'failed' | 'unknown';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  detail?: string;
  last_run?: string | null;
  metric?: number | null;
  items?: Array<{ user: string; detail: string }>;
}

interface HealthReport {
  overall_status: CheckStatus;
  checked_at: string;
  checks: CheckResult[];
  summary: {
    total: number;
    healthy: number;
    warn: number;
    failed: number;
    unknown: number;
  };
}

// ── Icon map by check name ────────────────────────────────────────────────
const CHECK_ICONS: Record<string, React.ElementType> = {
  'Database': Database,
  'Daily Email Report Cron': Mail,
  'Weekly Email Report Cron': Mail,
  'Daily <8h Alert Cron': Clock,
  'Notification Processor Cron': Bell,
  'AI Screenshot Analyzer Cron': Brain,
  'Vision Validator Cron': Eye,
  'Health Alert Cron': Shield,
  'AI Text Analysis': Brain,
  'Vision AI (Deep Analysis)': Eye,
  'Desktop Agent Activity': Monitor,
  'Email Delivery': Mail,
  'pg_net Infrastructure': Activity,
  'Notification Pipeline': Bell,
  'System Config (Credentials)': Shield,
  'Ghost Session Detector': Activity,
  'Screenshot Capture Rate': Camera,
  'Tracker Running, No Activity': UserX,
  'App & URL Tracking': Globe,
  'Idle Detection': Timer,
  'Agent Version Adoption': Cpu,
  'Long-Running Sessions (>9h)': Clock,
};

// ── Status helpers ────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<CheckStatus, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeVariant: string;
  label: string;
}> = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    badgeVariant: 'bg-emerald-100 text-emerald-800',
    label: 'Healthy',
  },
  warn: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    badgeVariant: 'bg-amber-100 text-amber-800',
    label: 'Warning',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeVariant: 'bg-red-100 text-red-800',
    label: 'Failed',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    badgeVariant: 'bg-gray-100 text-gray-700',
    label: 'Unknown',
  },
};

const OVERALL_CONFIG: Record<CheckStatus, { text: string; bg: string; dot: string }> = {
  healthy: { text: 'text-emerald-700', bg: 'bg-emerald-500', dot: 'bg-emerald-400' },
  warn: { text: 'text-amber-700', bg: 'bg-amber-500', dot: 'bg-amber-400' },
  failed: { text: 'text-red-700', bg: 'bg-red-500', dot: 'bg-red-400' },
  unknown: { text: 'text-gray-600', bg: 'bg-gray-400', dot: 'bg-gray-300' },
};

// ── Groups for layout ─────────────────────────────────────────────────────
const CHECK_GROUPS: { title: string; icon: React.ElementType; names: string[] }[] = [
  {
    title: 'Core Infrastructure',
    icon: Database,
    names: ['Database', 'System Config (Credentials)', 'Desktop Agent Activity'],
  },
  {
    title: 'Email & Notifications',
    icon: Mail,
    names: ['Daily Email Report Cron', 'Weekly Email Report Cron', 'Daily <8h Alert Cron', 'Health Alert Cron', 'Email Delivery', 'pg_net Infrastructure', 'Notification Pipeline', 'Notification Processor Cron'],
  },
  {
    title: 'AI Analysis Pipeline',
    icon: Brain,
    names: ['AI Screenshot Analyzer Cron', 'AI Text Analysis', 'Vision Validator Cron', 'Vision AI (Deep Analysis)'],
  },
  {
    title: 'Employee Tracking Liveness',
    icon: Users,
    names: ['Screenshot Capture Rate', 'Tracker Running, No Activity', 'App & URL Tracking', 'Idle Detection', 'Agent Version Adoption'],
  },
  {
    title: 'Session Integrity',
    icon: Shield,
    names: ['Ghost Session Detector', 'Long-Running Sessions (>9h)'],
  },
];

// ── Fetch function ────────────────────────────────────────────────────────
async function fetchSystemHealth(): Promise<HealthReport> {
  const { data, error } = await supabase.functions.invoke('system-health', {
    method: 'POST',
  });
  if (error) {
    throw new Error(`Health check failed: ${error.message}`);
  }
  return data as HealthReport;
}

// ── Individual check card ─────────────────────────────────────────────────
function CheckCard({ check }: { check: CheckResult }) {
  const cfg = STATUS_CONFIG[check.status];
  const StatusIcon = cfg.icon;
  const ItemIcon = CHECK_ICONS[check.name] ?? Settings;
  const [expanded, setExpanded] = useState(false);
  const hasItems = check.items && check.items.length > 0;

  return (
    <div className={`rounded-lg border ${cfg.borderColor} ${cfg.bgColor} overflow-hidden`}>
      <div className="flex items-start gap-3 p-3">
        <div className={`mt-0.5 ${cfg.color}`}>
          <StatusIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <ItemIcon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">{check.name}</span>
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${cfg.badgeVariant}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{check.message}</p>
          {check.detail && (
            <p className="text-xs text-gray-500 mt-0.5 italic">{check.detail}</p>
          )}
          {check.last_run && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Last run: {formatDistanceToNow(new Date(check.last_run), { addSuffix: true })}
            </p>
          )}
          {hasItems && (
            <button
              onClick={() => setExpanded(v => !v)}
              className={`text-[11px] mt-1 font-medium underline underline-offset-2 ${cfg.color}`}
            >
              {expanded ? 'Hide' : `Show ${check.items!.length} affected employee(s)`}
            </button>
          )}
        </div>
        {check.metric !== undefined && check.metric !== null && (
          <div className="shrink-0 text-right">
            <span className={`text-sm font-bold ${cfg.color}`}>{check.metric}</span>
          </div>
        )}
      </div>
      {hasItems && expanded && (
        <div className={`border-t ${cfg.borderColor} px-3 pb-2 pt-1 space-y-1`}>
          {check.items!.map((item, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.color.replace('text-', 'bg-')}`} />
              <div>
                <span className="text-xs font-medium text-gray-800">{item.user}</span>
                <span className="text-xs text-gray-500 ml-2">{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────
function GroupCard({
  group,
  checks,
}: {
  group: typeof CHECK_GROUPS[0];
  checks: CheckResult[];
}) {
  const GroupIcon = group.icon;
  const matching = group.names
    .map(name => checks.find(c => c.name === name))
    .filter(Boolean) as CheckResult[];

  if (matching.length === 0) return null;

  const hasFailed = matching.some(c => c.status === 'failed');
  const hasWarn = matching.some(c => c.status === 'warn');
  const groupStatus: CheckStatus = hasFailed ? 'failed' : hasWarn ? 'warn' : 'healthy';
  const cfg = STATUS_CONFIG[groupStatus];
  const GroupStatusIcon = cfg.icon;

  return (
    <Card className={`border ${cfg.borderColor}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <GroupIcon className="h-4 w-4 text-gray-500" />
          {group.title}
          <div className="ml-auto">
            <GroupStatusIcon className={`h-4 w-4 ${cfg.color}`} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {matching.map(check => (
          <CheckCard key={check.name} check={check} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Overall status banner ─────────────────────────────────────────────────
function OverallBanner({ report }: { report: HealthReport }) {
  const status = report.overall_status;
  const cfg = OVERALL_CONFIG[status];
  const scfg = STATUS_CONFIG[status];
  const StatusIcon = scfg.icon;
  const labels: Record<CheckStatus, string> = {
    healthy: 'All Systems Operational',
    warn: 'Some Systems Need Attention',
    failed: 'Critical Issues Detected',
    unknown: 'Status Unknown',
  };

  return (
    <div className={`rounded-xl p-5 text-white ${cfg.bg} shadow-md`}>
      <div className="flex items-center gap-4">
        <div className="relative">
          <StatusIcon className="h-10 w-10 text-white/90" />
          {status === 'healthy' && (
            <span className={`absolute -top-0.5 -right-0.5 flex h-3 w-3`}>
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.dot}`}></span>
            </span>
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">{labels[status]}</h2>
          <p className="text-sm text-white/80 mt-0.5">
            Checked {formatDistanceToNow(new Date(report.checked_at), { addSuffix: true })}
          </p>
        </div>
        <div className="hidden sm:flex gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{report.summary.healthy}</div>
            <div className="text-xs text-white/70">Healthy</div>
          </div>
          <div className="w-px bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">{report.summary.warn}</div>
            <div className="text-xs text-white/70">Warnings</div>
          </div>
          <div className="w-px bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">{report.summary.failed}</div>
            <div className="text-xs text-white/70">Failed</div>
          </div>
          <div className="w-px bg-white/20" />
          <div>
            <div className="text-2xl font-bold text-white">{report.summary.total}</div>
            <div className="text-xs text-white/70">Total</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function SystemHealthPage() {
  const { userDetails, session } = useAuth();
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const {
    data: report,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<HealthReport>({
    queryKey: ['system-health', session?.user?.id],
    queryFn: fetchSystemHealth,
    enabled: !!session,
    staleTime: 0,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  useEffect(() => {
    if (report) setLastRefreshed(new Date());
  }, [report]);

  const handleRefresh = useCallback(async () => {
    await refetch();
    toast({ title: 'Health check refreshed', description: 'All systems re-evaluated.' });
  }, [refetch, toast]);

  const isRefreshing = isLoading || isFetching;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-500" />
            System Health
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time status of all Alyson PM automated services and pipelines
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastRefreshed && (
            <span className="text-xs text-gray-400">
              Updated {formatDistanceToNow(lastRefreshed, { addSuffix: true })}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(v => !v)}
                className={autoRefresh ? 'border-blue-300 text-blue-600' : 'text-gray-500'}
              >
                {autoRefresh ? (
                  <><Bell className="h-3.5 w-3.5 mr-1.5" />Auto-refresh ON</>
                ) : (
                  <><BellOff className="h-3.5 w-3.5 mr-1.5" />Auto-refresh OFF</>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refreshes every 60 seconds when ON</TooltipContent>
          </Tooltip>
          <Button
            variant="default"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || !session}
            className="bg-blue-500 hover:bg-blue-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking…' : 'Run Check'}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3">
          <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Health check failed</p>
            <p className="text-xs text-red-700 mt-0.5">{String(error)}</p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !report && (
        <div className="space-y-4">
          <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {report && (
        <>
          <OverallBanner report={report} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CHECK_GROUPS.map(group => (
              <GroupCard
                key={group.title}
                group={group}
                checks={report.checks}
              />
            ))}
          </div>

          {/* Any checks not in a group */}
          {(() => {
            const grouped = CHECK_GROUPS.flatMap(g => g.names);
            const ungrouped = report.checks.filter(c => !grouped.includes(c.name));
            if (ungrouped.length === 0) return null;
            return (
              <Card>
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Settings className="h-4 w-4 text-gray-500" />
                    Other Checks
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {ungrouped.map(check => (
                    <CheckCard key={check.name} check={check} />
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* Footer info */}
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-gray-100">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Auto-refresh every 60s when enabled · Email alerts sent to all admins when any check fails
              {userDetails?.is_super_admin ? ' · Super admin view' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
