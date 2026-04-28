begin;

create extension if not exists pgcrypto;

-- 1) Canonical table
create table if not exists public.app_url_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid not null,
  device_id uuid,
  time_log_id uuid,
  site_url text,
  domain text,
  title text,
  browser text,
  confidence text check (confidence in ('high','low')) default 'low',
  privacy_flags jsonb default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_url_activity_user_time on public.app_url_activity(user_id, started_at desc);
create index if not exists idx_app_url_activity_domain_lower on public.app_url_activity (lower(domain));
create index if not exists brin_app_url_activity_started_at on public.app_url_activity using brin (started_at);
create index if not exists idx_app_url_activity_open
on public.app_url_activity(user_id, started_at desc)
where ended_at is null;

-- Idempotent backfill dedupe
create unique index if not exists uq_app_url_activity_dedupe
on public.app_url_activity(user_id, site_url, started_at)
where site_url is not null;

-- 2) Lock legacy name to avoid race, then rename & backfill (idempotent)
do $$
begin
  if to_regclass('public.url_logs') is not null then
    execute 'lock table public.url_logs in access exclusive mode';
  end if;
end$$;

do $$
declare k char;
declare has_site_url boolean;
begin
  select c.relkind into k
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='url_logs';
  if k='r' then
    execute 'alter table public.url_logs rename to url_logs_old';
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'url_logs_old'
        and column_name = 'site_url'
    ) into has_site_url;

    execute format($bf$
      insert into public.app_url_activity (user_id, time_log_id, site_url, domain, title, browser, started_at, created_at)
      select user_id,
             time_log_id,
             %s,
             lower(domain),
             coalesce(title, ''),
             coalesce(browser, 'unknown'),
             coalesce("timestamp", now()),
             coalesce(created_at, now())
      from public.url_logs_old
      on conflict (user_id, site_url, started_at) where site_url is not null do nothing
    $bf$, case when has_site_url then 'coalesce(url, site_url)' else 'url' end);
  end if;
end$$;

-- 3) Helper for domain on legacy inserts (lowercased)
create or replace function public._extract_domain(u text)
returns text language sql immutable as $$
  select case
    when u is null or btrim(u)='' then null
    else lower(replace(split_part(split_part(u, '://', 2), '/', 1), 'www.', ''))
  end
$$;

-- 4) Legacy-compatible VIEW (same columns)
create or replace view public.url_logs as
select
  a.id,
  a.site_url as url,
  a.site_url as site_url,
  a.title,
  a.domain,
  a.browser,
  a.started_at as "timestamp",
  a.time_log_id,
  a.user_id,
  a.created_at
from public.app_url_activity a;

-- 5) Redirect legacy INSERTs into canonical table (validation + privacy flags)
create or replace function public.url_logs_view_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_url text := coalesce(nullif(new.url,''), nullif(new.site_url,''));
begin
  -- Defensive URL validation: drop obviously invalid/huge URLs
  if v_url is not null and length(v_url) > 2048 then
    raise exception 'url too long (max 2048 chars)';
  end if;

  insert into public.app_url_activity (
    org_id, user_id, device_id, time_log_id,
    site_url, domain, title, browser,
    started_at, created_at, privacy_flags
  )
  values (
    nullif(current_setting('app.current_org', true), '')::uuid,
    new.user_id,
    nullif(current_setting('app.current_device', true), '')::uuid,
    new.time_log_id,
    v_url,
    coalesce(lower(new.domain), public._extract_domain(v_url)),
    coalesce(new.title, ''),
    coalesce(new.browser, 'unknown'),
    coalesce(new."timestamp", now()),
    coalesce(new.created_at, now()),
    jsonb_build_object(
      'domainOnly', position('/' in coalesce(split_part(v_url, '://', 2), '')) = 0 or v_url is null,
      'redactQueryHash', position('?' in coalesce(v_url,'')) = 0 and position('#' in coalesce(v_url,'')) = 0
    )
  )
  on conflict (user_id, site_url, started_at) where site_url is not null do nothing
  returning id into new.id;

  return new;
end$$;

drop trigger if exists trg_url_logs_view_insert on public.url_logs;
create trigger trg_url_logs_view_insert
instead of insert on public.url_logs
for each row execute function public.url_logs_view_insert();

-- View hardening: block updates/deletes and set security barrier
create or replace function public.url_logs_view_ud_block()
returns trigger language plpgsql as $$
begin
  raise exception 'url_logs view is read/append-only';
end$$;

drop trigger if exists trg_url_logs_ud on public.url_logs;
create trigger trg_url_logs_ud
instead of update or delete on public.url_logs
for each row execute function public.url_logs_view_ud_block();

create or replace view public.url_logs
with (security_barrier = true) as
select
  a.id, a.site_url as url, a.site_url as site_url, a.title, a.domain,
  a.browser, a.started_at as "timestamp", a.time_log_id, a.user_id, a.created_at
from public.app_url_activity a;

-- RLS
alter table public.app_url_activity enable row level security;

drop policy if exists "select_own_url_activity" on public.app_url_activity;
create policy "select_own_url_activity" on public.app_url_activity
for select using (auth.uid() = user_id);

drop policy if exists "insert_own_url_activity" on public.app_url_activity;
create policy "insert_own_url_activity" on public.app_url_activity
for insert with check (auth.uid() = user_id);

-- Grants & function execute scope
grant select on public.url_logs to anon, authenticated;
grant insert on public.url_logs to authenticated;
grant select, insert on public.app_url_activity to authenticated;

revoke all on function public.url_logs_view_insert() from public;
grant execute on function public.url_logs_view_insert() to authenticated;

-- Performance at scale
create index if not exists idx_app_url_activity_recent
on public.app_url_activity(user_id, started_at desc)
;

analyze public.app_url_activity;

commit;


