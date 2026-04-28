import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Screenshot, User, Project, FilterOptions, ScreenshotStats } from '../types';
import { analyzeScreenshotContent, mapDbCategoryToDisplayCategory } from '../services/ai-analysis.service';
import { format, startOfDay, endOfDay } from 'date-fns';
import { toast } from 'sonner';
import { mergeTimeIntervals, getSmartEndMs, type TimeInterval } from '@/lib/time-utils';

interface AIStatus {
  aiEnabled: boolean;
  aiProvider: string;
  models: {
    text: string;
    vision: string;
  };
  pendingCount: number;
  analyzing: boolean;
  loaded: boolean;
}

interface UseScreenshotsReturn {
  screenshots: Screenshot[];
  filteredScreenshots: Screenshot[];
  users: User[];
  projects: Project[];
  loading: boolean;
  stats: ScreenshotStats;
  aiStatus: AIStatus;
  fetchData: () => Promise<void>;
  deleteScreenshot: (id: string) => Promise<void>;
  bulkDeleteScreenshots: (ids: string[]) => Promise<void>;
  estimateDeduction: (screenshotId: string) => Promise<number>;
  triggerAIAnalysis: (limit?: number) => Promise<void>;
  reanalyzeScreenshot: (screenshotId: string) => Promise<void>;
  fetchAIStatus: () => Promise<void>;
}

export const useScreenshots = (
  filters: FilterOptions, 
  isAdmin: boolean, 
  userId?: string,
  organizationId?: string | null,
  isSuperAdmin?: boolean
): UseScreenshotsReturn => {
  const aiStatusEnabled = true; // AI is always enabled via pg_cron
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLogsMinutes, setTimeLogsMinutes] = useState<number>(0);
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    aiEnabled: false,
    aiProvider: 'huggingface',
    models: { text: '', vision: '' },
    pendingCount: 0,
    analyzing: false,
    loaded: false
  });

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // First fetch users to know which user_ids belong to this organization
      const usersResult = await fetchUsers();
      if (usersResult) setUsers(usersResult);
      
      // Get org user IDs so we can push the filter into the DB query
      const orgUserIds = (usersResult || []).map(u => u.id);
      
      // Then fetch screenshots, projects, and time logs in parallel
      const [screenshotsResult, projectsResult] = await Promise.all([
        fetchScreenshots(orgUserIds),
        fetchProjects(),
        fetchTimeLogsForDay(orgUserIds)
      ]);

      if (screenshotsResult) setScreenshots(screenshotsResult);
      if (projectsResult) setProjects(projectsResult);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load screenshots');
    } finally {
      setLoading(false);
    }
  }, [filters.selectedDate, filters.userFilter, isAdmin, userId, organizationId, isSuperAdmin]);

  // Fetch time_logs for the selected day to compute total hours worked (end - start)
  // Cross-references with screenshots to cap sessions where the last screenshot is far before end_time
  const fetchTimeLogsForDay = async (orgUserIds: string[] = []): Promise<void> => {
    try {
      const selectedDate = new Date(filters.selectedDate);
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      let query = supabase
        .from('time_logs')
        .select('user_id, start_time, end_time')
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString());

      if (filters.userFilter && filters.userFilter !== 'all') {
        query = query.eq('user_id', filters.userFilter);
      } else if (!isAdmin && userId) {
        query = query.eq('user_id', userId);
      } else if (organizationId && !isSuperAdmin && orgUserIds.length > 0) {
        query = query.in('user_id', orgUserIds);
      }

      // Also fetch screenshot timestamps for the same day to cap sessions smartly
      let ssQuery = supabase
        .from('screenshots')
        .select('user_id, captured_at')
        .gte('captured_at', start.toISOString())
        .lte('captured_at', end.toISOString());

      if (filters.userFilter && filters.userFilter !== 'all') {
        ssQuery = ssQuery.eq('user_id', filters.userFilter);
      } else if (!isAdmin && userId) {
        ssQuery = ssQuery.eq('user_id', userId);
      } else if (organizationId && !isSuperAdmin && orgUserIds.length > 0) {
        ssQuery = ssQuery.in('user_id', orgUserIds);
      }

      const [logsResult, ssResult] = await Promise.all([query, ssQuery]);

      if (logsResult.error) {
        console.error('Error fetching time_logs for hours:', logsResult.error);
        setTimeLogsMinutes(0);
        return;
      }

      // Build per-user sorted screenshot timestamps
      const userScreenshots: { [uid: string]: number[] } = {};
      (ssResult.data || []).forEach((ss: any) => {
        if (!ss.user_id) return;
        if (!userScreenshots[ss.user_id]) userScreenshots[ss.user_id] = [];
        userScreenshots[ss.user_id].push(new Date(ss.captured_at).getTime());
      });
      // Sort ascending for binary search
      for (const uid of Object.keys(userScreenshots)) {
        userScreenshots[uid].sort((a, b) => a - b);
      }

      // Group by user_id, merge overlapping intervals, sum durations
      const byUser: { [userId: string]: TimeInterval[] } = {};
      (logsResult.data || []).forEach((log: any) => {
        if (!log.user_id || !log.start_time) return;
        const uid = log.user_id;
        if (!byUser[uid]) byUser[uid] = [];
        const startMs = new Date(log.start_time).getTime();
        let endMs = log.end_time ? new Date(log.end_time).getTime() : Date.now();
        if (endMs <= startMs) return;

        // Find last screenshot within this session's time range
        const ssTimes = userScreenshots[uid] || [];
        let lastSsMs: number | undefined;
        for (let i = ssTimes.length - 1; i >= 0; i--) {
          if (ssTimes[i] >= startMs && ssTimes[i] <= endMs) {
            lastSsMs = ssTimes[i];
            break;
          }
        }

        endMs = getSmartEndMs(startMs, endMs, lastSsMs);
        byUser[uid].push({ startMs, endMs });
      });

      let totalMs = 0;
      for (const intervals of Object.values(byUser)) {
        const merged = mergeTimeIntervals(intervals);
        for (const interval of merged) {
          totalMs += interval.endMs - interval.startMs;
        }
      }

      setTimeLogsMinutes(Math.round(totalMs / (1000 * 60)));
    } catch (err) {
      console.error('Error in fetchTimeLogsForDay:', err);
      setTimeLogsMinutes(0);
    }
  };

  // Fetch screenshots with filters -- orgUserIds pushed into DB query to avoid truncation
  const fetchScreenshots = async (orgUserIds: string[] = []): Promise<Screenshot[] | null> => {
    try {
      const selectedDate = new Date(filters.selectedDate);
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      console.log(`[SCREENSHOT-QUERY] date=${filters.selectedDate} range=${start.toISOString()}..${end.toISOString()} user=${filters.userFilter}`);

      let query = supabase
        .from('screenshots')
        .select('*')
        .gte('captured_at', start.toISOString())
        .lte('captured_at', end.toISOString())
        .order('captured_at', { ascending: false });

      // Push employee filter into the DB query to avoid hitting the default 1000-row limit
      if (filters.userFilter && filters.userFilter !== 'all') {
        query = query.eq('user_id', filters.userFilter);
      } else if (!isAdmin && userId) {
        query = query.eq('user_id', userId);
      } else if (organizationId && !isSuperAdmin && orgUserIds.length > 0) {
        query = query.in('user_id', orgUserIds);
      }

      // Raise the row cap for org-wide queries (Supabase default is 1000)
      if (!filters.userFilter || filters.userFilter === 'all') {
        query = query.limit(10000);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching screenshots:', error);
        toast.error('Failed to load screenshots');
        return null;
      }

      // Storage bucket is private in production; use signed URLs to render images.
      const signedUrlByFilePath = new Map<string, string>();
      const rows = (data || []) as any[];
      const filePaths = rows
        .map((r) => r.file_path as string | null | undefined)
        .filter((p): p is string => typeof p === 'string' && p.length > 0);

      await Promise.all(
        filePaths.map(async (filePath) => {
          if (signedUrlByFilePath.has(filePath)) return;
          const { data } = await supabase.storage.from('screenshots').createSignedUrl(filePath, 60 * 60);
          if (data?.signedUrl) signedUrlByFilePath.set(filePath, data.signedUrl);
        })
      );

      // Process screenshots with AI analysis and transform to our interface
      const processedScreenshots: Screenshot[] = (data || []).map((dbScreenshot: any) => {
        const signed = dbScreenshot.file_path ? signedUrlByFilePath.get(dbScreenshot.file_path) : undefined;
        // Transform database fields to our interface
        const screenshot: Screenshot = {
          id: dbScreenshot.id,
          user_id: dbScreenshot.user_id || '',
          project_id: dbScreenshot.project_id,
          captured_at: dbScreenshot.captured_at,
          image_url: signed || dbScreenshot.image_url || dbScreenshot.file_path || '',
          activity_percent: dbScreenshot.activity_percent || 0,
          focus_percent: dbScreenshot.focus_percent || 0,
          mouse_clicks: dbScreenshot.mouse_clicks,
          keystrokes: dbScreenshot.keystrokes,
          mouse_movements: dbScreenshot.mouse_movements,
          is_blurred: dbScreenshot.is_blurred,
          active_window_title: dbScreenshot.active_window_title,
          url: dbScreenshot.url,
          window_title: dbScreenshot.window_title,
          app_name: dbScreenshot.app_name,
          ai_tags: dbScreenshot.ai_tags || (dbScreenshot.ai_metadata && dbScreenshot.ai_metadata.tags) || dbScreenshot.tags || undefined,
          ai_description:
            dbScreenshot.ai_metadata?.image_description ??
            dbScreenshot.vision_detected_content ??
            dbScreenshot.vision_content ??
            null,
          content_category: dbScreenshot.content_category
            ? mapDbCategoryToDisplayCategory(dbScreenshot.content_category)
            : (dbScreenshot.category ? mapDbCategoryToDisplayCategory(dbScreenshot.category) : undefined),
          distraction_score: dbScreenshot.distraction_score,
          ai_confidence: dbScreenshot.ai_confidence ?? dbScreenshot.confidence_score,
          ai_analyzed_at: dbScreenshot.ai_analyzed_at,
          ai_analysis_status: dbScreenshot.ai_analysis_status,
          is_duplicate: dbScreenshot.is_duplicate,
                      duplicate_reason: dbScreenshot.duplicate_reason,
                      duplicate_hash: dbScreenshot.duplicate_hash,
                      duplicate_group_hash: dbScreenshot.duplicate_group_hash,
                      duplicate_matched_id: dbScreenshot.duplicate_matched_id,
                      consecutive_duplicate_count: dbScreenshot.consecutive_duplicate_count,
          idle_inferred: dbScreenshot.idle_inferred
        };

        // Keep server-side analysis status - workers will handle analysis, not page load
        // Remove client-side AI analysis - workers handle all AI processing

        return screenshot;
      });

      return processedScreenshots;
    } catch (error) {
      console.error('Error in fetchScreenshots:', error);
      return null;
    }
  };

  // Fetch users - filtered by organization for non-super admins
  const fetchUsers = async (): Promise<User[] | null> => {
    try {
      let query = supabase
        .from('users')
        .select('id, email, full_name, role, organization_id');
      
      // Filter by organization if user is not a super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order('full_name');

      if (error) {
        console.error('Error fetching users:', error);
        return null;
      }

      return data || [];
    } catch (error) {
      console.error('Error in fetchUsers:', error);
      return null;
    }
  };

  // Fetch projects - filtered by organization for non-super admins
  const fetchProjects = async (): Promise<Project[] | null> => {
    try {
      let query = supabase
        .from('projects')
        .select('id, name, organization_id');
      
      // Filter by organization if user is not a super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order('name');

      if (error) {
        console.error('Error fetching projects:', error);
        return null;
      }

      return data || [];
    } catch (error) {
      console.error('Error in fetchProjects:', error);
      return null;
    }
  };

  const MAX_DEDUCTION_SECONDS = 240; // 4 minutes cap per screenshot

  const computeScreenshotDeduction = async (screenshotId: string): Promise<{ deductedSeconds: number; screenshot: any }> => {
    const { data: screenshot, error: ssErr } = await supabase
      .from('screenshots')
      .select('id, user_id, time_log_id, captured_at, image_url, file_path, organization_id')
      .eq('id', screenshotId)
      .single();

    if (ssErr || !screenshot) throw new Error(ssErr?.message || 'Screenshot not found');

    if (!screenshot.time_log_id) {
      return { deductedSeconds: Math.min(200, MAX_DEDUCTION_SECONDS), screenshot };
    }

    const { data: timeLog } = await supabase
      .from('time_logs')
      .select('start_time, end_time')
      .eq('id', screenshot.time_log_id)
      .single();

    if (!timeLog) {
      return { deductedSeconds: Math.min(200, MAX_DEDUCTION_SECONDS), screenshot };
    }

    const { data: neighbors } = await supabase
      .from('screenshots')
      .select('captured_at')
      .eq('time_log_id', screenshot.time_log_id)
      .neq('id', screenshot.id)
      .order('captured_at', { ascending: true });

    const targetMs = new Date(screenshot.captured_at).getTime();
    const startMs = new Date(timeLog.start_time).getTime();
    const endMs = timeLog.end_time ? new Date(timeLog.end_time).getTime() : Date.now();

    let prevMs: number | null = null;
    let nextMs: number | null = null;

    if (neighbors && neighbors.length > 0) {
      const before = neighbors.filter(n => new Date(n.captured_at).getTime() < targetMs);
      const after = neighbors.filter(n => new Date(n.captured_at).getTime() > targetMs);
      if (before.length > 0) prevMs = new Date(before[before.length - 1].captured_at).getTime();
      if (after.length > 0) nextMs = new Date(after[0].captured_at).getTime();
    }

    let intervalStart = prevMs !== null ? (prevMs + targetMs) / 2 : startMs;
    let intervalEnd = nextMs !== null ? (targetMs + nextMs) / 2 : endMs;

    // Clamp to session bounds: screenshots may exist outside the time log window
    intervalStart = Math.max(intervalStart, startMs);
    intervalEnd = Math.min(intervalEnd, Math.max(endMs, targetMs + 60000));

    if (intervalEnd <= intervalStart) {
      return { deductedSeconds: Math.min(200, MAX_DEDUCTION_SECONDS), screenshot };
    }

    const rawSeconds = Math.max(0, Math.round((intervalEnd - intervalStart) / 1000));

    return { deductedSeconds: Math.min(rawSeconds, MAX_DEDUCTION_SECONDS), screenshot };
  };

  const estimateDeduction = async (screenshotId: string): Promise<number> => {
    try {
      const { deductedSeconds } = await computeScreenshotDeduction(screenshotId);
      return deductedSeconds;
    } catch (error) {
      console.error('Error estimating deduction:', error);
      return 0;
    }
  };

  const deleteScreenshot = async (id: string) => {
    try {
      const { deductedSeconds, screenshot } = await computeScreenshotDeduction(id);

      // Delete from storage
      if (screenshot.file_path) {
        try {
          await supabase.storage.from('screenshots').remove([screenshot.file_path]);
        } catch (e) {
          console.warn('Storage delete failed:', e);
        }
      }

      // Insert audit record
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('screenshot_deletions').insert({
        screenshot_id: screenshot.id,
        user_id: screenshot.user_id,
        time_log_id: screenshot.time_log_id,
        organization_id: screenshot.organization_id || null,
        deleted_by: user?.id || screenshot.user_id,
        deducted_seconds: deductedSeconds,
        screenshot_captured_at: screenshot.captured_at,
        image_url: screenshot.image_url,
        deletion_source: 'web_admin'
      });

      // Increment deducted_seconds on time log
      if (screenshot.time_log_id && deductedSeconds > 0) {
        const { data: timeLog } = await supabase
          .from('time_logs')
          .select('deducted_seconds')
          .eq('id', screenshot.time_log_id)
          .single();

        await supabase
          .from('time_logs')
          .update({ deducted_seconds: (timeLog?.deducted_seconds || 0) + deductedSeconds })
          .eq('id', screenshot.time_log_id);
      }

      // Delete screenshot row
      const { error } = await supabase
        .from('screenshots')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting screenshot:', error);
        toast.error('Failed to delete screenshot');
        return;
      }

      setScreenshots(prev => prev.filter(s => s.id !== id));
      const mins = Math.floor(deductedSeconds / 60);
      const secs = deductedSeconds % 60;
      const timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
      toast.success(`Screenshot deleted. ${timeStr} deducted from tracked time.`);
    } catch (error) {
      console.error('Error in deleteScreenshot:', error);
      toast.error('Failed to delete screenshot');
    }
  };

  const bulkDeleteScreenshots = async (ids: string[]) => {
    try {
      let totalDeducted = 0;
      const { data: { user } } = await supabase.auth.getUser();

      for (const id of ids) {
        try {
          const { deductedSeconds, screenshot } = await computeScreenshotDeduction(id);
          totalDeducted += deductedSeconds;

          if (screenshot.file_path) {
            try { await supabase.storage.from('screenshots').remove([screenshot.file_path]); } catch {}
          }

          await supabase.from('screenshot_deletions').insert({
            screenshot_id: screenshot.id,
            user_id: screenshot.user_id,
            time_log_id: screenshot.time_log_id,
            organization_id: screenshot.organization_id || null,
            deleted_by: user?.id || screenshot.user_id,
            deducted_seconds: deductedSeconds,
            screenshot_captured_at: screenshot.captured_at,
            image_url: screenshot.image_url,
            deletion_source: 'web_admin'
          });

          if (screenshot.time_log_id && deductedSeconds > 0) {
            const { data: timeLog } = await supabase
              .from('time_logs')
              .select('deducted_seconds')
              .eq('id', screenshot.time_log_id)
              .single();
            await supabase
              .from('time_logs')
              .update({ deducted_seconds: (timeLog?.deducted_seconds || 0) + deductedSeconds })
              .eq('id', screenshot.time_log_id);
          }
        } catch (e) {
          console.warn(`Failed to process deletion for screenshot ${id}:`, e);
        }
      }

      const { error } = await supabase
        .from('screenshots')
        .delete()
        .in('id', ids);

      if (error) {
        console.error('Error bulk deleting screenshots:', error);
        toast.error('Failed to delete screenshots');
        return;
      }

      setScreenshots(prev => prev.filter(s => !ids.includes(s.id)));
      const mins = Math.floor(totalDeducted / 60);
      const secs = totalDeducted % 60;
      const timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
      toast.success(`Deleted ${ids.length} screenshots. ${timeStr} total deducted from tracked time.`);
    } catch (error) {
      console.error('Error in bulkDeleteScreenshots:', error);
      toast.error('Failed to delete screenshots');
    }
  };

  // Fetch AI status directly from database
  const fetchAIStatus = async () => {
    try {
      if (!aiStatusEnabled) {
        setAiStatus(prev => ({ ...prev, loaded: true }));
        return;
      }
      let pendingCount = 0;
      let completedCount = 0;

      // For non-super admins, filter by organization_id directly
      if (organizationId && !isSuperAdmin) {
        const { count: pending } = await supabase
          .from('screenshots')
          .select('id', { count: 'exact', head: true })
          .eq('ai_analysis_status', 'pending')
          .eq('organization_id', organizationId);
        pendingCount = pending || 0;

        const { count: completed } = await supabase
          .from('screenshots')
          .select('id', { count: 'exact', head: true })
          .eq('ai_analysis_status', 'completed')
          .eq('organization_id', organizationId);
        completedCount = completed || 0;
      } else {
        // Super admin sees all
        const { count: pending } = await supabase
          .from('screenshots')
          .select('*', { count: 'exact', head: true })
          .eq('ai_analysis_status', 'pending');
        pendingCount = pending || 0;

        const { count: completed } = await supabase
          .from('screenshots')
          .select('*', { count: 'exact', head: true })
          .eq('ai_analysis_status', 'completed');
        completedCount = completed || 0;
      }

      setAiStatus({
        aiEnabled: true, // AI is always enabled via pg_cron
        aiProvider: 'huggingface',
        models: {
          text: 'Qwen3-32B',
          vision: 'Qwen2.5-VL-7B'
        },
        pendingCount: pendingCount || 0,
        analyzing: false,
        loaded: true
      });

      console.log('🤖 AI Status: pending=', pendingCount, 'completed=', completedCount);
    } catch (error) {
      console.error('Error in fetchAIStatus:', error);
      setAiStatus(prev => ({ ...prev, loaded: true }));
    }
  };

  // Trigger AI analysis for pending screenshots
  const triggerAIAnalysis = async (limit = 50) => {
    try {
      setAiStatus(prev => ({ ...prev, analyzing: true }));
      toast.info('🧠 Starting AI analysis...');

      // Use comprehensive-employee-analysis which is the working Hugging Face powered function
      const { data, error } = await supabase.functions.invoke('comprehensive-employee-analysis', {
        body: {
          generate_ai_summary: true,
          limit: limit,
          organization_id: organizationId || null
        }
      });

      if (error) {
        throw error;
      }

      const processed = data?.insights_generated || data?.processed || 0;
      
      if (processed > 0) {
        toast.success(`✅ AI analysis complete! Generated insights for ${processed} user(s)`);
      } else {
        toast.info('Analysis completed - check AI Insights page for results');
      }

      // Refresh data after analysis
      await fetchData();
      await fetchAIStatus();

      console.log('🤖 AI Analysis result:', data);
    } catch (error: any) {
      console.error('Error triggering AI analysis:', error);
      toast.error(`❌ AI Analysis failed: ${error.message}`);
    } finally {
      setAiStatus(prev => ({ ...prev, analyzing: false }));
    }
  };

  // Re-analyze a single screenshot
  const reanalyzeScreenshot = async (screenshotId: string) => {
    try {
      toast.info('🔄 Re-analyzing screenshot...');

      // First mark as pending (cast needed - column exists but types not regenerated)
      const { error: updateError } = await supabase
        .from('screenshots')
        .update({ ai_analysis_status: 'pending' } as any)
        .eq('id', screenshotId);

      if (updateError) {
        throw updateError;
      }

      // Use ai-screenshot-analyzer for single screenshot analysis with vision
      const { data, error } = await supabase.functions.invoke('ai-screenshot-analyzer', {
        body: {
          screenshot_id: screenshotId,
          use_vision: true,
          generate_description: true,
          force_vision: true,
          force_ai: true,
          organization_id: organizationId || null
        }
      });

      if (error) {
        throw error;
      }

      toast.success('✅ Screenshot re-analyzed successfully!');
      
      // Refresh data
      await fetchData();

      console.log('🤖 Re-analysis result:', data);
    } catch (error: any) {
      console.error('Error re-analyzing screenshot:', error);
      toast.error(`❌ Re-analysis failed: ${error.message}`);
    }
  };

  // Filter screenshots based on current filters
  const filteredScreenshots = screenshots.filter(screenshot => {
    // User filter
    if (filters.userFilter !== 'all' && screenshot.user_id !== filters.userFilter) {
      return false;
    }

    // Project filter
    if (filters.projectFilter !== 'all' && screenshot.project_id !== filters.projectFilter) {
      return false;
    }

    // Content category filter
    if (filters.contentFilter !== 'all' && screenshot.content_category !== filters.contentFilter) {
      return false;
    }

    // Distraction level filter
    if (filters.distractionFilter !== 'all') {
      const distractionScore = screenshot.distraction_score || 0;
      switch (filters.distractionFilter) {
        case 'high':
          if (distractionScore < 80) return false;
          break;
        case 'medium':
          if (distractionScore < 60 || distractionScore >= 80) return false;
          break;
        case 'low':
          if (distractionScore < 30 || distractionScore >= 60) return false;
          break;
        case 'none':
          if (distractionScore >= 30) return false;
          break;
      }
    }

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      const user = users.find(u => u.id === screenshot.user_id);
      const searchText = `
        ${user?.full_name || ''}
        ${user?.email || ''}
        ${screenshot.app_name || ''}
        ${screenshot.url || ''}
        ${screenshot.window_title || ''}
        ${screenshot.active_window_title || ''}
      `.toLowerCase();

      if (!searchText.includes(searchLower)) {
        return false;
      }
    }

    return true;
  });

  // Calculate statistics
  const stats: ScreenshotStats = {
    total: filteredScreenshots.length,
    avgActivity: Math.round(
      filteredScreenshots.reduce((sum, s) => sum + s.activity_percent, 0) / 
      Math.max(filteredScreenshots.length, 1)
    ),
    activePeriods: filteredScreenshots.filter(s => s.activity_percent > 50).length,
    idlePeriods: filteredScreenshots.filter(s => s.activity_percent <= 30).length,
    productiveShots: filteredScreenshots.filter(s => 
      s.content_category === 'productive' || (s.distraction_score || 0) < 30
    ).length,
    distractedShots: filteredScreenshots.filter(s => (s.distraction_score || 0) >= 60).length,
    // Sessions: count contiguous runs within the selected time groups (approx by groups of same user within 30m slots)
    totalSessions: (() => {
      if (filteredScreenshots.length === 0) return 0;
      const byUser = new Map<string, string[]>();
      filteredScreenshots
        .slice()
        .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())
        .forEach(s => {
          const arr = byUser.get(s.user_id) || [];
          arr.push(s.captured_at);
          byUser.set(s.user_id, arr);
        });
      let sessions = 0;
      byUser.forEach(times => {
        let prev: number | null = null;
        times.forEach(t => {
          const ts = new Date(t).getTime();
          if (prev === null || ts - prev > 30 * 60 * 1000) {
            sessions += 1;
          }
          prev = ts;
        });
      });
      return sessions;
    })(),
    aiCompleted: filteredScreenshots.filter(s => s.ai_analysis_status === 'completed').length,
    aiPending: filteredScreenshots.filter(s => !s.ai_analysis_status || s.ai_analysis_status === 'pending' || s.ai_analysis_status === 'processing').length,
    // Duplicate detection stats
    duplicateCount: filteredScreenshots.filter(s => s.is_duplicate).length,
    duplicateGroups: (() => {
      const hashes = new Set<string>();
      filteredScreenshots
        .filter(s => s.is_duplicate && s.duplicate_hash)
        .forEach(s => hashes.add(s.duplicate_hash!));
      return hashes.size;
    })(),
    lowActivityCount: filteredScreenshots.filter(s => s.activity_percent < 20).length,
    totalHoursWorked: timeLogsMinutes,
  };

  // Initial data fetch with stale-response guard
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await fetchData();
      if (cancelled) return;
      if (aiStatusEnabled) {
        await fetchAIStatus();
      } else {
        setAiStatus(prev => ({ ...prev, loaded: true }));
      }
    };
    load();

    return () => { cancelled = true; };
  }, [fetchData]);

  return {
    screenshots,
    filteredScreenshots,
    users,
    projects,
    loading,
    stats,
    aiStatus,
    fetchData,
    deleteScreenshot,
    bulkDeleteScreenshots,
    estimateDeduction,
    triggerAIAnalysis,
    reanalyzeScreenshot,
    fetchAIStatus
  };
}; 