/**
 * AlertsPanel Component
 * 
 * Real-time admin alerts panel for monitoring:
 * - Non-work activity (gaming, social media, entertainment)
 * - Consecutive duplicate screenshots (idle detection)
 * - Privacy concerns
 * - Suspicious patterns
 * 
 * Features:
 * - Real-time updates via Supabase Realtime
 * - Filter by severity, type, user
 * - Acknowledge/dismiss alerts
 * - Mark as false positive
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle,
  Eye,
  Gamepad2,
  Globe,
  Image,
  RefreshCw,
  Shield,
  Smartphone,
  Tv,
  XCircle,
  Clock,
  User,
  ChevronRight,
  Filter,
  ShoppingCart
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Types
interface Alert {
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

interface AlertCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

// Severity configurations
const severityConfig = {
  critical: {
    color: 'bg-red-600 text-white',
    borderColor: 'border-red-600',
    bgColor: 'bg-red-50',
    icon: AlertTriangle,
    label: 'Critical'
  },
  high: {
    color: 'bg-orange-500 text-white',
    borderColor: 'border-orange-500',
    bgColor: 'bg-orange-50',
    icon: AlertTriangle,
    label: 'High'
  },
  medium: {
    color: 'bg-yellow-500 text-white',
    borderColor: 'border-yellow-500',
    bgColor: 'bg-yellow-50',
    icon: Bell,
    label: 'Medium'
  },
  low: {
    color: 'bg-blue-500 text-white',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-50',
    icon: Bell,
    label: 'Low'
  }
};

// Category icons
const categoryIcons: Record<string, React.ElementType> = {
  gaming: Gamepad2,
  social_media: Smartphone,
  entertainment: Tv,
  shopping: ShoppingCart,
  communication: Globe,
  productive: CheckCircle,
  other: Globe
};

// Alert type labels
const alertTypeLabels: Record<string, string> = {
  non_work_activity: 'Non-Work Activity',
  consecutive_duplicates: 'Idle Detection',
  extended_idle: 'Extended Idle',
  potential_fraud: 'Potential Fraud',
  privacy_concern: 'Privacy Concern',
  unusual_hours: 'Unusual Hours',
  productivity_drop: 'Productivity Drop',
  suspicious_pattern: 'Suspicious Pattern'
};

export function AlertsPanel() {
  const { userDetails } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [counts, setCounts] = useState<AlertCounts>({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // Fetch alerts
  const fetchAlerts = async () => {
    try {
      setLoading(true);
      
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
        .limit(100);

      if (!showAcknowledged) {
        query = query.eq('acknowledged', false);
      }

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('alert_type', typeFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching alerts:', error);
        toast.error('Failed to load alerts');
        return;
      }

      setAlerts((data as any[] || []) as Alert[]);

      // Calculate counts
      const newCounts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
      ((data as any[] || []) as Alert[]).forEach((alert: Alert) => {
        if (!alert.acknowledged) {
          newCounts[alert.severity]++;
          newCounts.total++;
        }
      });
      setCounts(newCounts);

    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Set up realtime subscription
  useEffect(() => {
    fetchAlerts();

    // Subscribe to new alerts
    const channel = supabase
      .channel('admin_alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_alerts'
        },
        (payload) => {
          console.log('Alert change received:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newAlert = payload.new as Alert;
            setAlerts(prev => [newAlert, ...prev]);
            setCounts(prev => ({
              ...prev,
              [newAlert.severity]: prev[newAlert.severity] + 1,
              total: prev.total + 1
            }));
            
            // Show toast notification for high/critical alerts
            if (newAlert.severity === 'critical' || newAlert.severity === 'high') {
              toast.warning(`🚨 ${newAlert.title}`, {
                description: newAlert.message.substring(0, 100),
                duration: 10000,
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            setAlerts(prev => 
              prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)
            );
            // Recalculate counts
            fetchAlerts();
          } else if (payload.eventType === 'DELETE') {
            setAlerts(prev => prev.filter(a => a.id !== payload.old.id));
            fetchAlerts();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [severityFilter, typeFilter, showAcknowledged]);

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string, isFalsePositive = false) => {
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

      toast.success(isFalsePositive ? 'Marked as false positive' : 'Alert acknowledged');
      setDetailsOpen(false);
      fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  // Render alert card
  const renderAlertCard = (alert: Alert) => {
    const config = severityConfig[alert.severity];
    const SeverityIcon = config.icon;
    const CategoryIcon = categoryIcons[alert.category || 'other'] || Globe;

    return (
      <div
        key={alert.id}
        className={`p-4 border-l-4 ${config.borderColor} ${config.bgColor} rounded-r-lg mb-3 cursor-pointer hover:shadow-md transition-shadow`}
        onClick={() => {
          setSelectedAlert(alert);
          setDetailsOpen(true);
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full ${config.color}`}>
              <SeverityIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">{alert.title}</span>
                <Badge variant="outline" className="text-xs">
                  {alertTypeLabels[alert.alert_type] || alert.alert_type}
                </Badge>
                {alert.category && (
                  <Badge variant="secondary" className="text-xs flex items-center gap-1">
                    <CategoryIcon className="h-3 w-3" />
                    {alert.category}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 line-clamp-2">{alert.message}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {alert.users?.full_name || 'Unknown User'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                </span>
                {alert.ai_confidence && (
                  <span className="flex items-center gap-1">
                    AI: {Math.round(alert.ai_confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>
    );
  };

  // Check if user is admin
  if (userDetails?.role !== 'admin' && userDetails?.role !== 'manager') {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Real-Time Alerts
              </CardTitle>
              <CardDescription>
                AI-powered activity monitoring alerts
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAlerts}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Alert counts summary */}
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-2xl font-bold">{counts.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="text-2xl font-bold text-red-600">{counts.critical}</div>
              <div className="text-xs text-red-600">Critical</div>
            </div>
            <div className="text-center p-2 bg-orange-50 rounded">
              <div className="text-2xl font-bold text-orange-600">{counts.high}</div>
              <div className="text-xs text-orange-600">High</div>
            </div>
            <div className="text-center p-2 bg-yellow-50 rounded">
              <div className="text-2xl font-bold text-yellow-600">{counts.medium}</div>
              <div className="text-xs text-yellow-600">Medium</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded">
              <div className="text-2xl font-bold text-blue-600">{counts.low}</div>
              <div className="text-xs text-blue-600">Low</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alert Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="non_work_activity">Non-Work Activity</SelectItem>
                <SelectItem value="consecutive_duplicates">Idle Detection</SelectItem>
                <SelectItem value="privacy_concern">Privacy Concern</SelectItem>
                <SelectItem value="potential_fraud">Potential Fraud</SelectItem>
                <SelectItem value="unusual_hours">Unusual Hours</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showAcknowledged ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAcknowledged(!showAcknowledged)}
            >
              {showAcknowledged ? <BellOff className="h-4 w-4 mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
              {showAcknowledged ? 'Showing All' : 'Active Only'}
            </Button>
          </div>

          {/* Alerts list */}
          <ScrollArea className="h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <CheckCircle className="h-8 w-8 mb-2" />
                <p>No alerts to display</p>
              </div>
            ) : (
              alerts.map(renderAlertCard)
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Alert details dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          {selectedAlert && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge className={severityConfig[selectedAlert.severity].color}>
                    {severityConfig[selectedAlert.severity].label}
                  </Badge>
                  {selectedAlert.title}
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedAlert.created_at), 'PPpp')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-1">User</h4>
                  <p className="text-gray-600">
                    {selectedAlert.users?.full_name || 'Unknown'} ({selectedAlert.users?.email})
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold mb-1">Message</h4>
                  <p className="text-gray-600">{selectedAlert.message}</p>
                </div>

                {selectedAlert.ai_reasoning && (
                  <div>
                    <h4 className="font-semibold mb-1">AI Analysis</h4>
                    <p className="text-gray-600 text-sm bg-gray-50 p-3 rounded">
                      {selectedAlert.ai_reasoning}
                    </p>
                    {selectedAlert.ai_confidence && (
                      <p className="text-xs text-gray-500 mt-1">
                        Confidence: {Math.round(selectedAlert.ai_confidence * 100)}%
                      </p>
                    )}
                  </div>
                )}

                {selectedAlert.metadata && Object.keys(selectedAlert.metadata).length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-1">Details</h4>
                    <div className="text-sm bg-gray-50 p-3 rounded">
                      {Object.entries(selectedAlert.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-1">
                          <span className="text-gray-500">{key.replace(/_/g, ' ')}:</span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAlert.screenshot_id && (
                  <div>
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/screenshots?id=${selectedAlert.screenshot_id}`} target="_blank">
                        <Image className="h-4 w-4 mr-1" />
                        View Screenshot
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => acknowledgeAlert(selectedAlert.id, true)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  False Positive
                </Button>
                <Button
                  onClick={() => acknowledgeAlert(selectedAlert.id, false)}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Acknowledge
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AlertsPanel;



