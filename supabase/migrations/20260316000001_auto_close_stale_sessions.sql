-- Auto-close stale tracking sessions via pg_cron
-- Safety net for when the desktop agent crashes, is force-quit, or PC shuts down
-- without properly closing the time_log (end_time stays NULL).
--
-- Runs every 15 minutes. Closes sessions that are:
--   1. Active for 10+ hours (absolute max workday), OR
--   2. Active for 30+ minutes with no screenshot in the last 30 minutes (agent is dead)
--
-- Uses last screenshot time to set a fair end_time (not NOW() which inflates hours).

-- Step 1: Create the auto-close function
CREATE OR REPLACE FUNCTION public.auto_close_stale_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_closed_count integer := 0;
  v_no_screenshot_count integer := 0;
  v_max_duration_count integer := 0;
  v_rec record;
  v_last_screenshot timestamptz;
  v_end_time timestamptz;
BEGIN
  -- Loop through all active sessions (end_time IS NULL)
  FOR v_rec IN
    SELECT id, user_id, start_time, device_id
    FROM public.time_logs
    WHERE end_time IS NULL
      AND status = 'active'
    ORDER BY start_time ASC
  LOOP
    -- Find last screenshot scoped to THIS session
    SELECT MAX(captured_at) INTO v_last_screenshot
    FROM public.screenshots
    WHERE user_id = v_rec.user_id
      AND time_log_id = v_rec.id;

    -- Fallback: screenshots in this session's window only
    IF v_last_screenshot IS NULL THEN
      SELECT MAX(captured_at) INTO v_last_screenshot
      FROM public.screenshots
      WHERE user_id = v_rec.user_id
        AND captured_at >= v_rec.start_time
        AND captured_at <= NOW();
    END IF;

    -- Rule 1: Absolute max duration (10 hours)
    IF v_rec.start_time < NOW() - interval '10 hours' THEN
      IF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
        v_end_time := LEAST(
          v_last_screenshot + interval '5 minutes',
          v_rec.start_time + interval '10 hours'
        );
      ELSE
        v_end_time := v_rec.start_time + interval '1 hour';
      END IF;

      -- Hard guarantee
      IF v_end_time < v_rec.start_time THEN
        v_end_time := v_rec.start_time + interval '1 hour';
      END IF;

      UPDATE public.time_logs
      SET end_time = v_end_time,
          status = 'auto_closed'
      WHERE id = v_rec.id
        AND end_time IS NULL;

      v_max_duration_count := v_max_duration_count + 1;
      v_closed_count := v_closed_count + 1;
      CONTINUE;
    END IF;

    -- Rule 2: No screenshot in last 30 minutes (agent likely dead)
    -- Only applies if session has been running for at least 30 minutes
    IF v_rec.start_time < NOW() - interval '30 minutes' THEN
      IF v_last_screenshot IS NULL
         OR v_last_screenshot < NOW() - interval '30 minutes' THEN
        
        IF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
          v_end_time := v_last_screenshot + interval '5 minutes';
        ELSE
          v_end_time := v_rec.start_time + interval '30 minutes';
        END IF;

        -- Hard guarantee
        IF v_end_time < v_rec.start_time THEN
          v_end_time := v_rec.start_time + interval '30 minutes';
        END IF;

        UPDATE public.time_logs
        SET end_time = v_end_time,
            status = 'auto_closed'
        WHERE id = v_rec.id
          AND end_time IS NULL;

        v_no_screenshot_count := v_no_screenshot_count + 1;
        v_closed_count := v_closed_count + 1;
        CONTINUE;
      END IF;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'closed_total', v_closed_count,
    'max_duration', v_max_duration_count,
    'no_screenshot', v_no_screenshot_count,
    'run_at', NOW()
  );
END;
$$;

-- Step 2: Schedule via pg_cron (every 15 minutes)
-- Unschedule first to make migration idempotent
SELECT cron.unschedule('auto-close-stale-sessions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-close-stale-sessions'
);

SELECT cron.schedule(
  'auto-close-stale-sessions',
  '*/15 * * * *',
  $$SELECT public.auto_close_stale_sessions()$$
);

-- Step 3: Grant execute to service_role (pg_cron runs as superuser, but grant for manual testing)
GRANT EXECUTE ON FUNCTION public.auto_close_stale_sessions() TO service_role;
