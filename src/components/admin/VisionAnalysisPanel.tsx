/**
 * Vision Analysis Panel
 * 
 * Compact widget for embedding in other admin pages (AI Insights, Activity Issues).
 * Shows quick stats and links to the full Vision Monitoring Dashboard.
 */

import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useVisionMetrics } from '@/hooks/use-vision-metrics';
import { 
  Eye, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  ExternalLink, 
  RefreshCw,
  Gauge,
  Shield
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VisionAnalysisPanelProps {
  compact?: boolean;
  showActions?: boolean;
  className?: string;
}

export function VisionAnalysisPanel({ 
  compact = false, 
  showActions = true,
  className = '' 
}: VisionAnalysisPanelProps) {
  const {
    featureFlags,
    apiUsage,
    accuracyStats,
    todayStats,
    systemStatus,
    recentMetrics,
    loading,
    triggerValidation,
  } = useVisionMetrics({ autoRefresh: true, refreshInterval: 60000 });

  // Status badge colors
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-500';
      case 'rate_limited':
        return 'bg-yellow-500';
      case 'disabled':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'operational':
        return 'Operational';
      case 'rate_limited':
        return 'Rate Limited';
      case 'disabled':
        return 'Disabled';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  if (loading && !featureFlags) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-6">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Vision AI
            </CardTitle>
            <Badge 
              variant="outline" 
              className={`${getStatusColor(systemStatus)} text-white border-0`}
            >
              {getStatusLabel(systemStatus)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Processed Today</p>
              <p className="font-semibold">{todayStats.processed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">False Positives</p>
              <p className="font-semibold text-orange-600">{todayStats.falsePositives}</p>
            </div>
          </div>

          {/* Rate Limit Gauge */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span>API Usage</span>
              <span>{apiUsage?.hourly_usage_percent?.toFixed(0) || 0}%</span>
            </div>
            <Progress 
              value={apiUsage?.hourly_usage_percent || 0} 
              className="h-1.5"
            />
          </div>

          {/* Link to Full Dashboard */}
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/admin/vision-monitoring">
              View Dashboard
              <ExternalLink className="h-3 w-3 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Vision Analysis Status
            </CardTitle>
            <CardDescription>Qwen2.5-VL-7B screenshot validation</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(systemStatus)}`} />
            <span className="text-sm font-medium">{getStatusLabel(systemStatus)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Activity className="h-3 w-3" />
              Queue
            </div>
            <p className="text-xl font-bold">{apiUsage?.queue_size || 0}</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 mb-1">
              <CheckCircle className="h-3 w-3" />
              Processed
            </div>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{todayStats.processed}</p>
          </div>
          <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 mb-1">
              <AlertTriangle className="h-3 w-3" />
              False Pos
            </div>
            <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{todayStats.falsePositives}</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 mb-1">
              <Shield className="h-3 w-3" />
              Privacy
            </div>
            <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{todayStats.privacyAlerts}</p>
          </div>
        </div>

        {/* Rate Limit Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4" />
              API Rate Limit
            </div>
            <span className="text-sm text-muted-foreground">
              {apiUsage?.calls_this_hour || 0} / {apiUsage?.hourly_limit || 500} calls/hour
            </span>
          </div>
          <Progress 
            value={apiUsage?.hourly_usage_percent || 0}
            className={`h-2 ${(apiUsage?.hourly_usage_percent || 0) >= 90 ? 'bg-red-100' : ''}`}
          />
          {(apiUsage?.hourly_usage_percent || 0) >= 90 && (
            <p className="text-xs text-red-500 mt-1">
              ⚠️ Approaching rate limit - validation may pause soon
            </p>
          )}
        </div>

        {/* Last Run Info */}
        {recentMetrics.length > 0 && (
          <div className="text-sm text-muted-foreground">
            Last run: {formatDistanceToNow(new Date(recentMetrics[0].created_at), { addSuffix: true })}
            {' · '}
            {recentMetrics[0].screenshots_processed} screenshots processed
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/admin/vision-monitoring">
                View Full Dashboard
                <ExternalLink className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            {featureFlags?.vision_validation_enabled && (
              <Button 
                variant="secondary"
                onClick={() => triggerValidation()}
                disabled={systemStatus === 'rate_limited'}
              >
                Run Now
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default VisionAnalysisPanel;
