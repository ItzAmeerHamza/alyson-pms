#!/usr/bin/env swift
/**
 * macOS Input Helper — Accessibility-based input monitor
 *
 * Uses CGEvent tap for key detection (works under hardened runtime with Accessibility)
 * and NSEvent.addGlobalMonitorForEvents for clicks/movement.
 *
 * Outputs JSON events to stdout, one per line:
 *   {"type":"key","timestamp":1234567890.123,"platform":"macos","keycode":0}
 *   {"type":"click","timestamp":1234567890.123,"platform":"macos","button":"left"}
 *   {"type":"move","timestamp":1234567890.123,"platform":"macos","dx":10.0,"dy":5.0}
 *   {"type":"activity_summary","timestamp":...,"platform":"macos","activity_percent":85.0,"active_seconds":51}
 *   {"type":"idle","timestamp":...,"platform":"macos"}
 *   {"type":"started","timestamp":...,"platform":"macos","message":"..."}
 *
 * Exit codes:
 *   0 = normal shutdown
 *   1 = generic failure
 *   2 = Accessibility permission denied
 */

import Cocoa
import Foundation

// MARK: - JSON output helpers

func emitJSON(_ dict: [String: Any]) {
    var d = dict
    if d["timestamp"] == nil { d["timestamp"] = Date().timeIntervalSince1970 }
    if d["platform"] == nil { d["platform"] = "macos" }
    if let data = try? JSONSerialization.data(withJSONObject: d, options: []),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

// MARK: - Permission check

func isAccessibilityGranted() -> Bool {
    return AXIsProcessTrusted()
}

/// Wait for Accessibility on THIS helper binary (separate from the Electron app in installed builds).
/// Shows the system prompt once, then polls until granted or timeout.
func waitForAccessibilityGranted(maxWaitSeconds: Int = 90) -> Bool {
    if AXIsProcessTrusted() { return true }

    let promptOptions = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(promptOptions)

    emitJSON([
        "type": "permission_prompt",
        "message": "Enable Accessibility for the Alyson PM input helper in System Settings",
        "fix": "System Settings → Privacy & Security → Accessibility → enable Alyson PM (and macos-input-helper if listed)"
    ])

    let deadline = Date().addingTimeInterval(TimeInterval(maxWaitSeconds))
    while Date() < deadline {
        if AXIsProcessTrusted() { return true }
        Thread.sleep(forTimeInterval: 1.0)
    }
    return AXIsProcessTrusted()
}

// MARK: - CGEvent tap callback (must be a top-level function for C interop)

/// CGEvent tap callback for key events.
/// Uses Accessibility permission — works under hardened runtime (unlike NSEvent keyDown).
func keyEventCallback(
    proxy: CGEventTapProxy,
    type: CGEventType,
    event: CGEvent,
    refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    guard let refcon = refcon else {
        return Unmanaged.passRetained(event)
    }
    let monitor = Unmanaged<InputMonitor>.fromOpaque(refcon).takeUnretainedValue()

    if type == .keyDown {
        guard monitor.running else { return Unmanaged.passRetained(event) }
        let now = Date().timeIntervalSince1970
        monitor.activityMap.insert(Int(now))
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        emitJSON([
            "type": "key",
            "timestamp": now,
            "keycode": keycode
        ])
    }

    // macOS may disable the tap under high load — re-enable it
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = monitor.keyEventTap {
            CGEvent.tapEnable(tap: tap, enable: true)
            emitJSON(["type": "warning", "message": "CGEvent tap was disabled, re-enabled"])
        }
    }

    return Unmanaged.passRetained(event)
}

// MARK: - Main monitor class

class InputMonitor {
    var running = true
    var activityMap = Set<Int>()        // seconds with activity (for activity_summary)
    var lastMousePos: NSPoint?
    var monitors: [Any?] = []
    var activityTimer: Timer?
    var keyEventTap: CFMachPort?        // CGEvent tap for key monitoring

    func start() {
        if !waitForAccessibilityGranted(maxWaitSeconds: 90) {
            emitJSON([
                "type": "permission_denied",
                "message": "Accessibility permission required for input tracking helper",
                "fix": "System Settings → Privacy & Security → Accessibility → enable Alyson PM and macos-input-helper if shown"
            ])
            exit(2) // Exit code 2 = permission denied
        }

        emitJSON(["type": "init", "message": "macOS input helper starting (Accessibility mode)"])

        // ---- Key Down detection (multiple methods for reliability) ----
        let keyEventMask: CGEventMask = (1 << CGEventType.keyDown.rawValue)
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        var cgTapWorking = false

        // Method 1: CGEvent tap (most reliable when it works)
        if let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .listenOnly,
            eventsOfInterest: keyEventMask,
            callback: keyEventCallback,
            userInfo: refcon
        ) {
            self.keyEventTap = tap
            let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
            CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            cgTapWorking = true
            emitJSON(["type": "init", "message": "CGEvent tap for keyDown created successfully"])
        } else {
            emitJSON(["type": "warning", "message": "CGEvent tap creation failed — using NSEvent fallback for keys"])
        }

        // Method 2: NSEvent keyDown monitor (fallback — may work on some builds)
        let keyDownMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self = self, self.running else { return }
            // If CGEvent tap is working, skip to avoid double-counting
            if cgTapWorking { return }
            let now = Date().timeIntervalSince1970
            self.activityMap.insert(Int(now))
            emitJSON([
                "type": "key",
                "timestamp": now,
                "keycode": Int(event.keyCode),
                "source": "nsEvent"
            ])
        }
        monitors.append(keyDownMonitor)

        // Method 3: flagsChanged (detects modifier keys: Shift, Ctrl, Option, Command)
        let flagsMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            guard let self = self, self.running else { return }
            let now = Date().timeIntervalSince1970
            self.activityMap.insert(Int(now))
            emitJSON([
                "type": "key",
                "timestamp": now,
                "keycode": Int(event.keyCode),
                "source": "flagsChanged"
            ])
        }
        monitors.append(flagsMonitor)

        // ---- Mouse clicks (left + right) via NSEvent (works fine under hardened runtime) ----
        let leftClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] event in
            guard let self = self, self.running else { return }
            let now = Date().timeIntervalSince1970
            self.activityMap.insert(Int(now))
            emitJSON([
                "type": "click",
                "timestamp": now,
                "button": "left"
            ])
        }
        monitors.append(leftClickMonitor)

        let rightClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
            guard let self = self, self.running else { return }
            let now = Date().timeIntervalSince1970
            self.activityMap.insert(Int(now))
            emitJSON([
                "type": "click",
                "timestamp": now,
                "button": "right"
            ])
        }
        monitors.append(rightClickMonitor)

        // ---- Mouse movement (with threshold to filter micro-movements) ----
        let moveMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            guard let self = self, self.running else { return }
            let now = Date().timeIntervalSince1970
            self.activityMap.insert(Int(now))

            let loc = NSEvent.mouseLocation
            if let last = self.lastMousePos {
                let dx = abs(loc.x - last.x)
                let dy = abs(loc.y - last.y)
                // Only emit if movement > 2 pixels (same threshold as old Python script)
                if dx > 2 || dy > 2 {
                    emitJSON([
                        "type": "move",
                        "timestamp": now,
                        "dx": dx,
                        "dy": dy
                    ])
                    self.lastMousePos = loc
                }
            } else {
                self.lastMousePos = loc
            }
        }
        monitors.append(moveMonitor)

        // ---- Activity summary every 60 seconds ----
        activityTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self = self, self.running else { return }
            let now = Int(Date().timeIntervalSince1970)
            let pastMinute = self.activityMap.filter { now - $0 < 60 }
            let activeSeconds = pastMinute.count
            let activityPercent = (Double(activeSeconds) / 60.0) * 100.0

            emitJSON([
                "type": "activity_summary",
                "activity_percent": round(activityPercent * 100) / 100,
                "active_seconds": activeSeconds
            ])

            if activeSeconds == 0 {
                emitJSON(["type": "idle"])
            }

            // Trim old entries (keep last 120s for safety)
            self.activityMap = Set(self.activityMap.filter { now - $0 < 120 })
        }

        emitJSON(["type": "started", "message": "macOS input monitoring started successfully (Accessibility mode, CGEvent tap for keys)"])
    }

    func stop() {
        running = false
        activityTimer?.invalidate()

        // Remove NSEvent monitors (clicks, moves)
        for m in monitors {
            if let monitor = m {
                NSEvent.removeMonitor(monitor)
            }
        }
        monitors.removeAll()

        // Disable and release CGEvent tap (keys)
        if let tap = keyEventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
            keyEventTap = nil
        }

        emitJSON(["type": "stopped", "message": "macOS input monitoring stopped"])
    }
}

// MARK: - Signal handling & entry point

let monitor = InputMonitor()

signal(SIGINT) { _ in
    emitJSON(["type": "signal", "message": "Received SIGINT, shutting down"])
    monitor.stop()
    exit(0)
}
signal(SIGTERM) { _ in
    emitJSON(["type": "signal", "message": "Received SIGTERM, shutting down"])
    monitor.stop()
    exit(0)
}

// We need an NSApplication run loop for global event monitors to work
let app = NSApplication.shared
// Don't show in Dock (agent-style)
app.setActivationPolicy(.accessory)

monitor.start()

// Run the event loop (blocks until app quits)
app.run()
