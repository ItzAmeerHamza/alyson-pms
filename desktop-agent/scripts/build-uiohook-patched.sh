#!/usr/bin/env bash
# Rebuild vendor/uiohook-napi-mac binaries from uiohook-napi source + our patch.
# See vendor/uiohook-napi-mac/README.md for why.
set -euo pipefail

VERSION="${UIOHOOK_VERSION:-1.5.5}"
ELECTRON_HEADERS="${ELECTRON_HEADERS:-28.3.3}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/uiohook-napi-mac"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$WORK"
npm pack "uiohook-napi@$VERSION" --silent >/dev/null
tar xzf "uiohook-napi-$VERSION.tgz"
cd package
patch -p1 < "$VENDOR/libuiohook-no-main-thread-wait.patch"

for arch in arm64 x64; do
  rm -rf build
  npx --yes node-gyp@10 rebuild --arch="$arch" --target="$ELECTRON_HEADERS" \
    --dist-url=https://electronjs.org/headers >/dev/null
  mkdir -p "$VENDOR/darwin-$arch"
  cp build/Release/uiohook_napi.node "$VENDOR/darwin-$arch/node.napi.node"
done

cd "$VENDOR"
shasum -a 256 darwin-*/node.napi.node > SHA256SUMS
cat SHA256SUMS
