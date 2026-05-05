import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173").split(",").map(o => o.trim());

const WEB_APP_URL = "https://worktime.ebdaadt.com";

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
    console.log("Resend confirmation function called");

    // Get Resend API key
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const { email } = await req.json();
    
    if (!email) {
      throw new Error("Email is required");
    }

    console.log("Generating confirmation link for:", email);

    // Get Supabase credentials from environment variables (REQUIRED - no hardcoded fallbacks for security)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Generate magiclink for existing users
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
    });

    if (error) {
      console.error("Error generating link:", error);
      throw error;
    }

    // Extract token info from the generated link
    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      throw new Error("Failed to generate confirmation link");
    }

    console.log("Generated action link");

    // Use Supabase's action_link directly - it handles verification and redirects back
    // This is more reliable than extracting token_hash and calling verifyOtp ourselves
    const confirmationUrl = actionLink;
    console.log("Using Supabase action link for verification");

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
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
    .divider { border-top: 1px solid #e5e7eb; margin: 20px 0; }
    p { color: #374151; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Confirm Your Account</h1>
    </div>
    <div class="content">
      <p>Hi there,</p>
      <p>Click the button below to confirm your email and access your Alyson Work Time account.</p>
      
      <p style="text-align: center;">
        <a href="${confirmationUrl}" class="button">Confirm Email Address</a>
      </p>
      
      <div class="divider"></div>
      <p style="font-size: 13px; color: #6b7280;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
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
      subject: "Confirm Your Account - Alyson Work Time",
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Confirmation email sent" }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );

  } catch (error: any) {
    console.error("Error in resend-confirmation:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send confirmation email" }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
});
