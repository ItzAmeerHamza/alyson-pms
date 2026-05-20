import { supabase } from '@/integrations/supabase/client';

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
  let query = supabase
    .from('users')
    .select('id, full_name, email, role, organization_id, avatar_url, is_active')
    .order('full_name');

  if (ctx.organizationId && !ctx.isSuperAdmin) {
    query = query.eq('organization_id', ctx.organizationId);
  }

  if (opts?.roles?.length) {
    query = query.in('role', opts.roles);
  }

  if (opts?.excludeTestEmails) {
    query = query.not('email', 'ilike', '%example.com%');
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as UserRow[];
}

export async function fetchOrgUserIds(ctx: OrgContext): Promise<string[]> {
  const users = await fetchOrgUsers(ctx);
  return users.map((u) => u.id);
}

export async function fetchUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, role, organization_id, avatar_url, is_active')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as UserRow;
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (error) throw error;
}
