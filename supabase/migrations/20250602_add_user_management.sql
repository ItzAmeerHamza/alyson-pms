-- Add user management features
-- This adds the ability to pause/activate employees and manage their status

-- Add is_active column to users table if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add pause/resume related columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES public.users(id);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Add last_activity column to track when user was last seen
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ DEFAULT NOW();

-- Create an index for performance on is_active lookups
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON public.users(role, is_active);

-- Update existing users to be active by default
UPDATE public.users SET is_active = true WHERE is_active IS NULL;

-- Create a function to pause/unpause users with logging
CREATE OR REPLACE FUNCTION pause_user(
  target_user_id UUID,
  admin_user_id UUID,
  reason TEXT DEFAULT 'Administrative action'
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the admin has permission (is admin or manager)
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = admin_user_id 
    AND role IN ('admin', 'manager')
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to pause user';
  END IF;

  -- Update the user status
  UPDATE public.users 
  SET 
    is_active = false,
    paused_at = NOW(),
    paused_by = admin_user_id,
    pause_reason = reason
  WHERE id = target_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to unpause users
CREATE OR REPLACE FUNCTION unpause_user(
  target_user_id UUID,
  admin_user_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = admin_user_id 
    AND role IN ('admin', 'manager')
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to unpause user';
  END IF;

  -- Update the user status
  UPDATE public.users 
  SET 
    is_active = true,
    paused_at = NULL,
    paused_by = NULL,
    pause_reason = NULL,
    last_activity = NOW()
  WHERE id = target_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a view for active employees only
CREATE OR REPLACE VIEW active_employees AS
SELECT 
  id,
  email,
  full_name,
  role,
  last_activity,
  created_at
FROM public.users 
WHERE role = 'employee' AND is_active = true;

-- Create a view for inactive/paused employees
CREATE OR REPLACE VIEW inactive_employees AS
SELECT 
  id,
  email,
  full_name,
  role,
  paused_at,
  paused_by,
  pause_reason,
  (SELECT full_name FROM public.users WHERE id = paused_by) as paused_by_name,
  created_at
FROM public.users 
WHERE role = 'employee' AND is_active = false;

-- Add RLS policies for the new functions
CREATE POLICY "Allow admin to manage user status" ON public.users
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.users caller 
    WHERE caller.id = auth.uid() 
    AND caller.role IN ('admin', 'manager')
    AND caller.is_active = true
  )
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION pause_user TO authenticated;
GRANT EXECUTE ON FUNCTION unpause_user TO authenticated;
GRANT SELECT ON active_employees TO authenticated;
GRANT SELECT ON inactive_employees TO authenticated;

-- Insert some comment for tracking
COMMENT ON COLUMN public.users.is_active IS 'Whether the user account is active and can be used';
COMMENT ON COLUMN public.users.paused_at IS 'When the user was paused/deactivated';
COMMENT ON COLUMN public.users.paused_by IS 'Admin user who paused this account';
COMMENT ON COLUMN public.users.pause_reason IS 'Reason for pausing the account';
COMMENT ON COLUMN public.users.last_activity IS 'Last time user was active in the system'; 