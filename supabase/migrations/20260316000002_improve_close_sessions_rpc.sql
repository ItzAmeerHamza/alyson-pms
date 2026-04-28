-- Improve close_user_active_sessions RPC to use last screenshot time
-- instead of NOW() for end_time, preventing inflated hours when called
-- long after the session actually ended (e.g., agent restart days later).
--
-- Safety: only closes sessions with end_time IS NULL (idempotent).
-- Hard guarantee: end_time >= start_time (enforced by CHECK constraint too).

CREATE OR REPLACE FUNCTION public.close_user_active_sessions(
  p_user_id uuid,
  p_device_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  closed_count integer := 0;
  v_rec record;
  v_last_screenshot timestamptz;
  v_end_time timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    SELECT id, start_time
    FROM public.time_logs
    WHERE user_id = p_user_id
      AND end_time IS NULL
      AND status = 'active'
      AND (p_device_id IS NULL OR device_id = p_device_id)
  LOOP
    v_last_screenshot := NULL;

    -- Find last screenshot scoped to THIS session's time_log_id
    SELECT MAX(captured_at) INTO v_last_screenshot
    FROM public.screenshots
    WHERE user_id = p_user_id
      AND time_log_id = v_rec.id;

    -- Fallback: screenshots in THIS session's time window only
    IF v_last_screenshot IS NULL THEN
      SELECT MAX(captured_at) INTO v_last_screenshot
      FROM public.screenshots
      WHERE user_id = p_user_id
        AND captured_at >= v_rec.start_time
        AND captured_at <= NOW();
    END IF;

    -- Session started less than 5 min ago: use NOW()
    IF v_rec.start_time > NOW() - interval '5 minutes' THEN
      v_end_time := NOW();
    ELSIF v_last_screenshot IS NOT NULL AND v_last_screenshot >= v_rec.start_time THEN
      v_end_time := LEAST(
        v_last_screenshot + interval '5 minutes',
        v_rec.start_time + interval '10 hours'
      );
    ELSE
      v_end_time := v_rec.start_time + interval '1 hour';
    END IF;

    -- Hard guarantee: end_time must never be before start_time
    IF v_end_time < v_rec.start_time THEN
      v_end_time := v_rec.start_time + interval '1 hour';
    END IF;

    UPDATE public.time_logs
    SET end_time = v_end_time,
        status = 'completed'
    WHERE id = v_rec.id
      AND end_time IS NULL;

    closed_count := closed_count + 1;
  END LOOP;

  RETURN closed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO service_role;
