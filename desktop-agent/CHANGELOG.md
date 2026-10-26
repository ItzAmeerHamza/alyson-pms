# Changelog

All notable changes to the desktop agent will be documented in this file.

## [Unreleased]

## [1.1.2] - 2026-10-26

### Fixed
- Opening the app no longer downloads the Mac installer. The update stays inside the app: it downloads the ZIP and replaces Tavilo Time in place, keeping Screen Recording and Accessibility. The DMG opens only if someone clicks Download Installer.

## [1.1.1] - 2026-10-26

### Added
- Auto-clickers and machine-regular typing no longer count as activity, and they no longer keep a session looking active.
- Personal settings for start at login, opening the window at login, the start reminder, notifications, the menu bar timer, and the Windows close button.

### Changed
- On Windows and Linux, the window X asks whether to keep tracking in the background or quit. The macOS red button still hides the window.
- Mac builds ship the patched keyboard hook so keystrokes are not dropped. The app stays non-notarized, signed with Alyson PM Code Signing, on the same bundle id, and updates in place.

### Fixed
- Idle ends when tracking stops, including after the lid closes and the machine wakes later.
- Screenshot and diagnostic uploads retry without blocking the timer.

## [1.0.250] - 2026-10-19

### Changed
- New Tavilo logo in the Dock, menu bar, tray, and window. Mac and Windows use the same rounded color tile, drawn at each size so the mark stays sharp.

### Fixed
- Intel Mac builds now include x64 native modules. 1.0.249 shipped Apple Silicon binaries in the Intel app, which broke input detection and image stitching on Intel Macs.
- Auto-update still replaces the app in place. The bundle id stays `com.alyson.work-time-agent` and the build is signed with Alyson PM Code Signing, so Screen Recording and Accessibility stay granted.
- Windows auto-update no longer starts a second installer or replaces files while the app is quitting. The update installs on the next launch.
- Sleep, idle, and stop handling so a closed session does not keep billing, and today's totals stay aligned with what was actually tracked.

## [1.0.249] - 2026-10-12

### Added
- **Report an issue**: Sidebar form that sends category, notes, and local diagnostics to Pulse (needs backend migration `035_issue_reports`).

### Fixed
- **Auto-update after Tavilo rename**: On every restart the app checks GitHub, downloads, and installs in place (same `com.alyson.work-time-agent` bundle id and Alyson PM Code Signing) so Screen Recording / Accessibility stay granted. Install waits only while the timer is running, then applies on Stop or Quit. Mac staged ZIP path is persisted across restarts so a downloaded update is not lost.
- **Windows `ffmpeg.dll was not found`**: After the Alyson PM → Tavilo Time rename, silent update could relaunch the new `.exe` from a half-written install folder. Setup now waits for `ffmpeg.dll` before launch, and the post-update relaunch only starts an exe that has Chromium DLLs beside it.
- **Mac: crash + every window un-minimizes**: Rebrand startup renamed the live `.app` and ran `killall Dock`, which crashed/relaunched Tavilo and restored minimized windows across the desktop. Rename is deferred until quit; Dock is no longer killed.
- **Mac Dock icon**: Prefer `Contents/Resources/icon.icns` (outside asar). Loading `.icns` from inside `app.asar` failed after the Tavilo rebrand.
- **Mac python-libs packaging**: Unpack `python-libs` in the Mac build and run the PyObjC bundle step in `prebuild:mac` so system Python can import Quartz. Input still uses `macos-input-helper` when present.
- **Poisoned offline Stop queue**: After repeated ISE/timeouts on `update_time_log`, a closed row with the same UUID is upserted via `create_time_log` (ON CONFLICT). Missing `start_time` is recovered from the time ledger / checkpoint / sibling create so Salman-style ISE storms (attempt 200+) can drain. If update and upsert both fail but RDS already has `end_time` ≥ the local billed end, the queue item is drained (never when remote end is shorter).

## [1.0.248] - 2026-10-09

### Fixed
- Auto-update no longer leaves a second **Alyson PM** app next to **Tavilo Time**. A leftover copy is removed, and later updates stay on the Tavilo Time app.

## [1.0.247] - 2026-10-09

### Changed
- The app logo now sits on a white rounded square, matching the menu bar icon. The Dock refreshes once after this update so the new mark shows up.

## [1.0.246] - 2026-10-09

### Fixed
- The Mac Dock and Finder now show **Tavilo Time** and the new icon. The app folder is renamed in place, so Screen Recording and Accessibility stay granted.

## [1.0.245] - 2026-10-09

### Changed
- The desktop app is now **Tavilo Time** (name, icon, and on-screen text). Installed apps still update in place. Screen Recording and Accessibility stay on the same bundle id and signing identity. Saved data stays in the existing app folder.

### Fixed
- Tavilo Coach answers plain questions, including arithmetic, without turning them into a time-tracking reply.

## [1.0.244] - 2026-09-17

### Added
- **Password in the app**: Invited users can set a password on first login. Forgot password (email code) and Change Password work in the sidebar — same password as app.alyson.ai.
- **Tavilo Coach**: New sidebar page with a daily hours briefing and chat.
- Closing the window (X) hides to the tray and **keeps tracking**. Only Stop, Quit, or lid/idle close the session.

### Fixed
- A leftover Stop no longer kills a newer Start (clock going dead after 2–3 seconds).
- Tray “today” time no longer jumps up from phantom high-water after sleep.
- Offline time logs and screenshots stay on disk and retry with jittered backoff instead of a 10s stampede.
- Screenshot upload no longer blocks Start/Stop.

## [1.0.243] - 2026-09-11

### Fixed
- **Stop / retry queue**: A successful online Stop no longer leaves the session in `offline-time-logs.json`. That leftover queue was retried every 10s (`Internal server error`), reheated the laptop, and made Stop/Start feel automatic. After a live write the row is marked synced so wake will not replay it (no phantom extra hours). Failed closes still retry the same UUID.
- **Not-tracking reminder**: Idle-prompt overlay flags are always cleared after timeout/sleep, so the Start reminder can surface again (was stuck for hours). Repeat while off is 5 minutes.

## [1.0.242] - 2026-09-07

### Fixed
- **Auto-update**: Mac in-place update no longer jumps to “drag to Applications” after a full disk or a failed ZIP download. Retry stays in-app; low-disk shows a space error instead of a DMG fallback.

## [1.0.241] - 2026-09-07

### Improved
- **Energy / battery**: Slower URL and app-detection polls (2 min active, 3 min idle), longer URL tab cache, staggered polls, and less renderer IPC — no change to time counting or screenshot cadence (2/10 min).
- **Startup UX**: Loader on launch instead of blank screen; screenshot viewer closes reliably and no longer appears in captured screenshots.
- **Auto-update**: Packaged Mac and Windows builds auto-download updates on check (startup, every 6 hours, and when an update is detected). Mac in-place swap preserves code signature and TCC permissions where CI signing is present.

### Fixed
- Duplicate activity IPC timers and always-on feature-status polling (now only on Feature Status page).

## [Unreleased]

### Fixed
- **Timer Display**: Fixed bug where pressing Start did not immediately begin counting from 00:00:00
  - Timer now updates within 100ms of pressing Start instead of waiting 1 second
  - Unified start time across main process and renderer to ensure consistency
  - Added immediate timer updates to avoid 1-second delay before first tick
  - Guarded consolidated update handler to prevent timer overwrites with undefined values
  - No more 00:00:25 freeze or countdown appearing on session timer
- **Permission Checks**: Fixed timer getting stuck at random times (15+ seconds) due to blocking health checks
  - Health checks now run asynchronously in the background without blocking timer start
  - Timer starts immediately while permissions are checked in parallel
  - Added graceful handling of permission warnings without stopping the timer

### Added
- Unit tests for IPC timer functionality with fake timers
- Unit test for TrackingManager startTime consistency
