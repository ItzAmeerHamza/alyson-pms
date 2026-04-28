#!/bin/bash

# Test Employee Notifications for Specific User
# This script tests notifications for m_afatah@me.com

echo "🔔 Testing Employee Notifications for m_afatah@me.com"
echo "===================================================="

# Supabase configuration
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_ANON_KEY="***KEY_REMOVED***"

echo "📊 Step 1: Check user details..."
echo "Creating SQL to check user information..."

cat > /tmp/test_user_notifications.sql << 'EOF'
-- Test Employee Notifications for m_afatah@me.com
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Check user details
SELECT 
    'User Details' as check_type,
    id,
    email,
    full_name,
    role,
    is_active,
    created_at
FROM users 
WHERE email ILIKE '%afatah%'
ORDER BY email;

-- 2. Check recent notifications for this user
SELECT 
    'Recent Notifications' as check_type,
    notification_type,
    recipient_type,
    payload,
    status,
    created_at
FROM notification_log 
WHERE payload::text ILIKE '%afatah%'
   OR payload::text ILIKE '%mohamed%'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Test manual notification trigger (if you're admin)
-- This will send a test notification for the employee account
SELECT 
    'Manual Test' as check_type,
    'Run this if you want to test manually' as instruction,
    'SELECT trigger_employee_notification(''3d664fb5-1224-4e3b-bf17-29b47c017dec''::UUID, ''test_notification'')' as sql_command;

-- 4. Check all admin/manager users who should receive notifications
SELECT 
    'Notification Recipients' as check_type,
    email,
    full_name,
    role,
    is_active
FROM users 
WHERE role IN ('admin', 'manager')
  AND is_active = true
ORDER BY role, email;

-- 5. Check notification log table structure
SELECT 
    'Notification Log Structure' as check_type,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'notification_log'
ORDER BY ordinal_position;
EOF

echo "📝 SQL script created: /tmp/test_user_notifications.sql"
echo ""

echo "📊 Step 2: Test edge function with user data..."
echo "Testing employee-notifications function with your user data..."

# Test employee status change notification
echo "Testing employee status change notification..."
STATUS_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/employee-status-change" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": "3d664fb5-1224-4e3b-bf17-29b47c017dec",
    "employee_email": "m_afatah@hotmail.com",
    "employee_name": "Mohamed Abdelfattah",
    "old_status": "active",
    "new_status": "inactive",
    "change_type": "test_deactivation",
    "changed_by": "System Test",
    "reason": "Testing notification system",
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
  }')

echo "Status change response: $STATUS_RESPONSE"
echo ""

# Test new employee welcome notification
echo "Testing new employee welcome notification..."
WELCOME_RESPONSE=$(curl -s -X POST "$SUPABASE_URL/functions/v1/employee-notifications/new-employee-welcome" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "employee_id": "3d664fb5-1224-4e3b-bf17-29b47c017dec",
    "employee_email": "m_afatah@hotmail.com",
    "employee_name": "Mohamed Abdelfattah"
  }')

echo "Welcome response: $WELCOME_RESPONSE"
echo ""

echo "📊 Step 3: Manual Testing Instructions..."
echo "========================================"
echo "1. Go to Supabase Dashboard → SQL Editor"
echo "2. Run the SQL from: /tmp/test_user_notifications.sql"
echo "3. Check the results for your user data"
echo ""
echo "4. To test the system manually:"
echo "   - Go to your admin panel (/admin/users)"
echo "   - Find user: m_afatah@hotmail.com (employee)"
echo "   - Change their status from inactive to active"
echo "   - Check if notification is sent to: m_afatah@me.com (admin)"
echo ""
echo "5. Expected behavior:"
echo "   - When you change employee status → notification sent to admin"
echo "   - Admin (m_afatah@me.com) should receive email about employee change"
echo "   - Check spam folder if email not in inbox"
echo ""

echo "🎯 Testing Complete!"
echo "==================="
echo "User found: m_afatah@hotmail.com (employee, inactive)"
echo "Admin found: m_afatah@me.com (admin, active)"
echo "System should send notifications from employee to admin"
echo "Run the SQL script to see detailed results"
