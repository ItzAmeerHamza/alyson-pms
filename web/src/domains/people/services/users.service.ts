import { backendDelete, backendGet } from '@/lib/backend-api';

export interface UserRow {
  id: string;
  full_name: string;
  email: string;
  role?: string;
  organization_id?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
}

export interface OrgContext {
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export async function fetchOrgUsers(
  ctx: OrgContext,
  opts?: { roles?: string[]; excludeTestEmails?: boolean }
): Promise<UserRow[]> {
  const users = await backendGet<UserRow[]>('/data/users');
  let filtered = users;
  if (opts?.roles?.length) {
    filtered = filtered.filter((u) => u.role && opts.roles!.includes(u.role));
  }
  if (opts?.excludeTestEmails) {
    filtered = filtered.filter((u) => !u.email.toLowerCase().includes('example.com'));
  }
  return filtered;
}

export async function fetchOrgUserIds(ctx: OrgContext): Promise<string[]> {
  const users = await fetchOrgUsers(ctx);
  return users.map((u) => u.id);
}

export async function fetchUserById(userId: string): Promise<UserRow | null> {
  // Reuses the same cached GET /data/users response as fetchOrgUsers (no extra network call within TTL).
  const users = await backendGet<UserRow[]>('/data/users');
  return users.find((u) => u.id === userId) || null;
}

export async function deleteUser(userId: string): Promise<void> {
  await backendDelete<{ success: boolean }>(`/data/users/${userId}`);
}
