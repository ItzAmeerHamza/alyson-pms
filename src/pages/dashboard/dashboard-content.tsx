import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Clock, Users, Activity, TrendingUp, AlertTriangle, Brain, Sparkles, ArrowRight, Award, TrendingDown, Zap, Share2, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, subDays, subMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { WeeklyBreakdownChart } from '@/components/dashboard/weekly-breakdown-chart';
import { Link } from 'react-router-dom';
import { calculateSessionHours } from '@/lib/time-utils';
import { fetchOrgUsers, fetchProjects as fetchProjectsService } from '@/domains/people';
import { fetchTimeLogs as fetchTimeLogsService, fetchDetailedTimeLogs, computeTimeLogStats } from '@/domains/time';
import type { UserRow } from '@/domains/people';
import type { ProjectRow } from '@/domains/people';

interface DashboardTimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  user_id: string;
  project_id: string | null;
  users: {
    full_name: string;
  };
  projects: {
    name: string;
  } | null;
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

interface Project {
  id: string;
  name: string;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalHours: number;
  totalMinutes: number;
  projectsCount: number;
}

interface AIWidgetData {
  pendingCount: number;
  analyzedCount: number;
  topPerformer: { name: string; score: number } | null;
  bottomPerformer: { name: string; score: number } | null;
  socialMediaAlerts: number;
  avgProductivity: number;
}

export function DashboardContent() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    totalHours: 0,
    totalMinutes: 0,
    projectsCount: 0
  });
  const [timeLogs, setDashboardTimeLogs] = useState<DashboardTimeLog[]>([]);
  const [dateRange, setDateRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiWidget, setAiWidget] = useState<AIWidgetData>({
    pendingCount: 0,
    analyzedCount: 0,
    topPerformer: null,
    bottomPerformer: null,
    socialMediaAlerts: 0,
    avgProductivity: 0
  });
  const [loadingAI, setLoadingAI] = useState(false);

  const fetchAIWidgetData = useCallback(async () => {
    try {
      setLoadingAI(true);
      const now = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
      
      // First get organization users if not super admin
      let orgUserIds: string[] = [];
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = (orgUsers || []).map(u => u.id);
        
        // If no users, set empty data
        if (orgUserIds.length === 0) {
          setAiWidget({
            pendingCount: 0,
            analyzedCount: 0,
            topPerformer: null,
            bottomPerformer: null,
            socialMediaAlerts: 0,
            avgProductivity: 0
          });
          setLoadingAI(false);
          return;
        }
      }
      
      // Fetch pending screenshots for analysis
      let pendingQuery = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending')
        .gte('captured_at', weekStart.toISOString())
        .lte('captured_at', weekEnd.toISOString());
      
      if (orgUserIds.length > 0) {
        pendingQuery = pendingQuery.in('user_id', orgUserIds);
      }
      
      const { count: pendingCount } = await pendingQuery;

      // Fetch analyzed screenshots
      let analyzedQuery = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('ai_analysis_status', 'completed')
        .gte('captured_at', weekStart.toISOString())
        .lte('captured_at', weekEnd.toISOString());
      
      if (orgUserIds.length > 0) {
        analyzedQuery = analyzedQuery.in('user_id', orgUserIds);
      }
      
      const { count: analyzedCount } = await analyzedQuery;

      // Fetch AI insights for this week to find top/bottom performers
      let insightsQuery = supabase
        .from('ai_employee_insights')
        .select('user_id, insights, users(full_name)')
        .gte('period_start', weekStart.toISOString())
        .order('created_at', { ascending: false });
      
      if (orgUserIds.length > 0) {
        insightsQuery = insightsQuery.in('user_id', orgUserIds);
      }
      
      const { data: insightsData } = await insightsQuery;

      // Transform to extract productivity_score from insights JSONB
      const insights = (insightsData || []).map(row => ({
        user_id: row.user_id,
        productivity_score: (row.insights as any)?.productivity_score || 0,
        users: row.users
      })).sort((a, b) => b.productivity_score - a.productivity_score);

      // Fetch users to get names (filtered by organization)
      let usersQuery = supabase
        .from('users')
        .select('id, full_name')
        .not('role', 'eq', 'admin');
      
      if (organizationId && !isSuperAdmin) {
        usersQuery = usersQuery.eq('organization_id', organizationId);
      }
      
      const { data: users } = await usersQuery;

      const userMap = new Map((users || []).map(u => [u.id, u.full_name]));

      let topPerformer = null;
      let bottomPerformer = null;
      let avgProductivity = 0;

      if (insights && insights.length > 0) {
        const validInsights = insights.filter(i => i.productivity_score > 0);
        if (validInsights.length > 0) {
          const top = validInsights[0];
          const bottom = validInsights[validInsights.length - 1];
          
          topPerformer = {
            name: userMap.get(top.user_id) || (top.users as any)?.full_name || 'Unknown',
            score: top.productivity_score
          };
          
          if (validInsights.length > 1) {
            bottomPerformer = {
              name: userMap.get(bottom.user_id) || (bottom.users as any)?.full_name || 'Unknown',
              score: bottom.productivity_score
            };
          }

          avgProductivity = Math.round(
            validInsights.reduce((sum, i) => sum + i.productivity_score, 0) / validInsights.length
          );
        }
      }

      // Count social media app alerts (approximate by checking app logs)
      const socialMediaApps = ['facebook', 'instagram', 'twitter', 'tiktok', 'whatsapp', 'discord', 'telegram'];
      let socialQuery = supabase
        .from('app_logs')
        .select('id', { count: 'exact', head: true })
        .or(socialMediaApps.map(app => `app_name.ilike.%${app}%`).join(','))
        .gte('started_at', startOfDay(now).toISOString())
        .lte('started_at', endOfDay(now).toISOString());
      
      if (orgUserIds.length > 0) {
        socialQuery = socialQuery.in('user_id', orgUserIds);
      }
      
      const { count: socialCount } = await socialQuery;

      setAiWidget({
        pendingCount: pendingCount || 0,
        analyzedCount: analyzedCount || 0,
        topPerformer,
        bottomPerformer,
        socialMediaAlerts: socialCount || 0,
        avgProductivity
      });
    } catch (error) {
      console.warn('Error fetching AI widget data:', error);
    } finally {
      setLoadingAI(false);
    }
  }, [organizationId, isSuperAdmin]);

  useEffect(() => {
    let cancelled = false;

    if ((userDetails?.role === 'admin' || userDetails?.role === 'manager') &&
        !(dateRange === 'custom' && (!customStartDate || !customEndDate))) {
      const safeFetchDashboard = async () => {
        try {
          await fetchDashboardData();
        } catch (err) {
          if (cancelled) return;
          throw err;
        }
      };
      const safeFetchAI = async () => {
        try {
          await fetchAIWidgetData();
        } catch (err) {
          if (cancelled) return;
          throw err;
        }
      };
      safeFetchDashboard();
      safeFetchAI();
    }

    return () => { cancelled = true; };
  }, [userDetails, dateRange, fetchAIWidgetData, organizationId, isSuperAdmin, customStartDate, customEndDate]);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
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
      const orgCtx = { organizationId, isSuperAdmin };

      const [users, projects, logs] = await Promise.all([
        fetchOrgUsers(orgCtx),
        fetchProjectsService(orgCtx),
        fetchTimeLogsService(start, end, orgCtx),
      ]);

      const logStats = computeTimeLogStats(logs);

      setStats({
        totalUsers: users.length,
        activeUsers: logStats.activeUserIds.size,
        totalHours: logStats.totalHours,
        totalMinutes: logStats.totalMinutes,
        projectsCount: projects.length,
      });

      const detailedLogs = await fetchDetailedTimeLogs(start, end, orgCtx, { limit: 10 });

      const enrichedLogs: DashboardTimeLog[] = detailedLogs.map((log) => {
        const user = users.find((u) => u.id === log.user_id);
        const project = log.project_id ? projects.find((p) => p.id === log.project_id) : null;
        return {
          ...log,
          users: { full_name: user?.full_name || 'Unknown User' },
          projects: project ? { name: project.name } : null,
        } as DashboardTimeLog;
      });

      setDashboardTimeLogs(enrichedLogs);
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

  return (
    <div className="space-y-6" data-testid="dashboard-content">
      <div className="flex justify-between items-center" data-testid="dashboard-header">
        <div>
          <h2 className="text-3xl font-bold tracking-tight" data-testid="dashboard-title">Dashboard</h2>
          <p className="text-muted-foreground" data-testid="dashboard-description">
            Overview of your team's productivity and activity
          </p>
        </div>
        <div className="flex items-center space-x-2" data-testid="dashboard-controls">
          <Select value={dateRange} onValueChange={(value) => {
            setDateRange(value);
            if (value === 'custom') setCustomPickerOpen(true);
          }} data-testid="date-range-selector">
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
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
          <Button onClick={fetchDashboardData} disabled={loading} data-testid="refresh-button">
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <TooltipProvider>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5" data-testid="stats-grid">
          <Card data-testid="total-users-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1" data-testid="total-users-title">
                Total Users
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>All registered users in the system, including employees, managers, and admins.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="total-users-count">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Registered team members
              </p>
            </CardContent>
          </Card>
          
          <Card data-testid="active-users-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1" data-testid="active-users-title">
                Active Users
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Users who have logged time or had activity during the selected date range ({dateRange === 'today' ? 'today' : dateRange === 'week' ? 'last 7 days' : 'last 30 days'}). Different from "Total Users" which includes all registered accounts.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="active-users-count">{stats.activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Users with activity in selected period
              </p>
            </CardContent>
          </Card>
          
          <Card data-testid="total-hours-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1" data-testid="total-hours-title">
                Total Hours
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Sum of all tracked work hours during the selected period ({dateRange === 'today' ? 'today' : dateRange === 'week' ? 'last 7 days' : 'last 30 days'}). This reflects the total time logged by all users combined.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-600" data-testid="total-hours-count">
                {stats.totalMinutes === 0
                  ? '00:00'
                  : `${Math.floor(stats.totalMinutes / 60)}:${String(stats.totalMinutes % 60).padStart(2, '0')}`}
              </div>
              <p className="text-xs text-muted-foreground">
                Total tracked time in selected period
              </p>
            </CardContent>
          </Card>
          
          <Card data-testid="projects-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1" data-testid="projects-title">
                Projects
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Total number of projects in the system. Projects help organize work and track time by assignment.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="projects-count">{stats.projectsCount}</div>
              <p className="text-xs text-muted-foreground">
                Total active projects
              </p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      {/* AI Insights Widget */}
      <Card className="col-span-full border-purple-200 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-600" />
              <CardTitle>AI Productivity Insights</CardTitle>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                <Sparkles className="h-3 w-3 mr-1" />
                Live
              </Badge>
            </div>
            <Link to="/ai-insights">
              <Button variant="outline" size="sm" className="text-purple-600 border-purple-200 hover:bg-purple-50">
                View Details
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
          <CardDescription>AI-powered analysis of team productivity this week</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAI ? (
            <div className="flex items-center justify-center py-4">
              <span className="animate-pulse">Loading AI insights...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {/* Pending Analysis */}
              <div className="p-4 bg-white rounded-lg border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Pending</span>
                </div>
                <div className="text-2xl font-bold text-amber-600">{aiWidget.pendingCount}</div>
                <div className="text-xs text-muted-foreground">awaiting analysis</div>
              </div>

              {/* Analyzed */}
              <div className="p-4 bg-white rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Analyzed</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{aiWidget.analyzedCount}</div>
                <div className="text-xs text-muted-foreground">this week</div>
              </div>

              {/* Avg Productivity */}
              <div className="p-4 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700">Avg Score</span>
                </div>
                <div className="text-2xl font-bold text-purple-600">{aiWidget.avgProductivity}%</div>
                <div className="text-xs text-muted-foreground">team productivity</div>
              </div>

              {/* Top Performer */}
              <div className="p-4 bg-white rounded-lg border border-emerald-200">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Top Performer</span>
                </div>
                {aiWidget.topPerformer ? (
                  <>
                    <div className="text-sm font-bold text-emerald-600 truncate" title={aiWidget.topPerformer.name}>
                      {aiWidget.topPerformer.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{aiWidget.topPerformer.score}% productivity</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No data yet</div>
                )}
              </div>

              {/* Needs Attention */}
              <div className="p-4 bg-white rounded-lg border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-xs font-medium text-red-700">Needs Attention</span>
                </div>
                {aiWidget.bottomPerformer ? (
                  <>
                    <div className="text-sm font-bold text-red-600 truncate" title={aiWidget.bottomPerformer.name}>
                      {aiWidget.bottomPerformer.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{aiWidget.bottomPerformer.score}% productivity</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">All good!</div>
                )}
              </div>

              {/* Social Media Alerts */}
              <div className={`p-4 bg-white rounded-lg border ${aiWidget.socialMediaAlerts > 50 ? 'border-orange-300' : 'border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Share2 className={`h-4 w-4 ${aiWidget.socialMediaAlerts > 50 ? 'text-orange-600' : 'text-blue-600'}`} />
                  <span className={`text-xs font-medium ${aiWidget.socialMediaAlerts > 50 ? 'text-orange-700' : 'text-blue-700'}`}>
                    Social Media
                  </span>
                </div>
                <div className={`text-2xl font-bold ${aiWidget.socialMediaAlerts > 50 ? 'text-orange-600' : 'text-blue-600'}`}>
                  {aiWidget.socialMediaAlerts}
                </div>
                <div className="text-xs text-muted-foreground">app usages today</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Breakdown Chart */}
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Weekly Breakdown</CardTitle>
          <CardDescription>Team activity overview for the current week</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyBreakdownChart dateRange={dateRange} />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card data-testid="recent-activity-card">
        <CardHeader>
          <CardTitle data-testid="recent-activity-title">Recent Activity</CardTitle>
          <CardDescription data-testid="recent-activity-description">
            Latest time tracking entries from your team
          </CardDescription>
        </CardHeader>
        <CardContent data-testid="recent-activity-content">
          {loading ? (
            <div className="text-center py-4">Loading recent activity...</div>
          ) : timeLogs.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No activity found for the selected period
            </div>
          ) : (
            <div className="space-y-4">
              {timeLogs.map((log: DashboardTimeLog) => (
                <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(log.start_time), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{log.users.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {log.projects?.name || 'No project assigned'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {log.end_time ? (
                      <Badge variant="secondary">
                        {(() => {
                          const durationMs = new Date(log.end_time).getTime() - new Date(log.start_time).getTime();
                          const durationMinutes = durationMs / (1000 * 60);
                          return durationMinutes > 0 ? Math.max(1, Math.round(durationMinutes)) : 0;
                        })()} min
                      </Badge>
                    ) : (
                      <Badge variant="default">Active</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
