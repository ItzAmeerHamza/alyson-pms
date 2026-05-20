import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaginated } from '@/lib/supabase-utils';
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import { 
  Download, 
  FileText,
  FileSpreadsheet,
  Users, 
  Calendar,
  RefreshCw,
  Filter,
  BarChart3,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  Brain,
  Sparkles,
  Info,
  AlertTriangle,
  Award,
  Zap,
  Shield
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, eachDayOfInterval } from "date-fns";
import { mergeTimeIntervals, getSmartEndMs, type TimeInterval } from "@/lib/time-utils";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Employee {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface BulkReportData {
  employee_name: string;
  employee_email: string;
  employee_role: string;
  date: string;
  total_hours: number;
  active_hours: number;
  idle_hours: number;
  activity_percentage: number;
  productivity_score: number;
  screenshots_count: number;
  projects_worked: string[];
  apps_used: string[];
  urls_visited: string[];
}

interface ReportSummary {
  total_employees: number;
  total_hours: number;
  average_activity: number;
  highest_performer: string;
  total_screenshots: number;
  date_range: string;
}

interface AIEmployeeSummary {
  user_id: string;
  employee_name: string;
  productivity_score: number;
  activity_percentage: number;
  risk_level: 'low' | 'medium' | 'high';
  executive_summary?: string;
}

interface AIReportSummary {
  avgProductivity: number;
  topPerformers: AIEmployeeSummary[];
  needsAttention: AIEmployeeSummary[];
  totalAnalyzed: number;
}

export default function BulkReportGenerator() {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reportData, setReportData] = useState<BulkReportData[]>([]);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<string>('week');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [includeApps, setIncludeApps] = useState(true);
  const [includeUrls, setIncludeUrls] = useState(false);
  const [groupBy, setGroupBy] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [aiSummary, setAiSummary] = useState<AIReportSummary | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;

  const isAdmin = userDetails?.role === 'admin' || userDetails?.role === 'manager';

  useEffect(() => {
    if (isAdmin && userDetails) {
      fetchEmployees();
    }
  }, [isAdmin, userDetails, organizationId, isSuperAdmin]);

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, full_name, email, role')
        .in('role', ['employee', 'admin', 'manager'])
        .eq('is_active', true);
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order('full_name');

      if (error) throw error;
      setEmployees(data || []);
      setSelectedEmployees((data || []).map(emp => emp.id));
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast.error('Failed to fetch employees');
    }
  };

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        throw new Error('Please select both start and end dates for custom range');
      }
      start = startOfDay(new Date(customStartDate));
      end = endOfDay(new Date(customEndDate));
    } else {
      switch (dateRange) {
        case 'today':
          start = startOfDay(now);
          end = endOfDay(now);
          break;
        case 'yesterday':
          const yesterday = subDays(now, 1);
          start = startOfDay(yesterday);
          end = endOfDay(yesterday);
          break;
        case 'week':
          start = startOfWeek(now, { weekStartsOn: 0 });
          end = endOfWeek(now, { weekStartsOn: 0 });
          break;
        case 'last-week':
          const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 0 });
          start = lastWeekStart;
          end = endOfWeek(subDays(now, 7), { weekStartsOn: 0 });
          break;
        case 'month':
          start = startOfMonth(now);
          end = endOfMonth(now);
          break;
        case 'last-month':
          const lastMonth = subDays(startOfMonth(now), 1);
          start = startOfMonth(lastMonth);
          end = endOfMonth(lastMonth);
          break;
        default:
          start = startOfWeek(now, { weekStartsOn: 0 });
          end = endOfWeek(now, { weekStartsOn: 0 });
      }
    }

    return { start, end };
  };

  const fetchAIInsights = async (employeeIds: string[], start: Date, end: Date) => {
    try {
      setLoadingAI(true);
      
      // Fetch AI insights for selected employees
      // Note: data is stored in 'insights' JSONB column
      const { data: insightsData, error } = await supabase
        .from('ai_employee_insights')
        .select('*')
        .in('user_id', employeeIds)
        .gte('period_start', start.toISOString())
        .lte('period_end', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Error fetching AI insights:', error);
        return;
      }

      if (!insightsData || insightsData.length === 0) {
        setAiSummary(null);
        return;
      }

      // Get employee names
      const employeeMap = new Map(employees.map(e => [e.id, e.full_name]));

      // Process AI insights - extract from 'insights' JSONB column
      const processedInsights: AIEmployeeSummary[] = insightsData.map(row => {
        const ins = (row.insights as any) || {};
        return {
          user_id: row.user_id,
          employee_name: employeeMap.get(row.user_id) || 'Unknown',
          productivity_score: ins.productivity_score || 0,
          activity_percentage: ins.activity_percentage || 0,
          risk_level: ins.risk_level || 'low',
          executive_summary: ins.executive_summary
        };
      }).sort((a, b) => b.productivity_score - a.productivity_score);

      // Calculate averages and find top/bottom performers
      const avgProductivity = processedInsights.length > 0
        ? Math.round(processedInsights.reduce((sum, i) => sum + i.productivity_score, 0) / processedInsights.length)
        : 0;

      const topPerformers = processedInsights
        .filter(i => i.productivity_score >= 70)
        .sort((a, b) => b.productivity_score - a.productivity_score)
        .slice(0, 3);

      const needsAttention = processedInsights
        .filter(i => i.risk_level === 'high' || i.productivity_score < 50)
        .sort((a, b) => a.productivity_score - b.productivity_score)
        .slice(0, 3);

      setAiSummary({
        avgProductivity,
        topPerformers,
        needsAttention,
        totalAnalyzed: processedInsights.length
      });
    } catch (error) {
      console.warn('Error fetching AI insights:', error);
      setAiSummary(null);
    } finally {
      setLoadingAI(false);
    }
  };

  const generateBulkReport = async () => {
    console.log('🚀 Generate Bulk Report button clicked!');
    console.log('📊 Selected employees:', selectedEmployees.length);
    console.log('📅 Date range:', dateRange);
    console.log('✅ Include screenshots:', includeScreenshots);
    console.log('✅ Include apps:', includeApps);
    console.log('✅ Include URLs:', includeUrls);

    if (selectedEmployees.length === 0) {
      console.log('❌ No employees selected');
      toast.error('Please select at least one employee');
      return;
    }

    try {
      console.log('🔄 Setting loading state...');
      setLoading(true);
      const { start, end } = getDateRange();
      console.log('📅 Date range calculated:', { start: start.toISOString(), end: end.toISOString() });
      
      // Fetch time logs
      console.log('📊 Fetching time logs for employees:', selectedEmployees);
      const timeLogs = await fetchPaginated<any>(
        supabase
          .from('time_logs')
          .select(`
            id,
            user_id,
            project_id,
            start_time,
            end_time,
            is_idle,
            idle_seconds,
            status,
            projects (name),
            users (full_name, email, role)
          `)
          .in('user_id', selectedEmployees)
          .gte('start_time', start.toISOString())
          .lte('start_time', end.toISOString())
          .order('start_time')
      );
      console.log(`✅ Time logs fetched successfully: ${timeLogs.length} records`);

      // Always fetch screenshots (needed for smart session capping even if not displayed)
      const screenshots = await fetchPaginated<any>(
        supabase
          .from('screenshots')
          .select(includeScreenshots
            ? 'id, user_id, captured_at, activity_percent, focus_percent, users (full_name, email)'
            : 'user_id, captured_at')
          .in('user_id', selectedEmployees)
          .gte('captured_at', start.toISOString())
          .lte('captured_at', end.toISOString())
      );

      // Fetch app logs if requested
      let appLogs: any[] = [];
      if (includeApps) {
        appLogs = await fetchPaginated<any>(
          supabase
            .from('app_logs')
            .select(`
              id,
              user_id,
              app_name,
              window_title,
              timestamp,
              users (full_name, email)
            `)
            .in('user_id', selectedEmployees)
            .gte('timestamp', start.toISOString())
            .lte('timestamp', end.toISOString())
        );
      }

      // Fetch URL logs if requested
      let urlLogs: any[] = [];
      if (includeUrls) {
        urlLogs = await fetchPaginated<any>(
          supabase
            .from('url_logs')
            .select(`
              id,
              user_id,
              url,
              site_url,
              domain,
              title,
              timestamp,
              users (full_name, email)
            `)
            .in('user_id', selectedEmployees)
            .gte('timestamp', start.toISOString())
            .lte('timestamp', end.toISOString())
        );
      }

      // Fetch idle_logs to calculate actual idle time (not just is_idle flag on time_logs)
      const idleLogs = await fetchPaginated<any>(
        supabase
          .from('idle_logs')
          .select('user_id, duration_seconds, idle_start, idle_end')
          .in('user_id', selectedEmployees)
          .lte('idle_start', end.toISOString())
          .or(`idle_end.gte.${start.toISOString()},idle_end.is.null`)
      );

      // Process the data based on groupBy setting
      console.log('🔄 Processing report data...');
      const processedData = processReportData(timeLogs || [], screenshots, appLogs, urlLogs, idleLogs, start, end);
      console.log('📈 Processed data:', {
        reportRecords: processedData.reportData.length,
        summary: processedData.summary
      });
      
      setReportData(processedData.reportData);
      setReportSummary(processedData.summary);

      // Fetch AI insights
      await fetchAIInsights(selectedEmployees, start, end);

      console.log('✅ Report generated successfully!');
      toast.success(`Generated report for ${processedData.reportData.length} records`);
      
      // Auto-scroll to show the generated report results
      setTimeout(() => {
        const reportSection = document.getElementById('bulk-report-results');
        if (reportSection) {
          console.log('📍 Scrolling to bulk report results section...');
          reportSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
        } else {
          console.log('📍 Report section not found, scrolling to bottom...');
          // Fallback: scroll down significantly to show results
          window.scrollTo({ 
            top: Math.max(document.body.scrollHeight * 0.7, window.scrollY + 800), 
            behavior: 'smooth' 
          });
        }
      }, 100); // Reduced delay for faster response
    } catch (error: any) {
      console.error('💥 Error generating bulk report:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      toast.error(error.message || 'Failed to generate report');
    } finally {
      console.log('🏁 Setting loading to false');
      setLoading(false);
    }
  };

  const processReportData = (timeLogs: any[], screenshots: any[], appLogs: any[], urlLogs: any[], idleLogs: any[], start: Date, end: Date) => {
    const employeeData: { [key: string]: { [date: string]: BulkReportData & { screenshot_activity_sum: number; screenshot_activity_count: number } } } = {};
    const days = eachDayOfInterval({ start, end });

    // Initialize data structure
    selectedEmployees.forEach(employeeId => {
      const employee = employees.find(emp => emp.id === employeeId);
      if (!employee) return;

      employeeData[employeeId] = {};
      days.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        employeeData[employeeId][dateKey] = {
          employee_name: employee.full_name || 'Unknown',
          employee_email: employee.email,
          employee_role: employee.role,
          date: dateKey,
          total_hours: 0,
          active_hours: 0,
          idle_hours: 0,
          activity_percentage: 0,
          productivity_score: 0,
          screenshots_count: 0,
          projects_worked: [],
          apps_used: [],
          urls_visited: [],
          screenshot_activity_sum: 0,
          screenshot_activity_count: 0
        };
      });
    });

    // Build per-user sorted screenshot timestamps for smart session capping
    const bulkUserSsTimes: { [userId: string]: number[] } = {};
    screenshots.forEach((ss: any) => {
      if (!ss.user_id) return;
      if (!bulkUserSsTimes[ss.user_id]) bulkUserSsTimes[ss.user_id] = [];
      bulkUserSsTimes[ss.user_id].push(new Date(ss.captured_at).getTime());
    });
    for (const uid of Object.keys(bulkUserSsTimes)) {
      bulkUserSsTimes[uid].sort((a, b) => a - b);
    }

    // Process time logs with merged intervals per user/day (multi-device safe)
    const bulkUserDayIntervals: { [key: string]: TimeInterval[] } = {};
    const bulkUserDayProjects: { [key: string]: string[] } = {};

    timeLogs.forEach(log => {
      if (!log.user_id || !employeeData[log.user_id]) return;
      const logDate = format(new Date(log.start_time), 'yyyy-MM-dd');
      if (!employeeData[log.user_id][logDate]) return;

      const logStartMs = new Date(log.start_time).getTime();
      let logEndMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();

      // Find last screenshot within this session for smart capping
      const ssTimes = bulkUserSsTimes[log.user_id] || [];
      let lastSsMs: number | undefined;
      for (let i = ssTimes.length - 1; i >= 0; i--) {
        if (ssTimes[i] >= logStartMs && ssTimes[i] <= logEndMs) {
          lastSsMs = ssTimes[i];
          break;
        }
      }
      logEndMs = getSmartEndMs(logStartMs, logEndMs, lastSsMs);

      const key = `${log.user_id}|${logDate}`;
      if (!bulkUserDayIntervals[key]) bulkUserDayIntervals[key] = [];
      bulkUserDayIntervals[key].push({ startMs: logStartMs, endMs: logEndMs });

      if (log.projects?.name) {
        if (!bulkUserDayProjects[key]) bulkUserDayProjects[key] = [];
        if (!bulkUserDayProjects[key].includes(log.projects.name)) {
          bulkUserDayProjects[key].push(log.projects.name);
        }
      }
    });

    for (const [key, intervals] of Object.entries(bulkUserDayIntervals)) {
      const [userId, logDate] = key.split('|');
      if (!employeeData[userId]?.[logDate]) continue;

      const merged = mergeTimeIntervals(intervals);
      let dayHours = 0;
      for (const interval of merged) {
        dayHours += Math.min(12, (interval.endMs - interval.startMs) / (1000 * 60 * 60));
      }
      employeeData[userId][logDate].total_hours += dayHours;
      employeeData[userId][logDate].active_hours += dayHours;
      employeeData[userId][logDate].projects_worked.push(...(bulkUserDayProjects[key] || []));
    }

    // Build per-user-per-day idle hours from idle_logs (clamp to range, split by day)
    const idleHoursByUserDay: { [userId: string]: { [dateKey: string]: number } } = {};
    idleLogs.forEach((idleLog: { user_id: string; idle_start: string; idle_end: string | null }) => {
      if (!idleLog.user_id || !idleLog.idle_start) return;
      const idleStart = new Date(idleLog.idle_start);
      const idleEnd = idleLog.idle_end ? new Date(idleLog.idle_end) : end;
      const effectiveStart = idleStart < start ? start : idleStart;
      const effectiveEnd = idleEnd > end ? end : idleEnd;
      if (effectiveStart >= effectiveEnd) return;

      const rangeStartMs = effectiveStart.getTime();
      const rangeEndMs = effectiveEnd.getTime();
      let current = new Date(effectiveStart);
      current.setHours(0, 0, 0, 0);

      while (current.getTime() < rangeEndMs) {
        const dateKey = format(current, 'yyyy-MM-dd');
        const dayEndMs = new Date(current);
        dayEndMs.setHours(23, 59, 59, 999);
        const overlapStart = Math.max(rangeStartMs, current.getTime());
        const overlapEnd = Math.min(rangeEndMs, dayEndMs.getTime());
        const overlapHours = Math.max(0, (overlapEnd - overlapStart) / (1000 * 60 * 60));

        if (overlapHours > 0) {
          if (!idleHoursByUserDay[idleLog.user_id]) idleHoursByUserDay[idleLog.user_id] = {};
          idleHoursByUserDay[idleLog.user_id][dateKey] = (idleHoursByUserDay[idleLog.user_id][dateKey] || 0) + overlapHours;
        }
        current.setDate(current.getDate() + 1);
      }
    });

    // Build per-user-per-day idle_seconds and deducted_seconds from time_logs
    const idleSecsByUserDay: { [userId: string]: { [dateKey: string]: number } } = {};
    const deductedSecsByUserDay: { [userId: string]: { [dateKey: string]: number } } = {};
    timeLogs.forEach(log => {
      if (!log.user_id) return;
      const dateKey = format(new Date(log.start_time), 'yyyy-MM-dd');
      if ((log as any).idle_seconds) {
        if (!idleSecsByUserDay[log.user_id]) idleSecsByUserDay[log.user_id] = {};
        idleSecsByUserDay[log.user_id][dateKey] = (idleSecsByUserDay[log.user_id][dateKey] || 0) + ((log as any).idle_seconds || 0);
      }
      if ((log as any).deducted_seconds) {
        if (!deductedSecsByUserDay[log.user_id]) deductedSecsByUserDay[log.user_id] = {};
        deductedSecsByUserDay[log.user_id][dateKey] = (deductedSecsByUserDay[log.user_id][dateKey] || 0) + ((log as any).deducted_seconds || 0);
      }
    });

    // Subtract deducted time (from screenshot deletions) per user/day
    Object.keys(employeeData).forEach(userId => {
      const userDays = employeeData[userId];
      const userDeducted = deductedSecsByUserDay[userId];
      if (!userDeducted) return;
      Object.keys(userDays).forEach(dateKey => {
        const dayData = userDays[dateKey];
        const deductedHours = (userDeducted[dateKey] || 0) / 3600;
        if (deductedHours > 0) {
          dayData.total_hours = Math.max(0, dayData.total_hours - deductedHours);
          dayData.active_hours = Math.max(0, dayData.active_hours - deductedHours);
        }
      });
    });

    // Record idle hours as informational but do NOT subtract from total/active hours
    // All pages now use raw time_logs duration (end - start) for consistency
    Object.keys(employeeData).forEach(userId => {
      const userDays = employeeData[userId];
      const userIdle = idleHoursByUserDay[userId];
      const userIdleSecs = idleSecsByUserDay[userId];
      Object.keys(userDays).forEach(dateKey => {
        const dayData = userDays[dateKey];
        if (dayData.total_hours <= 0) return;
        const idleLogsHours = userIdle?.[dateKey] ?? 0;
        const idleSecsHours = (userIdleSecs?.[dateKey] ?? 0) / 3600;
        const idleHours = Math.min(idleLogsHours > 0 ? idleLogsHours : idleSecsHours, dayData.total_hours);
        dayData.idle_hours = idleHours;
        // Keep active_hours = total_hours (no idle subtraction)
      });
    });

    // Process screenshots (count and accumulate activity_percent for blending)
    screenshots.forEach(screenshot => {
      if (!screenshot.user_id || !employeeData[screenshot.user_id]) return;

      const screenshotDate = format(new Date(screenshot.captured_at), 'yyyy-MM-dd');
      if (!employeeData[screenshot.user_id][screenshotDate]) return;

      const dayData = employeeData[screenshot.user_id][screenshotDate];
      dayData.screenshots_count++;
      const pct = screenshot.activity_percent;
      if (typeof pct === 'number' && !Number.isNaN(pct)) {
        dayData.screenshot_activity_sum += pct;
        dayData.screenshot_activity_count++;
      }
    });

    // Process app logs
    appLogs.forEach(appLog => {
      if (!appLog.user_id || !employeeData[appLog.user_id]) return;

      const appDate = format(new Date(appLog.timestamp), 'yyyy-MM-dd');
      if (!employeeData[appLog.user_id][appDate]) return;

      if (appLog.app_name && !employeeData[appLog.user_id][appDate].apps_used.includes(appLog.app_name)) {
        employeeData[appLog.user_id][appDate].apps_used.push(appLog.app_name);
      }
    });

    // Process URL logs
    urlLogs.forEach(urlLog => {
      if (!urlLog.user_id || !employeeData[urlLog.user_id]) return;

      const urlDate = format(new Date(urlLog.timestamp), 'yyyy-MM-dd');
      if (!employeeData[urlLog.user_id][urlDate]) return;

      const url = urlLog.site_url || urlLog.domain || urlLog.url;
      if (url && !employeeData[urlLog.user_id][urlDate].urls_visited.includes(url)) {
        employeeData[urlLog.user_id][urlDate].urls_visited.push(url);
      }
    });

    // Calculate activity percentages and productivity scores
    const flattenedData: BulkReportData[] = [];
    let totalHours = 0;
    let totalActivity = 0;
    let totalScreenshots = 0;
    let recordCount = 0;

    Object.values(employeeData).forEach(employeeDays => {
      Object.values(employeeDays).forEach(dayData => {
        if (dayData.total_hours > 0) {
          const timeBasedActivity = (dayData.active_hours / dayData.total_hours) * 100;
          const screenshotAvg = dayData.screenshot_activity_count > 0
            ? dayData.screenshot_activity_sum / dayData.screenshot_activity_count
            : null;
          dayData.activity_percentage = screenshotAvg != null
            ? Math.round((timeBasedActivity + screenshotAvg) / 2)
            : Math.round(timeBasedActivity);

          dayData.productivity_score = Math.round(
            (dayData.activity_percentage * 0.7) +
            (Math.min(dayData.screenshots_count / 10, 1) * 20) +
            (Math.min(dayData.projects_worked.length / 3, 1) * 10)
          );

          totalHours += dayData.total_hours;
          totalActivity += dayData.activity_percentage;
          totalScreenshots += dayData.screenshots_count;
          recordCount++;
        }
        const { screenshot_activity_sum, screenshot_activity_count, ...rest } = dayData;
        flattenedData.push(rest);
      });
    });

    // Find highest performer
    const topPerformer = flattenedData
      .filter(data => data.total_hours > 0)
      .sort((a, b) => b.productivity_score - a.productivity_score)[0];

    const summary: ReportSummary = {
      total_employees: selectedEmployees.length,
      total_hours: Math.round(totalHours * 100) / 100,
      average_activity: recordCount > 0 ? Math.round(totalActivity / recordCount) : 0,
      highest_performer: topPerformer?.employee_name || 'N/A',
      total_screenshots: totalScreenshots,
      date_range: `${format(start, 'MMM dd, yyyy')} - ${format(end, 'MMM dd, yyyy')}`
    };

    return {
      reportData: flattenedData.filter(data => data.total_hours > 0), // Only include days with activity
      summary
    };
  };

  const exportToCSV = () => {
    if (reportData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = [
      'Employee Name',
      'Email',
      'Role',
      'Date',
      'Total Hours',
      'Active Hours',
      'Idle Hours',
      'Activity %',
      'Productivity Score',
      'Screenshots',
      'Projects Worked',
      'Apps Used',
      'URLs Visited'
    ];

    const rows = reportData.map(data => [
      data.employee_name,
      data.employee_email,
      data.employee_role,
      data.date,
      data.total_hours.toFixed(2),
      data.active_hours.toFixed(2),
      data.idle_hours.toFixed(2),
      `${data.activity_percentage}%`,
      data.productivity_score,
      data.screenshots_count,
      data.projects_worked.join('; '),
      data.apps_used.join('; '),
      data.urls_visited.join('; ')
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bulk-employee-report-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('CSV report exported successfully');
  };

  const exportToPDF = () => {
    if (reportData.length === 0) {
      toast.error('No data to export');
      return;
    }

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.width;
    
    // Title
    pdf.setFontSize(20);
    pdf.text('Bulk Employee Report', pageWidth / 2, 20, { align: 'center' });
    
    // Summary
    if (reportSummary) {
      pdf.setFontSize(12);
      pdf.text(`Date Range: ${reportSummary.date_range}`, 20, 35);
      pdf.text(`Total Employees: ${reportSummary.total_employees}`, 20, 45);
      pdf.text(`Total Hours: ${reportSummary.total_hours.toFixed(2)}`, 20, 55);
      pdf.text(`Average Activity: ${reportSummary.average_activity}%`, 120, 45);
      pdf.text(`Highest Performer: ${reportSummary.highest_performer}`, 120, 55);
    }

    // Table data
    const tableData = reportData.map(data => [
      data.employee_name,
      data.date,
      data.total_hours.toFixed(1),
      `${data.activity_percentage}%`,
      data.productivity_score.toString(),
      data.screenshots_count.toString()
    ]);

    // Table
    autoTable(pdf, {
      head: [['Employee', 'Date', 'Hours', 'Activity', 'Score', 'Screenshots']],
      body: tableData,
      startY: 70,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] }
    });

    pdf.save(`bulk-employee-report-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
    toast.success('PDF report exported successfully');
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployees(prev => 
      prev.includes(employeeId) 
        ? prev.filter(id => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const selectAllEmployees = () => {
    setSelectedEmployees(employees.map(emp => emp.id));
  };

  const deselectAllEmployees = () => {
    setSelectedEmployees([]);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Bulk Report Generator
          </h1>
          <p className="text-muted-foreground">Generate comprehensive reports for multiple employees with export options</p>
        </div>
      </div>

      {/* AI Info Panel */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  AI-Enhanced Bulk Reports
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Hugging Face
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">
                  Reports include AI-analyzed productivity scores and activity insights
                </p>
              </div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Bulk reports leverage AI analysis from Hugging Face models to provide accurate productivity scoring, activity classification, and behavioral patterns across all selected employees.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Range Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dateRange">Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="last-week">Last Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Employee Selection */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label>Select Employees</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAllEmployees}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAllEmployees}>
                  Deselect All
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto border rounded-lg p-4">
              {employees.map(employee => (
                <div key={employee.id} className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedEmployees.includes(employee.id)}
                    onCheckedChange={() => toggleEmployeeSelection(employee.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{employee.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{employee.email}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {selectedEmployees.length} of {employees.length} employees selected
            </div>
          </div>

          {/* Report Options */}
          <div>
            <Label className="text-base font-medium">Include in Report</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={includeScreenshots}
                  onCheckedChange={(checked) => setIncludeScreenshots(checked === true)}
                />
                <label className="text-sm font-medium">Screenshots Data</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={includeApps}
                  onCheckedChange={(checked) => setIncludeApps(checked === true)}
                />
                <label className="text-sm font-medium">Applications Used</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={includeUrls}
                  onCheckedChange={(checked) => setIncludeUrls(checked === true)}
                />
                <label className="text-sm font-medium">URLs Visited</label>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button 
              onClick={generateBulkReport} 
              disabled={loading || selectedEmployees.length === 0}
              size="lg"
              className="px-8"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Generate Bulk Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Summary */}
      {reportSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Report Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{reportSummary.total_employees}</div>
                <div className="text-sm text-muted-foreground">Employees</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{reportSummary.total_hours.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Total Hours</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{reportSummary.average_activity}%</div>
                <div className="text-sm text-muted-foreground">Avg Activity</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{reportSummary.total_screenshots}</div>
                <div className="text-sm text-muted-foreground">Screenshots</div>
              </div>
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-lg font-bold text-indigo-600 truncate" title={reportSummary.highest_performer}>
                  {reportSummary.highest_performer}
                </div>
                <div className="text-sm text-muted-foreground">Top Performer</div>
              </div>
            </div>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Report Period: {reportSummary.date_range}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Productivity Summary */}
      {reportSummary && (
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              AI Productivity Summary
              {loadingAI && <RefreshCw className="h-4 w-4 animate-spin ml-2" />}
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 ml-auto">
                <Sparkles className="h-3 w-3 mr-1" />
                Qwen3-32B Analysis
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAI ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading AI insights...
              </div>
            ) : aiSummary ? (
              <div className="space-y-6">
                {/* AI Score Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Avg AI Score</span>
                    </div>
                    <div className="text-3xl font-bold text-purple-600">
                      {aiSummary.avgProductivity}%
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Top Performers</span>
                    </div>
                    <div className="text-3xl font-bold text-green-600">
                      {aiSummary.topPerformers.length}
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-red-50 to-orange-50 rounded-lg border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700">Need Attention</span>
                    </div>
                    <div className="text-3xl font-bold text-red-600">
                      {aiSummary.needsAttention.length}
                    </div>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Analyzed</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">
                      {aiSummary.totalAnalyzed}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Performers */}
                  <div className="p-4 bg-green-50/50 rounded-lg border border-green-200">
                    <h4 className="font-medium mb-3 flex items-center gap-2 text-green-800">
                      <TrendingUp className="h-4 w-4" />
                      Top Performers (AI-Ranked)
                    </h4>
                    {aiSummary.topPerformers.length > 0 ? (
                      <div className="space-y-2">
                        {aiSummary.topPerformers.map((performer, idx) => (
                          <div key={performer.user_id} className="flex items-center justify-between p-2 bg-white rounded border">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                                idx === 1 ? 'bg-gray-300 text-gray-700' :
                                'bg-orange-300 text-orange-900'
                              }`}>
                                {idx + 1}
                              </div>
                              <span className="font-medium">{performer.employee_name}</span>
                            </div>
                            <Badge className="bg-green-100 text-green-700 border-green-300">
                              {performer.productivity_score}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No top performers identified in this period.</p>
                    )}
                  </div>

                  {/* Needs Attention */}
                  <div className="p-4 bg-red-50/50 rounded-lg border border-red-200">
                    <h4 className="font-medium mb-3 flex items-center gap-2 text-red-800">
                      <TrendingDown className="h-4 w-4" />
                      Employees Needing Attention
                    </h4>
                    {aiSummary.needsAttention.length > 0 ? (
                      <div className="space-y-2">
                        {aiSummary.needsAttention.map((employee) => (
                          <div key={employee.user_id} className="flex items-center justify-between p-2 bg-white rounded border">
                            <div className="flex items-center gap-2">
                              <Shield className={`h-4 w-4 ${
                                employee.risk_level === 'high' ? 'text-red-500' : 'text-amber-500'
                              }`} />
                              <span className="font-medium">{employee.employee_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={
                                employee.risk_level === 'high' 
                                  ? 'bg-red-100 text-red-700 border-red-300'
                                  : 'bg-amber-100 text-amber-700 border-amber-300'
                              }>
                                {employee.productivity_score}%
                              </Badge>
                              {employee.risk_level === 'high' && (
                                <Badge variant="destructive" className="text-xs">High Risk</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No employees flagged for attention.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No AI insights available for this period.</p>
                <p className="text-xs mt-1">
                  AI analysis runs automatically when screenshots are captured.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Export Options */}
      {reportData.length > 0 && (
        <Card id="bulk-report-results">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Options
              <Badge variant="default" className="bg-green-500">Results Ready!</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center gap-4">
              <Button onClick={exportToCSV} variant="outline">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={exportToPDF} variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Data Preview */}
      {reportData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Report Data Preview
              <Badge variant="secondary">{reportData.length} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-gray-300 p-2 text-left">Name</th>
                    <th className="border border-gray-300 p-2 text-left">Date</th>
                    <th className="border border-gray-300 p-2 text-center">Total Hours</th>
                    <th className="border border-gray-300 p-2 text-center">Activity %</th>
                    <th className="border border-gray-300 p-2 text-center">Productivity</th>
                    <th className="border border-gray-300 p-2 text-center">Screenshots</th>
                    <th className="border border-gray-300 p-2 text-left">Projects</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.slice(0, 20).map((data, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="border border-gray-300 p-2">
                        <div className="font-medium">{data.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{data.employee_role}</div>
                      </td>
                      <td className="border border-gray-300 p-2">{data.date}</td>
                      <td className="border border-gray-300 p-2 text-center">{data.total_hours.toFixed(1)}h</td>
                      <td className="border border-gray-300 p-2 text-center">
                        <Badge 
                          variant={data.activity_percentage >= 70 ? 'default' : data.activity_percentage >= 40 ? 'secondary' : 'destructive'}
                        >
                          {data.activity_percentage}%
                        </Badge>
                      </td>
                      <td className="border border-gray-300 p-2 text-center">{data.productivity_score}</td>
                      <td className="border border-gray-300 p-2 text-center">{data.screenshots_count}</td>
                      <td className="border border-gray-300 p-2 text-xs">
                        {data.projects_worked.slice(0, 2).join(', ')}
                        {data.projects_worked.length > 2 && ` +${data.projects_worked.length - 2}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length > 20 && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing first 20 of {reportData.length} records. Export to see all data.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 