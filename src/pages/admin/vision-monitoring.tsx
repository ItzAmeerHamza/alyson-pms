/**
 * Vision Monitoring Dashboard
 * 
 * Comprehensive admin dashboard for monitoring vision analysis:
 * - Real-time status overview
 * - API rate limiting & cost management
 * - Validation accuracy & false positive tracking
 * - Execution logs & debugging
 * - Advanced configuration
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useVisionMetrics } from '@/hooks/use-vision-metrics';
import { 
  Eye, 
  EyeOff, 
  Activity, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Play, 
  Pause, 
  Settings, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Shield, 
  Database,
  BarChart3,
  Timer,
  Gauge,
  FileWarning,
  Download
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function VisionMonitoring() {
  const { toast } = useToast();
  const {
    featureFlags,
    recentMetrics,
    apiUsage,
    accuracyStats,
    hourlyStats,
    dailyStats,
    todayStats,
    systemStatus,
    loading,
    error,
    refresh,
    updateFeatureFlags,
    toggleVisionValidation,
    updateCronSchedule,
    triggerValidation,
  } = useVisionMetrics();

  const [isToggling, setIsToggling] = useState(false);
  const [isTriggeringValidation, setIsTriggeringValidation] = useState(false);

  // Handle toggle vision validation
  const handleToggleVision = async (enabled: boolean) => {
    setIsToggling(true);
    const success = await toggleVisionValidation(enabled);
    setIsToggling(false);

    if (success) {
      toast({
        title: enabled ? 'Vision Validation Enabled' : 'Vision Validation Disabled',
        description: enabled 
          ? 'Vision analysis will run on the next scheduled interval.'
          : 'Vision analysis has been paused.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to toggle vision validation.',
        variant: 'destructive',
      });
    }
  };

  // Handle manual trigger
  const handleTriggerValidation = async () => {
    setIsTriggeringValidation(true);
    const success = await triggerValidation();
    setIsTriggeringValidation(false);

    if (success) {
      toast({
        title: 'Validation Triggered',
        description: 'Vision validation is now running. Results will appear shortly.',
      });
    } else {
      toast({
        title: 'Error',
        description: 'Failed to trigger vision validation.',
        variant: 'destructive',
      });
    }
  };

  // Handle update max screenshots per run
  const handleUpdateMaxScreenshots = async (value: number[]) => {
    await updateFeatureFlags({ max_screenshots_per_run: value[0] });
  };

  // Handle update random sample percentage
  const handleUpdateRandomSample = async (value: number[]) => {
    await updateFeatureFlags({ random_sample_percentage: value[0] });
  };

  // Handle update run interval
  const handleUpdateInterval = async (value: string) => {
    const intervalMinutes = parseInt(value);
    await updateCronSchedule(intervalMinutes);
    toast({
      title: 'Schedule Updated',
      description: `Vision validation will now run every ${intervalMinutes} minutes.`,
    });
  };

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

  // Export metrics to CSV
  const exportMetrics = () => {
    const headers = ['Run ID', 'Time', 'Screenshots', 'Confirmed', 'Rejected', 'Duration (ms)', 'Status'];
    const rows = recentMetrics.map(m => [
      m.validator_run_id,
      format(new Date(m.created_at), 'yyyy-MM-dd HH:mm:ss'),
      m.screenshots_processed,
      m.duplicates_confirmed,
      m.duplicates_rejected,
      m.execution_duration_ms,
      m.status,
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vision-metrics-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  if (loading && !featureFlags) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vision Analysis Monitoring</h1>
          <p className="text-muted-foreground">
            Track API usage, accuracy, and manage vision validation settings.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleTriggerValidation} disabled={isTriggeringValidation || !featureFlags?.vision_validation_enabled}>
            <Play className="h-4 w-4 mr-2" />
            {isTriggeringValidation ? 'Running...' : 'Run Now'}
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Rate Limit Warning */}
      {apiUsage && apiUsage.hourly_usage_percent >= 90 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Approaching Rate Limit</AlertTitle>
          <AlertDescription>
            You've used {apiUsage.hourly_usage_percent.toFixed(0)}% of your hourly API limit. 
            Vision validation may be paused soon.
          </AlertDescription>
        </Alert>
      )}

      {/* Section 1: Real-Time Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* System Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${getStatusColor(systemStatus)}`} />
                <span className="font-semibold">{getStatusLabel(systemStatus)}</span>
              </div>
              <Switch
                checked={featureFlags?.vision_validation_enabled || false}
                onCheckedChange={handleToggleVision}
                disabled={isToggling}
              />
            </div>
            {recentMetrics.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Last run: {formatDistanceToNow(new Date(recentMetrics[0].created_at), { addSuffix: true })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Queue Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Validation Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{apiUsage?.queue_size || 0}</div>
            <p className="text-xs text-muted-foreground">Screenshots pending</p>
          </CardContent>
        </Card>

        {/* Today's Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Today's Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayStats.processed}</div>
            <p className="text-xs text-muted-foreground">
              {todayStats.falsePositives} false positives caught
            </p>
          </CardContent>
        </Card>

        {/* Privacy Alerts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Privacy Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{todayStats.privacyAlerts}</div>
            <p className="text-xs text-muted-foreground">Concerns detected today</p>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: API Rate Limiting & Cost Management */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rate Limit Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              API Rate Limits
            </CardTitle>
            <CardDescription>Monitor Hugging Face API usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Hourly Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Hourly Usage</Label>
                <span className="text-sm font-medium">
                  {apiUsage?.calls_this_hour || 0} / {apiUsage?.hourly_limit || 500}
                </span>
              </div>
              <Progress 
                value={apiUsage?.hourly_usage_percent || 0} 
                className={`h-2 ${(apiUsage?.hourly_usage_percent || 0) >= 90 ? 'bg-red-100' : ''}`}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {apiUsage?.hourly_remaining || 500} calls remaining this hour
              </p>
            </div>

            {/* Daily Usage */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Daily Usage</Label>
                <span className="text-sm font-medium">
                  {apiUsage?.calls_today || 0} / {apiUsage?.daily_limit || 10000}
                </span>
              </div>
              <Progress 
                value={apiUsage?.daily_usage_percent || 0}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {apiUsage?.daily_remaining || 10000} calls remaining today
              </p>
            </div>

            {/* Rate Limit Status */}
            {apiUsage?.is_rate_limited && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Rate Limited</AlertTitle>
                <AlertDescription>
                  {apiUsage.last_rate_limit_at && (
                    <>Last rate limit: {formatDistanceToNow(new Date(apiUsage.last_rate_limit_at), { addSuffix: true })}</>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Feature Flag Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Vision Controls
            </CardTitle>
            <CardDescription>Configure validation behavior</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Vision Validation</Label>
                <p className="text-xs text-muted-foreground">Enable/disable vision analysis</p>
              </div>
              <Switch
                checked={featureFlags?.vision_validation_enabled || false}
                onCheckedChange={handleToggleVision}
                disabled={isToggling}
              />
            </div>

            <Separator />

            {/* Max Screenshots per Run */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Screenshots per Run</Label>
                <span className="text-sm font-medium">{featureFlags?.max_screenshots_per_run || 20}</span>
              </div>
              <Slider
                value={[featureFlags?.max_screenshots_per_run || 20]}
                min={1}
                max={50}
                step={1}
                onValueCommit={handleUpdateMaxScreenshots}
                disabled={!featureFlags?.vision_validation_enabled}
              />
            </div>

            {/* Run Interval */}
            <div className="space-y-2">
              <Label>Run Interval</Label>
              <Select
                value={String(featureFlags?.run_interval_minutes || 10)}
                onValueChange={handleUpdateInterval}
                disabled={!featureFlags?.vision_validation_enabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Every 5 minutes</SelectItem>
                  <SelectItem value="10">Every 10 minutes</SelectItem>
                  <SelectItem value="15">Every 15 minutes</SelectItem>
                  <SelectItem value="30">Every 30 minutes</SelectItem>
                  <SelectItem value="60">Every hour</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Random Sample Percentage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Random Sampling</Label>
                <span className="text-sm font-medium">{featureFlags?.random_sample_percentage || 10}%</span>
              </div>
              <Slider
                value={[featureFlags?.random_sample_percentage || 10]}
                min={0}
                max={50}
                step={5}
                onValueCommit={handleUpdateRandomSample}
                disabled={!featureFlags?.vision_validation_enabled}
              />
              <p className="text-xs text-muted-foreground">
                Percentage of normal screenshots to validate for quality assurance
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Validation Accuracy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Validation Accuracy
          </CardTitle>
          <CardDescription>False positive detection and accuracy improvement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total Validated */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total Validated</p>
              <p className="text-2xl font-bold">{accuracyStats?.total_validated || 0}</p>
            </div>

            {/* Duplicates Confirmed */}
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">Duplicates Confirmed</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                {accuracyStats?.duplicates_confirmed || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {accuracyStats && accuracyStats.total_validated > 0 
                  ? `${((accuracyStats.duplicates_confirmed / accuracyStats.total_validated) * 100).toFixed(0)}%`
                  : '0%'} of total
              </p>
            </div>

            {/* False Positives Caught */}
            <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <p className="text-sm text-orange-600 dark:text-orange-400">False Positives Caught</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                {accuracyStats?.duplicates_rejected || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {accuracyStats?.false_positive_rate?.toFixed(1) || 0}% false positive rate
              </p>
            </div>

            {/* Accuracy Improvement */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-600 dark:text-blue-400">Accuracy Improvement</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  +{accuracyStats?.accuracy_improvement?.toFixed(1) || 0}%
                </p>
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-xs text-muted-foreground">vs SQL-only detection</p>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Detection Method Comparison</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>SQL Only</TableHead>
                  <TableHead>With Vision</TableHead>
                  <TableHead>Improvement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Accuracy</TableCell>
                  <TableCell>{accuracyStats?.sql_only_accuracy?.toFixed(1) || 100}%</TableCell>
                  <TableCell>{accuracyStats?.vision_accuracy?.toFixed(1) || 100}%</TableCell>
                  <TableCell className="text-green-600">
                    +{((accuracyStats?.vision_accuracy || 100) - (accuracyStats?.sql_only_accuracy || 100)).toFixed(1)}%
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>False Positives</TableCell>
                  <TableCell>{accuracyStats?.duplicates_rejected || 0} detected</TableCell>
                  <TableCell>0 (validated)</TableCell>
                  <TableCell className="text-green-600">
                    ↓{accuracyStats?.false_positive_rate?.toFixed(1) || 0}%
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Execution Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Recent Validation Runs
              </CardTitle>
              <CardDescription>Last 50 validation executions</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportMetrics}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Screenshots</TableHead>
                <TableHead>Confirmed</TableHead>
                <TableHead>Rejected</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentMetrics.slice(0, 20).map((metric) => (
                <TableRow key={metric.id}>
                  <TableCell className="font-mono text-xs">
                    {metric.validator_run_id.slice(0, 16)}...
                  </TableCell>
                  <TableCell>
                    {formatDistanceToNow(new Date(metric.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>{metric.screenshots_processed}</TableCell>
                  <TableCell className="text-green-600">{metric.duplicates_confirmed}</TableCell>
                  <TableCell className="text-orange-600">{metric.duplicates_rejected}</TableCell>
                  <TableCell>{(metric.execution_duration_ms / 1000).toFixed(1)}s</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        metric.status === 'completed' ? 'default' :
                        metric.status === 'rate_limited' ? 'secondary' :
                        metric.status === 'partial' ? 'outline' : 'destructive'
                      }
                    >
                      {metric.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentMetrics.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No validation runs yet. Enable vision validation to start.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section 5: Advanced Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Advanced Configuration
          </CardTitle>
          <CardDescription>Fine-tune validation behavior and thresholds</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="selection">
            <TabsList>
              <TabsTrigger value="selection">Selection Criteria</TabsTrigger>
              <TabsTrigger value="limits">Rate Limits</TabsTrigger>
              <TabsTrigger value="alerts">Alert Thresholds</TabsTrigger>
            </TabsList>

            <TabsContent value="selection" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Validate Duplicates</Label>
                    <p className="text-xs text-muted-foreground">Analyze screenshots flagged as duplicates</p>
                  </div>
                  <Switch
                    checked={featureFlags?.validate_duplicates || false}
                    onCheckedChange={(checked) => updateFeatureFlags({ validate_duplicates: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Validate Low Activity</Label>
                    <p className="text-xs text-muted-foreground">Analyze screenshots with low activity</p>
                  </div>
                  <Switch
                    checked={featureFlags?.validate_low_activity || false}
                    onCheckedChange={(checked) => updateFeatureFlags({ validate_low_activity: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label>Validate Suspicious</Label>
                    <p className="text-xs text-muted-foreground">Analyze suspicious activity</p>
                  </div>
                  <Switch
                    checked={featureFlags?.validate_suspicious || false}
                    onCheckedChange={(checked) => updateFeatureFlags({ validate_suspicious: checked })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hourly API Limit</Label>
                  <p className="text-xs text-muted-foreground">Maximum API calls per hour</p>
                  <div className="text-2xl font-bold">{featureFlags?.hourly_api_call_limit || 500}</div>
                  <Slider
                    value={[featureFlags?.hourly_api_call_limit || 500]}
                    min={50}
                    max={1000}
                    step={50}
                    onValueCommit={(value) => updateFeatureFlags({ hourly_api_call_limit: value[0] } as any)}
                    className="mt-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Daily API Limit</Label>
                  <p className="text-xs text-muted-foreground">Maximum API calls per day</p>
                  <div className="text-2xl font-bold">{featureFlags?.daily_api_call_limit || 10000}</div>
                  <Slider
                    value={[featureFlags?.daily_api_call_limit || 10000]}
                    min={1000}
                    max={20000}
                    step={1000}
                    onValueCommit={(value) => updateFeatureFlags({ daily_api_call_limit: value[0] } as any)}
                    className="mt-2"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="alerts" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <Label>Rate Limit Alert</Label>
                  <p className="text-xs text-muted-foreground">
                    Alert when API usage exceeds {featureFlags?.alert_on_rate_limit_percent || 90}%
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Label>Queue Backlog Alert</Label>
                  <p className="text-xs text-muted-foreground">
                    Alert when queue exceeds {featureFlags?.alert_on_queue_backlog || 100} screenshots
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Label>Error Rate Alert</Label>
                  <p className="text-xs text-muted-foreground">
                    Alert when error rate exceeds {featureFlags?.alert_on_error_rate_percent || 10}%
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Model Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Vision Model Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Model</p>
              <p className="text-lg font-mono">Qwen/Qwen2.5-VL-7B-Instruct</p>
              <p className="text-xs text-muted-foreground mt-1">Hugging Face Inference API</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Capabilities</p>
              <ul className="text-sm list-disc list-inside mt-1">
                <li>Screenshot content analysis</li>
                <li>Duplicate validation</li>
                <li>Privacy concern detection</li>
                <li>Idle/lock screen detection</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
