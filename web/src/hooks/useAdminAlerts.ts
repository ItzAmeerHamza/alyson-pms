/**
 * useAdminAlerts Hook
 * 
 * Real-time subscription to admin alerts with automatic updates
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';

export interface AdminAlert {
  id: string;
  user_id: string;
  screenshot_id: string | null;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  title: string;
  message: string;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  vision_analysis: any;
  metadata: any;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  is_false_positive: boolean;
  created_at: string;
  users?: {
    id: string;
    email: string;
    full_name: string;
  };
}

export interface AlertCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface UseAdminAlertsOptions {
  userId?: string;
  severity?: string;
  alertType?: string;
  includeAcknowledged?: boolean;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useAdminAlerts(options: UseAdminAlertsOptions = {}) {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [counts, setCounts] = useState<AlertCounts>({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    userId,
    severity,
    alertType,
    includeAcknowledged = false,
    limit = 100,
    autoRefresh = true,
    refreshInterval = 60000,
  } = options;

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('admin_alerts')
        .select(`
          *,
          users!admin_alerts_user_id_fkey (
            id,
            email,
            full_name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!includeAcknowledged) {
        query = query.eq('acknowledged', false);
      }

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (severity && severity !== 'all') {
        query = query.eq('severity', severity);
      }

      if (alertType && alertType !== 'all') {
        query = query.eq('alert_type', alertType);
      }

      // Filter by organization unless super admin
      if (organizationId && !isSuperAdmin) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setAlerts((data as any[] || []) as AdminAlert[]);

      // Calculate counts
      const newCounts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      ((data as any[] || []) as AdminAlert[]).forEach((alert: AdminAlert) => {
        if (!alert.acknowledged) {
          newCounts[alert.severity]++;
          newCounts.total++;
        }
      });
      setCounts(newCounts);

    } catch (err: any) {
      console.error('Error fetching alerts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId, severity, alertType, includeAcknowledged, limit]);

  // Set up realtime subscription
  useEffect(() => {
    if (userDetails?.role !== 'admin' && userDetails?.role !== 'manager') {
      return;
    }

    fetchAlerts();

    // Subscribe to changes
    const channel = supabase
      .channel('admin_alerts_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_alerts'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new as AdminAlert;
            
            // Check if alert matches our filters
            if (userId && newAlert.user_id !== userId) return;
            if (severity && severity !== 'all' && newAlert.severity !== severity) return;
            if (alertType && alertType !== 'all' && newAlert.alert_type !== alertType) return;
            if (!includeAcknowledged && newAlert.acknowledged) return;

            setAlerts(prev => [newAlert, ...prev].slice(0, limit));
            setCounts(prev => ({
              ...prev,
              [newAlert.severity]: prev[newAlert.severity] + 1,
              total: prev.total + 1
            }));
          } else if (payload.eventType === 'UPDATE') {
            const updatedAlert = payload.new as AdminAlert;
            setAlerts(prev => 
              prev.map(a => a.id === updatedAlert.id ? { ...a, ...updatedAlert } : a)
            );
            // Refresh counts
            fetchAlerts();
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setAlerts(prev => prev.filter(a => a.id !== deletedId));
            fetchAlerts();
          }
        }
      )
      .subscribe();

    // Auto-refresh interval
    let intervalId: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      intervalId = setInterval(fetchAlerts, refreshInterval);
    }

    return () => {
      supabase.removeChannel(channel);
      if (intervalId) clearInterval(intervalId);
    };
  }, [userDetails, userId, severity, alertType, includeAcknowledged, limit, autoRefresh, refreshInterval, fetchAlerts]);

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string, isFalsePositive = false): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('admin_alerts')
        .update({
          acknowledged: true,
          acknowledged_by: userDetails?.id,
          acknowledged_at: new Date().toISOString(),
          is_false_positive: isFalsePositive
        })
        .eq('id', alertId);

      if (error) throw error;
      
      // Update local state
      setAlerts(prev => prev.map(a => 
        a.id === alertId 
          ? { ...a, acknowledged: true, is_false_positive: isFalsePositive }
          : a
      ));
      
      // Update counts
      const alert = alerts.find(a => a.id === alertId);
      if (alert && !alert.acknowledged) {
        setCounts(prev => ({
          ...prev,
          [alert.severity]: Math.max(0, prev[alert.severity] - 1),
          total: Math.max(0, prev.total - 1)
        }));
      }

      return true;
    } catch (err: any) {
      console.error('Error acknowledging alert:', err);
      setError(err.message);
      return false;
    }
  };

  // Get alerts for a specific screenshot
  const getAlertsForScreenshot = (screenshotId: string): AdminAlert[] => {
    return alerts.filter(a => a.screenshot_id === screenshotId);
  };

  // Get most severe unacknowledged alert for a user
  const getMostSevereAlert = (userId: string): AdminAlert | null => {
    const userAlerts = alerts.filter(a => a.user_id === userId && !a.acknowledged);
    if (userAlerts.length === 0) return null;

    const severityOrder = ['critical', 'high', 'medium', 'low'];
    return userAlerts.sort((a, b) => 
      severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
    )[0];
  };

  return {
    alerts,
    counts,
    loading,
    error,
    refresh: fetchAlerts,
    acknowledgeAlert,
    getAlertsForScreenshot,
    getMostSevereAlert,
  };
}

export default useAdminAlerts;



