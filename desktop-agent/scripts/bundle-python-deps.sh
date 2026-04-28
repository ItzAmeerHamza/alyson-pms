#!/bin/bash
# Bundle Python dependencies for desktop agent
# This script creates a portable Python library bundle with PyObjC for macOS input monitoring

set -e

echo "🐍 Bundling Python dependencies for TimeFlow Desktop Agent..."

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_LIBS_DIR="$DESKTOP_AGENT_DIR/python-libs"

# Determine Python executable
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "❌ Python not found. Please install Python 3.9 or later."
    exit 1
fi

echo "✅ Using Python: $PYTHON ($($PYTHON --version))"

# Check platform
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  Warning: This script is designed for macOS. Skipping Python bundling on $OSTYPE."
    exit 0
fi

# Check if pip is available
if ! $PYTHON -m pip --version &> /dev/null; then
    echo "❌ pip not found. Installing pip..."
    $PYTHON -m ensurepip --default-pip || {
        echo "❌ Failed to install pip. Please install pip manually."
        exit 1
    }
fi

# Create/clean python-libs directory
if [ -d "$PYTHON_LIBS_DIR" ]; then
    echo "🧹 Cleaning existing python-libs directory..."
    rm -rf "$PYTHON_LIBS_DIR"
fi

mkdir -p "$PYTHON_LIBS_DIR"
echo "📁 Created: $PYTHON_LIBS_DIR"

# Install Python dependencies to target directory
echo "📦 Installing PyObjC dependencies to $PYTHON_LIBS_DIR..."
echo "   This may take a few minutes..."

# Install packages one by one for better error handling
PACKAGES=(
    "pyobjc-core>=9.0"
    "pyobjc-framework-Cocoa>=9.0"
    "pyobjc-framework-Quartz>=9.0"
)

for PACKAGE in "${PACKAGES[@]}"; do
    echo "   Installing $PACKAGE..."
    $PYTHON -m pip install --target "$PYTHON_LIBS_DIR" --upgrade "$PACKAGE" 2>&1 | grep -v "WARNING: Target directory" || true
done

# Verify installation by actually importing the modules
echo ""
echo "🧪 Verifying bundled packages with import test..."

IMPORT_ERRORS=0

# Test 1: Can import objc
if PYTHONPATH="$PYTHON_LIBS_DIR" $PYTHON -c "import objc; print('  ✅ objc module: OK')" 2>/dev/null; then
    true
else
    echo "  ❌ objc module: FAILED TO IMPORT"
    IMPORT_ERRORS=$((IMPORT_ERRORS+1))
fi

# Test 2: Can import Cocoa
if PYTHONPATH="$PYTHON_LIBS_DIR" $PYTHON -c "from Cocoa import NSObject; print('  ✅ Cocoa module: OK')" 2>/dev/null; then
    true
else
    echo "  ❌ Cocoa module: FAILED TO IMPORT"
    IMPORT_ERRORS=$((IMPORT_ERRORS+1))
fi

# Test 3: Can import Quartz (the critical one for input monitoring)
if PYTHONPATH="$PYTHON_LIBS_DIR" $PYTHON -c "from Quartz import CGEventTapCreate; print('  ✅ Quartz.CGEventTapCreate: OK')" 2>/dev/null; then
    true
else
    echo "  ❌ Quartz.CGEventTapCreate: FAILED TO IMPORT"
    IMPORT_ERRORS=$((IMPORT_ERRORS+1))
fi

echo ""
if [ $IMPORT_ERRORS -gt 0 ]; then
    echo "⚠️  WARNING: $IMPORT_ERRORS import test(s) FAILED!"
    echo "   The bundled libraries may not work at runtime."
    echo "   Check Python version compatibility: $($PYTHON --version)"
    echo "   Architecture: $(uname -m)"
    # Don't exit with error - still allow build to proceed, but warn loudly
else
    echo "✅ All import tests PASSED!"
fi

echo ""
echo "📦 Bundled packages:"
ls -lh "$PYTHON_LIBS_DIR" | grep "^d" | awk '{print "   " $9}' | grep -E "(objc|pyobjc|Quartz|Cocoa)" || echo "   (packages installed)"

# Check size
BUNDLE_SIZE=$(du -sh "$PYTHON_LIBS_DIR" | awk '{print $1}')
echo ""
echo "📊 Bundle size: $BUNDLE_SIZE"

# Check for native .so files (architecture verification)
SO_COUNT=$(find "$PYTHON_LIBS_DIR" -name "*.so" | wc -l | tr -d ' ')
DYLIB_COUNT=$(find "$PYTHON_LIBS_DIR" -name "*.dylib" | wc -l | tr -d ' ')
echo "📊 Native files: ${SO_COUNT} .so, ${DYLIB_COUNT} .dylib"

# Verify architecture matches current system
if [ "$SO_COUNT" -gt 0 ]; then
    SAMPLE_SO=$(find "$PYTHON_LIBS_DIR" -name "*.so" | head -1)
    ARCH=$(file "$SAMPLE_SO" 2>/dev/null | grep -o "arm64\|x86_64" | head -1)
    SYSTEM_ARCH=$(uname -m)
    if [ -n "$ARCH" ]; then
        echo "📊 Native lib architecture: $ARCH (system: $SYSTEM_ARCH)"
        if [ "$ARCH" != "$SYSTEM_ARCH" ]; then
            echo "⚠️  WARNING: Architecture mismatch! Libraries may not work on this system."
        fi
    fi
fi

echo ""
echo "🎯 Python libraries ready for electron-builder packaging"

