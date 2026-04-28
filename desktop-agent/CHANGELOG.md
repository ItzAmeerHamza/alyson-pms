# Changelog

All notable changes to the desktop agent will be documented in this file.

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
