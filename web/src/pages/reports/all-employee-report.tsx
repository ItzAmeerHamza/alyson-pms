import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { fetchDetailedTimeLogs } from '@/domains/time/services/time-logs.service';
import { fetchScreenshots as fetchScreenshotsApi } from '@/domains/monitoring/services/screenshots.service';
import { fetchIdleLogs } from '@/domains/monitoring/services/idle-logs.service';
import { fetchOrgUsers } from '@/domains/people';
import { useAuth } from "@/providers/auth-provider";
import { 
  Download, 
  Users, 
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Radio
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths, eachDayOfInterval, parseISO } from "date-fns";
import { mergeTimeIntervals, getSmartEndMs, type TimeInterval } from "@/lib/time-utils";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface DailyHours {
  [date: string]: number;
}

interface EmployeeData {
  id: string;
  name: string;
  email: string;
  role: string;
  dailyHours: DailyHours;
  totalHours: number;
  activeHours: number;
  idleHours: number;
  productivity: number; // percentage
  hasScreenshots?: boolean; // Track if user has screenshots
  estimatedHours?: number; // Track estimated hours from screenshots
  hasOngoingSession?: boolean; // Track if user has an active ongoing session
}

interface ReportStats {
  totalEmployees: number;
  totalActiveHours: number;
  totalIdleHours: number;
  averageProductivity: number;
  topPerformer: string;
}

export default function AllEmployeeReport() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeData[]>([]);
  const [dateRange, setDateRange] = useState("week");
  const [dateLabels, setDateLabels] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const { userDetails, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const organizationId = userDetails?.organization_id;

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      if (dateRange === 'custom' && (!customStartDate || !customEndDate)) return;
      loadEmployeeData();
    }
  }, [dateRange, userDetails, organizationId, isSuperAdmin, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (dateRange) {
      case "today":
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 0 });
        end = endOfWeek(now, { weekStartsOn: 0 });
        break;
      case "month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case "last-week": {
        const lastWeekEnd = endOfWeek(subDays(now, 7), { weekStartsOn: 0 });
        start = startOfWeek(subDays(now, 7), { weekStartsOn: 0 });
        end = lastWeekEnd;
        break;
      }
      case "last-month": {
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      }
      case "custom":
        if (customStartDate && customEndDate) {
          start = startOfDay(customStartDate);
          end = endOfDay(customEndDate);
        } else {
          start = startOfWeek(now, { weekStartsOn: 0 });
          end = endOfWeek(now, { weekStartsOn: 0 });
        }
        break;
      default:
        start = startOfWeek(now, { weekStartsOn: 0 });
        end = endOfWeek(now, { weekStartsOn: 0 });
    }

    return { start, end };
  };

  const loadEmployeeData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { start, end } = getDateRange();
      setStartDate(start);
      setEndDate(end);

      // Generate date labels for table headers
      const days = eachDayOfInterval({ start, end });
      const labels = days.map(day => format(day, 'EEE\nM/d'));
      setDateLabels(labels);

      const usersData = await fetchOrgUsers(
        { organizationId, isSuperAdmin },
        { roles: ['employee', 'admin', 'manager'] },
      );

      if (!usersData || usersData.length === 0) {
        setEmployees([]);
        setStats(null);
        return;
      }

      // Pre-compute org user IDs so we can scope all high-volume queries to this org
      const orgUserIds = usersData.map(u => u.id);

      const [timeLogsData, screenshotsData, idleLogsData] = await Promise.all([
        fetchDetailedTimeLogs(start, end, { organizationId, isSuperAdmin }, { limit: 10000 }),
        fetchScreenshotsApi(
          { organizationId, isSuperAdmin, orgUserIds },
          { start, end, limit: 10000 },
        ),
        fetchIdleLogs(start, end, { organizationId, isSuperAdmin }),
      ]);

      const scopedTimeLogs = timeLogsData.filter((log) => orgUserIds.includes(log.user_id));
      const scopedScreenshots = screenshotsData.filter((s) => orgUserIds.includes(s.user_id));
      const scopedIdleLogs = idleLogsData.filter((log) => orgUserIds.includes(log.user_id));

      // Build a map of total idle hours per user from idle_logs
      // Step 1: Group idle periods by user and clamp to reporting range
      const userIdlePeriods: { [userId: string]: Array<{ start: Date; end: Date }> } = {};
      scopedIdleLogs.forEach(idleLog => {
        if (!idleLog.user_id || !idleLog.idle_start) return;
        
        // Calculate the actual overlap between idle period and reporting range
        const idleStart = new Date(idleLog.idle_start);
        const idleEnd = idleLog.idle_end ? new Date(idleLog.idle_end) : end; // Use range end if ongoing
        
        // Clamp to reporting range
        const effectiveStart = idleStart < start ? start : idleStart;
        const effectiveEnd = idleEnd > end ? end : idleEnd;
        
        // Only include if there's actual overlap
        if (effectiveStart < effectiveEnd) {
          if (!userIdlePeriods[idleLog.user_id]) {
            userIdlePeriods[idleLog.user_id] = [];
          }
          userIdlePeriods[idleLog.user_id].push({ start: effectiveStart, end: effectiveEnd });
        }
      });

      // Step 2: Merge overlapping periods and calculate total idle hours per user
      const userIdleHoursMap: { [userId: string]: number } = {};
      Object.entries(userIdlePeriods).forEach(([userId, periods]) => {
        if (periods.length === 0) return;
        
        // Sort by start time
        periods.sort((a, b) => a.start.getTime() - b.start.getTime());
        
        // Merge overlapping periods
        const merged: Array<{ start: Date; end: Date }> = [];
        let current = periods[0];
        
        for (let i = 1; i < periods.length; i++) {
          const next = periods[i];
          if (next.start <= current.end) {
            // Overlapping or adjacent - extend current period
            current = { start: current.start, end: new Date(Math.max(current.end.getTime(), next.end.getTime())) };
          } else {
            // No overlap - save current and start new
            merged.push(current);
            current = next;
          }
        }
        merged.push(current);
        
        // Sum merged period durations
        const totalMs = merged.reduce((sum, period) => sum + (period.end.getTime() - period.start.getTime()), 0);
        userIdleHoursMap[userId] = totalMs / (1000 * 60 * 60);
      });

      // Process data to create employee daily hours with productivity metrics
      const employeeMap: { [userId: string]: EmployeeData } = {};

      // Initialize all employees
      (usersData || []).forEach(user => {
        const dailyHours: DailyHours = {};
        days.forEach(day => {
          dailyHours[format(day, 'yyyy-MM-dd')] = 0;
        });

        employeeMap[user.id] = {
          id: user.id,
          name: user.full_name || 'Unknown',
          email: user.email,
          role: user.role,
          dailyHours,
          totalHours: 0,
          activeHours: 0,
          idleHours: 0,
          productivity: 0,
          hasScreenshots: false,  // Track if user has screenshots
          estimatedHours: 0,      // Track estimated hours from screenshots
          hasOngoingSession: false // Track if user has an active ongoing session
        };
      });

      // Process time logs with merged intervals per user per day (multi-device safe)
      const sortedLogs = [...scopedTimeLogs].sort((a, b) => {
        const aStart = new Date(a.start_time).getTime();
        const bStart = new Date(b.start_time).getTime();
        return bStart - aStart;
      });
      
      const mostRecentSessionPerUser: { [userId: string]: string } = {};
      sortedLogs.forEach(log => {
        if (log.user_id && !mostRecentSessionPerUser[log.user_id]) {
          mostRecentSessionPerUser[log.user_id] = log.id;
        }
      });

      const now = new Date();

      // Build per-user sorted screenshot timestamps for smart session capping
      const userScreenshotTimes: { [userId: string]: number[] } = {};
      scopedScreenshots.forEach((ss: any) => {
        if (!ss.user_id) return;
        if (!userScreenshotTimes[ss.user_id]) userScreenshotTimes[ss.user_id] = [];
        userScreenshotTimes[ss.user_id].push(new Date(ss.captured_at).getTime());
      });
      for (const uid of Object.keys(userScreenshotTimes)) {
        userScreenshotTimes[uid].sort((a, b) => a - b);
      }

      // Group intervals by user+day for merging
      const userDayIntervals: { [key: string]: TimeInterval[] } = {};
      const userOngoing: { [userId: string]: boolean } = {};

      scopedTimeLogs.forEach(log => {
        if (!log.user_id || !employeeMap[log.user_id]) return;

        const logDate = format(new Date(log.start_time), 'yyyy-MM-dd');
        const sessionStart = new Date(log.start_time);
        let sessionEnd: Date;
        let isOngoingSession = false;

        if (log.end_time) {
          sessionEnd = new Date(log.end_time);
        } else if (log.id === mostRecentSessionPerUser[log.user_id]) {
          sessionEnd = now;
          isOngoingSession = true;
        } else {
          return;
        }

        if (isOngoingSession) userOngoing[log.user_id] = true;

        const startMs = sessionStart.getTime();
        let endMs = sessionEnd.getTime();

        // Find last screenshot within this session for smart capping
        const ssTimes = userScreenshotTimes[log.user_id] || [];
        let lastSsMs: number | undefined;
        for (let i = ssTimes.length - 1; i >= 0; i--) {
          if (ssTimes[i] >= startMs && ssTimes[i] <= endMs) {
            lastSsMs = ssTimes[i];
            break;
          }
        }
        endMs = getSmartEndMs(startMs, endMs, lastSsMs);

        const key = `${log.user_id}|${logDate}`;
        if (!userDayIntervals[key]) userDayIntervals[key] = [];
        userDayIntervals[key].push({ startMs, endMs });
      });

      // Merge and aggregate per user per day
      for (const [key, intervals] of Object.entries(userDayIntervals)) {
        const [userId, logDate] = key.split('|');
        if (!employeeMap[userId] || employeeMap[userId].dailyHours[logDate] === undefined) continue;

        const merged = mergeTimeIntervals(intervals);
        let dayHours = 0;
        for (const interval of merged) {
          const hours = (interval.endMs - interval.startMs) / (1000 * 60 * 60);
          dayHours += hours;
        }

        employeeMap[userId].dailyHours[logDate] += dayHours;
        employeeMap[userId].totalHours += dayHours;
        employeeMap[userId].activeHours += dayHours;

        if (userOngoing[userId]) {
          employeeMap[userId].hasOngoingSession = true;
        }
      }

      // Process screenshots to mark users who have activity even without time logs
      // Note: This must run BEFORE applying idle logs so that users with estimated hours
      // from screenshots also have their idle time properly applied
      scopedScreenshots.forEach(screenshot => {
        if (!screenshot.user_id || !employeeMap[screenshot.user_id]) return;

        employeeMap[screenshot.user_id].hasScreenshots = true;
        
        // If user has no time logs but has screenshots, estimate some hours based on screenshots
        if (employeeMap[screenshot.user_id].totalHours === 0) {
          const screenshotDate = format(new Date(screenshot.captured_at), 'yyyy-MM-dd');
          if (employeeMap[screenshot.user_id].dailyHours[screenshotDate] !== undefined) {
            // Estimate 0.3 hours per screenshot for users with no time logs
            const estimatedHours = 0.3;
            employeeMap[screenshot.user_id].dailyHours[screenshotDate] += estimatedHours;
            employeeMap[screenshot.user_id].totalHours += estimatedHours;
            employeeMap[screenshot.user_id].estimatedHours = (employeeMap[screenshot.user_id].estimatedHours || 0) + estimatedHours;
            employeeMap[screenshot.user_id].activeHours += estimatedHours;
          }
        }
      });

      // Build a map of total idle_seconds per user from time_logs (fallback when idle_logs missing)
      const userIdleSecondsMap: { [userId: string]: number } = {};
      const userDeductedSecondsMap: { [userId: string]: number } = {};
      scopedTimeLogs.forEach(log => {
        if (!log.user_id) return;
        if ((log as any).idle_seconds) {
          userIdleSecondsMap[log.user_id] = (userIdleSecondsMap[log.user_id] || 0) + ((log as any).idle_seconds || 0);
        }
        if ((log as any).deducted_seconds) {
          userDeductedSecondsMap[log.user_id] = (userDeductedSecondsMap[log.user_id] || 0) + ((log as any).deducted_seconds || 0);
        }
      });

      // Subtract deducted time (from screenshot deletions) per user
      Object.keys(employeeMap).forEach(userId => {
        const deductedHours = (userDeductedSecondsMap[userId] || 0) / 3600;
        if (deductedHours > 0 && employeeMap[userId].totalHours > 0) {
          employeeMap[userId].totalHours = Math.max(0, employeeMap[userId].totalHours - deductedHours);
          employeeMap[userId].activeHours = Math.max(0, employeeMap[userId].activeHours - deductedHours);
        }
      });

      // Record idle time as informational but do NOT subtract from totalHours/activeHours
      // All pages now use raw time_logs duration (end - start) for consistency
      Object.keys(employeeMap).forEach(userId => {
        const idleLogsHours = userIdleHoursMap[userId] || 0;
        const idleSecondsHours = (userIdleSecondsMap[userId] || 0) / 3600;
        const actualIdleHours = idleLogsHours > 0 ? idleLogsHours : idleSecondsHours;
        if (actualIdleHours > 0 && employeeMap[userId].totalHours > 0) {
          const cappedIdleHours = Math.min(actualIdleHours, employeeMap[userId].totalHours);
          employeeMap[userId].idleHours = cappedIdleHours;
          // Keep activeHours = totalHours (no idle subtraction)
        }
      });

      // Calculate productivity percentages
      Object.values(employeeMap).forEach(employee => {
        if (employee.totalHours > 0) {
          employee.productivity = Math.round((employee.activeHours / employee.totalHours) * 100);
        }
      });

      // Convert to array and sort by total hours
      // Show ALL organization members, even those without activity data
      const employeeArray = Object.values(employeeMap)
        .sort((a, b) => b.totalHours - a.totalHours);

      setEmployees(employeeArray);

      // Calculate overall statistics
      const totalEmployees = employeeArray.length;
      const totalActiveHours = employeeArray.reduce((sum, emp) => sum + emp.activeHours, 0);
      const totalIdleHours = employeeArray.reduce((sum, emp) => sum + emp.idleHours, 0);
      const averageProductivity = totalEmployees > 0 
        ? Math.round(employeeArray.reduce((sum, emp) => sum + emp.productivity, 0) / totalEmployees)
        : 0;
      const topPerformer = employeeArray.length > 0 ? employeeArray[0].name : 'None';

      setStats({
        totalEmployees,
        totalActiveHours,
        totalIdleHours,
        averageProductivity,
        topPerformer
      });

    } catch (error: any) {
      console.error('Error loading employee data:', error);
      setError(error.message || 'An unexpected error occurred');
      toast({
        title: "Error loading report",
        description: error.message || 'Failed to load employee data',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number): string => {
    if (hours === 0) return "0:00:00";
    const totalSeconds = Math.floor(hours * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const exportToCSV = () => {
    if (employees.length === 0) {
      toast({
        title: "No data to export",
        description: "Please ensure there is employee data to export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'Member', 
      ...dateLabels.map(label => label.replace('\n', ' ')), 
      'Total Hours',
      'Idle Time',
      'Total w/o Idle',
      'Productivity %'
    ];
    
    const rows = employees.map(emp => [
      emp.name,
      ...dateLabels.map((_, index) => {
        const dateKey = format(eachDayOfInterval({ start: startDate, end: endDate })[index], 'yyyy-MM-dd');
        return formatHours(emp.dailyHours[dateKey] || 0);
      }),
      formatHours(emp.totalHours),
      formatHours(emp.idleHours),
      formatHours(emp.activeHours),
      `${emp.productivity}%`
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-employee-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Employee report has been downloaded",
    });
  };

  const getTotalHoursForDay = (dayIndex: number): number => {
    const dateKey = format(eachDayOfInterval({ start: startDate, end: endDate })[dayIndex], 'yyyy-MM-dd');
    return employees.reduce((total, emp) => total + (emp.dailyHours[dateKey] || 0), 0);
  };

  const getGrandTotal = (): number => {
    return employees.reduce((total, emp) => total + emp.totalHours, 0);
  };

  const getProductivityColor = (productivity: number): string => {
    if (productivity >= 80) return 'text-green-600 bg-green-100';
    if (productivity >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="container py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
            <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <PageHeader
        title="All Employee Report"
        subtitle="Daily hours breakdown and productivity metrics for all employees"
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={(value) => {
            setDateRange(value);
            if (value === 'custom') {
              setCustomPickerOpen(true);
            }
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="last-week">Last Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Dates</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {customStartDate && customEndDate
                    ? `${format(customStartDate, 'MMM d')} - ${format(customEndDate, 'MMM d, yyyy')}`
                    : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="start">
                <div className="flex gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Start Date</Label>
                    <CalendarPicker
                      mode="single"
                      selected={customStartDate}
                      onSelect={(date) => {
                        setCustomStartDate(date);
                        if (date && customEndDate && date > customEndDate) {
                          setCustomEndDate(undefined);
                        }
                      }}
                      initialFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">End Date</Label>
                    <CalendarPicker
                      mode="single"
                      selected={customEndDate}
                      onSelect={(date) => {
                        setCustomEndDate(date);
                        if (date && customStartDate) {
                          setCustomPickerOpen(false);
                        }
                      }}
                      disabled={(date) => customStartDate ? date < customStartDate : false}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          <Badge variant="outline" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
          </Badge>

          {stats && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {stats.averageProductivity}% Avg Productivity
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadEmployeeData}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            onClick={exportToCSV}
            disabled={loading || employees.length === 0}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Error:</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Employee Hours Summary {loading ? '' : `(${employees.length} users)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading employee data...
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No employee data found for the selected period.</p>
              <div className="text-sm mt-2">Try selecting a different date range or ensure users have logged time.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium bg-muted/30">Member</th>
                    {dateLabels.map((label, index) => (
                      <th key={index} className="text-center p-2 font-medium bg-muted/30 min-w-[80px]">
                        <div className="whitespace-pre-line text-xs">
                          {label}
                        </div>
                      </th>
                    ))}
                    <th className="text-center p-3 font-medium bg-muted/30">Total</th>
                    <th className="text-center p-3 font-medium bg-muted/30">Idle Time</th>
                    <th className="text-center p-3 font-medium bg-muted/30">Total w/o Idle</th>
                    <th className="text-center p-3 font-medium bg-muted/30">Productivity</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, empIndex) => (
                    <tr key={employee.id} className={empIndex % 2 === 0 ? 'bg-muted/10' : ''}>
                      <td className="p-3 font-medium">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {employee.name}
                            <Badge variant="outline" className="text-xs capitalize">
                              {employee.role}
                            </Badge>
                            {employee.hasOngoingSession && (
                              <Badge className="text-xs bg-green-500 hover:bg-green-600 text-white animate-pulse">
                                <Radio className="h-3 w-3 mr-1" />
                                Live
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{employee.email}</div>
                          {employee.estimatedHours && employee.estimatedHours > 0 && (
                            <div className="text-xs text-orange-600 mt-1">
                              📸 Estimated from screenshots
                            </div>
                          )}
                        </div>
                      </td>
                      {dateLabels.map((_, dayIndex) => {
                        const dateKey = format(eachDayOfInterval({ start: startDate, end: endDate })[dayIndex], 'yyyy-MM-dd');
                        const hours = employee.dailyHours[dateKey] || 0;
                        return (
                          <td key={dayIndex} className="text-center p-2 text-sm">
                            <span className={hours > 0 ? 'font-medium' : 'text-muted-foreground'}>
                              {formatHours(hours)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="text-center p-3 font-bold text-primary">
                        {formatHours(employee.totalHours)}
                      </td>
                      <td className="text-center p-3 font-medium text-orange-600">
                        {formatHours(employee.idleHours)}
                      </td>
                      <td className="text-center p-3 font-bold text-green-600">
                        {formatHours(employee.activeHours)}
                      </td>
                      <td className="text-center p-3">
                        <Badge 
                          variant="secondary" 
                          className={getProductivityColor(employee.productivity)}
                        >
                          {employee.productivity}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  
                  {/* Totals Row */}
                  <tr className="border-t-2 bg-muted/20 font-bold">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4" />
                        TOTALS
                      </div>
                    </td>
                    {dateLabels.map((_, dayIndex) => (
                      <td key={dayIndex} className="text-center p-2 font-bold text-primary">
                        {formatHours(getTotalHoursForDay(dayIndex))}
                      </td>
                    ))}
                    <td className="text-center p-3 font-bold text-primary text-lg">
                      {formatHours(getGrandTotal())}
                    </td>
                    <td className="text-center p-3 font-bold text-orange-600 text-lg">
                      {formatHours(stats?.totalIdleHours || 0)}
                    </td>
                    <td className="text-center p-3 font-bold text-green-600 text-lg">
                      {formatHours(stats?.totalActiveHours || 0)}
                    </td>
                    <td className="text-center p-3">
                      <Badge variant="outline" className="font-bold">
                        {stats?.averageProductivity || 0}%
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enhanced Summary Cards */}
      {!loading && employees.length > 0 && stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalEmployees}</div>
              <div className="text-sm text-muted-foreground">Active Employees</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{formatHours(stats.totalActiveHours)}</div>
              <div className="text-sm text-muted-foreground">Total Active Hours</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{formatHours(stats.totalIdleHours)}</div>
              <div className="text-sm text-muted-foreground">Total Idle Hours</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.averageProductivity}%</div>
              <div className="text-sm text-muted-foreground">Avg Productivity</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-lg font-bold text-primary truncate" title={stats.topPerformer}>
                {stats.topPerformer}
              </div>
              <div className="text-sm text-muted-foreground">Top Performer</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}