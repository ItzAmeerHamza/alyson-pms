import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Trash2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
}

interface ProjectAssignment {
  id: string;
  project_id: string;
  projects: Project;
}

interface AssignProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentUserId?: string;
  onAssignmentChange?: () => void;
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export function AssignProjectsDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentUserId,
  onAssignmentChange,
  organizationId,
  isSuperAdmin
}: AssignProjectsDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<ProjectAssignment[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, userId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch projects - filtered by organization for non-super admins
      let projectsQuery = supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (organizationId && !isSuperAdmin) {
        projectsQuery = projectsQuery.eq('organization_id', organizationId);
      }

      const { data: projectsData, error: projectsError } = await projectsQuery;

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Fetch user's current project assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('employee_project_assignments')
        .select(`
          id,
          project_id,
          projects:project_id (
            id,
            name
          )
        `)
        .eq('user_id', userId);

      if (assignmentsError) throw assignmentsError;
      setAssignedProjects(assignmentsData || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssignProject = async () => {
    if (!selectedProjectId) return;

    setAssigning(true);
    try {
      const { error } = await supabase
        .from('employee_project_assignments')
        .insert({
          user_id: userId,
          project_id: selectedProjectId,
          assigned_by: currentUserId
        });

      if (error) throw error;

      toast({
        title: "Project assigned",
        description: "Project has been successfully assigned to the user",
      });

      // Refresh assignments
      await fetchData();
      setSelectedProjectId("");
      onAssignmentChange?.();
    } catch (error: any) {
      toast({
        title: "Error assigning project",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveProject = async (assignmentId: string, projectName: string) => {
    try {
      const { error } = await supabase
        .from('employee_project_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      toast({
        title: "Project removed",
        description: `${projectName} has been unassigned from the user`,
      });

      // Refresh assignments
      await fetchData();
      onAssignmentChange?.();
    } catch (error: any) {
      toast({
        title: "Error removing project",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Filter out already assigned projects
  const availableProjects = projects.filter(
    project => !assignedProjects.some(ap => ap.project_id === project.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Projects to {userName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Currently Assigned Projects */}
            <div className="space-y-2">
              <Label>Currently Assigned Projects</Label>
              {assignedProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects assigned yet</p>
              ) : (
                <div className="space-y-2">
                  {assignedProjects.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-2 rounded-md border bg-muted/50"
                    >
                      <span className="text-sm font-medium">
                        {assignment.projects.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveProject(assignment.id, assignment.projects.name)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Assign New Project */}
            <div className="space-y-2">
              <Label>Assign New Project</Label>
              {availableProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">All available projects are already assigned</p>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAssignProject}
                    disabled={!selectedProjectId || assigning}
                  >
                    {assigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Assign"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

