import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchPaginated } from "@/lib/supabase-utils";
import { useAuth } from "@/providers/auth-provider";
import { 
  Download, 
  TrendingUp, 
  Users, 
  Clock, 
  Target,
  Calendar,
  BarChart3,
  PieChart,
  Activity
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";
import { calculateMergedHoursByUser } from "@/lib/time-utils";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

interface ReportData {
  totalHours: number;
  totalUsers: number;
  totalProjects: number;
  avgHoursPerUser: number;
  topProjects: Array<{
    name: string;
    hours: number;
    percentage: number;
  }>;
  topUsers: Array<{
    name: string;
    hours: number;
    percentage: number;
  }>;
  dailyActivity: Array<{
    date: string;
    hours: number;
    users: number;
  }>;
  productivityMetrics: {
    activeTime: number;
    idleTime: number;
    focusScore: number;
  };
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [dateRange, setDateRange] = useState("week");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [reportType, setReportType] = useState("overview");
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const { toast } = useToast();

  useEffect(() => {
    if (userDetails) {
      loadReportData();
    }
  }, [dateRange, userDetails, organizationId, isSuperAdmin, customStartDate, customEndDate]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      
      // Calculate date range
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (dateRange) {
        case "today":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "week":
                  startDate = startOfWeek(now, { weekStartsOn: 0 });
        endDate = endOfWeek(now, { weekStartsOn: 0 });
          break;
        case "month":
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case "quarter":
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case "last-month": {
          const lastMonth = subMonths(now, 1);
          startDate = startOfMonth(lastMonth);
          endDate = endOfMonth(lastMonth);
          break;
        }
        case "custom":
          if (customStartDate && customEndDate) {
            startDate = startOfDay(customStartDate);
            endDate = endOfDay(customEndDate);
          } else {
            startDate = subDays(now, 30);
          }
          break;
        default:
          startDate = subDays(now, 30);
      }

      // First, get organization users if not super admin
      let orgUserIds: string[] = [];
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers, error: orgUsersError } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', organizationId);
        
        if (orgUsersError) throw orgUsersError;
        orgUserIds = (orgUsers || []).map(u => u.id);
        
        // If no users in organization, return empty data
        if (orgUserIds.length === 0) {
          setReportData({
            totalHours: 0,
            totalUsers: 0,
            totalProjects: 0,
            avgHoursPerUser: 0,
            topProjects: [],
            topUsers: [],
            dailyActivity: [],
            productivityMetrics: { activeTime: 0, idleTime: 0, focusScore: 0 }
          });
          setLoading(false);
          return;
        }
      }

      // Fetch time logs with related data
      let query = supabase
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
            id,
            name
          ),
          users (
            id,
            full_name,
            email,
            organization_id
          )
        `)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString());

      // Filter by user role and organization
      if (userDetails?.role === 'employee') {
        query = query.eq('user_id', userDetails.id);
      } else if (organizationId && !isSuperAdmin && orgUserIds.length > 0) {
        query = query.in('user_id', orgUserIds);
      }

      const timeLogs = await fetchPaginated<any>(query);

      // Fetch idle_logs for the same date range to compute per-session idle time
      let idleQuery = supabase
        .from('idle_logs')
        .select('user_id, idle_start, idle_end, duration_seconds')
        .gte('idle_start', startDate.toISOString())
        .lte('idle_start', endDate.toISOString());

      if (userDetails?.role === 'employee') {
        idleQuery = idleQuery.eq('user_id', userDetails.id);
      } else if (organizationId && !isSuperAdmin && orgUserIds.length > 0) {
        idleQuery = idleQuery.in('user_id', orgUserIds);
      }

      const idleLogsData = await fetchPaginated<any>(idleQuery);

      // Filter out test users and projects in JavaScript
      // (PostgREST doesn't support .not() filtering on embedded resources correctly)
      const filteredLogs = (timeLogs || []).filter(log => {
        const email = log.users?.email?.toLowerCase() || '';
        const fullName = log.users?.full_name?.toLowerCase() || '';
        const projectName = log.projects?.name?.toLowerCase() || '';
        
        // Exclude test data
        if (email.includes('@example.com')) return false;
        if (fullName.includes('test')) return false;
        if (projectName.includes('test-')) return false;
        
        return true;
      });

      // Enrich each log with computed idle_seconds from idle_logs
      const enrichedLogs = filteredLogs.map(log => {
        const logStart = new Date(log.start_time).getTime();
        const logEnd = log.end_time ? new Date(log.end_time).getTime() : Date.now();
        let totalIdleMs = 0;
        (idleLogsData || []).forEach(idle => {
          if (idle.user_id !== log.user_id) return;
          const idleStart = new Date(idle.idle_start).getTime();
          const idleEnd = idle.idle_end ? new Date(idle.idle_end).getTime() : Date.now();
          const overlapStart = Math.max(logStart, idleStart);
          const overlapEnd = Math.min(logEnd, idleEnd);
          if (overlapStart < overlapEnd) {
            totalIdleMs += (overlapEnd - overlapStart);
          }
        });
        return { ...log, idle_seconds: Math.round(totalIdleMs / 1000) };
      });

      // Process data for reports
      const processedData = processReportData(enrichedLogs);
      setReportData(processedData);

    } catch (error: any) {
      console.error('Error loading report data:', error);
      toast({
        title: "Error loading reports",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processReportData = (timeLogs: any[]): ReportData => {
    const projectHours: { [key: string]: { name: string; hours: number } } = {};
    const dailyActivity: { [key: string]: { hours: number; users: Set<string> } } = {};
    const userNames: { [key: string]: string } = {};

    let totalIdleHours = 0;

    // Use merged intervals per user to prevent double-counting from multi-device sessions
    const validLogs = timeLogs.filter(l => !!l.start_time);
    const mergedByUser = calculateMergedHoursByUser(
      validLogs.map(l => ({
        start_time: l.start_time,
        end_time: l.end_time,
        idle_seconds: l.idle_seconds || 0,
        deducted_seconds: l.deducted_seconds || 0,
        user_id: l.user_id,
      }))
    );

    const userHours: { [key: string]: { name: string; hours: number } } = {};
    let totalHours = 0;

    // Build user hours from merged results
    for (const [userId, hours] of mergedByUser) {
      totalHours += hours;
      const userName = validLogs.find(l => l.user_id === userId)?.users?.full_name || 'Unknown User';
      userHours[userId] = { name: userName, hours };
      userNames[userId] = userName;
    }

    // Project and daily breakdowns use per-log attribution (projects can overlap across devices)
    validLogs.forEach(log => {
      const start = new Date(log.start_time).getTime();
      const end = log.end_time ? new Date(log.end_time).getTime() : Date.now();
      const rawHours = (end - start) / (1000 * 60 * 60);
      const idleHours = ((log as any).idle_seconds || 0) / 3600;
      const deductedHours = ((log as any).deducted_seconds || 0) / 3600;
      const hours = Math.max(0, rawHours - deductedHours);
      
      totalIdleHours += idleHours;

      const projectId = log.project_id || 'no-project';
      const projectName = log.projects?.name || 'No Project';
      if (!projectHours[projectId]) {
        projectHours[projectId] = { name: projectName, hours: 0 };
      }
      projectHours[projectId].hours += hours;

      const date = format(new Date(log.start_time), 'yyyy-MM-dd');
      if (!dailyActivity[date]) {
        dailyActivity[date] = { hours: 0, users: new Set() };
      }
      dailyActivity[date].hours += hours;
      dailyActivity[date].users.add(log.user_id);
    });

    // Sort and get top projects/users
    const topProjects = Object.values(projectHours)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5)
      .map(project => ({
        name: project.name,
        hours: project.hours,
        percentage: totalHours > 0 ? (project.hours / totalHours) * 100 : 0
      }));

    const topUsers = Object.values(userHours)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5)
      .map(user => ({
        name: user.name,
        hours: user.hours,
        percentage: totalHours > 0 ? (user.hours / totalHours) * 100 : 0
      }));

    // Convert daily activity
    const dailyActivityArray = Object.entries(dailyActivity)
      .map(([date, data]) => ({
        date,
        hours: data.hours,
        users: data.users.size
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalHours,
      totalUsers: Object.keys(userHours).length,
      totalProjects: Object.keys(projectHours).length,
      avgHoursPerUser: Object.keys(userHours).length > 0 ? totalHours / Object.keys(userHours).length : 0,
      topProjects,
      topUsers,
      dailyActivity: dailyActivityArray,
      productivityMetrics: {
        activeTime: totalHours,
        idleTime: totalIdleHours,
        focusScore: (totalHours + totalIdleHours) > 0
          ? Math.min(100, (totalHours / (totalHours + totalIdleHours)) * 100)
          : 0
      }
    };
  };

  const exportReport = () => {
    if (!reportData) return;

    const csvData = [
      ['Report Type', 'Time Tracking Analytics'],
      ['Date Range', dateRange],
      ['Generated', format(new Date(), 'PPpp')],
      [''],
      ['Summary'],
      ['Total Hours', reportData.totalHours.toFixed(2)],
      ['Total Users', reportData.totalUsers.toString()],
      ['Total Projects', reportData.totalProjects.toString()],
      ['Average Hours per User', reportData.avgHoursPerUser.toFixed(2)],
      [''],
      ['Top Projects'],
      ['Project Name', 'Hours', 'Percentage'],
      ...reportData.topProjects.map(p => [p.name, p.hours.toFixed(2), p.percentage.toFixed(1) + '%']),
      [''],
      ['Top Users'],
      ['User Name', 'Hours', 'Percentage'],
      ...reportData.topUsers.map(u => [u.name, u.hours.toFixed(2), u.percentage.toFixed(1) + '%'])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `time_tracking_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Report exported",
      description: "Analytics report has been downloaded as CSV.",
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reports" subtitle="Analytics and insights" />
        <div className="text-center py-8">Loading reports...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reports" subtitle="Analytics and insights" />
        <div className="text-center py-8">No data available for the selected period.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Analytics and insights" />

      {/* Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Report Configuration</CardTitle>
            <Button onClick={exportReport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Date Range</label>
              <Select value={dateRange} onValueChange={(value) => {
                setDateRange(value);
                if (value === 'custom') setCustomPickerOpen(true);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="custom">Custom Dates</SelectItem>
                </SelectContent>
              </Select>
              {dateRange === 'custom' && (
                <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 mt-2">
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
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Report Type</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Overview</SelectItem>
                  <SelectItem value="productivity">Productivity</SelectItem>
                  <SelectItem value="projects">Projects</SelectItem>
                  <SelectItem value="users">Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalHours.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              Tracked in selected period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Users with logged time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.totalProjects}</div>
            <p className="text-xs text-muted-foreground">
              Active projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Hours/User</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.avgHoursPerUser.toFixed(1)}h</div>
            <p className="text-xs text-muted-foreground">
              Average per user
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Analytics */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Top Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.topProjects.map((project, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" style={{
                      backgroundColor: `hsl(${index * 72}, 70%, 50%)`
                    }} />
                    <span className="text-sm font-medium">{project.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">{project.hours.toFixed(1)}h</div>
                    <div className="text-xs text-muted-foreground">{project.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.topUsers.map((user, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{index + 1}</Badge>
                    <span className="text-sm font-medium">{user.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">{user.hours.toFixed(1)}h</div>
                    <div className="text-xs text-muted-foreground">{user.percentage.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Daily Activity Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reportData.dailyActivity.map((day, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">{format(new Date(day.date), 'EEEE, MMM dd')}</p>
                  <p className="text-sm text-gray-500">{day.users} active users</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{day.hours.toFixed(1)}h</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
