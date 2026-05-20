import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmployeeFilterCombobox } from '@/components/shared/employee-filter-combobox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { format, subDays, subMonths, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useNavigate } from 'react-router-dom';
import { 
  Brain, Users, TrendingUp, AlertTriangle, 
  Eye, Shield, RefreshCw, Sparkles,
  User, Clock, Bell, BarChart3,
  SortDesc, Filter,
  AlertCircle, Send, Building2, ChevronDown, ChevronUp, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { AlertsPanel } from '@/components/admin/AlertsPanel';
import { VisionAnalysisPanel } from '@/components/admin/VisionAnalysisPanel';
import { CompactEmployeeCard, getPerformanceStatus, getPerformanceStatusBadge, AIInsight } from './components/compact-employee-card';
import { EmployeeDetailsModal } from './components/employee-details-modal';

import { fetchPaginated } from '@/lib/supabase-utils';

// Alias kept so call-sites below don't need renaming
const fetchAllRows = fetchPaginated;

// Performance status types - imported from components
type PerformanceStatus = 'excellent' | 'good' | 'needs_improvement' | 'concerning' | 'pending';
type SortOption = 'productivity_desc' | 'productivity_asc' | 'risk_high' | 'name_asc' | 'screenshots_desc';

export default function AIInsightsPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const organizationId = userDetails?.organization_id;
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState('all');
  const [performanceFilter, setPerformanceFilter] = useState<PerformanceStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('productivity_desc');
  const [screenshotCounts, setScreenshotCounts] = useState<Record<string, number>>({});
  const [issuesCounts, setIssuesCounts] = useState<Record<string, number>>({});
  const [issuesDetails, setIssuesDetails] = useState<Record<string, string[]>>({});
  const [realActivity, setRealActivity] = useState<Record<string, number>>({}); // Real avg keyboard/mouse activity per user
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeringAnalysis, setTriggeringAnalysis] = useState(false);
  const [health, setHealth] = useState<{ openai_enabled?: boolean; ai_use_openai?: boolean; pending?: number; lastRun?: string } | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [shotsAnalyzed, setShotsAnalyzed] = useState<number>(0);
  const [topApps, setTopApps] = useState<Array<{ name: string; value: number; fill: string }>>([]);
  const [topSites, setTopSites] = useState<Array<{ name: string; value: number; fill: string }>>([]);
  const [idleRate, setIdleRate] = useState<number>(0);
  const [dupRate, setDupRate] = useState<number>(0);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<AIInsight | null>(null);
  const [dupGroups, setDupGroups] = useState<Array<{ hash: string; count: number }>>([]);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; slug: string; logo_url?: string }>>([]);
  const [selectedOrganization, setSelectedOrganization] = useState<string>('all');
  const [collapsedOrgs, setCollapsedOrgs] = useState<Set<string>>(new Set());

  // Group insights by user and filter/sort
  const groupedInsights = useMemo(() => {
    // Group by user_id
    const grouped = new Map<string, AIInsight[]>();
    
    insights.forEach(insight => {
      const userId = insight.user_id;
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }
      grouped.get(userId)!.push(insight);
    });
    
    // Sort insights within each group by date (most recent first)
    grouped.forEach((userInsights) => {
      userInsights.sort((a, b) => 
        new Date(b.computed_at).getTime() - new Date(a.computed_at).getTime()
      );
    });
    
    return grouped;
  }, [insights]);

  // Calculate team average productivity (using latest insight per user)
  const teamAverage = useMemo(() => {
    const latestInsights = Array.from(groupedInsights.values()).map(userInsights => userInsights[0]);
    if (latestInsights.length === 0) return 0;
    return Math.round(latestInsights.reduce((sum, i) => sum + i.productivity_score, 0) / latestInsights.length);
  }, [groupedInsights]);

  // Filter and sort insights
  const filteredAndSortedInsights = useMemo(() => {
    // Convert grouped insights to array of [user, latest insight]
    const userInsights = Array.from(groupedInsights.entries()).map(([userId, insights]) => ({
      userId,
      latestInsight: insights[0], // Most recent
      historicalInsights: insights.slice(1), // Older insights
      totalInsights: insights.length
    }));
    
    // Apply organization filter (for super admin)
    let filtered = userInsights.filter(({ latestInsight }) => {
      if (selectedOrganization === 'all') return true;
      return latestInsight.organization?.id === selectedOrganization;
    });
    
    // Apply performance filter
    filtered = filtered.filter(({ latestInsight }) => {
      if (performanceFilter === 'all') return true;
      return getPerformanceStatus(latestInsight) === performanceFilter;
    });
    
    // Apply sorting
    filtered.sort((a, b) => {
      const insightA = a.latestInsight;
      const insightB = b.latestInsight;
      
      switch (sortBy) {
        case 'productivity_desc':
          return insightB.productivity_score - insightA.productivity_score;
        case 'productivity_asc':
          return insightA.productivity_score - insightB.productivity_score;
        case 'risk_high':
          const riskOrder = { high: 0, medium: 1, low: 2 };
          return (riskOrder[insightA.risk_level] || 2) - (riskOrder[insightB.risk_level] || 2);
        case 'name_asc':
          return (insightA.users?.full_name || '').localeCompare(insightB.users?.full_name || '');
        case 'screenshots_desc':
          return insightB.screenshots_analyzed - insightA.screenshots_analyzed;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [groupedInsights, performanceFilter, sortBy, selectedOrganization]);

  // Group insights by organization for display
  const insightsByOrganization = useMemo(() => {
    if (!isSuperAdmin || selectedOrganization !== 'all') {
      // Not super admin or already filtered by org - return single group
      return [{ organization: null, insights: filteredAndSortedInsights }];
    }

    // Group by organization
    const orgGroups = new Map<string | null, typeof filteredAndSortedInsights>();
    
    filteredAndSortedInsights.forEach(item => {
      const orgId = item.latestInsight.organization?.id || null;
      if (!orgGroups.has(orgId)) {
        orgGroups.set(orgId, []);
      }
      orgGroups.get(orgId)!.push(item);
    });

    // Convert to array and sort by org name
    const result = Array.from(orgGroups.entries()).map(([orgId, insights]) => ({
      organization: insights[0]?.latestInsight.organization || null,
      insights
    }));

    // Sort: orgs with names first (alphabetically), then null org last
    result.sort((a, b) => {
      if (!a.organization && !b.organization) return 0;
      if (!a.organization) return 1;
      if (!b.organization) return -1;
      return a.organization.name.localeCompare(b.organization.name);
    });

    return result;
  }, [filteredAndSortedInsights, isSuperAdmin, selectedOrganization]);

  // Get employees needing attention (use latest insight per user)
  const attentionRequired = useMemo(() => {
    return Array.from(groupedInsights.values())
      .map(userInsights => userInsights[0]) // Get latest insight per user
      .filter(i => {
        const status = getPerformanceStatus(i);
        return status === 'concerning' || status === 'needs_improvement';
      });
  }, [groupedInsights]);

  // Count by performance status (using latest insight per user)
  const statusCounts = useMemo(() => {
    const counts = { excellent: 0, good: 0, needs_improvement: 0, concerning: 0 };
    Array.from(groupedInsights.values()).forEach(userInsights => {
      const latestInsight = userInsights[0];
      const status = getPerformanceStatus(latestInsight);
      if (status !== 'pending') {
        counts[status]++;
      }
    });
    return counts;
  }, [groupedInsights]);

  const getPeriodDateRange = () => {
    const end = new Date();
    let start: Date;
    switch (selectedPeriod) {
      case 'today': start = startOfDay(end); break;
      case 'week': start = subDays(end, 7); break;
      case 'month': start = subDays(end, 30); break;
      case 'last-month': {
        const lm = subMonths(end, 1);
        return { start: startOfMonth(lm), end: endOfMonth(lm) };
      }
      case 'custom':
        if (customStartDate && customEndDate) {
          return { start: startOfDay(customStartDate), end: endOfDay(customEndDate) };
        }
        start = subDays(end, 7); break;
      default: start = subDays(end, 7);
    }
    return { start, end };
  };

  const getPeriodTypeForDB = (): 'today' | 'week' | 'month' => {
    if (selectedPeriod === 'last-month' || selectedPeriod === 'month') return 'month';
    if (selectedPeriod === 'custom') return 'week';
    return selectedPeriod as 'today' | 'week' | 'month';
  };

  useEffect(() => {
    // Restore saved view
    const savedPeriod = localStorage.getItem('ai_insights_period');
    const savedUser = localStorage.getItem('ai_insights_user');
    if (savedPeriod) setSelectedPeriod(savedPeriod);
    if (savedUser) setSelectedUser(savedUser);
  }, []);

  useEffect(() => {
    // Persist view
    localStorage.setItem('ai_insights_period', selectedPeriod);
    localStorage.setItem('ai_insights_user', selectedUser);
  }, [selectedPeriod, selectedUser]);

  useEffect(() => {
    if (userDetails?.role === 'admin') {
      fetchOrganizations();
      fetchUsers();
      fetchAIInsights();
      fetchAnalyzerHealth();
      fetchPendingCount();
      fetchAggregates();
      fetchScreenshotsAnalyzed();
      fetchDuplicateGroups();
      fetchIssuesCounts(); // NEW: Fetch activity issues counts
      
      // Refresh data silently every 2 minutes (no layout changes to avoid scroll jumps)
      const interval = setInterval(() => {
        Promise.all([
          fetchAIInsights(true),
          fetchAnalyzerHealth(),
          fetchPendingCount(),
          fetchAggregates(),
          fetchScreenshotsAnalyzed(),
          fetchDuplicateGroups(),
          fetchIssuesCounts(),
        ]);
      }, 120000);
      
      return () => clearInterval(interval);
    }
  }, [userDetails, selectedPeriod, selectedUser, selectedOrganization, organizationId, isSuperAdmin, customStartDate, customEndDate]);

  const fetchOrganizations = async () => {
    if (!isSuperAdmin) return;
    try {
      const { data, error } = await (supabase
        .from('organizations' as any)
        .select('id, name, slug, logo_url') as any)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setOrganizations((data as any[]) || []);
    } catch (error) {
      console.error('Error fetching organizations:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      let q = (supabase
        .from('users') as any)
        .select('id, email, full_name, role, organization_id')
        .order('full_name');

      // Exclude demo/test users by default
      q = q.not('email', 'ilike', '%@example.com%');
      
      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        q = q.eq('organization_id', organizationId);
      }

      const { data, error } = await q;
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    }
  };

  const fetchAIInsights = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      
      const { start: startDate, end: endDate } = getPeriodDateRange();

      // Paginate AI insights (Supabase server caps at 1000 rows, but there may be thousands)
      let baseQuery = (supabase
        .from('ai_employee_insights') as any)
        .select(`
          *,
          users (
            id,
            email,
            full_name,
            role,
            organization_id
          )
        `)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (selectedUser !== 'all') {
        baseQuery = baseQuery.eq('user_id', selectedUser);
      }

      const allAIData = await fetchAllRows(baseQuery);
      
      // Deduplicate: keep only the most recent row per user (query is ordered by created_at DESC)
      const seenUserIds = new Set<string>();
      const dedupedData = allAIData.filter((row: any) => {
        if (seenUserIds.has(row.user_id)) return false;
        seenUserIds.add(row.user_id);
        return true;
      });
      
      // Filter out demo/test users in JavaScript
      // (PostgREST doesn't support .not() filtering on embedded resources correctly)
      let filteredData = dedupedData.filter((row: any) => {
        const email = row.users?.email?.toLowerCase() || '';
        return !email.includes('@example.com');
      });
      
      // Filter by organization for non-super-admin users
      if (organizationId && !isSuperAdmin) {
        filteredData = filteredData.filter((row: any) => {
          return row.users?.organization_id === organizationId;
        });
      }
      
      // Fetch all organizations for lookup if super admin
      let orgMap = new Map<string, { id: string; name: string; slug: string; logo_url?: string }>();
      if (isSuperAdmin) {
        const { data: orgsData } = await (supabase
          .from('organizations' as any)
          .select('id, name, slug, logo_url') as any);
        (orgsData || []).forEach((org: any) => {
          orgMap.set(org.id, org);
        });
      }

      // Fetch real keyboard/mouse activity for users with stored AI insights
      // We only need this for users in filteredData; placeholder users compute it separately
      let realActMap: Record<string, number> = {};
      const screenshotCountsMap: Record<string, number> = {};
      const aiUserIds = filteredData.map((r: any) => r.user_id).filter(Boolean);
      if (aiUserIds.length > 0) {
        try {
          // Fetch activity per-user with pagination (Supabase server caps at 1000 rows)
          const shotActivityData = await fetchAllRows(
            supabase
              .from('screenshots')
              .select('user_id, activity_percent')
              .in('user_id', aiUserIds)
              .gte('captured_at', startDate.toISOString())
              .lte('captured_at', endDate.toISOString())
          );
          const actSums: Record<string, { total: number; sum: number }> = {};
          shotActivityData.forEach((r: any) => {
            if (!actSums[r.user_id]) actSums[r.user_id] = { total: 0, sum: 0 };
            actSums[r.user_id].total++;
            actSums[r.user_id].sum += (r.activity_percent ?? 0);
          });
          Object.entries(actSums).forEach(([uid, d]) => {
            realActMap[uid] = d.total > 0 ? Math.round(d.sum / d.total) : 0;
            screenshotCountsMap[uid] = d.total;
          });
        } catch (e) {
          console.warn('Failed to fetch real activity data for AI insight users:', e);
        }
      }

      // Transform the data to match the expected interface
      const transformedData: AIInsight[] = filteredData.map((row: any) => {
        const ins = row.insights || {};
        const userOrgId = row.users?.organization_id;
        // Use REAL keyboard/mouse activity (from screenshots.activity_percent) for score adjustment
        let rawScore = (ins.productivity_score as number) || 0;
        const realAct = realActMap[row.user_id] ?? -1; // -1 means no screenshot data
        const riskLevel = (ins.risk_level as string) || 'low';

        // Blend AI category score with real keyboard/mouse activity when we have data
        // This ensures productivity reflects ACTUAL engagement, not just AI category classification
        const storedActivity = (ins.activity_percentage as number) || 0;
        if (realAct >= 0) {
          // 40% AI category score + 60% real keyboard/mouse activity
          rawScore = Math.round(rawScore * 0.4 + realAct * 0.6);
        } else if (storedActivity > 0) {
          // No screenshot activity_percent but AI stored an activity value — blend with that
          rawScore = Math.round(rawScore * 0.4 + storedActivity * 0.6);
        } else {
          // No activity data at all — zero evidence of keyboard/mouse engagement
          // Cap heavily: can't claim high productivity with 0% verified activity
          rawScore = Math.min(50, rawScore);
        }

        // Penalize high-risk users -- suspicious patterns (e.g., mouse jiggler, uniform 100% activity)
        // should NOT show near-perfect productivity
        if (riskLevel === 'high' && rawScore > 75) {
          rawScore = Math.round(rawScore * 0.65); // Significant penalty
        } else if (riskLevel === 'medium' && rawScore > 85) {
          rawScore = Math.round(rawScore * 0.8); // Moderate penalty
        }

        // Ensure hours are never 0 when screenshots exist
        let rawHours = (ins.total_hours as number) || 0;
        const rawScreenshots = (ins.screenshots_analyzed as number) || 0;
        if (rawHours === 0 && rawScreenshots > 0) {
          rawHours = Math.max(1, Math.round(rawScreenshots * 0.1));
        }
        const mapped: AIInsight = {
          id: row.id,
          user_id: row.user_id,
          period_type: (ins.period_type as any) || 'week',
          period_start: row.period_start,
          period_end: row.period_end,
          total_hours: rawHours,
          activity_percentage: realAct >= 0 ? realAct : ((ins.activity_percentage as number) || 0),
          productivity_score: rawScore,
          screenshots_analyzed: rawScreenshots,
          risk_level: (ins.risk_level as any) || 'low',
          ai_insights: ins,
          productivity_indicators: ins.productivity_indicators || {},
          distraction_indicators: ins.distraction_indicators || {},
          behavioral_patterns: ins.behavioral_patterns || {},
          analysis_version: row.analysis_version || '2.0.0',
          computed_at: row.created_at,
          updated_at: row.updated_at,
          users: row.users || undefined,
          organization: userOrgId && orgMap.has(userOrgId) ? orgMap.get(userOrgId) : undefined
        };
        return mapped;
      });
      
      // Auto-generate simple insights if none exist, using BATCH queries (fast)
      if (transformedData.length === 0) {
        let usersQuery = (supabase
          .from('users') as any)
          .select('id, email, full_name, role, organization_id')
          .not('email', 'ilike', '%@example.com%')
          .order('full_name');
        
        if (organizationId && !isSuperAdmin) {
          usersQuery = usersQuery.eq('organization_id', organizationId);
        }
        
        const { data: users } = await usersQuery;
        const typedUsers = (users || []) as any[];
        if (typedUsers.length > 0) {
          const allUserIds = typedUsers.map((u: any) => u.id);
          const userMap = new Map<string, any>(typedUsers.map((u: any) => [u.id, u]));

          // Batch queries -- paginated screenshots + other queries in parallel
          const [shotsData, appsRes, timeRes] = await Promise.all([
            fetchAllRows(
              supabase.from('screenshots')
                .select('user_id, idle_inferred, is_duplicate, activity_percent')
                .in('user_id', allUserIds)
                .gte('captured_at', startDate.toISOString())
                .lte('captured_at', endDate.toISOString())
            ),
            supabase.from('app_logs')
              .select('user_id, app_name')
              .in('user_id', allUserIds)
              .gte('created_at', startDate.toISOString())
              .lte('created_at', endDate.toISOString())
              .limit(1000),
            supabase.from('time_logs')
              .select('user_id, start_time, end_time')
              .in('user_id', allUserIds)
              .gte('start_time', startDate.toISOString())
              .lte('start_time', endDate.toISOString())
              .not('end_time', 'is', null),
          ]);

          // Group by user
          const shotsByUser: Record<string, any[]> = {};
          shotsData.forEach((s: any) => {
            if (!shotsByUser[s.user_id]) shotsByUser[s.user_id] = [];
            shotsByUser[s.user_id].push(s);
          });
          const appsByUser: Record<string, Record<string, number>> = {};
          (appsRes.data || []).forEach((a: any) => {
            if (!appsByUser[a.user_id]) appsByUser[a.user_id] = {};
            const n = a.app_name || 'Application';
            appsByUser[a.user_id][n] = (appsByUser[a.user_id][n] || 0) + 1;
          });
          const hoursByUser: Record<string, number> = {};
          (timeRes.data || []).forEach((t: any) => {
            const ms = Math.max(0, new Date(t.end_time).getTime() - new Date(t.start_time).getTime());
            hoursByUser[t.user_id] = (hoursByUser[t.user_id] || 0) + ms;
          });

          const generated: AIInsight[] = [];
          for (const uid of allUserIds) {
            const shots = shotsByUser[uid];
            if (!shots || shots.length === 0) continue;
            const u = userMap.get(uid)!;
            const total = shots.length;

            // Use REAL keyboard/mouse activity_percent, not just idle_inferred
            let actSum = 0;
            shots.forEach((s: any) => { actSum += (s.activity_percent ?? 0); });
            const activityPct = total > 0 ? Math.round(actSum / total) : 0;

            const userApps = appsByUser[uid] || {};
            const sortedApps = Object.entries(userApps).sort((a, b) => b[1] - a[1]);
            const appList = sortedApps.slice(0, 3).map(a => a[0]).join(', ') || 'Various applications';

            const totalMs = hoursByUser[uid] || 0;
            const genHours = totalMs > 0
              ? Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10
              : Math.max(1, Math.round(total * 0.1));

            // Productivity = real keyboard/mouse activity (already varied per user)
            const cappedProd = Math.max(0, Math.min(95, activityPct));

            generated.push({
              id: `gen_${uid}_${Date.now()}`,
              user_id: uid,
              period_type: getPeriodTypeForDB(),
              period_start: startDate.toISOString(),
              period_end: endDate.toISOString(),
              total_hours: genHours,
              activity_percentage: activityPct,
              productivity_score: cappedProd,
              screenshots_analyzed: total,
              risk_level: 'low',
              ai_insights: {
                work_description: `Working with ${appList}`,
                executive_summary: `${u.full_name || 'User'} primarily used ${appList}. ${total} screenshots captured with ${activityPct}% activity rate.`
              },
              productivity_indicators: {},
              distraction_indicators: {},
              behavioral_patterns: {},
              analysis_version: 'auto-generated',
              computed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              users: {
                id: u.id,
                email: u.email,
                full_name: u.full_name || 'Unknown User',
                role: u.role || 'User'
              }
            } as AIInsight);
          }
          setInsights(generated);
          setLoading(false);
          return;
        }
      }
      
      // If some users are missing metadata, fetch their user rows
      const missingIds = transformedData
        .filter((i: any) => !i.users)
        .map((i: any) => i.user_id);
      if (missingIds.length > 0) {
        const { data: fillUsers } = await (supabase
          .from('users') as any)
          .select('id, email, full_name, role')
          .in('id', missingIds);
        const fillMap = new Map((fillUsers || []).map((u: any) => [u.id, u]));
        transformedData.forEach((i: any) => {
          if (!i.users && fillMap.has(i.user_id)) i.users = fillMap.get(i.user_id);
        });
      }

      // Include ALL employees -- generate placeholder insights using BATCH queries (fast)
      const userIdsWithInsights = new Set(transformedData.map((i: AIInsight) => i.user_id));
      let allUsersQuery = (supabase
        .from('users') as any)
        .select('id, email, full_name, role, organization_id')
        .not('email', 'ilike', '%@example.com%')
        .order('full_name');
      
      if (organizationId && !isSuperAdmin) {
        allUsersQuery = allUsersQuery.eq('organization_id', organizationId);
      }
      
      const { data: allUsers } = await allUsersQuery;
      const typedAllUsers = (allUsers || []) as any[];
      
      // Filter to users without insights
      const missingUsers = typedAllUsers.filter((u: any) => {
        if (userIdsWithInsights.has(u.id)) return false;
        if (selectedUser !== 'all' && u.id !== selectedUser) return false;
        return true;
      });

      if (missingUsers.length > 0) {
        const missingUserIds = missingUsers.map((u: any) => u.id);
        const missingUserMap = new Map<string, any>(missingUsers.map((u: any) => [u.id, u]));

        // Batch: get screenshot counts + metrics per user (single query)
        const batchShots = await fetchAllRows(
          supabase
            .from('screenshots')
            .select('user_id, activity_percent, idle_inferred, is_duplicate')
            .in('user_id', missingUserIds)
            .gte('captured_at', startDate.toISOString())
            .lte('captured_at', endDate.toISOString())
        );

        // Batch: get app logs per user (single query)
        const { data: batchAppLogs } = await supabase
          .from('app_logs')
          .select('user_id, app_name')
          .in('user_id', missingUserIds)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .limit(1000);

        // Batch: get time logs per user (single query)
        const { data: batchTimeLogs } = await supabase
          .from('time_logs')
          .select('user_id, start_time, end_time')
          .in('user_id', missingUserIds)
          .gte('start_time', startDate.toISOString())
          .lte('start_time', endDate.toISOString())
          .not('end_time', 'is', null);

        // Group screenshots by user
        const shotsByUser: Record<string, any[]> = {};
        batchShots.forEach((s: any) => {
          if (!shotsByUser[s.user_id]) shotsByUser[s.user_id] = [];
          shotsByUser[s.user_id].push(s);
        });

        // Group app logs by user
        const appsByUser: Record<string, Record<string, number>> = {};
        (batchAppLogs || []).forEach((a: any) => {
          if (!appsByUser[a.user_id]) appsByUser[a.user_id] = {};
          const n = a.app_name || 'Application';
          appsByUser[a.user_id][n] = (appsByUser[a.user_id][n] || 0) + 1;
        });

        // Group time logs by user and compute hours
        const hoursByUser: Record<string, number> = {};
        (batchTimeLogs || []).forEach((t: any) => {
          const ms = Math.max(0, new Date(t.end_time).getTime() - new Date(t.start_time).getTime());
          hoursByUser[t.user_id] = (hoursByUser[t.user_id] || 0) + ms;
        });

        // Build placeholder insights per user
        for (const uid of missingUserIds) {
          const shots = shotsByUser[uid];
          if (!shots || shots.length === 0) continue;

          const u = missingUserMap.get(uid)!;
          const screenshotCount = shots.length;
          // Use REAL keyboard/mouse activity_percent for accurate metrics
          let actSumMissing = 0;
          shots.forEach((s: any) => { actSumMissing += (s.activity_percent ?? 0); });
          const pendingActivityPct = screenshotCount > 0 ? Math.round(actSumMissing / screenshotCount) : 0;
          // Productivity directly from real activity (no inflated idle-based calc)
          const pendingProductivity = Math.max(0, Math.min(95, pendingActivityPct));

          // Hours from batch time logs
          const totalMs = hoursByUser[uid] || 0;
          const pendingHours = totalMs > 0
            ? Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10
            : Math.max(1, Math.round(screenshotCount * 0.1));

          // Apps from batch
          const userApps = appsByUser[uid] || {};
          const sortedPendingApps = Object.entries(userApps).sort((a, b) => b[1] - a[1]);
          const pendingAppList = sortedPendingApps.slice(0, 2).map(a => a[0]).join(', ') || 'Various applications';

          transformedData.push({
            id: `pending_${uid}_${Date.now()}`,
            user_id: uid,
            period_type: getPeriodTypeForDB(),
            period_start: startDate.toISOString(),
            period_end: endDate.toISOString(),
            total_hours: pendingHours,
            activity_percentage: pendingActivityPct,
            productivity_score: pendingProductivity,
            screenshots_analyzed: screenshotCount,
            risk_level: 'low',
            ai_insights: {
              work_description: `Working with ${pendingAppList}`,
              executive_summary: `${u.full_name || 'User'} used ${pendingAppList}. ${screenshotCount} screenshots captured, ${pendingActivityPct}% active. AI-enhanced analysis available.`,
              pending_analysis: true
            },
            productivity_indicators: {},
            distraction_indicators: {},
            behavioral_patterns: {},
            analysis_version: 'pending',
            computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            users: {
              id: u.id,
              email: u.email,
              full_name: u.full_name || 'Unknown User',
              role: u.role || 'User'
            }
          } as AIInsight);
        }
      }

      // Build merged screenshot counts and real activity from all data sources
      const mergedCounts: Record<string, number> = { ...screenshotCountsMap };
      const mergedActivity: Record<string, number> = { ...realActMap };
      transformedData.forEach((i: AIInsight) => {
        if (!mergedCounts[i.user_id] && i.screenshots_analyzed > 0) {
          mergedCounts[i.user_id] = i.screenshots_analyzed;
        }
        if (mergedActivity[i.user_id] === undefined && i.activity_percentage >= 0) {
          mergedActivity[i.user_id] = i.activity_percentage;
        }
      });
      setScreenshotCounts(mergedCounts);
      setRealActivity(mergedActivity);

      setInsights(transformedData);
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      toast.error('Failed to load AI insights');
      
      // Fallback: Generate insights from existing data
      try {
        console.log('Attempting fallback: generating insights from existing data...');
        
        const { start: startDate, end: endDate } = getPeriodDateRange();
        
        // Get all users (filtered by organization)
        let fallbackUsersQuery = (supabase
          .from('users') as any)
          .select('id, email, full_name, role, organization_id')
          .not('email', 'ilike', '%@example.com%')
          .order('full_name');
        
        // Filter by organization unless super admin
        if (organizationId && !isSuperAdmin) {
          fallbackUsersQuery = fallbackUsersQuery.eq('organization_id', organizationId);
        }
        
        const { data: users } = await fallbackUsersQuery;
        const typedFallbackUsers = (users || []) as any[];

        if (typedFallbackUsers.length > 0) {
          // Generate insights for each user from existing data
          const generatedInsights: AIInsight[] = [];
          
          for (const user of typedFallbackUsers) {
            // Get user's screenshots for the period
            const { data: screenshots, count: screenshotCount } = await supabase
              .from('screenshots')
              .select('*', { count: 'exact' })
              .eq('user_id', user.id)
              .gte('captured_at', startDate.toISOString())
              .lte('captured_at', endDate.toISOString());

            if (screenshotCount && screenshotCount > 0) {
              // Calculate productivity metrics
              const totalScreenshots = screenshotCount;
              const duplicateScreenshots = screenshots?.filter((s: any) => s.is_duplicate)?.length || 0;
              const uniqueScreenshots = totalScreenshots - duplicateScreenshots;
              
              // Calculate activity percentage (simplified)
              const activityPercentage = Math.min(100, Math.max(0, 
                screenshots?.reduce((sum: number, s: any) => sum + (s.activity_percent || 0), 0) / totalScreenshots || 0
              ));
              
              // Generate productivity score based on activity and duplicate rate
              const productivityScore = Math.max(0, Math.min(100, 
                activityPercentage - (duplicateScreenshots / totalScreenshots * 20)
              ));

              // Get user's app usage
              const { data: appLogs } = await supabase
                .from('app_logs')
                .select('app_name')
                .eq('user_id', user.id)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());

              const topApps = appLogs?.reduce((acc: Record<string, number>, log: any) => {
                if (log.app_name) {
                  acc[log.app_name] = (acc[log.app_name] || 0) + 1;
                }
                return acc;
              }, {} as Record<string, number>);

              const sortedFallbackApps = Object.entries(topApps || {})
                .sort(([,a], [,b]) => b - a);
              const mainApp = sortedFallbackApps[0]?.[0] || 'Various applications';
              const secondFallbackApp = sortedFallbackApps[1]?.[0];
              const fallbackAppList = [mainApp, secondFallbackApp].filter(Boolean).join(', ');

              // Query actual hours from time_logs
              let fallbackHours = Math.max(1, Math.round((totalScreenshots * 0.1) * 10) / 10);
              try {
                const { data: fbTimeLogs } = await supabase
                  .from('time_logs')
                  .select('start_time, end_time')
                  .eq('user_id', user.id)
                  .gte('start_time', startDate.toISOString())
                  .lte('start_time', endDate.toISOString())
                  .not('end_time', 'is', null);
                if (fbTimeLogs && fbTimeLogs.length > 0) {
                  const totalMs = fbTimeLogs.reduce((sum: number, log: any) => {
                    const s = new Date(log.start_time).getTime();
                    const e = new Date(log.end_time).getTime();
                    return sum + Math.max(0, e - s);
                  }, 0);
                  const hrs = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
                  if (hrs > 0) fallbackHours = hrs;
                }
              } catch (_) { /* ignore */ }

              // Cap productivity to 95% when no distractions detected (avoids inflated 100%)
              const cappedProductivityScore = Math.round(productivityScore) === 100 
                ? 95 
                : Math.round(productivityScore);

              const generatedInsight: AIInsight = {
                id: `generated_${user.id}_${Date.now()}`,
                user_id: user.id,
                period_type: getPeriodTypeForDB(),
                period_start: startDate.toISOString(),
                period_end: endDate.toISOString(),
                total_hours: fallbackHours,
                activity_percentage: Math.round(activityPercentage),
                productivity_score: cappedProductivityScore,
                screenshots_analyzed: totalScreenshots,
                risk_level: 'low' as const,
                ai_insights: {
                  work_description: `Working with ${fallbackAppList}`,
                  productivity_insights: `User shows ${Math.round(activityPercentage)}% activity level with ${uniqueScreenshots} unique screenshots`,
                  executive_summary: `${user.full_name || 'User'} primarily used ${fallbackAppList}. ${totalScreenshots} screenshots captured with ${Math.round(activityPercentage)}% activity.`
                },
                productivity_indicators: {},
                distraction_indicators: {},
                behavioral_patterns: {},
                analysis_version: 'auto-generated',
                computed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                users: {
                  id: user.id,
                  email: user.email,
                  full_name: user.full_name || 'Unknown User',
                  role: user.role || 'User'
                }
              };

              generatedInsights.push(generatedInsight);
            }
          }

          setInsights(generatedInsights);
          console.log(`Fallback successful: Generated ${generatedInsights.length} insights from existing data`);
        } else {
          setInsights([]);
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setInsights([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchScreenshotsAnalyzed = async () => {
    try {
      const { start: startDate, end: endDate } = getPeriodDateRange();
      
      // Get user IDs for the organization (for filtering)
      let orgUserIds: string[] | null = null;
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await (supabase
          .from('users') as any)
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = (orgUsers || []).map((u: any) => u.id);
      }
      
      let q = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      if (selectedUser !== 'all') {
        q = q.eq('user_id', selectedUser);
      } else if (orgUserIds) {
        q = q.in('user_id', orgUserIds);
      }
      const { count } = await q;
      setShotsAnalyzed(typeof count === 'number' ? count : 0);
    } catch (_) {
      setShotsAnalyzed(0);
    }
  };

  const fetchAnalyzerHealth = async () => {
    try {
      // Read AI status directly from database instead of calling edge function
      const { count: pendingScreenshots } = await supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('ai_analysis_status', 'pending');

      const { count: completedScreenshots } = await supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('ai_analysis_status', 'completed');

      const { data: latestInsight } = await (supabase
        .from('ai_employee_insights') as any)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      setHealth({
        openai_enabled: true, // Using Hugging Face
        ai_use_openai: true,
        pending: pendingScreenshots || 0,
        lastRun: latestInsight?.created_at || null
      });
    } catch (e) {
      // ignore – RLS might block some queries
      setHealth({ openai_enabled: true, ai_use_openai: true, pending: 0 });
    }
  };

  const fetchPendingCount = async () => {
    try {
      const { count, error } = await supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('ai_analysis_status', 'pending');
      if (!error && typeof count === 'number') setPendingCount(count);
    } catch (_) {
      // RLS might block this; leave null silently
    }
  };

  const fetchAggregates = async () => {
    try {
      const { start: startDate, end: endDate } = getPeriodDateRange();

      // Get user IDs for the organization (for filtering)
      let orgUserIds: string[] | null = null;
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await (supabase
          .from('users') as any)
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = (orgUsers || []).map((u: any) => u.id);
      }

      // Top apps - filtered by selected period and organization
      let appQuery = supabase
        .from('app_logs')
        .select('app_name')
        .not('app_name', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .limit(1000);
      if (selectedUser !== 'all') {
        appQuery = appQuery.eq('user_id', selectedUser);
      } else if (orgUserIds) {
        appQuery = appQuery.in('user_id', orgUserIds);
      }
      const { data: apps } = await appQuery;
      const appCounts: Record<string, number> = {};
      (apps || []).forEach((r: any) => {
        const name = r.app_name || 'Unknown';
        appCounts[name] = (appCounts[name] || 0) + 1;
      });
      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];
      const appArr = Object.entries(appCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value], i) => ({ name, value: Number(value), fill: COLORS[i % COLORS.length] }));
      setTopApps(appArr);

      // Top sites - filtered by selected period and organization
      let siteQuery = supabase
        .from('url_logs')
        .select('domain')
        .not('domain', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .limit(1000);
      if (selectedUser !== 'all') {
        siteQuery = siteQuery.eq('user_id', selectedUser);
      } else if (orgUserIds) {
        siteQuery = siteQuery.in('user_id', orgUserIds);
      }
      const { data: sites } = await siteQuery;
      const siteCounts: Record<string, number> = {};
      (sites || []).forEach((r: any) => {
        const name = r.domain || 'unknown.site';
        siteCounts[name] = (siteCounts[name] || 0) + 1;
      });
      const siteArr = Object.entries(siteCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value], i) => ({ name, value: Number(value), fill: COLORS[i % COLORS.length] }));
      setTopSites(siteArr)

      // Idle and duplicate rates (scoped by captured_at for accurate period stats and organization)
      let idleQ = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('idle_inferred', true)
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      let totalQ = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      let dupQ = supabase
        .from('screenshots')
        .select('id', { count: 'exact', head: true })
        .eq('is_duplicate', true)
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      if (selectedUser !== 'all') {
        idleQ = idleQ.eq('user_id', selectedUser);
        totalQ = totalQ.eq('user_id', selectedUser);
        dupQ = dupQ.eq('user_id', selectedUser);
      } else if (orgUserIds) {
        idleQ = idleQ.in('user_id', orgUserIds);
        totalQ = totalQ.in('user_id', orgUserIds);
        dupQ = dupQ.in('user_id', orgUserIds);
      }
      const [{ count: idleCount }, { count: totalScreens }, { count: dupCount }] = await Promise.all([idleQ, totalQ, dupQ]);
      setIdleRate(totalScreens ? Math.round(((idleCount || 0) / totalScreens) * 100) : 0);
      setDupRate(totalScreens ? Math.round(((dupCount || 0) / totalScreens) * 100) : 0);
    } catch (_) {
      // Silent fail; charts are adjunct
    }
  };

  // New: global duplicate groups for summary widget
  const fetchDuplicateGroups = async () => {
    try {
      const { start: startDate, end: endDate } = getPeriodDateRange();
      
      // Get user IDs for the organization (for filtering)
      let orgUserIds: string[] | null = null;
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await (supabase
          .from('users') as any)
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = (orgUsers || []).map((u: any) => u.id);
      }
      
      let q = supabase
        .from('screenshots')
        .select('duplicate_group_hash, duplicate_hash, captured_at, user_id')
        .eq('is_duplicate', true)
        .gte('captured_at', startDate.toISOString())
        .lte('captured_at', endDate.toISOString());
      if (selectedUser !== 'all') {
        q = q.eq('user_id', selectedUser);
      } else if (orgUserIds) {
        q = q.in('user_id', orgUserIds);
      }
      const { data } = await q;
      const g: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const key = r.duplicate_group_hash || r.duplicate_hash;
        if (!key) return;
        g[key] = (g[key] || 0) + 1;
      });
      const groups = Object.entries(g)
        .map(([hash, count]) => ({ hash, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      setDupGroups(groups);
    } catch (_) {
      setDupGroups([]);
    }
  };

  // NEW: Fetch activity issues counts per user
  const fetchIssuesCounts = async () => {
    try {
      const { start: startDate, end: endDate } = getPeriodDateRange();

      // Get user IDs for the organization (for filtering)
      let orgUserIds: Set<string> | null = null;
      if (organizationId && !isSuperAdmin) {
        const { data: orgUsers } = await (supabase
          .from('users') as any)
          .select('id')
          .eq('organization_id', organizationId);
        orgUserIds = new Set((orgUsers || []).map((u: any) => u.id));
      }

      // Count issues per user and track what each issue is
      const counts: Record<string, number> = {};
      const details: Record<string, string[]> = {};
      const addIssue = (userId: string, desc: string) => {
        counts[userId] = (counts[userId] || 0) + 1;
        if (!details[userId]) details[userId] = [];
        details[userId].push(desc);
      };

      // 1. Duplicate screenshots (grouped by duplicate_group_hash) -- paginated
      const duplicates = await fetchAllRows(
        supabase
          .from('screenshots')
          .select('user_id, duplicate_group_hash')
          .eq('is_duplicate', true)
          .gte('captured_at', startDate.toISOString())
          .lte('captured_at', endDate.toISOString())
      );

      const dupGroupsByUser: Record<string, Record<string, number>> = {};
      duplicates.forEach((d: any) => {
        if (!d.user_id || !d.duplicate_group_hash) return;
        if (orgUserIds && !orgUserIds.has(d.user_id)) return;
        if (!dupGroupsByUser[d.user_id]) dupGroupsByUser[d.user_id] = {};
        dupGroupsByUser[d.user_id][d.duplicate_group_hash] = (dupGroupsByUser[d.user_id][d.duplicate_group_hash] || 0) + 1;
      });
      Object.entries(dupGroupsByUser).forEach(([userId, groups]) => {
        const significantGroups = Object.values(groups).filter(count => count >= 3).length;
        if (significantGroups >= 3) {
          const totalDups = Object.values(groups).reduce((s, c) => s + c, 0);
          addIssue(userId, `${totalDups} duplicate screenshots`);
        }
      });

      // 2-4: Fetch ALL screenshots once and compute issues from them -- paginated
      const allShots = await fetchAllRows(
        supabase
          .from('screenshots')
          .select('user_id, activity_percent, idle_inferred, is_duplicate, vision_category')
          .gte('captured_at', startDate.toISOString())
          .lte('captured_at', endDate.toISOString())
      );

      // Build per-user stats from the single query
      const userStats: Record<string, {
        total: number; lowActivity: number; idle: number;
        visionCats: Record<string, number>;
      }> = {};
      allShots.forEach((s: any) => {
        if (!s.user_id) return;
        if (orgUserIds && !orgUserIds.has(s.user_id)) return;
        if (!userStats[s.user_id]) {
          userStats[s.user_id] = { total: 0, lowActivity: 0, idle: 0, visionCats: {} };
        }
        const st = userStats[s.user_id];
        st.total++;
        if (!s.is_duplicate && (s.activity_percent ?? 100) < 20) st.lowActivity++;
        if (s.idle_inferred) st.idle++;
        if (s.vision_category && ['social_media', 'entertainment', 'gaming', 'shopping'].includes(s.vision_category)) {
          st.visionCats[s.vision_category] = (st.visionCats[s.vision_category] || 0) + 1;
        }
      });

      Object.entries(userStats).forEach(([userId, st]) => {
        if (st.total < 5) return; // Skip users with very few screenshots

        // 2. Low activity -- use PERCENTAGE, not absolute count
        // Only flag if >40% of their screenshots have <20% keyboard/mouse activity
        const lowPct = (st.lowActivity / st.total) * 100;
        if (lowPct >= 40) {
          addIssue(userId, `${Math.round(lowPct)}% low-activity screenshots`);
        }

        // 3. Non-productive categories -- use percentage threshold
        Object.entries(st.visionCats).forEach(([cat, catCount]) => {
          const catPct = (catCount / st.total) * 100;
          const threshold = cat === 'gaming' ? 10 : 20; // % of total screenshots
          if (catPct >= threshold) {
            addIssue(userId, `${Math.round(catPct)}% ${cat.replace('_', ' ')}`);
          }
        });

        // 4. Excessive idle -- percentage based
        const idlePct = (st.idle / st.total) * 100;
        if (idlePct >= 35) {
          addIssue(userId, `${Math.round(idlePct)}% idle time`);
        }
      });

      setIssuesCounts(counts);
      setIssuesDetails(details);
    } catch (err) {
      console.error('Error fetching issues counts:', err);
      setIssuesCounts({});
      setIssuesDetails({});
    }
  };

  const triggerNewAnalysis = async () => {
    try {
      setTriggeringAnalysis(true);
      
      // Use the working comprehensive-employee-analysis function instead of broken ai-insights-worker
      if (selectedUser === 'all') {
        // For all users, we'll need to handle this differently
        toast.info('Please select a specific user for individual analysis');
        setTriggeringAnalysis(false);
        return;
      }
      
      const { data, error } = await supabase.functions.invoke('comprehensive-employee-analysis', {
        body: {
          user_id: selectedUser,
          organization_id: organizationId || null
        }
      });
      
      if (error) {
        console.error('Analysis trigger error:', error);
        toast.error(`Failed to trigger analysis: ${error.message}`);
        return;
      }
      
      toast.success('🧠 AI Analysis completed! Results are now available.');
      
      // Refresh insights immediately since analysis is complete
      fetchAIInsights();
      fetchPendingCount();
      fetchAnalyzerHealth();
      
    } catch (error: any) {
      console.error('Error triggering analysis:', error);
      toast.error(`Failed to trigger analysis: ${error?.message || 'Unknown error'}`);
    } finally {
      setTriggeringAnalysis(false);
    }
  };

  const triggerOrgAnalysis = async () => {
    try {
      setTriggeringAnalysis(true);
      
      // Use comprehensive-employee-analysis which is the working Hugging Face powered function
      const { data, error } = await supabase.functions.invoke('comprehensive-employee-analysis', {
        body: { 
          user_id: selectedUser !== 'all' ? selectedUser : null,
          period: selectedPeriod,
          generate_ai_summary: true,
          organization_id: organizationId || null
        }
      });
      
      if (error) throw error;
      
      const processed = data?.insights_generated || data?.processed || 1;
      toast.success(`🧠 AI Analysis completed! Generated insights for ${processed} user(s)`);
      
      // Refresh all data
      fetchAIInsights();
      fetchPendingCount();
      fetchAnalyzerHealth();
    } catch (e: any) {
      console.error('Error running org analysis:', e);
      toast.error(e?.message || 'Failed to run analyzer');
    } finally {
      setTriggeringAnalysis(false);
    }
  };

  // Helper functions for colors
  const getProductivityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (userDetails?.role !== 'admin') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-96">
            <div className="text-center">
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Access Required</h3>
              <p className="text-gray-600">You need admin privileges to access AI insights.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if non-super-admin user has organization assigned
  if (!isSuperAdmin && !organizationId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center h-96">
            <div className="text-center">
              <Building2 className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Organization Not Assigned</h3>
              <p className="text-gray-600 mb-2">Your account is not assigned to an organization.</p>
              <p className="text-gray-500 text-sm">Please contact your administrator to assign you to an organization.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🧠 AI Employee Insights</h1>
          <p className="text-muted-foreground">
            Comprehensive AI analysis of employee productivity, behavior, and security
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedPeriod} onValueChange={(value) => {
            setSelectedPeriod(value);
            if (value === 'custom') setCustomPickerOpen(true);
          }}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Dates</SelectItem>
            </SelectContent>
          </Select>
          {selectedPeriod === 'custom' && (
            <Popover open={customPickerOpen} onOpenChange={setCustomPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Clock className="h-3.5 w-3.5" />
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
            className="w-[180px]"
          />

          {/* Organization Filter (Super Admin only) */}
          {isSuperAdmin && organizations.length > 0 && (
            <Select value={selectedOrganization} onValueChange={setSelectedOrganization}>
              <SelectTrigger className="w-[200px]">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Performance Filter */}
          <Select value={performanceFilter} onValueChange={(v) => setPerformanceFilter(v as PerformanceStatus | 'all')}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Performance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Performance</SelectItem>
              <SelectItem value="excellent">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Excellent ({statusCounts.excellent})
                </span>
              </SelectItem>
              <SelectItem value="good">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Good ({statusCounts.good})
                </span>
              </SelectItem>
              <SelectItem value="needs_improvement">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  Needs Improvement ({statusCounts.needs_improvement})
                </span>
              </SelectItem>
              <SelectItem value="concerning">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Concerning ({statusCounts.concerning})
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Options */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <SortDesc className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="productivity_desc">Productivity (High→Low)</SelectItem>
              <SelectItem value="productivity_asc">Productivity (Low→High)</SelectItem>
              <SelectItem value="risk_high">Risk Level (High First)</SelectItem>
              <SelectItem value="name_asc">Name (A→Z)</SelectItem>
              <SelectItem value="screenshots_desc">Screenshots (Most)</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            onClick={selectedUser === 'all' ? triggerOrgAnalysis : triggerNewAnalysis} 
            disabled={triggeringAnalysis}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {triggeringAnalysis ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {selectedUser === 'all' ? 'Run Org Analysis' : 'Run AI Analysis'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Vision Analysis Status Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <VisionAnalysisPanel compact={false} showActions={true} />
        </div>
        <div className="lg:col-span-1">
          {/* AI System Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Analysis</span>
                <span className="font-medium">
                  {health?.lastRun 
                    ? new Date(health.lastRun).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Screenshots Pending</span>
                <Badge variant={pendingCount && pendingCount > 100 ? 'destructive' : 'secondary'}>
                  {pendingCount ?? '...'}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Screenshots Analyzed</span>
                <span className="font-medium">{shotsAnalyzed.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Duplicate Rate</span>
                <span className="font-medium">{dupRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Idle Rate</span>
                <span className="font-medium">{idleRate.toFixed(1)}%</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Attention Required Section - Shows employees needing attention at top */}
      {attentionRequired.length > 0 && performanceFilter === 'all' && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Attention Required ({attentionRequired.length} employee{attentionRequired.length > 1 ? 's' : ''})
            </CardTitle>
            <CardDescription className="text-red-600">
              These employees show concerning patterns or need performance improvement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {attentionRequired.slice(0, 6).map(insight => {
                const status = getPerformanceStatus(insight);
                const statusBadge = getPerformanceStatusBadge(status);
                return (
                  <div 
                    key={insight.id}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => { setSelectedInsight(insight); setDetailsModalOpen(true); }}
                  >
                    <div className="flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        status === 'concerning' ? 'bg-red-100' : 'bg-yellow-100'
                      }`}>
                        <User className={`h-5 w-5 ${status === 'concerning' ? 'text-red-600' : 'text-yellow-600'}`} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{insight.users?.full_name || 'Unknown'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-lg font-bold ${getProductivityColor(insight.productivity_score)}`}>
                          {insight.productivity_score}%
                        </span>
                        <Badge variant="outline" className={statusBadge.className}>
                          {statusBadge.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/admin/warnings');
                        }}
                        title="Send Warning"
                      >
                        <Send className="h-4 w-4 text-red-500" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/screenshots?user=${insight.user_id}`);
                        }}
                        title="View Screenshots"
                      >
                        <Eye className="h-4 w-4 text-blue-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {attentionRequired.length > 6 && (
                <div 
                  className="flex items-center justify-center p-3 bg-white rounded-lg border cursor-pointer hover:bg-gray-50"
                  onClick={() => setPerformanceFilter('concerning')}
                >
                  <span className="text-sm text-gray-600">+{attentionRequired.length - 6} more</span>
                  <ChevronRight className="h-4 w-4 ml-1" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top Applications</CardTitle>
            <CardDescription>Most active apps in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {topApps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No app activity</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topApps}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Sites</CardTitle>
            <CardDescription>Most visited domains</CardDescription>
          </CardHeader>
          <CardContent>
            {topSites.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No site activity</div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={topSites} dataKey="value" nameKey="name" cx="50%" cy="40%" outerRadius={80} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {topSites.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [value, name]} />
                  <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quality Rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Idle Rate</CardTitle>
            <CardDescription>Share of screenshots inferred idle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{idleRate}%</div>
            <p className="text-sm text-muted-foreground">Lower is better</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Duplicate Rate</CardTitle>
            <CardDescription>Share of screenshots skipped by dedup</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dupRate}%</div>
            <p className="text-sm text-muted-foreground">Expected during static screens/meetings</p>
          </CardContent>
        </Card>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Users Analyzed</p>
                <p className="text-2xl font-bold">{groupedInsights.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Team Avg</p>
                <p className={`text-2xl font-bold ${getProductivityColor(teamAverage)}`}>
                  {teamAverage}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Status Breakdown */}
        <Card className="bg-green-50/50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-green-700">Excellent</p>
                <p className="text-2xl font-bold text-green-600">{statusCounts.excellent}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50/50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-yellow-700">Needs Work</p>
                <p className="text-2xl font-bold text-yellow-600">{statusCounts.needs_improvement}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50/50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-red-700">Concerning</p>
                <p className="text-2xl font-bold text-red-600">{statusCounts.concerning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Eye className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Screenshots</p>
                <p className="text-2xl font-bold">{shotsAnalyzed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Real-Time Alerts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsPanel />
        
        {/* Quick Alert Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              AI Analysis Status
            </CardTitle>
            <CardDescription>
              Qwen3-32B powered analysis with real-time monitoring
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-sm font-medium">AI Model</span>
                <Badge variant="default" className="bg-green-600">Qwen3-32B Active</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <span className="text-sm font-medium">Vision Analysis</span>
                <Badge variant="outline">Qwen2.5-VL-7B Available</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <span className="text-sm font-medium">Alert System</span>
                <Badge variant="default" className="bg-purple-600">Real-time</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium">Duplicate Detection</span>
                <Badge variant="outline">Enabled</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Insights Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-4" />
            <p className="text-muted-foreground">Loading AI insights...</p>
          </div>
        </div>
      ) : groupedInsights.size === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Brain className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No AI Insights Available</h3>
              <p className="text-gray-600 mb-4">Click "Run AI Analysis" to generate insights for your employees.</p>
              <Button onClick={triggerNewAnalysis} disabled={triggeringAnalysis}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate First Analysis
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredAndSortedInsights.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center">
              <Filter className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Matching Employees</h3>
              <p className="text-gray-600 mb-4">No employees match the current filter criteria.</p>
              <Button onClick={() => setPerformanceFilter('all')} variant="outline">
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Results summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredAndSortedInsights.length} of {groupedInsights.size} employees
              {selectedOrganization !== 'all' && ` in ${organizations.find(o => o.id === selectedOrganization)?.name || 'selected organization'}`}
              {performanceFilter !== 'all' && ` (filtered by ${performanceFilter.replace('_', ' ')})`}
            </span>
            {isSuperAdmin && selectedOrganization === 'all' && insightsByOrganization.length > 1 && (
              <span className="text-xs">
                Grouped by {insightsByOrganization.length} organizations
              </span>
            )}
          </div>

          {/* Grouped by Organization Display */}
          {isSuperAdmin && selectedOrganization === 'all' && insightsByOrganization.length > 1 ? (
            // Show grouped by organization
            insightsByOrganization.map(({ organization, insights }) => {
              const orgId = organization?.id || 'unassigned';
              const isCollapsed = collapsedOrgs.has(orgId);
              const orgName = organization?.name || 'Unassigned Organization';
              
              // Calculate org-level stats
              const orgAvgProductivity = insights.length > 0 
                ? Math.round(insights.reduce((sum, i) => sum + i.latestInsight.productivity_score, 0) / insights.length)
                : 0;
              
              return (
                <div key={orgId} className="space-y-3">
                  {/* Organization Header */}
                  <div 
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 cursor-pointer hover:shadow-md transition-all"
                    onClick={() => {
                      const newCollapsed = new Set(collapsedOrgs);
                      if (isCollapsed) {
                        newCollapsed.delete(orgId);
                      } else {
                        newCollapsed.add(orgId);
                      }
                      setCollapsedOrgs(newCollapsed);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {organization?.logo_url ? (
                        <img 
                          src={organization.logo_url} 
                          alt={orgName} 
                          className="w-10 h-10 rounded-lg object-cover border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{orgName}</h3>
                        <p className="text-sm text-gray-500">
                          {insights.length} employee{insights.length !== 1 ? 's' : ''} • Avg: {orgAvgProductivity}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={
                        orgAvgProductivity >= 80 ? 'bg-green-100 text-green-800' :
                        orgAvgProductivity >= 60 ? 'bg-blue-100 text-blue-800' :
                        orgAvgProductivity >= 40 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }>
                        {orgAvgProductivity}% avg
                      </Badge>
                      {isCollapsed ? (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-gray-500" />
                      )}
                    </div>
                  </div>
                  
                  {/* Employee Cards for this Organization */}
                  {!isCollapsed && (
                    <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                      {insights.map(({ userId, latestInsight, totalInsights }) => (
                        <CompactEmployeeCard
                          key={userId}
                          insight={latestInsight}
                          historicalCount={totalInsights - 1}
                          teamAverage={teamAverage}
                          screenshotCount={screenshotCounts[latestInsight.user_id]}
                          issuesCount={issuesCounts[latestInsight.user_id] || 0}
                          issueLabels={issuesDetails[latestInsight.user_id] || []}
                          onMoreDetails={() => {
                            setSelectedInsight(latestInsight);
                            setDetailsModalOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Flat list (single org admin or filtered)
            <div className="space-y-3">
              {filteredAndSortedInsights.map(({ userId, latestInsight, totalInsights }) => (
                <CompactEmployeeCard
                  key={userId}
                  insight={latestInsight}
                  historicalCount={totalInsights - 1}
                  teamAverage={teamAverage}
                  screenshotCount={screenshotCounts[latestInsight.user_id]}
                  issuesCount={issuesCounts[latestInsight.user_id] || 0}
                  issueLabels={issuesDetails[latestInsight.user_id] || []}
                  onMoreDetails={() => {
                    setSelectedInsight(latestInsight);
                    setDetailsModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Groups Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Duplicate Groups Summary</CardTitle>
          <CardDescription>Overview of duplicate screenshot groups detected across all users</CardDescription>
        </CardHeader>
        <CardContent>
          {dupGroups.length === 0 ? (
            <div className="text-muted-foreground text-sm">No duplicate groups detected.</div>
          ) : (
            <div className="space-y-2">
              {dupGroups.map(g => (
                <div key={g.hash} className="flex items-center justify-between border rounded px-2 py-1 text-sm">
                  <span className="truncate mr-2">{g.hash}</span>
                  <Badge variant="secondary">{g.count}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Details Modal */}
      <EmployeeDetailsModal
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        insight={selectedInsight}
      />
    </div>
  );
} 