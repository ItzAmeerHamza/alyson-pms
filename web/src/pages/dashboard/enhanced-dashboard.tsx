import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, Users, Activity, TrendingUp, AlertTriangle, Globe, Camera, MousePointer, Keyboard } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { format, subDays, subMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/providers/auth-provider';
import { fetchOrgUsers, fetchProjects } from '@/domains/people';
import { fetchTimeLogs, fetchDetailedTimeLogs, computeTimeLogStats } from '@/domains/time';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { UserRow } from '@/domains/people';
import type { TimeLogRow } from '@/domains/time';

interface EnhancedLog extends TimeLogRow {
  idle_time_seconds?: number | null;
  keyboard_usage?: number | null;
  mouse_usage?: number | null;
  application_usage?: any[] | null;
  url_visited?: any[] | null;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalHours: number;
  projectsCount: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function EnhancedDashboard() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const orgCtx = { organizationId, isSuperAdmin };

  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalHours: 0,
    projectsCount: 0
  });
  const [timeLogs, setTimeLogs] = useState<EnhancedLog[]>([]);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projectsList, setProjectsList] = useState<{ id: string; name: string }[]>([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (userDetails?.role === 'admin' || userDetails?.role === 'manager') {
      if (dateRange === 'custom' && (!customStartDate || !customEndDate)) return;
      fetchDashboardData();
    }
  }, [userDetails, dateRange, selectedUser, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'yesterday': {
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      }
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
      case 'month':
        return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
      case 'last-month': {
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
        }
        return { start: startOfDay(now), end: endOfDay(now) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      const [usersData, projectsData, logsData] = await Promise.all([
        fetchOrgUsers(orgCtx, { roles: ['employee', 'admin', 'manager'] }),
        fetchProjects(orgCtx),
        fetchTimeLogs(start, end, orgCtx, {
          userId: selectedUser !== 'all' ? selectedUser : undefined,
        }),
      ]);

      setUsers(usersData);
      setProjectsList(projectsData);

      const logStats = computeTimeLogStats(logsData);
      setStats({
        totalUsers: usersData.length,
        activeUsers: logStats.activeUserIds.size,
        totalHours: logStats.totalHours,
        projectsCount: projectsData.length,
      });

      const detailedLogs = await fetchDetailedTimeLogs(start, end, orgCtx, {
        userId: selectedUser !== 'all' ? selectedUser : undefined,
        limit: 10,
      });

      const enrichedLogs: EnhancedLog[] = detailedLogs.map((log) => {
        const user = usersData.find((u) => u.id === log.user_id);
        const project = log.project_id
          ? projectsData.find((p) => p.id === log.project_id)
          : null;
        return {
          ...log,
          users: { full_name: user?.full_name || 'Unknown User' },
          projects: project ? { name: project.name } : null,
        };
      });

      setTimeLogs(enrichedLogs);
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (userDetails?.role !== 'admin' && userDetails?.role !== 'manager') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const enhancedLogs = timeLogs.map((log: any, index: number) => {
    const nextLog = index === timeLogs.length - 1 ? null : timeLogs[index + 1];

    const idlePercentage = log.idle_time_seconds
      ? Math.min(100, Math.round((log.idle_time_seconds / ((new Date(log.end_time || log.start_time).getTime() - new Date(log.start_time).getTime()) / 1000)) * 100))
      : 0;

    const keyboardUsage = log.keyboard_usage !== null ? Math.min(100, log.keyboard_usage) : 0;
    const mouseUsage = log.mouse_usage !== null ? Math.min(100, log.mouse_usage) : 0;

    const applicationUsage = log.application_usage || [];
    const topApplication = applicationUsage.length > 0
      ? applicationUsage.reduce((prev: any, current: any) => (prev.percent > current.percent) ? prev : current)
      : null;

    const timeDifference = nextLog ? new Date(log.start_time).getTime() - new Date(nextLog.end_time || nextLog.start_time).getTime() : 0;
    const timeSinceLastActivity = nextLog ? format(timeDifference, 'HH:mm') : 'N/A';

    return {
      ...log,
      idlePercentage,
      keyboardUsage,
      mouseUsage,
      topApplication,
      timeSinceLastActivity
    };
  });

  const applicationUsageData = enhancedLogs.reduce((acc: any, log: any) => {
    if (log.application_usage) {
      log.application_usage.forEach((app: any) => {
        const existingApp = acc.find((a: any) => a.name === app.name);
        if (existingApp) {
          existingApp.percent += app.percent;
        } else {
          acc.push({ name: app.name, percent: app.percent });
        }
      });
    }
    return acc;
  }, []).sort((a: any, b: any) => b.percent - a.percent).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Enhanced Dashboard</h2>
          <p className="text-muted-foreground">
            Detailed insights into your team's productivity and activity
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={dateRange} onValueChange={(value) => {
            setDateRange(value);
            if (value === 'custom') setCustomPickerOpen(true);
          }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
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
          <EmployeeFilterCombobox
            value={selectedUser}
            onValueChange={setSelectedUser}
            users={users}
            placeholder="Select User"
            className="w-[180px]"
          />
          <Button onClick={fetchDashboardData} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground">Registered team members</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.activeUsers}</div>
                <p className="text-xs text-muted-foreground">Users with activity in selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalHours}h</div>
                <p className="text-xs text-muted-foreground">Total tracked time in selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.projectsCount}</div>
                <p className="text-xs text-muted-foreground">Total active projects</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest time tracking entries from your team with detailed insights</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4">Loading recent activity...</div>
              ) : enhancedLogs.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No activity found for the selected period</div>
              ) : (
                <div className="space-y-4">
                  {enhancedLogs.map((log: any) => (
                    <div key={log.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(log.start_time), 'MMM dd, HH:mm')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{log.users?.full_name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground">{log.projects?.name || 'No project assigned'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {log.end_time ? (
                            <Badge variant="secondary">
                              {Math.round((new Date(log.end_time).getTime() - new Date(log.start_time).getTime()) / (1000 * 60))} min
                            </Badge>
                          ) : (
                            <Badge variant="default">Active</Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="shadow-none border-0">
                          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Idle Time</CardTitle></CardHeader>
                          <CardContent>
                            <Progress value={log.idlePercentage} className="mb-2" />
                            <p className="text-xs text-muted-foreground">{log.idlePercentage}% of time</p>
                          </CardContent>
                        </Card>
                        <Card className="shadow-none border-0">
                          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Keyboard Usage</CardTitle></CardHeader>
                          <CardContent>
                            <Progress value={log.keyboardUsage} className="mb-2" />
                            <p className="text-xs text-muted-foreground">{log.keyboardUsage}% of time</p>
                          </CardContent>
                        </Card>
                        <Card className="shadow-none border-0">
                          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Mouse Usage</CardTitle></CardHeader>
                          <CardContent>
                            <Progress value={log.mouseUsage} className="mb-2" />
                            <p className="text-xs text-muted-foreground">{log.mouseUsage}% of time</p>
                          </CardContent>
                        </Card>
                        <Card className="shadow-none border-0">
                          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top Application</CardTitle></CardHeader>
                          <CardContent>
                            {log.topApplication ? (
                              <>
                                <p className="text-sm font-medium">{log.topApplication.name}</p>
                                <p className="text-xs text-muted-foreground">{log.topApplication.percent}% of time</p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">No data</p>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Application Usage</CardTitle>
              <CardDescription>Insights into application usage during tracked time</CardDescription>
            </CardHeader>
            <CardContent>
              {applicationUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie dataKey="percent" isAnimationActive={false} data={applicationUsageData} cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                      {applicationUsageData.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-4 text-muted-foreground">No application usage data available for the selected period.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
