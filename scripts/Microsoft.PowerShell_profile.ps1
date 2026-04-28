# PowerShell Profile for TimeFlow Development
# Place this in your PowerShell profile directory: $PROFILE

# Import useful modules
Import-Module PSReadLine -ErrorAction SilentlyContinue

# Configure PSReadLine for better development experience
if (Get-Module PSReadLine) {
    Set-PSReadLineOption -PredictionSource History
    Set-PSReadLineOption -PredictionViewStyle ListView
    Set-PSReadLineOption -EditMode Windows
    Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
}

# Useful aliases for TimeFlow development
Set-Alias -Name tf-backend -Value ".\backend\"
Set-Alias -Name tf-desktop -Value ".\desktop-agent\"
Set-Alias -Name tf-web -Value ".\src\"

# Functions for TimeFlow development
function Start-TimeFlowBackend {
    [CmdletBinding()]
    param()
    
    Write-Host "Starting TimeFlow Backend..." -ForegroundColor Green
    Push-Location ".\backend"
    try {
        npm run dev
    }
    finally {
        Pop-Location
    }
}

function Start-TimeFlowDesktop {
    [CmdletBinding()]
    param()
    
    Write-Host "Starting TimeFlow Desktop Agent..." -ForegroundColor Green
    Push-Location ".\desktop-agent"
    try {
        npm run dev
    }
    finally {
        Pop-Location
    }
}

function Start-TimeFlowWeb {
    [CmdletBinding()]
    param()
    
    Write-Host "Starting TimeFlow Web Admin..." -ForegroundColor Green
    npm run dev
}

function Test-TimeFlowAll {
    [CmdletBinding()]
    param()
    
    Write-Host "Running all TimeFlow tests..." -ForegroundColor Green
    
    # Backend tests
    Push-Location ".\backend"
    try {
        npm test
    }
    finally {
        Pop-Location
    }
    
    # Desktop agent tests  
    Push-Location ".\desktop-agent"
    try {
        npm test
    }
    finally {
        Pop-Location
    }
    
    # Web admin tests
    npm test
}

function Get-TimeFlowStatus {
    [CmdletBinding()]
    param()
    
    Write-Host "TimeFlow Project Status:" -ForegroundColor Cyan
    Write-Host "========================" -ForegroundColor Cyan
    
    # Check if processes are running
    $processes = @("node", "npm", "electron")
    foreach ($proc in $processes) {
        $running = Get-Process -Name $proc -ErrorAction SilentlyContinue
        if ($running) {
            Write-Host "$proc processes: $($running.Count) running" -ForegroundColor Green
        } else {
            Write-Host "$proc processes: None running" -ForegroundColor Yellow
        }
    }
    
    # Check directories
    $dirs = @("backend", "desktop-agent", "src", ".cursor")
    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            Write-Host "Directory $dir: ✓ Exists" -ForegroundColor Green
        } else {
            Write-Host "Directory $dir: ✗ Missing" -ForegroundColor Red
        }
    }
}

# Welcome message
Write-Host "TimeFlow PowerShell Profile Loaded!" -ForegroundColor Green
Write-Host "Available commands:" -ForegroundColor Cyan
Write-Host "  Start-TimeFlowBackend  - Start backend server" -ForegroundColor Gray
Write-Host "  Start-TimeFlowDesktop  - Start desktop agent" -ForegroundColor Gray  
Write-Host "  Start-TimeFlowWeb      - Start web admin" -ForegroundColor Gray
Write-Host "  Test-TimeFlowAll       - Run all tests" -ForegroundColor Gray
Write-Host "  Get-TimeFlowStatus     - Show project status" -ForegroundColor Gray


