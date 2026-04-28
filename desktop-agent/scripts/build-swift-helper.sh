#!/bin/bash
# Build the macOS Swift input helper binary
# Compiles a universal binary (arm64 + x86_64) for both Apple Silicon and Intel Macs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="${PROJECT_DIR}/src/helpers/macos-input-helper.swift"
OUT_DIR="${PROJECT_DIR}/helpers"
OUT="${OUT_DIR}/macos-input-helper"

echo "🔨 Building macOS input helper (Swift)..."
echo "   Source: ${SRC}"
echo "   Output: ${OUT}"

# Create output directory
mkdir -p "${OUT_DIR}"

# Compile for arm64
echo "   Compiling for arm64..."
swiftc "${SRC}" -o "${OUT}-arm64" \
  -target arm64-apple-macosx11.0 \
  -framework Cocoa \
  -O

# Compile for x86_64
echo "   Compiling for x86_64..."
swiftc "${SRC}" -o "${OUT}-x86_64" \
  -target x86_64-apple-macosx11.0 \
  -framework Cocoa \
  -O

# Create universal binary
echo "   Creating universal binary..."
lipo -create "${OUT}-arm64" "${OUT}-x86_64" -output "${OUT}"

# Clean up arch-specific binaries
rm -f "${OUT}-arm64" "${OUT}-x86_64"

# Make executable
chmod +x "${OUT}"

echo "✅ Swift helper built successfully: ${OUT}"
echo "   $(file "${OUT}")"
echo "   Size: $(ls -lh "${OUT}" | awk '{print $5}')"
