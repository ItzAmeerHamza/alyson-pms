import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ScheduleRequest, CORS_HEADERS } from "../types.ts";
import { ReportConfigService } from "../services/config.service.ts";
import { EmailService } from "../services/email.service.ts";
import { ReportScheduler } from "../services/scheduler.service.ts";

// Request Handlers
export class RequestHandler {
  private reportScheduler: ReportScheduler;

  constructor() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const configService = new ReportConfigService(supabase);
    const emailService = new EmailService(supabaseUrl, supabaseServiceKey);
    this.reportScheduler = new ReportScheduler(configService, emailService);
  }

  async handleOptions(): Promise<Response> {
    return new Response(null, { headers: CORS_HEADERS });
  }

  async handlePost(req: Request): Promise<Response> {
    try {
      const requestBody = await this.parseRequest(req);
      const { reportType, automated = false } = requestBody;

      console.log(`📅 Schedule-reports triggered: reportType=${reportType}, automated=${automated}`);

      const result = await this.reportScheduler.processReports(reportType);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });

    } catch (error: any) {
      console.error('❌ Error in schedule-reports function:', error);
      return new Response(JSON.stringify({
        success: false,
        message: error.message
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }

  private async parseRequest(req: Request): Promise<ScheduleRequest> {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
} 