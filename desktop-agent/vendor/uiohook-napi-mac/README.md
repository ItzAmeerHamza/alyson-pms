# Patched uiohook-napi for macOS

Mac builds ship these binaries in place of the stock
`node_modules/uiohook-napi/prebuilds/darwin-*/node.napi.node`.

## Why

Stock libuiohook installs an active keyboard tap. macOS holds every key press,
in every app, until the tap returns. For each key press the tap waits on the
Electron main thread to look up the typed character (`dispatch_sync_f` onto the
main queue). Any time Tavilo's main thread was busy, typing stalled
system-wide. Past about 1 second, macOS switched the tap off and those keys were lost.

We only count key presses, so the patch skips that character lookup and the
matching main-thread wait for media keys. The tap mode is unchanged, so no new
macOS permission is needed.

## Files

- `libuiohook-no-main-thread-wait.patch`: source change against uiohook-napi 1.5.5
- `darwin-arm64/`, `darwin-x64/`: built binaries (N-API, Electron 28 headers,
  min macOS 11.0 / 10.15, same as stock)
- `SHA256SUMS`: the packaging step refuses an app that doesn't carry these

## Rebuild

```bash
bash scripts/build-uiohook-patched.sh
```
