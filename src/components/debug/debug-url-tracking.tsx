import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Globe, 
  Database, 
  Wifi, 
  Users,
  RefreshCw 
} from 'lucide-react';

interface DebugInfo {
  supabaseConnection: boolean;
  urlLogsTable: boolean;
  userAuthentication: boolean;
  urlDataCount: number;
  recentUrlLogs: any[];
  supabaseConfig: {
    url: string;
    anonKey: string;
  };
  error?: string;
}

export default function DebugUrlTracking() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const { userDetails } = useAuth();

  const runDiagnostics = async () => {
    setLoading(true);
    const info: DebugInfo = {
      supabaseConnection: false,
      urlLogsTable: false,
      userAuthentication: false,
      urlDataCount: 0,
      recentUrlLogs: [],
      supabaseConfig: {
        url: import.meta.env.VITE_SUPABASE_URL || 'Not configured',
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Configured' : 'Not configured'
      }
    };

    try {
      // Test Supabase connection
      const { data: connectionTest, error: connectionError } = await supabase
        .from('users')
        .select('count', { count: 'exact', head: true });

      if (!connectionError) {
        info.supabaseConnection = true;
      } else {
        info.error = `Connection error: ${connectionError.message}`;
      }

      // Test URL logs table
      const { data: urlLogsTest, error: urlLogsError } = await supabase
        .from('url_logs')
        .select('count', { count: 'exact', head: true });

      if (!urlLogsError) {
        info.urlLogsTable = true;
        info.urlDataCount = urlLogsTest.length || 0;
      }

      // Get recent URL logs
      // Note: url_logs is a view with: id, url, site_url, title, domain, browser, timestamp, user_id, time_log_id, duration_seconds
      const { data: recentLogs, error: recentLogsError } = await supabase
        .from('url_logs')
        .select(`
          id,
          user_id,
          url,
          site_url,
          title,
          domain,
          timestamp,
          duration_seconds
        `)
        .order('timestamp', { ascending: false })
        .limit(5);

      if (!recentLogsError && recentLogs) {
        info.recentUrlLogs = recentLogs;
      }

      // Check user authentication
      if (userDetails) {
        info.userAuthentication = true;
      }

    } catch (error: any) {
      info.error = `Diagnostic error: ${error.message}`;
    }

    setDebugInfo(info);
    setLoading(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600" />
    );
  };

  if (!debugInfo) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Running diagnostics...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">URL Tracking Debug</h1>
          <p className="text-muted-foreground">Diagnostic information for URL tracking issues</p>
        </div>
        <Button onClick={runDiagnostics} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Running...
            </>
          ) : (
            'Re-run Diagnostics'
          )}
        </Button>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span>Supabase Connection</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.supabaseConnection)}
              <Badge variant={debugInfo.supabaseConnection ? 'default' : 'destructive'}>
                {debugInfo.supabaseConnection ? 'Connected' : 'Failed'}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span>URL Logs Table</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.urlLogsTable)}
              <Badge variant={debugInfo.urlLogsTable ? 'default' : 'destructive'}>
                {debugInfo.urlLogsTable ? 'Accessible' : 'Error'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span>User Authentication</span>
            <div className="flex items-center gap-2">
              {getStatusIcon(debugInfo.userAuthentication)}
              <Badge variant={debugInfo.userAuthentication ? 'default' : 'destructive'}>
                {debugInfo.userAuthentication ? 'Authenticated' : 'Not Authenticated'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span>URL Data Count</span>
            <Badge variant={debugInfo.urlDataCount > 0 ? 'default' : 'secondary'}>
              {debugInfo.urlDataCount} records
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <strong>Supabase URL:</strong> {debugInfo.supabaseConfig.url}
          </div>
          <div>
            <strong>Supabase Key:</strong> {debugInfo.supabaseConfig.anonKey}
          </div>
          <div>
            <strong>Current User:</strong> {userDetails?.email || 'Not logged in'}
          </div>
          <div>
            <strong>User Role:</strong> {userDetails?.role || 'Unknown'}
          </div>
        </CardContent>
      </Card>

      {/* Recent URL Logs */}
      {debugInfo.recentUrlLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Recent URL Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {debugInfo.recentUrlLogs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{log.url || log.site_url || 'Unknown URL'}</div>
                    <div className="text-sm text-muted-foreground">
                      {log.domain || 'Unknown domain'} • {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'No timestamp'}
                    </div>
                  </div>
                  <Badge variant="outline">
                    {log.duration_seconds ? `${Math.round(log.duration_seconds)}s` : 'N/A'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Information */}
      {debugInfo.error && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Error Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-red-600 font-mono text-sm">
              {debugInfo.error}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">1. Check Desktop Agent</h4>
            <p className="text-sm text-muted-foreground">
              Ensure the desktop agent is running and tracking URLs. Check the desktop-agent/config.json file.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium">2. Verify Database Schema</h4>
            <p className="text-sm text-muted-foreground">
              Make sure the url_logs table exists in Supabase with proper RLS policies.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium">3. Check Environment Variables</h4>
            <p className="text-sm text-muted-foreground">
              Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are correctly configured.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium">4. Review User Permissions</h4>
            <p className="text-sm text-muted-foreground">
              Ensure your user has admin/manager role to view URL monitoring data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 