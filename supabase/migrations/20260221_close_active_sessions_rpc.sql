-- RPC function for the desktop agent to force-close its own active sessions.
-- Uses SECURITY DEFINER to bypass RLS, which silently blocks the anon client's
-- direct UPDATE on time_logs (auth.uid() can be stale after reconnect).

CREATE OR REPLACE FUNCTION public.close_user_active_sessions(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  closed_count integer;
BEGIN
  -- Only allow closing your own sessions (defense-in-depth)
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.time_logs
  SET status = 'completed',
      end_time = COALESCE(end_time, NOW())
  WHERE user_id = p_user_id
    AND status = 'active';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid) TO authenticated;
