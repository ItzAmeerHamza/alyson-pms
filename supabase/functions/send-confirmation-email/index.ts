import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173").split(",").map(o => o.trim());

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Send confirmation email function called");

    // Get Resend API key
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }

    // Get Supabase credentials from environment variables (REQUIRED - no hardcoded fallbacks for security)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
    }

    // Parse request body
    const { userId, email } = await req.json();

    if (!userId || !email) {
      throw new Error("Missing userId or email");
    }

    console.log("Sending confirmation email to:", email);

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Generate email confirmation token using admin API
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email: email,
    });

    if (error) {
      console.error("Error generating link:", error);
      throw error;
    }

    console.log("Generated confirmation link:", data);

    // Extract token and hashed token from the URL
    // The generateLink response has the format: { properties: { action_link, ... }, user, ... }
    const actionLink = data.properties?.action_link || data.action_link;
    if (!actionLink) {
      console.error("No action link found in response:", JSON.stringify(data));
      throw new Error("Failed to generate confirmation link");
    }
    
    const url = new URL(actionLink);
    const token = url.searchParams.get('token');
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type') || 'signup';

    // Determine web app URL
    const webAppUrl = "https://worktime.ebdaadt.com";
    const confirmationUrl = `${webAppUrl}/auth/confirm?token_hash=${tokenHash}&type=${type}`;

    // Generate HTML email
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
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
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to Alyson Work Time!</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Thank you for signing up for Alyson Work Time! Please confirm your email address to get started.</p>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your verification code:</p>
        <div class="code">${token || 'N/A'}</div>
      </div>
      
      <p style="text-align: center;">Or click the button below:</p>
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button">Confirm Email Address</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour. If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      Alyson Work Time by RevCloud<br>
      Sent to ${email}
    </div>
  </div>
</body>
</html>`;

    // Send email via Resend
    console.log("Sending email via Resend...");
    const resend = new Resend(resendApiKey);
    
    const emailResponse = await resend.emails.send({
      from: "Alyson Work Time <info@ebdaadt.com>",
      to: [email],
      subject: "Confirm Your Email - Alyson Work Time",
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Confirmation email sent" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in send-confirmation-email:", error);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send confirmation email",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

