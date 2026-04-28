import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { mergeTimeIntervals, type TimeInterval } from "../_shared/time-merge.ts";

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : '';
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const corsHeaders = getCorsHeaders();

interface EmployeeStats {
  id: string;
  full_name: string;
  email: string;
  total_hours: number;
  activity_percentage: number;
  first_start?: string;
  last_stop?: string;
  projects: string[];
  alerts: string[];
}

interface ProjectStats {
  id: string;
  name: string;
  total_hours: number;
  activity_percentage: number;
  member_count: number;
}

interface AppUsageStats {
  app_name: string;
  total_time: string;
  percentage: number;
}

interface UrlUsageStats {
  domain: string;
  total_time: string;
  percentage: number;
}

interface AIInsightData {
  user_id: string;
  productivity_score: number;
  risk_level: string;
  activity_percentage: number;
  screenshots_analyzed: number;
  executive_summary: string;
  work_description: string;
  distraction_score: number;
  performance_status: string;
  team_avg_diff: number;
}

// Helper: conditionally add organization_id filter to a Supabase query.
// If orgId is null/undefined, returns the query unchanged (global behavior).
function addOrgFilter(query: any, orgId: string | null): any {
  return orgId ? query.eq('organization_id', orgId) : query;
}

// Parse optional organization_id from the request body.
// Returns { organizationId, orgName } or nulls if not provided.
async function resolveOrganization(
  req: Request,
  supabase: any
): Promise<{ organizationId: string | null; orgName: string }> {
  let organizationId: string | null = null;
  let orgName = 'Ebdaadt';

  if (req.method === 'POST') {
    try {
      const cloned = req.clone();
      const body = await cloned.json();
      organizationId = body.organization_id || null;
    } catch {
      // No body or invalid JSON – fall back to global
    }
  }

  if (organizationId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();
    if (org?.name) {
      orgName = org.name;
    }
    console.log(`🏢 Organization scoped: ${orgName} (${organizationId})`);
  } else {
    console.log('🌐 No organization_id provided – running in global mode');
  }

  return { organizationId, orgName };
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔧 Email reports function called, method:', req.method);
    console.log('🔧 Request URL:', req.url);

    const url = new URL(req.url);
    let path = url.pathname.split('/').pop();
    
    console.log('🔧 Path:', path);

    // pg_cron calls the base /email-reports path with report_type in body;
    // remap to the internal sub-route so existing handlers pick it up.
    if (path === 'email-reports' && req.method === 'POST') {
      try {
        const bodyPeek = await req.clone().json();
        if (bodyPeek.report_type === 'daily') path = 'send-daily-report';
        else if (bodyPeek.report_type === 'weekly') path = 'send-weekly-report';
        console.log('🔧 Remapped path from email-reports to:', path);
      } catch { /* body parse failed – fall through to normal routing */ }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY not found in environment variables');
      throw new Error("RESEND_API_KEY environment variable is not set");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve optional organization scope
    const { organizationId, orgName } = await resolveOrganization(req, supabase);

    // Handle test email
    if (path === 'test-email' && req.method === 'POST') {
      console.log('📧 Testing email configuration...');
      
      // Get first admin user as test recipient (scoped to org if provided)
      let adminQuery = supabase
        .from('users')
        .select('email, full_name')
        .eq('role', 'admin')
        .limit(1);
      adminQuery = addOrgFilter(adminQuery, organizationId);
      const { data: admins, error } = await adminQuery;

      if (error || !admins || admins.length === 0) {
        console.error('❌ No admin users found:', error);
        throw new Error('No admin users found to test email');
      }

      console.log('👤 Found admin user:', admins[0].email);

      const testHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #667eea;">📧 Email Test Successful!</h1>
          <p>This is a test email from your ${orgName} automated reports system.</p>
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
            <strong>✅ Email Configuration Working</strong><br>
            Your Resend API integration is working correctly.
          </div>
          <p><strong>Test Details:</strong></p>
          <ul>
            <li>Sent to: ${admins[0].email}</li>
            <li>Organization: ${orgName}</li>
            <li>Time: ${new Date().toISOString()}</li>
            <li>Service: Resend API</li>
          </ul>
          <p>You can now configure your ${orgName} automated reports with confidence!</p>
        </div>
      `;

      console.log('📨 Sending test email...');
      const emailResponse = await resend.emails.send({
        from: "TimeFlow Reports <info@ebdaadt.com>",
        to: [admins[0].email],
        subject: `📧 ${orgName} Email Test - Configuration Successful`,
        html: testHtml,
      });

      console.log('✅ Test email sent successfully:', emailResponse);

      return new Response(JSON.stringify({
        success: true,
        message: `Test email sent successfully to ${admins[0].email}`,
        emailId: emailResponse.id,
        organization_id: organizationId
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle daily report generation
    if (path === 'send-daily-report' && req.method === 'POST') {
      console.log('📊 Generating daily report...');

      // Helper: build and send daily report for one org
      async function sendDailyForOrg(oId: string, oName: string) {
        const reportData = await generateDailyReport(supabase, oId);
        reportData.org_name = oName;
        const empCount = (reportData.employees || []).length;
        const hasPdf = empCount > 3;

        let pdfBase64: string | null = null;
        if (hasPdf) {
          console.log(`📄 Generating PDF for ${oName} (${empCount} employees)`);
          const pdfBytes = await generateReportPDF(reportData, 'daily');
          pdfBase64 = uint8ArrayToBase64(pdfBytes);
        }

        const htmlContent = generateDailyReportHTML(reportData, hasPdf);

        const { data: admins } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('role', 'admin')
          .eq('organization_id', oId);

        if (!admins || admins.length === 0) return null;

        const recipients = admins.map((a: any) => a.email);
        const dateStr = reportData.date || new Date().toISOString().split('T')[0];

        const emailPayload: any = {
          from: "TimeFlow Reports <info@ebdaadt.com>",
          to: recipients,
          subject: `📅 ${oName} Daily Summary - ${dateStr}`,
          html: htmlContent,
        };
        if (pdfBase64) {
          emailPayload.attachments = [{
            filename: `${oName.replace(/\s+/g, '-')}-Daily-Report-${dateStr}.pdf`,
            content: pdfBase64,
          }];
        }
        const emailResponse = await resend.emails.send(emailPayload);
        console.log(`✅ Daily report for ${oName} sent to ${recipients.length} admins (PDF: ${hasPdf})`);
        return { recipients: recipients.length, emailId: emailResponse.id };
      }

      // If no organization_id provided, iterate over ALL orgs so each gets its own scoped report
      if (!organizationId) {
        console.log('🔄 No organization_id – sending scoped daily reports per organization');
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .order('created_at');

        const results: any[] = [];
        for (const org of (orgs || [])) {
          try {
            const result = await sendDailyForOrg(org.id, org.name);
            if (result) {
              results.push({ organization: org.name, ...result });
            } else {
              console.log(`⚠️ No admins found for ${org.name} – skipping`);
            }
          } catch (orgError: any) {
            console.error(`❌ Error sending daily report for ${org.name}:`, orgError.message);
            results.push({ organization: org.name, error: orgError.message });
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Daily reports sent for ${results.filter(r => !r.error).length} organizations`,
          results
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Single org – generate scoped report
      try {
        const result = await sendDailyForOrg(organizationId, orgName);
        return new Response(JSON.stringify({
          success: true,
          message: result ? `Daily report sent to ${result.recipients} recipients` : 'No admins found',
          emailId: result?.emailId,
          organization_id: organizationId
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err: any) {
        throw err;
      }
    }

    // Handle weekly report generation
    if (path === 'send-weekly-report' && req.method === 'POST') {
      console.log('📊 Generating weekly report...');

      // Helper: build and send weekly report for one org
      async function sendWeeklyForOrg(oId: string, oName: string) {
        const reportData = await generateWeeklyReport(supabase, oId);
        reportData.org_name = oName;
        const empCount = (reportData.employees || []).length;
        const hasPdf = empCount > 3;

        let pdfBase64: string | null = null;
        if (hasPdf) {
          console.log(`📄 Generating weekly PDF for ${oName} (${empCount} employees)`);
          const pdfBytes = await generateReportPDF(reportData, 'weekly');
          pdfBase64 = uint8ArrayToBase64(pdfBytes);
        }

        const htmlContent = generateWeeklyReportHTML(reportData, hasPdf);

        const { data: admins } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('role', 'admin')
          .eq('organization_id', oId);

        if (!admins || admins.length === 0) return null;

        const recipients = admins.map((a: any) => a.email);
        const periodStr = reportData.week_period || '';

        const emailPayload: any = {
          from: "TimeFlow Reports <info@ebdaadt.com>",
          to: recipients,
          subject: `📊 ${oName} Weekly Report - ${periodStr}`,
          html: htmlContent,
        };
        if (pdfBase64) {
          emailPayload.attachments = [{
            filename: `${oName.replace(/\s+/g, '-')}-Weekly-Report.pdf`,
            content: pdfBase64,
          }];
        }
        const emailResponse = await resend.emails.send(emailPayload);
        console.log(`✅ Weekly report for ${oName} sent to ${recipients.length} admins (PDF: ${hasPdf})`);
        return { recipients: recipients.length, emailId: emailResponse.id };
      }

      // If no organization_id provided, iterate over ALL orgs so each gets its own scoped report
      if (!organizationId) {
        console.log('🔄 No organization_id – sending scoped weekly reports per organization');
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name')
          .order('created_at');

        const results: any[] = [];
        for (const org of (orgs || [])) {
          try {
            const result = await sendWeeklyForOrg(org.id, org.name);
            if (result) {
              results.push({ organization: org.name, ...result });
            } else {
              console.log(`⚠️ No admins found for ${org.name} – skipping`);
            }
          } catch (orgError: any) {
            console.error(`❌ Error sending weekly report for ${org.name}:`, orgError.message);
            results.push({ organization: org.name, error: orgError.message });
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Weekly reports sent for ${results.filter(r => !r.error).length} organizations`,
          results
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Single org – generate scoped report
      try {
        const result = await sendWeeklyForOrg(organizationId, orgName);
        return new Response(JSON.stringify({
          success: true,
          message: result ? `Weekly report sent to ${result.recipients} recipients` : 'No admins found',
          emailId: result?.emailId,
          organization_id: organizationId
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err: any) {
        throw err;
      }
    }

    // Handle other endpoints
    if (path === 'types' && req.method === 'GET') {
      const { data, error } = await supabase
        .from('report_types')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (path === 'admin-users' && req.method === 'GET') {
      let adminQuery = supabase
        .from('users')
        .select('id, email, full_name')
        .eq('role', 'admin');
      adminQuery = addOrgFilter(adminQuery, organizationId);
      const { data, error } = await adminQuery;

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Default response
    return new Response(JSON.stringify({
      success: false,
      message: `Endpoint not found: ${path}`
    }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error('❌ Error in email-reports function:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

// Fetch ALL active non-admin employees in an organization
async function getAllOrgEmployees(supabase: any, organizationId: string | null): Promise<{id: string; full_name: string; email: string}[]> {
  if (!organizationId) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .eq('organization_id', organizationId)
    .neq('role', 'admin')
    .or('is_active.is.null,is_active.eq.true')
    .order('full_name');
  if (error || !data) return [];
  return data;
}

// Generate daily report data
async function generateDailyReport(supabase: any, organizationId: string | null) {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  console.log('📅 Generating daily report for:', startOfDay.toISOString(), 'to', endOfDay.toISOString());

  // Get employee stats for today
  const employeeStats = await getEmployeeStatsForPeriod(supabase, startOfDay, endOfDay, organizationId);
  
  // Get project stats for today
  const projectStats = await getProjectStatsForPeriod(supabase, startOfDay, endOfDay, organizationId);
  
  // Get app usage stats for today with improved logic
  const appUsageStats = await getAppUsageStatsForPeriod(supabase, startOfDay, endOfDay, organizationId);
  
  // Get URL usage stats for today with improved logic
  const urlUsageStats = await getUrlUsageStatsForPeriod(supabase, startOfDay, endOfDay, organizationId);

  // Get AI insights for all employees
  const aiInsights = await getAIInsightsForPeriod(supabase, startOfDay, endOfDay, organizationId);

  console.log('📊 Daily report summary:');
  console.log('- Employees:', employeeStats.length);
  console.log('- Projects:', projectStats.length);
  console.log('- App usage entries:', appUsageStats.length);
  console.log('- URL usage entries:', urlUsageStats.length);
  console.log('- AI insights:', aiInsights.size);

  // Get ALL org employees to include absent ones
  const allOrgEmployees = await getAllOrgEmployees(supabase, organizationId);

  // Build a map of employees who worked (from time_logs)
  const workedMap = new Map<string, EmployeeStats>();
  employeeStats.forEach(emp => workedMap.set(emp.id, emp));

  // Merge: start with all org employees, overlay time_log + AI data
  const allEmployeesWithAI = allOrgEmployees.map(orgEmp => {
    const worked = workedMap.get(orgEmp.id);
    const insight = aiInsights.get(orgEmp.id);
    const totalHrs = worked?.total_hours || 0;
    const actPct = worked?.activity_percentage || 0;
    const score = insight?.productivity_score || 0;
    const rl = insight?.risk_level || 'low';

    let status: string;
    if (!worked) {
      status = 'Absent';
    } else if (insight) {
      status = insight.performance_status;
    } else {
      status = getStatusFromActivity(actPct, totalHrs);
    }

    return {
      id: orgEmp.id,
      full_name: orgEmp.full_name,
      email: orgEmp.email,
      total_hours: totalHrs,
      activity_percentage: actPct,
      first_start: worked?.first_start || '',
      last_stop: worked?.last_stop || '',
      projects: worked?.projects || [],
      alerts: worked?.alerts || [],
      productivity_score: score,
      performance_status: status,
      ai_summary: insight?.executive_summary || insight?.work_description || '',
      screenshots_analyzed: insight?.screenshots_analyzed || 0,
      team_avg_diff: insight?.team_avg_diff || 0,
      risk_level: rl,
    };
  });

  const finalEmployees = allEmployeesWithAI.length > 0 ? allEmployeesWithAI : employeeStats.map(emp => {
    const insight = aiInsights.get(emp.id);
    const fallbackStatus = insight?.performance_status || getStatusFromActivity(emp.activity_percentage, emp.total_hours);
    return { ...emp, productivity_score: insight?.productivity_score || 0, performance_status: fallbackStatus, ai_summary: insight?.executive_summary || insight?.work_description || '', screenshots_analyzed: insight?.screenshots_analyzed || 0, team_avg_diff: insight?.team_avg_diff || 0, risk_level: insight?.risk_level || 'low' };
  });

  // Sort: worked employees by score (desc), then absent at the bottom
  finalEmployees.sort((a, b) => {
    if (a.performance_status === 'Absent' && b.performance_status !== 'Absent') return 1;
    if (a.performance_status !== 'Absent' && b.performance_status === 'Absent') return -1;
    return b.productivity_score - a.productivity_score;
  });

  // Get low activity alerts (only for employees who worked)
  const lowActivityAlerts = employeeStats.filter(emp => emp.activity_percentage < 30);

  // Calculate totals (only from employees who actually worked)
  const totalHours = employeeStats.reduce((sum, emp) => sum + emp.total_hours, 0);
  const avgActivity = employeeStats.length > 0 ? 
    employeeStats.reduce((sum, emp) => sum + emp.activity_percentage, 0) / employeeStats.length : 0;

  // Team average productivity from AI insights
  const allScores = Array.from(aiInsights.values()).map(i => i.productivity_score).filter(s => s > 0);
  const teamAvgProductivity = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  const membersWorked = employeeStats.length;
  const membersTotal = allOrgEmployees.length || employeeStats.length;
  const membersAbsent = membersTotal - membersWorked;

  return {
    date: today.toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }),
    total_hours: Math.floor(totalHours) + ':' + Math.floor((totalHours % 1) * 60).toString().padStart(2, '0'),
    members_worked: membersWorked,
    members_total: membersTotal,
    members_absent: membersAbsent,
    activity_percentage: Math.round(avgActivity),
    team_avg_productivity: teamAvgProductivity,
    employees: finalEmployees,
    projects: projectStats.slice(0, 10),
    app_usage: appUsageStats.slice(0, 10),
    url_usage: urlUsageStats.slice(0, 10),
    low_activity_alerts: lowActivityAlerts,
    org_name: 'Ebdaadt'
  };
}

// Generate weekly report data
async function generateWeeklyReport(supabase: any, organizationId: string | null) {
  const today = new Date();
  
  // Get current week (Sunday to Saturday)
  const dayOfWeek = today.getDay();
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  console.log('📅 Generating weekly report for:', startOfWeek.toISOString(), 'to', endOfWeek.toISOString());

  // Get employee stats for this week
  const employeeStats = await getEmployeeStatsForPeriod(supabase, startOfWeek, endOfWeek, organizationId);
  
  // Get project stats for this week
  const projectStats = await getProjectStatsForPeriod(supabase, startOfWeek, endOfWeek, organizationId);
  
  // Get app usage stats for this week with improved logic
  const appUsageStats = await getAppUsageStatsForPeriod(supabase, startOfWeek, endOfWeek, organizationId);

  // Get AI insights for all employees
  const aiInsights = await getAIInsightsForPeriod(supabase, startOfWeek, endOfWeek, organizationId);

  console.log('📊 Weekly report summary:');
  console.log('- Employees:', employeeStats.length);
  console.log('- Projects:', projectStats.length);
  console.log('- App usage entries:', appUsageStats.length);
  console.log('- AI insights:', aiInsights.size);

  // Get ALL org employees to include absent ones
  const allOrgEmployees = await getAllOrgEmployees(supabase, organizationId);

  // Build a map of employees who worked (from time_logs)
  const workedMap = new Map<string, EmployeeStats>();
  employeeStats.forEach(emp => workedMap.set(emp.id, emp));

  // Merge: start with all org employees, overlay time_log + AI data
  const allEmployeesWithAI = allOrgEmployees.map(orgEmp => {
    const worked = workedMap.get(orgEmp.id);
    const insight = aiInsights.get(orgEmp.id);
    const totalHrs = worked?.total_hours || 0;
    const actPct = worked?.activity_percentage || 0;
    const score = insight?.productivity_score || 0;
    const rl = insight?.risk_level || 'low';

    let status: string;
    if (!worked) {
      status = 'Absent';
    } else if (insight) {
      status = insight.performance_status;
    } else {
      status = getStatusFromActivity(actPct, totalHrs);
    }

    return {
      id: orgEmp.id,
      full_name: orgEmp.full_name,
      email: orgEmp.email,
      total_hours: totalHrs,
      activity_percentage: actPct,
      first_start: worked?.first_start || '',
      last_stop: worked?.last_stop || '',
      projects: worked?.projects || [],
      alerts: worked?.alerts || [],
      productivity_score: score,
      performance_status: status,
      ai_summary: insight?.executive_summary || insight?.work_description || '',
      screenshots_analyzed: insight?.screenshots_analyzed || 0,
      team_avg_diff: insight?.team_avg_diff || 0,
      risk_level: rl,
    };
  });

  const finalEmployees = allEmployeesWithAI.length > 0 ? allEmployeesWithAI : employeeStats.map(emp => {
    const insight = aiInsights.get(emp.id);
    const fallbackStatus = insight?.performance_status || getStatusFromActivity(emp.activity_percentage, emp.total_hours);
    return { ...emp, productivity_score: insight?.productivity_score || 0, performance_status: fallbackStatus, ai_summary: insight?.executive_summary || insight?.work_description || '', screenshots_analyzed: insight?.screenshots_analyzed || 0, team_avg_diff: insight?.team_avg_diff || 0, risk_level: insight?.risk_level || 'low' };
  });

  // Sort: worked employees by score (desc), absent at bottom
  finalEmployees.sort((a, b) => {
    if (a.performance_status === 'Absent' && b.performance_status !== 'Absent') return 1;
    if (a.performance_status !== 'Absent' && b.performance_status === 'Absent') return -1;
    return b.productivity_score - a.productivity_score;
  });

  // Calculate summary statistics (only from employees who worked)
  const totalHours = employeeStats.reduce((sum, emp) => sum + emp.total_hours, 0);
  const avgActivity = employeeStats.length > 0 ? 
    employeeStats.reduce((sum, emp) => sum + emp.activity_percentage, 0) / employeeStats.length : 0;

  // Team average productivity from AI insights
  const allScores = Array.from(aiInsights.values()).map(i => i.productivity_score).filter(s => s > 0);
  const teamAvgProductivity = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  const membersWorked = employeeStats.length;
  const membersTotal = allOrgEmployees.length || employeeStats.length;
  const membersAbsent = membersTotal - membersWorked;

  return {
    week_period: `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    total_hours: Math.floor(totalHours) + ':' + Math.floor((totalHours % 1) * 60).toString().padStart(2, '0'),
    members_worked: membersWorked,
    members_total: membersTotal,
    members_absent: membersAbsent,
    activity_percentage: Math.round(avgActivity),
    team_avg_productivity: teamAvgProductivity,
    employees: finalEmployees,
    projects: projectStats,
    app_usage: appUsageStats,
    org_name: 'Ebdaadt'
  };
}

// Get employee statistics for a time period (org-scoped)
async function getEmployeeStatsForPeriod(supabase: any, startDate: Date, endDate: Date, organizationId: string | null): Promise<EmployeeStats[]> {
  console.log('🔍 Querying time_logs from:', startDate.toISOString(), 'to', endDate.toISOString());
  
  // Get time logs for the period (org-filtered)
  let query = supabase
    .from('time_logs')
    .select(`
      user_id,
      start_time,
      end_time,
      users (
        id,
        full_name,
        email
      ),
      projects (
        name
      )
    `)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .not('end_time', 'is', null);
  query = addOrgFilter(query, organizationId);

  const { data: timeLogs, error } = await query;

  console.log('📊 Time logs query result:', {
    error: error,
    count: timeLogs?.length || 0,
    firstLog: timeLogs?.[0] || null
  });

  if (error) {
    console.error('❌ Error fetching time logs:', error);
    return [];
  }

  if (!timeLogs || timeLogs.length === 0) {
    console.log('⚠️ No time logs found for the specified period');
    return [];
  }

  // Group by user: collect intervals per user, then merge and sum
  const userIntervals = new Map<string, TimeInterval[]>();
  const userStats = new Map<string, EmployeeStats>();

  timeLogs?.forEach((log: any) => {
    if (!log.users) return;

    const userId = log.user_id;
    const startMs = new Date(log.start_time).getTime();
    const endMs = new Date(log.end_time).getTime();
    if (endMs <= startMs) return;

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

    const stats = userStats.get(userId)!;
    if (new Date(log.start_time) < new Date(stats.first_start!)) {
      stats.first_start = log.start_time;
    }
    if (new Date(log.end_time) > new Date(stats.last_stop!)) {
      stats.last_stop = log.end_time;
    }

    if (log.projects?.name && !stats.projects.includes(log.projects.name)) {
      stats.projects.push(log.projects.name);
    }
  });

  for (const [userId, intervals] of userIntervals) {
    const merged = mergeTimeIntervals(intervals);
    const totalMs = merged.reduce((sum, i) => sum + (i.endMs - i.startMs), 0);
    const totalHours = totalMs / (1000 * 60 * 60);
    const stats = userStats.get(userId)!;
    if (stats) stats.total_hours = totalHours;
  }

  // Get activity percentages from screenshots
  for (const [userId, stats] of userStats) {
    let screenshotQuery = supabase
      .from('screenshots')
      .select('activity_percent')
      .eq('user_id', userId)
      .gte('captured_at', startDate.toISOString())
      .lte('captured_at', endDate.toISOString())
      .not('activity_percent', 'is', null);
    // Screenshots are already user-scoped, but add org filter for extra safety
    screenshotQuery = addOrgFilter(screenshotQuery, organizationId);

    const { data: screenshots } = await screenshotQuery;

    if (screenshots && screenshots.length > 0) {
      const avgActivity = screenshots.reduce((sum: number, s: any) => sum + (s.activity_percent || 0), 0) / screenshots.length;
      stats.activity_percentage = avgActivity;
    } else {
      stats.activity_percentage = 0; // No screenshots = no activity data
    }

    // Format times
    if (stats.first_start) {
      stats.first_start = new Date(stats.first_start).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    }
    if (stats.last_stop) {
      stats.last_stop = new Date(stats.last_stop).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
    }
  }

  console.log('📊 Final employee stats:', Array.from(userStats.values()).length, 'employees');
  return Array.from(userStats.values()).sort((a, b) => b.total_hours - a.total_hours);
}

// Get project statistics for a time period (org-scoped)
async function getProjectStatsForPeriod(supabase: any, startDate: Date, endDate: Date, organizationId: string | null): Promise<ProjectStats[]> {
  let query = supabase
    .from('time_logs')
    .select(`
      project_id,
      start_time,
      end_time,
      user_id,
      projects (
        id,
        name
      )
    `)
    .gte('start_time', startDate.toISOString())
    .lte('start_time', endDate.toISOString())
    .not('end_time', 'is', null);
  query = addOrgFilter(query, organizationId);

  const { data: timeLogs, error } = await query;

  if (error) {
    console.error('Error fetching project time logs:', error);
    return [];
  }

  const projectStats = new Map<string, ProjectStats>();

  timeLogs?.forEach((log: any) => {
    if (!log.projects) return;

    const projectId = log.project_id;
    const startTime = new Date(log.start_time);
    const endTime = new Date(log.end_time);
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

    if (!projectStats.has(projectId)) {
      projectStats.set(projectId, {
        id: projectId,
        name: log.projects.name,
        total_hours: 0,
        activity_percentage: 0,
        member_count: new Set() as any
      });
    }

    const stats = projectStats.get(projectId)!;
    stats.total_hours += duration;
    (stats.member_count as unknown as Set<string>).add(log.user_id);
  });

  // Convert member count sets to numbers and calculate activity
  const result = Array.from(projectStats.values()).map(project => ({
    ...project,
    member_count: (project.member_count as unknown as Set<string>).size,
    activity_percentage: 0 // Activity not tracked at project level
  }));

  return result.sort((a, b) => b.total_hours - a.total_hours);
}

// Get app usage statistics for a time period (org-scoped)
async function getAppUsageStatsForPeriod(supabase: any, startDate: Date, endDate: Date, organizationId: string | null): Promise<AppUsageStats[]> {
  console.log('🔍 Fetching app logs from:', startDate.toISOString(), 'to:', endDate.toISOString());
  
  let query = supabase
    .from('app_logs')
    .select('app_name, duration_seconds, started_at, ended_at, timestamp')
    .or(`started_at.gte.${startDate.toISOString()},timestamp.gte.${startDate.toISOString()}`)
    .or(`started_at.lte.${endDate.toISOString()},timestamp.lte.${endDate.toISOString()}`);
  query = addOrgFilter(query, organizationId);

  const { data: appLogs, error } = await query;

  if (error) {
    console.error('Error fetching app logs:', error);
    return [];
  }

  console.log('📱 Raw app logs found:', appLogs?.length || 0);

  if (!appLogs || appLogs.length === 0) {
    // Try alternative query if no data found
    let altQuery = supabase
      .from('app_logs')
      .select('app_name, duration_seconds, started_at, ended_at, timestamp')
      .order('started_at', { ascending: false })
      .limit(100);
    altQuery = addOrgFilter(altQuery, organizationId);

    const { data: alternativeAppLogs, error: altError } = await altQuery;
    
    if (altError) {
      console.error('Error fetching alternative app logs:', altError);
    } else {
      console.log('📱 Alternative app logs found:', alternativeAppLogs?.length || 0);
      if (alternativeAppLogs && alternativeAppLogs.length > 0) {
        const filteredLogs = alternativeAppLogs.filter((log: any) => {
          const logDate = new Date(log.started_at || log.timestamp);
          return logDate >= startDate && logDate <= endDate;
        });
        console.log('📱 Filtered alternative app logs:', filteredLogs.length);
        return processAppLogs(filteredLogs);
      }
    }
    
    console.log('📱 No app logs found, returning empty array');
    return [];
  }

  return processAppLogs(appLogs);
}

function processAppLogs(appLogs: any[]): AppUsageStats[] {
  const appStats = new Map<string, number>();

  appLogs.forEach((log: any) => {
    const appName = log.app_name || 'Unknown App';
    let duration = 0;
    
    if (log.duration_seconds && log.duration_seconds > 0) {
      duration = log.duration_seconds;
    } else if (log.started_at && log.ended_at) {
      const start = new Date(log.started_at);
      const end = new Date(log.ended_at);
      duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    } else {
      duration = 60;
    }
    
    if (duration > 0) {
      appStats.set(appName, (appStats.get(appName) || 0) + duration);
    }
  });

  console.log('📱 Processed app stats:', appStats.size, 'unique apps');
  
  if (appStats.size === 0) {
    return [];
  }

  const totalTime = Array.from(appStats.values()).reduce((sum, time) => sum + time, 0);

  const result = Array.from(appStats.entries())
    .map(([app_name, seconds]) => ({
      app_name,
      total_time: formatDuration(seconds),
      percentage: totalTime > 0 ? Math.round((seconds / totalTime) * 100) : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  console.log('📱 Final app usage stats:', result.length, 'entries');
  return result;
}

// Get URL usage statistics for a time period (org-scoped)
async function getUrlUsageStatsForPeriod(supabase: any, startDate: Date, endDate: Date, organizationId: string | null): Promise<UrlUsageStats[]> {
  console.log('🔍 Fetching URL logs from:', startDate.toISOString(), 'to:', endDate.toISOString());
  
  let query = supabase
    .from('url_logs')
    .select('domain, site_url, duration_seconds, started_at, ended_at, timestamp')
    .or(`started_at.gte.${startDate.toISOString()},timestamp.gte.${startDate.toISOString()}`)
    .or(`started_at.lte.${endDate.toISOString()},timestamp.lte.${endDate.toISOString()}`);
  query = addOrgFilter(query, organizationId);

  const { data: urlLogs, error } = await query;

  if (error) {
    console.error('Error fetching URL logs:', error);
    return [];
  }

  console.log('🌐 Raw URL logs found:', urlLogs?.length || 0);

  if (!urlLogs || urlLogs.length === 0) {
    let altQuery = supabase
      .from('url_logs')
      .select('domain, site_url, duration_seconds, started_at, ended_at, timestamp')
      .order('started_at', { ascending: false })
      .limit(100);
    altQuery = addOrgFilter(altQuery, organizationId);

    const { data: alternativeUrlLogs, error: altError } = await altQuery;
    
    if (altError) {
      console.error('Error fetching alternative URL logs:', altError);
    } else {
      console.log('🌐 Alternative URL logs found:', alternativeUrlLogs?.length || 0);
      if (alternativeUrlLogs && alternativeUrlLogs.length > 0) {
        const filteredLogs = alternativeUrlLogs.filter((log: any) => {
          const logDate = new Date(log.started_at || log.timestamp);
          return logDate >= startDate && logDate <= endDate;
        });
        console.log('🌐 Filtered alternative URL logs:', filteredLogs.length);
        return processUrlLogs(filteredLogs);
      }
    }
    
    console.log('🌐 No URL logs found, returning empty array');
    return [];
  }

  return processUrlLogs(urlLogs);
}

function processUrlLogs(urlLogs: any[]): UrlUsageStats[] {
  const urlStats = new Map<string, number>();

  urlLogs.forEach((log: any) => {
    const domain = log.domain || extractDomain(log.site_url) || 'Unknown Site';
    let duration = 0;
    
    if (log.duration_seconds && log.duration_seconds > 0) {
      duration = log.duration_seconds;
    } else if (log.started_at && log.ended_at) {
      const start = new Date(log.started_at);
      const end = new Date(log.ended_at);
      duration = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    } else {
      duration = 30;
    }
    
    if (duration > 0) {
      urlStats.set(domain, (urlStats.get(domain) || 0) + duration);
    }
  });

  console.log('🌐 Processed URL stats:', urlStats.size, 'unique domains');
  
  if (urlStats.size === 0) {
    return [];
  }

  const totalTime = Array.from(urlStats.values()).reduce((sum, time) => sum + time, 0);

  const result = Array.from(urlStats.entries())
    .map(([domain, seconds]) => ({
      domain,
      total_time: formatDuration(seconds),
      percentage: totalTime > 0 ? Math.round((seconds / totalTime) * 100) : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  console.log('🌐 Final URL usage stats:', result.length, 'entries');
  return result;
}

// Helper function to extract domain from URL
function extractDomain(url: string): string {
  if (!url) return 'Unknown';
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return url.split('/')[0] || 'Unknown';
  }
}

// Format duration from seconds to human readable
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Derive a basic status from activity data when AI insights are unavailable
function getStatusFromActivity(activityPct: number, totalHours: number): string {
  if (totalHours <= 0) return 'Absent';
  if (activityPct >= 70) return 'Good';
  if (activityPct >= 40) return 'Needs Improvement';
  return 'Concerning';
}

// Determine performance status - productivity score is the primary factor
function getPerformanceStatus(productivityScore: number, riskLevel: string, distractionScore: number): string {
  if (productivityScore >= 80) {
    return riskLevel === 'high' ? 'Good' : 'Excellent';
  }
  if (productivityScore >= 60) {
    return riskLevel === 'high' ? 'Needs Improvement' : 'Good';
  }
  if (productivityScore >= 40) {
    return 'Needs Improvement';
  }
  if (productivityScore > 0) {
    return 'Concerning';
  }
  return 'Concerning';
}

// Get badge color for performance status
function getStatusColor(status: string): string {
  switch (status) {
    case 'Excellent': return '#10b981';
    case 'Good': return '#3b82f6';
    case 'Needs Improvement': return '#f59e0b';
    case 'Concerning': return '#ef4444';
    case 'Absent': return '#9ca3af';
    default: return '#6b7280';
  }
}

// Get score color based on productivity value
function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

// Fetch AI insights for all employees in a given period
async function getAIInsightsForPeriod(
  supabase: any,
  startDate: Date,
  endDate: Date,
  organizationId: string | null
): Promise<Map<string, AIInsightData>> {
  console.log('🤖 Fetching AI insights from:', startDate.toISOString(), 'to', endDate.toISOString());

  let query = supabase
    .from('ai_employee_insights')
    .select('user_id, insights, created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data: insights, error } = await query;

  if (error) {
    console.error('❌ Error fetching AI insights:', error);
    return new Map();
  }

  if (!insights || insights.length === 0) {
    console.log('⚠️ No AI insights found for the period, trying latest available...');
    // Fallback: get the most recent insight for each user
    let fallbackQuery = supabase
      .from('ai_employee_insights')
      .select('user_id, insights, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (organizationId) {
      fallbackQuery = fallbackQuery.eq('organization_id', organizationId);
    }

    const { data: fallbackInsights } = await fallbackQuery;
    if (!fallbackInsights || fallbackInsights.length === 0) {
      console.log('⚠️ No AI insights available at all');
      return new Map();
    }

    return processInsightsToMap(fallbackInsights);
  }

  return processInsightsToMap(insights);
}

// Process raw insights rows into a Map keyed by user_id (latest per user)
function processInsightsToMap(insights: any[]): Map<string, AIInsightData> {
  const insightMap = new Map<string, AIInsightData>();
  const seenUsers = new Set<string>();

  for (const row of insights) {
    if (seenUsers.has(row.user_id)) continue; // Already have the latest for this user
    seenUsers.add(row.user_id);

    const ins = row.insights || {};
    const productivityScore = ins.productivity_score || 0;
    const riskLevel = ins.risk_level || 'low';
    const distractionScore = ins.distraction_indicators?.distraction_score || 0;
    const screenshotsAnalyzed = ins.screenshots_analyzed || ins.total_screenshots || 0;
    const activityPercentage = ins.activity_percentage || 0;

    const executiveSummary =
      ins.ai_insights?.executive_summary ||
      ins.executive_summary ||
      ins.ai_summary ||
      '';

    const workDescription =
      ins.ai_insights?.work_description ||
      ins.work_description ||
      '';

    insightMap.set(row.user_id, {
      user_id: row.user_id,
      productivity_score: productivityScore,
      risk_level: riskLevel,
      activity_percentage: activityPercentage,
      screenshots_analyzed: screenshotsAnalyzed,
      executive_summary: executiveSummary,
      work_description: workDescription,
      distraction_score: distractionScore,
      performance_status: getPerformanceStatus(productivityScore, riskLevel, distractionScore),
      team_avg_diff: 0 // Will be calculated after team average is known
    });
  }

  // Calculate team average and diffs
  const allScores = Array.from(insightMap.values()).map(i => i.productivity_score).filter(s => s > 0);
  const teamAvg = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

  for (const insight of insightMap.values()) {
    insight.team_avg_diff = insight.productivity_score - teamAvg;
  }

  console.log(`🤖 Processed ${insightMap.size} AI insights, team avg: ${teamAvg}%`);
  return insightMap;
}

// ──────────────────────────────────────────────
// PDF generation helpers (using pdf-lib)
// ──────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Sanitize text for PDF (remove non-WinAnsi characters that pdf-lib can't encode)
function sanitizeForPdf(text: string): string {
  // Replace non-printable-ASCII chars with space; keep standard Latin-1 supplement
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const safe = sanitizeForPdf(text);
  const words = safe.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function pdfStatusLabel(status: string): string {
  if (status === 'Excellent') return '[EXCELLENT]';
  if (status === 'Good') return '[GOOD]';
  if (status === 'Needs Improvement') return '[NEEDS IMPROVEMENT]';
  if (status === 'Concerning') return '[CONCERNING]';
  if (status === 'Absent') return '[ABSENT]';
  return '[CONCERNING]';
}

function pdfStatusColor(status: string) {
  if (status === 'Excellent') return rgb(0.024, 0.373, 0.275);
  if (status === 'Good') return rgb(0.118, 0.251, 0.686);
  if (status === 'Needs Improvement') return rgb(0.573, 0.251, 0.055);
  if (status === 'Concerning') return rgb(0.6, 0.106, 0.106);
  if (status === 'Absent') return rgb(0.61, 0.64, 0.69);
  return rgb(0.42, 0.42, 0.5);
}

function pdfScoreColor(score: number) {
  if (score >= 80) return rgb(0.063, 0.725, 0.506);
  if (score >= 60) return rgb(0.231, 0.51, 0.965);
  if (score >= 40) return rgb(0.961, 0.62, 0.043);
  return rgb(0.937, 0.267, 0.267);
}

async function generateReportPDF(data: any, reportType: 'daily' | 'weekly'): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 612;
  const pageH = 792;
  const margin = 50;
  const contentW = pageW - margin * 2;

  const orgName = data.org_name || 'Organization';
  const teamAvg = data.team_avg_productivity || 0;
  const employees = data.employees || [];
  const dateLabel = reportType === 'daily' ? (data.date || '') : (data.week_period || '');

  // --- Helper: add a new page and return { page, y } ---
  function newPage() {
    const page = pdfDoc.addPage([pageW, pageH]);
    return { page, y: pageH - margin };
  }

  // --- Helper: draw horizontal line ---
  function drawLine(page: any, y: number) {
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.8, 0.82, 0.84) });
  }

  // --- PAGE 1: Title + Summary ---
  let { page, y } = newPage();

  // Title bar background
  page.drawRectangle({ x: 0, y: pageH - 100, width: pageW, height: 100, color: reportType === 'daily' ? rgb(0.4, 0.494, 0.918) : rgb(0.063, 0.725, 0.506) });
  page.drawText(`${orgName} ${reportType === 'daily' ? 'Daily' : 'Weekly'} Report`, { x: margin, y: pageH - 50, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText(dateLabel, { x: margin, y: pageH - 72, size: 12, font, color: rgb(1, 1, 1) });

  y = pageH - 130;

  // Summary stats row
  const mWorked = data.members_worked || 0;
  const mTotal = data.members_total || mWorked;
  const mAbsent = data.members_absent || 0;
  const stats = [
    { label: 'Hours Worked', value: String(data.total_hours || '0') },
    { label: 'Members Worked / Total', value: `${mWorked} / ${mTotal}` },
    { label: 'Absent', value: String(mAbsent) },
    { label: 'AI Productivity', value: `${teamAvg}%` },
  ];
  const colW = contentW / 4;
  for (let i = 0; i < stats.length; i++) {
    const x = margin + i * colW;
    page.drawText(stats[i].value, { x: x + 10, y, size: 20, font: bold, color: rgb(0.15, 0.39, 0.92) });
    page.drawText(stats[i].label, { x: x + 10, y: y - 16, size: 9, font, color: rgb(0.42, 0.45, 0.5) });
  }
  y -= 45;
  drawLine(page, y);
  y -= 20;

  // Performance distribution (for weekly)
  if (reportType === 'weekly') {
    const statusCounts = { excellent: 0, good: 0, needsImprovement: 0, concerning: 0, absent: 0 };
    employees.forEach((emp: any) => {
      const s = emp.performance_status || '';
      if (s === 'Excellent') statusCounts.excellent++;
      else if (s === 'Good') statusCounts.good++;
      else if (s === 'Needs Improvement') statusCounts.needsImprovement++;
      else if (s === 'Concerning') statusCounts.concerning++;
      else if (s === 'Absent') statusCounts.absent++;
      else statusCounts.concerning++;
    });
    page.drawText('Performance Distribution', { x: margin, y, size: 14, font: bold, color: rgb(0.12, 0.16, 0.21) });
    y -= 22;
    const distItems = [
      { label: 'Excellent', count: statusCounts.excellent, clr: rgb(0.024, 0.373, 0.275) },
      { label: 'Good', count: statusCounts.good, clr: rgb(0.118, 0.251, 0.686) },
      { label: 'Needs Improvement', count: statusCounts.needsImprovement, clr: rgb(0.573, 0.251, 0.055) },
      { label: 'Concerning', count: statusCounts.concerning, clr: rgb(0.6, 0.106, 0.106) },
      { label: 'Absent', count: statusCounts.absent, clr: rgb(0.61, 0.64, 0.69) },
    ];
    // Two rows: first 3, then last 2
    for (let i = 0; i < 3; i++) {
      const x = margin + i * (contentW / 3);
      page.drawText(String(distItems[i].count), { x: x + 10, y, size: 22, font: bold, color: distItems[i].clr });
      page.drawText(distItems[i].label, { x: x + 10, y: y - 16, size: 9, font, color: distItems[i].clr });
    }
    y -= 40;
    for (let i = 3; i < distItems.length; i++) {
      const x = margin + (i - 3) * (contentW / 3);
      page.drawText(String(distItems[i].count), { x: x + 10, y, size: 22, font: bold, color: distItems[i].clr });
      page.drawText(distItems[i].label, { x: x + 10, y: y - 16, size: 9, font, color: distItems[i].clr });
    }
    y -= 45;
    drawLine(page, y);
    y -= 20;
  }

  // --- Employee details table ---
  page.drawText('Employee Details', { x: margin, y, size: 14, font: bold, color: rgb(0.12, 0.16, 0.21) });
  y -= 8;

  // Table header
  y -= 18;
  page.drawRectangle({ x: margin, y: y - 4, width: contentW, height: 20, color: rgb(0.95, 0.95, 0.97) });
  page.drawText('Employee', { x: margin + 5, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
  page.drawText('Score', { x: margin + 200, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
  page.drawText('Status', { x: margin + 260, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
  page.drawText('Activity', { x: margin + 380, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
  page.drawText('Hours', { x: margin + 450, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.35) });
  y -= 22;

  for (const emp of employees) {
    const score = emp.productivity_score || 0;
    const status = emp.performance_status || 'Concerning';
    const summary = emp.ai_summary || '';
    const summaryLines = summary ? wrapText(summary, font, 8, contentW - 10) : [];
    const entryHeight = 20 + (summaryLines.length > 0 ? summaryLines.length * 11 + 4 : 0);

    // Check for page break
    if (y - entryHeight < margin + 30) {
      // Footer on current page
      page.drawText(`${orgName} - TimeFlow Report`, { x: margin, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
      page.drawText(`Page ${pdfDoc.getPageCount()}`, { x: pageW - margin - 40, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
      const np = newPage();
      page = np.page;
      y = np.y;
    }

    // Employee row
    const nameText = sanitizeForPdf(emp.full_name || 'Unknown');
    page.drawText(nameText.substring(0, 30), { x: margin + 5, y, size: 10, font: bold, color: rgb(0.07, 0.09, 0.15) });
    page.drawText(`${score}%`, { x: margin + 200, y, size: 11, font: bold, color: pdfScoreColor(score) });
    page.drawText(pdfStatusLabel(status), { x: margin + 260, y, size: 8, font: bold, color: pdfStatusColor(status) });
    page.drawText(`${Math.round(emp.activity_percentage || 0)}%`, { x: margin + 380, y, size: 10, font, color: rgb(0.25, 0.25, 0.3) });
    page.drawText(`${(emp.total_hours || 0).toFixed(1)}h`, { x: margin + 450, y, size: 10, font, color: rgb(0.25, 0.25, 0.3) });
    y -= 14;

    // Email
    if (emp.email) {
      page.drawText(sanitizeForPdf(emp.email), { x: margin + 5, y, size: 8, font, color: rgb(0.42, 0.45, 0.5) });
    }
    y -= 12;

    // AI summary lines
    for (const line of summaryLines.slice(0, 3)) {
      page.drawText(line, { x: margin + 5, y, size: 8, font, color: rgb(0.35, 0.38, 0.42) });
      y -= 11;
    }

    drawLine(page, y);
    y -= 10;
  }

  // --- Projects section ---
  if (data.projects && data.projects.length > 0) {
    if (y < margin + 80) {
      page.drawText(`${orgName} - TimeFlow Report`, { x: margin, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
      page.drawText(`Page ${pdfDoc.getPageCount()}`, { x: pageW - margin - 40, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
      const np = newPage();
      page = np.page;
      y = np.y;
    }
    y -= 10;
    page.drawText('Top Projects', { x: margin, y, size: 14, font: bold, color: rgb(0.12, 0.16, 0.21) });
    y -= 20;
    for (const project of data.projects.slice(0, 10)) {
      if (y < margin + 30) {
        const np = newPage();
        page = np.page;
        y = np.y;
      }
      page.drawText(sanitizeForPdf(project.name || 'Unnamed'), { x: margin + 5, y, size: 10, font: bold, color: rgb(0.15, 0.15, 0.2) });
      page.drawText(`${(project.total_hours || 0).toFixed(1)}h  |  ${project.member_count || 0} members`, { x: margin + 250, y, size: 9, font, color: rgb(0.42, 0.45, 0.5) });
      y -= 18;
    }
    drawLine(page, y);
    y -= 10;
  }

  // --- App usage section ---
  if (data.app_usage && data.app_usage.length > 0) {
    if (y < margin + 80) {
      const np = newPage();
      page = np.page;
      y = np.y;
    }
    y -= 10;
    page.drawText('Most Used Apps', { x: margin, y, size: 14, font: bold, color: rgb(0.12, 0.16, 0.21) });
    y -= 20;
    for (const app of data.app_usage.slice(0, 10)) {
      if (y < margin + 30) {
        const np = newPage();
        page = np.page;
        y = np.y;
      }
      page.drawText(sanitizeForPdf(app.app_name || 'Unknown'), { x: margin + 5, y, size: 10, font, color: rgb(0.15, 0.15, 0.2) });
      page.drawText(`${app.total_time || '0m'} (${app.percentage || 0}%)`, { x: margin + 300, y, size: 9, font, color: rgb(0.42, 0.45, 0.5) });
      y -= 18;
    }
  }

  // Footer on last page
  page.drawText(`${orgName} - TimeFlow Report`, { x: margin, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
  page.drawText(`Page ${pdfDoc.getPageCount()}`, { x: pageW - margin - 40, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });
  page.drawText(`Generated on ${new Date().toISOString().split('T')[0]}`, { x: margin + 200, y: margin - 10, size: 8, font, color: rgb(0.6, 0.6, 0.65) });

  return await pdfDoc.save();
}

// ──────────────────────────────────────────────
// Concise email HTML (summary + problem alerts + PDF mention)
// ──────────────────────────────────────────────

function generateDailyReportHTML(data: any, hasPdfAttachment: boolean): string {
  const orgName = data.org_name || 'Organization';
  const teamAvg = data.team_avg_productivity || 0;
  const employees = data.employees || [];

  // Find problem employees
  const problems = employees.filter((e: any) =>
    e.performance_status === 'Concerning' || e.performance_status === 'Needs Improvement'
  );
  const excellent = employees.filter((e: any) => e.performance_status === 'Excellent').length;
  const good = employees.filter((e: any) => e.performance_status === 'Good').length;

  // Low activity alerts
  const lowActivity = data.low_activity_alerts || [];

  // Problem alert cards
  const problemCards = problems.slice(0, 5).map((emp: any) => {
    const score = emp.productivity_score || 0;
    const status = emp.performance_status || '';
    const isRed = status === 'Concerning';
    const bg = isRed ? '#fee2e2' : '#fef3c7';
    const border = isRed ? '#ef4444' : '#f59e0b';
    const color = isRed ? '#991b1b' : '#92400e';
    const icon = isRed ? '🔴' : '🟡';
    const summary = emp.ai_summary ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${emp.ai_summary.substring(0, 120)}${emp.ai_summary.length > 120 ? '...' : ''}</div>` : '';
    return `
    <div style="background: ${bg}; border-left: 4px solid ${border}; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td><span style="font-size: 14px; font-weight: 600; color: ${color};">${icon} ${emp.full_name}</span></td>
        <td style="text-align: right; font-size: 20px; font-weight: 700; color: ${color};">${score}%</td>
      </tr></table>
      <div style="font-size: 12px; color: ${color}; margin-top: 2px;">${status} &bull; ${Math.round(emp.activity_percentage || 0)}% activity &bull; ${(emp.total_hours || 0).toFixed(1)}h</div>
      ${summary}
    </div>`;
  }).join('');

  const pdfNote = hasPdfAttachment ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 28px; margin-bottom: 6px;">📎</div>
      <div style="font-size: 14px; font-weight: 600; color: #1e40af;">Full Detailed Report Attached</div>
      <div style="font-size: 12px; color: #3b82f6; margin-top: 4px;">Open the attached PDF for complete employee details, AI summaries, projects, and app usage.</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Summary - ${orgName}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
<div style="max-width: 600px; margin: 0 auto; background: white;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 28px; text-align: center;">
    <div style="font-size: 22px; font-weight: 700;">Daily Work Summary for ${orgName}</div>
    <div style="opacity: 0.9; margin-top: 6px; font-size: 14px;">${data.date}</div>
  </div>

  <div style="padding: 24px;">
    <!-- Stats Bar -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; background: #f8f9fa; border-radius: 8px;">
      <tr>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #2563eb;">${data.total_hours}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Hours</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #2563eb;">${data.members_worked} / ${data.members_total || data.members_worked}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Worked / Total</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #9ca3af;">${data.members_absent || 0}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Absent</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #10b981;">${teamAvg}%</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">AI Productivity</div>
        </td>
      </tr>
    </table>

    ${pdfNote}

    ${problems.length > 0 ? `
    <!-- Attention Required -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">⚠️ Attention Required (${problems.length})</div>
      ${problemCards}
    </div>` : ''}

    ${lowActivity.length > 0 ? `
    <!-- Low Activity -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">📉 Low Activity Alerts</div>
      ${lowActivity.slice(0, 5).map((emp: any) => `
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px 12px; margin-bottom: 6px; border-radius: 4px;">
        <strong style="color: #991b1b;">${emp.full_name}</strong> - ${Math.round(emp.activity_percentage)}% activity
      </div>`).join('')}
    </div>` : ''}

    <!-- Quick Team Summary -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <div style="font-size: 14px; font-weight: 600; color: #166534; margin-bottom: 8px;">📊 Team Overview</div>
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        <tr><td style="color: #065f46;">✅ ${excellent} Excellent</td><td style="color: #1e40af;">🟢 ${good} Good</td></tr>
        <tr><td style="color: #92400e;">🟡 ${problems.filter((e: any) => e.performance_status === 'Needs Improvement').length} Needs Improvement</td><td style="color: #991b1b;">🔴 ${problems.filter((e: any) => e.performance_status === 'Concerning').length} Concerning</td></tr>
        <tr><td style="color: #6b7280;">⬜ ${employees.filter((e: any) => e.performance_status === 'Absent').length} Absent</td><td></td></tr>
      </table>
      <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">${employees.length} total members (${data.members_worked || 0} worked, ${data.members_absent || 0} absent)</div>
    </div>
  </div>

  <div style="background: #f8f9fa; padding: 16px; text-align: center; color: #6b7280; font-size: 11px;">
    ${orgName} TimeFlow Admin &bull; ${new Date().toLocaleString()}
  </div>
</div></body></html>`;
}

function generateWeeklyReportHTML(data: any, hasPdfAttachment: boolean): string {
  const orgName = data.org_name || 'Organization';
  const teamAvg = data.team_avg_productivity || 0;
  const employees = data.employees || [];

  // Performance counts
  const statusCounts = { excellent: 0, good: 0, needsImprovement: 0, concerning: 0, absent: 0 };
  employees.forEach((emp: any) => {
    const s = emp.performance_status || '';
    if (s === 'Excellent') statusCounts.excellent++;
    else if (s === 'Good') statusCounts.good++;
    else if (s === 'Needs Improvement') statusCounts.needsImprovement++;
    else if (s === 'Concerning') statusCounts.concerning++;
    else if (s === 'Absent') statusCounts.absent++;
    else statusCounts.concerning++;
  });

  const problems = employees.filter((e: any) =>
    e.performance_status === 'Concerning' || e.performance_status === 'Needs Improvement'
  );

  const problemCards = problems.slice(0, 5).map((emp: any) => {
    const score = emp.productivity_score || 0;
    const status = emp.performance_status || '';
    const isRed = status === 'Concerning';
    const bg = isRed ? '#fee2e2' : '#fef3c7';
    const border = isRed ? '#ef4444' : '#f59e0b';
    const color = isRed ? '#991b1b' : '#92400e';
    const icon = isRed ? '🔴' : '🟡';
    const summary = emp.ai_summary ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${emp.ai_summary.substring(0, 120)}${emp.ai_summary.length > 120 ? '...' : ''}</div>` : '';
    return `
    <div style="background: ${bg}; border-left: 4px solid ${border}; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td><span style="font-size: 14px; font-weight: 600; color: ${color};">${icon} ${emp.full_name}</span></td>
        <td style="text-align: right; font-size: 20px; font-weight: 700; color: ${color};">${score}%</td>
      </tr></table>
      <div style="font-size: 12px; color: ${color}; margin-top: 2px;">${status} &bull; ${Math.round(emp.activity_percentage || 0)}% activity &bull; ${(emp.total_hours || 0).toFixed(1)}h</div>
      ${summary}
    </div>`;
  }).join('');

  const pdfNote = hasPdfAttachment ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <div style="font-size: 28px; margin-bottom: 6px;">📎</div>
      <div style="font-size: 14px; font-weight: 600; color: #1e40af;">Full Detailed Report Attached</div>
      <div style="font-size: 12px; color: #3b82f6; margin-top: 4px;">Open the attached PDF for complete employee details, AI summaries, projects, and app usage.</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weekly Report - ${orgName}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
<div style="max-width: 600px; margin: 0 auto; background: white;">
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 28px; text-align: center;">
    <div style="font-size: 22px; font-weight: 700;">Weekly Performance Report for ${orgName}</div>
    <div style="opacity: 0.9; margin-top: 6px; font-size: 14px;">${data.week_period}</div>
  </div>

  <div style="padding: 24px;">
    <!-- Stats Bar -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px; background: #f8f9fa; border-radius: 8px;">
      <tr>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #10b981;">${data.total_hours}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Hours</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #10b981;">${data.members_worked} / ${data.members_total || data.members_worked}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Worked / Total</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #9ca3af;">${data.members_absent || 0}</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">Absent</div>
        </td>
        <td style="padding: 16px; text-align: center;">
          <div style="font-size: 22px; font-weight: bold; color: #10b981;">${teamAvg}%</div>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-top: 3px;">AI Productivity</div>
        </td>
      </tr>
    </table>

    ${pdfNote}

    <!-- Performance Distribution -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">📈 Performance Distribution</div>
      <table width="100%" cellpadding="0" cellspacing="6" border="0">
        <tr>
          <td style="background: #d1fae5; border-radius: 8px; padding: 12px; text-align: center; width: 20%;">
            <div style="font-size: 22px; font-weight: 700; color: #065f46;">${statusCounts.excellent}</div>
            <div style="font-size: 10px; color: #065f46; margin-top: 2px;">Excellent</div>
          </td>
          <td style="background: #dbeafe; border-radius: 8px; padding: 12px; text-align: center; width: 20%;">
            <div style="font-size: 22px; font-weight: 700; color: #1e40af;">${statusCounts.good}</div>
            <div style="font-size: 10px; color: #1e40af; margin-top: 2px;">Good</div>
          </td>
          <td style="background: #fef3c7; border-radius: 8px; padding: 12px; text-align: center; width: 20%;">
            <div style="font-size: 22px; font-weight: 700; color: #92400e;">${statusCounts.needsImprovement}</div>
            <div style="font-size: 10px; color: #92400e; margin-top: 2px;">Needs Impr.</div>
          </td>
          <td style="background: #fee2e2; border-radius: 8px; padding: 12px; text-align: center; width: 20%;">
            <div style="font-size: 22px; font-weight: 700; color: #991b1b;">${statusCounts.concerning}</div>
            <div style="font-size: 10px; color: #991b1b; margin-top: 2px;">Concerning</div>
          </td>
          <td style="background: #f3f4f6; border-radius: 8px; padding: 12px; text-align: center; width: 20%;">
            <div style="font-size: 22px; font-weight: 700; color: #6b7280;">${statusCounts.absent}</div>
            <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">Absent</div>
          </td>
        </tr>
      </table>
    </div>

    ${problems.length > 0 ? `
    <!-- Attention Required -->
    <div style="margin-bottom: 24px;">
      <div style="font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">⚠️ Attention Required (${problems.length})</div>
      ${problemCards}
    </div>` : ''}

    <!-- Quick Summary -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px;">
      <div style="font-size: 13px; color: #166534;">${employees.length} total members (${data.members_worked || 0} worked, ${data.members_absent || 0} absent this week)</div>
    </div>
  </div>

  <div style="background: #f8f9fa; padding: 16px; text-align: center; color: #6b7280; font-size: 11px;">
    ${orgName} TimeFlow Admin &bull; ${new Date().toLocaleString()}
  </div>
</div></body></html>`;
}

serve(handler);
