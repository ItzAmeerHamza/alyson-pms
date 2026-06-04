// Activity Issues Data Hook
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { fetchOrgUsers } from '@/domains/people';
import { fetchScreenshots as fetchScreenshotsApi } from '@/domains/monitoring/services/screenshots.service';
import { fetchAppLogs } from '@/domains/monitoring/services/app-logs.service';
import { fetchUrlLogs } from '@/domains/monitoring/services/url-logs.service';
import { fetchIdleLogs } from '@/domains/monitoring/services/idle-logs.service';
import { 
  FilterOptions, 
  DetectedIssue, 
  EmployeeIssuesSummary, 
  IssueSummaryStats,
  IssueType,
  User,
  DateRange
} from '../types';
import {
  ISSUE_THRESHOLDS,
  RISK_WEIGHTS,
  DEFAULT_FILTER_OPTIONS,
} from '../constants';

// AI Vision categories for dynamic classification
type VisionCategory = 'productive' | 'social_media' | 'entertainment' | 'gaming' | 'communication' | 'shopping' | 'other';
import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface UseActivityIssuesResult {
  issues: DetectedIssue[];
  employeeSummaries: EmployeeIssuesSummary[];
  stats: IssueSummaryStats;
  users: User[];
  loading: boolean;
  error: string | null;
  filters: FilterOptions;
  setFilters: (filters: Partial<FilterOptions>) => void;
  refresh: () => Promise<void>;
}

// Helper to get date range based on period
function getDateRangeForPeriod(period: string, customRange?: DateRange): DateRange {
  const now = new Date();
  
  if (customRange) {
    return customRange;
  }

  switch (period) {
    case 'daily':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'weekly':
      return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
    case 'monthly':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last-month': {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    default:
      return { start: subDays(now, 7), end: now };
  }
}

/**
 * @deprecated REMOVED - AI Vision now classifies all apps dynamically
 * Static lists caused false positives (Teams marked as social when it's work meeting)
 * AI analyzes actual screenshot content to decide category
 */
// function isSocialMediaApp(appName: string): boolean { return false; }
// function isGamingApp(appName: string): boolean { return false; }

// DEPRECATED: Static domain matching replaced with AI vision_category
// Vision AI now dynamically classifies content as: social_media, entertainment, gaming, etc.
// This prevents false positives (e.g., Dropbox wrongly classified as social media)

// Screenshot type for proof screenshots
type ProofScreenshot = {
  id: string;
  imageUrl: string;
  capturedAt: string;
  activityPercent: number;
  appName?: string;
};

// Helper to get the most recent timestamp from an array
function getMostRecentTimestamp(timestamps: Date[]): Date {
  if (timestamps.length === 0) return new Date();
  return timestamps.reduce((latest, current) => 
    current > latest ? current : latest
  , timestamps[0]);
}

export function useActivityIssues(isAdmin: boolean): UseActivityIssuesResult {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [filters, setFiltersState] = useState<FilterOptions>(DEFAULT_FILTER_OPTIONS);
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setFilters = useCallback((newFilters: Partial<FilterOptions>) => {
    setFiltersState(prev => {
      const updated = { ...prev, ...newFilters };
      // Update date range when period changes
      if (newFilters.period && newFilters.period !== prev.period) {
        updated.dateRange = getDateRangeForPeriod(newFilters.period);
      }
      return updated;
    });
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      const data = await fetchOrgUsers(
        { organizationId, isSuperAdmin },
        { excludeTestEmails: true },
      );
      setUsers(
        data.map((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name || u.email,
          role: u.role || 'employee',
        })),
      );
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setUsersLoaded(true);
    }
  }, [organizationId, isSuperAdmin]);

  // Main data fetching function
  const fetchIssues = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    setError(null);

    try {
      const dateRange = getDateRangeForPeriod(filters.period, filters.dateRange);
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();

      const detectedIssues: DetectedIssue[] = [];
      const userMap = new Map(users.map(u => [u.id, u]));
      
      // Get organization user IDs for filtering screenshots
      const orgUserIds = users.map(u => u.id);
      
      // If no users in org, return empty
      if (orgUserIds.length === 0) {
        setIssues([]);
        setLoading(false);
        return;
      }

      const allScreenshots = await fetchScreenshotsApi(
        { organizationId, isSuperAdmin, orgUserIds },
        { start: dateRange.start, end: dateRange.end, limit: 10000 },
      );
      const scopedShots =
        filters.userFilter !== 'all'
          ? allScreenshots.filter((s) => s.user_id === filters.userFilter)
          : allScreenshots;

      // 1. Duplicate screenshots
      const duplicates = scopedShots.filter((s) => s.is_duplicate);

      // Build proper duplicate chains using duplicate_matched_id
      // This uses Union-Find to group all screenshots that are duplicates of each other
      type DupRow = { 
        id: string; 
        user_id: string; 
        image_url: string; 
        captured_at: string; 
        activity_percent: number | null; 
        app_name: string | null; 
        duplicate_group_hash: string | null; 
        is_duplicate: boolean | null;
        duplicate_matched_id: string | null;
      };
      
      // Union-Find parent map: screenshot_id -> root_id
      const parent = new Map<string, string>();
      
      // Find root of a screenshot in the union-find structure
      const findRoot = (id: string): string => {
        if (!parent.has(id)) {
          parent.set(id, id);
          return id;
        }
        let root = id;
        while (parent.get(root) !== root) {
          root = parent.get(root)!;
        }
        // Path compression
        let current = id;
        while (current !== root) {
          const next = parent.get(current)!;
          parent.set(current, root);
          current = next;
        }
        return root;
      };
      
      // Union two screenshots into the same group
      const union = (id1: string, id2: string) => {
        const root1 = findRoot(id1);
        const root2 = findRoot(id2);
        if (root1 !== root2) {
          parent.set(root1, root2);
        }
      };
      
      // Build index of all duplicates by id for quick lookup
      const dupById = new Map<string, DupRow>();
      (duplicates || []).forEach((dup) => {
        if (!dup.user_id) return;
        dupById.set(dup.id, { ...dup, user_id: dup.user_id });
        // Initialize each duplicate in union-find
        findRoot(dup.id);
      });
      
      // Link duplicates to their matched originals or by group_hash (fallback)
      // Also group by duplicate_group_hash for screenshots with same hash (legacy support)
      const hashToFirstId = new Map<string, string>();
      
      (duplicates || []).forEach((dup) => {
        if (!dup.user_id) return;
        
        // Primary: Link via duplicate_matched_id (most accurate)
        if (dup.duplicate_matched_id) {
          union(dup.id, dup.duplicate_matched_id);
        }
        // Fallback: Link via duplicate_group_hash (for older data)
        else if (dup.duplicate_group_hash) {
          const hashKey = `${dup.user_id}-${dup.duplicate_group_hash}`;
          if (hashToFirstId.has(hashKey)) {
            union(dup.id, hashToFirstId.get(hashKey)!);
          } else {
            hashToFirstId.set(hashKey, dup.id);
          }
        }
        // No link available: each screenshot stays in its own group (won't form issue unless 3+ share same id somehow)
      });
      
      // Group duplicates by their root (chain leader)
      const dupGroups = new Map<string, DupRow[]>();
      dupById.forEach((dup, id) => {
        const root = findRoot(id);
        // Create key including user_id to separate different users
        const key = `${dup.user_id}-${root}`;
        if (!dupGroups.has(key)) {
          dupGroups.set(key, []);
        }
        dupGroups.get(key)!.push(dup);
      });

      // Create issues from duplicate chains
      dupGroups.forEach((group, key) => {
        // Only create issue if we have enough duplicates
        if (group && group.length >= ISSUE_THRESHOLDS.CONSECUTIVE_DUPLICATES) {
          // Sort by captured_at descending
          group.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
          
          const user = userMap.get(group[0].user_id);
          const rootId = key.split('-').slice(1).join('-'); // Extract root from key
          
          detectedIssues.push({
            id: `dup-chain-${rootId}`,
            type: 'duplicate_screenshots',
            severity: group.length >= 10 ? 'critical' : group.length >= 5 ? 'high' : 'medium',
            userId: group[0].user_id,
            userName: user?.full_name || 'Unknown',
            userEmail: user?.email || '',
            detectedAt: group[0].captured_at,
            count: group.length,
            details: {
              description: `${group.length} duplicate screenshots detected`,
              consecutiveCount: group.length,
              duplicateGroupHash: rootId,
            },
            screenshots: group.map(s => ({
              id: s.id,
              imageUrl: s.image_url,
              capturedAt: s.captured_at,
              activityPercent: s.activity_percent || 0,
              appName: s.app_name || undefined,
            })),
          });
        }
      });

      const lowActivity = scopedShots.filter(
        (s) =>
          !s.is_duplicate &&
          (s.activity_percent ?? 100) < ISSUE_THRESHOLDS.LOW_ACTIVITY_PERCENT,
      );

      // Group low activity by user
      type LowActivityRow = { id: string; user_id: string; image_url: string; captured_at: string; activity_percent: number | null; app_name: string | null; is_duplicate: boolean | null };
      const lowActivityByUser: Record<string, LowActivityRow[]> = {};
      (lowActivity || []).forEach((shot) => {
        if (!shot.user_id) return; // Skip if no user_id
        if (!lowActivityByUser[shot.user_id]) lowActivityByUser[shot.user_id] = [];
        lowActivityByUser[shot.user_id].push({ ...shot, user_id: shot.user_id });
      });

      Object.entries(lowActivityByUser).forEach(([userId, shots]) => {
        if (shots && shots.length >= 3) {
          const user = userMap.get(userId);
          const avgActivity = shots.reduce((sum, s) => sum + (s.activity_percent || 0), 0) / shots.length;
          detectedIssues.push({
            id: `low-${userId}-${Date.now()}`,
            type: 'low_activity',
            severity: avgActivity < 10 ? 'high' : 'medium',
            userId,
            userName: user?.full_name || 'Unknown',
            userEmail: user?.email || '',
            detectedAt: shots[0].captured_at,
            count: shots.length,
            details: {
              description: `${shots.length} screenshots with low activity (avg ${Math.round(avgActivity)}%)`,
              activityPercent: avgActivity,
            },
            screenshots: shots.map(s => ({
              id: s.id,
              imageUrl: s.image_url,
              capturedAt: s.captured_at,
              activityPercent: s.activity_percent || 0,
              appName: s.app_name || undefined,
            })),
          });
        }
      });

      // 3. REMOVED: allScreenshots query was dead code — findProofScreenshots was never called
      // after static app detection (section 4) was removed. Deleting saves the most expensive query.

      // 4. REMOVED: Static app-based social media and gaming detection
      // AI Vision now handles ALL classification dynamically via vision_category
      // This prevents false positives like "Teams = social media" when it's actually a work meeting
      // See Section 5 below for AI-based detection

      const visionScreenshots = scopedShots.filter((s) =>
        ['social_media', 'entertainment', 'gaming', 'shopping'].includes(
          (s as any).vision_category || '',
        ),
      );

      // Group by user and AI-detected category
      type VisionIssueData = { 
        screenshots: ProofScreenshot[]; 
        count: number; 
        descriptions: Set<string>;
        avgConfidence: number;
      };
      const socialMediaByVision: Record<string, VisionIssueData> = {};
      const entertainmentByVision: Record<string, VisionIssueData> = {};
      const gamingByVision: Record<string, VisionIssueData> = {};
      const shoppingByVision: Record<string, VisionIssueData> = {};

      (visionScreenshots || []).forEach((shot) => {
        if (!shot.user_id) return;
        const userId = shot.user_id;
        const category = shot.vision_category as VisionCategory;
        const proofShot: ProofScreenshot = {
                id: shot.id,
                imageUrl: shot.image_url,
                capturedAt: shot.captured_at,
                activityPercent: shot.activity_percent || 0,
                appName: shot.app_name || undefined,
        };
        const content = shot.vision_detected_content || 'AI-detected content';
        const confidence = shot.vision_confidence || 0.5;

        const addToCategory = (categoryMap: Record<string, VisionIssueData>) => {
          if (!categoryMap[userId]) {
            categoryMap[userId] = { screenshots: [], count: 0, descriptions: new Set(), avgConfidence: 0 };
          }
          categoryMap[userId].count++;
          categoryMap[userId].descriptions.add(content.substring(0, 100));
          categoryMap[userId].avgConfidence = 
            (categoryMap[userId].avgConfidence * (categoryMap[userId].count - 1) + confidence) / categoryMap[userId].count;
          // Keep up to 4 proof screenshots
          if (categoryMap[userId].screenshots.length < 4) {
            categoryMap[userId].screenshots.push(proofShot);
        }
        };

        switch (category) {
          case 'social_media':
            addToCategory(socialMediaByVision);
            break;
          case 'entertainment':
            addToCategory(entertainmentByVision);
            break;
          case 'gaming':
            addToCategory(gamingByVision);
            break;
          case 'shopping':
            addToCategory(shoppingByVision);
            break;
        }
      });

      // Create social media issues from AI detection (threshold: 5+ screenshots)
      Object.entries(socialMediaByVision).forEach(([userId, data]) => {
        if (data.count >= 5) {
          const user = userMap.get(userId);
          detectedIssues.push({
            id: `social-ai-${userId}`,
            type: 'social_media_url',
            severity: data.count > 20 ? 'high' : 'medium',
            userId,
            userName: user?.full_name || 'Unknown',
            userEmail: user?.email || '',
            detectedAt: data.screenshots[0]?.capturedAt || new Date().toISOString(),
            count: data.count,
            details: {
              description: `AI detected ${data.count} social media screenshots (${Math.round(data.avgConfidence * 100)}% avg confidence)`,
              domains: Array.from(data.descriptions).slice(0, 3),
            },
            screenshots: data.screenshots,
          });
        }
      });

      // Create entertainment issues from AI detection
      Object.entries(entertainmentByVision).forEach(([userId, data]) => {
        if (data.count >= 5) {
          const user = userMap.get(userId);
          detectedIssues.push({
            id: `entertainment-ai-${userId}`,
            type: 'entertainment',
            severity: data.count > 15 ? 'high' : data.count > 10 ? 'medium' : 'low',
            userId,
            userName: user?.full_name || 'Unknown',
            userEmail: user?.email || '',
            detectedAt: data.screenshots[0]?.capturedAt || new Date().toISOString(),
            count: data.count,
            details: {
              description: `AI detected ${data.count} entertainment screenshots (${Math.round(data.avgConfidence * 100)}% avg confidence)`,
              domains: Array.from(data.descriptions).slice(0, 3),
            },
            screenshots: data.screenshots,
          });
        }
      });

      // Create gaming issues from AI detection
      Object.entries(gamingByVision).forEach(([userId, data]) => {
        if (data.count >= 3) { // Lower threshold for gaming (more serious)
        const user = userMap.get(userId);
        detectedIssues.push({
            id: `gaming-ai-${userId}`,
          type: 'gaming',
          severity: 'high',
          userId,
          userName: user?.full_name || 'Unknown',
          userEmail: user?.email || '',
            detectedAt: data.screenshots[0]?.capturedAt || new Date().toISOString(),
          count: data.count,
          details: {
              description: `AI detected ${data.count} gaming screenshots (${Math.round(data.avgConfidence * 100)}% avg confidence)`,
              domains: Array.from(data.descriptions).slice(0, 3),
          },
            screenshots: data.screenshots,
        });
        }
      });

      const idleShots = scopedShots.filter((s) => s.idle_inferred);

      const totalByUser: Record<string, number> = {};
      const idleByUser: Record<string, { count: number; screenshots: ProofScreenshot[] }> = {};

      scopedShots.forEach((s) => {
        if (!s.user_id) return;
        totalByUser[s.user_id] = (totalByUser[s.user_id] || 0) + 1;
      });

      idleShots.forEach((s) => {
        if (!s.user_id) return;
        if (!idleByUser[s.user_id]) {
          idleByUser[s.user_id] = { count: 0, screenshots: [] };
        }
        idleByUser[s.user_id].count++;
        if (idleByUser[s.user_id].screenshots.length < 4) {
          idleByUser[s.user_id].screenshots.push({
            id: s.id,
            imageUrl: s.image_url || '',
            capturedAt: s.captured_at,
            activityPercent: s.activity_percent || 0,
            appName: s.app_name || undefined,
          });
        }
      });

      Object.entries(idleByUser).forEach(([userId, data]) => {
        const total = totalByUser[userId] || 1;
        const idlePercent = (data.count / total) * 100;
        
        if (idlePercent >= ISSUE_THRESHOLDS.EXCESSIVE_IDLE_PERCENT) {
          const user = userMap.get(userId);
          detectedIssues.push({
            id: `idle-${userId}`,
            type: 'excessive_idle',
            severity: idlePercent > 40 ? 'high' : 'medium',
            userId,
            userName: user?.full_name || 'Unknown',
            userEmail: user?.email || '',
            detectedAt: data.screenshots[0]?.capturedAt || new Date().toISOString(),
            count: data.count,
            details: {
              description: `${Math.round(idlePercent)}% of screenshots show idle state (${data.count}/${total})`,
              activityPercent: 100 - idlePercent,
            },
            screenshots: data.screenshots,
          });
        }
      });

      // Apply type filter
      let filteredIssues = detectedIssues;
      if (filters.issueTypeFilter !== 'all') {
        filteredIssues = filteredIssues.filter(i => i.type === filters.issueTypeFilter);
      }
      if (filters.severityFilter !== 'all') {
        filteredIssues = filteredIssues.filter(i => i.severity === filters.severityFilter);
      }

      // Sort by severity and count
      filteredIssues.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.count - a.count;
      });

      setIssues(filteredIssues);
    } catch (err: any) {
      console.error('Error fetching activity issues:', err);
      setError(err.message || 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filters, users]);

  // Calculate employee summaries from issues
  const employeeSummaries = useMemo((): EmployeeIssuesSummary[] => {
    const summaryMap: Record<string, EmployeeIssuesSummary> = {};

    issues.forEach(issue => {
      if (!summaryMap[issue.userId]) {
        summaryMap[issue.userId] = {
          userId: issue.userId,
          userName: issue.userName,
          userEmail: issue.userEmail,
          totalIssues: 0,
          issuesByType: {
            duplicate_screenshots: 0,
            low_activity: 0,
            social_media_app: 0,
            social_media_url: 0,
            entertainment: 0,
            gaming: 0,
            excessive_idle: 0,
          },
          riskScore: 0,
          trend: 'stable',
          lastIssueAt: issue.detectedAt,
        };
      }

      summaryMap[issue.userId].totalIssues++;
      summaryMap[issue.userId].issuesByType[issue.type]++;
      summaryMap[issue.userId].riskScore += RISK_WEIGHTS[issue.type] * issue.count;

      // Update last issue time
      if (issue.detectedAt > (summaryMap[issue.userId].lastIssueAt || '')) {
        summaryMap[issue.userId].lastIssueAt = issue.detectedAt;
      }
    });

    // Normalize risk scores (0-100)
    const summaries = Object.values(summaryMap);
    const maxRisk = Math.max(...summaries.map(s => s.riskScore), 1);
    summaries.forEach(s => {
      s.riskScore = Math.min(100, Math.round((s.riskScore / maxRisk) * 100));
    });

    // Sort by risk score
    return summaries.sort((a, b) => b.riskScore - a.riskScore);
  }, [issues]);

  // Calculate summary statistics
  const stats = useMemo((): IssueSummaryStats => {
    const issuesByType: Record<IssueType, number> = {
      duplicate_screenshots: 0,
      low_activity: 0,
      social_media_app: 0,
      social_media_url: 0,
      entertainment: 0,
      gaming: 0,
      excessive_idle: 0,
    };

    const issuesBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const uniqueUsers = new Set<string>();

    issues.forEach(issue => {
      issuesByType[issue.type]++;
      issuesBySeverity[issue.severity]++;
      uniqueUsers.add(issue.userId);
    });

    // Find most common issue
    let mostCommonIssue: IssueType | null = null;
    let maxCount = 0;
    (Object.entries(issuesByType) as [IssueType, number][]).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonIssue = type;
      }
    });

    // Calculate average risk score
    const avgRisk = employeeSummaries.length > 0
      ? Math.round(employeeSummaries.reduce((sum, e) => sum + e.riskScore, 0) / employeeSummaries.length)
      : 0;

    return {
      totalIssues: issues.length,
      employeesAffected: uniqueUsers.size,
      mostCommonIssue,
      averageRiskScore: avgRisk,
      issuesByType,
      issuesBySeverity: issuesBySeverity as Record<string, number>,
      trendVsPrevious: 0, // TODO: Calculate from previous period
    };
  }, [issues, employeeSummaries]);

  // Initial data fetch with stale-response guard
  useEffect(() => {
    let cancelled = false;
    fetchUsers().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [fetchUsers]);

  // Fetch issues when filters or users change
  useEffect(() => {
    let cancelled = false;
    if (users.length > 0) {
      fetchIssues().then(() => {
        if (cancelled) return;
      });
    } else if (usersLoaded) {
      setIssues([]);
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [users, usersLoaded, fetchIssues]);

  const refresh = useCallback(async () => {
    await fetchIssues();
  }, [fetchIssues]);

  return {
    issues,
    employeeSummaries,
    stats,
    users,
    loading,
    error,
    filters,
    setFilters,
    refresh,
  };
}

