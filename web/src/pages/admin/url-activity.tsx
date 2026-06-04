import { useState, useEffect } from 'react';
import { fetchUrlLogs } from '@/domains/monitoring/services/url-logs.service';
import { fetchOrgUsers } from '@/domains/people';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, Filter, Search, TrendingUp, Clock, Globe, User } from 'lucide-react';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface URLLog {
  id: string;
  url: string;
  title?: string | null;
  user_id: string;
  timestamp: string;
  domain?: string | null;
  browser?: string | null;
  time_log_id?: string | null;
  users?: {
    full_name: string;
    email: string;
  } | null;
}

interface URLStats {
  totalTime: number;
  totalSites: number;
  topSites: Array<{ site: string; time: number; visits: number; }>;
  categoryBreakdown: Array<{ category: string; time: number; }>;
  userActivity: Array<{ user: string; time: number; sites: number; }>;
  browserBreakdown: Array<{ browser: string; time: number; visits: number; }>;
}

export default function URLActivity() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [urlLogs, setUrlLogs] = useState<URLLog[]>([]);
  const [stats, setStats] = useState<URLStats>({
    totalTime: 0,
    totalSites: 0,
    topSites: [],
    categoryBreakdown: [],
    userActivity: [],
    browserBreakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
    to: new Date()
  });
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);

  useEffect(() => {
    fetchUsers();
    fetchURLLogs();
  }, [dateRange, selectedUser]);

  const fetchUsers = async () => {
    try {
      const data = await fetchOrgUsers(
        { organizationId, isSuperAdmin },
        { roles: ['employee', 'admin', 'manager'] },
      );
      setUsers(
        data.map((u) => ({
          id: u.id,
          full_name: u.full_name || u.email,
          email: u.email,
        })),
      );
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchURLLogs = async () => {
    try {
      setLoading(true);

      const data = await fetchUrlLogs(
        dateRange.from,
        dateRange.to,
        { organizationId, isSuperAdmin },
        selectedUser || undefined,
      );

      const userById = new Map(users.map((u) => [u.id, u]));

      const logs: URLLog[] = (data || []).map((log) => ({
        ...log,
        url: log.url || (log as { site_url?: string }).site_url || '',
        timestamp: log.timestamp || log.started_at || '',
        users: log.user_id
          ? {
              full_name: userById.get(log.user_id)?.full_name || 'Unknown',
              email: userById.get(log.user_id)?.email || '',
            }
          : null,
      })) as URLLog[];

      setUrlLogs(logs);

      // Calculate stats (estimate time based on entries since we don't have duration)
      const totalTime = logs.length * 60; // Estimate 1 minute per URL visit
      const uniqueSites = new Set(logs.map(log => getDomainFromUrl(log.url))).size;

      // Top sites by domain
      const siteStats = new Map<string, { time: number; visits: number }>();
      logs.forEach(log => {
        const domain = getDomainFromUrl(log.url);
        const current = siteStats.get(domain) || { time: 0, visits: 0 };
        siteStats.set(domain, {
          time: current.time + 60, // Estimate 1 minute per visit
          visits: current.visits + 1
        });
      });

      const topSites = Array.from(siteStats.entries())
        .map(([site, data]) => ({ site, ...data }))
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 10);

      // Category breakdown (simplified)
      const categoryStats = new Map<string, number>();
      logs.forEach(log => {
        const category = getCategoryFromDomain(getDomainFromUrl(log.url));
        const current = categoryStats.get(category) || 0;
        categoryStats.set(category, current + 60); // Estimate 1 minute per visit
      });

      const categoryBreakdown = Array.from(categoryStats.entries())
        .map(([category, time]) => ({ category, time }))
        .sort((a, b) => b.time - a.time);

      // User activity
      const userStats = new Map<string, { time: number; sites: Set<string> }>();
      logs.forEach(log => {
        const userName = log.users?.full_name || 'Unknown User';
        const domain = getDomainFromUrl(log.url);
        const current = userStats.get(userName) || { time: 0, sites: new Set() };
        current.sites.add(domain);
        userStats.set(userName, {
          time: current.time + 60, // Estimate 1 minute per visit
          sites: current.sites
        });
      });

      const userActivity = Array.from(userStats.entries())
        .map(([user, data]) => ({ user, time: data.time, sites: data.sites.size }))
        .sort((a, b) => b.time - a.time);

      // Browser distribution
      const browserStats = new Map<string, { time: number; visits: number }>();
      logs.forEach(log => {
        const browser = log.browser || 'Unknown';
        const current = browserStats.get(browser) || { time: 0, visits: 0 };
        browserStats.set(browser, {
          time: current.time + 60, // Estimate 1 minute per visit
          visits: current.visits + 1
        });
      });

      const browserBreakdown = Array.from(browserStats.entries())
        .map(([browser, data]) => ({ browser, ...data }))
        .sort((a, b) => b.visits - a.visits);

      setStats({
        totalTime,
        totalSites: uniqueSites,
        topSites,
        categoryBreakdown,
        userActivity,
        browserBreakdown
      });

    } catch (error) {
      console.error('Error fetching URL logs:', error);
    } finally {
      setLoading(false);
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

  const exportData = () => {
    const csvContent = [
      ['User', 'Site', 'URL', 'Title', 'Started', 'Duration', 'Category'].join(','),
      ...urlLogs.map(log => [
        log.users?.full_name || 'Unknown',
        log.domain || '',
        log.url || '',
        log.title || '',
        log.timestamp,
        formatDuration(60), // Assuming 60 seconds for each entry for export
        getCategoryFromDomain(log.domain || '') // Assuming a default category for export
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `url-activity-${format(dateRange.from, 'yyyy-MM-dd')}-to-${format(dateRange.to, 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredLogs = urlLogs.filter(log => 
    (log.domain && log.domain.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (log.title && log.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (log.users?.full_name && log.users.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">URL Activity Monitoring</h1>
          <p className="text-muted-foreground">Monitor and analyze website usage across your team</p>
        </div>
        <Button onClick={exportData} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col space-y-2">
            <Label>Date Range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-[300px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to });
                    }
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col space-y-2">
            <Label>Employee Filter</Label>
            <EmployeeFilterCombobox
              value={selectedUser || 'all'}
              onValueChange={(value) => setSelectedUser(value === 'all' ? '' : value)}
              users={users}
              allLabel="All Employees"
            />
          </div>

          <div className="flex flex-col space-y-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sites, titles, or users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview - Enhanced */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Time</CardTitle>
            <Clock className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{formatDuration(stats.totalTime)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Time spent on websites
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Sites</CardTitle>
            <Globe className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.totalSites}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Different websites visited
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
            <TrendingUp className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{urlLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Website sessions recorded
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <User className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.userActivity.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Users with activity
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Browsers Used</CardTitle>
            <Globe className="h-5 w-5 text-pink-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-600">{stats.browserBreakdown.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Different browsers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top URLs Section - Similar to Top Apps */}
      {stats.topSites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top URLs by Usage
            </CardTitle>
            <CardDescription>Most visited websites ranked by time spent and visit count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topSites.slice(0, 10).map((site, index) => (
                <div key={site.site} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${
                      index === 0 ? 'text-yellow-600' : 
                      index === 1 ? 'text-gray-500' : 
                      index === 2 ? 'text-amber-700' : 
                      'text-muted-foreground'
                    }`}>
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{site.site}</div>
                      <div className="text-sm text-muted-foreground">{site.visits} visits</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg">{formatDuration(site.time)}</div>
                    <Badge className={
                      getCategoryFromDomain(site.site) === 'Entertainment' ? 'bg-red-100 text-red-800' :
                      getCategoryFromDomain(site.site) === 'Development' ? 'bg-green-100 text-green-800' :
                      getCategoryFromDomain(site.site) === 'Search' ? 'bg-blue-100 text-blue-800' :
                      getCategoryFromDomain(site.site) === 'Communication' ? 'bg-purple-100 text-purple-800' :
                      getCategoryFromDomain(site.site) === 'Social Media' ? 'bg-pink-100 text-pink-800' :
                      'bg-gray-100 text-gray-800'
                    } variant="outline">
                      {getCategoryFromDomain(site.site)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Websites by Time</CardTitle>
            <CardDescription>Most visited websites by total time spent</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.topSites.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="site" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => [formatDuration(value), 'Time Spent']}
                />
                <Bar dataKey="time" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>Time distribution across website categories</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="time"
                  label={({ category, percent }: { category: string; percent: number }) => 
                    `${category} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {stats.categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatDuration(value), 'Time']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Browser Usage</CardTitle>
            <CardDescription>Activity distributed by browser type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.browserBreakdown}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#82ca9d"
                  dataKey="visits"
                  label={({ browser, percent }: { browser: string; percent: number }) => 
                    `${browser} (${(percent * 100).toFixed(0)}%)`
                  }
                >
                  {stats.browserBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number, name: string) => {
                    if (name === 'visits') return [value, 'Visits'];
                    return [value, name];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent URL Activity</CardTitle>
          <CardDescription>
            Latest website visits ({filteredLogs.length} of {urlLogs.length} sessions)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No URL activity found for the selected criteria.
                </p>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{log.domain}</span>
                        {/* Assuming a default category for display */}
                        <Badge variant="secondary" className="text-xs">
                          {getCategoryFromDomain(log.domain || '')}
                        </Badge>
                      </div>
                      {log.title && (
                        <p className="text-sm text-muted-foreground mb-1">{log.title}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{log.users?.full_name || 'Unknown User'}</span>
                        <span>{format(new Date(log.timestamp), 'PPp')}</span>
                        {log.browser && <span>{log.browser}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {formatDuration(60)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper function to extract domain from URL
const getDomainFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return url;
  }
};

// Helper function to categorize domains
const getCategoryFromDomain = (domain: string): string => {
  if (domain.includes('youtube') || domain.includes('netflix') || domain.includes('spotify')) {
    return 'Entertainment';
  } else if (domain.includes('github') || domain.includes('stackoverflow') || domain.includes('developer')) {
    return 'Development';
  } else if (domain.includes('google') || domain.includes('bing') || domain.includes('duckduckgo')) {
    return 'Search';
  } else if (domain.includes('slack') || domain.includes('teams') || domain.includes('zoom')) {
    return 'Communication';
  } else if (domain.includes('facebook') || domain.includes('twitter') || domain.includes('linkedin')) {
    return 'Social Media';
  }
  return 'Other';
};
