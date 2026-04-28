import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2, Plus, Pencil, Trash2, EyeOff, Users } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers/auth-provider";
import {
  fetchProjects as fetchProjectsService,
  createProject,
  updateProject,
  deleteProject,
  fetchProjectAssignmentCount,
  deleteProjectAssignments,
} from "@/domains/people";
import type { ProjectRow } from "@/domains/people";

type ProjectWithCount = ProjectRow & { assignedUsersCount: number };

import { projectFormSchema, type ProjectFormValues } from "@/lib/schemas";

export default function ProjectManagement() {
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const { toast } = useToast();
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const orgCtx = { organizationId, isSuperAdmin };

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const fetchProjectsList = useCallback(async () => {
    try {
      setLoading(true);
      const projectsData = await fetchProjectsService(orgCtx, { excludeTest: true });

      const projectsWithCounts = await Promise.all(
        projectsData.map(async (project) => {
          const count = await fetchProjectAssignmentCount(project.id);
          return { ...project, assignedUsersCount: count };
        })
      );

      setProjects(projectsWithCounts);
    } catch (error: any) {
      toast({
        title: "Error fetching projects",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId, isSuperAdmin, toast]);

  useEffect(() => {
    if (userDetails) {
      fetchProjectsList();
    }
  }, [userDetails, fetchProjectsList]);

  async function onSubmit(values: ProjectFormValues) {
    try {
      if (userDetails?.role !== 'admin' && userDetails?.role !== 'manager') {
        toast({
          title: "Permission Denied",
          description: `You need admin or manager role to manage projects. Your current role: ${userDetails?.role}`,
          variant: "destructive",
        });
        return;
      }

      if (editingProject) {
        await updateProject(editingProject.id, {
          name: values.name,
          description: values.description || undefined,
        });
        toast({ title: "Project updated", description: "The project has been updated successfully" });
        setProjects(
          projects.map((p) =>
            p.id === editingProject.id
              ? { ...p, name: values.name, description: values.description || null }
              : p
          )
        );
      } else {
        await createProject(values.name, values.description || "", organizationId || null);
        toast({ title: "Project created", description: "The project has been created successfully" });
        await fetchProjectsList();
      }

      form.reset();
      setIsDialogOpen(false);
      setEditingProject(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to ${editingProject ? 'update' : 'create'} project: ${error.message}`,
        variant: "destructive",
      });
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      await deleteProject(id);
      toast({ title: "Project deleted", description: "The project has been deleted successfully" });
      setProjects(projects.filter((p) => p.id !== id));
    } catch (error: any) {
      toast({ title: "Error deleting project", description: error.message, variant: "destructive" });
    }
  }

  async function handleHideFromAllUsers(projectId: string, projectName: string) {
    try {
      await deleteProjectAssignments(projectId);
      toast({
        title: "Project hidden from all users",
        description: `"${projectName}" has been removed from all employee assignments`,
      });
      await fetchProjectsList();
    } catch (error: any) {
      toast({ title: "Error hiding project", description: error.message, variant: "destructive" });
    }
  }

  function handleEditProject(project: ProjectRow) {
    setEditingProject(project);
    form.reset({ name: project.name, description: project.description || "" });
    setIsDialogOpen(true);
  }

  function handleNewProject() {
    setEditingProject(null);
    form.reset({ name: "", description: "" });
    setIsDialogOpen(true);
  }

  return (
    <div className="container py-6">
      <PageHeader title="Project Management" subtitle="Create and manage projects for your team">
        <Button onClick={handleNewProject}>
          <Plus className="mr-2 h-4 w-4" /> Add Project
        </Button>
      </PageHeader>

      <Card className="mt-6">
        <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-muted-foreground">No projects found</p>
              <Button variant="outline" onClick={handleNewProject} className="mt-4">
                <Plus className="mr-2 h-4 w-4" /> Create your first project
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Assigned Users</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="max-w-md truncate">{project.description || "No description"}</TableCell>
                    <TableCell>
                      <Badge variant={project.assignedUsersCount > 0 ? "default" : "secondary"} className="gap-1">
                        <Users className="h-3 w-3" />
                        {project.assignedUsersCount} {project.assignedUsersCount === 1 ? 'user' : 'users'}
                      </Badge>
                    </TableCell>
                    <TableCell>{project.created_at ? new Date(project.created_at).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEditProject(project)} title="Edit project">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {project.assignedUsersCount > 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" title="Hide from all users">
                                <EyeOff className="h-4 w-4 text-orange-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Hide project from all users?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove "{project.name}" from all {project.assignedUsersCount} assigned {project.assignedUsersCount === 1 ? 'employee' : 'employees'}.
                                  The project will no longer appear in the desktop agent for time tracking.
                                  You can re-assign users later if needed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleHideFromAllUsers(project.id, project.name)} className="bg-orange-500 text-white hover:bg-orange-600">
                                  Hide from All
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Delete project">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete project</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{project.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteProject(project.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl><Input placeholder="Enter project name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea placeholder="Enter project description (optional)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit">{editingProject ? "Update Project" : "Create Project"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
