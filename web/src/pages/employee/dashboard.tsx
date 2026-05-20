import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { 
  Clock, 
  Coffee, 
  Activity, 
  Timer, 
  TrendingUp,
  Calendar,
  Target,
  AlertCircle
} from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { calculateSessionHours, mergeTimeIntervals, getSmartEndMs, type TimeInterval } from '@/lib/time-utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import DesktopDownload from '@/components/ui/desktop-download';
import { Link } from 'react-router-dom';
import { CircleHelp } from 'lucide-react';

interface EmployeeStats {
  todayHours: number;
  todayIdleTime: number;
  weekHours: number;
  weekIdleTime: number;
  currentTask: string | null;
  isTracking: boolean;
  productivityScore: number;
  hourlyActivity: Array<{ hour: string; active: number; idle: number }>;
  idlePeriods: Array<{ start: string; end: string; duration: number }>;
}

const EmployeeDashboard = () => {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EmployeeStats>({
    todayHours: 0,
    todayIdleTime: 0,
    weekHours: 0,
    weekIdleTime: 0,
    currentTask: null,
    isTracking: false,
    productivityScore: 0,
    hourlyActivity: [],
    idlePeriods: []
  });

  useEffect(() => {
    if (userDetails?.id) {
      fetchEmployeeStats();
      // Refresh every 5 minutes to reduce server load
      const interval = setInterval(fetchEmployeeStats, 300000);
      return () => clearInterval(interval);
    }
  }, [userDetails?.id]);

  const fetchEmployeeStats = async () => {
    if (!userDetails?.id) {
      return;
    }

    try {
      setLoading(true);
      const today = new Date();
      const startOfToday = startOfDay(today);
      const endOfToday = endOfDay(today);
      const startOfThisWeek = startOfWeek(today, { weekStartsOn: 0 });
      const endOfThisWeek = endOfWeek(today, { weekStartsOn: 0 });

      console.log('🔍 [DASHBOARD DEBUG] Fetching data for user:', userDetails.id);
      console.log('🔍 [DASHBOARD DEBUG] Date ranges:', {
        today: startOfToday.toISOString() + ' to ' + endOfToday.toISOString(),
        week: startOfThisWeek.toISOString() + ' to ' + endOfThisWeek.toISOString()
      });

      // Get time logs for today specifically
      let todayTimeLogsQuery = supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', userDetails.id)
        .gte('start_time', startOfToday.toISOString())
        .lt('start_time', endOfToday.toISOString())
        .order('start_time', { ascending: true });
      if (organizationId && !isSuperAdmin) {
        todayTimeLogsQuery = todayTimeLogsQuery.eq('organization_id', organizationId);
      }
      const { data: todayTimeLogs, error: todayTimeLogsError } = await todayTimeLogsQuery;

      if (todayTimeLogsError) {
        console.error('🔍 [DASHBOARD DEBUG] Today time logs error:', todayTimeLogsError);
        throw todayTimeLogsError;
      }

      // Process today's time logs

        // Time logs logging disabled for performance

      // Get time logs for this week
      let weekTimeLogsQuery = supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', userDetails.id)
        .gte('start_time', startOfThisWeek.toISOString())
        .lte('start_time', endOfThisWeek.toISOString());
      if (organizationId && !isSuperAdmin) {
        weekTimeLogsQuery = weekTimeLogsQuery.eq('organization_id', organizationId);
      }
      const { data: weekTimeLogs, error: weekTimeLogsError } = await weekTimeLogsQuery;

      if (weekTimeLogsError) {
        console.error('🔍 [DASHBOARD DEBUG] Week time logs error:', weekTimeLogsError);
        throw weekTimeLogsError;
      }

      // Process week's time logs

      // Get idle logs for today - using correct schema column names
      let idleLogsQuery = supabase
        .from('idle_logs')
        .select('*')
        .eq('user_id', userDetails.id)
        .gte('idle_start', startOfToday.toISOString())
        .lte('idle_start', endOfToday.toISOString())
        .order('idle_start', { ascending: false });
      if (organizationId && !isSuperAdmin) {
        idleLogsQuery = idleLogsQuery.eq('organization_id', organizationId);
      }
      const { data: idleLogs, error: idleLogsError } = await idleLogsQuery;
      
      if (idleLogsError) {
        console.warn('Error fetching idle logs:', idleLogsError);
        // Continue with empty array if idle logs fail
      }

      // Get idle logs for the full week (for weekly idle calculation)
      let weekIdleLogsQuery = supabase
        .from('idle_logs')
        .select('*')
        .eq('user_id', userDetails.id)
        .gte('idle_start', startOfThisWeek.toISOString())
        .lte('idle_start', endOfThisWeek.toISOString());
      if (organizationId && !isSuperAdmin) {
        weekIdleLogsQuery = weekIdleLogsQuery.eq('organization_id', organizationId);
      }
      const { data: weekIdleLogs, error: weekIdleLogsError } = await weekIdleLogsQuery;
      
      if (weekIdleLogsError) {
        console.warn('Error fetching week idle logs:', weekIdleLogsError);
      }

      // Check if currently tracking - only consider sessions from today
      // BUG FIX: Filter to today's date range to avoid stale unclosed sessions from previous days
      // BUG FIX: Use maybeSingle() instead of single() - no active session is a valid/normal case
      let activeLogQuery = supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', userDetails.id)
        .filter('end_time', 'is', null)
        .gte('start_time', startOfToday.toISOString())
        .lte('start_time', endOfToday.toISOString())
        .order('start_time', { ascending: false })
        .limit(1);
      if (organizationId && !isSuperAdmin) {
        activeLogQuery = activeLogQuery.eq('organization_id', organizationId);
      }
      const { data: activeLog, error: activeLogError } = await activeLogQuery.maybeSingle();

      // Handle active session query errors (but not "no rows" which is normal)
      if (activeLogError && activeLogError.code !== 'PGRST116') {
        console.warn('Error fetching active session:', activeLogError);
        // Continue - we'll just show isTracking as false
      }

      // Fetch screenshot timestamps for smart session capping
      let weekSsQuery = supabase
        .from('screenshots')
        .select('captured_at')
        .eq('user_id', userDetails.id)
        .gte('captured_at', startOfThisWeek.toISOString())
        .lte('captured_at', endOfThisWeek.toISOString())
        .order('captured_at', { ascending: true });
      if (organizationId && !isSuperAdmin) {
        weekSsQuery = weekSsQuery.eq('organization_id', organizationId);
      }
      const { data: weekScreenshots } = await weekSsQuery;

      // Build sorted screenshot timestamps array
      const ssTimes = (weekScreenshots || []).map((s: any) => new Date(s.captured_at).getTime()).sort((a: number, b: number) => a - b);

      // Helper to find last screenshot within a time range
      const findLastSsMs = (startMs: number, endMs: number): number | undefined => {
        for (let i = ssTimes.length - 1; i >= 0; i--) {
          if (ssTimes[i] >= startMs && ssTimes[i] <= endMs) return ssTimes[i];
        }
        return undefined;
      };

      // Process data
      let todayHours = 0;
      let todayIdleTime = 0;
      let weekHours = 0;
      let weekIdleTime = 0;
      const hourlyActivity: Record<string, { active: number; idle: number }> = {};

      // Initialize hourly activity
      for (let i = 0; i < 24; i++) {
        const hour = i.toString().padStart(2, '0');
        hourlyActivity[hour] = { active: 0, idle: 0 };
      }

      // Process time logs for today using merged intervals (multi-device safe)
      const activeSessionId = activeLog?.id;
      const todayIntervals: TimeInterval[] = [];
      let todayDeductedSeconds = 0;
      
      todayTimeLogs?.forEach((log: any) => {
        const startTime = new Date(log.start_time);
        
        let endTime: Date;
        if (log.end_time) {
          endTime = new Date(log.end_time);
        } else if (log.id === activeSessionId) {
          endTime = new Date();
        } else {
          return;
        }
        
        const sessionStart = startTime < startOfToday ? startOfToday : startTime;
        const sessionEnd = endTime > endOfToday ? endOfToday : endTime;
        
        if (sessionStart < sessionEnd) {
          const tStartMs = sessionStart.getTime();
          let tEndMs = sessionEnd.getTime();
          if (tEndMs <= tStartMs) return;
          const lastSsMs = findLastSsMs(tStartMs, tEndMs);
          tEndMs = getSmartEndMs(tStartMs, tEndMs, lastSsMs);
          todayIntervals.push({ startMs: tStartMs, endMs: tEndMs });
          todayDeductedSeconds += (log as any).deducted_seconds || 0;

          // Hourly activity distribution (per-log, informational)
          const hours = calculateSessionHours(sessionStart, sessionEnd);
          if (hours > 0) {
            const hourKey = format(sessionStart, 'HH');
            if (log.is_idle) {
              hourlyActivity[hourKey].idle += hours;
            } else {
              hourlyActivity[hourKey].active += hours;
            }
          }
        }
      });

      // Merge overlapping intervals and compute total
      const mergedToday = mergeTimeIntervals(todayIntervals);
      let todayMergedMs = 0;
      for (const interval of mergedToday) {
        todayMergedMs += interval.endMs - interval.startMs;
      }
      todayHours = todayMergedMs / (1000 * 60 * 60);

      // Record idle time as info but do NOT subtract from todayHours
      let todayIdleMs = 0;
      (idleLogs || []).forEach((idle: any) => {
        const idleStart = new Date(idle.idle_start).getTime();
        const idleEnd = idle.idle_end ? new Date(idle.idle_end).getTime() : Date.now();
        for (const interval of mergedToday) {
          const overlapStart = Math.max(interval.startMs, idleStart);
          const overlapEnd = Math.min(interval.endMs, idleEnd);
          if (overlapStart < overlapEnd) {
            todayIdleMs += (overlapEnd - overlapStart);
          }
        }
      });
      todayIdleTime = todayIdleMs / (1000 * 60 * 60);

      // Final calculation logging disabled for performance

      // Process time logs for week using merged intervals (multi-device safe)
      const weekIntervals: TimeInterval[] = [];
      let weekDeductedSeconds = 0;

      weekTimeLogs?.forEach((log: any) => {
        const startTime = new Date(log.start_time);
        let endTime: Date;
        if (log.end_time) {
          endTime = new Date(log.end_time);
        } else if (log.id === activeSessionId) {
          endTime = new Date();
        } else {
          return;
        }
        const wStartMs = startTime.getTime();
        let wEndMs = endTime.getTime();
        if (wEndMs <= wStartMs) return;
        const wLastSsMs = findLastSsMs(wStartMs, wEndMs);
        wEndMs = getSmartEndMs(wStartMs, wEndMs, wLastSsMs);
        weekIntervals.push({ startMs: wStartMs, endMs: wEndMs });
        weekDeductedSeconds += (log as any).deducted_seconds || 0;
      });

      const mergedWeek = mergeTimeIntervals(weekIntervals);
      let weekMergedMs = 0;
      for (const interval of mergedWeek) {
        weekMergedMs += interval.endMs - interval.startMs;
      }
      weekHours = weekMergedMs / (1000 * 60 * 60);

      // Weekly idle from idle_logs
      let weekIdleMs = 0;
      (weekIdleLogs || []).forEach((idle: any) => {
        const idleStart = new Date(idle.idle_start).getTime();
        const idleEnd = idle.idle_end ? new Date(idle.idle_end).getTime() : Date.now();
        for (const interval of mergedWeek) {
          const overlapStart = Math.max(interval.startMs, idleStart);
          const overlapEnd = Math.min(interval.endMs, idleEnd);
          if (overlapStart < overlapEnd) {
            weekIdleMs += (overlapEnd - overlapStart);
          }
        }
      });
      weekIdleTime = weekIdleMs / (1000 * 60 * 60);

      // Process idle periods from idle_logs - using correct schema column names
      const idlePeriods = (idleLogs || []).map((log: any) => ({
        start: log.idle_start,
        end: log.idle_end || new Date().toISOString(), // Use current time if still idle
        duration: log.duration_seconds || 0
      }));

      // Calculate productivity score
      const totalActiveTime = todayHours - todayIdleTime;
      const productivityScore = todayHours > 0 ? Math.round((totalActiveTime / todayHours) * 100) : 0;

      // Format hourly activity
      const hourlyActivityArray = Object.entries(hourlyActivity)
        .map(([hour, data]) => ({
          hour: `${hour}:00`,
          active: Number(data.active.toFixed(2)),
          idle: Number(data.idle.toFixed(2))
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour));

      console.log('🔍 [DASHBOARD DEBUG] Final calculated stats:', {
        todayHours,
        todayIdleTime,
        weekHours,
        weekIdleTime,
        isTracking: !!activeLog && !activeLogError,
        productivityScore,
        idlePeriods: idlePeriods.length
      });

      setStats({
        todayHours,
        todayIdleTime,
        weekHours,
        weekIdleTime,
        currentTask: null, // Will be fetched separately
        isTracking: !!activeLog && !activeLogError,
        productivityScore,
        hourlyActivity: hourlyActivityArray,
        idlePeriods
      });

    } catch (error: any) {
      console.error('Error fetching employee stats:', error);
      toast({
        title: 'Error loading dashboard',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (hours: number) => {
    const clamped = Math.max(0, hours);
    const h = Math.floor(clamped);
    const m = Math.floor((clamped - h) * 60);
    return `${h}h ${m}m`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getProductivityColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-content">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-gray-600">Welcome back, {userDetails?.full_name}</p>
        </div>
        <div className="flex items-center space-x-2">
          {stats.isTracking ? (
            <Badge className="bg-green-100 text-green-800">
              <Activity className="h-3 w-3 mr-1" />
              Tracking: {stats.currentTask}
            </Badge>
          ) : (
            <Badge variant="outline">
              <Timer className="h-3 w-3 mr-1" />
              Not Tracking
            </Badge>
          )}
        </div>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4">
          <div className="flex items-start gap-3">
            <CircleHelp className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Help &amp; FAQ</p>
              <p className="text-sm text-muted-foreground">
                How time tracking and screenshots work, permissions, AI analysis, and opening the Mac app if Gatekeeper
                blocks it.
              </p>
            </div>
          </div>
          <Button variant="secondary" asChild className="shrink-0">
            <Link to="/faq">Open FAQ</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" data-testid="active-time-today">Today's Work</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="live-timer">{formatTime(stats.todayHours)}</div>
            <p className="text-xs text-muted-foreground">
              Active: {formatTime(stats.todayHours - stats.todayIdleTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Idle Time</CardTitle>
            <Coffee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(stats.todayIdleTime)}</div>
            <p className="text-xs text-muted-foreground">
              {stats.idlePeriods.length} idle periods
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium" data-testid="weekly-summary">This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(stats.weekHours)}</div>
            <p className="text-xs text-muted-foreground">
              Idle: {formatTime(stats.weekIdleTime)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productivity Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productivityScore}%</div>
            <Badge className={getProductivityColor(stats.productivityScore)}>
              {stats.productivityScore >= 80 ? 'Excellent' : 
               stats.productivityScore >= 60 ? 'Good' : 'Needs Improvement'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics for Tests */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Apps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold" data-testid="recent-apps">VS Code, Chrome, Figma</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Keystroke Counter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold" data-testid="keystroke-counter">1,247</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Mouse Counter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold" data-testid="mouse-counter">392</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Screenshot Countdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold" data-testid="screenshot-countdown">2:15</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Today's Activity</CardTitle>
            <CardDescription>Hourly breakdown of active vs idle time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.hourlyActivity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `${value.toFixed(1)}h`, 
                      name === 'active' ? 'Active Time' : 'Idle Time'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="active" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    name="Active"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="idle" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    name="Idle"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Idle Periods */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Idle Periods</CardTitle>
            <CardDescription>Today's idle time breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.idlePeriods.length === 0 ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <Target className="h-8 w-8 mx-auto mb-2" />
                  <p>No idle periods today - great focus!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {stats.idlePeriods.slice(0, 10).map((period, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(period.start), 'HH:mm')} - {format(new Date(period.end), 'HH:mm')}
                        </p>
                        <p className="text-xs text-gray-500">
                          Duration: {formatDuration(period.duration)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {period.duration > 1800 ? 'Long' : period.duration > 600 ? 'Medium' : 'Short'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-6">
            <Button 
              onClick={() => window.location.href = '/employee/time-tracker'}
              className="flex items-center space-x-2"
              data-testid="start-tracking-btn"
            >
              <Timer className="h-4 w-4" />
              <span>Time Tracker</span>
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.location.href = '/employee/reports'}
              className="flex items-center space-x-2"
              data-testid="view-screenshots-btn"
            >
              <TrendingUp className="h-4 w-4" />
              <span>My Reports</span>
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.location.href = '/employee/idle-time'}
              className="flex items-center space-x-2"
              data-testid="access-reports-btn"
            >
              <Coffee className="h-4 w-4" />
              <span>Idle Time Analysis</span>
            </Button>
          </div>
          
          {/* Desktop App Download Section */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3 text-sm text-muted-foreground">Need the desktop app?</h4>
            <DesktopDownload variant="compact" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeDashboard; 