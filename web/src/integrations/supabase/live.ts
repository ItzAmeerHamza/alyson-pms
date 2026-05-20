import { supabase } from "./client";
import { calculateMergedWorkedSeconds } from "@/lib/time-utils";

// Core entity types used by live tracking
export type Employee = { id: string; full_name: string; email?: string | null; avatar_url?: string | null };

export type Screenshot = {
  id: string;
  employee_id: string;
  taken_at: string; // normalized
  storage_path: string;
  activity_score?: number | null;
  duplicate_flag?: boolean | null;
  risk_score?: number | null;
  keystrokes?: number | null;
  mouse_clicks?: number | null;
  mouse_movements?: number | null;
};

export type AppLog = {
  id: string;
  employee_id: string;
  ts: string;
  app_name: string;
  window_title?: string | null;
};

export type UrlLog = {
  id: string;
  employee_id: string;
  ts: string;
  url: string;
  domain: string;
  title?: string | null;
};

export type ActivityLog = {
  id: string;
  employee_id: string;
  ts: string;
  keystrokes?: number | null;
  mouse_moves?: number | null;
  is_idle: boolean;
};

type Snapshot = {
  screenshots: Screenshot[];
  apps: AppLog[];
  urls: UrlLog[];
  activity: ActivityLog[];
  workedSeconds: number;
  idleSeconds: number;
  currentApp?: AppLog;
  currentUrl?: UrlLog;
  isIdle: boolean;
};

/**
 * Utility: normalize DB rows that have different column names across migrations
 * Priority order: taken_at > captured_at > started_at > timestamp > created_at
 * This ensures backward compatibility with older data while preferring standardized columns
 */
function coalesceTimestamp(row: any): string {
  return (
    row.taken_at ||
    row.captured_at ||
    row.started_at ||
    row.timestamp ||
    row.created_at ||
    new Date().toISOString()
  );
}

function toScreenshot(row: any): Screenshot {
  return {
    id: row.id,
    employee_id: row.user_id || row.employee_id,
    taken_at: row.captured_at || coalesceTimestamp(row),
    storage_path: row.image_url || row.file_path || row.storage_path || row.file_name || "",
    activity_score: row.activity_percent ?? row.total_activity_score ?? row.activity_score ?? null,
    duplicate_flag: row.duplicate_flag ?? row.is_duplicate ?? null,
    risk_score: row.risk_score ?? null,
    keystrokes: row.keystrokes ?? null,
    mouse_clicks: row.mouse_clicks ?? row.clicks ?? null,
    mouse_movements: row.mouse_movements ?? row.moves ?? null,
  };
}

function toAppLog(row: any): AppLog {
  return {
    id: row.id,
    employee_id: row.user_id || row.employee_id,
    ts: coalesceTimestamp(row),
    app_name: row.app_name || row.app || "",
    window_title: row.window_title ?? null,
  };
}

function toUrlLog(row: any): UrlLog {
  const url = row.site_url || row.url || "";
  const domain = row.domain || (typeof url === "string" ? safeExtractDomain(url) : "");
  return {
    id: row.id,
    employee_id: row.user_id || row.employee_id,
    ts: coalesceTimestamp(row),
    url,
    domain,
    title: row.title ?? null,
  };
}

function toActivityLog(row: any): ActivityLog {
  return {
    id: row.id,
    employee_id: row.user_id || row.employee_id,
    ts: coalesceTimestamp(row),
    keystrokes: row.keystrokes ?? null,
    mouse_moves: row.mouse_moves ?? null,
    is_idle: !!(row.is_idle ?? row.new_status === "idle"),
  };
}

function safeExtractDomain(rawUrl: string): string {
  try {
    const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return rawUrl || "";
  }
}

export async function listEmployees(q?: string, organizationId?: string | null, isSuperAdmin?: boolean): Promise<Employee[]> {
  let query = supabase
    .from("users")
    .select("id, full_name, email, avatar_url, organization_id")
    .in("role", ["employee", "manager", "admin"]) // visible employees
    .order("full_name", { ascending: true });

  if (q && q.trim().length > 0) {
    const like = `%${q.trim()}%`;
    query = query.ilike("full_name", like);
  }

  // Filter by organization for non-super admins
  if (organizationId && !isSuperAdmin) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((u) => ({ id: u.id, full_name: u.full_name || "", email: u.email || null, avatar_url: u.avatar_url }));
}

export async function fetchTodaySnapshot(employeeId: string, fromISO: string): Promise<Snapshot> {
  const toISO = new Date().toISOString();

  // Perform resilient queries to handle column name variations across environments
  const screenshotsRes = await (async () => {
    // screenshots table uses captured_at, not timestamp
    const base = supabase.from("screenshots").select("*").eq("user_id", employeeId).limit(100);
    let q = base.gte("captured_at", fromISO).lte("captured_at", toISO).order("captured_at", { ascending: false });
    let r = await q;
    if (r.error) {
      // fallback: no server-time filter
      r = await base.order("created_at", { ascending: false });
    }
    return r;
  })();

  const appsRes = await (async () => {
    const base = supabase.from("app_logs").select("*").eq("user_id", employeeId).limit(20);
    let q = base.gte("started_at", fromISO).lte("started_at", toISO).order("started_at", { ascending: false });
    let r = await q;
          if (r.error) {
        // app_url_activity uses started_at, not timestamp
        r = await base.order("started_at", { ascending: false });
      }
    return r;
  })();

  const urlsRes = await (async () => {
    const base = supabase.from("app_url_activity").select("*").eq("user_id", employeeId).limit(20);
    // app_url_activity uses started_at for timestamp
    let q = base.gte("started_at", fromISO).lte("started_at", toISO).order("started_at", { ascending: false });
    let r = await q;
    if (r.error) {
      // Fallback to created_at if started_at column doesn't exist
      r = await base.order("created_at", { ascending: false });
    }
    return r;
  })();

  const activityRes = await supabase
    .from("tracking_status_logs")
    .select("*")
    .eq("user_id", employeeId)
    .gte("timestamp", fromISO)
    .lte("timestamp", toISO)
    .order("timestamp", { ascending: false })
    .limit(200);

  const timeLogsRes = await (async () => {
    // Use minimal, widely-available columns to avoid schema-mismatch errors
    const base = supabase.from("time_logs").select("id, start_time, end_time, is_idle").eq("user_id", employeeId);
    let q = base.gte("start_time", fromISO).lte("start_time", toISO).order("start_time", { ascending: true }) as any;
    let r = await q;
    if (r.error) {
      q = supabase
        .from("time_logs")
        .select("id, started_at, ended_at, is_idle")
        .eq("user_id", employeeId)
        .gte("started_at", fromISO)
        .lte("started_at", toISO)
        .order("started_at", { ascending: true }) as any;
      r = await q;
    }
    return r;
  })();

  if (screenshotsRes.error) throw screenshotsRes.error;
  if (appsRes.error) throw appsRes.error;
  if (urlsRes.error) throw urlsRes.error;
  if (activityRes.error) throw activityRes.error;
  if (timeLogsRes.error) throw timeLogsRes.error;

  const screenshots = (screenshotsRes.data || []).map(toScreenshot).filter((s) => new Date(s.taken_at).getTime() >= new Date(fromISO).getTime());
  const apps = (appsRes.data || []).map(toAppLog);
  const urls = (urlsRes.data || []).map(toUrlLog);
  const activity = (activityRes.data || []).map(toActivityLog);

  const currentApp = apps[0];
  const currentUrl = urls[0];
  const workedSeconds = computeWorkedSeconds(timeLogsRes.data || [], fromISO);

  // Determine isIdle with robust fallbacks
  let isIdle = inferIsIdle(activity);

  if (activity.length === 0) {
    // Fallback 1: Use latest time_log.is_idle
    const timeLogs = timeLogsRes.data || [];
    const latestTimeLog = timeLogs[timeLogs.length - 1];
    if (latestTimeLog && typeof (latestTimeLog as any).is_idle === "boolean") {
      isIdle = !!(latestTimeLog as any).is_idle;
    } else {
      // Fallback 2: Heuristic based on last event timestamp (screenshots/apps/urls)
      const latestEventTs = [
        screenshots[0]?.taken_at,
        apps[0]?.ts,
        urls[0]?.ts,
      ]
        .filter(Boolean)
        .map((v) => new Date(v as string).getTime());
      const mostRecent = latestEventTs.length ? Math.max(...latestEventTs) : 0;
      if (mostRecent > 0) {
        const minutesSince = Math.floor((Date.now() - mostRecent) / 60000);
        // Consider idle if no events for 2+ minutes
        isIdle = minutesSince >= 2;
      }
    }
  }

  // Attempt to compute idleSeconds from known fields when available; otherwise 0
  let idleSeconds = 0;

  return { screenshots, apps, urls, activity, workedSeconds, currentApp, currentUrl, isIdle, idleSeconds } as any;
}

function inferIsIdle(activityLogs: ActivityLog[]): boolean {
  const latest = activityLogs[0];
  if (!latest) return false;
  return !!latest.is_idle;
}

function computeWorkedSeconds(timeLogs: any[], fromISO: string): number {
  return calculateMergedWorkedSeconds(timeLogs, fromISO);
}

export function subscribeLiveToday(
  employeeId: string,
  fromISO: string,
  handlers: {
    onScreenshot?(row: Screenshot): void;
    onApp?(row: AppLog): void;
    onUrl?(row: UrlLog): void;
    onActivity?(row: ActivityLog): void;
    onTimeLogChange?(): void;
  }
): () => void {
  const channel = supabase
    .channel(`live:${employeeId}`)
    // IMPORTANT: views do not stream via Supabase Realtime. Subscribe to the table.
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "screenshots", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const s = toScreenshot(payload.new);
        if (new Date(s.taken_at).getTime() >= new Date(fromISO).getTime()) {
          handlers.onScreenshot?.(s);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "app_logs", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const a = toAppLog(payload.new);
        if (new Date(a.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onApp?.(a);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_logs", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const a = toAppLog(payload.new);
        if (new Date(a.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onApp?.(a);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "app_url_activity", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const u = toUrlLog(payload.new);
        if (new Date(u.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onUrl?.(u);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "app_url_activity", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const u = toUrlLog(payload.new);
        if (new Date(u.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onUrl?.(u);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tracking_status_logs", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const al = toActivityLog(payload.new);
        if (new Date(al.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onActivity?.(al);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tracking_status_logs", filter: `user_id=eq.${employeeId}` },
      (payload) => {
        const al = toActivityLog(payload.new);
        if (new Date(al.ts).getTime() >= new Date(fromISO).getTime()) {
          handlers.onActivity?.(al);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "time_logs", filter: `user_id=eq.${employeeId}` },
      () => handlers.onTimeLogChange?.()
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "time_logs", filter: `user_id=eq.${employeeId}` },
      () => handlers.onTimeLogChange?.()
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}

// Simple in-memory memo for signed URLs
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getSignedScreenshotURL(storagePath: string, ttlSec = 600): Promise<string> {
  if (!storagePath) return "";

  // If already a public URL, return as-is
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }

  const cached = signedUrlCache.get(storagePath);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 5_000) {
    return cached.url;
  }

  // Heuristic: assume bucket name is the first segment if path includes it, otherwise default to 'screenshots'
  const [maybeBucket, ...rest] = storagePath.split("/");
  const bucket = rest.length > 0 ? maybeBucket : "screenshots";
  const path = rest.length > 0 ? rest.join("/") : storagePath;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error) throw error;

  const record = { url: data.signedUrl, expiresAt: now + ttlSec * 1000 };
  signedUrlCache.set(storagePath, record);
  return record.url;
}


