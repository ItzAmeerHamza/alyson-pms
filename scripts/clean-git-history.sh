#!/bin/bash

# Git History Cleanup Script
# This script removes large binary files from git history using git-filter-repo
# WARNING: This rewrites git history and requires force push

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🧹 Git History Cleanup Script"
echo "==============================="
echo ""
echo "⚠️  WARNING: This will rewrite git history!"
echo "   - All collaborators will need to re-clone"
echo "   - Requires force push to remote"
echo "   - Backup is recommended"
echo ""

# Check if git-filter-repo is installed
if ! command -v git-filter-repo &> /dev/null; then
    echo "❌ git-filter-repo is not installed"
    echo "Install with: brew install git-filter-repo"
    exit 1
fi

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo "❌ Not a git repository"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

echo "📊 Analyzing current git size..."
git count-objects -vH

echo ""
echo "🔍 Finding large files in git history..."

# Find large files in git history
git rev-list --objects --all |
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' |
  awk '/^blob/ {if($3 > 1000000) print $3/1024/1024 "MB", $4}' |
  sort -nr |
  head -20 > /tmp/git-large-files.txt

echo "Top 20 largest files in git history:"
cat /tmp/git-large-files.txt

echo ""
read -p "Do you want to proceed with cleanup? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "🗑️  Removing large binary files from history..."
echo ""

# Remove installer files
echo "Removing .dmg files..."
git filter-repo --path-glob '*.dmg' --invert-paths --force

echo "Removing .exe files..."
git filter-repo --path-glob '*.exe' --invert-paths --force

echo "Removing .AppImage files..."
git filter-repo --path-glob '*.AppImage' --invert-paths --force

echo "Removing large diagnostic files..."
git filter-repo --path-glob '*diagnostic*.json' --invert-paths --force

echo "Removing .zip archives..."
git filter-repo --path-glob '*.zip' --path-glob '*.tar.gz' --invert-paths --force

echo ""
echo "✅ Git history cleanup complete!"
echo ""
echo "📊 New git size:"
git count-objects -vH

echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Review the changes with: git log --all --oneline"
echo "2. Force push to remote: git push origin --force --all"
echo "3. Force push tags: git push origin --force --tags"
echo "4. Notify all collaborators to re-clone the repository"
echo ""
echo "To undo these changes (before pushing):"
echo "  - Restore from backup if you made one"
echo "  - Or re-clone from the remote repository"
echo ""

