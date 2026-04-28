-- Fix pg_net timeout for email-sending SQL functions
-- Default pg_net timeout is 5s; email-reports edge function needs ~15-30s
-- Both functions now use timeout_milliseconds = 45000

-- See send_email_reports_per_org and send_daily_hours_alert_per_org in
-- 20260311_fix_email_service_key_lookup.sql for the full function bodies.
-- This migration documents the live fix applied via Supabase MCP on 2026-03-14.
