import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase.service';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { mergeTimeIntervals, type TimeInterval } from '../lib/time-merge';

interface ReportConfiguration {
  id: string;
  name: string;
  template_type: string;
  schedule_cron: string;
  subject_template: string;
  include_summary: boolean;
  include_employee_details: boolean;
  include_alerts: boolean;
  include_projects: boolean;
  alert_settings: any;
  filters: any;
  organization_id?: string | null;
  min_work_hours?: number;
  min_activity_percent?: number;
}

interface EmployeeData {
  id: string;
  name: string;
  email: string;
  totalHours: number;
  activePercentage: number;
  firstStart?: string;
  lastStop?: string;
  projects: string[];
  alerts: string[];
}

interface AlertData {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  employee: string;
}

@Injectable()
export class EmailReportsService {
  private readonly logger = new Logger(EmailReportsService.name);
  private readonly resendApiKey: string;

  constructor(
    @Optional() private configService?: ConfigService,
    private supabaseService?: SupabaseService,
  ) {
    this.resendApiKey = this.configService?.get<string>('RESEND_API_KEY') || process.env.RESEND_API_KEY;
    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured - email reports will not work');
    }
  }

  // Dynamic cron job – DISABLED: now handled by Supabase pg_cron → process_scheduled_reports()
  // @Cron('0 */15 * * * *')
  async processScheduledReports() {
    try {
      const dueReports = await this.getDueReports();
      
      for (const report of dueReports) {
        await this.sendReport(report.id, false);
      }
    } catch (error) {
      this.logger.error('Error processing scheduled reports:', error);
    }
  }

  async getDueReports(): Promise<ReportConfiguration[]> {
    const supabase = this.supabaseService.getClient();
    
    // Get all active report configurations (including organization_id)
    const { data: configs, error } = await supabase
      .from('report_configurations')
      .select(`
        id, name, template_type, schedule_cron, subject_template,
        include_summary, include_employee_details, include_alerts, include_projects,
        alert_settings, filters, organization_id
      `)
      .eq('is_active', true);

    if (error) {
      this.logger.error('Error fetching report configurations:', error);
      return [];
    }

    // Filter reports that are due (simplified logic - in production you'd use a proper cron parser)
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    return configs.filter(config => {
      if (!config.schedule_cron) return false;
      
      // Simple cron parsing for our use cases
      if (config.schedule_cron === '0 19 * * *' && currentHour === 19 && currentMinute < 15) {
        return true; // Daily at 7 PM
      }
      if (config.schedule_cron === '0 9 * * 1' && currentDay === 1 && currentHour === 9 && currentMinute < 15) {
        return true; // Weekly on Monday at 9 AM
      }
      
      return false;
    });
  }

  async sendReport(configId: string, isTest = false): Promise<{ success: boolean; message: string; recipients?: number }> {
    try {
      this.logger.log(`📧 ${isTest ? 'Testing' : 'Sending'} report for config: ${configId}`);

      const config = await this.getReportConfiguration(configId);
      if (!config) {
        throw new Error('Report configuration not found');
      }

      const recipients = await this.getReportRecipients(configId);
      if (recipients.length === 0) {
        throw new Error('No recipients configured for this report');
      }

      const reportData = await this.generateReportData(config);
      const emailContent = this.generateEmailContent(config, reportData);

      const subject = this.processSubjectTemplate(config.subject_template, reportData);

      // Send email using Resend
      const emailResult = await this.sendEmailViaResend(
        recipients.map(r => r.email),
        subject,
        emailContent
      );

      // Log the report (include organization_id from config)
      await this.logReportHistory(configId, recipients.length, isTest ? 'test' : 'sent', emailResult.id, reportData, undefined, config.organization_id);

      this.logger.log(`✅ Report sent successfully to ${recipients.length} recipients`);
      
      return {
        success: true,
        message: `Report sent to ${recipients.length} recipients`,
        recipients: recipients.length
      };

    } catch (error) {
      this.logger.error(`❌ Error sending report:`, error);
      
      // Log the error
      await this.logReportHistory(configId, 0, 'failed', null, null, error.message, null);
      
      return {
        success: false,
        message: error.message
      };
    }
  }

  async testEmailConfiguration(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.resendApiKey) {
        throw new Error('RESEND_API_KEY not configured');
      }

      // Get first admin user as test recipient
      const supabase = this.supabaseService.getClient();
      const { data: admins, error } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('role', 'admin')
        .limit(1);

      if (error || !admins || admins.length === 0) {
        throw new Error('No admin users found to test email');
      }

      const testHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #667eea;">📧 Email Test Successful!</h1>
          <p>This is a test email from your TimeFlow automated reports system.</p>
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
            <strong>✅ Email Configuration Working</strong><br>
            Your Resend API integration is working correctly.
          </div>
          <p><strong>Test Details:</strong></p>
          <ul>
            <li>Sent to: ${admins[0].email}</li>
            <li>Time: ${new Date().toISOString()}</li>
            <li>Service: Resend API</li>
          </ul>
          <p>You can now configure your automated reports with confidence!</p>
        </div>
      `;

      await this.sendEmailViaResend(
        [admins[0].email],
        '📧 TimeFlow Email Test - Configuration Successful',
        testHtml
      );

      return {
        success: true,
        message: `Test email sent successfully to ${admins[0].email}`
      };

    } catch (error) {
      this.logger.error('Email test failed:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  private async sendEmailViaResend(to: string[], subject: string, html: string): Promise<any> {
    if (!this.resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TimeFlow Reports <reports@timeflow.app>',
        to: to,
        subject: subject,
        html: html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }

    return await response.json();
  }

  private async getReportConfiguration(configId: string): Promise<ReportConfiguration | null> {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase
      .from('report_configurations')
      .select('*')
      .eq('id', configId)
      .eq('is_active', true)
      .single();

    if (error) {
      this.logger.error('Error fetching report configuration:', error);
      return null;
    }

    return data;
  }

  private async getReportRecipients(configId: string): Promise<Array<{ email: string; user_id: string }>> {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase
      .from('report_recipients')
      .select('email, user_id')
      .eq('report_config_id', configId)
      .eq('is_active', true);

    if (error) {
      this.logger.error('Error fetching report recipients:', error);
      return [];
    }

    return data || [];
  }

  private async generateReportData(config: ReportConfiguration): Promise<any> {
    const today = new Date();
    
    if (config.template_type === 'daily') {
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);
      
      const employees = await this.getDailyEmployeeData(startOfToday, endOfToday, config);
      const alerts = await this.getDailyAlerts(startOfToday, endOfToday, config);

      // Fetch AI insights and merge into employees
      const aiInsights = await this.getAIInsightsForPeriod(startOfToday, endOfToday, config.organization_id);
      const employeesWithAI = this.mergeAIInsightsIntoEmployees(employees, aiInsights);
      const teamAvgProductivity = this.calcTeamAvg(aiInsights);

      // Sort by productivity score descending
      employeesWithAI.sort((a, b) => (b.productivityScore || 0) - (a.productivityScore || 0));

      return {
        type: 'daily',
        date: format(today, 'EEEE, MMMM d, yyyy'),
        employees: employeesWithAI,
        alerts,
        totalHours: employees.reduce((sum, emp) => sum + emp.totalHours, 0),
        avgActivity: employees.length > 0 ? employees.reduce((sum, emp) => sum + emp.activePercentage, 0) / employees.length : 0,
        teamAvgProductivity,
      };
    } 
    
    if (config.template_type === 'weekly') {
      const startOfLastWeek = startOfWeek(subDays(today, 7), { weekStartsOn: 0 });
      const endOfLastWeek = endOfWeek(subDays(today, 7), { weekStartsOn: 0 });
      
      const employees = await this.getWeeklyEmployeeData(startOfLastWeek, endOfLastWeek, config);

      // Fetch AI insights and merge into employees
      const aiInsights = await this.getAIInsightsForPeriod(startOfLastWeek, endOfLastWeek, config.organization_id);
      const employeesWithAI = this.mergeAIInsightsIntoEmployees(employees, aiInsights);
      const teamAvgProductivity = this.calcTeamAvg(aiInsights);

      // Sort by productivity score descending
      employeesWithAI.sort((a, b) => (b.productivityScore || 0) - (a.productivityScore || 0));

      return {
        type: 'weekly',
        startDate: format(startOfLastWeek, 'MMM d'),
        endDate: format(endOfLastWeek, 'MMM d, yyyy'),
        employees: employeesWithAI,
        totalHours: employees.reduce((sum, emp) => sum + emp.totalHours, 0),
        avgActivity: employees.length > 0 ? employees.reduce((sum, emp) => sum + emp.activePercentage, 0) / employees.length : 0,
        teamAvgProductivity,
      };
    }

    throw new Error(`Unsupported template type: ${config.template_type}`);
  }

  private async getAIInsightsForPeriod(
    startDate: Date,
    endDate: Date,
    organizationId?: string | null,
  ): Promise<Map<string, any>> {
    const supabase = this.supabaseService.getClient();
    const insightsMap = new Map<string, any>();

    try {
      let query = supabase
        .from('ai_employee_insights')
        .select('user_id, insights, created_at')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data: rows, error } = await query;

      if (error) {
        this.logger.error('Error fetching AI insights:', error);
        return insightsMap;
      }

      let source = rows;
      if (!source || source.length === 0) {
        // Fallback to latest available insights
        let fallbackQuery = supabase
          .from('ai_employee_insights')
          .select('user_id, insights, created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        if (organizationId) {
          fallbackQuery = fallbackQuery.eq('organization_id', organizationId);
        }
        const { data: fallback } = await fallbackQuery;
        source = fallback || [];
      }

      const seenUsers = new Set<string>();
      for (const row of source) {
        if (seenUsers.has(row.user_id)) continue;
        seenUsers.add(row.user_id);

        const ins = row.insights || {};
        const productivityScore = ins.productivity_score || 0;
        const riskLevel = ins.risk_level || 'low';
        const distractionScore = ins.distraction_indicators?.distraction_score || 0;
        const screenshotsAnalyzed = ins.screenshots_analyzed || ins.total_screenshots || 0;

        let performanceStatus = 'Good';
        if (riskLevel === 'high' || productivityScore < 40 || distractionScore > 60) {
          performanceStatus = 'Concerning';
        } else if (riskLevel === 'medium' || productivityScore < 60) {
          performanceStatus = 'Needs Improvement';
        } else if (productivityScore >= 80 && riskLevel === 'low') {
          performanceStatus = 'Excellent';
        }

        const executiveSummary =
          ins.ai_insights?.executive_summary || ins.executive_summary || ins.ai_summary || '';
        const workDescription = ins.ai_insights?.work_description || ins.work_description || '';

        insightsMap.set(row.user_id, {
          productivityScore,
          riskLevel,
          performanceStatus,
          screenshotsAnalyzed,
          executiveSummary,
          workDescription,
          distractionScore,
          teamAvgDiff: 0,
        });
      }

      // Calculate team average and diffs
      const scores = Array.from(insightsMap.values()).map(i => i.productivityScore).filter(s => s > 0);
      const teamAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      for (const insight of insightsMap.values()) {
        insight.teamAvgDiff = insight.productivityScore - teamAvg;
      }
    } catch (err) {
      this.logger.error('Failed to fetch AI insights:', err);
    }

    return insightsMap;
  }

  private getStatusFromActivity(activityPct: number, totalHours: number): string {
    if (totalHours <= 0) return 'Absent';
    if (activityPct >= 70) return 'Good';
    if (activityPct >= 40) return 'Needs Improvement';
    return 'Concerning';
  }

  private mergeAIInsightsIntoEmployees(employees: EmployeeData[], aiInsights: Map<string, any>): any[] {
    return employees.map(emp => {
      const ai = aiInsights.get(emp.id);
      const fallbackStatus = this.getStatusFromActivity(emp.activePercentage, emp.totalHours);
      return {
        ...emp,
        productivityScore: ai?.productivityScore ?? 0,
        performanceStatus: ai?.performanceStatus ?? fallbackStatus,
        aiSummary: ai?.executiveSummary || ai?.workDescription || '',
        screenshotsAnalyzed: ai?.screenshotsAnalyzed ?? 0,
        teamAvgDiff: ai?.teamAvgDiff ?? 0,
        riskLevel: ai?.riskLevel ?? 'low',
      };
    });
  }

  private calcTeamAvg(aiInsights: Map<string, any>): number {
    const scores = Array.from(aiInsights.values()).map(i => i.productivityScore).filter(s => s > 0);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }

  private generateEmailContent(config: ReportConfiguration, reportData: any): string {
    if (reportData.type === 'daily') {
      return this.generateDailyEmailHTML(config, reportData);
    } else if (reportData.type === 'weekly') {
      return this.generateWeeklyEmailHTML(config, reportData);
    }
    
    throw new Error(`Unsupported report type: ${reportData.type}`);
  }

  private getScoreColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#3b82f6';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  }

  private getStatusBg(status: string): string {
    if (status === 'Excellent') return '#d1fae5';
    if (status === 'Good') return '#dbeafe';
    if (status === 'Needs Improvement') return '#fef3c7';
    if (status === 'Concerning') return '#fee2e2';
    return '#f3f4f6';
  }

  private getStatusTextColor(status: string): string {
    if (status === 'Excellent') return '#065f46';
    if (status === 'Good') return '#1e40af';
    if (status === 'Needs Improvement') return '#92400e';
    if (status === 'Concerning') return '#991b1b';
    return '#6b7280';
  }

  private buildEmployeeCard(emp: any, teamAvg: number): string {
    const score = emp.productivityScore || 0;
    const status = emp.performanceStatus || this.getStatusFromActivity(emp.activePercentage || 0, emp.totalHours || 0);
    const scoreColor = this.getScoreColor(score);
    const diff = emp.teamAvgDiff || 0;
    const diffSign = diff >= 0 ? '+' : '';
    const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
    const statusBg = this.getStatusBg(status);
    const statusText = this.getStatusTextColor(status);
    const barColor = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444';
    const summary = emp.aiSummary || '';

    return `
    <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px; margin-bottom: 14px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align: top;">
          <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 2px;">${emp.name}</div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">${emp.email || ''}</div>
          <div style="font-size: 13px; color: #374151;">Activity: ${emp.screenshotsAnalyzed || 0} screenshots over ${emp.totalHours.toFixed(1)} hours &bull; <span style="color: ${score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'}; font-weight: 600;">${emp.activePercentage.toFixed(0)}% active</span></div>
          ${summary ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.5; margin-top: 8px;">${summary}</div>` : ''}
        </td>
        <td style="vertical-align: top; text-align: right; width: 110px; padding-left: 12px;">
          <div style="font-size: 34px; font-weight: 700; color: ${scoreColor}; line-height: 1;">${score}%</div>
          <div style="margin-top: 4px;"><span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${statusBg}; color: ${statusText};">${status}</span></div>
          <div style="font-size: 12px; font-weight: 600; color: ${diffColor}; margin-top: 4px;">${diffSign}${diff}%</div>
        </td>
      </tr></table>
      <div style="margin-top: 12px; position: relative; height: 6px; background: #e5e7eb; border-radius: 3px;">
        <div style="height: 100%; width: ${Math.min(score, 100)}%; border-radius: 3px; background: ${barColor};"></div>
        ${teamAvg > 0 ? `<div style="position: absolute; top: -4px; left: ${teamAvg}%; width: 2px; height: 14px; background: #6b7280; border-radius: 1px;"></div>` : ''}
      </div>
      ${teamAvg > 0 ? `<div style="font-size: 10px; color: #6b7280; margin-top: 4px; text-align: right;">Team Avg: ${teamAvg}%</div>` : ''}
    </div>`;
  }

  private generateDailyEmailHTML(config: ReportConfiguration, reportData: any): string {
    const { employees, alerts, date, totalHours, avgActivity, teamAvgProductivity } = reportData;
    const teamAvg = teamAvgProductivity || 0;

    const employeeCards = (employees || []).map(emp => this.buildEmployeeCard(emp, teamAvg)).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Team Performance Summary</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 30px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e293b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
        .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 10px 0; border-radius: 4px; }
        .alert-medium { background: #fffbeb; border-left-color: #f59e0b; }
        .alert-low { background: #f0f9ff; border-left-color: #3b82f6; }
        .no-alerts { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; border-radius: 4px; color: #166534; }
        .footer { text-align: center; padding: 20px; background: #f8fafc; color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${config.name}</h1>
            <p>${date}</p>
        </div>
        
        <div class="content">
            ${config.include_summary ? `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px; background: #f8fafc; border-radius: 8px;">
              <tr>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #667eea;">${employees.length}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Employees Active</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #667eea;">${totalHours.toFixed(1)}h</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Total Hours</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #667eea;">${avgActivity.toFixed(0)}%</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Avg Activity</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #10b981;">${teamAvg}%</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Team AI Productivity</div>
                </td>
              </tr>
            </table>
            ` : ''}

            ${config.include_alerts ? `
            <div class="section">
                <h2>⚠️ Alerts</h2>
                ${alerts.length > 0 ? 
                    alerts.map(alert => `
                    <div class="alert alert-${alert.severity.toLowerCase()}">
                        <strong>${alert.type.replace(/_/g, ' ').toUpperCase()}</strong>: ${alert.message}
                        <br><small>Employee: ${alert.employee}</small>
                    </div>
                    `).join('') 
                : '<div class="no-alerts">No alerts for today - great work team!</div>'}
            </div>
            ` : ''}

            ${config.include_employee_details ? `
            <div class="section">
                <h2>🤖 AI Employee Insights</h2>
                ${employees.length > 0 ? employeeCards : '<p>No employees worked today.</p>'}
            </div>
            ` : ''}
        </div>
        
        <div class="footer">
            Generated by TimeFlow Admin System • ${new Date().toISOString()}
        </div>
    </div>
</body>
</html>`;
  }

  private generateWeeklyEmailHTML(config: ReportConfiguration, reportData: any): string {
    const { employees, startDate, endDate, totalHours, avgActivity, teamAvgProductivity } = reportData;
    const teamAvg = teamAvgProductivity || 0;

    // Count performance statuses for distribution
    const statusCounts = { excellent: 0, good: 0, needsImprovement: 0, concerning: 0 };
    (employees || []).forEach(emp => {
      const s = emp.performanceStatus || '';
      if (s === 'Excellent') statusCounts.excellent++;
      else if (s === 'Good') statusCounts.good++;
      else if (s === 'Needs Improvement') statusCounts.needsImprovement++;
      else if (s === 'Concerning') statusCounts.concerning++;
    });

    const employeeCards = (employees || []).slice(0, 15).map(emp => this.buildEmployeeCard(emp, teamAvg)).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weekly Team Performance Summary</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
        .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 30px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1e293b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
        .footer { text-align: center; padding: 20px; background: #f8fafc; color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${config.name}</h1>
            <p>${startDate} - ${endDate}</p>
        </div>
        
        <div class="content">
            ${config.include_summary ? `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 30px; background: #f8fafc; border-radius: 8px;">
              <tr>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #10b981;">${employees.length}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Active Employees</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #10b981;">${totalHours.toFixed(1)}h</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Total Hours</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #10b981;">${avgActivity.toFixed(0)}%</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Avg Activity</div>
                </td>
                <td style="padding: 18px; text-align: center;">
                  <div style="font-size: 22px; font-weight: bold; color: #10b981;">${teamAvg}%</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Team AI Productivity</div>
                </td>
              </tr>
            </table>
            ` : ''}

            <!-- Performance Distribution -->
            <div class="section">
                <h2>📈 Performance Distribution</h2>
                <table width="100%" cellpadding="0" cellspacing="8" border="0">
                  <tr>
                    <td style="background: #d1fae5; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                      <div style="font-size: 26px; font-weight: 700; color: #065f46;">${statusCounts.excellent}</div>
                      <div style="font-size: 11px; color: #065f46; margin-top: 4px;">Excellent</div>
                    </td>
                    <td style="background: #dbeafe; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                      <div style="font-size: 26px; font-weight: 700; color: #1e40af;">${statusCounts.good}</div>
                      <div style="font-size: 11px; color: #1e40af; margin-top: 4px;">Good</div>
                    </td>
                    <td style="background: #fef3c7; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                      <div style="font-size: 26px; font-weight: 700; color: #92400e;">${statusCounts.needsImprovement}</div>
                      <div style="font-size: 11px; color: #92400e; margin-top: 4px;">Needs Improvement</div>
                    </td>
                    <td style="background: #fee2e2; border-radius: 8px; padding: 14px; text-align: center; width: 25%;">
                      <div style="font-size: 26px; font-weight: 700; color: #991b1b;">${statusCounts.concerning}</div>
                      <div style="font-size: 11px; color: #991b1b; margin-top: 4px;">Concerning</div>
                    </td>
                  </tr>
                </table>
            </div>

            <div class="section">
                <h2>🤖 AI Team Performance</h2>
                ${employees.length > 0 ? employeeCards : '<p>No employee activity this week.</p>'}
            </div>
        </div>
        
        <div class="footer">
            Generated by TimeFlow Admin System • ${new Date().toISOString()}
        </div>
    </div>
</body>
</html>`;
  }

  private processSubjectTemplate(template: string, reportData: any): string {
    return template
      .replace('{date}', reportData.date || '')
      .replace('{start_date}', reportData.startDate || '')
      .replace('{end_date}', reportData.endDate || '');
  }

  private async logReportHistory(
    configId: string, 
    recipientCount: number, 
    status: string, 
    emailServiceId?: string, 
    reportData?: any, 
    errorMessage?: string,
    organizationId?: string | null
  ) {
    const supabase = this.supabaseService.getClient();
    
    await supabase
      .from('report_history')
      .insert({
        report_config_id: configId,
        recipient_count: recipientCount,
        status,
        email_service_id: emailServiceId,
        report_data: reportData,
        error_message: errorMessage,
        organization_id: organizationId || null
      });
  }

  private async getDailyEmployeeData(startDate: Date, endDate: Date, config: ReportConfiguration): Promise<EmployeeData[]> {
    const supabase = this.supabaseService.getClient();
    
    // Fetch actual employee data with their time logs for the day
    let query = supabase
      .from('employees')
      .select(`
        id,
        full_name,
        email,
        time_logs!inner (
          id,
          start_time,
          end_time,
          duration_seconds,
          is_manual,
          activity_percent,
          project:projects (
            name
          )
        )
      `)
      .gte('time_logs.start_time', startDate.toISOString())
      .lte('time_logs.start_time', endDate.toISOString())
      .order('full_name');
    
    // Scope to organization if available
    if (config.organization_id) {
      query = query.eq('organization_id', config.organization_id);
    }

    const { data: employees, error } = await query;

    if (error) {
      this.logger.error('Failed to get daily employee data:', error);
      return [];
    }

    // Process and format employee data (multi-device: merge overlapping intervals)
    return employees?.map(employee => {
      const timeLogs = employee.time_logs || [];
      
      // Calculate total hours with merged intervals
      const dailyIntervals: TimeInterval[] = timeLogs
        .filter((log: any) => log.start_time && log.end_time)
        .map((log: any) => ({
          startMs: new Date(log.start_time).getTime(),
          endMs: new Date(log.end_time).getTime(),
        }));
      const dailyMerged = mergeTimeIntervals(dailyIntervals);
      let dailyTotalMs = 0;
      for (const interval of dailyMerged) {
        dailyTotalMs += interval.endMs - interval.startMs;
      }
      const totalHours = Math.round((dailyTotalMs / (1000 * 60 * 60)) * 10) / 10;
      
      // Calculate average activity percentage
      const activePercentage = timeLogs.length > 0
        ? Math.round(timeLogs.reduce((sum: number, log: any) => 
            sum + (log.activity_percent || 0), 0) / timeLogs.length)
        : 0;
      
      // Get first start and last stop times
      const sortedLogs = timeLogs.sort((a: any, b: any) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      
      const firstStart = sortedLogs.length > 0 
        ? new Date(sortedLogs[0].start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'N/A';
      
      const lastLog = sortedLogs[sortedLogs.length - 1];
      const lastStop = lastLog?.end_time 
        ? new Date(lastLog.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'Active';
      
      // Get unique projects
      const projects = [...new Set(timeLogs
        .filter((log: any) => log.project?.name)
        .map((log: any) => log.project.name))];

      // Get alerts based on configuration thresholds
      const alerts: string[] = [];
      if (totalHours < (config.min_work_hours || 6)) {
        alerts.push(`Low hours: ${totalHours}h`);
      }
      if (activePercentage < (config.min_activity_percent || 70)) {
        alerts.push(`Low activity: ${activePercentage}%`);
      }

      return {
        id: employee.id,
        name: employee.full_name || 'Unknown',
        email: employee.email || '',
        totalHours,
        activePercentage,
        firstStart,
        lastStop,
        projects,
        alerts
      };
    }).filter(emp => emp.totalHours > 0) || []; // Only include employees who worked
  }

  private async getWeeklyEmployeeData(startDate: Date, endDate: Date, config: ReportConfiguration): Promise<EmployeeData[]> {
    const supabase = this.supabaseService.getClient();
    
    // Fetch actual employee data with their time logs for the week
    let query = supabase
      .from('employees')
      .select(`
        id,
        full_name,
        email,
        time_logs!inner (
          id,
          start_time,
          end_time,
          duration_seconds,
          is_manual,
          activity_percent,
          project:projects (
            name
          )
        )
      `)
      .gte('time_logs.start_time', startDate.toISOString())
      .lte('time_logs.start_time', endDate.toISOString())
      .order('full_name');
    
    // Scope to organization if available
    if (config.organization_id) {
      query = query.eq('organization_id', config.organization_id);
    }

    const { data: employees, error } = await query;

    if (error) {
      this.logger.error('Failed to get weekly employee data:', error);
      return [];
    }

    // Process and format employee data (multi-device: merge overlapping intervals)
    return employees?.map(employee => {
      const timeLogs = employee.time_logs || [];
      
      // Calculate total hours with merged intervals
      const weeklyIntervals: TimeInterval[] = timeLogs
        .filter((log: any) => log.start_time && log.end_time)
        .map((log: any) => ({
          startMs: new Date(log.start_time).getTime(),
          endMs: new Date(log.end_time).getTime(),
        }));
      const weeklyMerged = mergeTimeIntervals(weeklyIntervals);
      let weeklyTotalMs = 0;
      for (const interval of weeklyMerged) {
        weeklyTotalMs += interval.endMs - interval.startMs;
      }
      const totalHours = Math.round((weeklyTotalMs / (1000 * 60 * 60)) * 10) / 10;
      
      // Calculate average activity percentage
      const activePercentage = timeLogs.length > 0
        ? Math.round(timeLogs.reduce((sum: number, log: any) => 
            sum + (log.activity_percent || 0), 0) / timeLogs.length)
        : 0;
      
      // Get unique projects
      const projects = [...new Set(timeLogs
        .filter((log: any) => log.project?.name)
        .map((log: any) => log.project.name))];

      // Get alerts based on weekly thresholds
      const alerts: string[] = [];
      const expectedWeeklyHours = (config.min_work_hours || 6) * 5; // 5 working days
      if (totalHours < expectedWeeklyHours * 0.8) { // 80% of expected
        alerts.push(`Low weekly hours: ${totalHours}h (expected: ${expectedWeeklyHours}h)`);
      }
      if (activePercentage < (config.min_activity_percent || 70)) {
        alerts.push(`Low activity: ${activePercentage}%`);
      }

      // For weekly report, we don't need firstStart/lastStop
      return {
        id: employee.id,
        name: employee.full_name || 'Unknown',
        email: employee.email || '',
        totalHours,
        activePercentage,
        projects,
        alerts
      };
    }).filter(emp => emp.totalHours > 0) || []; // Only include employees who worked
  }

  private async getDailyAlerts(startDate: Date, endDate: Date, config: ReportConfiguration): Promise<AlertData[]> {
    // This would implement actual alert detection logic
    return [];
  }
} 