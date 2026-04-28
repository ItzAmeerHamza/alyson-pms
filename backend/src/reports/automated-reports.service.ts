import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { mergeTimeIntervals, type TimeInterval } from '../lib/time-merge';

interface EmployeePerformance {
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

interface DailyAlert {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  employee: string;
  details: any;
}

@Injectable()
export class AutomatedReportsService {
  private readonly logger = new Logger(AutomatedReportsService.name);

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  // Daily Report – DISABLED: now handled by Supabase pg_cron → send_email_reports_per_org('daily')
  // @Cron('0 19 * * *')
  async sendDailyReport() {
    this.logger.log('🕖 Starting daily report generation...');
    
    try {
      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);

      // Get employee performance data for today
      const employees = await this.getDailyEmployeePerformance(startOfToday, endOfToday);
      
      // Get alerts for today
      const alerts = await this.getDailyAlerts(startOfToday, endOfToday);

      // Generate and send email
      await this.sendDailyEmailReport(employees, alerts, today);

      this.logger.log('✅ Daily report sent successfully');
    } catch (error) {
      this.logger.error('❌ Failed to send daily report:', error);
    }
  }

  // Weekly Report – DISABLED: now handled by Supabase pg_cron → send_email_reports_per_org('weekly')
  // @Cron('0 9 * * 1')
  async sendWeeklyReport() {
    this.logger.log('📊 Starting weekly report generation...');
    
    try {
      const today = new Date();
          const startOfLastWeek = startOfWeek(subDays(today, 7), { weekStartsOn: 0 });
    const endOfLastWeek = endOfWeek(subDays(today, 7), { weekStartsOn: 0 });

      // Get employee performance data for last week
      const employees = await this.getWeeklyEmployeePerformance(startOfLastWeek, endOfLastWeek);
      
      // Get weekly alert summary
      const alerts = await this.getWeeklyAlerts(startOfLastWeek, endOfLastWeek);

      // Generate and send email
      await this.sendWeeklyEmailReport(employees, alerts, startOfLastWeek, endOfLastWeek);

      this.logger.log('✅ Weekly report sent successfully');
    } catch (error) {
      this.logger.error('❌ Failed to send weekly report:', error);
    }
  }

  private async getDailyEmployeePerformance(startDate: Date, endDate: Date): Promise<EmployeePerformance[]> {
    const supabase = this.supabaseService.getClient();

    // Get all employees
    // TODO: When org-scoped reports are implemented, filter by organization_id
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, shift_start, organization_id')
      .eq('role', 'employee');

    if (!users) return [];

    const employeePerformance: EmployeePerformance[] = [];

    for (const user of users) {
      // Get time logs for today
      const { data: timeLogs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time');

      if (!timeLogs || timeLogs.length === 0) continue;

      // Calculate hours with merged intervals (multi-device safe)
      const intervals: TimeInterval[] = [];
      let totalActiveTime = 0;
      let firstStart: string | undefined;
      let lastStop: string | undefined;
      const projects = new Set<string>();

      for (const log of timeLogs) {
        const start = new Date(log.start_time);
        const end = log.end_time ? new Date(log.end_time) : new Date();
        intervals.push({ startMs: start.getTime(), endMs: end.getTime() });

        if (!log.is_idle) {
          totalActiveTime += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        }

        if (!firstStart || start < new Date(firstStart)) {
          firstStart = log.start_time;
        }

        if (!lastStop || (log.end_time && new Date(log.end_time) > new Date(lastStop))) {
          lastStop = log.end_time;
        }

        if (log.project_id) {
          projects.add(log.project_id);
        }
      }

      const merged = mergeTimeIntervals(intervals);
      let totalHours = 0;
      for (const interval of merged) {
        totalHours += (interval.endMs - interval.startMs) / (1000 * 60 * 60);
      }

      // Get project names
      const projectNames = await this.getProjectNames(Array.from(projects));

      // Check for alerts
      const alerts = await this.checkEmployeeAlerts(user, timeLogs, startDate);

      employeePerformance.push({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email,
        totalHours,
        activePercentage: totalHours > 0 ? (totalActiveTime / totalHours) * 100 : 0,
        firstStart: firstStart ? format(new Date(firstStart), 'h:mm a') : undefined,
        lastStop: lastStop ? format(new Date(lastStop), 'h:mm a') : undefined,
        projects: projectNames,
        alerts: alerts.map(alert => alert.message)
      });
    }

    return employeePerformance.filter(emp => emp.totalHours > 0);
  }

  private async getWeeklyEmployeePerformance(startDate: Date, endDate: Date): Promise<EmployeePerformance[]> {
    const supabase = this.supabaseService.getClient();

    // TODO: When org-scoped reports are implemented, filter by organization_id
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email, organization_id')
      .eq('role', 'employee');

    if (!users) return [];

    const employeePerformance: EmployeePerformance[] = [];

    for (const user of users) {
      const { data: timeLogs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString());

      if (!timeLogs || timeLogs.length === 0) continue;

      const weekIntervals: TimeInterval[] = [];
      let totalActiveTime = 0;
      const projects = new Set<string>();

      for (const log of timeLogs) {
        const start = new Date(log.start_time);
        const end = log.end_time ? new Date(log.end_time) : new Date();
        weekIntervals.push({ startMs: start.getTime(), endMs: end.getTime() });

        if (!log.is_idle) {
          totalActiveTime += (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        }

        if (log.project_id) {
          projects.add(log.project_id);
        }
      }

      const mergedWeek = mergeTimeIntervals(weekIntervals);
      let totalHours = 0;
      for (const interval of mergedWeek) {
        totalHours += (interval.endMs - interval.startMs) / (1000 * 60 * 60);
      }

      const projectNames = await this.getProjectNames(Array.from(projects));
      const weeklyAlerts = await this.checkWeeklyAlerts(user, startDate, endDate);

      employeePerformance.push({
        id: user.id,
        name: user.full_name || 'Unknown',
        email: user.email,
        totalHours,
        activePercentage: totalHours > 0 ? (totalActiveTime / totalHours) * 100 : 0,
        projects: projectNames,
        alerts: weeklyAlerts
      });
    }

    return employeePerformance.filter(emp => emp.totalHours > 0);
  }

  private async getProjectNames(projectIds: string[]): Promise<string[]> {
    if (projectIds.length === 0) return [];

    const supabase = this.supabaseService.getClient();
    const { data: projects } = await supabase
      .from('projects')
      .select('name')
      .in('id', projectIds);

    return projects ? projects.map(p => p.name) : [];
  }

  private async checkEmployeeAlerts(user: any, timeLogs: any[], date: Date): Promise<DailyAlert[]> {
    const alerts: DailyAlert[] = [];

    // Alert 1: Frequent timer toggles (>10)
    if (timeLogs.length > 10) {
      alerts.push({
        type: 'frequent_toggles',
        severity: 'MEDIUM',
        message: `Frequent timer toggles (${timeLogs.length} times)`,
        employee: user.full_name,
        details: { toggleCount: timeLogs.length }
      });
    }

    // Alert 2: Excessive idle time (>15 minutes total)
    const totalIdleTime = timeLogs
      .filter(log => log.is_idle)
      .reduce((total, log) => {
        const start = new Date(log.start_time);
        const end = log.end_time ? new Date(log.end_time) : new Date();
        return total + (end.getTime() - start.getTime()) / (1000 * 60); // minutes
      }, 0);

    if (totalIdleTime > 15) {
      alerts.push({
        type: 'idle_time',
        severity: 'HIGH',
        message: `Excessive idle time (${Math.round(totalIdleTime)} minutes)`,
        employee: user.full_name,
        details: { idleMinutes: Math.round(totalIdleTime) }
      });
    }

    // Alert 3: No timer started within 3 hours of shift
    if (user.shift_start && timeLogs.length > 0) {
      const shiftStartTime = new Date(`${format(date, 'yyyy-MM-dd')}T${user.shift_start}`);
      const firstLogTime = new Date(timeLogs[0].start_time);
      const delayMinutes = (firstLogTime.getTime() - shiftStartTime.getTime()) / (1000 * 60);

      if (delayMinutes > 180) { // 3 hours
        alerts.push({
          type: 'late_start',
          severity: 'HIGH',
          message: `Timer started ${Math.round(delayMinutes / 60)} hours late`,
          employee: user.full_name,
          details: { delayHours: Math.round(delayMinutes / 60) }
        });
      }
    }

    // Alert 4: Check for non-work URLs (would need URL logs table)
    const supabase = this.supabaseService.getClient();
    const { data: urlLogs } = await supabase
      .from('url_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('timestamp', date.toISOString())
      .lte('timestamp', endOfDay(date).toISOString());

    if (urlLogs) {
      const nonWorkUrls = urlLogs.filter(log => 
        log.url.includes('youtube.com') || 
        log.url.includes('facebook.com') || 
        log.url.includes('twitter.com') || 
        log.url.includes('instagram.com')
      );

      if (nonWorkUrls.length > 0) {
        const nonWorkMinutes = nonWorkUrls.length * 0.5; // Assume 30 seconds per URL check
        if (nonWorkMinutes > 3) {
          alerts.push({
            type: 'non_work_activity',
            severity: 'MEDIUM',
            message: `Non-work websites detected (${nonWorkUrls.length} instances)`,
            employee: user.full_name,
            details: { urlCount: nonWorkUrls.length }
          });
        }
      }
    }

    return alerts;
  }

  private async checkWeeklyAlerts(user: any, startDate: Date, endDate: Date): Promise<string[]> {
    const alerts: string[] = [];
    const supabase = this.supabaseService.getClient();

    // Check for low productivity across multiple days
    const dailyStats = await this.getDailyProductivityStats(user.id, startDate, endDate);
    const lowProductivityDays = dailyStats.filter(day => day.activePercentage < 30).length;

    if (lowProductivityDays >= 3) {
      alerts.push(`Low productivity (<30%) across ${lowProductivityDays} days`);
    }

    // Check for excessive idle time on multiple days
    const highIdleDays = dailyStats.filter(day => day.idleHours > 1).length;
    if (highIdleDays >= 3) {
      alerts.push(`Idle time >1hr on ${highIdleDays} days`);
    }

    // Check for late starts
    const lateStartCount = await this.getLateStartCount(user.id, startDate, endDate);
    if (lateStartCount >= 2) {
      alerts.push(`No timer started 2+ times this week`);
    }

    return alerts;
  }

  private async getDailyProductivityStats(userId: string, startDate: Date, endDate: Date) {
    // Implementation to get daily stats for the week
    // This would analyze each day individually
    return []; // Simplified for now
  }

  private async getLateStartCount(userId: string, startDate: Date, endDate: Date): Promise<number> {
    // Implementation to count late starts
    return 0; // Simplified for now
  }

  private async getDailyAlerts(startDate: Date, endDate: Date): Promise<DailyAlert[]> {
    // This would aggregate all alerts from all employees for the day
    return [];
  }

  private async getWeeklyAlerts(startDate: Date, endDate: Date): Promise<string[]> {
    // This would aggregate weekly patterns and alerts
    return [];
  }

  private async sendDailyEmailReport(employees: EmployeePerformance[], alerts: DailyAlert[], date: Date) {
    const hrEmail = this.configService.get<string>('HR_EMAIL') || 'hr@yourdomain.com';
    const subject = `📅 Daily Team Performance Summary – ${format(date, 'MMM d, yyyy')}`;
    
    const html = this.generateDailyEmailTemplate(employees, alerts, date);
    const text = this.generateDailyEmailText(employees, alerts, date);

    await this.notificationsService.sendEmailNotification(hrEmail, subject, text, html);
  }

  private async sendWeeklyEmailReport(employees: EmployeePerformance[], alerts: string[], startDate: Date, endDate: Date) {
    const hrEmail = this.configService.get<string>('HR_EMAIL') || 'hr@yourdomain.com';
    const subject = `📊 Weekly Performance Summary – ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
    
    const html = this.generateWeeklyEmailTemplate(employees, alerts, startDate, endDate);
    const text = this.generateWeeklyEmailText(employees, alerts, startDate, endDate);

    await this.notificationsService.sendEmailNotification(hrEmail, subject, text, html);
  }

  private generateDailyEmailTemplate(employees: EmployeePerformance[], alerts: DailyAlert[], date: Date): string {
    const totalHours = employees.reduce((sum, emp) => sum + emp.totalHours, 0);
    const avgActivity = employees.reduce((sum, emp) => sum + emp.activePercentage, 0) / employees.length;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
            .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .content { padding: 30px; }
            .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; gap: 20px; flex-wrap: wrap; }
            .stat { flex: 1; min-width: 150px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #667eea; }
            .stat-label { color: #64748b; font-size: 14px; margin-top: 5px; }
            .section { margin-bottom: 30px; }
            .section h2 { color: #1e293b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #334155; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 10px 0; border-radius: 4px; }
            .alert-medium { background: #fffbeb; border-left-color: #f59e0b; }
            .alert-low { background: #f0f9ff; border-left-color: #3b82f6; }
            .no-alerts { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; border-radius: 4px; color: #166534; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📅 Daily Team Performance Summary</h1>
                <p>${format(date, 'EEEE, MMMM d, yyyy')}</p>
            </div>
            
            <div class="content">
                <div class="summary">
                    <div class="stat">
                        <div class="stat-value">${employees.length}</div>
                        <div class="stat-label">Employees Active</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${totalHours.toFixed(1)}h</div>
                        <div class="stat-label">Total Hours</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${avgActivity.toFixed(0)}%</div>
                        <div class="stat-label">Avg Activity</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${alerts.length}</div>
                        <div class="stat-label">Alerts</div>
                    </div>
                </div>

                <div class="section">
                    <h2>✅ Employees Who Worked Today</h2>
                    ${employees.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Hours Worked</th>
                                <th>Active %</th>
                                <th>Projects Worked On</th>
                                <th>First Start</th>
                                <th>Last Stop</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${employees.map(emp => `
                            <tr>
                                <td><strong>${emp.name}</strong></td>
                                <td>${emp.totalHours.toFixed(1)} hrs</td>
                                <td>${emp.activePercentage.toFixed(0)}%</td>
                                <td>${emp.projects.join(', ') || 'No projects'}</td>
                                <td>${emp.firstStart || 'N/A'}</td>
                                <td>${emp.lastStop || 'N/A'}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : '<p>No employees worked today.</p>'}
                </div>

                <div class="section">
                    <h2>⚠️ Alerts</h2>
                    ${alerts.length > 0 ? 
                        alerts.map(alert => `
                        <div class="alert alert-${alert.severity.toLowerCase()}">
                            <strong>${alert.type.replace(/_/g, ' ').toUpperCase()}</strong>: ${alert.message}
                            <br><small>Employee: ${alert.employee}</small>
                        </div>
                        `).join('') 
                    : '<div class="no-alerts">✅ No alerts for today - great work team!</div>'}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  private generateWeeklyEmailTemplate(employees: EmployeePerformance[], alerts: string[], startDate: Date, endDate: Date): string {
    const totalHours = employees.reduce((sum, emp) => sum + emp.totalHours, 0);
    const avgActivity = employees.reduce((sum, emp) => sum + emp.activePercentage, 0) / employees.length;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f5f7fa; }
            .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .content { padding: 30px; }
            .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; gap: 20px; flex-wrap: wrap; }
            .stat { flex: 1; min-width: 150px; text-align: center; }
            .stat-value { font-size: 24px; font-weight: bold; color: #10b981; }
            .stat-label { color: #64748b; font-size: 14px; margin-top: 5px; }
            .section { margin-bottom: 30px; }
            .section h2 { color: #1e293b; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #334155; border-bottom: 2px solid #e2e8f0; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            .flag { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin: 5px 0; border-radius: 4px; }
            .no-flags { background: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; border-radius: 4px; color: #166534; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Weekly Performance Summary</h1>
                <p>${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}</p>
            </div>
            
            <div class="content">
                <div class="summary">
                    <div class="stat">
                        <div class="stat-value">${employees.length}</div>
                        <div class="stat-label">Active Employees</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${totalHours.toFixed(1)}h</div>
                        <div class="stat-label">Total Hours</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${avgActivity.toFixed(0)}%</div>
                        <div class="stat-label">Avg Activity</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value">${alerts.length}</div>
                        <div class="stat-label">Weekly Flags</div>
                    </div>
                </div>

                <div class="section">
                    <h2>✅ Weekly Work Summary</h2>
                    ${employees.length > 0 ? `
                    <table>
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Total Hours</th>
                                <th>Avg. Active %</th>
                                <th>Projects Worked On</th>
                                <th>Flags</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${employees.map(emp => `
                            <tr>
                                <td><strong>${emp.name}</strong></td>
                                <td>${emp.totalHours.toFixed(1)} hrs</td>
                                <td>${emp.activePercentage.toFixed(0)}%</td>
                                <td>${emp.projects.join(', ') || 'No projects'}</td>
                                <td>${emp.alerts.length > 0 ? emp.alerts.join(', ') : 'None'}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : '<p>No employee activity this week.</p>'}
                </div>

                <div class="section">
                    <h2>⚠️ Weekly Flags (Repeated Issues)</h2>
                    ${alerts.length > 0 ? 
                        alerts.map(alert => `<div class="flag">${alert}</div>`).join('') 
                    : '<div class="no-flags">✅ No recurring issues this week - excellent performance!</div>'}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
  }

  private generateDailyEmailText(employees: EmployeePerformance[], alerts: DailyAlert[], date: Date): string {
    return `
DAILY TEAM PERFORMANCE SUMMARY - ${format(date, 'MMM d, yyyy')}

EMPLOYEES WHO WORKED TODAY:
${employees.map(emp => 
  `• ${emp.name}: ${emp.totalHours.toFixed(1)}h (${emp.activePercentage.toFixed(0)}% active) - ${emp.projects.join(', ')}`
).join('\n')}

ALERTS:
${alerts.length > 0 ? 
  alerts.map(alert => `• ${alert.type.toUpperCase()}: ${alert.message} (${alert.employee})`).join('\n')
  : '• No alerts today'}

Generated by Time Flow Admin Dashboard
    `;
  }

  private generateWeeklyEmailText(employees: EmployeePerformance[], alerts: string[], startDate: Date, endDate: Date): string {
    return `
WEEKLY PERFORMANCE SUMMARY - ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}

WEEKLY WORK SUMMARY:
${employees.map(emp => 
  `• ${emp.name}: ${emp.totalHours.toFixed(1)}h total (${emp.activePercentage.toFixed(0)}% avg active)`
).join('\n')}

WEEKLY FLAGS:
${alerts.length > 0 ? 
  alerts.map(alert => `• ${alert}`).join('\n')
  : '• No recurring issues this week'}

Generated by Time Flow Admin Dashboard
    `;
  }
}