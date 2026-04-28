import { ReportConfig, ReportResult } from "../types.ts";

// Email Service
export class EmailService {
  constructor(private supabaseUrl: string, private serviceKey: string) {}

  async sendReport(config: ReportConfig): Promise<ReportResult> {
    try {
      console.log(`📧 Sending ${config.name} (ID: ${config.id})`);
      
      const response = await fetch(`${this.supabaseUrl}/functions/v1/send-report-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.serviceKey}`,
        },
        body: JSON.stringify({
          configId: config.id,
          isTest: false
        }),
      });

      const result = await response.json();
      
      return {
        reportId: config.id,
        reportName: config.name,
        reportType: config.report_types?.template_type,
        success: response.ok,
        message: result.message,
        recipients: result.recipients
      };
    } catch (error: any) {
      return {
        reportId: config.id,
        reportName: config.name,
        reportType: config.report_types?.template_type,
        success: false,
        message: error.message
      };
    }
  }
} 