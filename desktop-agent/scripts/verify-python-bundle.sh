#!/bin/bash
# Post-build verification: check that Python bundle exists in the Electron output
# Run this after `npm run build` or `npm run build:mac` to verify the build is complete

set -e

echo "🔍 [VERIFY] Checking Python bundle in Electron build output..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DESKTOP_AGENT_DIR="$(dirname "$SCRIPT_DIR")"

ERRORS=0

# ========== macOS Checks ==========
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo ""
  echo "── macOS Build Verification ──"

  # Check for .app bundles in dist/
  if [ ! -d "$DESKTOP_AGENT_DIR/dist" ]; then
    echo "⚠️  No dist/ directory found. Build might not have run yet."
    exit 0
  fi

  # Use null-delimiter to handle paths with spaces
  APP_COUNT=0
  while IFS= read -r -d '' APP_DIR; do
    APP_COUNT=$((APP_COUNT+1))
  done < <(find "$DESKTOP_AGENT_DIR/dist" -name "*.app" -maxdepth 2 -print0 2>/dev/null)
  
  if [ "$APP_COUNT" -eq 0 ]; then
    echo "⚠️  No .app bundle found in dist/. Build might not have run yet."
    exit 0
  fi

  while IFS= read -r -d '' APP_DIR; do
    echo ""
    echo "📦 Checking: $APP_DIR"
    
    RESOURCES_DIR="$APP_DIR/Contents/Resources"
    UNPACKED_DIR="$RESOURCES_DIR/app.asar.unpacked"
    
    # 1. Check python-libs exists
    PYTHON_LIBS="$UNPACKED_DIR/python-libs"
    if [ -d "$PYTHON_LIBS" ]; then
      LIB_SIZE=$(du -sh "$PYTHON_LIBS" 2>/dev/null | awk '{print $1}')
      PYOBJC_FILES=$(find "$PYTHON_LIBS" -name "*.so" -o -name "*.dylib" 2>/dev/null | wc -l | tr -d ' ')
      echo "  ✅ python-libs present ($LIB_SIZE, $PYOBJC_FILES native files)"
      
      # Verify Quartz module exists
      if [ -d "$PYTHON_LIBS/Quartz" ]; then
        echo "  ✅ Quartz framework found"
      else
        echo "  ❌ Quartz framework MISSING in python-libs"
        ERRORS=$((ERRORS+1))
      fi
      
      # Verify objc module exists
      if [ -d "$PYTHON_LIBS/objc" ]; then
        echo "  ✅ objc module found"
      else
        echo "  ❌ objc module MISSING in python-libs"
        ERRORS=$((ERRORS+1))
      fi
    else
      echo "  ❌ python-libs directory MISSING"
      ERRORS=$((ERRORS+1))
    fi
    
    # 2. Check Python monitor script exists
    MONITOR_SCRIPT="$UNPACKED_DIR/src/python/input_monitor.py"
    if [ -f "$MONITOR_SCRIPT" ]; then
      echo "  ✅ input_monitor.py present"
    else
      # Check alternative locations
      ALT_SCRIPT=$(find "$UNPACKED_DIR" -name "input_monitor.py" 2>/dev/null | head -1)
      if [ -n "$ALT_SCRIPT" ]; then
        echo "  ✅ input_monitor.py found at: $ALT_SCRIPT"
      else
        echo "  ⚠️  input_monitor.py not found in unpacked (might be in asar)"
      fi
    fi
    
    # 3. Runtime import test (if python3 available)
    if command -v python3 &> /dev/null; then
      echo "  🧪 Running import test..."
      if PYTHONPATH="$PYTHON_LIBS" python3 -c "from Quartz import CGEventTapCreate; print('ok')" 2>/dev/null; then
        echo "  ✅ Import test PASSED (Quartz.CGEventTapCreate importable)"
      else
        echo "  ❌ Import test FAILED (Quartz.CGEventTapCreate not importable)"
        ERRORS=$((ERRORS+1))
      fi
    fi
  done < <(find "$DESKTOP_AGENT_DIR/dist" -name "*.app" -maxdepth 2 -print0 2>/dev/null)
fi

# ========== Windows Checks ==========
# (Runs on Windows or when checking a dist from CI)

WIN_COUNT=0
while IFS= read -r -d '' WIN_DIR; do
  WIN_COUNT=$((WIN_COUNT+1))
done < <(find "$DESKTOP_AGENT_DIR/dist" -name "win-unpacked" -maxdepth 2 -print0 2>/dev/null)

if [ "$WIN_COUNT" -gt 0 ]; then
  echo ""
  echo "── Windows Build Verification ──"
  
  while IFS= read -r -d '' WIN_DIR; do
    echo ""
    echo "📦 Checking: $WIN_DIR"
    
    UNPACKED_DIR="$WIN_DIR/resources/app.asar.unpacked"
    
    PYTHON_WIN="$UNPACKED_DIR/python-windows/python.exe"
    if [ -f "$PYTHON_WIN" ]; then
      echo "  ✅ python-windows/python.exe present"
      WIN_SIZE=$(du -sh "$UNPACKED_DIR/python-windows" 2>/dev/null | awk '{print $1}')
      echo "  📊 python-windows size: $WIN_SIZE"
    else
      echo "  ❌ python-windows/python.exe MISSING"
      ERRORS=$((ERRORS+1))
    fi
    
    # Check pynput
    PYNPUT_DIR="$UNPACKED_DIR/python-windows/Lib/pynput"
    if [ -d "$PYNPUT_DIR" ]; then
      echo "  ✅ pynput library present"
    else
      echo "  ⚠️  pynput library not found (may need separate install)"
    fi
  done < <(find "$DESKTOP_AGENT_DIR/dist" -name "win-unpacked" -maxdepth 2 -print0 2>/dev/null)
fi

# ========== Summary ==========
echo ""
echo "════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
  echo "✅ All Python bundle checks PASSED"
else
  echo "❌ $ERRORS check(s) FAILED - build may have missing Python components"
  echo "   Run the bundle scripts before building:"
  echo "   macOS:   ./scripts/bundle-python-deps.sh"
  echo "   Windows: ./scripts/bundle-python-windows.ps1"
  exit 1
fi
