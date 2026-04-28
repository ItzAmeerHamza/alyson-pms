/**
 * System Health Check Edge Function
 * Returns real-time health status for all TimeFlow subsystems.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,https://worktime.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface CheckResult {
  name: string;
  status: 'healthy' | 'warn' | 'failed' | 'unknown';
  message: string;
  detail?: string;
  last_run?: string | null;
  metric?: number | null;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const checks: CheckResult[] = [];
  const now = new Date();

  // ── 1. Database Connectivity ─────────────────────────────────────────────
  try {
    const { count, error } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true });
    checks.push({
      name: 'Database',
      status: error ? 'failed' : 'healthy',
      message: error ? `DB error: ${error.message}` : `Connected — ${count ?? 0} org(s)`,
    });
  } catch (e: any) {
    checks.push({ name: 'Database', status: 'failed', message: e.message });
  }

  // ── 2. pg_cron Jobs ──────────────────────────────────────────────────────
  const cronJobsToCheck = [
    { jobname: 'daily-email-report-v3', label: 'Daily Email Report Cron' },
    { jobname: 'weekly-email-report-v3', label: 'Weekly Email Report Cron' },
    { jobname: 'daily-hours-alert', label: 'Daily <8h Alert Cron' },
    { jobname: 'notification-processor', label: 'Notification Processor Cron' },
    { jobname: 'ai-screenshot-analyzer-cron', label: 'AI Screenshot Analyzer Cron' },
    { jobname: 'vision-validator-direct', label: 'Vision Validator Cron' },
  ];

  for (const job of cronJobsToCheck) {
    try {
      const { data, error } = await supabase.rpc('get_cron_job_status', { p_jobname: job.jobname });
      if (error || !data || data.length === 0) {
        checks.push({
          name: job.label,
          status: 'unknown',
          message: 'No cron run history found',
          last_run: null,
        });
        continue;
      }
      const row = data[0];
      const lastRun = row.end_time ? new Date(row.end_time) : null;
      const minutesSince = lastRun ? Math.floor((now.getTime() - lastRun.getTime()) / 60000) : null;
      const status = row.status === 'succeeded' ? 'healthy' : row.status === 'failed' ? 'failed' : 'warn';

      checks.push({
        name: job.label,
        status,
        message: status === 'healthy'
          ? `Last ran ${minutesSince !== null ? minutesSince + ' min ago' : 'recently'}`
          : `Last run status: ${row.status}`,
        last_run: row.end_time,
        detail: row.return_message || undefined,
      });
    } catch (e: any) {
      checks.push({ name: job.label, status: 'unknown', message: e.message });
    }
  }

  // ── 3. AI Text Analysis Pipeline (last 2 hours) ──────────────────────────
  try {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const { count: total } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .gte('captured_at', twoHoursAgo);

    const { count: aiProcessed } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .gte('captured_at', twoHoursAgo)
      .not('ai_model_used', 'is', null)
      .neq('ai_model_used', 'pattern-based');

    const pct = total && total > 0 ? Math.round(((aiProcessed ?? 0) / total) * 100) : null;

    let status: CheckResult['status'] = 'healthy';
    if (total === null || total === 0) status = 'unknown';
    else if (pct !== null && pct < 30) status = 'failed';
    else if (pct !== null && pct < 70) status = 'warn';

    checks.push({
      name: 'AI Text Analysis',
      status,
      message: total === 0 || total === null
        ? 'No screenshots in last 2h'
        : `${aiProcessed ?? 0}/${total} screenshots AI-enhanced (${pct}%)`,
      metric: pct,
    });
  } catch (e: any) {
    checks.push({ name: 'AI Text Analysis', status: 'failed', message: e.message });
  }

  // ── 4. Vision AI Pipeline (last 24 hours) ───────────────────────────────
  try {
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { count: total24h } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .gte('captured_at', twentyFourHoursAgo);

    const { count: visionProcessed } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .gte('captured_at', twentyFourHoursAgo)
      .not('vision_content', 'is', null);

    const pct = total24h && total24h > 0 ? Math.round(((visionProcessed ?? 0) / total24h) * 100) : null;

    let status: CheckResult['status'] = 'healthy';
    if (total24h === null || total24h === 0) status = 'unknown';
    else if (pct !== null && pct < 5) status = 'failed';
    else if (pct !== null && pct < 20) status = 'warn';

    checks.push({
      name: 'Vision AI (Deep Analysis)',
      status,
      message: total24h === 0 || total24h === null
        ? 'No screenshots in last 24h'
        : `${visionProcessed ?? 0}/${total24h} vision-analyzed (${pct}%)`,
      metric: pct,
    });
  } catch (e: any) {
    checks.push({ name: 'Vision AI (Deep Analysis)', status: 'failed', message: e.message });
  }

  // ── 5. Desktop Agent Data Flow (last 30 minutes) ─────────────────────────
  try {
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const { count: recentScreenshots } = await supabase
      .from('screenshots')
      .select('id', { count: 'exact', head: true })
      .gte('captured_at', thirtyMinAgo);

    const { count: activeSessions } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .is('end_time', null);

    let status: CheckResult['status'] = 'healthy';
    if ((recentScreenshots ?? 0) === 0 && (activeSessions ?? 0) === 0) status = 'warn';

    checks.push({
      name: 'Desktop Agent Activity',
      status,
      message: `${recentScreenshots ?? 0} screenshots in last 30min · ${activeSessions ?? 0} active sessions`,
      metric: recentScreenshots,
    });
  } catch (e: any) {
    checks.push({ name: 'Desktop Agent Activity', status: 'failed', message: e.message });
  }

  // ── 6. Email Delivery (pg_net HTTP responses, last hour) ─────────────────
  try {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const { data: httpRows } = await supabase
      .rpc('get_recent_http_stats', { p_since: oneHourAgo });

    if (!httpRows || httpRows.length === 0) {
      checks.push({
        name: 'Email Delivery (pg_net)',
        status: 'unknown',
        message: 'No HTTP requests in last hour',
      });
    } else {
      const row = httpRows[0];
      const total = Number(row.total_requests ?? 0);
      const success = Number(row.success_requests ?? 0);
      const failed = Number(row.failed_requests ?? 0);
      const pct = total > 0 ? Math.round((success / total) * 100) : 0;

      let status: CheckResult['status'] = 'healthy';
      if (pct < 50) status = 'failed';
      else if (pct < 80) status = 'warn';

      checks.push({
        name: 'Email Delivery (pg_net)',
        status,
        message: `${success}/${total} HTTP calls succeeded (${pct}%) in last hour`,
        metric: pct,
        detail: failed > 0 ? `${failed} failures` : undefined,
      });
    }
  } catch (e: any) {
    checks.push({ name: 'Email Delivery (pg_net)', status: 'unknown', message: 'Could not query HTTP stats' });
  }

  // ── 7. Notification Pipeline (last 6 hours) ──────────────────────────────
  try {
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const { count: pendingNotifs } = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', sixHoursAgo);

    const { count: recentSent } = await supabase
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('created_at', sixHoursAgo);

    const stuck = pendingNotifs ?? 0;
    let status: CheckResult['status'] = 'healthy';
    if (stuck > 50) status = 'failed';
    else if (stuck > 10) status = 'warn';

    checks.push({
      name: 'Notification Pipeline',
      status,
      message: stuck > 0
        ? `${stuck} stuck pending (>6h) · ${recentSent ?? 0} sent in last 6h`
        : `${recentSent ?? 0} notifications sent in last 6h`,
      metric: stuck,
    });
  } catch (e: any) {
    checks.push({ name: 'Notification Pipeline', status: 'unknown', message: 'Could not query notification log' });
  }

  // ── 8. Email Report Config (system_config table) ─────────────────────────
  try {
    const { data: configs } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['supabase_service_role_key', 'supabase_url', 'resend_api_key']);

    const keys = (configs ?? []).map((c: any) => c.key);
    const missing = ['supabase_service_role_key', 'supabase_url', 'resend_api_key'].filter(k => !keys.includes(k));

    checks.push({
      name: 'System Config (Credentials)',
      status: missing.length > 0 ? 'failed' : 'healthy',
      message: missing.length > 0
        ? `Missing keys: ${missing.join(', ')}`
        : 'All required credentials configured',
      detail: missing.length > 0 ? 'Email sending will fail without these keys' : undefined,
    });
  } catch (e: any) {
    checks.push({ name: 'System Config (Credentials)', status: 'failed', message: e.message });
  }

  // ── 9. Ghost Sessions (long-running without recent screenshots) ───────────
  try {
    const fourteenHoursAgo = new Date(now.getTime() - 14 * 60 * 60 * 1000).toISOString();
    const { count: ghostSessions } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .is('end_time', null)
      .lt('start_time', fourteenHoursAgo);

    let status: CheckResult['status'] = 'healthy';
    if ((ghostSessions ?? 0) > 5) status = 'failed';
    else if ((ghostSessions ?? 0) > 0) status = 'warn';

    checks.push({
      name: 'Ghost Session Detector',
      status,
      message: (ghostSessions ?? 0) === 0
        ? 'No ghost sessions detected'
        : `${ghostSessions} session(s) open >14 hours without end time`,
      metric: ghostSessions,
    });
  } catch (e: any) {
    checks.push({ name: 'Ghost Session Detector', status: 'failed', message: e.message });
  }

  // ── Compute overall status ────────────────────────────────────────────────
  const hasFailure = checks.some(c => c.status === 'failed');
  const hasWarning = checks.some(c => c.status === 'warn');
  const overallStatus = hasFailure ? 'failed' : hasWarning ? 'warn' : 'healthy';

  return new Response(
    JSON.stringify({
      overall_status: overallStatus,
      checked_at: now.toISOString(),
      checks,
      summary: {
        total: checks.length,
        healthy: checks.filter(c => c.status === 'healthy').length,
        warn: checks.filter(c => c.status === 'warn').length,
        failed: checks.filter(c => c.status === 'failed').length,
        unknown: checks.filter(c => c.status === 'unknown').length,
      },
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
