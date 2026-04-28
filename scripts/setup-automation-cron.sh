#!/bin/bash

# TimeFlow Email Reports Automation Setup
# This script sets up a cron job to automatically process email triggers every 15 minutes

echo "🚀 Setting up TimeFlow Email Reports Automation..."

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TRIGGER_SCRIPT="$PROJECT_DIR/scripts/trigger-email-reports.cjs"

echo "📁 Project directory: $PROJECT_DIR"
echo "📄 Trigger script: $TRIGGER_SCRIPT"

# Check if the trigger script exists
if [ ! -f "$TRIGGER_SCRIPT" ]; then
    echo "❌ Error: trigger-email-reports.cjs not found at $TRIGGER_SCRIPT"
    exit 1
fi

# Create the cron job entry
CRON_JOB="*/15 * * * * cd $PROJECT_DIR && node scripts/trigger-email-reports.cjs >> /var/log/timeflow-email-automation.log 2>&1"

echo "📝 Cron job to add:"
echo "$CRON_JOB"
echo ""

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "trigger-email-reports.cjs"; then
    echo "⚠️  Cron job already exists. Updating..."
    # Remove existing job and add new one
    (crontab -l 2>/dev/null | grep -v "trigger-email-reports.cjs"; echo "$CRON_JOB") | crontab -
else
    echo "➕ Adding new cron job..."
    # Add new job to existing crontab
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
fi

# Verify the cron job was added
if crontab -l | grep -q "trigger-email-reports.cjs"; then
    echo "✅ Cron job successfully added!"
    echo ""
    echo "📋 Current crontab:"
    crontab -l | grep "trigger-email-reports.cjs"
    echo ""
    echo "📊 The email reports processor will now run every 15 minutes automatically."
    echo "📝 Logs will be written to: /var/log/timeflow-email-automation.log"
    echo ""
    echo "🔧 To check logs: tail -f /var/log/timeflow-email-automation.log"
    echo "🗑️  To remove: crontab -e (then delete the trigger-email-reports.cjs line)"
else
    echo "❌ Failed to add cron job. You may need to add it manually:"
    echo "   Run: crontab -e"
    echo "   Add: $CRON_JOB"
fi

echo ""
echo "🎉 Setup complete! Your email reports will now be processed automatically." 