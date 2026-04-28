import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@2.0.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173").split(",").map(o => o.trim());

// Default web app URL (fallback for production)
const DEFAULT_WEB_APP_URL = "https://worktime.ebdaadt.com";

// Email subjects for different auth actions
const emailSubjects: Record<string, string> = {
  signup: "Confirm Your Email - Ebdaa Work Time",
  recovery: "Reset Your Password - Ebdaa Work Time",
  invite: "You've Been Invited - Ebdaa Work Time",
  magiclink: "Your Login Link - Ebdaa Work Time",
  email_change: "Confirm Email Change - Ebdaa Work Time",
  reauthentication: "Confirm Your Identity - Ebdaa Work Time",
};

// Generate email HTML based on action type
function generateEmailHTML(
  emailActionType: string,
  token: string,
  tokenHash: string,
  redirectTo: string,
  siteUrl: string,
  userEmail: string,
  webAppUrl: string
): string {
  // Build confirmation URL that points to the web app
  // Use the dynamic webAppUrl which respects the environment
  const confirmationUrl = `${webAppUrl}/auth/confirm?token_hash=${tokenHash}&type=${emailActionType}`;
  
  const baseStyles = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
      .content { padding: 30px; }
      .code-box { background: #f0f4ff; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
      .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 4px; font-family: monospace; }
      .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
      .button:hover { opacity: 0.9; }
      .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
      .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
      p { color: #374151; line-height: 1.6; }
    </style>
  `;

  switch (emailActionType) {
    case 'signup':
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Ebdaa Work Time!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for signing up for Ebdaa Work Time! Please confirm your email address to get started.</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your verification code:</p>
        <div class="code">${token}</div>
      </div>
      
      <p style="text-align: center;">Or click the button below:</p>
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button">Confirm Email Address</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour. If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;

    case 'recovery':
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
      <h1>Reset Your Password</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>We received a request to reset your password for your Ebdaa Work Time account. Use the code below or click the button to set a new password.</p>
      
      <div class="code-box" style="border-color: #f59e0b;">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your reset code:</p>
        <div class="code" style="color: #d97706;">${token}</div>
      </div>
      
      <p style="text-align: center;">Or click the button below:</p>
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">Reset Password</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password will remain unchanged.</p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;

    case 'invite':
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
      <h1>You're Invited!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>You've been invited to join Ebdaa Work Time, a time tracking and productivity platform.</p>
      
      <div class="code-box" style="border-color: #10b981;">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your invitation code:</p>
        <div class="code" style="color: #059669;">${token}</div>
      </div>
      
      <p style="text-align: center;">Or click the button below to accept:</p>
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">Accept Invitation</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This invitation expires in 24 hours.</p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;

    case 'magiclink':
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Magic Link</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Click the button below to sign in to your Ebdaa Work Time account. No password needed!</p>
      
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button">Sign In to Ebdaa Work Time</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;

    case 'email_change':
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">
      <h1>Confirm Email Change</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>You requested to change your email address for your Ebdaa Work Time account. Please confirm this change by entering the code below or clicking the button.</p>
      
      <div class="code-box" style="border-color: #8b5cf6;">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your confirmation code:</p>
        <div class="code" style="color: #7c3aed;">${token}</div>
      </div>
      
      <p style="text-align: center;">Or click the button below:</p>
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button" style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);">Confirm Email Change</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">If you didn't request this change, please contact support immediately.</p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;

    default:
      return `
<!DOCTYPE html>
<html>
<head>${baseStyles}</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Ebdaa Work Time Notification</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Here is your verification code:</p>
      
      <div class="code-box">
        <div class="code">${token}</div>
      </div>
      
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button">Verify</a>
      </p>
    </div>
    <div class="footer">
      Ebdaa Work Time by Ebdaa Digital Technology<br>
      Sent to ${userEmail}
    </div>
  </div>
</body>
</html>`;
  }
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Send Auth Email Hook called");

    // Get Resend API key
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not found");
      throw new Error("RESEND_API_KEY environment variable is not set");
    }

    // Get webhook secret for verification
    const hookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET");
    
    const payload = await req.text();
    let user: any;
    let email_data: any;

    // Verify webhook signature if secret is configured
    if (hookSecret) {
      try {
        const headers = Object.fromEntries(req.headers);
        const base64Secret = hookSecret.replace("v1,whsec_", "");
        const wh = new Webhook(base64Secret);
        const verified = wh.verify(payload, headers) as { user: any; email_data: any };
        user = verified.user;
        email_data = verified.email_data;
        console.log("Webhook signature verified");
      } catch (verifyError) {
        console.warn("Webhook verification failed, parsing payload directly:", verifyError);
        const parsed = JSON.parse(payload);
        user = parsed.user;
        email_data = parsed.email_data;
      }
    } else {
      // No secret configured, parse directly
      const parsed = JSON.parse(payload);
      user = parsed.user;
      email_data = parsed.email_data;
    }

    if (!user || !email_data) {
      throw new Error("Invalid payload: missing user or email_data");
    }

    console.log("Processing auth email:");
    console.log("- Type:", email_data.email_action_type);
    console.log("- To:", user.email);
    console.log("- Token exists:", !!email_data.token);

    // Initialize Resend
    const resend = new Resend(resendApiKey);

    // Get site URL (Supabase project URL for verification endpoints)
    const siteUrl = email_data.site_url || "https://fkpiqcxkmrtaetvfgcli.supabase.co";
    const redirectTo = email_data.redirect_to || DEFAULT_WEB_APP_URL;
    
    // Determine web app URL from redirect_to or site_url
    // This allows emails to work in different environments (local, staging, production)
    let webAppUrl = DEFAULT_WEB_APP_URL;
    if (email_data.redirect_to) {
      try {
        const redirectUrl = new URL(email_data.redirect_to);
        webAppUrl = redirectUrl.origin;
      } catch {
        // If redirect_to is not a valid URL, use default
      }
    }

    // Generate email content
    const subject = emailSubjects[email_data.email_action_type] || "Ebdaa Work Time Notification";
    const htmlContent = generateEmailHTML(
      email_data.email_action_type,
      email_data.token || "",
      email_data.token_hash || "",
      redirectTo,
      siteUrl,
      user.email,
      webAppUrl
    );

    // Send email via Resend
    console.log("Sending email via Resend...");
    const emailResponse = await resend.emails.send({
      from: "Ebdaa Work Time <info@ebdaadt.com>",
      to: [user.email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    // Return empty response (required by Supabase Auth Hooks)
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-auth-email hook:", error);
    
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: error.message || "Failed to send email",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
