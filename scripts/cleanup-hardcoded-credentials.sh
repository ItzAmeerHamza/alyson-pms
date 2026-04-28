#!/bin/bash
set -e

echo "🔒 SECURITY CLEANUP: Removing hardcoded credentials from codebase..."

# Define the credentials to remove/replace
APPLE_ID="${APPLE_ID}"
APPLE_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD}"
GITHUB_TOKEN="${GITHUB_TOKEN}"
TEAM_ID="6GW49LK9V9"

echo "🔍 Searching for files with hardcoded credentials..."

# Find all files that might contain credentials (excluding this script)
FILES_TO_CHECK=$(find . -type f \( -name "*.sh" -o -name "*.md" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" \) \
  ! -path "./node_modules/*" \
  ! -path "./.git/*" \
  ! -path "./dist/*" \
  ! -path "./build/*" \
  ! -name "scripts/cleanup-hardcoded-credentials.sh")

echo "📝 Found $(echo "$FILES_TO_CHECK" | wc -l) files to check"

# Function to replace credentials in files
replace_credentials() {
    local file="$1"
    local changed=false
    
    # Check if file contains any of the credentials
    if grep -l "$APPLE_ID\|$APPLE_PASSWORD\|$GITHUB_TOKEN" "$file" >/dev/null 2>&1; then
        echo "🔧 Cleaning: $file"
        
        # Create backup
        cp "$file" "$file.backup"
        
        # Replace Apple credentials
        sed -i.tmp "s/$APPLE_ID/\${APPLE_ID}/g" "$file"
        sed -i.tmp "s/$APPLE_PASSWORD/\${APPLE_APP_SPECIFIC_PASSWORD}/g" "$file"
        sed -i.tmp "s/export APPLE_ID=\"[^\"]*\"/export APPLE_ID=\"\${APPLE_ID}\"/g" "$file"
        sed -i.tmp "s/export APPLE_APP_SPECIFIC_PASSWORD=\"[^\"]*\"/export APPLE_APP_SPECIFIC_PASSWORD=\"\${APPLE_APP_SPECIFIC_PASSWORD}\"/g" "$file"
        
        # Replace GitHub token
        sed -i.tmp "s/$GITHUB_TOKEN/\${GITHUB_TOKEN}/g" "$file"
        sed -i.tmp "s/export GITHUB_TOKEN=\"[^\"]*\"/export GITHUB_TOKEN=\"\${GITHUB_TOKEN}\"/g" "$file"
        
        # Remove temporary files
        rm -f "$file.tmp"
        
        changed=true
    fi
    
    if [ "$changed" = true ]; then
        echo "   ✅ Credentials removed from $file"
    fi
}

# Process each file
echo "$FILES_TO_CHECK" | while read -r file; do
    if [ -f "$file" ]; then
        replace_credentials "$file"
    fi
done

echo ""
echo "🔐 Creating secure environment template..."

# Create a secure environment template
cat > .env.template << 'EOF'
# 🔐 SECURE ENVIRONMENT VARIABLES
# Copy this to .env and fill in your actual values
# NEVER commit .env to version control!

# Apple Developer Account (for code signing)
APPLE_ID=your-apple-developer-email@example.com
APPLE_APP_SPECIFIC_PASSWORD=your-app-specific-password
APPLE_TEAM_ID=your-team-id

# GitHub Access (for releases)
GITHUB_TOKEN=your-github-personal-access-token

# Supabase Database
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Build Configuration
NODE_ENV=development
EOF

# Update .gitignore to ensure sensitive files are ignored
if ! grep -q "\.env$" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# Environment variables" >> .gitignore
    echo ".env" >> .gitignore
    echo ".env.local" >> .gitignore
    echo ".env.production" >> .gitignore
    echo "*.backup" >> .gitignore
fi

echo "✅ Environment template created: .env.template"
echo "✅ Updated .gitignore to exclude sensitive files"

echo ""
echo "🎯 NEXT STEPS:"
echo "1. Copy .env.template to .env and fill in your actual credentials"
echo "2. Set environment variables before running builds:"
echo "   export APPLE_ID=\"your-apple-id\""
echo "   export APPLE_APP_SPECIFIC_PASSWORD=\"your-password\""
echo "   export GITHUB_TOKEN=\"your-token\""
echo "3. Review and delete .backup files after verification"
echo ""
echo "⚠️  IMPORTANT: Never commit credentials to version control again!"
echo "✅ Credential cleanup completed!" 