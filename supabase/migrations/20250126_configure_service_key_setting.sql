-- Configure service role key setting for cron jobs
-- This migration sets up the database configuration for secure service role key usage

-- Create a function to set the service role key (to be called after rotating keys)
CREATE OR REPLACE FUNCTION public.configure_service_role_key(new_service_key TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Set the service role key in PostgreSQL configuration
    PERFORM set_config('app.supabase_service_role_key', new_service_key, false);
    
    -- Log the configuration change (without exposing the key)
    INSERT INTO public.system_logs (log_type, message, metadata) 
    VALUES (
        'security_config',
        'Service role key configuration updated',
        jsonb_build_object(
            'timestamp', NOW(),
            'key_length', length(new_service_key),
            'configured_by', 'migration'
        )
    );
    
    RETURN 'Service role key configured successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to postgres role
GRANT EXECUTE ON FUNCTION public.configure_service_role_key TO postgres;

-- Add comment for documentation
COMMENT ON FUNCTION public.configure_service_role_key IS 'Securely configure service role key for cron job authentication';

-- Instructions for manual setup (to be run after key rotation)
INSERT INTO public.system_logs (log_type, message, metadata) 
VALUES (
    'setup_instructions',
    'Service role key configuration ready',
    jsonb_build_object(
        'instructions', 'After rotating service role key, run: SELECT public.configure_service_role_key(''NEW_SERVICE_ROLE_KEY'');',
        'security_note', 'Never commit service role keys to version control',
        'migration_file', '20250126_configure_service_key_setting.sql'
    )
);
