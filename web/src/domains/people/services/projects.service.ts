import { backendDelete, backendGet, backendPatch, backendPost } from '@/lib/backend-api';

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
  const data = await backendGet<ProjectRow[]>('/data/projects');
  if (opts?.excludeTest) {
    return data.filter((p) => !p.name.toLowerCase().includes('test-'));
  }
  return data;
}

export async function createProject(
  name: string,
  description: string,
  organizationId: string | null
): Promise<ProjectRow> {
  return backendPost<ProjectRow>('/data/projects', {
    name,
    description,
    organization_id: organizationId,
  });
}

export async function updateProject(
  id: string,
  updates: { name?: string; description?: string }
): Promise<ProjectRow> {
  return backendPatch<ProjectRow>(`/data/projects/${id}`, updates);
}

export async function deleteProject(id: string): Promise<void> {
  await backendDelete<{ success: boolean }>(`/data/projects/${id}`);
}

export async function fetchProjectAssignmentCount(projectId: string): Promise<number> {
  const data = await backendGet<{ count: number }>(`/data/projects/${projectId}/assignment-count`);
  return data.count || 0;
}

export async function deleteProjectAssignments(projectId: string): Promise<void> {
  await backendDelete<{ success: boolean }>(`/data/projects/${projectId}/assignments`);
}
