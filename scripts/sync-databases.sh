#!/bin/bash
# Database synchronization script between Production and Development

ACTION=$1
SOURCE=${2:-production}
TARGET=${3:-development}

if [ -z "$ACTION" ]; then
    echo "Usage: ./scripts/sync-databases.sh [action] [source] [target]"
    echo ""
    echo "Actions:"
    echo "  schema      - Sync schema from source to target"
    echo "  data        - Sync data from source to target"
    echo "  full        - Sync both schema and data"
    echo "  backup      - Create backup of target before sync"
    echo "  status      - Show database status"
    echo ""
    echo "Examples:"
    echo "  ./scripts/sync-databases.sh schema production development"
    echo "  ./scripts/sync-databases.sh data production development"
    echo "  ./scripts/sync-databases.sh full production development"
    echo "  ./scripts/sync-databases.sh backup development"
    echo "  ./scripts/sync-databases.sh status"
    exit 1
fi

# Database project IDs
PROD_PROJECT_ID="fkpiqcxkmrtaetvfgcli"
DEV_PROJECT_ID="clypxuffvpqgmczbsblj"

# Set source and target project IDs
if [ "$SOURCE" = "production" ]; then
    SOURCE_PROJECT_ID=$PROD_PROJECT_ID
    SOURCE_NAME="Production"
else
    SOURCE_PROJECT_ID=$DEV_PROJECT_ID
    SOURCE_NAME="Development"
fi

if [ "$TARGET" = "development" ]; then
    TARGET_PROJECT_ID=$DEV_PROJECT_ID
    TARGET_NAME="Development"
else
    TARGET_PROJECT_ID=$PROD_PROJECT_ID
    TARGET_NAME="Production"
fi

case $ACTION in
    "schema")
        echo "🔄 Syncing schema: $SOURCE_NAME → $TARGET_NAME"
        echo "=================================="
        
        # Export schema from source
        echo "📤 Exporting schema from $SOURCE_NAME..."
        timestamp=$(date +%Y%m%d_%H%M%S)
        supabase db dump --project-ref=$SOURCE_PROJECT_ID --schema-only > "schema-export-${timestamp}.sql"
        
        # Apply to target
        echo "📥 Applying schema to $TARGET_NAME..."
        psql -h db.$TARGET_PROJECT_ID.supabase.co -U postgres -d postgres -f "schema-export-${timestamp}.sql"
        
        # Cleanup
        rm -f "schema-export-${timestamp}.sql"
        echo "✅ Schema sync completed!"
        ;;
        
    "data")
        echo "🔄 Syncing data: $SOURCE_NAME → $TARGET_NAME"
        echo "=================================="
        
        # Create backup first
        echo "💾 Creating backup of $TARGET_NAME..."
        timestamp=$(date +%Y%m%d_%H%M%S)
        supabase db dump --project-ref=$TARGET_PROJECT_ID > "backup-${TARGET,,}-${timestamp}.sql"
        
        # Export data from source
        echo "📤 Exporting data from $SOURCE_NAME..."
        supabase db dump --project-ref=$SOURCE_PROJECT_ID --data-only > "data-export-${timestamp}.sql"
        
        # Confirm sync
        read -p "⚠️  Apply $SOURCE_NAME data to $TARGET_NAME? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "📥 Applying data to $TARGET_NAME..."
            psql -h db.$TARGET_PROJECT_ID.supabase.co -U postgres -d postgres -f "data-export-${timestamp}.sql"
            echo "✅ Data sync completed!"
        else
            echo "❌ Data sync cancelled"
        fi
        
        # Cleanup
        rm -f "data-export-${timestamp}.sql"
        ;;
        
    "full")
        echo "🔄 Full sync: $SOURCE_NAME → $TARGET_NAME"
        echo "=================================="
        
        # Run schema sync first
        ./scripts/sync-databases.sh schema $SOURCE $TARGET
        
        # Then run data sync
        ./scripts/sync-databases.sh data $SOURCE $TARGET
        ;;
        
    "backup")
        echo "💾 Creating backup of $SOURCE_NAME database..."
        timestamp=$(date +%Y%m%d_%H%M%S)
        backup_file="backup-${SOURCE,,}-${timestamp}.sql"
        supabase db dump --project-ref=$SOURCE_PROJECT_ID > $backup_file
        echo "✅ Backup created: $backup_file"
        ;;
        
    "status")
        echo "📊 Database Status"
        echo "=================="
        
        echo "🚀 Production Database:"
        echo "  Project ID: $PROD_PROJECT_ID"
        echo "  URL: https://fkpiqcxkmrtaetvfgcli.supabase.co"
        
        echo ""
        echo "🔧 Development Database:"
        echo "  Project ID: $DEV_PROJECT_ID"
        echo "  URL: https://clypxuffvpqgmczbsblj.supabase.co"
        
        echo ""
        echo "📋 Current Environment:"
        if [ -f .env ]; then
            current_url=$(grep VITE_SUPABASE_URL .env | cut -d'=' -f2)
            if [[ $current_url == *"$PROD_PROJECT_ID"* ]]; then
                echo "  Active: Production Database"
            elif [[ $current_url == *"$DEV_PROJECT_ID"* ]]; then
                echo "  Active: Development Database"
            else
                echo "  Active: Unknown Database"
            fi
        else
            echo "  No environment active"
        fi
        ;;
        
    *)
        echo "❌ Unknown action: $ACTION"
        exit 1
        ;;
esac 