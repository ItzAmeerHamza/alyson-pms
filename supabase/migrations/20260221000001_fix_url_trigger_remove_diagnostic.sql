-- Fix url_logs_view_insert: remove reference to non-existent 'diagnostic' column
-- The diagnostic column was never added to app_url_activity table schema,
-- causing runtime errors when inserting through the url_logs view.

CREATE OR REPLACE FUNCTION public.url_logs_view_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_url text := coalesce(nullif(new.url,''), nullif(new.site_url,''));
BEGIN
  -- Close previous open slice for this user
  UPDATE public.app_url_activity a
     SET ended_at = greatest(coalesce(new."timestamp", now()), a.started_at)
   WHERE a.user_id = new.user_id
     AND a.ended_at IS NULL;

  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;
  IF length(v_url) > 2048 THEN
    RAISE EXCEPTION 'url too long (max 2048 chars)';
  END IF;

  INSERT INTO public.app_url_activity (
    organization_id, user_id, device_id, time_log_id,
    site_url, domain, title, browser,
    started_at, created_at, privacy_flags
  )
  VALUES (
    nullif(current_setting('app.current_org', true), '')::uuid,
    new.user_id,
    nullif(current_setting('app.current_device', true), '')::uuid,
    new.time_log_id,
    v_url,
    coalesce(lower(new.domain), public._extract_domain(v_url)),
    left(coalesce(new.title, ''), 512),
    coalesce(new.browser, 'unknown'),
    coalesce(new."timestamp", now()),
    coalesce(new.created_at, now()),
    CASE 
      WHEN new.privacy_flags IS NOT NULL THEN new.privacy_flags
      ELSE jsonb_build_object(
        'domainOnly', position('/' in coalesce(split_part(v_url, '://', 2), '')) = 0 or v_url is null,
        'redactQueryHash', position('?' in coalesce(v_url,'')) = 0 and position('#' in coalesce(v_url,'')) = 0
      )
    END
  )
  RETURNING id INTO new.id;

  RETURN new;
END$$;
