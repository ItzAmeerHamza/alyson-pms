import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { mergeTimeIntervals, type TimeInterval } from "../_shared/time-merge.ts";

const REQUIRED_HOURS = 8;

const ALLOWED_ORIGINS = (
  Deno.env.get("ALLOWED_ORIGINS") ||
  "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some((o) => origin === o) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };
}

interface EmployeeHours {
  id: string;
  full_name: string;
  email: string;
  hours_worked: number;
  first_start: string | null;
  last_stop: string | null;
  is_absent: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not set");

    const resend = new Resend(resendApiKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional organization_id from request body
    let organizationId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        organizationId = body.organization_id || null;
      } catch {
        // No body – global mode
      }
    }

    console.log(
      organizationId
        ? `🏢 Organization: ${organizationId}`
        : "🌐 Global mode"
    );

    // Build yesterday's date range in UTC
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setUTCDate(now.getUTCDate() - 1);
    yesterdayStart.setUTCHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setUTCHours(23, 59, 59, 999);

    const dateLabel = yesterdayStart.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

    console.log(`📅 Checking hours for: ${dateLabel}`);

    // --- 1. Fetch all active employees ---------------------------------
    let empQuery = supabase
      .from("users")
      .select("id, full_name, email")
      .eq("is_active", true)
      .eq("role", "employee");

    if (organizationId) empQuery = empQuery.eq("organization_id", organizationId);

    const { data: employees, error: empError } = await empQuery;
    if (empError) throw new Error(`Employees fetch error: ${empError.message}`);

    if (!employees || employees.length === 0) {
      console.log("⚠️ No active employees found");
      return new Response(
        JSON.stringify({ success: true, message: "No active employees" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`👥 Found ${employees.length} active employees`);

    // --- 2. Fetch time_logs for yesterday --------------------------------
    let logsQuery = supabase
      .from("time_logs")
      .select("user_id, start_time, end_time, idle_seconds")
      .gte("start_time", yesterdayStart.toISOString())
      .lte("start_time", yesterdayEnd.toISOString())
      .not("end_time", "is", null);

    if (organizationId) logsQuery = logsQuery.eq("organization_id", organizationId);

    const { data: timeLogs, error: logsError } = await logsQuery;
    if (logsError) throw new Error(`Time logs fetch error: ${logsError.message}`);

    console.log(`📋 Found ${timeLogs?.length || 0} completed time log entries`);

    // --- 3. Aggregate hours per employee (multi-device: merge overlapping) --
    const userIntervals = new Map<
      string,
      { intervals: TimeInterval[]; idleMs: number; first_start: string; last_stop: string }
    >();

    for (const log of timeLogs || []) {
      if (!userIntervals.has(log.user_id)) {
        userIntervals.set(log.user_id, {
          intervals: [],
          idleMs: 0,
          first_start: log.start_time,
          last_stop: log.end_time,
        });
      }

      const entry = userIntervals.get(log.user_id)!;
      entry.intervals.push({
        startMs: new Date(log.start_time).getTime(),
        endMs: new Date(log.end_time).getTime(),
      });
      entry.idleMs += (log.idle_seconds ?? 0) * 1000;

      if (new Date(log.start_time) < new Date(entry.first_start)) {
        entry.first_start = log.start_time;
      }
      if (new Date(log.end_time) > new Date(entry.last_stop)) {
        entry.last_stop = log.end_time;
      }
    }

    const hoursMap = new Map<
      string,
      { hours: number; first_start: string; last_stop: string }
    >();

    for (const [userId, data] of userIntervals) {
      const merged = mergeTimeIntervals(data.intervals);
      let totalMs = 0;
      for (const interval of merged) {
        totalMs += interval.endMs - interval.startMs;
      }
      hoursMap.set(userId, {
        hours: Math.max(0, (totalMs - data.idleMs) / (1000 * 60 * 60)),
        first_start: data.first_start,
        last_stop: data.last_stop,
      });
    }

    // --- 4. Build under-hours list ---------------------------------------
    const underHours: EmployeeHours[] = [];

    for (const emp of employees) {
      const stats = hoursMap.get(emp.id);
      const hours = stats?.hours ?? 0;

      if (hours < REQUIRED_HOURS) {
        underHours.push({
          id: emp.id,
          full_name: emp.full_name || "Unknown",
          email: emp.email,
          hours_worked: hours,
          first_start: stats?.first_start ?? null,
          last_stop: stats?.last_stop ?? null,
          is_absent: hours === 0,
        });
      }
    }

    if (underHours.length === 0) {
      console.log("✅ All employees reached 8 hours — no alert needed");
      return new Response(
        JSON.stringify({
          success: true,
          message: "All employees met the 8-hour requirement",
          checked: employees.length,
          date: dateLabel,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`🚨 ${underHours.length} employees below ${REQUIRED_HOURS}h`);

    // --- 5. Fetch admin emails --------------------------------------------
    let adminQuery = supabase
      .from("users")
      .select("email, full_name")
      .eq("is_active", true)
      .or("role.eq.admin,is_org_admin.eq.true");

    if (organizationId) adminQuery = adminQuery.eq("organization_id", organizationId);

    const { data: admins, error: adminError } = await adminQuery;
    if (adminError) throw new Error(`Admins fetch error: ${adminError.message}`);

    const adminEmails = (admins || []).map((a) => a.email).filter(Boolean);

    if (adminEmails.length === 0) {
      console.log("⚠️ No admin email addresses found — skipping send");
      return new Response(
        JSON.stringify({ success: false, message: "No admin recipients found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`📧 Sending alert to ${adminEmails.length} admin(s)`);

    // --- 6. Send email ---------------------------------------------------
    const absentCount = underHours.filter((e) => e.is_absent).length;
    const lowHoursCount = underHours.length - absentCount;

    const emailHtml = generateAlertEmailHtml({
      date: dateLabel,
      underHours,
      totalEmployees: employees.length,
      absentCount,
      lowHoursCount,
      requiredHours: REQUIRED_HOURS,
    });

    const emailResult = await resend.emails.send({
      from: "Ebdaa Work Time <info@ebdaadt.com>",
      to: adminEmails,
      subject: `⚠️ Daily Hours Alert — ${underHours.length} employee${underHours.length !== 1 ? "s" : ""} below ${REQUIRED_HOURS}h — ${dateLabel}`,
      html: emailHtml,
    });

    if (emailResult.error) {
      throw new Error(`Email send failed: ${emailResult.error.message}`);
    }

    console.log(`✅ Alert sent. Email ID: ${emailResult.data?.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Alert sent to ${adminEmails.length} admin(s)`,
        underHoursCount: underHours.length,
        absentCount,
        lowHoursCount,
        totalEmployees: employees.length,
        date: dateLabel,
        emailId: emailResult.data?.id,
        organization_id: organizationId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("❌ daily-hours-alert error:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

// ---------------------------------------------------------------------------
// Email HTML generator
// ---------------------------------------------------------------------------

interface AlertEmailParams {
  date: string;
  underHours: EmployeeHours[];
  totalEmployees: number;
  absentCount: number;
  lowHoursCount: number;
  requiredHours: number;
}

function fmt(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function timeStr(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  });
}

function rowColor(emp: EmployeeHours): string {
  if (emp.is_absent) return "#fff1f2"; // red tint
  if (emp.hours_worked < 4) return "#fff7ed"; // orange tint
  return "#fffbeb"; // yellow tint
}

function badgeHtml(emp: EmployeeHours): string {
  if (emp.is_absent)
    return `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Absent</span>`;
  if (emp.hours_worked < 4)
    return `<span style="background:#ffedd5;color:#ea580c;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Critical</span>`;
  return `<span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Low Hours</span>`;
}

function generateAlertEmailHtml(p: AlertEmailParams): string {
  const { date, underHours, totalEmployees, absentCount, lowHoursCount, requiredHours } = p;
  const compliantCount = totalEmployees - underHours.length;
  const complianceRate = totalEmployees > 0
    ? Math.round((compliantCount / totalEmployees) * 100)
    : 0;

  const rows = underHours
    .sort((a, b) => a.hours_worked - b.hours_worked)
    .map(
      (emp) => `
      <tr style="background:${rowColor(emp)};">
        <td style="padding:12px 16px;font-weight:600;color:#1e293b;">${emp.full_name}</td>
        <td style="padding:12px 16px;color:#64748b;font-size:13px;">${emp.email}</td>
        <td style="padding:12px 16px;text-align:center;font-weight:700;color:${emp.is_absent ? "#dc2626" : emp.hours_worked < 4 ? "#ea580c" : "#ca8a04"};">
          ${emp.is_absent ? "0h 00m" : fmt(emp.hours_worked)}
        </td>
        <td style="padding:12px 16px;text-align:center;color:#475569;">${timeStr(emp.first_start)}</td>
        <td style="padding:12px 16px;text-align:center;color:#475569;">${timeStr(emp.last_stop)}</td>
        <td style="padding:12px 16px;text-align:center;">${badgeHtml(emp)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Hours Alert</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:820px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);color:#fff;padding:32px 36px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">⚠️</div>
      <h1 style="margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Daily Hours Alert</h1>
      <p style="margin:8px 0 0;opacity:0.85;font-size:15px;">${date}</p>
    </div>

    <!-- Summary cards -->
    <div style="display:flex;gap:0;border-bottom:1px solid #e2e8f0;">
      <div style="flex:1;padding:20px 24px;text-align:center;border-right:1px solid #e2e8f0;">
        <div style="font-size:32px;font-weight:700;color:#dc2626;">${underHours.length}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">Under ${requiredHours}h</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center;border-right:1px solid #e2e8f0;">
        <div style="font-size:32px;font-weight:700;color:#b91c1c;">${absentCount}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">Absent</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center;border-right:1px solid #e2e8f0;">
        <div style="font-size:32px;font-weight:700;color:#ea580c;">${lowHoursCount}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">Low Hours</div>
      </div>
      <div style="flex:1;padding:20px 24px;text-align:center;">
        <div style="font-size:32px;font-weight:700;color:#16a34a;">${complianceRate}%</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px;">Compliance Rate</div>
      </div>
    </div>

    <!-- Table -->
    <div style="padding:28px 28px 8px;">
      <h2 style="margin:0 0 16px;font-size:17px;color:#1e293b;font-weight:700;">
        Employees who did not reach ${requiredHours} hours
      </h2>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:12px 16px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Employee</th>
            <th style="padding:12px 16px;text-align:left;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Email</th>
            <th style="padding:12px 16px;text-align:center;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Hours Worked</th>
            <th style="padding:12px 16px;text-align:center;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Start Time</th>
            <th style="padding:12px 16px;text-align:center;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">End Time</th>
            <th style="padding:12px 16px;text-align:center;font-size:13px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div style="padding:16px 28px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
      <span style="font-size:12px;color:#64748b;font-weight:600;">Legend:</span>
      <span style="background:#fee2e2;color:#dc2626;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Absent</span>
      <span style="font-size:12px;color:#64748b;">= 0 hours logged</span>
      <span style="background:#ffedd5;color:#ea580c;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Critical</span>
      <span style="font-size:12px;color:#64748b;">= less than 4 hours</span>
      <span style="background:#fef9c3;color:#ca8a04;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Low Hours</span>
      <span style="font-size:12px;color:#64748b;">= 4–${requiredHours} hours</span>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span style="color:#94a3b8;font-size:12px;">Generated by Ebdaa Work Time Admin System</span>
      <span style="color:#94a3b8;font-size:12px;">${new Date().toUTCString()}</span>
    </div>

  </div>
</body>
</html>`;
}

serve(handler);
