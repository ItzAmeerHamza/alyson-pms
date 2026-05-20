import { supabase } from '@/integrations/supabase/client';

export interface ProjectRow {
  id: string;
  name: string;
  description?: string | null;
  organization_id?: string | null;
  created_at?: string | null;
}

interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export async function fetchProjects(
  ctx: OrgContext,
  opts?: { excludeTest?: boolean }
): Promise<ProjectRow[]> {
  let query = supabase
    .from('projects')
    .select('id, name, description, organization_id, created_at')
    .order('created_at', { ascending: false });

  if (ctx.organizationId && !ctx.isSuperAdmin) {
    query = query.eq('organization_id', ctx.organizationId);
  }

  if (opts?.excludeTest) {
    query = query.not('name', 'ilike', '%test-%');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as ProjectRow[];
}

export async function createProject(
  name: string,
  description: string,
  organizationId: string | null
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, description, organization_id: organizationId })
    .select()
    .single();

  if (error) throw error;
  return data as ProjectRow;
}

export async function updateProject(
  id: string,
  updates: { name?: string; description?: string }
): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as ProjectRow;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProjectAssignmentCount(projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('employee_project_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (error) throw error;
  return count || 0;
}

export async function deleteProjectAssignments(projectId: string): Promise<void> {
  const { error } = await supabase
    .from('employee_project_assignments')
    .delete()
    .eq('project_id', projectId);
  if (error) throw error;
}
