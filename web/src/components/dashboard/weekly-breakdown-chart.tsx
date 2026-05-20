import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { useAuth } from '@/providers/auth-provider';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addDays } from 'date-fns';
import { calculateSessionSeconds, mergeTimeIntervals, type TimeInterval } from '@/lib/time-utils';

interface WeeklyData {
  date: string;
  dayName: string;
  totalTime: number;
  sessions: number;
}

interface WeeklyBreakdownChartProps {
  dateRange: string;
}

export function WeeklyBreakdownChart({ dateRange }: WeeklyBreakdownChartProps) {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userDetails?.role === 'admin' || userDetails?.role === 'manager') {
      fetchWeeklyData();
    }
  }, [userDetails, dateRange, organizationId, isSuperAdmin]);

  const fetchWeeklyData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current week (Sunday to Saturday)
      const today = new Date();
      const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 0 }); // Sunday start
      const endOfCurrentWeek = endOfWeek(today, { weekStartsOn: 0 }); // Saturday end

      // Generate array of days for the week
      const weekDays = eachDayOfInterval({
        start: startOfCurrentWeek,
        end: endOfCurrentWeek
      });

      // Initialize weekly data structure
      const initialData: WeeklyData[] = weekDays.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        dayName: format(day, 'EEE'),
        totalTime: 0,
        sessions: 0
      }));

      // First get organization users if not super admin
      let orgUserIds: string[] = [];
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = (orgUsers || []).map(u => u.id);
        
        // If no users, return empty data
        if (orgUserIds.length === 0) {
          setWeeklyData(initialData);
          setLoading(false);
          return;
        }
      }

      // Fetch time logs for the week
      let query = supabase
        .from('time_logs')
        .select('start_time, end_time, user_id')
        .gte('start_time', startOfCurrentWeek.toISOString())
        .lt('start_time', addDays(endOfCurrentWeek, 1).toISOString());
      
      // Filter by organization users
      if (orgUserIds.length > 0) {
        query = query.in('user_id', orgUserIds);
      }

      const timeLogs = await fetchPaginated<any>(query);

      // Process time logs with merged intervals per day (multi-device safe)
      if (timeLogs && timeLogs.length > 0) {
        // Group intervals by day
        const dayIntervals: { [date: string]: TimeInterval[] } = {};
        const daySessions: { [date: string]: number } = {};
        
        timeLogs.forEach((log: any) => {
          if (!log.start_time) return;
          const startTime = new Date(log.start_time);
          const endTime = log.end_time ? new Date(log.end_time) : new Date();
          const logDate = format(startTime, 'yyyy-MM-dd');
          
          if (!dayIntervals[logDate]) {
            dayIntervals[logDate] = [];
            daySessions[logDate] = 0;
          }
          dayIntervals[logDate].push({ startMs: startTime.getTime(), endMs: endTime.getTime() });
          daySessions[logDate] += 1;
        });

        for (const [date, intervals] of Object.entries(dayIntervals)) {
          const dayIndex = initialData.findIndex(day => day.date === date);
          if (dayIndex !== -1) {
            const merged = mergeTimeIntervals(intervals);
            let totalSeconds = 0;
            for (const interval of merged) {
              totalSeconds += Math.floor((interval.endMs - interval.startMs) / 1000);
            }
            initialData[dayIndex].totalTime += totalSeconds;
            initialData[dayIndex].sessions += daySessions[date];
          }
        }
      }

      setWeeklyData(initialData);
    } catch (err) {
      console.error('Error fetching weekly data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch weekly data');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading weekly data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <p className="text-sm">Error loading weekly data</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!weeklyData || weeklyData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">No weekly data available</p>
          <p className="text-xs mt-1">Try selecting a different date range</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = weeklyData.map(day => ({
    name: day.dayName,
    time: day.totalTime,
    sessions: day.sessions,
    formattedTime: formatDuration(day.totalTime)
  }));

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {formatDuration(weeklyData.reduce((sum, day) => sum + day.totalTime, 0))}
          </div>
          <div className="text-sm text-muted-foreground">Total Time</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {weeklyData.reduce((sum, day) => sum + day.sessions, 0)}
          </div>
          <div className="text-sm text-muted-foreground">Total Sessions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {formatDuration(Math.max(...weeklyData.map(day => day.totalTime)))}
          </div>
          <div className="text-sm text-muted-foreground">Busiest Day</div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis 
              tickFormatter={(value) => formatDuration(value)}
              label={{ value: 'Time', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              formatter={(value: number, name: string) => [
                formatDuration(value), 
                name === 'time' ? 'Time' : 'Sessions'
              ]}
              labelFormatter={(label) => `${label} (${chartData.find(d => d.name === label)?.formattedTime})`}
            />
            <Bar dataKey="time" fill="#667eea" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Breakdown Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Day</th>
              <th className="text-right py-2">Time</th>
              <th className="text-right py-2">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {weeklyData.map((day, index) => (
              <tr key={day.date} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                <td className="py-2 font-medium">{day.dayName}</td>
                <td className="py-2 text-right">{formatDuration(day.totalTime)}</td>
                <td className="py-2 text-right">{day.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
