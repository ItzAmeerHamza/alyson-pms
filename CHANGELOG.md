# Changelog

Desktop release notes in detail: [desktop-agent/CHANGELOG.md](desktop-agent/CHANGELOG.md).

Installers for these versions are on [revcloud/alyson-td-releases](https://github.com/revcloud/alyson-td-releases). Source is [revcloud/alyson-pms-src](https://github.com/revcloud/alyson-pms-src). `main` is at `3c41f84` (16 Nov 2026), which is after the 1.1.3 release tag.

## [1.1.3] - 2026-10-26

### Fixed

- The update screen no longer offers an installer. Tavilo Time replaces itself. Screen Recording and Accessibility stay granted.

## [1.1.2] - 2026-10-26

### Fixed

- Opening the app no longer downloads the Mac installer. The update downloads a ZIP and replaces Tavilo Time in place. The DMG opens only if someone clicks Download Installer.

## [1.1.1] - 2026-10-26

### Added

- Auto-clickers and machine-regular typing no longer count as activity.
- Personal settings for start at login, the start reminder, notifications, and the menu-bar timer.

### Fixed

- Idle ends when tracking stops, including after the lid closes and the machine wakes.
- Screenshot and diagnostic uploads retry without blocking the timer.
- Mac builds ship the patched keyboard hook. The app stays non-notarized, on the same bundle id, and updates in place.

## [1.0.250] - 2026-10-19

### Changed

- Dock, menu bar, tray, and window use the Tavilo logo.

### Fixed

- Intel Mac builds include x64 native modules. 1.0.249 had shipped Apple Silicon binaries inside the Intel app.
- Windows auto-update no longer starts a second installer while the app is quitting.
- Sleep, idle, and stop handling so a closed session does not keep billing.
