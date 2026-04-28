#Requires -Version 5.1
<#
.SYNOPSIS
  TimeFlow Desktop Agent -- Windows E2E Test Automation

.DESCRIPTION
  1. Pulls latest code from staging
  2. Kills any running Electron / Work Time processes
  3. Runs npm install
  4. Launches the agent with --remote-debugging-port=9222
  5. Waits for CDP to become reachable
  6. Runs quick-verify and/or the full test suite
  7. Tears down the agent process

.PARAMETER Mode
  quick  -- only quick-verify (~5 s)
  full   -- only full test-runner (~5 min)
  both   -- quick-verify first, then full suite (default)

.PARAMETER SkipPull
  Skip the git pull step (useful when you already have the code)

.PARAMETER SkipInstall
  Skip npm install (saves time when node_modules is current)

.PARAMETER Phase
  Run a single phase of the full test runner (e.g. "active", "idle", "1")

.EXAMPLE
  .\run-e2e-tests.ps1
  .\run-e2e-tests.ps1 -Mode quick
  .\run-e2e-tests.ps1 -Mode full -Phase idle
  .\run-e2e-tests.ps1 -SkipPull -SkipInstall
#>

param(
    [ValidateSet("quick", "full", "both")]
    [string]$Mode = "both",

    [switch]$SkipPull,
    [switch]$SkipInstall,

    [string]$Phase = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir
$AgentDir  = $ScriptDir   # script lives inside desktop-agent/

$CDP_PORT    = 9222
$CDP_URL     = "http://localhost:$CDP_PORT/json"
$MAX_WAIT_S  = 90          # max seconds to wait for CDP
$POLL_S      = 3           # poll interval

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
function Write-Banner([string]$msg) {
    $line = "=" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
}

function Write-Step([string]$msg) {
    Write-Host "`n>> $msg" -ForegroundColor Yellow
}

function Write-Ok([string]$msg) {
    Write-Host "   [OK] $msg" -ForegroundColor Green
}

function Write-Err([string]$msg) {
    Write-Host "   [FAIL] $msg" -ForegroundColor Red
}

function Test-CdpReachable {
    try {
        $resp = Invoke-WebRequest -Uri $CDP_URL -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Stop-AgentProcesses {
    $procs = Get-Process -ErrorAction SilentlyContinue |
             Where-Object { $_.ProcessName -match "electron|Work Time" }
    if ($procs) {
        $procs | ForEach-Object {
            Write-Host "   Killing $($_.ProcessName) (PID $($_.Id))" -ForegroundColor DarkGray
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
    }
}

# -------------------------------------------------------------------
# Step 0 -- Parse bat-style positional arg ("quick", "full", "both")
# -------------------------------------------------------------------
if ($args.Count -gt 0 -and $Mode -eq "both") {
    $firstArg = $args[0].ToLower()
    if ($firstArg -in @("quick", "full", "both")) {
        $Mode = $firstArg
    }
}

# -------------------------------------------------------------------
# Step 1 -- Pull latest code
# -------------------------------------------------------------------
if (-not $SkipPull) {
    Write-Banner "Step 1/6 -- Pulling latest staging code"
    Push-Location $RepoRoot
    try {
        git fetch origin 2>&1 | Write-Host
        $branch = (git rev-parse --abbrev-ref HEAD).Trim()
        if ($branch -ne "staging") {
            Write-Step "Switching to staging..."
            git checkout staging 2>&1 | Write-Host
        }
        git pull 2>&1 | Write-Host
        Write-Ok "Code is up to date on staging"
    } finally {
        Pop-Location
    }
} else {
    Write-Banner "Step 1/6 -- Skipping git pull (--SkipPull)"
}

# -------------------------------------------------------------------
# Step 2 -- Kill running agents
# -------------------------------------------------------------------
Write-Banner "Step 2/6 -- Killing existing agent processes"
Stop-AgentProcesses
Write-Ok "No stale agent processes"

# -------------------------------------------------------------------
# Step 3 -- npm install
# -------------------------------------------------------------------
if (-not $SkipInstall) {
    Write-Banner "Step 3/6 -- Installing dependencies"
    Push-Location $AgentDir
    try {
        npm install 2>&1 | Write-Host
        Write-Ok "npm install complete"
    } finally {
        Pop-Location
    }
} else {
    Write-Banner "Step 3/6 -- Skipping npm install (--SkipInstall)"
}

# -------------------------------------------------------------------
# Step 4 -- Launch agent with CDP
# -------------------------------------------------------------------
Write-Banner "Step 4/6 -- Launching agent with remote debugging"
Push-Location $AgentDir

$electronExe = Join-Path $AgentDir "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
    $electronExe = "npx"
}

$agentProc = $null
try {
    if ($electronExe -eq "npx") {
        $agentProc = Start-Process -FilePath "npx" `
            -ArgumentList "electron . --remote-debugging-port=$CDP_PORT" `
            -WorkingDirectory $AgentDir `
            -PassThru `
            -WindowStyle Normal
    } else {
        $agentProc = Start-Process -FilePath $electronExe `
            -ArgumentList ". --remote-debugging-port=$CDP_PORT" `
            -WorkingDirectory $AgentDir `
            -PassThru `
            -WindowStyle Normal
    }
    Write-Ok "Agent started (PID $($agentProc.Id))"
} catch {
    Write-Err "Failed to start agent: $_"
    Pop-Location
    exit 1
}
Pop-Location

# -------------------------------------------------------------------
# Step 5 -- Wait for CDP to become reachable
# -------------------------------------------------------------------
Write-Banner "Step 5/6 -- Waiting for CDP on port $CDP_PORT"
$waited = 0
$cdpReady = $false

while ($waited -lt $MAX_WAIT_S) {
    if (Test-CdpReachable) {
        $cdpReady = $true
        break
    }
    Write-Host "   Waiting... ${waited}/${MAX_WAIT_S}s" -ForegroundColor DarkGray
    Start-Sleep -Seconds $POLL_S
    $waited += $POLL_S

    if ($agentProc.HasExited) {
        Write-Err "Agent process exited unexpectedly with exit code $($agentProc.ExitCode)"
        exit 1
    }
}

if (-not $cdpReady) {
    Write-Err "CDP did not become reachable within $MAX_WAIT_S seconds"
    Stop-AgentProcesses
    exit 1
}

Write-Ok "CDP is reachable after $waited seconds"
Write-Host "   Giving the app 10s to fully initialize..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

# -------------------------------------------------------------------
# Step 6 -- Run tests
# -------------------------------------------------------------------
$quickExit = 0
$fullExit  = 0
$testDir   = Join-Path $AgentDir "test\e2e"

if ($Mode -in @("quick", "both")) {
    Write-Banner "Step 6a -- Running quick-verify"
    Push-Location $AgentDir
    try {
        node (Join-Path $testDir "quick-verify.js") 2>&1 | ForEach-Object { Write-Host $_ }
        $quickExit = $LASTEXITCODE
        if ($quickExit -eq 0) { Write-Ok "Quick verify passed" }
        else                  { Write-Err "Quick verify failed (exit $quickExit)" }
    } finally {
        Pop-Location
    }
}

if ($Mode -in @("full", "both")) {
    Write-Banner "Step 6b -- Running full E2E test suite"
    Push-Location $AgentDir
    try {
        $runnerArgs = @((Join-Path $testDir "test-runner.js"))
        if ($Phase) { $runnerArgs += "--phase=$Phase" }

        node @runnerArgs 2>&1 | ForEach-Object { Write-Host $_ }
        $fullExit = $LASTEXITCODE
        if ($fullExit -eq 0) { Write-Ok "Full test suite passed" }
        else                 { Write-Err "Full test suite failed (exit $fullExit)" }
    } finally {
        Pop-Location
    }
}

# -------------------------------------------------------------------
# Teardown
# -------------------------------------------------------------------
Write-Banner "Teardown -- Stopping agent"
Stop-AgentProcesses
Write-Ok "Agent stopped"

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host "  E2E TEST RESULTS" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

if ($Mode -in @("quick", "both")) {
    $icon = if ($quickExit -eq 0) { "[PASS]" } else { "[FAIL]" }
    $color = if ($quickExit -eq 0) { "Green" } else { "Red" }
    Write-Host "  Quick Verify : $icon" -ForegroundColor $color
}
if ($Mode -in @("full", "both")) {
    $icon = if ($fullExit -eq 0) { "[PASS]" } else { "[FAIL]" }
    $color = if ($fullExit -eq 0) { "Green" } else { "Red" }
    Write-Host "  Full Suite   : $icon" -ForegroundColor $color
}
Write-Host ("=" * 60) -ForegroundColor Cyan
Write-Host ""

$exitCode = [Math]::Max($quickExit, $fullExit)
if ($exitCode -ne 0) {
    Write-Host "Some tests failed. Review output above." -ForegroundColor Red  
}
exit $exitCode
