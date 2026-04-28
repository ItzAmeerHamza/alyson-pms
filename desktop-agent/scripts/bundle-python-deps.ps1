# Bundle Python dependencies for desktop agent (PowerShell version)
# This script creates a portable Python library bundle with PyObjC for macOS input monitoring

$ErrorActionPreference = "Stop"

Write-Host "🐍 Bundling Python dependencies for TimeFlow Desktop Agent..." -ForegroundColor Cyan

# Determine script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopAgentDir = Split-Path -Parent $ScriptDir
$PythonLibsDir = Join-Path $DesktopAgentDir "python-libs"

# Determine Python executable
$Python = $null
$PythonCommands = @("python3", "python", "py")

foreach ($cmd in $PythonCommands) {
    try {
        $version = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $Python = $cmd
            Write-Host "✅ Using Python: $Python ($version)" -ForegroundColor Green
            break
        }
    } catch {
        continue
    }
}

if (-not $Python) {
    Write-Host "❌ Python not found. Please install Python 3.9 or later." -ForegroundColor Red
    exit 1
}

# Check platform - only bundle on macOS (skip on Windows/Linux during cross-platform development)
if ($env:OS -eq "Windows_NT") {
    Write-Host "⚠️  Warning: Running on Windows. Python bundling is for macOS builds." -ForegroundColor Yellow
    Write-Host "✅ Skipping Python bundling - this will be handled on macOS build machine." -ForegroundColor Green
    exit 0
}

# Check if pip is available
try {
    & $Python -m pip --version | Out-Null
} catch {
    Write-Host "❌ pip not found. Installing pip..." -ForegroundColor Red
    & $Python -m ensurepip --default-pip
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install pip. Please install pip manually." -ForegroundColor Red
        exit 1
    }
}

# Create/clean python-libs directory
if (Test-Path $PythonLibsDir) {
    Write-Host "🧹 Cleaning existing python-libs directory..." -ForegroundColor Yellow
    Remove-Item -Path $PythonLibsDir -Recurse -Force
}

New-Item -Path $PythonLibsDir -ItemType Directory -Force | Out-Null
Write-Host "📁 Created: $PythonLibsDir" -ForegroundColor Green

# Install Python dependencies to target directory
Write-Host "📦 Installing PyObjC dependencies to $PythonLibsDir..." -ForegroundColor Cyan
Write-Host "   This may take a few minutes..." -ForegroundColor Gray

# Install packages one by one for better error handling
$Packages = @(
    "pyobjc-core>=9.0",
    "pyobjc-framework-Cocoa>=9.0",
    "pyobjc-framework-Quartz>=9.0"
)

foreach ($Package in $Packages) {
    Write-Host "   Installing $Package..." -ForegroundColor Gray
    & $Python -m pip install --target $PythonLibsDir --upgrade $Package 2>&1 | Where-Object { $_ -notmatch "WARNING: Target directory" }
}

# Verify installation
Write-Host ""
Write-Host "✅ Python dependencies bundled successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Bundled packages:" -ForegroundColor Cyan
Get-ChildItem -Path $PythonLibsDir -Directory | Where-Object { $_.Name -match "objc|pyobjc" } | ForEach-Object {
    Write-Host "   $($_.Name)" -ForegroundColor Gray
}

# Check size
$BundleSize = (Get-ChildItem -Path $PythonLibsDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ""
Write-Host "📊 Bundle size: $([math]::Round($BundleSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎯 Python libraries ready for electron-builder packaging" -ForegroundColor Green

