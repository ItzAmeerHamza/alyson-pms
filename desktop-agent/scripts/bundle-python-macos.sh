#!/bin/bash
# Bundle standalone Python + PyObjC for macOS desktop agent
# Downloads a self-contained Python from python-build-standalone
# and installs PyObjC into it. No dependency on the user's system Python.
#
# Bundles BOTH arm64 and x64 Python so the DMG works on Intel AND Apple Silicon.
# At runtime, the provisioner picks the correct arch via process.arch.
#
# Usage: bash scripts/bundle-python-macos.sh [--arch arm64|x64|both]
#   Default (no arg): bundles BOTH architectures

set -e

echo "🐍 Bundling standalone Python for macOS..."

# Config — keep in sync with python-provisioner.js
PYTHON_VERSION="3.11.14"
RELEASE_TAG="20260211"
BASE_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}"

# Determine script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON_MACOS_DIR="$DESKTOP_AGENT_DIR/python-macos"

# Determine which architectures to bundle
REQUESTED="${1#--arch=}"
if [ -z "$REQUESTED" ] || [ "$REQUESTED" = "$1" ]; then
    REQUESTED="both"
fi

bundle_arch() {
    local ARCH="$1"
    local PYTHON_ARCH

    if [ "$ARCH" = "arm64" ]; then
        PYTHON_ARCH="aarch64"
    else
        PYTHON_ARCH="x86_64"
    fi

    local TARGET_DIR="$PYTHON_MACOS_DIR/$ARCH"
    local FILENAME="cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${PYTHON_ARCH}-apple-darwin-install_only.tar.gz"
    local DOWNLOAD_URL="${BASE_URL}/${FILENAME}"

    echo ""
    echo "═══════════════════════════════════════"
    echo "📋 Python version: ${PYTHON_VERSION}"
    echo "📋 Architecture: ${ARCH} (${PYTHON_ARCH})"
    echo "📋 Target: ${TARGET_DIR}"
    echo "═══════════════════════════════════════"

    # Clean existing
    if [ -d "$TARGET_DIR" ]; then
        echo "🧹 Cleaning existing ${ARCH} directory..."
        rm -rf "$TARGET_DIR"
    fi
    mkdir -p "$TARGET_DIR"

    # Download
    local TARBALL="$TARGET_DIR/python-standalone.tar.gz"
    echo "📥 Downloading: ${DOWNLOAD_URL}"
    curl -L -o "$TARBALL" "$DOWNLOAD_URL"

    if [ ! -f "$TARBALL" ]; then
        echo "❌ Download failed for ${ARCH}!"
        exit 1
    fi

    local SIZE
    SIZE=$(du -h "$TARBALL" | awk '{print $1}')
    echo "📦 Downloaded: ${SIZE}"

    # Extract (python-build-standalone extracts to a 'python/' directory)
    echo "📦 Extracting..."
    tar -xzf "$TARBALL" -C "$TARGET_DIR"
    rm -f "$TARBALL"

    # Verify Python binary exists
    local PYTHON_BIN="$TARGET_DIR/python/bin/python3"
    if [ ! -f "$PYTHON_BIN" ]; then
        echo "❌ Python binary not found at: $PYTHON_BIN"
        echo "📂 Contents:"
        ls -la "$TARGET_DIR"
        exit 1
    fi

    chmod +x "$PYTHON_BIN"
    echo "✅ Python binary: $PYTHON_BIN"

    # For cross-arch builds (x64 on arm64 host), we can't run the binary directly.
    # Only verify + pip install if the arch matches the host.
    local HOST_ARCH
    HOST_ARCH=$(uname -m)
    local CAN_RUN=false
    if [ "$HOST_ARCH" = "arm64" ] && [ "$ARCH" = "arm64" ]; then
        CAN_RUN=true
    elif [ "$HOST_ARCH" = "x86_64" ] && [ "$ARCH" = "x64" ]; then
        CAN_RUN=true
    elif [ "$HOST_ARCH" = "arm64" ] && [ "$ARCH" = "x64" ]; then
        # arm64 Mac can run x64 via Rosetta 2 (macOS 11+)
        if arch -x86_64 /usr/bin/true 2>/dev/null; then
            CAN_RUN=true
            echo "ℹ️  Running x64 Python via Rosetta 2"
        fi
    fi

    if [ "$CAN_RUN" = true ]; then
        "$PYTHON_BIN" --version

        # Install PyObjC
        echo "📥 Installing PyObjC into bundled Python (${ARCH})..."
        "$PYTHON_BIN" -m pip install --quiet \
            pyobjc-core \
            pyobjc-framework-Cocoa \
            pyobjc-framework-Quartz

        # Verify
        echo "🧪 Verifying PyObjC..."
        if "$PYTHON_BIN" -c "from Quartz import CGEventTapCreate; print('  ✅ Quartz.CGEventTapCreate: OK')"; then
            true
        else
            echo "  ❌ Quartz import FAILED for ${ARCH}"
            exit 1
        fi

        if "$PYTHON_BIN" -c "from Cocoa import NSObject; print('  ✅ Cocoa.NSObject: OK')"; then
            true
        else
            echo "  ❌ Cocoa import FAILED for ${ARCH}"
            exit 1
        fi
    else
        echo "⚠️  Cannot run ${ARCH} Python on ${HOST_ARCH} host — skipping pip install & verification"
        echo "   PyObjC will need to be installed on first run (provisioner fallback)"
    fi

    # Stats
    local BUNDLE_SIZE
    BUNDLE_SIZE=$(du -sh "$TARGET_DIR" | awk '{print $1}')
    local SO_COUNT
    SO_COUNT=$(find "$TARGET_DIR" -name "*.so" 2>/dev/null | wc -l | tr -d ' ')
    echo "📊 Bundle size: ${BUNDLE_SIZE}"
    echo "📊 Native .so files: ${SO_COUNT}"
    echo "📊 Architecture: $(file "$PYTHON_BIN" | grep -o 'arm64\|x86_64' | head -1)"
    echo "✅ ${ARCH} Python bundle ready!"
}

# Clean top-level python-macos/ first
if [ -d "$PYTHON_MACOS_DIR" ]; then
    rm -rf "$PYTHON_MACOS_DIR"
fi

# Bundle requested architectures
if [ "$REQUESTED" = "both" ]; then
    bundle_arch "arm64"
    bundle_arch "x64"
elif [ "$REQUESTED" = "arm64" ] || [ "$REQUESTED" = "x64" ]; then
    bundle_arch "$REQUESTED"
else
    echo "❌ Unknown arch: $REQUESTED (use arm64, x64, or both)"
    exit 1
fi

echo ""
echo "✅ macOS Python bundle(s) ready for electron-builder packaging!"
echo "   Layout: python-macos/{arm64,x64}/python/bin/python3"
