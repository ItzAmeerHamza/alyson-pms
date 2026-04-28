import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaginated } from '@/lib/supabase-utils';
import { calculateSmartSessionSeconds } from '@/lib/time-utils';
import { useAuth } from "@/providers/auth-provider";
import { ManualHoursModal } from "@/components/ManualHoursModal";
import {
  Download,
  User,
  Calendar,
  Clock,
  RefreshCw,
  Activity,
  Pause,
  Play,
  Plus,
  Target,
  Brain,
  Sparkles,
  Info,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Shield,
  Eye
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface TimeSession {
  id: string;
  project: string;
  start_time: string;
  end_time: string | null;
  duration: number; // in seconds
  status: 'Active' | 'Idle';
  date: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface SessionSummary {
  totalSessions: number;
  totalHours: number;
  activeHours: number;
  idleHours: number;
  activityRate: number;
}

interface AIInsight {
  id: string;
  productivity_score: number;
  activity_percentage: number;
  risk_level: 'low' | 'medium' | 'high';
  screenshots_analyzed: number;
  total_hours: number;
  ai_insights: {
    executive_summary?: string;
    work_description?: string;
    key_observations?: string[];
  };
  productivity_indicators?: {
    focus_time?: number;
    productive_apps?: string[];
    productivity_trend?: string;
  };
  distraction_indicators?: {
    distraction_score?: number;
    social_media_time?: number;
    top_distractions?: string[];
  };
  behavioral_patterns?: {
    peak_hours?: string[];
    work_style?: string;
    consistency_score?: number;
  };
}

export default function IndividualEmployeeReport() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [dateRange, setDateRange] = useState("week");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [summary, setSummary] = useState<SessionSummary>({
    totalSessions: 0,
    totalHours: 0,
    activeHours: 0,
    idleHours: 0,
    activityRate: 0
  });
  const [aiInsights, setAiInsights] = useState<AIInsight | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [manualHoursModalOpen, setManualHoursModalOpen] = useState(false);
  const [manualEntries, setManualEntries] = useState<Array<{
    id: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    total_minutes: number;
    reason: string;
    project: string | null;
    task: string | null;
  }>>([]);
  const { userDetails, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const organizationId = userDetails?.organization_id;

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      loadEmployees();
    }
  }, [userDetails, organizationId, isSuperAdmin]);

  useEffect(() => {
    if (selectedEmployee && userDetails?.role === 'admin') {
      if (dateRange === 'custom' && (!customStartDate || !customEndDate)) return;
      loadEmployeeReport();
      loadAIInsights();
    }
  }, [selectedEmployee, dateRange, userDetails, customStartDate, customEndDate]);

  const loadAIInsights = async () => {
    if (!selectedEmployee) return;
    
    try {
      setLoadingAI(true);
      
      const { start, end } = getDateRange();
      
      // Fetch AI insights from ai_employee_insights table
      // Note: Data is stored in 'insights' JSONB column, columns are:
      // analysis_type, period_start, period_end, insights (jsonb), created_at
      const { data, error } = await supabase
        .from('ai_employee_insights')
        .select('*')
        .eq('user_id', selectedEmployee)
        .gte('period_start', start.toISOString())
        .lte('period_end', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.warn('AI insights query error:', error);
      }
      
      if (data) {
        // Transform data: extract from 'insights' JSONB column
        const insights = (data.insights || {}) as Record<string, any>;
        const transformed: AIInsight = {
          id: data.id,
          productivity_score: insights.productivity_score || 0,
          activity_percentage: insights.activity_percentage || 0,
          risk_level: insights.risk_level || 'low',
          screenshots_analyzed: insights.screenshots_analyzed || 0,
          total_hours: insights.total_hours || 0,
          ai_insights: {
            executive_summary: insights.executive_summary,
            work_description: insights.work_description,
            key_observations: insights.key_observations || []
          },
          productivity_indicators: insights.productivity_indicators,
          distraction_indicators: insights.distraction_indicators,
          behavioral_patterns: insights.behavioral_patterns
        };
        setAiInsights(transformed);
      } else {
        setAiInsights(null);
      }
    } catch (error) {
      console.warn('Error loading AI insights:', error);
      setAiInsights(null);
    } finally {
      setLoadingAI(false);
    }
  };

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

  const loadEmployees = async () => {
    try {
      let query = supabase
        .from('users')
        .select('id, full_name, email, role')
        .in('role', ['employee', 'admin', 'manager']);
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order('full_name');

      if (error) throw error;

      const employeeList = (data || []).map(emp => ({
        id: emp.id,
        name: emp.full_name || 'Unknown',
        email: emp.email,
        role: emp.role
      }));

      setEmployees(employeeList);

      // Auto-select first employee if none selected
      if (employeeList.length > 0 && !selectedEmployee) {
        setSelectedEmployee(employeeList[0].id);
      }

    } catch (error: any) {
      console.error('Error loading employees:', error);
      toast({
        title: "Error loading employees",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadEmployeeReport = async () => {
    if (!selectedEmployee) return;

    try {
      setLoading(true);
      
      const { start, end } = getDateRange();
      setStartDate(start);
      setEndDate(end);

      // Get time logs for the selected employee (paginated to bypass PostgREST row cap)
      const timeLogsData = await fetchPaginated<any>(
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
            projects (
              name
            )
          `)
          .eq('user_id', selectedEmployee)
          .gte('start_time', start.toISOString())
          .lte('start_time', end.toISOString())
          .order('start_time', { ascending: false })
      );

      // Also get screenshots for users who might not have time logs
      const screenshotsData = await fetchPaginated<any>(
        supabase
          .from('screenshots')
          .select('id, captured_at, activity_percent, app_name, window_title')
          .eq('user_id', selectedEmployee)
          .gte('captured_at', start.toISOString())
          .lte('captured_at', end.toISOString())
          .order('captured_at', { ascending: false })
      );

      // Fetch idle_logs to compute per-session idle time
      const idleLogsData = await fetchPaginated<any>(
        supabase
          .from('idle_logs')
          .select('user_id, idle_start, idle_end, duration_seconds')
          .eq('user_id', selectedEmployee)
          .gte('idle_start', start.toISOString())
          .lte('idle_start', end.toISOString())
      );

      // Build a map of last screenshot time per session time range
      const screenshotTimes = (screenshotsData || []).map((s: any) => new Date(s.captured_at).getTime()).sort((a: number, b: number) => a - b);

      const sessionData: TimeSession[] = (timeLogsData || []).map(log => {
        const logStartMs = new Date(log.start_time).getTime();
        const logEndMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();

        // Find last screenshot within this session's range
        let lastSsTime: string | undefined;
        for (let i = screenshotTimes.length - 1; i >= 0; i--) {
          if (screenshotTimes[i] >= logStartMs && screenshotTimes[i] <= logEndMs) {
            lastSsTime = new Date(screenshotTimes[i]).toISOString();
            break;
          }
        }

        const durationSeconds = calculateSmartSessionSeconds(log.start_time, log.end_time, lastSsTime);

        return {
          id: log.id,
          project: log.projects?.name || 'Default Project',
          start_time: log.start_time,
          end_time: log.end_time,
          duration: durationSeconds,
          status: log.is_idle ? 'Idle' : 'Active',
          date: format(new Date(log.start_time), 'yyyy-MM-dd')
        };
      });

      // If no time logs but has screenshots, create sessions from screenshots
      if (sessionData.length === 0 && screenshotsData && screenshotsData.length > 0) {
        console.log(`Creating sessions from ${screenshotsData.length} screenshots for user with no time logs`);
        
        // Group screenshots by day to create daily sessions
        const dayGroups: { [date: string]: any[] } = {};
        screenshotsData.forEach(screenshot => {
          const day = format(new Date(screenshot.captured_at), 'yyyy-MM-dd');
          if (!dayGroups[day]) {
            dayGroups[day] = [];
          }
          dayGroups[day].push(screenshot);
        });

        // Create sessions from screenshot groups
        const screenshotSessions: TimeSession[] = Object.entries(dayGroups).map(([date, screenshots], index) => {
          const firstScreenshot = screenshots[screenshots.length - 1]; // oldest first
          const lastScreenshot = screenshots[0]; // newest first
          
          const sessionStart = new Date(firstScreenshot.captured_at);
          sessionStart.setMinutes(sessionStart.getMinutes() - 30); // Start 30 min before first screenshot
          
          const sessionEnd = new Date(lastScreenshot.captured_at);
          sessionEnd.setMinutes(sessionEnd.getMinutes() + 30); // End 30 min after last screenshot
          
          const durationSeconds = Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / 1000);
          const avgActivity = screenshots.reduce((sum, s) => sum + (s.activity_percent || 0), 0) / screenshots.length;
          
          return {
            id: `screenshot-session-${index}`,
            project: 'Activity from Screenshots',
            start_time: sessionStart.toISOString(),
            end_time: sessionEnd.toISOString(),
            duration: durationSeconds,
            status: avgActivity >= 50 ? 'Active' : 'Idle',
            date: date
          };
        });

        sessionData.push(...screenshotSessions);
      }

      // Fetch manual hours for this employee and date range
      const { data: manualData } = await (supabase
        .from('manual_hours' as any)
        .select('id, date, start_time, end_time, total_minutes, reason, project, task')
        .eq('employee_id', selectedEmployee)
        .eq('is_deleted', false)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'))
        .order('date', { ascending: false }) as any);

      const manualRows = (manualData || []) as Array<{
        id: string;
        date: string;
        start_time: string | null;
        end_time: string | null;
        total_minutes: number;
        reason: string;
        project: string | null;
        task: string | null;
      }>;
      setManualEntries(manualRows);

      // Convert manual entries to sessions for display
      const manualSessions: TimeSession[] = manualRows.map(entry => {
        const entryDate = new Date(entry.date + 'T00:00:00');
        const startTimeStr = entry.start_time
          ? new Date(entry.date + 'T' + entry.start_time).toISOString()
          : entryDate.toISOString();
        const endTimeStr = entry.end_time
          ? new Date(entry.date + 'T' + entry.end_time).toISOString()
          : null;

        return {
          id: `manual-${entry.id}`,
          project: entry.project || entry.reason,
          start_time: startTimeStr,
          end_time: endTimeStr,
          duration: entry.total_minutes * 60,
          status: 'Active' as const,
          date: entry.date,
        };
      });

      const allSessions = [...sessionData, ...manualSessions];
      setSessions(allSessions);

      // Calculate summary
      const totalSessions = allSessions.length;
      const totalSeconds = allSessions.reduce((sum, session) => sum + session.duration, 0);
      const activeSeconds = allSessions
        .filter(session => session.status === 'Active')
        .reduce((sum, session) => sum + session.duration, 0);
      const idleSeconds = totalSeconds - activeSeconds;
      
      const totalHours = totalSeconds / 3600;
      const activeHours = activeSeconds / 3600;
      const idleHours = idleSeconds / 3600;
      const activityRate = totalHours > 0 ? (activeHours / totalHours) * 100 : 0;

      setSummary({
        totalSessions,
        totalHours,
        activeHours,
        idleHours,
        activityRate
      });

    } catch (error: any) {
      console.error('Error loading employee report:', error);
      toast({
        title: "Error loading report",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatTime = (timeString: string): string => {
    return format(new Date(timeString), 'M/d/yyyy h:mm a');
  };

  const exportToCSV = () => {
    const selectedEmp = employees.find(emp => emp.id === selectedEmployee);
    if (!selectedEmp) return;

    const headers = ['User', 'Email', 'Project', 'Start Time', 'End Time', 'Duration', 'Status'];
    const rows = sessions.map(session => [
      selectedEmp.name,
      selectedEmp.email,
      session.project,
      formatTime(session.start_time),
      session.end_time ? formatTime(session.end_time) : 'Ongoing',
      formatDuration(session.duration),
      session.status
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedEmp.name.replace(/\s+/g, '-')}-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="container py-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  const selectedEmployeeData = employees.find(emp => emp.id === selectedEmployee);

  return (
    <div className="container py-6">
      <PageHeader
        title="Individual Employee Report"
        subtitle="Detailed session data for a specific employee"
      />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <EmployeeFilterCombobox
            value={selectedEmployee}
            onValueChange={setSelectedEmployee}
            users={employees}
            placeholder="Select employee"
            includeAllOption={false}
            className="w-[250px]"
          />

          <Select value={dateRange} onValueChange={(value) => {
            setDateRange(value);
            if (value === 'custom') setCustomPickerOpen(true);
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
                    <CalendarPicker mode="single" selected={customStartDate} onSelect={(date) => { setCustomStartDate(date); if (date && customEndDate && date > customEndDate) setCustomEndDate(undefined); }} initialFocus />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">End Date</Label>
                    <CalendarPicker mode="single" selected={customEndDate} onSelect={(date) => { setCustomEndDate(date); if (date && customStartDate) setCustomPickerOpen(false); }} disabled={(date) => customStartDate ? date < customStartDate : false} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
          
          <Badge variant="outline" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setManualHoursModalOpen(true)}
            disabled={!selectedEmployee}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Manual Hours
          </Button>

          <Button
            onClick={loadEmployeeReport}
            disabled={loading || !selectedEmployee}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            onClick={exportToCSV}
            disabled={loading || sessions.length === 0 || !selectedEmployee}
            variant="outline"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* AI Info Panel */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50/50 to-indigo-50/50 mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Brain className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  AI-Enhanced Reports
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Hugging Face
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">
                  Reports include AI-analyzed productivity insights using Qwen3-32B
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
                    Employee reports are enhanced with AI analysis from Hugging Face models (Qwen3-32B for text, Qwen2.5-VL-7B for screenshots) to provide productivity scores, activity classification, and behavioral insights.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* AI Productivity Insights Section */}
      {selectedEmployee && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              AI Productivity Insights
              {loadingAI && <RefreshCw className="h-4 w-4 animate-spin ml-2" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingAI ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading AI insights...
              </div>
            ) : aiInsights ? (
              <div className="space-y-6">
                {/* AI Score Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Productivity Score</span>
                    </div>
                    <div className="text-3xl font-bold text-purple-600">
                      {aiInsights.productivity_score || 0}%
                    </div>
                    <div className="flex items-center mt-1 text-xs text-muted-foreground">
                      {(aiInsights.productivity_indicators?.productivity_trend === 'up' || (aiInsights.productivity_score || 0) >= 70) ? (
                        <><TrendingUp className="h-3 w-3 mr-1 text-green-500" /> Trending Up</>
                      ) : (aiInsights.productivity_indicators?.productivity_trend === 'down' || (aiInsights.productivity_score || 0) < 50) ? (
                        <><TrendingDown className="h-3 w-3 mr-1 text-red-500" /> Needs Improvement</>
                      ) : (
                        <><Minus className="h-3 w-3 mr-1 text-gray-500" /> Stable</>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Activity Level</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">
                      {aiInsights.activity_percentage || 0}%
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {aiInsights.screenshots_analyzed || 0} screenshots analyzed
                    </div>
                  </div>

                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Focus Time</span>
                    </div>
                    <div className="text-3xl font-bold text-green-600">
                      {aiInsights.productivity_indicators?.focus_time 
                        ? `${Math.round(aiInsights.productivity_indicators.focus_time)}h`
                        : `${aiInsights.total_hours || 0}h`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      High concentration periods
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg border ${
                    aiInsights.risk_level === 'high' 
                      ? 'bg-gradient-to-br from-red-50 to-orange-50 border-red-200'
                      : aiInsights.risk_level === 'medium'
                      ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
                      : 'bg-gradient-to-br from-green-50 to-teal-50 border-green-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className={`h-4 w-4 ${
                        aiInsights.risk_level === 'high' ? 'text-red-600' :
                        aiInsights.risk_level === 'medium' ? 'text-amber-600' : 'text-green-600'
                      }`} />
                      <span className={`text-sm font-medium ${
                        aiInsights.risk_level === 'high' ? 'text-red-700' :
                        aiInsights.risk_level === 'medium' ? 'text-amber-700' : 'text-green-700'
                      }`}>Risk Level</span>
                    </div>
                    <div className={`text-2xl font-bold capitalize ${
                      aiInsights.risk_level === 'high' ? 'text-red-600' :
                      aiInsights.risk_level === 'medium' ? 'text-amber-600' : 'text-green-600'
                    }`}>
                      {aiInsights.risk_level || 'Low'}
                    </div>
                    {aiInsights.distraction_indicators?.distraction_score && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {aiInsights.distraction_indicators.distraction_score}% distraction
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Summary */}
                {aiInsights.ai_insights?.executive_summary && (
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-600" />
                      AI Executive Summary
                    </h4>
                    <p className="text-sm text-gray-700">
                      {aiInsights.ai_insights.executive_summary}
                    </p>
                  </div>
                )}

                {/* Key Observations */}
                {aiInsights.ai_insights?.key_observations && aiInsights.ai_insights.key_observations.length > 0 && (
                  <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                    <h4 className="font-medium mb-2 text-blue-800">Key Observations</h4>
                    <ul className="space-y-1">
                      {aiInsights.ai_insights.key_observations.slice(0, 5).map((obs, idx) => (
                        <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                          <span className="text-blue-400 mt-1">•</span>
                          {obs}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Behavioral Patterns */}
                {aiInsights.behavioral_patterns && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {aiInsights.behavioral_patterns.peak_hours && aiInsights.behavioral_patterns.peak_hours.length > 0 && (
                      <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100">
                        <h5 className="text-sm font-medium text-amber-800 mb-1">Peak Hours</h5>
                        <p className="text-xs text-amber-700">
                          {aiInsights.behavioral_patterns.peak_hours.join(', ')}
                        </p>
                      </div>
                    )}
                    {aiInsights.behavioral_patterns.work_style && (
                      <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                        <h5 className="text-sm font-medium text-indigo-800 mb-1">Work Style</h5>
                        <p className="text-xs text-indigo-700 capitalize">
                          {aiInsights.behavioral_patterns.work_style}
                        </p>
                      </div>
                    )}
                    {aiInsights.behavioral_patterns.consistency_score !== undefined && (
                      <div className="p-3 bg-teal-50/50 rounded-lg border border-teal-100">
                        <h5 className="text-sm font-medium text-teal-800 mb-1">Consistency</h5>
                        <p className="text-xs text-teal-700">
                          {aiInsights.behavioral_patterns.consistency_score}% consistent
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Distractions Warning */}
                {aiInsights.distraction_indicators?.top_distractions && 
                 aiInsights.distraction_indicators.top_distractions.length > 0 && (
                  <div className="p-4 bg-orange-50/50 rounded-lg border border-orange-200">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-orange-800">
                      <AlertTriangle className="h-4 w-4" />
                      Top Distractions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {aiInsights.distraction_indicators.top_distractions.map((d, idx) => (
                        <Badge key={idx} variant="outline" className="bg-orange-100 text-orange-700 border-orange-300">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* Employee Info & Summary */}
      {selectedEmployeeData && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Employee</span>
              </div>
              <div className="font-bold">{selectedEmployeeData.name}</div>
              <div className="text-xs text-muted-foreground">{selectedEmployeeData.email}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{summary.totalSessions}</div>
              <div className="text-xs text-muted-foreground">Total Sessions</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{formatDuration(Math.floor(summary.activeHours * 3600))}</div>
              <div className="text-xs text-muted-foreground">Active Time</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{formatDuration(Math.floor(summary.idleHours * 3600))}</div>
              <div className="text-xs text-muted-foreground">Idle Time</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{Math.round(summary.activityRate)}%</div>
              <div className="text-xs text-muted-foreground">Activity Rate</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Session Details ({sessions.length} sessions)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading session data...
            </div>
          ) : !selectedEmployee ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div>Please select an employee to view their report.</div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div>No session data found for the selected period.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">User</th>
                    <th className="text-left p-3 font-medium">Email</th>
                    <th className="text-left p-3 font-medium">Project</th>
                    <th className="text-center p-3 font-medium">Start Time</th>
                    <th className="text-center p-3 font-medium">End Time</th>
                    <th className="text-center p-3 font-medium">Duration</th>
                    <th className="text-center p-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session, index) => (
                    <tr key={session.id} className={index % 2 === 0 ? 'bg-muted/10' : ''}>
                      <td className="p-3 font-medium">{selectedEmployeeData?.name}</td>
                      <td className="p-3 text-sm text-muted-foreground">{selectedEmployeeData?.email}</td>
                      <td className="p-3">{session.project}</td>
                      <td className="p-3 text-center text-sm">{formatTime(session.start_time)}</td>
                      <td className="p-3 text-center text-sm">
                        {session.end_time ? formatTime(session.end_time) : (
                          <Badge variant="outline" className="text-xs">
                            <Play className="h-3 w-3 mr-1" />
                            Ongoing
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono text-sm">{formatDuration(session.duration)}</td>
                      <td className="p-3 text-center">
                        {session.id.startsWith('manual-') ? (
                          <Badge
                            variant="outline"
                            className="bg-purple-100 text-purple-800 border-purple-300"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Manual
                          </Badge>
                        ) : (
                          <Badge
                            variant={session.status === 'Active' ? 'default' : 'secondary'}
                            className={session.status === 'Active'
                              ? 'bg-green-100 text-green-800 border-green-300'
                              : 'bg-orange-100 text-orange-800 border-orange-300'
                            }
                          >
                            {session.status === 'Active' ? (
                              <Activity className="h-3 w-3 mr-1" />
                            ) : (
                              <Pause className="h-3 w-3 mr-1" />
                            )}
                            {session.status}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Summary */}
      {!loading && sessions.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Summary Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/20 rounded-lg">
                <div className="text-lg font-bold text-primary">{formatDuration(Math.floor(summary.totalHours * 3600))}</div>
                <div className="text-sm text-muted-foreground">Total Time</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">
                  {sessions.filter(s => s.status === 'Active').length}
                </div>
                <div className="text-sm text-muted-foreground">Active Sessions</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-lg font-bold text-orange-600">
                  {sessions.filter(s => s.status === 'Idle').length}
                </div>
                <div className="text-sm text-muted-foreground">Idle Sessions</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">
                  {sessions.length > 0 ? formatDuration(Math.floor((summary.totalHours * 3600) / sessions.length)) : '0h 0m 0s'}
                </div>
                <div className="text-sm text-muted-foreground">Avg Session</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Hours Modal */}
      <ManualHoursModal
        isOpen={manualHoursModalOpen}
        onClose={() => setManualHoursModalOpen(false)}
        onSaved={() => {
          loadEmployeeReport();
        }}
        preSelectedEmployeeId={selectedEmployee || undefined}
        preSelectedEmployeeName={selectedEmployeeData?.name}
      />
    </div>
  );
} 