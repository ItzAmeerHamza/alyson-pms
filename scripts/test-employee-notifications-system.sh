#!/bin/bash

# Test Employee Notifications System
# This script tests the complete employee notifications workflow

echo "🔔 Testing Employee Notifications System"
echo "========================================"

# Supabase configuration
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_ANON_KEY="***KEY_REMOVED***"

echo "📊 Step 1: Check Edge Function Status..."
echo "Testing employee-notifications function..."

# Test the function endpoint
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/employee-status-change" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": "ping"}')

echo "Function response: $RESPONSE"
echo ""

echo "📊 Step 2: Check Database Schema..."
echo "Creating comprehensive database check SQL..."

cat > /tmp/comprehensive_employee_check.sql << 'EOF'
-- Comprehensive Employee Notifications System Check
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Check if triggers exist
SELECT 
    'Database Triggers' as check_type,
    COUNT(*) as trigger_count,
    CASE 
        WHEN COUNT(*) >= 2 THEN '✅ TRIGGERS EXIST'
        ELSE '❌ TRIGGERS MISSING'
    END as status
FROM information_schema.triggers 
WHERE trigger_name IN (
    'employee_status_change_notification',
    'new_employee_welcome_notification'
);

-- 2. Show trigger details
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement,
    '✅ ACTIVE' as status
FROM information_schema.triggers 
WHERE trigger_name IN (
    'employee_status_change_notification',
    'new_employee_welcome_notification'
)
ORDER BY trigger_name;

-- 3. Check if database functions exist
SELECT 
    'Database Functions' as check_type,
    COUNT(*) as function_count,
    CASE 
        WHEN COUNT(*) >= 2 THEN '✅ FUNCTIONS EXIST'
        ELSE '❌ FUNCTIONS MISSING'
    END as status
FROM information_schema.routines 
WHERE routine_name IN (
    'notify_employee_status_change',
    'notify_new_employee_welcome'
);

-- 4. Check notification_log table
SELECT 
    'Notification Log Table' as check_type,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_log') 
        THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status;

-- 5. Check recent notifications (if table exists)
SELECT 
    'Recent Notifications' as check_type,
    COUNT(*) as notification_count,
    MAX(created_at) as last_notification
FROM notification_log 
WHERE created_at >= NOW() - INTERVAL '30 days';

-- 6. Check users table structure
SELECT 
    'Users Table' as check_type,
    COUNT(*) as column_count,
    STRING_AGG(column_name, ', ') as columns
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('id', 'email', 'full_name', 'role', 'is_active', 'pause_reason');

-- 7. Check for any existing employee data
SELECT 
    'Employee Data' as check_type,
    COUNT(*) as employee_count,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active_employees,
    COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_employees
FROM users 
WHERE role = 'employee';

-- 8. Check cron jobs for employee notifications
SELECT 
    'Cron Jobs' as check_type,
    COUNT(*) as cron_count,
    STRING_AGG(jobname, ', ') as job_names
FROM cron.job 
WHERE command LIKE '%employee%' OR command LIKE '%notification%';
EOF

echo "📝 Comprehensive SQL created: /tmp/comprehensive_employee_check.sql"
echo ""

echo "📊 Step 3: Test Edge Function with Different Endpoints..."
echo "Testing various notification endpoints..."

# Test employee-status-change endpoint
echo "Testing employee-status-change endpoint..."
STATUS_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/employee-status-change" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "test", "employee_email": "test@example.com", "employee_name": "Test User", "old_status": "inactive", "new_status": "active", "change_type": "test", "changed_by": "System", "timestamp": "2025-01-20T10:00:00Z"}')

echo "Status change response: $STATUS_RESPONSE"
echo ""

# Test new-employee-welcome endpoint
echo "Testing new-employee-welcome endpoint..."
WELCOME_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/new-employee-welcome" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"employee_id": "test", "employee_email": "test@example.com", "employee_name": "Test User"}')

echo "Welcome response: $WELCOME_RESPONSE"
echo ""

echo "📊 Step 4: Check Function Logs..."
echo "Function logs (if accessible):"

# Try to get function logs
LOGS_RESPONSE=$(curl -s "$SUPABASE_URL/functions/v1/employee-notifications" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "Logs not accessible via REST API")

echo "Logs response: $LOGS_RESPONSE"
echo ""

echo "📊 Step 5: Manual Testing Instructions..."
echo "========================================"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run the SQL from: /tmp/comprehensive_employee_check.sql"
echo "3. Check the results for each section"
echo ""
echo "4. To test actual functionality:"
echo "   - Go to your admin panel (/admin/users)"
echo "   - Add a new test employee"
echo "   - Change an existing employee's status"
echo "   - Check if emails are sent to HR/Admin users"
echo "   - Check notification_log table for new entries"
echo ""

echo "🎯 Testing Complete!"
echo "==================="
echo "Run the SQL script to check database setup"
echo "Check the function responses above"
echo "Test with actual employee changes in your admin panel"
