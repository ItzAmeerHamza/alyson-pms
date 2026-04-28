-- Helper function required by RLS policies: public.get_user_role(uuid)
create or replace function public.get_user_role(uid uuid)
returns text
language sql
stable
as $$
  select role from public.users where id = uid;
$$;


