import React, { useState, useEffect } from 'react';
import { useTracker } from '@/providers/tracker-provider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DesktopDownload from '@/components/ui/desktop-download';
import { useQuery } from '@tanstack/react-query';

interface Project {
  id: string;
  name: string;
  description?: string;
}

export function ProjectSelector() {
  const { isTracking, currentProjectId, startTracking, stopTracking, canTrack } = useTracker();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(currentProjectId);

  // Fetch assigned projects for employee
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ['employee-assigned-projects', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('employee_project_assignments')
        .select(`
          project_id,
          projects (
            id,
            name,
            description
          )
        `)
        .eq('user_id', user.id);
        
      if (error) {
        toast({
          title: 'Error fetching assigned projects',
          description: error.message,
          variant: 'destructive',
        });
        return [];
      }
      
      // Extract projects from assignment data and sort by name
      const assignedProjects = (data || [])
        .map((assignment: any) => assignment.projects)
        .filter(Boolean)
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      
      return assignedProjects as Project[];
    },
    enabled: !!user?.id,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute
    // refetchOnWindowFocus disabled globally to prevent unwanted refreshes
  });
  
  // Update selected project when currentProjectId changes
  useEffect(() => {
    setSelectedProjectId(currentProjectId);
  }, [currentProjectId]);
  
  const handleStartTracking = () => {
    if (!selectedProjectId) {
      toast({
        title: 'Please select a project',
        description: 'You must select a project before starting tracking',
        variant: 'destructive',
      });
      return;
    }
    
    startTracking(selectedProjectId);
  };
  
  const handleStopTracking = () => {
    stopTracking();
  };
  
  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h3 className="text-lg font-medium mb-4">Activity Tracking</h3>
      
      <div className="space-y-4">
        {!canTrack && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-md text-amber-800 mb-4">
            <p className="font-medium mb-2">Desktop Application Required</p>
            <p className="text-sm mb-3">Time tracking requires the desktop application for screenshot capture and activity monitoring.</p>
            <DesktopDownload variant="compact" />
          </div>
        )}
        
        {canTrack && !selectedProjectId && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-md text-blue-800 mb-4">
            <p className="font-medium mb-2">Project Selection Required</p>
            <p className="text-sm">Please select a project before starting time tracking. This helps organize your work sessions and generate accurate reports.</p>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-full sm:w-2/3">
            <label className="text-sm font-medium mb-2 block">
              Select Project <span className="text-red-500">*</span>
            </label>
            <Select
              value={selectedProjectId || ""}
              onValueChange={(value) => setSelectedProjectId(value)}
              disabled={isTracking || !canTrack}
              data-testid="project-selector"
            >
              <SelectTrigger className={`${!selectedProjectId && canTrack ? 'border-red-300 focus:border-red-500' : ''}`}>
                <SelectValue placeholder="Choose a project to track time..." />
              </SelectTrigger>
              <SelectContent>
                {projectsLoading ? (
                  <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                ) : projects && projects.length > 0 ? (
                  projects.map((project: Project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{project.name}</span>
                        {project.description && (
                          <span className="text-xs text-muted-foreground">{project.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-projects" disabled>No projects assigned to you</SelectItem>
                )}
              </SelectContent>
            </Select>
            {!selectedProjectId && canTrack && (
              <p className="text-xs text-red-500 mt-1" data-testid="project-required-message">Please select a project to continue</p>
            )}
          </div>
          
          <div className="w-full sm:w-1/3">
            {isTracking ? (
              <Button
                onClick={handleStopTracking}
                variant="destructive"
                className="w-full"
                disabled={!canTrack}
              >
                Stop Tracking
              </Button>
            ) : (
              <Button
                onClick={handleStartTracking}
                className="w-full"
                disabled={!selectedProjectId || !canTrack}
                data-testid="start-timer-confirm"
              >
                {selectedProjectId ? 'Start Tracking' : 'Select Project First'}
              </Button>
            )}
          </div>
        </div>
        
        {selectedProjectId && !isTracking && canTrack && (
          <div className="bg-green-50 border border-green-200 p-3 rounded-md text-green-800">
            <p className="text-sm">
              ✓ Ready to track time for <strong>{projects?.find(p => p.id === selectedProjectId)?.name}</strong>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
