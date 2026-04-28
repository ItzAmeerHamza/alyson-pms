-- Multi-Device Sessions: Allow one active session per user PER DEVICE
-- instead of one active session per user globally.
-- This enables users to run the desktop agent on multiple devices simultaneously
-- without sessions fighting each other.

-- Step 1: Add device_id column to time_logs (nullable for backward compat)
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Step 2: Drop the existing one-active-session-per-user constraint
-- (handles both the old WHERE end_time IS NULL and newer WHERE status = 'active' variants)
DROP INDEX IF EXISTS idx_one_active_session_per_user;

-- Step 3: Create new constraint - one active session per user PER DEVICE
-- Uses COALESCE so old agents (device_id=NULL) still enforce single-session
CREATE UNIQUE INDEX idx_one_active_session_per_user_device
  ON public.time_logs (user_id, COALESCE(device_id, 'unknown'))
  WHERE status = 'active';

-- Step 4: Add index for device_id lookups
CREATE INDEX IF NOT EXISTS idx_time_logs_device_id
  ON public.time_logs (device_id)
  WHERE device_id IS NOT NULL;

-- Step 5: Update the close_user_active_sessions RPC to support optional device_id
-- When p_device_id is provided, only close sessions for that device.
-- When NULL, close ALL active sessions for the user (backward compat / admin use).
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
  closed_count integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_device_id IS NOT NULL THEN
    UPDATE public.time_logs
    SET status = 'completed',
        end_time = COALESCE(end_time, NOW())
    WHERE user_id = p_user_id
      AND status = 'active'
      AND device_id = p_device_id;
  ELSE
    UPDATE public.time_logs
    SET status = 'completed',
        end_time = COALESCE(end_time, NOW())
    WHERE user_id = p_user_id
      AND status = 'active';
  END IF;

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_user_active_sessions(uuid, text) TO service_role;

-- Step 6: Ensure get_user_role uses SECURITY DEFINER to avoid RLS recursion.
-- Without this, time_logs RLS -> get_user_role() -> users RLS -> get_user_role() -> infinite loop.
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT role FROM public.users WHERE id = uid;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT role FROM public.users WHERE id = auth.uid();
$function$;
