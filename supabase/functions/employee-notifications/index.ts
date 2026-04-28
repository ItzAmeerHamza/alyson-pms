import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173").split(",").map(o => o.trim());

interface EmployeeStatusChangeData {
  employee_id: string;
  employee_email: string;
  employee_name: string;
  old_status: 'active' | 'inactive';
  new_status: 'active' | 'inactive';
  change_type: 'joined' | 'activated' | 'deactivated' | 'paused' | 'resumed';
  changed_by: string;
  reason?: string;
  timestamp: string;
}

const handler = async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔔 Employee notifications function called');
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY not found in environment variables');
      throw new Error("RESEND_API_KEY environment variable is not set");
    }

    const resend = new Resend(resendApiKey);
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    
    if (path === 'employee-status-change' && req.method === 'POST') {
      console.log('📧 Processing employee status change notification...');
      
      const body = await req.json();
      const statusData: EmployeeStatusChangeData = body;
      
      // Derive organization_id from the employee being notified
      let orgId: string | null = null;
      if (statusData.employee_id) {
        const { data: empData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', statusData.employee_id)
          .single();
        orgId = empData?.organization_id || null;
      }
      console.log(`🏢 Employee org: ${orgId || 'global (no org)'}`);
      
      // Get HR and Admin users to notify (scoped to employee's org when available)
      let recipientQuery = supabase
        .from('users')
        .select('email, full_name')
        .in('role', ['admin', 'manager'])
        .eq('is_active', true);
      if (orgId) {
        recipientQuery = recipientQuery.eq('organization_id', orgId);
      }
      const { data: recipients, error: recipientError } = await recipientQuery;

      if (recipientError || !recipients || recipients.length === 0) {
        console.error('❌ No HR/Admin users found to notify:', recipientError);
        throw new Error('No HR/Admin users found to notify');
      }

      console.log(`👥 Found ${recipients.length} HR/Admin recipients`);

      // Generate email content based on change type
      const htmlContent = generateEmployeeStatusChangeEmail(statusData);
      const subject = generateEmailSubject(statusData);
      
      const recipientEmails = recipients.map(r => r.email);
      
      console.log('📨 Sending status change notification email...');
      const emailResponse = await resend.emails.send({
        from: "Ebdaa work time HR <info@ebdaadt.com>",
        to: recipientEmails,
        subject: subject,
        html: htmlContent,
      });

      console.log('✅ Employee status change notification sent successfully:', emailResponse);

      return new Response(JSON.stringify({
        success: true,
        message: `Employee status change notification sent to ${recipientEmails.length} recipients`,
        emailId: emailResponse.id,
        change_type: statusData.change_type,
        employee: statusData.employee_name
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Handle new employee welcome notification
    if (path === 'new-employee-welcome' && req.method === 'POST') {
      console.log('🎉 Processing new employee welcome notification...');
      
      const body = await req.json();
      const { employee_id, employee_email, employee_name } = body;
      
      // Derive organization_id from the new employee
      let welcomeOrgId: string | null = null;
      if (employee_id) {
        const { data: empData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', employee_id)
          .single();
        welcomeOrgId = empData?.organization_id || null;
      }
      console.log(`🏢 New employee org: ${welcomeOrgId || 'global (no org)'}`);
      
      // Get HR and Admin users to notify (scoped to employee's org)
      let welcomeRecipientQuery = supabase
        .from('users')
        .select('email, full_name')
        .in('role', ['admin', 'manager'])
        .eq('is_active', true);
      if (welcomeOrgId) {
        welcomeRecipientQuery = welcomeRecipientQuery.eq('organization_id', welcomeOrgId);
      }
      const { data: recipients, error: recipientError } = await welcomeRecipientQuery;

      if (recipientError || !recipients || recipients.length === 0) {
        console.error('❌ No HR/Admin users found to notify:', recipientError);
        return new Response(JSON.stringify({ error: 'No HR/Admin users found' }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const htmlContent = generateNewEmployeeWelcomeEmail({
        employee_name,
        employee_email,
        timestamp: new Date().toISOString()
      });
      
      const recipientEmails = recipients.map(r => r.email);
      
      const emailResponse = await resend.emails.send({
        from: "Ebdaa work time HR <info@ebdaadt.com>",
        to: recipientEmails,
        subject: `🎉 New Employee Joined - ${employee_name}`,
        html: htmlContent,
      });

      console.log('✅ New employee welcome notification sent successfully:', emailResponse);

      return new Response(JSON.stringify({
        success: true,
        message: `New employee notification sent to ${recipientEmails.length} recipients`,
        emailId: emailResponse.id
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Default response for unknown endpoints
    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error) {
    console.error('❌ Error in employee notifications function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

function generateEmailSubject(statusData: EmployeeStatusChangeData): string {
  const { change_type, employee_name } = statusData;
  
  switch (change_type) {
    case 'joined':
      return `🎉 New Employee Joined - ${employee_name}`;
    case 'activated':
      return `✅ Employee Activated - ${employee_name}`;
    case 'deactivated':
      return `⚠️ Employee Deactivated - ${employee_name}`;
    case 'paused':
      return `⏸️ Employee Account Paused - ${employee_name}`;
    case 'resumed':
      return `▶️ Employee Account Resumed - ${employee_name}`;
    default:
      return `📋 Employee Status Changed - ${employee_name}`;
  }
}

function generateEmployeeStatusChangeEmail(statusData: EmployeeStatusChangeData): string {
  const { employee_name, employee_email, change_type, old_status, new_status, changed_by, reason, timestamp } = statusData;
  
  const formatTimestamp = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  let statusIcon = '📋';
  let statusColor = '#3B82F6';
  let changeDescription = 'Status Changed';
  
  switch (change_type) {
    case 'joined':
      statusIcon = '🎉';
      statusColor = '#22C55E';
      changeDescription = 'New Employee Joined';
      break;
    case 'activated':
      statusIcon = '✅';
      statusColor = '#22C55E';
      changeDescription = 'Employee Activated';
      break;
    case 'deactivated':
      statusIcon = '⚠️';
      statusColor = '#EF4444';
      changeDescription = 'Employee Deactivated';
      break;
    case 'paused':
      statusIcon = '⏸️';
      statusColor = '#F59E0B';
      changeDescription = 'Employee Account Paused';
      break;
    case 'resumed':
      statusIcon = '▶️';
      statusColor = '#22C55E';
      changeDescription = 'Employee Account Resumed';
      break;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Employee Status Change - ${employee_name}</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%); color: white; padding: 30px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">${statusIcon}</div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">${changeDescription}</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 16px;">TimeFlow Employee Management System</p>
        </div>

        <!-- Main Content -->
        <div style="padding: 30px;">
          
          <!-- Employee Information -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px;">Employee Information</h3>
            <div style="display: grid; gap: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 500; color: #6b7280;">Name:</span>
                <span style="color: #1f2937; font-weight: 600;">${employee_name}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 500; color: #6b7280;">Email:</span>
                <span style="color: #1f2937;">${employee_email}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 500; color: #6b7280;">Previous Status:</span>
                <span style="color: #6b7280; text-transform: capitalize;">${old_status}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280;">Current Status:</span>
                <span style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${new_status}</span>
              </div>
            </div>
          </div>

          <!-- Change Details -->
          <div style="background: ${statusColor}15; border: 1px solid ${statusColor}30; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px;">Change Details</h3>
            <div style="display: grid; gap: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280;">Change Type:</span>
                <span style="color: ${statusColor}; font-weight: 600; text-transform: capitalize;">${change_type}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280;">Changed By:</span>
                <span style="color: #1f2937;">${changed_by}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280;">Timestamp:</span>
                <span style="color: #1f2937;">${formatTimestamp}</span>
              </div>
              ${reason ? `
              <div style="padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280; display: block; margin-bottom: 8px;">Reason:</span>
                <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb;">
                  <span style="color: #1f2937;">${reason}</span>
                </div>
              </div>
              ` : ''}
            </div>
          </div>

          <!-- Action Items -->
          ${change_type === 'joined' ? `
          <div style="background: #22c55e15; border: 1px solid #22c55e30; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #15803d; font-size: 18px;">🚀 Next Steps for New Employee</h3>
            <ul style="margin: 0; padding-left: 20px; color: #1f2937;">
              <li style="margin-bottom: 8px;">Set up employee workspace and equipment</li>
              <li style="margin-bottom: 8px;">Provide TimeFlow desktop agent installation</li>
              <li style="margin-bottom: 8px;">Configure project assignments and permissions</li>
              <li style="margin-bottom: 8px;">Schedule onboarding meeting and training</li>
              <li style="margin-bottom: 8px;">Add to relevant team communication channels</li>
            </ul>
          </div>
          ` : ''}

          <!-- Footer Actions -->
          <div style="text-align: center; padding: 20px 0; border-top: 1px solid #e5e7eb; margin-top: 25px;">
            <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">
              This is an automated notification from the TimeFlow HR system.
            </p>
            <a href="${Deno.env.get("FRONTEND_URL") || "https://admin.timeflow.ebdaadt.com"}/users" 
               style="display: inline-block; background: ${statusColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
              Manage Employees
            </a>
          </div>
        </div>
      </div>

      <!-- Email Footer -->
      <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} TimeFlow - Employee Management System</p>
        <p style="margin: 5px 0 0 0;">
          <a href="mailto:support@ebdaadt.com" style="color: #6b7280;">Support</a> | 
          <a href="${Deno.env.get("FRONTEND_URL") || "https://admin.timeflow.ebdaadt.com"}" style="color: #6b7280;">Dashboard</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

function generateNewEmployeeWelcomeEmail({ employee_name, employee_email, timestamp }: { employee_name: string, employee_email: string, timestamp: string }): string {
  const formatTimestamp = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Employee Welcome - ${employee_name}</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: white; padding: 30px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Team Member Joined!</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 16px;">Welcome ${employee_name} to TimeFlow</p>
        </div>

        <!-- Main Content -->
        <div style="padding: 30px;">
          
          <!-- Employee Welcome Message -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #1f2937; margin: 0 0 15px 0;">🚀 Ready to get started!</h2>
            <p style="color: #6b7280; font-size: 16px; margin: 0;">
              A new employee has successfully joined the TimeFlow platform and is ready to begin their journey with the team.
            </p>
          </div>

          <!-- Employee Information -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px;">New Employee Details</h3>
            <div style="display: grid; gap: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 500; color: #6b7280;">Name:</span>
                <span style="color: #1f2937; font-weight: 600;">${employee_name}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                <span style="font-weight: 500; color: #6b7280;">Email:</span>
                <span style="color: #1f2937;">${employee_email}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                <span style="font-weight: 500; color: #6b7280;">Join Date:</span>
                <span style="color: #1f2937;">${formatTimestamp}</span>
              </div>
            </div>
          </div>

          <!-- Next Steps -->
          <div style="background: #22c55e15; border: 1px solid #22c55e30; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #15803d; font-size: 18px;">📋 Onboarding Checklist</h3>
            <ul style="margin: 0; padding-left: 20px; color: #1f2937;">
              <li style="margin-bottom: 8px;">✅ Employee account created and activated</li>
              <li style="margin-bottom: 8px;">⏳ Set up workspace and equipment</li>
              <li style="margin-bottom: 8px;">⏳ Install TimeFlow desktop agent</li>
              <li style="margin-bottom: 8px;">⏳ Configure project assignments</li>
              <li style="margin-bottom: 8px;">⏳ Schedule welcome meeting and training</li>
              <li style="margin-bottom: 8px;">⏳ Add to team communication channels</li>
            </ul>
          </div>

          <!-- Quick Actions -->
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
            <h3 style="margin: 0 0 15px 0; color: #1f2937; font-size: 18px;">⚡ Quick Actions</h3>
            <div style="display: grid; gap: 10px;">
              <div style="display: flex; align-items: center; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                <span style="margin-right: 10px;">👤</span>
                <span style="color: #1f2937;">Review employee profile and permissions</span>
              </div>
              <div style="display: flex; align-items: center; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                <span style="margin-right: 10px;">📊</span>
                <span style="color: #1f2937;">Assign initial projects and tasks</span>
              </div>
              <div style="display: flex; align-items: center; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;">
                <span style="margin-right: 10px;">🎯</span>
                <span style="color: #1f2937;">Set performance goals and expectations</span>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div style="text-align: center; padding: 20px 0; border-top: 1px solid #e5e7eb; margin-top: 25px;">
            <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px;">
              This is an automated notification from the TimeFlow HR system.
            </p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <a href="${Deno.env.get("FRONTEND_URL") || "https://admin.timeflow.ebdaadt.com"}/users" 
                 style="display: inline-block; background: #22C55E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                Manage Employees
              </a>
              <a href="${Deno.env.get("FRONTEND_URL") || "https://admin.timeflow.ebdaadt.com"}/projects" 
                 style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                Assign Projects
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Email Footer -->
      <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} TimeFlow - Employee Management System</p>
        <p style="margin: 5px 0 0 0;">
          <a href="mailto:support@ebdaadt.com" style="color: #6b7280;">Support</a> | 
          <a href="${Deno.env.get("FRONTEND_URL") || "https://admin.timeflow.ebdaadt.com"}" style="color: #6b7280;">Dashboard</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

serve(handler); 