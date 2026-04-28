-- Enable RLS and set up policies based on user role

-- Helper: fetch role from users table
-- Assumes function public.get_user_role(uuid) exists and returns role text

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.time_logs enable row level security;
alter table public.screenshots enable row level security;
alter table public.users enable row level security;

-- Projects: only managers and admins can access
create policy "projects_access" on public.projects
  for all
  using (public.get_user_role(auth.uid()) in ('admin','manager'))
  with check (public.get_user_role(auth.uid()) in ('admin','manager'));

-- Users table
create policy "users_select_self" on public.users
  for select
  using (public.get_user_role(auth.uid()) in ('admin','manager') or id = auth.uid());
create policy "users_modify" on public.users
  for all
  using (public.get_user_role(auth.uid()) in ('admin','manager') or id = auth.uid())
  with check (public.get_user_role(auth.uid()) in ('admin','manager') or id = auth.uid());

-- Tasks table
create policy "tasks_policy" on public.tasks
  for all
  using (public.get_user_role(auth.uid()) in ('admin','manager') or created_by = auth.uid())
  with check (public.get_user_role(auth.uid()) in ('admin','manager') or created_by = auth.uid());

-- Time logs table
create policy "time_logs_policy" on public.time_logs
  for all
  using (public.get_user_role(auth.uid()) in ('admin','manager') or user_id = auth.uid())
  with check (public.get_user_role(auth.uid()) in ('admin','manager') or user_id = auth.uid());

-- Screenshots table
create policy "screenshots_policy" on public.screenshots
  for all
  using (public.get_user_role(auth.uid()) in ('admin','manager') or user_id = auth.uid())
  with check (public.get_user_role(auth.uid()) in ('admin','manager') or user_id = auth.uid());
