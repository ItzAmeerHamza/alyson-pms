# Changelog

All notable changes to the desktop agent will be documented in this file.

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
