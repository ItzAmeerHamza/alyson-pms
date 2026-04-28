import { ReportConfig, ReportResult, ScheduleResponse } from "../types.ts";
import { ReportConfigService } from "./config.service.ts";
import { EmailService } from "./email.service.ts";

// Business Logic
export class ReportScheduler {
  constructor(
    private configService: ReportConfigService,
    private emailService: EmailService
  ) {}

  async processReports(reportType?: string): Promise<ScheduleResponse> {
    const configs = await this.configService.getActiveConfigs(reportType);

    if (configs.length === 0) {
      return {
        success: true,
        message: `No active ${reportType || 'any'} report configurations found`,
        results: []
      };
    }

    console.log(`📋 Found ${configs.length} ${reportType || 'report'} configurations to process`);

    // Send reports concurrently for better performance
    const results = await Promise.all(
      configs.map(config => this.emailService.sendReport(config))
    );

    // Log individual results
    results.forEach(result => {
      console.log(`${result.success ? '✅' : '❌'} Report ${result.reportName}: ${result.message}`);
    });

    return this.generateSummary(configs, results, reportType);
  }

  private generateSummary(
    configs: ReportConfig[], 
    results: ReportResult[], 
    reportType?: string
  ): ScheduleResponse {
    const successCount = results.filter(r => r.success).length;
    const totalRecipients = results.reduce((sum, r) => sum + (r.recipients || 0), 0);

    console.log(`📊 Summary: ${successCount}/${configs.length} reports sent to ${totalRecipients} total recipients`);

    return {
      success: true,
      message: `Processed ${configs.length} ${reportType || 'scheduled'} reports: ${successCount} sent, ${configs.length - successCount} failed`,
      results,
      summary: {
        total: configs.length,
        sent: successCount,
        failed: configs.length - successCount,
        totalRecipients
      }
    };
  }
} 