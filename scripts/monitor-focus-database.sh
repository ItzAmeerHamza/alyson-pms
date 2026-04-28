#!/bin/bash

# Script to monitor focus_percent values in database

echo "🔍 Monitoring Focus Percent in Database..."
echo ""

# Get the current user ID (you may need to adjust this)
USER_ID=$(cat ~/.timeflow/session.json 2>/dev/null | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$USER_ID" ]; then
    echo "⚠️  Could not determine user ID from session"
    echo "Using default test user ID..."
    USER_ID="3b885e23-ec6d-4b10-bcfc-15c53dbbb124"
fi

echo "User ID: $USER_ID"
echo ""

# Supabase connection details
SUPABASE_URL="https://fkpiqcxkmrtaetvfgcli.supabase.co"
SUPABASE_ANON_KEY="***KEY_REMOVED***"

# Function to check latest screenshots
check_screenshots() {
    curl -s -X GET \
        "${SUPABASE_URL}/rest/v1/screenshots?select=id,captured_at,activity_percent,focus_percent,mouse_clicks,keystrokes,mouse_movements&user_id=eq.${USER_ID}&order=captured_at.desc&limit=5" \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" | jq -r '.[] | select(type == "object") | "[\(.captured_at | split("T")[1] | split(".")[0])] Activity: \(.activity_percent)% | Focus: \(.focus_percent // "null")% | Clicks: \(.mouse_clicks) | Keys: \(.keystrokes) | Moves: \(.mouse_movements)"' 2>/dev/null || echo "Error parsing response"
}

# Initial check
echo "📊 Current screenshot data:"
echo "-------------------------------------------"
check_screenshots
echo "-------------------------------------------"
echo ""

# Monitor for new screenshots
echo "Monitoring for new screenshots (press Ctrl+C to stop)..."
echo ""

LAST_CHECK=""
while true; do
    CURRENT_CHECK=$(check_screenshots | head -1)
    
    if [ "$CURRENT_CHECK" != "$LAST_CHECK" ] && [ ! -z "$CURRENT_CHECK" ]; then
        echo "🆕 New screenshot detected:"
        echo "$CURRENT_CHECK"
        
        # Check if focus is non-null and non-zero
        if echo "$CURRENT_CHECK" | grep -q "Focus: [1-9][0-9]*%"; then
            echo "✅ Focus calculation is working! (non-zero value)"
        elif echo "$CURRENT_CHECK" | grep -q "Focus: 0%"; then
            echo "⚠️  Focus is still 0%"
        elif echo "$CURRENT_CHECK" | grep -q "Focus: null%"; then
            echo "❌ Focus is null (not calculated)"
        fi
        echo ""
        
        LAST_CHECK="$CURRENT_CHECK"
    fi
    
    sleep 10
done
