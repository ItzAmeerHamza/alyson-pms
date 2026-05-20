// Main data fetching and management hook for URL logs
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchPaginated } from '@/lib/supabase-utils';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';
import {
  URLLog,
  User,
  URLStats,
  FilterOptions,
  URLSession,
  TopSite,
  CategoryStats,
  UserActivityStats,
  BrowserStats,
  TimelineDataPoint,
  DurationBucket,
} from '../types';
import {
  extractDomain,
  categorizeDomain,
  isSocialMedia,
  calculateProductivityScore,
  matchesTimeOfDay,
} from '../utils';
import { DURATION_BUCKETS } from '../constants';
import { groupUrlsIntoSessions, filterSessions } from './session-utils';

export const useUrlLogs = (filters: FilterOptions) => {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [urlLogs, setUrlLogs] = useState<URLLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Combined fetch function that gets users first, then URL logs.
  // Accepts an AbortSignal so callers can prevent stale state updates.
  const fetchAllData = async (signal?: { cancelled: boolean }) => {
    try {
      setLoading(true);
      
      const currentOrgId = userDetails?.organization_id;
      const currentIsSuperAdmin = isSuperAdmin;
      
      let usersQuery = supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'employee');
      
      if (currentOrgId && !currentIsSuperAdmin) {
        usersQuery = usersQuery.eq('organization_id', currentOrgId);
      }
      
      const { data: usersData, error: usersError } = await usersQuery.order('full_name');
      if (usersError) throw usersError;
      if (signal?.cancelled) return;
      
      const fetchedUsers = usersData || [];
      setUsers(fetchedUsers);
      
      const orgUserIds = fetchedUsers.map(u => u.id);
      
      if (orgUserIds.length === 0) {
        setUrlLogs([]);
        setLoading(false);
        return;
      }

      let urlQuery = supabase
        .from('url_logs')
        .select(`
          id,
          url,
          title,
          user_id,
          timestamp,
          domain,
          browser,
          time_log_id
        `)
        .in('user_id', orgUserIds)
        .gte('timestamp', filters.dateRange.from.toISOString())
        .lte('timestamp', filters.dateRange.to.toISOString())
        .not('url', 'ilike', '%browser-activity-detected.local%')
        .order('timestamp', { ascending: false });

      if (filters.userFilter && filters.userFilter !== 'all') {
        urlQuery = urlQuery.eq('user_id', filters.userFilter);
      }

      const urlData = await fetchPaginated<any>(urlQuery);
      if (signal?.cancelled) return;

      const logs: URLLog[] = urlData.map(log => ({
        ...log,
        users: fetchedUsers.find(user => user.id === log.user_id) || null
      })) as URLLog[];

      setUrlLogs(logs);
    } catch (error) {
      if (signal?.cancelled) return;
      console.error('[URL-LOGS] Error fetching data:', error);
      toast.error('Failed to fetch URL data');
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  };

  // Initial fetch - wait for userDetails to be available
  useEffect(() => {
    const signal = { cancelled: false };

    if (userDetails) {
      fetchAllData(signal);
    }

    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDetails?.id, userDetails?.organization_id, isSuperAdmin, filters.dateRange, filters.userFilter]);

  // Filter URL logs based on all filter criteria
  const filteredUrlLogs = useMemo(() => {
    return urlLogs.filter(log => {
      // Browser filter
      if (filters.browserFilter && filters.browserFilter !== 'all') {
        if (log.browser !== filters.browserFilter) return false;
      }

      // Category filter
      if (filters.categoryFilter && filters.categoryFilter !== 'all') {
        const domain = extractDomain(log.url || '');
        const category = categorizeDomain(domain);
        if (category !== filters.categoryFilter) return false;
      }

      // Time of day filter
      const logTimestamp = log.timestamp;
      if (!matchesTimeOfDay(logTimestamp, filters.timeOfDayFilter as 'all' | 'morning' | 'afternoon' | 'evening' | 'night')) {
        return false;
      }

      // Social media only filter
      if (filters.socialMediaOnly) {
        const domain = extractDomain(log.url || '');
        if (!isSocialMedia(domain)) return false;
      }

      // Search filter
      if (filters.searchTerm) {
        const searchLower = filters.searchTerm.toLowerCase();
        const domain = extractDomain(log.url || '');
        const title = log.title || '';
        const url = log.url || '';
        const userName = log.users?.full_name || '';

        const matches =
          domain.toLowerCase().includes(searchLower) ||
          title.toLowerCase().includes(searchLower) ||
          url.toLowerCase().includes(searchLower) ||
          userName.toLowerCase().includes(searchLower);

        if (!matches) return false;
      }

      return true;
    });
  }, [urlLogs, filters]);

  // Generate sessions from filtered logs
  const sessions = useMemo(() => {
    const allSessions = groupUrlsIntoSessions(filteredUrlLogs, users);
    return filterSessions(allSessions, {
      searchTerm: filters.searchTerm,
      categoryFilter: filters.categoryFilter,
      timeOfDayFilter: filters.timeOfDayFilter,
      socialMediaOnly: filters.socialMediaOnly,
    });
  }, [filteredUrlLogs, users, filters]);

  // Calculate comprehensive stats
  const stats: URLStats = useMemo(() => {
    const logs = filteredUrlLogs;

    // Basic stats
    const totalTime = logs.length * 60; // Estimate 1 minute per URL
    const uniqueSites = new Set(
      logs.map(log => extractDomain(log.url || ''))
    ).size;
    const totalVisits = logs.length;
    const activeUsers = new Set(logs.map(log => log.user_id)).size;
    const browsersUsed = new Set(logs.map(log => log.browser).filter(Boolean)).size;

    // Social media stats
    const socialMediaUrls = logs.filter(log => {
      const domain = extractDomain(log.url || '');
      return isSocialMedia(domain);
    });
    const socialMediaVisits = socialMediaUrls.length;
    const socialMediaPercentage = totalVisits > 0 
      ? (socialMediaVisits / totalVisits) * 100 
      : 0;

    // Productivity score
    const productivityScore = calculateProductivityScore(logs);

    // Top sites
    const siteStats = new Map<string, { time: number; visits: number; category: string }>();
    logs.forEach(log => {
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);
      const current = siteStats.get(domain) || { time: 0, visits: 0, category };
      siteStats.set(domain, {
        time: current.time + 60,
        visits: current.visits + 1,
        category,
      });
    });

    const topSites: TopSite[] = Array.from(siteStats.entries())
      .map(([site, data]) => ({
        site,
        time: data.time,
        visits: data.visits,
        category: data.category,
        isSocialMedia: isSocialMedia(site),
      }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    // Category breakdown
    const categoryMap = new Map<string, { time: number; visits: number }>();
    logs.forEach(log => {
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);
      const current = categoryMap.get(category) || { time: 0, visits: 0 };
      categoryMap.set(category, {
        time: current.time + 60,
        visits: current.visits + 1,
      });
    });

    const totalCategoryTime = Array.from(categoryMap.values())
      .reduce((sum, cat) => sum + cat.time, 0);

    const categoryBreakdown: CategoryStats[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        time: data.time,
        visits: data.visits,
        percentage: totalCategoryTime > 0 ? (data.time / totalCategoryTime) * 100 : 0,
      }))
      .sort((a, b) => b.time - a.time);

    // User activity
    const userStatsMap = new Map<string, {
      time: number;
      sites: Set<string>;
      workSites: number;
      socialMediaSites: number;
      otherSites: number;
    }>();

    logs.forEach(log => {
      const userId = log.user_id;
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);

      if (!userStatsMap.has(userId)) {
        userStatsMap.set(userId, {
          time: 0,
          sites: new Set(),
          workSites: 0,
          socialMediaSites: 0,
          otherSites: 0,
        });
      }

      const userStats = userStatsMap.get(userId)!;
      userStats.time += 60;
      userStats.sites.add(domain);

      if (category === 'Work' || category === 'Development' || category === 'Productivity') {
        userStats.workSites++;
      } else if (category === 'Social Media') {
        userStats.socialMediaSites++;
      } else {
        userStats.otherSites++;
      }
    });

    const userActivity: UserActivityStats[] = Array.from(userStatsMap.entries())
      .map(([userId, data]) => {
        const user = users.find(u => u.id === userId);
        const userLogs = logs.filter(l => l.user_id === userId);
        return {
          userId,
          user: user?.full_name || 'Unknown User',
          time: data.time,
          sites: data.sites.size,
          workSites: data.workSites,
          socialMediaSites: data.socialMediaSites,
          otherSites: data.otherSites,
          productivityScore: calculateProductivityScore(userLogs),
        };
      })
      .sort((a, b) => b.time - a.time);

    // Browser breakdown
    const browserStatsMap = new Map<string, {
      time: number;
      visits: number;
      categories: { work: number; socialMedia: number; neutral: number; distracting: number };
    }>();

    logs.forEach(log => {
      const browser = log.browser || 'Unknown';
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);

      if (!browserStatsMap.has(browser)) {
        browserStatsMap.set(browser, {
          time: 0,
          visits: 0,
          categories: { work: 0, socialMedia: 0, neutral: 0, distracting: 0 },
        });
      }

      const browserData = browserStatsMap.get(browser)!;
      browserData.time += 60;
      browserData.visits++;

      if (category === 'Work' || category === 'Development' || category === 'Productivity') {
        browserData.categories.work++;
      } else if (category === 'Social Media') {
        browserData.categories.socialMedia++;
      } else if (category === 'Search' || category === 'Communication') {
        browserData.categories.neutral++;
      } else {
        browserData.categories.distracting++;
      }
    });

    const browserBreakdown: BrowserStats[] = Array.from(browserStatsMap.entries())
      .map(([browser, data]) => ({
        browser,
        time: data.time,
        visits: data.visits,
        categories: data.categories,
      }))
      .sort((a, b) => b.visits - a.visits);

    // Timeline data (hourly)
    const timelineMap = new Map<number, {
      total: number;
      socialMedia: number;
      work: number;
      [key: string]: number;
    }>();

    logs.forEach(log => {
      const logTs = log.timestamp;
      const hour = new Date(logTs).getHours();
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);

      if (!timelineMap.has(hour)) {
        timelineMap.set(hour, { total: 0, socialMedia: 0, work: 0 });
      }

      const hourData = timelineMap.get(hour)!;
      hourData.total++;

      if (category === 'Social Media') {
        hourData.socialMedia++;
      } else if (category === 'Work' || category === 'Development' || category === 'Productivity') {
        hourData.work++;
      }

      // Per-user timeline
      const userName = log.users?.full_name || 'Unknown';
      const userKey = `user_${userName.replace(/\s+/g, '_')}`;
      hourData[userKey] = (hourData[userKey] || 0) + 1;
    });

    const timelineData: TimelineDataPoint[] = Array.from({ length: 24 }, (_, hour) => {
      const data = timelineMap.get(hour) || { total: 0, socialMedia: 0, work: 0 };
      return {
        time: `${hour.toString().padStart(2, '0')}:00`,
        hour,
        ...data,
      };
    });

    // Session duration distribution
    const durationCounts = new Map<string, number>();
    DURATION_BUCKETS.forEach(bucket => {
      durationCounts.set(bucket.label, 0);
    });

    sessions.forEach(session => {
      const duration = session.totalDuration;
      const bucket = DURATION_BUCKETS.find(b => duration >= b.min && duration < b.max);
      if (bucket) {
        durationCounts.set(bucket.label, (durationCounts.get(bucket.label) || 0) + 1);
      }
    });

    const totalSessions = sessions.length;
    const sessionDurationDistribution: DurationBucket[] = DURATION_BUCKETS.map(bucket => ({
      range: bucket.label,
      count: durationCounts.get(bucket.label) || 0,
      percentage: totalSessions > 0 
        ? ((durationCounts.get(bucket.label) || 0) / totalSessions) * 100 
        : 0,
    }));

    // Social media vs work breakdown
    const workSites = logs.filter(log => {
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);
      return category === 'Work' || category === 'Development' || category === 'Productivity';
    }).length;

    const socialMedia = socialMediaVisits;

    const neutral = logs.filter(log => {
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);
      return category === 'Search' || category === 'Communication';
    }).length;

    const distracting = logs.filter(log => {
      const domain = extractDomain(log.url || '');
      const category = categorizeDomain(domain);
      return category === 'Entertainment' || category === 'News' || category === 'Shopping';
    }).length;

    return {
      totalTime,
      totalSites: uniqueSites,
      totalVisits,
      activeUsers,
      browsersUsed,
      socialMediaVisits,
      socialMediaPercentage,
      productivityScore,
      topSites,
      categoryBreakdown,
      userActivity,
      browserBreakdown,
      timelineData,
      sessionDurationDistribution,
      hourlyActivity: [], // Will be calculated if needed for heatmap
      socialMediaVsWork: {
        workSites,
        socialMedia,
        neutral,
        distracting,
      },
    };
  }, [filteredUrlLogs, users, sessions]);

  const refetch = () => {
    fetchAllData();
  };

  return {
    urlLogs: filteredUrlLogs,
    allUrlLogs: urlLogs,
    users,
    sessions,
    loading,
    stats,
    refetch,
  };
};

