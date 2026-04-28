# Bundle Python embeddable for Windows
# Downloads the Python 3.11 embeddable package and extracts it to python-windows folder

$ErrorActionPreference = "Stop"

Write-Host "[INFO] Bundling Python embeddable for Windows..." -ForegroundColor Cyan

# Determine script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopAgentDir = Split-Path -Parent $ScriptDir
$PythonWindowsDir = Join-Path $DesktopAgentDir "python-windows"
$TempDir = Join-Path $env:TEMP "python-embed-download"

# Python 3.11 embeddable URL (64-bit)
$PythonVersion = "3.11.9"
$PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZipFile = Join-Path $TempDir "python-embed.zip"

# Create temp directory
if (-not (Test-Path $TempDir)) {
    New-Item -Path $TempDir -ItemType Directory -Force | Out-Null
}

# Check if python.exe already exists
if (Test-Path (Join-Path $PythonWindowsDir "python.exe")) {
    Write-Host "[OK] Python embeddable already exists in python-windows" -ForegroundColor Green
    Write-Host "    To re-download, delete python-windows/python.exe first" -ForegroundColor Gray
    exit 0
}

Write-Host "[DOWNLOAD] Downloading Python $PythonVersion embeddable..." -ForegroundColor Cyan
Write-Host "    URL: $PythonZipUrl" -ForegroundColor Gray

try {
    # Download with progress
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZipFile -UseBasicParsing
    Write-Host "[OK] Download complete" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Failed to download Python embeddable: $_" -ForegroundColor Red
    exit 1
}

# Create python-windows directory if needed
if (-not (Test-Path $PythonWindowsDir)) {
    New-Item -Path $PythonWindowsDir -ItemType Directory -Force | Out-Null
    Write-Host "[OK] Created: $PythonWindowsDir" -ForegroundColor Green
}

# Extract to python-windows
Write-Host "[EXTRACT] Extracting Python embeddable to $PythonWindowsDir..." -ForegroundColor Cyan

try {
    Expand-Archive -Path $PythonZipFile -DestinationPath $PythonWindowsDir -Force
    Write-Host "[OK] Extraction complete" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Failed to extract Python embeddable: $_" -ForegroundColor Red
    exit 1
}

# Clean up temp files
Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue

# Verify python.exe exists
$PythonExe = Join-Path $PythonWindowsDir "python.exe"
if (Test-Path $PythonExe) {
    Write-Host "[OK] Python embeddable bundled successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "[INFO] Bundled files:" -ForegroundColor Cyan
    Get-ChildItem -Path $PythonWindowsDir -Filter "python*" | ForEach-Object {
        Write-Host "    $($_.Name)" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Check size
    $BundleSize = (Get-ChildItem -Path $PythonWindowsDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "[INFO] Bundle size: $([math]::Round($BundleSize, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[DONE] Python embeddable ready for electron-builder packaging" -ForegroundColor Green
}
else {
    Write-Host "[ERROR] python.exe not found after extraction!" -ForegroundColor Red
    exit 1
}
