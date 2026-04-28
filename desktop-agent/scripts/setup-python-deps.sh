#!/bin/bash
# Setup Python dependencies for desktop agent
# This script installs PyObjC and other dependencies needed for input monitoring

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
REQUIREMENTS_FILE="$PROJECT_DIR/python-requirements.txt"

echo "🐍 Setting up Python dependencies for TimeFlow Desktop Agent..."
echo "📂 Script directory: $SCRIPT_DIR"
echo "📂 Project directory: $PROJECT_DIR"
echo "📂 Requirements file: $REQUIREMENTS_FILE"

# Determine Python executable
if command -v python3 &> /dev/null; then
    PYTHON=python3
elif command -v python &> /dev/null; then
    PYTHON=python
else
    echo "⚠️ Python not found. Skipping Python dependency installation."
    echo "⚠️ Input monitoring may not work. Please install Python 3.9 or later."
    exit 0  # Non-blocking exit for CI/CD
fi

echo "✅ Using Python: $PYTHON ($($PYTHON --version))"

# Check if requirements file exists
if [ ! -f "$REQUIREMENTS_FILE" ]; then
    echo "⚠️ Requirements file not found at: $REQUIREMENTS_FILE"
    echo "⚠️ Skipping Python dependency installation."
    exit 0  # Non-blocking exit
fi

# Check if pip is available
if ! $PYTHON -m pip --version &> /dev/null; then
    echo "⚠️ pip not found. Attempting to install pip..."
    if ! $PYTHON -m ensurepip --default-pip 2>/dev/null; then
        echo "⚠️ Could not install pip. Skipping Python dependency installation."
        exit 0  # Non-blocking exit
    fi
fi

# Upgrade pip (suppress warnings)
echo "📦 Upgrading pip..."
$PYTHON -m pip install --upgrade pip --quiet 2>/dev/null || true

# Install Python dependencies
echo "📦 Installing Python dependencies from: $REQUIREMENTS_FILE"
if $PYTHON -m pip install -r "$REQUIREMENTS_FILE" --quiet; then
    echo ""
    echo "✅ Python dependencies installed successfully!"
    echo ""
    echo "📦 Installed packages:"
    $PYTHON -m pip list | grep -E "(pyobjc|Quartz|Cocoa)" || echo "  (none - may not be macOS)"
    echo ""
    echo "🎯 Next step: Run 'npm run build' to package the app with Python support"
else
    echo "⚠️ Failed to install Python dependencies. Input monitoring may not work."
    exit 0  # Non-blocking exit
fi

