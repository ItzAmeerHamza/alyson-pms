import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInMinutes } from 'date-fns';
import { Play, Square, Clock, Shield, CheckCircle, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { timerHealthChecker } from '@/utils/timer-health-check';
import type { HealthCheckResult } from '@/utils/timer-health-check';

interface Project {
  id: string;
  name: string;
}

interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  project_id: string | null;
  projects?: {
    name: string;
  } | null;
}

export default function TimeTrackerPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeLogs, setActiveLogs] = useState<TimeLog[]>([]);
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Health check states
  const [healthCheckResult, setHealthCheckResult] = useState<HealthCheckResult | null>(null);
  const [performingHealthCheck, setPerformingHealthCheck] = useState(false);
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [startingTimer, setStartingTimer] = useState(false);

  // Organization filtering
  const organizationId = userDetails?.organization_id;

  // Calculate if tracking is active based on active logs
  const hasActiveSession = activeLogs.length > 0;

  useEffect(() => {
    if (userDetails?.id) {
      setLoading(true);
      
      Promise.all([
        fetchProjects(),
        fetchActiveLogs(),
        fetchRecentLogs(),
      ]).finally(() => {
        setLoading(false);
      });

      // Perform initial friendly health check on page load
      setTimeout(() => {
        toast({
          title: '👋 Welcome to Alyson Time Doctor!',
          description: 'Performing a quick system check to ensure everything is ready...',
        });
        performComprehensiveHealthCheck().catch(error => {
          console.error('Initial health check failed:', error);
          toast({
            title: '⚠️ Health Check Error',
            description: 'Unable to verify system health. Some features may not work properly.',
            variant: 'destructive',
          });
        });
      }, 1500); // 1.5 second delay to let page load
    }
  }, [userDetails]);

  const fetchProjects = async () => {
    if (!userDetails?.id) return;

    try {
      let data, error;
      
      // Admin users can see organization projects, employees only see assigned projects
      if (userDetails.role === 'admin') {
        let query = supabase
          .from('projects')
          .select('id, name')
          .not('name', 'ilike', '%test-%')
          .or('description.is.null,description.not.ilike.%E2E testing%');
        
        // Filter by organization unless super admin
        if (organizationId && !isSuperAdmin) {
          query = query.eq('organization_id', organizationId);
        }
        
        const response = await query.order('name');
        data = response.data;
        error = response.error;
      } else {
        // Employee: fetch only assigned projects
        const response = await supabase
          .from('employee_project_assignments')
          .select(`
            project_id,
            projects (
              id,
              name
            )
          `)
          .eq('user_id', userDetails.id);
        
        if (response.error) {
          error = response.error;
        } else {
          // Extract projects from assignment data, filtering out test projects
          data = (response.data || [])
            .map((assignment: any) => assignment.projects)
            .filter((p: any) => p && !p.name.toLowerCase().includes('test-'))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        }
      }

      if (error) {
        console.error('Error fetching projects:', error);
        toast({
          title: 'Error fetching projects',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      if (data && Array.isArray(data)) {
        setProjects(data);
        
        // Auto-select default project if none selected
        if (!selectedProjectId && data.length > 0) {
          const defaultProject = data.find(p => p.name === 'Default Project') || data[0];
          setSelectedProjectId(defaultProject.id);
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast({
        title: 'Error fetching projects',
        description: 'Failed to fetch projects.',
        variant: 'destructive',
      });
    }
  };

  const fetchActiveLogs = async () => {
    if (!userDetails?.id) return;

    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select(`
          *,
          projects(name)
        `)
        .eq('user_id', userDetails.id)
        .is('end_time', null)
        .order('start_time', { ascending: false });

      if (error) {
        console.error('Error fetching active logs:', error);
        return;
      }

      if (data && Array.isArray(data)) {
        // CRITICAL FIX: Clean up stale sessions (older than 24 hours)
        // This prevents old unclosed sessions from showing as "active" after login
        const now = new Date();
        const validActiveLogs = [];
        const staleSessions = [];
        
        for (const log of data) {
          const startTime = new Date(log.start_time);
          const hoursSinceStart = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceStart > 24) {
            // Session is stale (older than 24 hours) - auto-close it
            staleSessions.push(log);
          } else {
            validActiveLogs.push(log);
          }
        }
        
        // Auto-close stale sessions in background
        // FIX: Close at start_time (0-duration) instead of fabricating 8-hour duration
        // This is more honest - we don't know when the session actually ended
        if (staleSessions.length > 0) {
          console.log(`🧹 Cleaning up ${staleSessions.length} stale session(s)...`);
          for (const staleLog of staleSessions) {
            // Close at start time - don't fabricate duration
            const endTime = new Date(staleLog.start_time);
            await supabase
              .from('time_logs')
              .update({ 
                end_time: endTime.toISOString(),
                notes: ((staleLog as any).notes || '') + ' [Auto-closed: orphaned session - duration unknown]'
              })
              .eq('id', staleLog.id);
          }
          toast({
            title: 'Orphaned Sessions Closed',
            description: `${staleSessions.length} unclosed session(s) from >24h ago were cleaned up.`,
          });
        }
        
        setActiveLogs(validActiveLogs);
      }
    } catch (error) {
      console.error('Error fetching active logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentLogs = async () => {
    if (!userDetails?.id) return;

    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select(`
          *,
          projects(name)
        `)
        .eq('user_id', userDetails.id)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching recent logs:', error);
        return;
      }

      if (data && Array.isArray(data)) {
        // Calculate duration for recent logs
        // Use Math.ceil to show at least 1 minute for any non-zero duration
        const logsWithDuration = data.map((log) => {
          if (!log.end_time) {
            return { ...log, duration: 0 };
          }
          const durationMs = new Date(log.end_time).getTime() - new Date(log.start_time).getTime();
          const durationMinutes = durationMs / (1000 * 60);
          // Show at least 1 minute if there's any duration, otherwise round up
          return {
            ...log,
            duration: durationMinutes > 0 ? Math.max(1, Math.round(durationMinutes)) : 0,
          };
        });

        setRecentLogs(logsWithDuration);
      }
    } catch (error) {
      console.error('Error fetching recent logs:', error);
    }
  };

  const performComprehensiveHealthCheck = async (): Promise<HealthCheckResult> => {
    setPerformingHealthCheck(true);
    
    try {
      toast({
        title: '🔍 Performing Health Check',
        description: 'Verifying all features before starting timer...',
      });

      const result = await timerHealthChecker.performPreTimerHealthCheck();
      setHealthCheckResult(result);
      
      if (result.isHealthy) {
        toast({
          title: '🎉 All Systems Healthy!',
          description: '✅ Screenshots ✅ URL Tracking ✅ App Detection ✅ Fraud Protection ✅ Database - You\'re ready to track time!',
        });
      } else if (result.canStartTimer) {
        toast({
          title: '🟡 Health Check Warning',
          description: `${result.failedFeatures.length} features failed but timer can start with limited functionality`,
          variant: 'default',
        });
      } else {
        toast({
          title: '❌ Health Check Failed',
          description: 'Critical features failed. Timer cannot start.',
          variant: 'destructive',
        });
      }
      
      return result;
    } catch (error) {
      console.error('Health check failed:', error);
      const failedResult: HealthCheckResult = {
        isHealthy: false,
        failedFeatures: ['healthCheckSystem'],
        details: timerHealthChecker.getHealthStatus(),
        canStartTimer: false
      };
      
      setHealthCheckResult(failedResult);
      toast({
        title: '❌ Health Check Error',
        description: 'Failed to perform health check',
        variant: 'destructive',
      });
      
      return failedResult;
    } finally {
      setPerformingHealthCheck(false);
    }
  };

  const startTracking = async () => {
    if (!selectedProjectId) {
      toast({
        title: 'Select a project',
        description: 'Please select a project to start tracking.',
        variant: 'destructive',
      });
      return;
    }

    if (!userDetails?.id) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to start tracking.',
        variant: 'destructive',
      });
      return;
    }

    setStartingTimer(true);

    try {
      // Step 1: Perform comprehensive health check
      toast({
        title: '🔍 Starting Health Check',
        description: 'Verifying all systems before timer start...',
      });

      // Use desktop agent health check if available (includes permissions)
      let healthCheck;
      if (window.electron) {
        try {
          healthCheck = await window.electron.invoke!('system-health-check');
        } catch (error) {
          console.warn('Desktop health check failed, falling back to web health check:', error);
          healthCheck = await performComprehensiveHealthCheck();
        }
      } else {
        healthCheck = await performComprehensiveHealthCheck();
      }
      
      if (!healthCheck.canStartTimer) {
        toast({
          title: '⛔ Timer Start Blocked',
          description: 'Critical features failed health check. Please fix issues and try again.',
          variant: 'destructive',
        });
        setShowHealthDetails(true);
        return;
      }

      // Step 2: Initialize desktop app tracking if available
      if (window.electron) {
        toast({
          title: '🖥️ Initializing Desktop Features',
          description: 'Starting advanced tracking features...',
        });

        try {
          // Start desktop tracking with selected project
          await window.electron.invoke!('start-timer', selectedProjectId);
          if (userDetails?.id) {
            window.electron.setUserId(userDetails.id);
          }
        } catch (electronError) {
          console.warn('Desktop features not available:', electronError);
          toast({
            title: '⚠️ Desktop Features Limited',
            description: 'Some advanced features may not be available.',
          });
        }
      }

      // Step 3: Close any stale active sessions before creating a new one
      toast({
        title: '💾 Creating Time Log',
        description: 'Saving session to database...',
      });

      const now = new Date().toISOString();
      await supabase
        .from('time_logs')
        .update({ end_time: now, status: 'completed' })
        .eq('user_id', userDetails.id)
        .or('end_time.is.null,status.eq.active');

      // Step 4: Insert the new session
      let { data, error } = await supabase
        .from('time_logs')
        .insert({ 
          user_id: userDetails.id, 
          project_id: selectedProjectId,
          start_time: now,
          status: 'active',
          is_idle: false,
          health_check_passed: healthCheck.isHealthy,
          failed_features: healthCheck.failedFeatures.length > 0 ? healthCheck.failedFeatures : null
        })
        .select()
        .single();

      if (error?.message?.includes('idx_one_active_session_per_user') || error?.code === '23505') {
        console.warn('Duplicate session detected after cleanup — force-closing and retrying');
        await supabase
          .from('time_logs')
          .update({ end_time: now, status: 'completed' })
          .eq('user_id', userDetails.id)
          .eq('status', 'active');
        const retry = await supabase
          .from('time_logs')
          .insert({ 
            user_id: userDetails.id, 
            project_id: selectedProjectId,
            start_time: now,
            status: 'active',
            is_idle: false,
            health_check_passed: healthCheck.isHealthy,
            failed_features: healthCheck.failedFeatures.length > 0 ? healthCheck.failedFeatures : null
          })
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error('Error starting time tracking:', error);
        toast({
          title: 'Error starting time tracking',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      // Step 5: Refresh data and confirm success
      await Promise.all([fetchActiveLogs(), fetchRecentLogs()]);
      
      const projectName = projects.find(p => p.id === selectedProjectId)?.name || 'selected project';
      
      if (healthCheck.isHealthy) {
        toast({
          title: '✅ Timer Started Successfully',
          description: `All features verified! Tracking time for ${projectName}.`,
        });
      } else {
        toast({
          title: '🟡 Timer Started with Warnings',
          description: `Tracking started for ${projectName} with limited functionality.`,
        });
      }

      // Step 6: Schedule periodic health checks during tracking
      setInterval(() => {
        if (hasActiveSession) {
          timerHealthChecker.performPreTimerHealthCheck().then(result => {
            if (!result.canStartTimer) {
              console.warn('Health check failed during tracking:', result.failedFeatures);
              toast({
                title: '⚠️ Feature Issues Detected',
                description: 'Some tracking features may not be working properly.',
              });
            }
          });
        }
      }, 300000); // Check every 5 minutes

    } catch (error) {
      console.error('Error starting time tracking:', error);
      toast({
        title: 'Error starting time tracking',
        description: 'Failed to start time tracking.',
        variant: 'destructive',
      });
    } finally {
      setStartingTimer(false);
    }
  };

  const stopTracking = async () => {
    if (!userDetails?.id) {
      toast({
        title: 'User not found',
        description: 'Please ensure you are logged in properly.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      // Get the most recent active session for this user
      const { data: activeLogs, error: fetchError } = await supabase
        .from('time_logs')
        .select('id, start_time, project_id, projects(name)')
        .eq('user_id', userDetails.id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error('Error fetching active sessions:', fetchError);
        toast({
          title: 'Error fetching active sessions',
          description: fetchError.message,
          variant: 'destructive',
        });
        return;
      }

      if (!activeLogs || activeLogs.length === 0) {
        toast({
          title: 'No active session',
          description: 'No active tracking session found for your account.',
          variant: 'destructive',
        });
        return;
      }

      const activeLog = activeLogs[0];

      // Update the session with end time
      const { error: updateError } = await supabase
        .from('time_logs')
        .update({ 
          end_time: new Date().toISOString(),
          status: 'completed'
        })
        .eq('id', activeLog.id)
        .eq('user_id', userDetails.id);

      if (updateError) {
        console.error('Error stopping time tracking:', updateError);
        toast({
          title: 'Error stopping time tracking',
          description: updateError.message,
          variant: 'destructive',
        });
        return;
      }

      // Refresh the data
      await Promise.all([fetchActiveLogs(), fetchRecentLogs()]);
      
      const projectName = activeLog.projects?.name || 'project';
      toast({
        title: 'Time tracking stopped',
        description: `Successfully stopped tracking session for ${projectName}.`,
      });
    } catch (error) {
      console.error('Error stopping time tracking:', error);
      toast({
        title: 'Error stopping time tracking',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getProjectDisplay = (log: TimeLog) => {
    if (log.projects) {
      return log.projects.name;
    }
    const project = projects.find(p => p.id === log.project_id);
    return project?.name || 'Unknown Project';
  };

  const retryFeature = async (featureName: string) => {
    try {
      await timerHealthChecker.retryFeatureCheck(featureName as any);
      // Refresh health check result
      const newResult = await timerHealthChecker.performPreTimerHealthCheck();
      setHealthCheckResult(newResult);
    } catch (error) {
      console.error('Feature retry failed:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      {/* Initial Health Check Welcome Card */}
      {!healthCheckResult && userDetails?.id && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-blue-800">🏥 Running System Health Check</h3>
                <p className="text-sm text-blue-600 mt-1">
                  Verifying screenshots, URL tracking, app detection, fraud protection, and database connection...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Health Check Status Card */}
      {healthCheckResult && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <CardTitle>System Health Check</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {healthCheckResult.isHealthy ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    All Systems Healthy
                  </Badge>
                ) : healthCheckResult.canStartTimer ? (
                  <Badge className="bg-yellow-100 text-yellow-800">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Limited Functionality
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">
                    <X className="h-3 w-3 mr-1" />
                    Critical Issues
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHealthDetails(!showHealthDetails)}
                >
                  {showHealthDetails ? 'Hide' : 'Show'} Details
                </Button>
              </div>
            </div>
            <CardDescription>
              Last checked: {format(healthCheckResult.details.lastCheck, 'MMM dd, yyyy HH:mm:ss')}
            </CardDescription>
          </CardHeader>
          {showHealthDetails && (
            <CardContent>
              <div className="space-y-3">
                {/* Feature Status List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { name: 'screenshots', label: '📸 Screenshot Capture', status: healthCheckResult.details.screenshots },
                    { name: 'urlDetection', label: '🌐 URL Detection', status: healthCheckResult.details.urlDetection },
                    { name: 'appDetection', label: '🖥️ App Detection', status: healthCheckResult.details.appDetection },
                    { name: 'fraudDetection', label: '🛡️ Fraud Detection', status: healthCheckResult.details.fraudDetection },
                    { name: 'databaseConnection', label: '💾 Database Connection', status: healthCheckResult.details.databaseConnection },
                  ].map((feature) => (
                    <div key={feature.name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        {feature.status ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">{feature.label}</span>
                      </div>
                      {!feature.status && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryFeature(feature.name)}
                          disabled={performingHealthCheck}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Error Details */}
                {Object.keys(healthCheckResult.details.errorDetails).length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="text-sm font-medium text-red-800 mb-2">Error Details:</h4>
                    <div className="space-y-1">
                      {Object.entries(healthCheckResult.details.errorDetails).map(([feature, error]) => (
                        <div key={feature} className="text-xs text-red-700">
                          <strong>{feature}:</strong> {error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={performComprehensiveHealthCheck}
                  disabled={performingHealthCheck}
                >
                  {performingHealthCheck ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2" />
                      Running Health Check...
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Re-run Health Check
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Time Tracker</CardTitle>
          <CardDescription>Track your work time efficiently with comprehensive health monitoring.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Select onValueChange={(value) => setSelectedProjectId(value)} value={selectedProjectId || ''}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      {project.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            {hasActiveSession ? (
              <Button variant="destructive" className="w-full" onClick={stopTracking}>
                <Square className="mr-2 h-4 w-4" /> Stop Tracking
              </Button>
            ) : (
              <Button 
                className="w-full" 
                onClick={startTracking} 
                disabled={!selectedProjectId || loading || startingTimer || performingHealthCheck}
              >
                {startingTimer ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2" />
                    Starting Timer...
                  </>
                ) : performingHealthCheck ? (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Health Check Running...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Tracking
                  </>
                )}
              </Button>
            )}
            
            {/* Manual Health Check Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={performComprehensiveHealthCheck}
              disabled={performingHealthCheck}
            >
              {performingHealthCheck ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2" />
                  Running Health Check...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Run System Health Check
                </>
              )}
            </Button>
            
            {/* Health Check Status Indicator */}
            {healthCheckResult && !hasActiveSession && (
              <div className="mt-2 text-center">
                {healthCheckResult.canStartTimer ? (
                  <div className="text-xs text-green-600 flex items-center justify-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    System ready for tracking
                  </div>
                ) : (
                  <div className="text-xs text-red-600 flex items-center justify-center gap-1">
                    <X className="h-3 w-3" />
                    Fix critical issues before starting
                  </div>
                )}
              </div>
            )}
            
            {/* Desktop Agent Status */}
            <div className="mt-2 text-center">
              <div className="text-xs text-gray-600 flex items-center justify-center gap-1">
                {window.electron ? (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    Desktop Agent Connected
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    Web Version (Limited Features)
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Active Session</CardTitle>
          <CardDescription>Current time tracking session.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading active sessions...</p>
          ) : activeLogs.length > 0 ? (
            activeLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">{getProjectDisplay(log)}</p>
                  <p className="text-xs text-muted-foreground">
                    Started at: {format(new Date(log.start_time), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
                <div>
                  <Badge variant="secondary">
                    <Clock className="mr-2 h-4 w-4" />
                    {differenceInMinutes(new Date(), new Date(log.start_time))} minutes
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No active tracking session found.</p>
              <p className="text-xs text-muted-foreground mt-1">Start tracking to see your active session here.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Sessions</CardTitle>
          <CardDescription>Your recent time tracking sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length > 0 ? (
            recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center justify-between p-3 border rounded mb-2 last:mb-0">
                <div>
                  <p className="text-sm font-medium">{getProjectDisplay(log)}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.start_time), 'MMM dd, yyyy HH:mm')} -{' '}
                    {log.end_time ? format(new Date(log.end_time), 'HH:mm') : 'Active'}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">
                    <Clock className="mr-2 h-4 w-4" />
                    {log.duration} minutes
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent sessions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
