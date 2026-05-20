// Main URL Activity Page - Enhanced with sessions, charts, and social media warnings
import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Download, Activity, List, Brain, Sparkles, Info, Share2, AlertTriangle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/providers/auth-provider';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

// Import modular components
import { FilterOptions } from './types';
import { DEFAULT_FILTER_OPTIONS, SOCIAL_MEDIA_DOMAINS } from './constants';
import { useUrlLogs } from './hooks/use-url-logs';
import { URLFilters } from './components/url-filters';
import { URLStatsCards } from './components/url-stats';
import { URLSessionsView } from './components/url-session-card';
import { URLCharts } from './components/url-charts';
import { URLGroupedView } from './components/url-grouped-view';
import { extractDomain, categorizeDomain, isSocialMedia, safeFormat } from './utils';

interface SocialMediaStat {
  domain: string;
  displayName: string;
  count: number;
  estimatedMinutes: number;
  percentage: number;
}

export default function URLActivityPage() {
  const { userDetails } = useAuth();
  const isAdmin = userDetails?.role === 'admin';

  // Filter state - default to grouping by user
  const [filters, setFilters] = useState<FilterOptions>({
    ...DEFAULT_FILTER_OPTIONS,
    groupBy: 'user', // Always default to grouping by user
  });

  // Use custom hook for data management
  const { urlLogs, users, sessions, loading, stats, refetch } = useUrlLogs(filters);

  // Calculate social media time statistics
  const socialMediaStats = useMemo(() => {
    const socialLogs = urlLogs.filter(log => {
      const domain = extractDomain(log.url || log.site_url || '');
      return isSocialMedia(domain);
    });

    // Group by domain and calculate stats
    const domainStats: Record<string, { count: number; domain: string }> = {};
    
    socialLogs.forEach(log => {
      const domain = extractDomain(log.url || log.site_url || '');
      const baseDomain = SOCIAL_MEDIA_DOMAINS.find(sm => domain.includes(sm)) || domain;
      
      if (!domainStats[baseDomain]) {
        domainStats[baseDomain] = { count: 0, domain: baseDomain };
      }
      domainStats[baseDomain].count++;
    });

    const totalSocialCount = socialLogs.length;
    const totalUrlCount = urlLogs.length;
    
    // Convert to array and calculate percentages (estimate ~2 min per visit)
    const statsArray: SocialMediaStat[] = Object.values(domainStats)
      .map(stat => ({
        domain: stat.domain,
        displayName: stat.domain.replace('.com', '').replace('.org', '').charAt(0).toUpperCase() + 
                     stat.domain.replace('.com', '').replace('.org', '').slice(1),
        count: stat.count,
        estimatedMinutes: stat.count * 2, // Estimate 2 minutes per visit
        percentage: totalSocialCount > 0 ? Math.round((stat.count / totalSocialCount) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    const totalMinutes = statsArray.reduce((sum, s) => sum + s.estimatedMinutes, 0);
    const hourThreshold = 60; // 1 hour threshold
    const isOverThreshold = totalMinutes > hourThreshold;

    return {
      platforms: statsArray.slice(0, 5), // Top 5
      totalCount: totalSocialCount,
      totalMinutes,
      totalPercentage: totalUrlCount > 0 ? Math.round((totalSocialCount / totalUrlCount) * 100) : 0,
      isOverThreshold
    };
  }, [urlLogs]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: Partial<FilterOptions>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  // Reset all filters
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTER_OPTIONS);
  };

  // Export data to CSV
  const exportData = () => {
    try {
      const csvContent = [
        ['User', 'Site', 'URL', 'Title', 'Browser', 'Category', 'Is Social Media', 'Timestamp'].join(','),
        ...urlLogs.map(log => {
          const domain = extractDomain(log.url || log.site_url || '');
          const category = categorizeDomain(domain);
          const socialMedia = isSocialMedia(domain) ? 'Yes' : 'No';
          
          return [
            log.users?.full_name || 'Unknown',
            domain,
            log.url || log.site_url || '',
            log.title || '',
            log.browser || '',
            category,
            socialMedia,
            log.started_at || log.timestamp
          ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `url-activity-${format(filters.dateRange.from, 'yyyy-MM-dd')}-to-${format(filters.dateRange.to, 'yyyy-MM-dd')}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
  };

  // Check admin access
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
          <h1 className="text-3xl font-bold">URL Activity Monitoring</h1>
          <p className="text-muted-foreground">
            Monitor and analyze website usage with social media warnings and productivity insights
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={refetch} disabled={loading} variant="outline">
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
          <Button onClick={exportData} disabled={loading}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <URLFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        users={users}
        onReset={handleResetFilters}
      />

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
                  AI-Powered Categorization
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Hugging Face
                  </Badge>
                </h3>
                <p className="text-sm text-muted-foreground">
                  URL categories are determined using Qwen3-32B and pattern matching
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
                    URL categorization combines AI analysis (Qwen3-32B via Hugging Face) with pattern-based domain matching for accurate classification of social media, work, entertainment, and other site categories.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Social Media Time Tracking */}
      {socialMediaStats.totalCount > 0 && (
        <Card className={`border-2 ${socialMediaStats.isOverThreshold 
          ? 'border-red-300 bg-gradient-to-r from-red-50/50 to-orange-50/50' 
          : 'border-amber-200 bg-gradient-to-r from-amber-50/50 to-yellow-50/50'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {socialMediaStats.isOverThreshold ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <Share2 className="h-5 w-5 text-amber-600" />
                )}
                <CardTitle className="text-lg">Social Media Time Today</CardTitle>
                {socialMediaStats.isOverThreshold && (
                  <Badge variant="destructive" className="animate-pulse">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Over 1h Threshold
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <div className={`text-3xl font-bold ${socialMediaStats.isOverThreshold ? 'text-red-600' : 'text-amber-600'}`}>
                  {socialMediaStats.totalMinutes >= 60 
                    ? `${Math.floor(socialMediaStats.totalMinutes / 60)}h ${socialMediaStats.totalMinutes % 60}m`
                    : `${socialMediaStats.totalMinutes}m`
                  }
                </div>
                <div className="text-xs text-muted-foreground">
                  {socialMediaStats.totalPercentage}% of browsing time
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Platform Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {socialMediaStats.platforms.map((platform, idx) => (
                  <div key={platform.domain} className="p-3 bg-white rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm capitalize">{platform.displayName}</span>
                      <Badge variant="outline" className={
                        idx === 0 && socialMediaStats.isOverThreshold
                          ? 'bg-red-100 text-red-700 border-red-300'
                          : 'bg-gray-100 text-gray-700 border-gray-300'
                      }>
                        {platform.count} visits
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{platform.estimatedMinutes}m estimated</span>
                        <span>{platform.percentage}%</span>
                      </div>
                      <Progress 
                        value={platform.percentage} 
                        className={`h-1.5 ${idx === 0 && socialMediaStats.isOverThreshold ? '[&>div]:bg-red-500' : '[&>div]:bg-amber-500'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary Row */}
              <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Total Visits</span>
                  </div>
                  <div className="text-xl font-bold">{socialMediaStats.totalCount}</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    {socialMediaStats.isOverThreshold ? (
                      <TrendingUp className="h-4 w-4 text-red-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-sm font-medium">vs Threshold</span>
                  </div>
                  <div className={`text-xl font-bold ${socialMediaStats.isOverThreshold ? 'text-red-600' : 'text-green-600'}`}>
                    {socialMediaStats.isOverThreshold 
                      ? `+${socialMediaStats.totalMinutes - 60}m`
                      : `${60 - socialMediaStats.totalMinutes}m left`
                    }
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Platforms</span>
                  </div>
                  <div className="text-xl font-bold">{socialMediaStats.platforms.length}</div>
                </div>
              </div>

              {/* Warning Message */}
              <div className={`p-3 rounded-lg ${
                socialMediaStats.isOverThreshold 
                  ? 'bg-red-50 border border-red-200' 
                  : 'bg-amber-50 border border-amber-200'
              }`}>
                <p className={`text-sm ${socialMediaStats.isOverThreshold ? 'text-red-700' : 'text-amber-700'}`}>
                  {socialMediaStats.isOverThreshold ? (
                    <>
                      <strong>Warning:</strong> Social media usage exceeds the 1-hour daily threshold. 
                      Consider reviewing browsing policies with the team.
                    </>
                  ) : (
                    <>
                      <strong>Note:</strong> Social media usage is within the 1-hour daily threshold. 
                      Time estimates are based on ~2 minutes per visit.
                    </>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <URLStatsCards stats={stats} loading={loading} />

      {/* Charts Section */}
      <URLCharts stats={stats} loading={loading} />

      {/* View Mode: Sessions or List/Grouped */}
      {filters.viewMode === 'sessions' ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Browsing Sessions
            </h2>
          </div>
          <URLSessionsView sessions={sessions} loading={loading} />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Recent URL Activity
                {filters.groupBy !== 'none' && (
                  <Badge variant="secondary" className="ml-2">
                    Grouped by {filters.groupBy}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {urlLogs.length} URL{urlLogs.length === 1 ? '' : 's'} found
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : urlLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No URL activity found for the selected criteria.</p>
              </div>
            ) : filters.groupBy !== 'none' ? (
              <div className="max-h-[600px] overflow-y-auto">
                <URLGroupedView 
                  urlLogs={urlLogs} 
                  groupBy={filters.groupBy} 
                  loading={loading}
                />
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {urlLogs.map((log) => {
                  const domain = extractDomain(log.url || log.site_url || '');
                  const category = categorizeDomain(domain);
                  const socialMedia = isSocialMedia(domain);

                  return (
                    <div
                      key={log.id}
                      className={`flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                        socialMedia ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs font-semibold">
                            👤 {log.users?.full_name || 'Unknown User'}
                          </Badge>
                          <span className="font-medium truncate">{domain}</span>
                          <Badge
                            variant={socialMedia ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {category}
                          </Badge>
                          {socialMedia && (
                            <Badge variant="destructive" className="text-xs">
                              ⚠️ Social Media
                            </Badge>
                          )}
                        </div>
                        {log.title && (
                          <p className="text-sm text-muted-foreground mb-1 truncate">
                            {log.title}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{safeFormat(log.started_at || log.timestamp, 'PPp')}</span>
                          {log.browser && (
                            <Badge variant="outline" className="text-xs">
                              {log.browser}
                            </Badge>
                          )}
                          {log.users?.email && (
                            <span className="truncate">{log.users.email}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

