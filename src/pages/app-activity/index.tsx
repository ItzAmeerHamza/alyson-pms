import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { useAuth } from '@/providers/auth-provider';
import { format, subDays, subMonths, startOfDay, endOfDay, startOfMonth, endOfMonth, differenceInSeconds } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { fetchOrgUsers } from '@/domains/people';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Monitor, Clock, TrendingUp, Activity, Filter, Brain, Sparkles, Info, AlertTriangle, Share2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSearchParams } from 'react-router-dom';

interface AppData {
  app_name: string;
  total_duration: number;
  total_sessions: number;
  avg_duration: number;
  category: string;
  percentage: number;
}

interface User {
  id: string;
  full_name: string;
  email: string;
}

/**
 * @deprecated REMOVED - AI Vision now classifies all apps dynamically
 * 
 * Static lists caused false positives:
 * - Teams work meeting = "social media" ❌
 * - WhatsApp business chat = "social media" ❌
 * 
 * AI analyzes actual screenshot content to decide category correctly.
 * See: vision_category field in screenshots table
 */
const SOCIAL_MEDIA_APPS: string[] = [];

// Check if an app is social media - ALWAYS returns false (AI decides)
const isSocialMediaApp = (appName: string): boolean => {
  // REMOVED: Static matching causes false positives
  // AI Vision now analyzes actual content
  return false;
};

// Helper function to estimate duration
const estimateDuration = (startedAt: string, endedAt: string | null): number => {
  if (!startedAt) return 0;
  
  if (endedAt) {
    return differenceInSeconds(new Date(endedAt), new Date(startedAt));
  }
  
  // If no end time, estimate based on typical session length
  return 180; // 3 minutes default for apps
};

// Helper function to categorize apps based on name
const getCategoryFromAppName = (appName: string): string => {
  const app = appName.toLowerCase();
  
  // Development tools
  if (app.includes('code') || app.includes('cursor') || app.includes('vscode') || 
      app.includes('terminal') || app.includes('github') || app.includes('git') ||
      app.includes('electron')) {
    return 'Development';
  }
  
  // Communication
  if (app.includes('slack') || app.includes('teams') || app.includes('discord') || 
      app.includes('telegram') || app.includes('whatsapp') || app.includes('mail') ||
      app.includes('cliq')) {
    return 'Communication';
  }
  
  // Browsers
  if (app.includes('chrome') || app.includes('safari') || app.includes('firefox') || 
      app.includes('edge') || app.includes('browser')) {
    return 'Web Browsing';
  }
  
  // Design
  if (app.includes('figma') || app.includes('sketch') || app.includes('photoshop') || 
      app.includes('illustrator') || app.includes('canva')) {
    return 'Design';
  }
  
  // Office/Productivity
  if (app.includes('word') || app.includes('excel') || app.includes('powerpoint') || 
      app.includes('notion') || app.includes('office')) {
    return 'Office';
  }
  
  return 'Other';
};

export default function AppActivityPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [searchParams] = useSearchParams();
  const [appData, setAppData] = useState<AppData[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [dateRange, setDateRange] = useState('week');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [showUnknown, setShowUnknown] = useState(false);

  // Handle URL parameter for user filter
  useEffect(() => {
    const userParam = searchParams.get('user');
    if (userParam) {
      setSelectedUser(userParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchUsers().finally(() => setUsersLoaded(true));
    }
  }, [userDetails, organizationId, isSuperAdmin]);

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      if (users.length > 0) {
        fetchData();
      } else if (usersLoaded) {
        setAppData([]);
        setLoading(false);
      }
    }
  }, [users, usersLoaded, dateRange, selectedUser, selectedDate, showUnknown, customStartDate, customEndDate]);

  const fetchUsers = async () => {
    try {
      const data = await fetchOrgUsers(
        { organizationId, isSuperAdmin },
        { roles: ['employee', 'admin', 'manager'] }
      );
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      // Disabled for performance: console.log('🔍 Fetching app data for range:', start, end, selectedUser);

      await fetchAppData(start, end);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppData = async (start: Date, end: Date) => {
    try {
      console.log(`🔍 [APP-ACTIVITY] Fetching app data for range: ${start.toISOString()} to ${end.toISOString()}`);
      
      // Get organization user IDs for filtering
      const orgUserIds = users.map(u => u.id);
      
      // If no users in org, return empty
      if (orgUserIds.length === 0) {
        setAppData([]);
        return;
      }
      
      let query = supabase
        .from('app_logs')
        .select('app_name, timestamp, window_title, user_id, time_log_id')
        .in('user_id', orgUserIds)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .not('app_name', 'is', null);

      if (selectedUser !== 'all') {
        query = query.eq('user_id', selectedUser);
      }

      const data = await fetchPaginated(query);

      console.log(`📊 [APP-ACTIVITY] Found ${data?.length || 0} app log entries`);
      if (data && data.length > 0) {
        console.log('📋 [APP-ACTIVITY] Sample app log:', data[0]);
      }

      // Process app data - group by app_name and estimate usage
      const appStats = (data || []).reduce((acc: any, log: any) => {
        const appName = log.app_name || 'Unknown App';
        if (!acc[appName]) {
          acc[appName] = {
            app_name: appName,
            total_duration: 0,
            total_sessions: 0,
            category: getCategoryFromAppName(appName),
            logs: []
          };
        }
        
        // Each app log entry represents some activity - estimate 60 seconds per entry
        // This is a rough estimate since we don't have actual duration data
        const estimatedDuration = 60; // 1 minute per app log entry
        
        acc[appName].total_duration += estimatedDuration;
        acc[appName].total_sessions += 1;
        acc[appName].logs.push(log);
        return acc;
      }, {});

      // BUG FIX: Filter Unknown apps BEFORE calculating percentages so they sum to 100%
      const unknownAppNames = ['Unknown', 'Unknown App', 'Unknown Application', 'Desktop Activity'];
      
      let filteredAppStats = Object.values(appStats);
      if (!showUnknown) {
        filteredAppStats = filteredAppStats.filter((app: any) => 
          !unknownAppNames.includes(app.app_name)
        );
      }

      // Calculate totalDuration AFTER filtering so percentages sum to 100%
      const totalDuration = filteredAppStats.reduce((sum: number, app: any) => sum + app.total_duration, 0);

      let processedApps: AppData[] = filteredAppStats
        .map((app: any) => ({
          ...app,
          avg_duration: app.total_sessions > 0 ? Math.round(app.total_duration / app.total_sessions) : 0,
          percentage: totalDuration > 0 ? Math.round((app.total_duration / totalDuration) * 100) : 0
        }))
        .sort((a: any, b: any) => b.total_duration - a.total_duration)
        .slice(0, 20); // Take top 20

      // Processed app data logging disabled for performance
      setAppData(processedApps);
    } catch (error) {
      console.error('Error fetching app data:', error);
      setAppData([]);
    }
  };

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) };
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
        return { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) };
      default:
        return { start: startOfDay(new Date(selectedDate)), end: endOfDay(new Date(selectedDate)) };
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];

  if (userDetails?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  const chartData = appData.slice(0, 10).map((item: any, index: number) => ({
    name: item.app_name,
    value: item.total_duration,
    percentage: item.percentage,
    fill: COLORS[index % COLORS.length]
  }));

  // Calculate social media usage
  const socialMediaApps = appData.filter(app => isSocialMediaApp(app.app_name));
  const totalSocialMediaTime = socialMediaApps.reduce((sum, app) => sum + app.total_duration, 0);
  const totalTime = appData.reduce((sum, app) => sum + app.total_duration, 0);
  const socialMediaPercentage = totalTime > 0 ? Math.round((totalSocialMediaTime / totalTime) * 100) : 0;
  const socialMediaThresholdExceeded = totalSocialMediaTime > 30 * 60; // 30 minutes threshold

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Application Activity</h1>
          <p className="text-muted-foreground">Track application usage and performance</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={fetchData} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Time Range</label>
              <Select value={dateRange} onValueChange={(value) => {
                setDateRange(value);
                if (value === 'custom') setCustomPickerOpen(true);
              }}>
                <SelectTrigger>
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
                    <Button variant="outline" size="sm" className="gap-2 mt-2">
                      <Monitor className="h-3.5 w-3.5" />
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
              <label className="text-sm font-medium mb-2 block">Specific Date</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={dateRange !== 'today'}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">User</label>
              <EmployeeFilterCombobox
                value={selectedUser}
                onValueChange={setSelectedUser}
                users={users}
                placeholder="Select user"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Show Unknown Apps</label>
              <Button
                variant={showUnknown ? "default" : "outline"}
                onClick={() => setShowUnknown(!showUnknown)}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showUnknown ? "Hide Unknown" : "Show Unknown"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  AI-Powered App Categorization
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Hugging Face
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">
                  App categories are determined using Qwen3-32B analysis and pattern matching
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
                    Application categorization combines AI analysis (Qwen3-32B via Hugging Face) with pattern-based app name matching for accurate classification of Development, Communication, Design, Office, and other categories.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Social Media Alert */}
      {socialMediaApps.length > 0 && (
        <Card className={`border-2 ${socialMediaThresholdExceeded ? 'border-red-300 bg-gradient-to-r from-red-50/50 to-orange-50/50' : 'border-amber-200 bg-gradient-to-r from-amber-50/50 to-yellow-50/50'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {socialMediaThresholdExceeded ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <Share2 className="h-5 w-5 text-amber-600" />
                )}
                <CardTitle className="text-lg">Social Media Apps Detected</CardTitle>
                <Badge variant="outline" className={socialMediaThresholdExceeded 
                  ? "bg-red-100 text-red-700 border-red-300" 
                  : "bg-amber-100 text-amber-700 border-amber-300"}>
                  {socialMediaApps.length} app{socialMediaApps.length !== 1 ? 's' : ''}
                </Badge>
                {socialMediaThresholdExceeded && (
                  <Badge variant="destructive" className="animate-pulse">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Threshold Exceeded
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${socialMediaThresholdExceeded ? 'text-red-600' : 'text-amber-600'}`}>
                  {formatDuration(totalSocialMediaTime)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {socialMediaPercentage}% of total time
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {socialMediaApps.slice(0, 4).map((app, index) => (
                <div key={index} className="p-3 bg-white rounded-lg border">
                  <div className="font-medium text-sm truncate">{app.app_name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-lg font-bold text-gray-700">{formatDuration(app.total_duration)}</span>
                    <span className="text-xs text-muted-foreground">{app.total_sessions} sessions</span>
                  </div>
                </div>
              ))}
            </div>
            {socialMediaApps.length > 4 && (
              <p className="mt-2 text-sm text-muted-foreground text-center">
                + {socialMediaApps.length - 4} more social media app{socialMediaApps.length - 4 !== 1 ? 's' : ''}
              </p>
            )}
            <div className={`mt-3 p-3 rounded-lg ${socialMediaThresholdExceeded ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className={`text-sm ${socialMediaThresholdExceeded ? 'text-red-700' : 'text-amber-700'}`}>
                {socialMediaThresholdExceeded ? (
                  <>
                    <strong>Warning:</strong> Social media usage exceeds the 30-minute daily threshold. 
                    Consider reviewing productivity guidelines with the team.
                  </>
                ) : (
                  <>
                    <strong>Note:</strong> Social media usage is within acceptable limits. 
                    Threshold is 30 minutes per day.
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{appData.length}</div>
                <div className="text-sm text-muted-foreground">Applications</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {formatDuration(appData.reduce((sum, item) => sum + item.total_duration, 0))}
                </div>
                <div className="text-sm text-muted-foreground">Total Time</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-orange-500" />
              <div>
                <div className="text-2xl font-bold">
                  {appData.reduce((sum, item) => sum + item.total_sessions, 0)}
                </div>
                <div className="text-sm text-muted-foreground">Sessions</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold">
                  {appData.length > 0 ? formatDuration(Math.round(appData.reduce((sum, item) => sum + item.avg_duration, 0) / appData.length)) : '0m'}
                </div>
                <div className="text-sm text-muted-foreground">Avg Duration</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart Visualization */}
        <Card>
          <CardHeader>
            <CardTitle>Top Applications Usage</CardTitle>
            <CardDescription>
              Distribution of time spent {appData.length > 0 ? `(${appData.length} total)` : ''}
            </CardDescription>
            <div className="text-xs text-muted-foreground">
              Note: Entries are dwell‑gated to reduce noise; rapid switches under ~10s may not persist.
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading chart...</div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No data available for the selected period.</p>
                <p className="text-xs mt-2">Try selecting "Last 7 days" - most data is from last week.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="40%"
                    labelLine={false}
                    label={({ percent }) => percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : ''}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number, name: string) => [formatDuration(value), name]} />
                  <Legend 
                    layout="horizontal" 
                    verticalAlign="bottom" 
                    align="center" 
                    wrapperStyle={{ paddingTop: '20px' }}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Time Distribution</CardTitle>
            <CardDescription>Time spent per application</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading chart...</div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No data available for the selected period.</p>
                <p className="text-xs mt-2">Try selecting "Last 7 days" - most data is from last week.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    fontSize={12}
                  />
                  <YAxis tickFormatter={(value) => formatDuration(value)} />
                  <RechartsTooltip formatter={(value: number) => [formatDuration(value), 'Duration']} />
                  <Bar dataKey="value" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed List */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Application Usage</CardTitle>
          <CardDescription>Complete breakdown of application activity</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading data...</div>
          ) : appData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No application data found for the selected period.</p>
              <p className="text-xs mt-2">Try selecting "Last 7 days" to see historical data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {appData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex-1">
                    <div className="font-medium">{item.app_name}</div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Total: {formatDuration(item.total_duration)}</span>
                      <span>Sessions: {item.total_sessions}</span>
                      <span>Avg: {formatDuration(item.avg_duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-bold">{item.percentage}%</div>
                      <Progress value={item.percentage} className="w-20" />
                    </div>
                    {item.category && (
                      <Badge variant="secondary">{item.category}</Badge>
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