#!/bin/bash
# Environment switching script

ENV=$1

if [ -z "$ENV" ]; then
    echo "Usage: ./scripts/switch-env.sh [development|production]"
    echo ""
    echo "Available environments:"
    echo "  development - Development environment"
    echo "  production  - Production environment"
    exit 1
fi

echo "🔄 Switching to $ENV environment..."

if [ "$ENV" = "development" ]; then
    cp .env.development .env
    echo "✅ Switched to DEVELOPMENT environment"
    echo "🌐 URL: https://time-flow-admin-git-development-m-afatah-hotmailcoms-projects.vercel.app"
    echo "📝 Deploy with: git push origin development"
    
elif [ "$ENV" = "production" ]; then
    cp .env.production .env
    [ -f backend/.env.production ] && cp backend/.env.production backend/.env
    [ -f desktop-agent/.env.production ] && cp desktop-agent/.env.production desktop-agent/.env
    echo "✅ Switched to PRODUCTION environment"
    echo "🌐 URL: https://worktime.ebdaadt.com"
    echo "📝 Deploy with: git push origin main"
    
else
    echo "❌ Invalid environment. Use 'development' or 'production'"
    exit 1
fi

echo ""
echo "📊 Current Settings:"
echo "  - Environment: $ENV"
echo "  - Supabase: $(grep VITE_SUPABASE_URL .env | cut -d'=' -f2)"
echo "  - App URL: $(grep VITE_APP_URL .env | cut -d'=' -f2)"
echo "  - Debug Mode: $(grep VITE_DEBUG_MODE .env | cut -d'=' -f2)" 