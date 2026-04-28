# Desktop Agent E2E Test Suite

Automated end-to-end tests for the TimeFlow desktop agent. Works on macOS, Windows, and Linux.

## Prerequisites

- Node.js 18+
- `ws` package: `npm install ws` (already in desktop-agent devDependencies)

## How to Run

### Step 1: Kill any running Work Time app

**macOS:**
```bash
pkill -f "Work Time" 2>/dev/null; pkill -f "Electron" 2>/dev/null
```

**Windows (PowerShell):**
```powershell
Get-Process | Where-Object {$_.ProcessName -match "Work Time|Electron"} | Stop-Process -Force
```

### Step 2: Start the agent with CDP debugging enabled

```bash
cd desktop-agent
npx electron . --remote-debugging-port=9222
```

Wait for the app to fully load (login should auto-restore).

### Step 3: Run the tests

**Full E2E test suite** (~5 min, covers everything):
```bash
node test/e2e/test-runner.js
```

**Quick verification** (~5 sec, checks all systems):
```bash
node test/e2e/quick-verify.js
```

**Run a single phase:**
```bash
node test/e2e/test-runner.js --phase=1        # Connectivity only
node test/e2e/test-runner.js --phase=2        # Start timer
node test/e2e/test-runner.js --phase=active   # Active tracking
node test/e2e/test-runner.js --phase=C        # Screenshot capture
node test/e2e/test-runner.js --phase=idle     # Idle detection
node test/e2e/test-runner.js --phase=A        # Active-Idle-Active
node test/e2e/test-runner.js --phase=D        # Pause/Resume
node test/e2e/test-runner.js --phase=dup      # Duplicate prevention
node test/e2e/test-runner.js --phase=B        # Multi-session totals
node test/e2e/test-runner.js --phase=verify   # All-systems verify
node test/e2e/test-runner.js --phase=dash     # Dashboard stopped state
```

**Skip stale recovery test:**
```bash
node test/e2e/test-runner.js --skip-recovery
```

### Step 4: Database verification

Run the queries in `db-verify-queries.sql` via Supabase SQL editor.
Replace `<USER_ID>`, `<SESSION_ID>`, and `<TEST_START>` with actual values from the test output.

## Test Phases

| Phase | What it tests | Duration |
|-------|--------------|----------|
| 1 | CDP connectivity, electronAPI, session restore | 2s |
| 2 | Start timer, project selection | 10s |
| active | Mouse/keyboard/app/URL/screenshot subsystems | 30s |
| C | Force screenshot via IPC | 5s |
| idle | Idle detection after 70s inactivity | 70s |
| A | Resume from idle, stop timer, time accuracy | 35s |
| D | Pause tracking, wait 15s, resume, stop | 40s |
| E | Stale session recovery | 10s |
| dup | Duplicate session prevention | 10s |
| B | Multi-session daily totals | 2s |
| dash | All dashboard cards in stopped state | 2s |
| verify | All-systems check (while tracking) | 5s |

## What to Check on Windows

1. **Keyboard tracking** -- type in any app, verify keys > 0 in quick-verify
2. **App detection** -- switch between apps, check appTracking in dashboard
3. **URL detection** -- browse in Chrome/Edge, check urlTracking
4. **Screenshots** -- wait for interval, verify upload
5. **Idle detection** -- leave idle 60s+, confirm idle log
6. **Start/Stop** -- verify clean start and stop cycles
7. **Multiple sessions** -- stop and restart, confirm totals are correct
