/**
 * EmployeeDetailsModal Component
 * 
 * Comprehensive modal for viewing detailed employee analysis including:
 * - Activity Overview (hourly timeline)
 * - URL Analysis (domains, social media, time spent)
 * - App Analysis (applications used, productivity vs distraction)
 * - Screenshot Issues (duplicates, low activity, AI comments)
 */

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { 
  Activity, 
  Globe, 
  Smartphone, 
  Image, 
  Copy, 
  BarChart3, 
  Clock, 
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Eye,
  ShoppingCart,
  PauseCircle,
  ZoomIn,
  X as XIcon
} from 'lucide-react';
import { AI_CONTENT_PATTERNS } from '@/pages/screenshots/constants';
import { SOCIAL_MEDIA_DOMAINS, ENTERTAINMENT_DOMAINS } from '@/pages/admin/url-activity/constants';
import { AIInsight, getPerformanceStatus, getPerformanceStatusBadge } from './compact-employee-card';

interface EmployeeDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insight: AIInsight | null;
}

// Data interfaces
interface TimelineData {
  hour: string;
  work: number;
  idle: number;
  dup: number;
}

interface DuplicateGroup {
  hash: string;
  count: number;
  screenshots: Array<{ id: string; image_url: string; captured_at: string }>;
  time_range: { start: Date; end: Date } | null;
}

interface LowActivityShot {
  id: string;
  image_url: string;
  activity_percent: number;
  captured_at: string;
  app_name: string;
}

interface SocialApp {
  name: string;
  count: number;
  screenshots: Array<{ id: string; image_url: string; captured_at: string }>;
}

interface SocialUrl {
  domain: string;
  count: number;
  time_spent: number;
}

interface TopApp {
  name: string;
  value: number;
  fill: string;
}

interface TopUrl {
  domain: string;
  visits: number;
  time_spent: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];

export function EmployeeDetailsModal({ open, onOpenChange, insight }: EmployeeDetailsModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('activity');
  
  // Data states
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [duplicateShots, setDuplicateShots] = useState<DuplicateGroup[]>([]);
  const [lowActivityShots, setLowActivityShots] = useState<LowActivityShot[]>([]);
  const [socialApps, setSocialApps] = useState<SocialApp[]>([]);
  const [socialUrls, setSocialUrls] = useState<SocialUrl[]>([]);
  const [topApps, setTopApps] = useState<TopApp[]>([]);
  const [topUrls, setTopUrls] = useState<TopUrl[]>([]);
  const [recentShots, setRecentShots] = useState<Array<{ id: string; url?: string; analyzed_at: string; category?: string; idle?: boolean }>>([]);
  const [nonProdShots, setNonProdShots] = useState<Array<{ id: string; image_url: string; captured_at: string; vision_category: string; app_name: string }>>([]);
  const [idleShots, setIdleShots] = useState<Array<{ id: string; image_url: string; captured_at: string; app_name: string }>>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Load data when modal opens
  useEffect(() => {
    if (open && insight) {
      loadAllData(insight);
    }
  }, [open, insight]);

  const loadAllData = async (insight: AIInsight) => {
    setLoading(true);
    try {
      const start = new Date(insight.period_start).toISOString();
      const end = new Date(insight.period_end).toISOString();

      // Load all data in parallel
      await Promise.all([
        loadTimelineData(insight.user_id, start, end),
        loadAppData(insight.user_id, start, end),
        loadUrlData(insight.user_id, start, end),
        loadScreenshotIssues(insight.user_id, start, end)
      ]);
    } catch (error) {
      console.error('Error loading employee details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTimelineData = async (userId: string, start: string, end: string) => {
    const { data } = await supabase
      .from('screenshots')
      .select('id, image_url, ai_analyzed_at, idle_inferred, category, is_duplicate, activity_percent, captured_at')
      .eq('user_id', userId)
      .gte('captured_at', start)
      .lte('captured_at', end)
      .order('captured_at', { ascending: false });

    // Build hourly timeline
    const buckets: Record<string, { work: number; idle: number; dup: number }> = {};
    (data || []).forEach((row: any) => {
      const dt = new Date(row.captured_at);
      const key = `${dt.getHours().toString().padStart(2, '0')}:00`;
      if (!buckets[key]) buckets[key] = { work: 0, idle: 0, dup: 0 };
      if (row.is_duplicate) buckets[key].dup += 1;
      else if (row.idle_inferred) buckets[key].idle += 1;
      else buckets[key].work += 1;
    });

    const series = Object.entries(buckets)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([hour, vals]) => ({ hour, ...vals }));
    setTimeline(series);

    // Recent screenshots
    const latest = (data || [])
      .slice(0, 12)
      .map((r: any) => ({ 
        id: r.id, 
        url: r.image_url, 
        analyzed_at: r.captured_at, 
        category: r.category, 
        idle: r.idle_inferred 
      }));
    setRecentShots(latest);
  };

  const loadAppData = async (userId: string, start: string, end: string) => {
    const { data: appLogs } = await supabase
      .from('app_logs')
      .select('app_name')
      .eq('user_id', userId)
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(1000);

    // Top apps
    const appCounts: Record<string, number> = {};
    (appLogs || []).forEach((r: any) => {
      const name = r.app_name || 'Unknown';
      appCounts[name] = (appCounts[name] || 0) + 1;
    });

    const appArr = Object.entries(appCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value], i) => ({ name, value: Number(value), fill: COLORS[i % COLORS.length] }));
    setTopApps(appArr);

    // Detect social media apps
    const socialMediaApps = AI_CONTENT_PATTERNS.social_media.apps;
    const { data: screenshots } = await supabase
      .from('screenshots')
      .select('id, image_url, app_name, captured_at, is_duplicate')
      .eq('user_id', userId)
      .gte('captured_at', start)
      .lte('captured_at', end);

    const appsMap: Record<string, any[]> = {};
    (screenshots || []).forEach((r: any) => {
      if (!r.app_name || r.is_duplicate) return;
      const appNameLower = r.app_name.toLowerCase();
      const matchedApp = socialMediaApps.find(socialApp => 
        appNameLower.includes(socialApp.toLowerCase())
      );
      if (matchedApp) {
        const appKey = matchedApp.charAt(0).toUpperCase() + matchedApp.slice(1);
        if (!appsMap[appKey]) appsMap[appKey] = [];
        appsMap[appKey].push({
          id: r.id,
          image_url: r.image_url,
          captured_at: r.captured_at
        });
      }
    });

    const socialAppsData = Object.entries(appsMap)
      .map(([name, screenshots]) => ({
        name,
        count: screenshots.length,
        screenshots: screenshots.slice(0, 3)
      }))
      .sort((a, b) => b.count - a.count);
    setSocialApps(socialAppsData);
  };

  const loadUrlData = async (userId: string, start: string, end: string) => {
    const { data: urlData } = await supabase
      .from('url_logs')
      .select('url, domain, timestamp, duration_seconds')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .limit(1000);

    // Top domains
    const domainCounts: Record<string, { visits: number; time_spent: number }> = {};
    const socialUrlsMap: Record<string, { count: number; time_spent: number }> = {};

    (urlData || []).forEach((r: any) => {
      let domain = r.domain;
      if (!domain && r.url) {
        try {
          domain = new URL(r.url).hostname.replace('www.', '');
        } catch (e) {
          return;
        }
      }
      if (!domain) return;

      // Track all domains
      if (!domainCounts[domain]) {
        domainCounts[domain] = { visits: 0, time_spent: 0 };
      }
      domainCounts[domain].visits += 1;
      domainCounts[domain].time_spent += r.duration_seconds || 0;

      // Track social/entertainment
      const isSocialMedia = SOCIAL_MEDIA_DOMAINS.some(sd => 
        domain.includes(sd) || sd.includes(domain)
      );
      const isEntertainment = ENTERTAINMENT_DOMAINS.some(ed => 
        domain.includes(ed) || ed.includes(domain)
      );

      if (isSocialMedia || isEntertainment) {
        if (!socialUrlsMap[domain]) {
          socialUrlsMap[domain] = { count: 0, time_spent: 0 };
        }
        socialUrlsMap[domain].count += 1;
        socialUrlsMap[domain].time_spent += r.duration_seconds || 0;
      }
    });

    // Top URLs
    const topUrlsData = Object.entries(domainCounts)
      .map(([domain, data]) => ({
        domain,
        visits: data.visits,
        time_spent: Math.round(data.time_spent / 60)
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);
    setTopUrls(topUrlsData);

    // Social URLs
    const socialUrlsData = Object.entries(socialUrlsMap)
      .map(([domain, data]) => ({
        domain,
        count: data.count,
        time_spent: Math.round(data.time_spent / 60)
      }))
      .sort((a, b) => b.time_spent - a.time_spent)
      .slice(0, 10);
    setSocialUrls(socialUrlsData);
  };

  const loadScreenshotIssues = async (userId: string, start: string, end: string) => {
    const { data } = await supabase
      .from('screenshots')
      .select('id, image_url, captured_at, is_duplicate, duplicate_group_hash, activity_percent, app_name, idle_inferred, vision_category')
      .eq('user_id', userId)
      .gte('captured_at', start)
      .lte('captured_at', end);

    // Duplicate groups
    const duplicatesMap: Record<string, any[]> = {};
    (data || []).forEach((r: any) => {
      if (r.is_duplicate && r.duplicate_group_hash && r.image_url) {
        if (!duplicatesMap[r.duplicate_group_hash]) {
          duplicatesMap[r.duplicate_group_hash] = [];
        }
        duplicatesMap[r.duplicate_group_hash].push({
          id: r.id,
          image_url: r.image_url,
          captured_at: r.captured_at
        });
      }
    });

    const duplicateGroups = Object.entries(duplicatesMap)
      .map(([hash, screenshots]) => ({
        hash,
        count: screenshots.length,
        screenshots: screenshots.slice(0, 4),
        time_range: screenshots.length > 0 ? {
          start: new Date(Math.min(...screenshots.map((s: any) => new Date(s.captured_at).getTime()))),
          end: new Date(Math.max(...screenshots.map((s: any) => new Date(s.captured_at).getTime())))
        } : null
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setDuplicateShots(duplicateGroups);

    // Low activity
    const lowActivity = (data || [])
      .filter((r: any) => !r.is_duplicate && r.activity_percent != null && r.activity_percent < 30 && r.image_url)
      .sort((a: any, b: any) => a.activity_percent - b.activity_percent)
      .slice(0, 12)
      .map((r: any) => ({
        id: r.id,
        image_url: r.image_url,
        activity_percent: r.activity_percent,
        captured_at: r.captured_at,
        app_name: r.app_name || 'Unknown'
      }));
    setLowActivityShots(lowActivity);

    // Non-productive category screenshots (shopping, gaming, social_media, entertainment)
    const nonProdCategories = ['social_media', 'entertainment', 'gaming', 'shopping'];
    const nonProd = (data || [])
      .filter((r: any) => r.vision_category && nonProdCategories.includes(r.vision_category) && r.image_url)
      .sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
      .slice(0, 12)
      .map((r: any) => ({
        id: r.id,
        image_url: r.image_url,
        captured_at: r.captured_at,
        vision_category: (r.vision_category || '').replace('_', ' '),
        app_name: r.app_name || 'Unknown'
      }));
    setNonProdShots(nonProd);

    // Idle screenshots
    const idle = (data || [])
      .filter((r: any) => r.idle_inferred && r.image_url && !r.is_duplicate)
      .sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
      .slice(0, 12)
      .map((r: any) => ({
        id: r.id,
        image_url: r.image_url,
        captured_at: r.captured_at,
        app_name: r.app_name || 'Unknown'
      }));
    setIdleShots(idle);
  };

  if (!insight) return null;

  const performanceStatus = getPerformanceStatus(insight);
  const statusBadge = getPerformanceStatusBadge(performanceStatus);
  const StatusIcon = statusBadge.icon;

  const totalDuplicates = duplicateShots.reduce((sum, g) => sum + g.count, 0);
  const hasIssues = duplicateShots.length > 0 || lowActivityShots.length > 0 || nonProdShots.length > 0 || idleShots.length > 0 || socialApps.length > 0 || socialUrls.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>{insight.users?.full_name || 'Unknown User'}</span>
              <Badge variant="outline" className={statusBadge.className}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusBadge.label}
              </Badge>
              <span className={`text-2xl font-bold ${
                insight.productivity_score >= 80 ? 'text-green-600' :
                insight.productivity_score >= 60 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {insight.productivity_score}%
              </span>
            </div>
            <span className="text-sm font-normal text-gray-500">
              {format(new Date(insight.period_start), 'MMM dd')} - {format(new Date(insight.period_end), 'MMM dd, yyyy')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="activity" className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="urls" className="flex items-center gap-1">
              <Globe className="h-4 w-4" />
              URLs
              {socialUrls.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{socialUrls.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="apps" className="flex items-center gap-1">
              <Smartphone className="h-4 w-4" />
              Apps
              {socialApps.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{socialApps.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="screenshots" className="flex items-center gap-1">
              <Image className="h-4 w-4" />
              Issues
              {hasIssues && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                  {duplicateShots.length + (lowActivityShots.length > 0 ? 1 : 0)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 mt-4 overflow-y-auto min-h-0">
            {/* Activity Tab */}
            <TabsContent value="activity" className="m-0 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hourly Activity Timeline</CardTitle>
                  <CardDescription>Work, idle, and duplicate screenshots by hour</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center text-gray-500">Loading...</div>
                  ) : timeline.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-gray-500">No activity data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={timeline}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="work" stackId="a" fill="#4ade80" name="Work" />
                        <Bar dataKey="idle" stackId="a" fill="#fbbf24" name="Idle" />
                        <Bar dataKey="dup" stackId="a" fill="#a78bfa" name="Duplicate" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Recent Screenshots */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent Screenshots</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentShots.length === 0 ? (
                    <div className="text-gray-500 text-sm">No screenshots</div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {recentShots.slice(0, 8).map(s => (
                        <div key={s.id} className={`relative border rounded overflow-hidden ${s.url ? 'cursor-pointer group/thumb' : ''}`} onClick={() => s.url && setLightboxUrl(s.url)}>
                          {s.url ? (
                            <img src={s.url} alt="screenshot" className="w-full h-20 object-cover" />
                          ) : (
                            <div className="w-full h-20 bg-gray-100 flex items-center justify-center text-xs text-gray-500">No image</div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 text-[10px] bg-black/60 text-white px-1">
                            {s.idle ? 'idle' : s.category === 'duplicate' ? 'dup' : 'work'}
                          </div>
                          {s.url && (
                            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* URLs Tab */}
            <TabsContent value="urls" className="m-0 space-y-4">
              {/* Social/Entertainment URLs Warning */}
              {socialUrls.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-900">
                      <AlertTriangle className="h-4 w-4" />
                      Social Media / Entertainment Sites
                      <Badge variant="destructive">{socialUrls.length} sites</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {socialUrls.map(url => (
                        <div key={url.domain} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-orange-600" />
                            <span className="font-medium">{url.domain}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-500">{url.count} visits</span>
                            <Badge variant="outline">{url.time_spent} min</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Top URLs */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top Visited Domains</CardTitle>
                </CardHeader>
                <CardContent>
                  {topUrls.length === 0 ? (
                    <div className="text-gray-500 text-sm">No URL data</div>
                  ) : (
                    <div className="space-y-2">
                      {topUrls.map((url, i) => (
                        <div key={url.domain} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm w-5">{i + 1}.</span>
                            <Globe className="h-4 w-4 text-blue-600" />
                            <span className="font-medium">{url.domain}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-gray-500">{url.visits} visits</span>
                            <Badge variant="secondary">{url.time_spent} min</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/admin/url-activity?user=${insight.user_id}`);
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full URL Activity Report
              </Button>
            </TabsContent>

            {/* Apps Tab */}
            <TabsContent value="apps" className="m-0 space-y-4">
              {/* Social Media Apps Warning */}
              {socialApps.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-900">
                      <Smartphone className="h-4 w-4" />
                      Social Media Apps Detected
                      <Badge variant="destructive">{socialApps.length} apps</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {socialApps.map(app => (
                      <div key={app.name} className="border border-orange-300 rounded-lg p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-orange-900">{app.name}</span>
                          <Badge variant="outline" className="bg-orange-100 text-orange-800">
                            {app.count} screenshot{app.count > 1 ? 's' : ''}
                          </Badge>
                        </div>
                        {app.screenshots.length > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {app.screenshots.map(shot => (
                              <div key={shot.id} className="relative border border-orange-300 rounded overflow-hidden">
                                <img src={shot.image_url} alt={app.name} className="w-full h-16 object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-orange-600/80 text-white text-[9px] px-1">
                                  {format(new Date(shot.captured_at), 'HH:mm')}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Top Apps Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Top Applications Used</CardTitle>
                </CardHeader>
                <CardContent>
                  {topApps.length === 0 ? (
                    <div className="text-gray-500 text-sm">No app data</div>
                  ) : (
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie data={topApps} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                              {topApps.map((entry, i) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-1">
                        {topApps.map((app, i) => (
                          <div key={app.name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: app.fill }} />
                              <span className="truncate max-w-[120px]">{app.name}</span>
                            </div>
                            <span className="text-gray-500">{app.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Screenshots Issues Tab */}
            <TabsContent value="screenshots" className="m-0 space-y-4">
              {/* No Issues Message */}
              {!hasIssues && (
                <Card className="border-green-200 bg-green-50/50">
                  <CardContent className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                      <h3 className="text-lg font-semibold text-green-900 mb-2">No Issues Detected</h3>
                      <p className="text-green-700 text-sm">
                        This employee shows good productivity patterns with no significant issues.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Duplicate Screenshots */}
              {duplicateShots.length > 0 && (
                <Card className="border-red-200 bg-red-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-red-900">
                      <Copy className="h-4 w-4" />
                      Duplicate Screenshots
                      <Badge variant="destructive">{totalDuplicates} total</Badge>
                    </CardTitle>
                    <CardDescription>Groups of identical screenshots indicating idle time</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {duplicateShots.map((group, idx) => (
                      <div key={group.hash} className="border border-red-300 rounded-lg p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="text-xs">Group {idx + 1}</Badge>
                            <span className="text-sm font-medium text-red-900">{group.count} duplicates</span>
                          </div>
                          {group.time_range && (
                            <span className="text-xs text-gray-600">
                              {format(group.time_range.start, 'HH:mm')} - {format(group.time_range.end, 'HH:mm')}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {group.screenshots.map(shot => (
                            <div key={shot.id} className="relative border-2 border-red-400 rounded overflow-hidden cursor-pointer group/thumb" onClick={() => setLightboxUrl(shot.image_url)}>
                              <img src={shot.image_url} alt="Duplicate" className="w-full h-16 object-cover" />
                              <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] px-1 rounded-bl">DUP</div>
                              <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 transition-colors flex items-center justify-center">
                                <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Low Activity Screenshots */}
              {lowActivityShots.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-yellow-900">
                      <BarChart3 className="h-4 w-4" />
                      Low Activity Screenshots
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800">{lowActivityShots.length}</Badge>
                    </CardTitle>
                    <CardDescription>Screenshots with less than 30% keyboard/mouse activity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2">
                      {lowActivityShots.slice(0, 8).map(shot => (
                        <div key={shot.id} className="relative border-2 border-yellow-400 rounded overflow-hidden cursor-pointer group/thumb" onClick={() => setLightboxUrl(shot.image_url)}>
                          <img src={shot.image_url} alt="Low activity" className="w-full h-20 object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                            <div className="flex items-center justify-between text-white text-[10px]">
                              <span className="font-bold">{shot.activity_percent}%</span>
                              <span className="truncate max-w-[50px]">{shot.app_name}</span>
                            </div>
                          </div>
                          <Badge variant="destructive" className="absolute top-1 right-1 text-[8px] px-1 py-0">Low</Badge>
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Non-Productive Category Screenshots (Shopping, Gaming, Social Media, Entertainment) */}
              {nonProdShots.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-900">
                      <ShoppingCart className="h-4 w-4" />
                      Non-Productive Activity Evidence
                      <Badge variant="outline" className="bg-orange-100 text-orange-800">{nonProdShots.length} screenshots</Badge>
                    </CardTitle>
                    <CardDescription>Screenshots classified as shopping, gaming, social media, or entertainment by AI vision — click to verify (AI may misclassify)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {nonProdShots.slice(0, 9).map(shot => (
                        <div key={shot.id} className="relative border-2 border-orange-400 rounded overflow-hidden cursor-pointer group/thumb" onClick={() => setLightboxUrl(shot.image_url)}>
                          <img src={shot.image_url} alt={shot.vision_category} className="w-full h-24 object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                            <div className="flex items-center justify-between text-white text-[10px]">
                              <Badge variant="destructive" className="text-[8px] px-1 py-0 capitalize">{shot.vision_category}</Badge>
                              <span className="truncate max-w-[60px]">{shot.app_name}</span>
                            </div>
                            <span className="text-white/70 text-[9px]">{format(new Date(shot.captured_at), 'MMM d, HH:mm')}</span>
                          </div>
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Idle Screenshots */}
              {idleShots.length > 0 && (
                <Card className="border-gray-300 bg-gray-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-gray-900">
                      <PauseCircle className="h-4 w-4" />
                      Idle Time Evidence
                      <Badge variant="outline" className="bg-gray-100 text-gray-800">{idleShots.length} screenshots</Badge>
                    </CardTitle>
                    <CardDescription>Screenshots captured during detected idle periods — no keyboard/mouse input</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2">
                      {idleShots.slice(0, 8).map(shot => (
                        <div key={shot.id} className="relative border-2 border-gray-400 rounded overflow-hidden cursor-pointer group/thumb" onClick={() => setLightboxUrl(shot.image_url)}>
                          <img src={shot.image_url} alt="Idle" className="w-full h-20 object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                            <div className="flex items-center justify-between text-white text-[10px]">
                              <span className="font-bold">Idle</span>
                              <span className="truncate max-w-[60px]">{shot.app_name}</span>
                            </div>
                            <span className="text-white/70 text-[9px]">{format(new Date(shot.captured_at), 'MMM d, HH:mm')}</span>
                          </div>
                          <Badge variant="secondary" className="absolute top-1 right-1 text-[8px] px-1 py-0">Idle</Badge>
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                            <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  navigate(`/admin/screenshots?user=${insight.user_id}`);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View All Screenshots
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>

      {/* Full-screen screenshot lightbox */}
      {lightboxUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-[101]"
            onClick={() => setLightboxUrl(null)}
          >
            <XIcon className="h-8 w-8" />
          </button>
          <img 
            src={lightboxUrl} 
            alt="Full screenshot" 
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Dialog>
  );
}

export default EmployeeDetailsModal;
