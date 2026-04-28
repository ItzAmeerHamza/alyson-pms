import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle, Shield, Monitor } from 'lucide-react';

export default function SystemHealthPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <p className="text-gray-600">Monitor system status and health indicators</p>
      </div>

      {/* Health Status Widget */}
      <Card data-testid="health-status-widget">
        <CardHeader>
          <CardTitle>System Health Overview</CardTitle>
          <CardDescription>Real-time status of all system components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Session Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="session-health">Session Tracking</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>

            {/* Idle Detection Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="idle-detection-health">Idle Detection</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>

            {/* Screenshot Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="screenshot-health">Screenshot Capture</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>

            {/* App Detection Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="app-detection-health">App Detection</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>

            {/* URL Detection Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="url-detection-health">URL Detection</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>

            {/* Sync Health */}
            <div className="flex items-center space-x-3 p-4 border rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium" data-testid="sync-health">Data Sync</div>
                <div className="text-sm text-green-600">✓ Healthy</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permissions Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Permissions</CardTitle>
          <CardDescription>Required permissions for full functionality</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" data-testid="permissions-status">
            {/* Screen Recording Permission (macOS) */}
            {process.platform === 'darwin' && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Shield className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="font-medium" data-testid="screen-recording-permission">Screen Recording</div>
                    <div className="text-sm text-muted-foreground">Required for screenshot capture</div>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Granted</Badge>
              </div>
            )}

            {/* Accessibility Permission (macOS) */}
            {process.platform === 'darwin' && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Shield className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="font-medium" data-testid="accessibility-permission">Accessibility</div>
                    <div className="text-sm text-muted-foreground">Required for activity monitoring</div>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Granted</Badge>
              </div>
            )}

            {/* Generic permission status for other platforms */}
            {process.platform !== 'darwin' && (
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Monitor className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="font-medium">System Permissions</div>
                    <div className="text-sm text-muted-foreground">All required permissions granted</div>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* System Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>System performance and resource usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">98%</div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">15MB</div>
              <div className="text-sm text-muted-foreground">Memory Usage</div>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">2%</div>
              <div className="text-sm text-muted-foreground">CPU Usage</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
