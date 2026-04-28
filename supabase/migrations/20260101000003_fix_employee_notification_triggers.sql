-- ============================================================================
-- FIX EMPLOYEE NOTIFICATION TRIGGERS
-- ============================================================================
-- This migration fixes the employee notification triggers that use session-scoped
-- settings (current_setting) which don't persist in trigger context.
--
-- Solution: Instead of making HTTP calls directly from triggers, we:
-- 1. Queue notifications to notification_log with status 'queued'
-- 2. A scheduled cron job processes the queue and sends notifications

-- ============================================================================
-- STEP 1: Replace employee status change trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_employee_status_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type TEXT;
  old_active BOOLEAN;
  new_active BOOLEAN;
  changed_by_name TEXT;
  notification_payload JSONB;
BEGIN
  -- Determine old and new status
  old_active := COALESCE(OLD.is_active, true);
  new_active := COALESCE(NEW.is_active, true);
  
  -- Skip if no status change
  IF old_active = new_active THEN
    RETURN NEW;
  END IF;
  
  -- Only process for employees
  IF NEW.role != 'employee' THEN
    RETURN NEW;
  END IF;
  
  -- Determine change type
  IF TG_OP = 'INSERT' AND new_active = true THEN
    change_type := 'joined';
  ELSIF old_active = false AND new_active = true THEN
    change_type := 'activated';
  ELSIF old_active = true AND new_active = false THEN
    change_type := 'deactivated';
  ELSE
    RETURN NEW; -- No relevant change
  END IF;
  
  -- Get the name of who made the change (from auth context or system)
  SELECT COALESCE(u.full_name, u.email, 'System')
  INTO changed_by_name
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;
  
  IF changed_by_name IS NULL THEN
    changed_by_name := 'System';
  END IF;
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', NEW.id,
    'employee_email', NEW.email,
    'employee_name', COALESCE(NEW.full_name, NEW.email),
    'old_status', CASE WHEN old_active THEN 'active' ELSE 'inactive' END,
    'new_status', CASE WHEN new_active THEN 'active' ELSE 'inactive' END,
    'change_type', change_type,
    'changed_by', changed_by_name,
    'reason', COALESCE(NEW.pause_reason, 'Status change'),
    'timestamp', NOW()::text,
    'endpoint', 'employee-status-change'
  );
  
  -- Queue notification instead of making HTTP call directly
  -- This avoids the session-scoped setting issue
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'employee_status_change',
    'hr_admin',
    NEW.id,
    notification_payload,
    'queued',  -- Changed from 'sent' to 'queued'
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 2: Replace new employee welcome trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_new_employee_welcome()
RETURNS TRIGGER AS $$
DECLARE
  notification_payload JSONB;
BEGIN
  -- Only process for new employees
  IF NEW.role != 'employee' THEN
    RETURN NEW;
  END IF;
  
  -- Only send welcome for new active employees
  IF NOT COALESCE(NEW.is_active, true) THEN
    RETURN NEW;
  END IF;
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', NEW.id,
    'employee_email', NEW.email,
    'employee_name', COALESCE(NEW.full_name, NEW.email),
    'endpoint', 'new-employee-welcome'
  );
  
  -- Queue notification instead of making HTTP call directly
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'new_employee_welcome',
    'hr_admin',
    NEW.id,
    notification_payload,
    'queued',  -- Changed from 'sent' to 'queued'
    NOW()
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Replace manual trigger function (also queue-based now)
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_employee_notification(
  employee_id UUID,
  change_type TEXT DEFAULT 'joined'
) RETURNS BOOLEAN AS $$
DECLARE
  employee_record RECORD;
  notification_payload JSONB;
  admin_name TEXT;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to trigger notifications';
  END IF;
  
  -- Get employee details
  SELECT * INTO employee_record
  FROM public.users
  WHERE id = employee_id AND role = 'employee';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  
  -- Get admin name
  SELECT COALESCE(full_name, email) INTO admin_name
  FROM public.users
  WHERE id = auth.uid();
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'employee_id', employee_record.id,
    'employee_email', employee_record.email,
    'employee_name', COALESCE(employee_record.full_name, employee_record.email),
    'old_status', 'inactive',
    'new_status', 'active',
    'change_type', change_type,
    'changed_by', admin_name,
    'reason', 'Manual notification trigger',
    'timestamp', NOW()::text,
    'endpoint', 'employee-status-change'
  );
  
  -- Queue notification
  INSERT INTO public.notification_log (
    notification_type,
    recipient_type,
    recipient_id,
    payload,
    status,
    created_at
  ) VALUES (
    'manual_employee_notification',
    'hr_admin',
    employee_id,
    notification_payload,
    'queued',
    NOW()
  );
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: Create notification processor function (called by cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_notification_queue(batch_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    processed_count INTEGER,
    failed_count INTEGER
) AS $$
DECLARE
    v_processed INTEGER := 0;
    v_failed INTEGER := 0;
    v_notification RECORD;
    v_supabase_url TEXT := 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
    v_service_key TEXT;
    v_endpoint TEXT;
BEGIN
    -- Get service role key from vault (if available) or use hardcoded
    -- Note: In production, store this in Supabase Vault
    v_service_key := '***KEY_REMOVED***';

    -- Process queued notifications
    FOR v_notification IN
        SELECT id, notification_type, payload
        FROM public.notification_log
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT batch_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            -- Determine endpoint from payload or notification type
            v_endpoint := COALESCE(
                v_notification.payload->>'endpoint',
                CASE v_notification.notification_type
                    WHEN 'employee_status_change' THEN 'employee-status-change'
                    WHEN 'new_employee_welcome' THEN 'new-employee-welcome'
                    WHEN 'manual_employee_notification' THEN 'employee-status-change'
                    ELSE 'employee-status-change'
                END
            );

            -- Send notification via HTTP
            PERFORM net.http_post(
                url := v_supabase_url || '/functions/v1/employee-notifications/' || v_endpoint,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_service_key
                ),
                body := v_notification.payload
            );

            -- Mark as sent
            UPDATE public.notification_log
            SET 
                status = 'sent',
                sent_at = NOW(),
                updated_at = NOW()
            WHERE id = v_notification.id;

            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Mark as failed with error message
            UPDATE public.notification_log
            SET 
                status = 'failed',
                error_message = SQLERRM,
                updated_at = NOW()
            WHERE id = v_notification.id;

            v_failed := v_failed + 1;
        END;
    END LOOP;

    RETURN QUERY SELECT v_processed, v_failed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION process_notification_queue TO service_role;

-- ============================================================================
-- STEP 5: Create wrapper function for cron
-- ============================================================================

CREATE OR REPLACE FUNCTION run_notification_processor()
RETURNS VOID AS $$
DECLARE
    v_result RECORD;
BEGIN
    SELECT * INTO v_result FROM process_notification_queue(50);
    
    -- Log results if any notifications were processed
    IF v_result.processed_count > 0 OR v_result.failed_count > 0 THEN
        INSERT INTO public.system_logs (log_type, message, metadata, created_at)
        VALUES (
            'notification_processor',
            format('Processed %s notifications, %s failed', v_result.processed_count, v_result.failed_count),
            jsonb_build_object(
                'processed', v_result.processed_count,
                'failed', v_result.failed_count
            ),
            NOW()
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_logs (log_type, message, metadata, created_at)
    VALUES (
        'notification_processor_error',
        SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE),
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION run_notification_processor TO service_role;

-- ============================================================================
-- STEP 6: Schedule cron job for notification processing
-- ============================================================================

-- Remove any existing notification cron jobs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-processor') THEN
        PERFORM cron.unschedule('notification-processor');
    END IF;
END $$;

-- Schedule notification processor to run every 5 minutes
SELECT cron.schedule(
    'notification-processor',
    '*/5 * * * *',
    'SELECT public.run_notification_processor();'
);

-- ============================================================================
-- STEP 7: Update notification_log to support queue status
-- ============================================================================

-- Add 'queued' to status check constraint if not already present
DO $$
BEGIN
    -- Drop old constraint and recreate with 'queued' status
    ALTER TABLE public.notification_log 
    DROP CONSTRAINT IF EXISTS notification_log_status_check;
    
    ALTER TABLE public.notification_log
    ADD CONSTRAINT notification_log_status_check 
    CHECK (status IN ('pending', 'queued', 'sent', 'failed', 'retry'));
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint update skipped: %', SQLERRM;
END $$;

-- Add index for queued notifications
CREATE INDEX IF NOT EXISTS idx_notification_log_queued 
ON public.notification_log(created_at) 
WHERE status = 'queued';

-- ============================================================================
-- STEP 8: Log the migration
-- ============================================================================

INSERT INTO public.system_logs (log_type, message, metadata, created_at)
VALUES (
    'migration_complete',
    'Fixed employee notification triggers to use queue-based approach',
    jsonb_build_object(
        'migration', '20260101_fix_employee_notification_triggers',
        'changes', ARRAY[
            'Replaced HTTP calls in triggers with queue inserts',
            'Created process_notification_queue function',
            'Scheduled notification-processor cron job',
            'Added queued status to notification_log'
        ]
    ),
    NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 9: Process any existing queued notifications
-- ============================================================================

-- Update any stuck 'pending' notifications to 'queued' so they get processed
UPDATE public.notification_log
SET status = 'queued'
WHERE status = 'pending'
  AND created_at > NOW() - INTERVAL '7 days';




