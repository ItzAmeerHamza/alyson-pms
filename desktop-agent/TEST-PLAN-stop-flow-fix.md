# Test Plan: Stop Flow Fix

**Version:** Post-fix validation for stop sequence reorder + single stop entry
**Duration:** ~30 minutes total
**Prerequisite:** Build the desktop agent (`cd desktop-agent && npm start`)

---

## Pre-Test Setup

1. Open the desktop agent app
2. Log in with a valid account
3. Open DevTools console (View > Toggle Developer Tools) to monitor logs
4. Have the web admin open in a browser to cross-check time_logs and screenshots
5. Note the current time for all checks

---

## Test 1: Manual Start + 10 Min Active + Manual Stop

**Goal:** Verify the basic start/stop flow works correctly.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Click Start on a project | Console: `[TRACKING-MANAGER] Starting...`, tray shows tracking active |
| 1.2 | Use the computer normally for 10 minutes | Screenshots captured every ~3 min (3 per 10 min window) |
| 1.3 | Check web admin after 10 min | Time log exists with correct start_time, status=active, end_time=NULL |
| 1.4 | Check screenshots in web admin | 3 screenshots visible in the 10-min window, all with correct time_log_id |
| 1.5 | Click Stop (from UI button) | Console: `[GLOBAL] stopTracking called with reason: manual` |
| 1.6 | Verify stop console output | Must show: `[GRACEFUL-SHUTDOWN] Killing screenshot capture immediately (sync)` BEFORE `[GRACEFUL-SHUTDOWN] Updating database` |
| 1.7 | Check web admin | Time log: end_time set, status=completed, duration ~10 min |
| 1.8 | Wait 60 seconds after stop | NO new screenshots should appear. Console should NOT show any screenshot activity |

**Pass Criteria:**
- [ ] Screenshots stop IMMEDIATELY on stop (verify no screenshot logs after "Killing screenshot capture")
- [ ] Time log closed correctly in DB
- [ ] No "heartbeat" or "ensureNextScreenshotTimer" logs after stop

---

## Test 2: Manual Start + 10 Min Idle + Auto-Stop

**Goal:** Verify idle auto-stop works and screenshots stop immediately when it fires.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Click Start on a project | Tracking begins |
| 2.2 | Use computer normally for 2-3 min | A few screenshots captured |
| 2.3 | Note the exact time, then STOP touching mouse/keyboard | Idle detection begins |
| 2.4 | Wait 10 minutes without any input | Console: `[AUTO-STOP] Stopping: 10 min idle` |
| 2.5 | Verify auto-stop console output | Must show: `[GLOBAL] stopTracking called with reason: idle_timeout` and `endTimeOverride` |
| 2.6 | Verify screenshot kill is sync | Console: `Killing screenshot capture immediately (sync)` BEFORE `Updating database` |
| 2.7 | Check web admin | Time log: end_time = approximately when you stopped using keyboard (NOT 10 min later) |
| 2.8 | Wait 5 minutes (for session recovery cycle) | Console should NOT show session recovery restoring tracking |
| 2.9 | Move mouse / press keys | Nothing should happen — tracking stays stopped, user must manually restart |

**Pass Criteria:**
- [ ] Auto-stop fires after 10 min idle
- [ ] end_time is backdated to idle start (endTimeOverride)
- [ ] NO screenshots after auto-stop fires
- [ ] Session recovery does NOT restart tracking (check for `SYNC_SKIP_USER_STOPPED` in logs)
- [ ] Tray shows auto-stop notification

---

## Test 3: Tray Stop (Mac + Windows)

**Goal:** Verify tray stop routes through global.stopTracking.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Start tracking from tray menu | Tracking begins |
| 3.2 | Wait 2-3 min for screenshots | Screenshots captured |
| 3.3 | Click "Stop Tracking" from tray menu | Console: `[GLOBAL] stopTracking called with reason: manual` |
| 3.4 | Verify it goes through GSM | Console: `[GRACEFUL-SHUTDOWN] Starting graceful stop` |
| 3.5 | Verify screenshot sync kill | Console: `Killing screenshot capture immediately (sync)` before DB update |
| 3.6 | Check web admin | Time log closed correctly |

**Pass Criteria:**
- [ ] Tray stop uses global.stopTracking (NOT trackingManager directly)
- [ ] GSM stop sequence runs correctly

---

## Test 4: Screen Lock Stop (2 min grace)

**Goal:** Verify screen lock grace period and stop flow.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Start tracking | Tracking begins |
| 4.2 | Lock screen (Cmd+Ctrl+Q on Mac, Win+L on Windows) | Console: `Screen locked`, screenshots paused |
| 4.3 | Unlock within 30 seconds | Console: `Display wake - cancelled grace period, tracking continues` |
| 4.4 | Verify tracking continues | Screenshots resume, time log still active |
| 4.5 | Lock screen again | Grace timer starts |
| 4.6 | Stay locked for 2+ minutes | Console: `Screen lock grace period elapsed - stopping tracking` |
| 4.7 | Verify stop goes through GSM | Console: `[GLOBAL] stopTracking called with reason: screen_lock` |
| 4.8 | Unlock screen | Tracking stays stopped — user must manually restart |

**Pass Criteria:**
- [ ] Short lock (< 2 min) does not stop tracking
- [ ] Long lock (> 2 min) stops via global.stopTracking → GSM
- [ ] After unlock, tracking does NOT auto-restart

---

## Test 5: System Sleep/Resume

**Goal:** Verify laptop close immediately stops tracking.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Start tracking | Tracking begins |
| 5.2 | Close laptop lid (or put to sleep) | Console: `System suspended`, `stopTracking called with reason: system_sleep` |
| 5.3 | Open laptop / resume | Console: `System resumed` |
| 5.4 | Verify tracking is stopped | Tray shows not tracking, must manually restart |
| 5.5 | Check web admin | Time log closed with end_time around sleep time |

**Pass Criteria:**
- [ ] Sleep immediately stops tracking (no grace period)
- [ ] Resume does NOT auto-restart tracking
- [ ] Session recovery blocked by userExplicitlyStopped

---

## Test 6: Rapid Start/Stop Cycle

**Goal:** Verify no race conditions on quick start/stop.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Start tracking | Tracking begins |
| 6.2 | Immediately stop (within 5 seconds) | Clean stop, no errors |
| 6.3 | Immediately start again | New session created |
| 6.4 | Immediately stop again | Clean stop |
| 6.5 | Check web admin | 2 short time logs, both with end_time set, no overlaps |
| 6.6 | Wait 30 seconds | No phantom screenshots, no heartbeat activity |

**Pass Criteria:**
- [ ] No errors or exceptions in console
- [ ] No overlapping time logs
- [ ] No screenshots captured after final stop

---

## Test 7: Session Recovery Does Not Undo Stop

**Goal:** Verify the 5-minute session recovery health check cannot restart tracking.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Start tracking, wait 1 minute | Session active in DB |
| 7.2 | Stop tracking manually | Session closed in DB |
| 7.3 | Watch console for 6 minutes | Look for `HEALTH_CHECK` and `FORCE_SYNC` logs |
| 7.4 | Verify no restart | Console: `SYNC_SKIP_USER_STOPPED` or no sync activity at all |
| 7.5 | Verify global state | `global.isTracking` remains false throughout |

**Pass Criteria:**
- [ ] Health check runs but does NOT restore tracking
- [ ] `forceSyncSessionState` blocked by `userExplicitlyStopped`
- [ ] No screenshots after stop, even after recovery cycle runs

---

## Test 8: Full 20-Minute Flow (10 Active + 10 Idle)

**Goal:** End-to-end validation matching the original bug scenario.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1 | Note the exact time (T+0) | |
| 8.2 | Start tracking on a project | Session begins |
| 8.3 | Use computer actively for 10 minutes | ~3 screenshots per 10-min window |
| 8.4 | At T+10, note the time and STOP all input | Do not touch mouse or keyboard |
| 8.5 | At T+20, auto-stop should fire | Console: `idle_timeout` stop with endTimeOverride |
| 8.6 | Check console: screenshot kill is sync | `Killing screenshot capture immediately` before `Updating database` |
| 8.7 | Check web admin time log | Start = T+0, End = ~T+10 (backdated), Duration ~10 min |
| 8.8 | Check web admin screenshots | ~3 screenshots in T+0 to T+10 window. Screenshots from T+10 to T+20 should exist (captured during idle before auto-stop) but activity will be low/zero |
| 8.9 | After auto-stop, NO new screenshots | Zero screenshots after T+20 |
| 8.10 | Wait 5 more minutes | Session recovery does NOT restart tracking |
| 8.11 | Move mouse, verify tracking stays stopped | Must manually restart |
| 8.12 | Manually start tracking at T+25 | New session starts cleanly |
| 8.13 | Check web admin | Two sessions: T+0 to ~T+10, and T+25 to active. Gap between is expected. |

**Pass Criteria:**
- [ ] Active period: screenshots captured normally with activity data
- [ ] Idle period: screenshots may be captured (tracking still active) but with 0 activity
- [ ] Auto-stop: fires at T+20, end_time backdated to ~T+10
- [ ] Post auto-stop: ZERO screenshots, ZERO recovery restarts
- [ ] New session: starts cleanly with no leftover state

---

## Console Log Patterns to Verify

### On Stop (any reason):
```
[GLOBAL] stopTracking called with reason: <reason>
[GRACEFUL-SHUTDOWN] Starting graceful stop (reason: <reason>)
[GRACEFUL-SHUTDOWN] Updating local state...
[GRACEFUL-SHUTDOWN] Killing screenshot capture immediately (sync)...
[GRACEFUL-SHUTDOWN] Screenshot capture killed
[GRACEFUL-SHUTDOWN] Updating database...
[GRACEFUL-SHUTDOWN] Database updated successfully
[GRACEFUL-SHUTDOWN] Complete in <N>ms, success: true
```

### MUST NOT appear after stop:
```
HEARTBEAT
ensureNextScreenshotTimer
WINDOW SHOT
SCREENSHOT CAPTURE
STATE DESYNC DETECTED
SYNC_RESTORED
FORCE_SYNC_SUCCESS
```

---

## Bug Verification Checklist

The original bug: 23-minute gap (11:03-11:26) with screenshots captured during the gap.

After fix:
- [ ] Screenshots killed synchronously on stop — no captures during async DB update
- [ ] All stop paths (UI, tray, idle, sleep, lock) go through single entry point
- [ ] Heartbeat cannot re-arm timers during or after stop
- [ ] Session recovery cannot undo an intentional stop
- [ ] `forceSyncSessionState` blocked after intentional stop
