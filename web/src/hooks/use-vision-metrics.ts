/**
 * useVisionMetrics Hook
 * 
 * Fetches and manages vision analysis metrics for the admin dashboard.
 * Provides real-time updates and API usage tracking.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';

// Types
export interface VisionFeatureFlags {
  id: string;
  vision_validation_enabled: boolean;
  max_screenshots_per_run: number;
  run_interval_minutes: number;
  validate_duplicates: boolean;
  validate_low_activity: boolean;
  validate_suspicious: boolean;
  random_sample_percentage: number;
  daily_api_call_limit: number;
  hourly_api_call_limit: number;
  backoff_multiplier: number;
  low_activity_threshold: number;
  alert_on_rate_limit_percent: number;
  alert_on_queue_backlog: number;
  alert_on_error_rate_percent: number;
  metrics_retention_days: number;
  updated_at: string;
  updated_by: string | null;
  reason: string | null;
}

export interface VisionMetrics {
  id: string;
  created_at: string;
  validator_run_id: string;
  execution_duration_ms: number;
  screenshots_processed: number;
  screenshots_failed: number;
  api_calls_made: number;
  api_rate_limit_remaining: number | null;
  api_rate_limit_reset_at: string | null;
  api_errors: string[];
  duplicates_confirmed: number;
  duplicates_rejected: number;
  false_positives_caught: number;
  privacy_alerts_created: number;
  total_screenshots_flagged: number;
  vision_validation_rate: number | null;
  status: 'completed' | 'rate_limited' | 'failed' | 'partial';
  error_message: string | null;
  metadata: Record<string, any>;
}

export interface ApiUsage {
  calls_this_hour: number;
  calls_today: number;
  hourly_limit: number;
  daily_limit: number;
  hourly_remaining: number;
  daily_remaining: number;
  hourly_usage_percent: number;
  daily_usage_percent: number;
  is_rate_limited: boolean;
  last_rate_limit_at: string | null;
  queue_size: number;
}

export interface AccuracyStats {
  total_validated: number;
  duplicates_confirmed: number;
  duplicates_rejected: number;
  false_positive_rate: number;
  privacy_alerts: number;
  sql_only_accuracy: number;
  vision_accuracy: number;
  accuracy_improvement: number;
}

export interface HourlyStats {
  hour: string;
  total_api_calls: number;
  total_processed: number;
  total_failed: number;
  total_confirmed: number;
  total_rejected: number;
  total_false_positives: number;
  total_privacy_alerts: number;
  avg_duration_ms: number;
  rate_limited_runs: number;
  failed_runs: number;
  total_runs: number;
}

export interface DailyStats {
  day: string;
  total_api_calls: number;
  total_processed: number;
  total_confirmed: number;
  total_rejected: number;
  total_false_positives: number;
  false_positive_rate: number;
  total_runs: number;
}

export interface UseVisionMetricsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useVisionMetrics(options: UseVisionMetricsOptions = {}) {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const { autoRefresh = true, refreshInterval = 30000 } = options;
  const rpcEnabled = import.meta.env.VITE_VISION_STATS_RPC_ENABLED === '1';

  // State
  const [featureFlags, setFeatureFlags] = useState<VisionFeatureFlags | null>(null);
  const [recentMetrics, setRecentMetrics] = useState<VisionMetrics[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null);
  const [hourlyStats, setHourlyStats] = useState<HourlyStats[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rpcUnavailable, setRpcUnavailable] = useState(false);

  const isMissingRpc = useCallback((err: any) => {
    if (!err) return false;
    const message = `${err.message || ''}`.toLowerCase();
    return err.code === 'PGRST202' || (message.includes('function') && message.includes('does not exist'));
  }, []);

  // Fetch feature flags
  const fetchFeatureFlags = useCallback(async (): Promise<VisionFeatureFlags | null> => {
    try {
      const { data, error } = await supabase
        .from('vision_feature_flags')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setFeatureFlags(data as any);
      return (data as any) || null;
    } catch (err: any) {
      console.error('Error fetching feature flags:', err);
      setError(err.message);
      return null;
    }
  }, []);

  // Fetch recent metrics
  const fetchRecentMetrics = useCallback(async (limit = 50) => {
    try {
      const { data, error } = await supabase
        .from('vision_analysis_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setRecentMetrics((data || []) as any);
    } catch (err: any) {
      console.error('Error fetching recent metrics:', err);
      setError(err.message);
    }
  }, [isMissingRpc]);

  // Fetch API usage
  const fetchApiUsage = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_vision_current_usage');

      if (error) throw error;
      if (data && (data as any[]).length > 0) {
        setApiUsage((data as any[])[0]);
      }
    } catch (err: any) {
      if (isMissingRpc(err)) {
        setRpcUnavailable(true);
        return;
      }
      console.error('Error fetching API usage:', err);
      // Don't set error for RPC failures - function might not exist yet
    }
  }, [isMissingRpc]);

  // Fetch accuracy stats
  const fetchAccuracyStats = useCallback(async () => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_vision_accuracy_stats');

      if (error) throw error;
      if (data && (data as any[]).length > 0) {
        setAccuracyStats((data as any[])[0]);
      }
    } catch (err: any) {
      if (isMissingRpc(err)) {
        setRpcUnavailable(true);
        return;
      }
      console.error('Error fetching accuracy stats:', err);
      // Don't set error for RPC failures
    }
  }, []);

  // Fetch hourly stats
  const fetchHourlyStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vision_hourly_stats')
        .select('*')
        .order('hour', { ascending: false })
        .limit(24);

      if (error) throw error;
      setHourlyStats((data || []) as any);
    } catch (err: any) {
      console.error('Error fetching hourly stats:', err);
      // View might not exist yet
    }
  }, []);

  // Fetch daily stats
  const fetchDailyStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vision_daily_stats')
        .select('*')
        .order('day', { ascending: false })
        .limit(30);

      if (error) throw error;
      setDailyStats((data || []) as any);
    } catch (err: any) {
      console.error('Error fetching daily stats:', err);
      // View might not exist yet
    }
  }, []);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const flags = await fetchFeatureFlags();
    const enableRpc = rpcEnabled && !!flags?.vision_validation_enabled && !rpcUnavailable;

    await Promise.all([
      fetchRecentMetrics(),
      enableRpc ? fetchApiUsage() : Promise.resolve(),
      enableRpc ? fetchAccuracyStats() : Promise.resolve(),
      fetchHourlyStats(),
      fetchDailyStats(),
    ]);

    setLoading(false);
  }, [fetchFeatureFlags, fetchRecentMetrics, fetchApiUsage, fetchAccuracyStats, fetchHourlyStats, fetchDailyStats, rpcUnavailable]);

  // Update feature flags
  const updateFeatureFlags = async (updates: Partial<VisionFeatureFlags>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('vision_feature_flags')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: userDetails?.id,
        })
        .eq('id', featureFlags?.id as string);

      if (error) throw error;

      // Refetch flags
      await fetchFeatureFlags();
      return true;
    } catch (err: any) {
      console.error('Error updating feature flags:', err);
      setError(err.message);
      return false;
    }
  };

  // Toggle vision validation
  const toggleVisionValidation = async (enabled: boolean): Promise<boolean> => {
    try {
      const { data, error } = await (supabase.rpc as any)('toggle_vision_validator', {
        p_enabled: enabled,
      });

      if (error) throw error;

      await fetchFeatureFlags();
      return true;
    } catch (err: any) {
      console.error('Error toggling vision validation:', err);
      setError(err.message);
      return false;
    }
  };

  // Update cron schedule
  const updateCronSchedule = async (intervalMinutes: number): Promise<boolean> => {
    try {
      const { data, error } = await (supabase.rpc as any)('update_vision_cron_schedule', {
        p_interval_minutes: intervalMinutes,
      });

      if (error) throw error;

      await fetchFeatureFlags();
      return true;
    } catch (err: any) {
      console.error('Error updating cron schedule:', err);
      setError(err.message);
      return false;
    }
  };

  // Manually trigger vision validator
  const triggerValidation = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('vision-validator', {
        body: { manual_trigger: true, organization_id: organizationId || null },
      });

      if (error) throw error;

      // Refetch metrics after trigger
      setTimeout(() => fetchRecentMetrics(), 5000);
      return true;
    } catch (err: any) {
      console.error('Error triggering validation:', err);
      setError(err.message);
      return false;
    }
  };

  // Get cron status
  const getCronStatus = async (): Promise<any> => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_vision_cron_status');
      if (error) throw error;
      return (data as any[])?.[0] || null;
    } catch (err: any) {
      console.error('Error getting cron status:', err);
      return null;
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (userDetails?.role !== 'admin') {
      setLoading(false);
      return;
    }

    fetchAll();

    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(fetchAll, refreshInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [userDetails, autoRefresh, refreshInterval, fetchAll]);

  // Calculate derived stats
  const todayStats = {
    processed: recentMetrics
      .filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString())
      .reduce((sum, m) => sum + m.screenshots_processed, 0),
    falsePositives: recentMetrics
      .filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString())
      .reduce((sum, m) => sum + m.false_positives_caught, 0),
    privacyAlerts: recentMetrics
      .filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString())
      .reduce((sum, m) => sum + m.privacy_alerts_created, 0),
    avgDuration: recentMetrics.length > 0
      ? Math.round(recentMetrics.reduce((sum, m) => sum + (m.execution_duration_ms || 0), 0) / recentMetrics.length)
      : 0,
  };

  const systemStatus = apiUsage?.is_rate_limited
    ? 'rate_limited'
    : featureFlags?.vision_validation_enabled === false
    ? 'disabled'
    : recentMetrics.length > 0 && recentMetrics[0].status === 'failed'
    ? 'error'
    : 'operational';

  return {
    // Data
    featureFlags,
    recentMetrics,
    apiUsage,
    accuracyStats,
    hourlyStats,
    dailyStats,
    todayStats,
    systemStatus,
    
    // State
    loading,
    error,
    
    // Actions
    refresh: fetchAll,
    updateFeatureFlags,
    toggleVisionValidation,
    updateCronSchedule,
    triggerValidation,
    getCronStatus,
  };
}

export default useVisionMetrics;
