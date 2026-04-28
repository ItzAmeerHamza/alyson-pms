-- Fix: allow auth trigger to insert into public.users
-- Supabase Dashboard "Add user" inserts into auth.users, then our trigger inserts into public.users.
-- The existing users_insert_policy used `id = auth.uid()`, which fails in trigger context (auth.uid() is NULL).

-- Ensure RLS remains enabled; we only broaden INSERT to trusted DB roles.
DROP POLICY IF EXISTS "users_insert_policy" ON public.users;
DROP POLICY IF EXISTS "users_insert_from_auth_trigger" ON public.users;

CREATE POLICY "users_insert_policy" ON public.users
  FOR INSERT
  WITH CHECK (
    -- Allow normal self-insert (if ever used via PostgREST)
    id = auth.uid()
    -- Allow inserts performed by Supabase auth/admin plumbing and service role.
    OR current_user IN ('supabase_auth_admin', 'service_role', 'postgres')
  );

