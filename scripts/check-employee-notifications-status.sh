#!/bin/bash

# Check Employee Notifications Status
# This script checks if the employee-notifications system is working

echo "🔔 Checking Employee Notifications Status"
echo "========================================"

# Supabase configuration
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_ANON_KEY="***KEY_REMOVED***"

echo "📊 Step 1: Check if function is responding..."
echo "Testing employee-notifications function..."

# Test the function endpoint
RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/employee-status-change" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": "ping"}')

echo "Response: $RESPONSE"
echo ""

echo "📊 Step 2: Create SQL to check database triggers..."
echo "Creating verification SQL..."

cat > /tmp/check_employee_notifications.sql << 'EOF'
-- Check Employee Notifications System Status
-- Run this in Supabase Dashboard → SQL Editor

-- Check if triggers exist
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

-- Show trigger details
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

-- Check if functions exist
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

-- Check notification_log table
SELECT 
    'Notification Log Table' as check_type,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_log') 
        THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status;

-- Check recent notifications (if table exists)
SELECT 
    'Recent Notifications' as check_type,
    COUNT(*) as notification_count,
    MAX(created_at) as last_notification
FROM notification_log 
WHERE created_at >= NOW() - INTERVAL '30 days';
EOF

echo "📝 SQL script created: /tmp/check_employee_notifications.sql"
echo ""

echo "📊 Step 3: Check if function is deployed..."
echo "Function deployment status:"

# Check function deployment
FUNCTION_STATUS=$(curl -s "$SUPABASE_URL/functions/v1/employee-notifications" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "Function not responding")

echo "Function response: $FUNCTION_STATUS"
echo ""

echo "📊 Step 4: Manual verification steps..."
echo "======================================"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run the SQL from: /tmp/check_employee_notifications.sql"
echo "3. Check if triggers and functions exist"
echo "4. Verify notification_log table exists"
echo "5. Check for recent notification activity"
echo ""

echo "📊 Step 5: Test the system..."
echo "=============================="
echo "To test if notifications work:"
echo "1. Add a new employee in your admin panel"
echo "2. Change an employee's status (active/inactive)"
echo "3. Check if emails are sent to HR/Admin users"
echo "4. Check notification_log table for entries"
echo ""

echo "🎯 Analysis Complete!"
echo "====================="
echo "Run the SQL script to check database setup"
echo "Test with actual employee changes to verify functionality"
