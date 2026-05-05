#!/usr/bin/env python3
"""
External Windows Input Monitor
Runs independently of Electron and outputs JSON events to stdout
"""

import time
import sys
import json
import signal
import threading
from datetime import datetime

# Import Windows-specific modules
try:
    import ctypes
    from ctypes import wintypes
    
    # Windows API - use_last_error=True for proper error reporting
    user32 = ctypes.WinDLL('user32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    
    # Hook constants
    WH_KEYBOARD_LL = 13
    WH_MOUSE_LL = 14
    WM_KEYDOWN = 0x0100
    WM_MOUSEMOVE = 0x0200
    WM_LBUTTONDOWN = 0x0201
    WM_RBUTTONDOWN = 0x0204
    
    # CRITICAL FIX: Define HHOOK and LRESULT for 64-bit Windows compatibility
    HHOOK = ctypes.c_void_p
    LRESULT = ctypes.c_longlong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
    
    # Function prototypes - FIXED: Use LRESULT return type for proper 64-bit compatibility
    LowLevelKeyboardProc = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
    LowLevelMouseProc = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
    
    # CRITICAL FIX: Configure Windows API function signatures for 64-bit compatibility
    # Without these, pointer values can be truncated on 64-bit systems causing hooks to fail
    user32.SetWindowsHookExW.argtypes = [ctypes.c_int, ctypes.c_void_p, wintypes.HINSTANCE, wintypes.DWORD]
    user32.SetWindowsHookExW.restype = HHOOK
    
    user32.UnhookWindowsHookEx.argtypes = [HHOOK]
    user32.UnhookWindowsHookEx.restype = wintypes.BOOL
    
    user32.CallNextHookEx.argtypes = [HHOOK, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
    user32.CallNextHookEx.restype = LRESULT
    
    user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
    user32.GetMessageW.restype = wintypes.BOOL
    
    user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.TranslateMessage.restype = wintypes.BOOL
    
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.DispatchMessageW.restype = LRESULT
    
    user32.PostQuitMessage.argtypes = [ctypes.c_int]
    user32.PostQuitMessage.restype = None
    
    kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
    kernel32.GetModuleHandleW.restype = wintypes.HMODULE
    
    WINDOWS_API_AVAILABLE = True
    
except ImportError as e:
    WINDOWS_API_AVAILABLE = False
    print(json.dumps({
        "type": "error",
        "message": f"Windows API not available: {e}",
        "timestamp": time.time()
    }), flush=True)

class WindowsInputMonitor:
    # Mouse hooks emit WM_MOUSEMOVE for every pointer tick — throttle so "move" counts reflect gestures, not pixels.
    MOVE_EMIT_MIN_INTERVAL_MS = 100

    def __init__(self):
        self.running = False
        self.activity_map = set()
        self.keyboard_hook = None
        self.mouse_hook = None
        self._last_move_emit_ms = 0
        
    def log_event(self, event_type, details=None):
        """Log an event to stdout as JSON"""
        event_data = {
            "type": event_type,
            "timestamp": time.time(),
            "platform": "windows"
        }
        if details:
            event_data.update(details)
            
        print(json.dumps(event_data), flush=True)
    
    def keyboard_callback(self, nCode, wParam, lParam):
        """Callback for keyboard hook"""
        try:
            # Only process if nCode >= 0 (HC_ACTION)
            if nCode >= 0:
                # WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_SYSKEYDOWN = 0x0104
                if wParam == WM_KEYDOWN or wParam == 0x0100 or wParam == 0x0104:
                    now = int(time.time())
                    self.activity_map.add(now)
                    self.log_event("key", {"wParam": wParam})
        except Exception as e:
            self.log_event("error", {"message": f"Keyboard callback error: {e}"})
        
        return user32.CallNextHookEx(None, nCode, wParam, lParam)
    
    def mouse_callback(self, nCode, wParam, lParam):
        """Callback for mouse hook"""
        try:
            # Only process if nCode >= 0 (HC_ACTION)
            if nCode >= 0:
                now = int(time.time())
                
                if wParam == WM_MOUSEMOVE:
                    self.activity_map.add(now)
                    now_ms = int(time.time() * 1000)
                    if now_ms - self._last_move_emit_ms >= self.MOVE_EMIT_MIN_INTERVAL_MS:
                        self._last_move_emit_ms = now_ms
                        self.log_event("move")
                elif wParam == WM_LBUTTONDOWN or wParam == 0x0201:
                    self.activity_map.add(now)
                    self.log_event("click", {"button": "left", "wParam": wParam})
                elif wParam == WM_RBUTTONDOWN or wParam == 0x0204:
                    self.activity_map.add(now)
                    self.log_event("click", {"button": "right", "wParam": wParam})
                elif wParam != WM_MOUSEMOVE:
                    # Log any non-move mouse events for debugging
                    self.log_event("mouse_debug", {"wParam": hex(wParam) if isinstance(wParam, int) else str(wParam)})
        except Exception as e:
            self.log_event("error", {"message": f"Mouse callback error: {e}"})
        
        return user32.CallNextHookEx(None, nCode, wParam, lParam)
    
    def activity_tracker(self):
        """Background thread to track activity percentage"""
        while self.running:
            try:
                time.sleep(60)  # Check every minute
                
                if not self.running:
                    break
                    
                now = int(time.time())
                past_minute = [t for t in self.activity_map if now - t < 60]
                stale = {t for t in self.activity_map if now - t >= 120}
                self.activity_map -= stale
                activity_percent = (len(set(past_minute)) / 60) * 100
                
                self.log_event("activity_summary", {
                    "activity_percent": round(activity_percent, 2),
                    "active_seconds": len(set(past_minute))
                })
                
                if not past_minute:
                    self.log_event("idle")
                    
            except Exception as e:
                self.log_event("error", {"message": f"Activity tracker error: {e}"})
    
    def start(self):
        """Start the input monitoring"""
        if not WINDOWS_API_AVAILABLE:
            self.log_event("error", {"message": "Cannot start - Windows API not available"})
            return False
            
        try:
            self.running = True
            
            # Get module handle first
            module_handle = kernel32.GetModuleHandleW(None)
            self.log_event("debug", {"message": f"Module handle: {module_handle}"})
            
            # Create keyboard hook - store callback to prevent GC
            self._keyboard_callback = LowLevelKeyboardProc(self.keyboard_callback)
            self.keyboard_hook = user32.SetWindowsHookExW(
                WH_KEYBOARD_LL,
                self._keyboard_callback,
                module_handle,
                0
            )
            
            if not self.keyboard_hook:
                error_code = ctypes.get_last_error()
                self.log_event("error", {"message": f"Failed to create keyboard hook, error code: {error_code}"})
                return False
            
            self.log_event("debug", {"message": f"Keyboard hook installed: {self.keyboard_hook}"})
            
            # Create mouse hook - store callback to prevent GC
            self._mouse_callback = LowLevelMouseProc(self.mouse_callback)
            self.mouse_hook = user32.SetWindowsHookExW(
                WH_MOUSE_LL,
                self._mouse_callback,
                module_handle,
                0
            )
            
            if not self.mouse_hook:
                error_code = ctypes.get_last_error()
                self.log_event("error", {"message": f"Failed to create mouse hook, error code: {error_code}"})
                user32.UnhookWindowsHookEx(self.keyboard_hook)
                return False
            
            self.log_event("debug", {"message": f"Mouse hook installed: {self.mouse_hook}"})
            
            # Start activity tracking thread
            activity_thread = threading.Thread(target=self.activity_tracker, daemon=True)
            activity_thread.start()
            
            self.log_event("started", {"message": "Windows input monitoring started successfully"})
            
            # Message loop
            msg = wintypes.MSG()
            while self.running:
                result = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
                if result == 0:  # WM_QUIT
                    break
                elif result == -1:  # Error
                    self.log_event("error", {"message": "GetMessage error"})
                    break
                else:
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))
            
            # Cleanup
            user32.UnhookWindowsHookEx(self.keyboard_hook)
            user32.UnhookWindowsHookEx(self.mouse_hook)
            
            return True
            
        except Exception as e:
            self.log_event("error", {"message": f"Failed to start monitoring: {e}"})
            return False
    
    def stop(self):
        """Stop the input monitoring"""
        self.running = False
        # Post quit message to exit message loop
        try:
            user32.PostQuitMessage(0)
        except:
            pass
        self.log_event("stopped", {"message": "Windows input monitoring stopped"})

def signal_handler(signum, frame):
    """Handle termination signals"""
    print(json.dumps({
        "type": "signal",
        "message": f"Received signal {signum}, shutting down",
        "timestamp": time.time()
    }), flush=True)
    sys.exit(0)

def main():
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create and start monitor
    monitor = WindowsInputMonitor()
    
    print(json.dumps({
        "type": "init",
        "message": "External Windows input monitor starting",
        "timestamp": time.time(),
        "windows_api_available": WINDOWS_API_AVAILABLE
    }), flush=True)
    
    if monitor.start():
        print(json.dumps({
            "type": "stopped",
            "message": "Monitor stopped normally",
            "timestamp": time.time()
        }), flush=True)
    else:
        print(json.dumps({
            "type": "error",
            "message": "Monitor failed to start",
            "timestamp": time.time()
        }), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main() 