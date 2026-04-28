import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { mergeTimeIntervals, type TimeInterval } from "../_shared/time-merge.ts";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173").split(",").map(o => o.trim());

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

// Helper: conditionally add organization_id filter.
// If orgId is null, returns the query unchanged (global / backward-compatible).
function addOrgFilter(query: any, orgId: string | null): any {
  return orgId ? query.eq('organization_id', orgId) : query;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔧 Auto-send-reports function called');
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not set");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional organization_id from request body
    let organizationId: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        organizationId = body.organization_id || null;
      } catch {
        // No body – fall back to global
      }
    }

    if (organizationId) {
      console.log(`🏢 Organization scoped: ${organizationId}`);
    } else {
      console.log('🌐 No organization_id – running in global mode');
    }

    console.log('✅ Using service_role key for database access');

    // Get report configurations with recipients (org-scoped if provided)
    let configQuery = supabase
      .from('report_configurations')
      .select(`
        *,
        report_recipients(*, users(*))
      `)
      .eq('is_active', true);
    configQuery = addOrgFilter(configQuery, organizationId);

    const { data: reportConfigs, error: configError } = await configQuery;

    if (configError) {
      throw new Error(`Config error: ${configError.message}`);
    }

    const results: any[] = [];
    let totalRecipients = 0;

    for (const config of reportConfigs || []) {
      try {
        console.log(`📊 Processing: ${config.name} (${config.template_type})`);
        
        // Use the config's own organization_id for data queries
        const configOrgId = config.organization_id || organizationId;

        let reportData: any = {};
        let emailHtml = '';
        let emailSubject = '';

        if (config.template_type === 'daily') {
          reportData = await generateDailyReport(supabase, configOrgId);
          emailHtml = generateDailyEmailHtml(reportData);
          emailSubject = `Daily Summary - ${new Date().toLocaleDateString()}`;
        } else if (config.template_type === 'weekly') {
          reportData = await generateWeeklyReport(supabase, configOrgId);
          emailHtml = generateWeeklyEmailHtml(reportData);
          emailSubject = `Weekly Report - Week of ${new Date().toLocaleDateString()}`;
        }

        const reportRecipients = config.report_recipients || [];
        if (reportRecipients.length === 0) {
          results.push({
            id: config.id,
            name: config.name,
            type: config.template_type,
            success: false,
            message: "No recipients configured",
            recipients: 0
          });
          continue;
        }

        // Extract email addresses from recipients
        const recipientEmails = reportRecipients.map((r: any) => r.email || r.users?.email).filter(Boolean);
        if (recipientEmails.length === 0) {
          console.log(`⚠️ No valid email addresses found for ${config.name}`);
          results.push({
            id: config.id,
            name: config.name,
            type: config.template_type,
            success: false,
            message: "No valid email addresses found",
            recipients: 0
          });
          continue;
        }

        // Send email
        const emailResult = await resend.emails.send({
          from: 'noreply@ebdaadt.com',
          to: recipientEmails,
          subject: emailSubject,
          html: emailHtml,
        });

        if (emailResult.error) {
          throw new Error(`Email failed: ${emailResult.error.message}`);
        }

        totalRecipients += recipientEmails.length;
        results.push({
          id: config.id,
          name: config.name,
          type: config.template_type,
          success: true,
          message: `Sent to ${recipientEmails.length} recipients`,
          recipients: recipientEmails.length
        });

        // Log to report_history (include organization_id)
        await supabase
          .from('report_history')
          .insert({
            report_config_id: config.id,
            recipient_count: recipientEmails.length,
            status: 'sent',
            report_data: reportData,
            organization_id: configOrgId
          });

      } catch (error: any) {
        console.error(`❌ Error processing ${config.name}:`, error);
        results.push({
          id: config.id,
          name: config.name,
          type: config.template_type,
          success: false,
          message: error.message,
          recipients: 0
        });
      }
    }

    const sentCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return new Response(JSON.stringify({
      success: true,
      message: `Sent ${sentCount}/${totalCount} reports to ${totalRecipients} recipients`,
      results,
      stats: { sent: sentCount, total: totalCount, totalRecipients },
      organization_id: organizationId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

// Generate daily report with org-scoped data
async function generateDailyReport(supabase: any, organizationId: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  console.log(`📅 Daily: ${today.toISOString()} to ${tomorrow.toISOString()}`);

  const employeeStats = await getEmployeeStatsForPeriod(supabase, today, tomorrow, organizationId);
  const totalHours = employeeStats.reduce((sum: number, emp: any) => sum + emp.total_hours, 0);
  const avgActivity = employeeStats.length > 0 ? employeeStats.reduce((sum: number, emp: any) => sum + emp.activity_percentage, 0) / employeeStats.length : 0;

  return {
    date: today.toLocaleDateString(),
    type: 'daily',
    employees: employeeStats,
    totalHours,
    avgActivity,
    alerts: []
  };
}

// Generate weekly report with org-scoped data
async function generateWeeklyReport(supabase: any, organizationId: string | null) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  console.log(`📅 Weekly: ${startOfWeek.toISOString()} to ${endOfWeek.toISOString()}`);

  const employeeStats = await getEmployeeStatsForPeriod(supabase, startOfWeek, endOfWeek, organizationId);
  const totalHours = employeeStats.reduce((sum: number, emp: any) => sum + emp.total_hours, 0);
  const avgActivity = employeeStats.length > 0 ? employeeStats.reduce((sum: number, emp: any) => sum + emp.activity_percentage, 0) / employeeStats.length : 0;

  return {
    date: startOfWeek.toLocaleDateString(),
    type: 'weekly',
    employees: employeeStats,
    totalHours,
    avgActivity,
    alerts: []
  };
}

// Get employee stats with org filtering
async function getEmployeeStatsForPeriod(supabase: any, startDate: Date, endDate: Date, organizationId: string | null) {
  console.log(`👥 Getting stats: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  let query = supabase
    .from('time_logs')
    .select(`
      id,
      start_time,
      end_time,
      user_id,
      users!inner(id, full_name, email)
    `)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .not('end_time', 'is', null);
  query = addOrgFilter(query, organizationId);

  const { data: timeLogs, error } = await query;

  if (error) {
    throw new Error(`Employee stats error: ${error.message}`);
  }

  console.log(`📊 Found ${timeLogs?.length || 0} logs for stats`);

  const userIntervals = new Map<string, TimeInterval[]>();
  const userStats = new Map();
  
  for (const log of timeLogs || []) {
    if (!log.users) {
      console.log(`⚠️ Skipping log ${log.id} - no user data`);
      continue;
    }

    const userId = log.user_id;
    const startMs = new Date(log.start_time).getTime();
    const endMs = new Date(log.end_time).getTime();
    if (endMs <= startMs) continue;

    if (!userIntervals.has(userId)) {
      userIntervals.set(userId, []);
    }
    userIntervals.get(userId)!.push({ startMs, endMs });

    if (!userStats.has(userId)) {
      userStats.set(userId, {
        id: userId,
        full_name: log.users.full_name,
        email: log.users.email,
        total_hours: 0,
        activity_percentage: 0,
        first_start: log.start_time,
        last_stop: log.end_time,
        projects: [],
        alerts: []
      });
    }

    const user = userStats.get(userId);
    if (new Date(log.start_time) < new Date(user.first_start)) {
      user.first_start = log.start_time;
    }
    if (new Date(log.end_time) > new Date(user.last_stop)) {
      user.last_stop = log.end_time;
    }
  }

  for (const [userId, intervals] of userIntervals) {
    const merged = mergeTimeIntervals(intervals);
    const totalMs = merged.reduce((sum, i) => sum + (i.endMs - i.startMs), 0);
    const totalHours = totalMs / (1000 * 60 * 60);
    const user = userStats.get(userId);
    if (user) user.total_hours = totalHours;
  }

  const workDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const maxHours = workDays * 8;

  for (const user of userStats.values()) {
    user.activity_percentage = maxHours > 0 ? (user.total_hours / maxHours) * 100 : 0;
  }

  const result = Array.from(userStats.values());
  console.log(`👥 Processed ${result.length} employees, total hours: ${result.reduce((sum: number, u: any) => sum + u.total_hours, 0).toFixed(2)}`);
  
  return result;
}

// Generate email HTML
function generateDailyEmailHtml(reportData: any) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #667eea;">📊 Daily Work Summary</h1>
      <p><strong>Date:</strong> ${reportData.date}</p>
      
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
        <h3 style="margin: 0; color: #166534;">📈 Summary</h3>
        <p><strong>Total Hours:</strong> ${reportData.totalHours.toFixed(2)} hours</p>
        <p><strong>Average Activity:</strong> ${reportData.avgActivity.toFixed(1)}%</p>
        <p><strong>Active Employees:</strong> ${reportData.employees.length}</p>
      </div>

      <h3>👥 Employee Activity</h3>
      ${reportData.employees.map((emp: any) => `
        <div style="border: 1px solid #e5e7eb; padding: 15px; margin: 10px 0; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0;">${emp.full_name}</h4>
          <p><strong>Hours:</strong> ${emp.total_hours.toFixed(2)}</p>
          <p><strong>Activity:</strong> ${emp.activity_percentage.toFixed(1)}%</p>
          <p><strong>First Start:</strong> ${new Date(emp.first_start).toLocaleTimeString()}</p>
          <p><strong>Last Stop:</strong> ${new Date(emp.last_stop).toLocaleTimeString()}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function generateWeeklyEmailHtml(reportData: any) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #667eea;">📊 Weekly Performance Report</h1>
      <p><strong>Week of:</strong> ${reportData.date}</p>
      
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
        <h3 style="margin: 0; color: #166534;">📈 Weekly Summary</h3>
        <p><strong>Total Hours:</strong> ${reportData.totalHours.toFixed(2)} hours</p>
        <p><strong>Average Activity:</strong> ${reportData.avgActivity.toFixed(1)}%</p>
        <p><strong>Active Employees:</strong> ${reportData.employees.length}</p>
      </div>

      <h3>👥 Employee Performance</h3>
      ${reportData.employees.map((emp: any) => `
        <div style="border: 1px solid #e5e7eb; padding: 15px; margin: 10px 0; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0;">${emp.full_name}</h4>
          <p><strong>Hours:</strong> ${emp.total_hours.toFixed(2)}</p>
          <p><strong>Activity:</strong> ${emp.activity_percentage.toFixed(1)}%</p>
          <p><strong>First Start:</strong> ${new Date(emp.first_start).toLocaleDateString()} ${new Date(emp.first_start).toLocaleTimeString()}</p>
          <p><strong>Last Stop:</strong> ${new Date(emp.last_stop).toLocaleDateString()} ${new Date(emp.last_stop).toLocaleTimeString()}</p>
        </div>
      `).join('')}
    </div>
  `;
}

serve(handler);
