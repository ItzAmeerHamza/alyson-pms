/**
 * Desktop Sync Edge Function
 * 
 * Secure server-side proxy for desktop agent data writes.
 * The service_role key lives ONLY here on the server — never in the client.
 * 
 * The desktop agent authenticates with its user JWT (anon key + login),
 * and this function validates the token, ensures user_id matches, then
 * writes to the database using the service_role key.
 * 
 * Supported actions:
 *   upload_screenshot, insert_app_logs, insert_url_logs,
 *   insert_idle_log, upsert_time_log, update_time_log,
 *   insert_fraud_alert, insert_activity_stats
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

// Validate UUID format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CorsHeaders = Record<string, string>;

function getCorsHeaders(req: Request): CorsHeaders {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, corsHeaders: CorsHeaders, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function err(message: string, corsHeaders: CorsHeaders, status = 400) {
  return json({ error: message }, corsHeaders, status);
}

/** Extract and verify the caller's user ID from their JWT */
async function authenticateUser(
  req: Request,
  supabaseUrl: string,
  anonKey: string
): Promise<{ userId: string; error?: never } | { userId?: never; error: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  // Create a client scoped to the user's JWT
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser(token);

  if (authError || !user) {
    return { error: authError?.message || 'Invalid token' };
  }

  return { userId: user.id };
}

/** Ensure every row's user_id matches the authenticated caller */
function enforceOwnership(rows: Record<string, unknown>[], userId: string): string | null {
  for (const row of rows) {
    if (row.user_id && row.user_id !== userId) {
      return `user_id mismatch: token=${userId}, row=${row.user_id}`;
    }
  }
  return null;
}

// ─── Action handlers ───────────────────────────────────────────────

async function handleUploadScreenshot(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const { imageBase64, metadata } = data as {
    imageBase64: string;
    metadata: Record<string, unknown>;
  };

  if (!imageBase64 || !metadata) {
    return err('Missing imageBase64 or metadata', corsHeaders);
  }

  // Decode base64 image and detect format (supports both PNG and JPEG)
  const raw = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
  const isJpeg = raw.length >= 2 && raw[0] === 0xFF && raw[1] === 0xD8;
  const ext = isJpeg ? 'jpg' : 'png';
  const contentType = isJpeg ? 'image/jpeg' : 'image/png';
  const fileName = `${userId}/${Date.now()}.${ext}`;

  // Upload to storage
  const { error: upErr } = await svc.storage
    .from('screenshots')
    .upload(fileName, raw, { contentType, upsert: true });

  if (upErr) return err(`Storage upload failed: ${upErr.message}`, corsHeaders, 500);

  // Get URL
  const { data: urlData } = svc.storage.from('screenshots').getPublicUrl(fileName);
  const imageUrl = urlData.publicUrl;

  // Insert metadata row
  const { data: inserted, error: dbErr } = await svc
    .from('screenshots')
    .insert({
      user_id: userId,
      project_id: metadata.project_id || null,
      time_log_id: metadata.time_log_id || null,
      image_url: imageUrl,
      activity_percent: metadata.activity_percent ?? 0,
      focus_percent: metadata.focus_percent ?? 0,
      captured_at: metadata.captured_at,
      file_path: fileName,
      classification: (metadata.activity_percent as number) > 50 ? 'productive' : 'idle',
      mouse_clicks: metadata.mouse_clicks ?? 0,
      keystrokes: metadata.keystrokes ?? 0,
      mouse_movements: metadata.mouse_movements ?? 0,
      app_name: metadata.app_name ?? null,
      window_title: metadata.window_title ?? null,
      url: metadata.url ?? null,
    })
    .select('id');

  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true, id: inserted?.[0]?.id, image_url: imageUrl }, corsHeaders);
}

async function handleInsertAppLogs(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const logs = data.logs as Record<string, unknown>[];
  if (!Array.isArray(logs) || logs.length === 0) return err('logs must be a non-empty array', corsHeaders);

  // Enforce ownership
  const violation = enforceOwnership(logs, userId);
  if (violation) return err(violation, corsHeaders, 403);

  const { error: dbErr } = await svc.from('app_logs').insert(logs);
  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true, count: logs.length }, corsHeaders);
}

async function handleInsertUrlLogs(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const logs = data.logs as Record<string, unknown>[];
  if (!Array.isArray(logs) || logs.length === 0) return err('logs must be a non-empty array', corsHeaders);

  const violation = enforceOwnership(logs, userId);
  if (violation) return err(violation, corsHeaders, 403);

  // Ensure both url and site_url columns
  const rows = logs.map((row) => ({
    ...row,
    url: row.url || row.site_url,
    site_url: row.site_url || row.url,
  }));

  const { error: dbErr } = await svc.from('url_logs').insert(rows);
  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true, count: rows.length }, corsHeaders);
}

async function handleInsertIdleLog(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const log = data.log as Record<string, unknown>;
  if (!log) return err('log is required', corsHeaders);

  if (log.user_id && log.user_id !== userId) {
    return err('user_id mismatch', corsHeaders, 403);
  }

  const { error: dbErr } = await svc.from('idle_logs').insert(log);
  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true }, corsHeaders);
}

async function handleUpsertTimeLog(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const log = data.log as Record<string, unknown>;
  if (!log) return err('log is required', corsHeaders);

  if (log.user_id && log.user_id !== userId) {
    return err('user_id mismatch', corsHeaders, 403);
  }

  const { error: dbErr } = await svc
    .from('time_logs')
    .upsert(log, { onConflict: 'id', ignoreDuplicates: false });

  if (dbErr) return err(`DB upsert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true }, corsHeaders);
}

async function handleUpdateTimeLog(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const { id, updates } = data as { id: string; updates: Record<string, unknown> };
  if (!id || !updates) return err('id and updates are required', corsHeaders);

  // Verify the time log belongs to this user
  const { data: existing, error: fetchErr } = await svc
    .from('time_logs')
    .select('user_id')
    .eq('id', id)
    .single();

  if (fetchErr || !existing) return err('Time log not found', corsHeaders, 404);
  if (existing.user_id !== userId) return err('Not your time log', corsHeaders, 403);

  const { error: dbErr } = await svc.from('time_logs').update(updates).eq('id', id);
  if (dbErr) return err(`DB update failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true }, corsHeaders);
}

async function handleInsertFraudAlert(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const alert = data.alert as Record<string, unknown>;
  if (!alert) return err('alert is required', corsHeaders);

  const { error: dbErr } = await svc.from('fraud_alerts').insert({
    user_id: userId, // Always use authenticated user
    time_log_id: alert.timeLogId || null,
    alert_type: alert.type,
    severity: alert.severity || 'MEDIUM',
    risk_score: alert.riskScore || 0,
    confidence: alert.confidence || 0,
    suspicious_patterns: alert.suspiciousPatterns || [],
    detection_details: alert.details || {},
    behavior_analysis: alert.behaviorAnalysis || {},
    activity_context: alert.activityContext || {},
    system_context: alert.systemContext || {},
    detected_at: alert.timestamp
      ? new Date(alert.timestamp as string).toISOString()
      : new Date().toISOString(),
  });

  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true }, corsHeaders);
}

async function handleInsertActivityStats(
  svc: SupabaseClient,
  userId: string,
  data: Record<string, unknown>,
  corsHeaders: CorsHeaders
) {
  const stats = data.stats as Record<string, unknown>;
  if (!stats) return err('stats is required', corsHeaders);

  const { error: dbErr } = await svc.from('activity_stats').insert({
    user_id: userId,
    time_log_id: stats.timeLogId || null,
    mouse_movements: stats.mouseMovements ?? 0,
    mouse_clicks: stats.mouseClicks ?? 0,
    keystrokes: stats.keystrokes ?? 0,
    active_time_seconds: stats.activeTimeSeconds ?? 0,
    session_duration_seconds: stats.sessionDurationSeconds ?? 0,
    productivity_score: stats.productivityScore ?? 0,
    apps_count: stats.appsCount ?? 0,
    screenshot_count: stats.screenshotCount ?? 0,
    period_start: stats.periodStart,
    period_end: stats.periodEnd,
  });

  if (dbErr) return err(`DB insert failed: ${dbErr.message}`, corsHeaders, 500);

  return json({ success: true }, corsHeaders);
}

// ─── Main handler ──────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return err('Method not allowed', corsHeaders, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Authenticate the caller
  const auth = await authenticateUser(req, supabaseUrl, anonKey);
  if (auth.error) return err(auth.error, corsHeaders, 401);

  const userId = auth.userId;
  if (!UUID_RE.test(userId)) return err('Invalid user ID', corsHeaders, 401);

  // 2. Parse request body
  let body: { action: string; data: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', corsHeaders);
  }

  const { action, data } = body;
  if (!action || !data) return err('action and data are required', corsHeaders);

  // 3. Create service-role client (server-side only)
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Dispatch to handler
  try {
    switch (action) {
      case 'upload_screenshot':
        return await handleUploadScreenshot(svc, userId, data, corsHeaders);
      case 'insert_app_logs':
        return await handleInsertAppLogs(svc, userId, data, corsHeaders);
      case 'insert_url_logs':
        return await handleInsertUrlLogs(svc, userId, data, corsHeaders);
      case 'insert_idle_log':
        return await handleInsertIdleLog(svc, userId, data, corsHeaders);
      case 'upsert_time_log':
        return await handleUpsertTimeLog(svc, userId, data, corsHeaders);
      case 'update_time_log':
        return await handleUpdateTimeLog(svc, userId, data, corsHeaders);
      case 'insert_fraud_alert':
        return await handleInsertFraudAlert(svc, userId, data, corsHeaders);
      case 'insert_activity_stats':
        return await handleInsertActivityStats(svc, userId, data, corsHeaders);
      default:
        return err(`Unknown action: ${action}`, corsHeaders);
    }
  } catch (e) {
    console.error(`[desktop-sync] Unhandled error in ${action}:`, e);
    return err('Internal server error', corsHeaders, 500);
  }
});
