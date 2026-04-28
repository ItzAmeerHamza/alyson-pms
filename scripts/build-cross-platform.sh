#!/bin/bash
set -e

# 🚀 Cross-Platform Build Script (Windows + Linux)
# Builds Windows EXE and Linux AppImage without macOS

echo "🚀 Starting Cross-Platform Build (Windows + Linux)..."

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo "📦 Current version: ${CURRENT_VERSION}"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist build node_modules/.cache

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build web application
echo "🌐 Building web application..."
npm run build

# Build desktop applications for Windows and Linux
echo "🖥️ Building cross-platform desktop applications..."
echo "   - Building for Windows (x64)..."
echo "   - Building for Linux (x64)..."

# Build Windows and Linux with electron-builder
npx electron-builder --win --linux --publish=never

echo "✅ Cross-platform builds completed!"

# Show build results
echo "📊 Build Results:"
ls -la dist/

# Rename files to match our naming convention
echo "📝 Renaming files to match naming convention..."

# Find and rename Windows file
if ls dist/*Setup*.exe 1> /dev/null 2>&1; then
    WIN_FILE=$(ls dist/*Setup*.exe | head -1)
    cp "$WIN_FILE" "dist/TimeFlow-v${CURRENT_VERSION}-Setup.exe"
    echo "✅ Windows: $WIN_FILE -> TimeFlow-v${CURRENT_VERSION}-Setup.exe"
fi

# Find and rename Linux file
if ls dist/*.AppImage 1> /dev/null 2>&1; then
    LINUX_FILE=$(ls dist/*.AppImage | head -1)
    cp "$LINUX_FILE" "dist/TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"
    echo "✅ Linux: $LINUX_FILE -> TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"
fi

# Generate file information
echo "📊 Generating file information..."

WIN_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Setup.exe"
LINUX_RENAMED="dist/TimeFlow-v${CURRENT_VERSION}-Linux.AppImage"

if [[ -f "$WIN_RENAMED" ]]; then
    WIN_SHA512=$(shasum -a 512 "$WIN_RENAMED" | cut -d' ' -f1)
    WIN_SIZE=$(stat -f%z "$WIN_RENAMED" 2>/dev/null || stat -c%s "$WIN_RENAMED")
    echo "   Windows EXE: ${WIN_SIZE} bytes, SHA512: ${WIN_SHA512}"
fi

if [[ -f "$LINUX_RENAMED" ]]; then
    LINUX_SHA512=$(shasum -a 512 "$LINUX_RENAMED" | cut -d' ' -f1)
    LINUX_SIZE=$(stat -f%z "$LINUX_RENAMED" 2>/dev/null || stat -c%s "$LINUX_RENAMED")
    echo "   Linux AppImage: ${LINUX_SIZE} bytes, SHA512: ${LINUX_SHA512}"
fi

# Update Windows auto-update configuration if Windows build exists
if [[ -f "$WIN_RENAMED" ]]; then
    echo "⚙️ Updating Windows auto-update configuration..."
    RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    
    cat > latest.yml << EOF
version: ${CURRENT_VERSION}
files:
  - url: TimeFlow-v${CURRENT_VERSION}-Setup.exe
    sha512: ${WIN_SHA512}
    size: ${WIN_SIZE}
path: TimeFlow-v${CURRENT_VERSION}-Setup.exe
sha512: ${WIN_SHA512}
releaseDate: '${RELEASE_DATE}'
EOF
    echo "✅ Windows auto-update configuration updated"
fi

# Copy files to public downloads directory
echo "📁 Copying files to public downloads directory..."
mkdir -p public/downloads

if [[ -f "$WIN_RENAMED" ]]; then
    cp "$WIN_RENAMED" "public/downloads/"
fi

if [[ -f "$LINUX_RENAMED" ]]; then
    cp "$LINUX_RENAMED" "public/downloads/"
fi

echo "✅ Files copied to public/downloads/"

echo "🎉 Cross-Platform Build Complete!"
echo ""
echo "📋 Build Summary:"
echo "   Version: v${CURRENT_VERSION}"
if [[ -f "$WIN_RENAMED" ]]; then
    echo "   Windows: ✅ Built and ready"
fi
if [[ -f "$LINUX_RENAMED" ]]; then
    echo "   Linux: ✅ Built and ready"
fi
echo ""
echo "🔗 Next steps:"
echo "   1. Test installations on Windows and Linux"
echo "   2. Add these files to a GitHub release"
echo "   3. Update web deployment links" 