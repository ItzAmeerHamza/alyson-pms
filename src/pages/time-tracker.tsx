import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

// Helper function to calculate duration in minutes, showing at least 1 minute for any non-zero duration
const calculateDurationMinutes = (startTime: string, endTime: string | null): number => {
  if (!endTime) return 0;
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const durationMinutes = durationMs / (1000 * 60);
  return durationMinutes > 0 ? Math.max(1, Math.round(durationMinutes)) : 0;
};
import { Play, Square, Clock, Calendar } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  project_id: string | null;
}

const TimeTracker = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<TimeLog[]>([]);
  const [recentSessions, setRecentSessions] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
      fetchActiveSessions();
      fetchRecentSessions();
    }
  }, [user]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      // Fetch only projects assigned to the current user
      const { data, error } = await supabase
        .from('employee_project_assignments')
        .select(`
          project_id,
          projects (
            id,
            name
          )
        `)
        .eq('user_id', user?.id || '');

      if (error) {
        console.error('Error fetching assigned projects:', error);
        toast({
          title: 'Error fetching projects',
          description: error.message,
          variant: 'destructive',
        });
        setProjects([]);
        return;
      }

      if (data) {
        // Transform the data to match the Project interface
        const assignedProjects = data
          .filter(assignment => assignment.projects) // Ensure project exists
          .map(assignment => ({
            id: assignment.projects!.id,
            name: assignment.projects!.name,
          }));
        
        setProjects(assignedProjects);
        
        if (assignedProjects.length === 0) {
          toast({
            title: 'No projects assigned',
            description: 'Please contact your administrator to assign projects to your account.',
            variant: 'default',
          });
        }
      }
    } catch (error: any) {
      console.error('Unexpected error fetching projects:', error);
      toast({
        title: 'Error fetching projects',
        description: 'An unexpected error occurred while loading projects.',
        variant: 'destructive',
      });
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActiveSessions = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select('id, start_time, end_time, project_id')
        .eq('user_id', user.id)
        .is('end_time', null);

      if (error) {
        toast({
          title: 'Error fetching active sessions',
          description: error.message,
          variant: 'destructive',
        });
      }

      if (data) {
        setActiveSessions(data);
      }
    } catch (error: any) {
      toast({
        title: 'Error fetching active sessions',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const fetchRecentSessions = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('time_logs')
        .select('id, start_time, end_time, project_id')
        .eq('user_id', user.id)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false })
        .limit(5);

      if (error) {
        toast({
          title: 'Error fetching recent sessions',
          description: error.message,
          variant: 'destructive',
        });
      }

      if (data) {
        setRecentSessions(data);
      }
    } catch (error: any) {
      toast({
        title: 'Error fetching recent sessions',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const startSession = async () => {
    if (!selectedProjectId) {
      toast({
        title: 'No project selected',
        description: 'Please select a project to start tracking',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Authentication required',
        description: 'Please log in to start tracking',
        variant: 'destructive',
      });
      return;
    }

    try {
      const now = new Date().toISOString();

      await supabase
        .from('time_logs')
        .update({ end_time: now, status: 'completed' })
        .eq('user_id', user.id)
        .or('end_time.is.null,status.eq.active');

      let { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: user.id,
          project_id: selectedProjectId,
          start_time: now,
        })
        .select('id, start_time, end_time, project_id');

      if (error?.message?.includes('idx_one_active_session_per_user') || (error as any)?.code === '23505') {
        await supabase
          .from('time_logs')
          .update({ end_time: now, status: 'completed' })
          .eq('user_id', user.id)
          .eq('status', 'active');
        const retry = await supabase
          .from('time_logs')
          .insert({
            user_id: user.id,
            project_id: selectedProjectId,
            start_time: now,
          })
          .select('id, start_time, end_time, project_id');
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        toast({
          title: 'Error starting session',
          description: error.message,
          variant: 'destructive',
        });
      }

      if (data) {
        fetchActiveSessions();
        fetchRecentSessions();
        toast({
          title: 'Session started',
          description: 'Time tracking has started for the selected project',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error starting session',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const stopSession = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('time_logs')
        .update({ end_time: new Date().toISOString() })
        .eq('id', sessionId)
        .select('id, start_time, end_time, project_id');

      if (error) {
        toast({
          title: 'Error stopping session',
          description: error.message,
          variant: 'destructive',
        });
      }

      if (data) {
        fetchActiveSessions();
        fetchRecentSessions();
        toast({
          title: 'Session stopped',
          description: 'Time tracking has stopped for the selected project',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error stopping session',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Time Tracker</CardTitle>
          <CardDescription>Track your work sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="project-select" className="text-sm font-medium">
              Select Project <span className="text-red-500">*</span>
            </label>
            <Select onValueChange={setSelectedProjectId} disabled={projects.length === 0}>
              <SelectTrigger className="w-full">
                <SelectValue 
                  placeholder={projects.length === 0 ? "✓ Choose a project to track time..." : "Choose a project to track time..."} 
                />
              </SelectTrigger>
              <SelectContent>
                {projects.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No projects assigned
                  </div>
                ) : (
                  projects.map((project: Project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button onClick={startSession} disabled={!selectedProjectId || activeSessions.length > 0}>
              <Play className="mr-2 h-4 w-4" />
              Start Session
            </Button>
          </div>

          {activeSessions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Active Sessions</h3>
              {activeSessions.map((session: any) => (
                <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p>
                      Tracking since {format(new Date(session.start_time), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {projects.find((project: Project) => project.id === session.project_id)?.name}
                  </div>
                  <Button variant="destructive" onClick={() => stopSession(session.id)}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop Session
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Recent Sessions</h3>
            {recentSessions.map((session: any) => (
              <div key={session.id} className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p>
                    {format(new Date(session.start_time), 'MMM dd, yyyy HH:mm')} -{' '}
                    {session.end_time ? format(new Date(session.end_time), 'MMM dd, yyyy HH:mm') : 'Active'}
                  </p>
                  <p>
                    {calculateDurationMinutes(session.start_time, session.end_time)} minutes
                  </p>
                </div>
                <div>
                  {projects.find((project: Project) => project.id === session.project_id)?.name}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TimeTracker;
