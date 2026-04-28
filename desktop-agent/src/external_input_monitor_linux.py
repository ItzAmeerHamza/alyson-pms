#!/usr/bin/env python3
"""
External Linux Input Monitor
Runs independently of Electron and outputs JSON events to stdout
Requires evdev: pip install evdev
"""

import time
import sys
import json
import signal
import threading
from datetime import datetime
import asyncio

# Import Linux-specific modules
try:
    from evdev import InputDevice, categorize, ecodes, list_devices
    import select
    
    EVDEV_AVAILABLE = True
    
except ImportError as e:
    EVDEV_AVAILABLE = False
    print(json.dumps({
        "type": "error",
        "message": f"evdev not available: {e}. Install with: pip install evdev",
        "timestamp": time.time()
    }), flush=True)

class LinuxInputMonitor:
    def __init__(self):
        self.running = False
        self.activity_map = set()
        self.devices = []
        
    def log_event(self, event_type, details=None):
        """Log an event to stdout as JSON"""
        event_data = {
            "type": event_type,
            "timestamp": time.time(),
            "platform": "linux"
        }
        if details:
            event_data.update(details)
            
        print(json.dumps(event_data), flush=True)
    
    def activity_tracker(self):
        """Background thread to track activity percentage"""
        while self.running:
            try:
                time.sleep(60)  # Check every minute
                
                if not self.running:
                    break
                    
                now = int(time.time())
                past_minute = [t for t in self.activity_map if now - t < 60]
                activity_percent = (len(set(past_minute)) / 60) * 100
                
                self.log_event("activity_summary", {
                    "activity_percent": round(activity_percent, 2),
                    "active_seconds": len(set(past_minute))
                })
                
                if not past_minute:
                    self.log_event("idle")
                    
            except Exception as e:
                self.log_event("error", {"message": f"Activity tracker error: {e}"})
    
    def setup_devices(self):
        """Set up input devices"""
        try:
            device_paths = list_devices()
            
            if not device_paths:
                self.log_event("error", {"message": "No input devices found"})
                return False
            
            for path in device_paths:
                try:
                    device = InputDevice(path)
                    
                    # Check if device has keyboard or mouse capabilities
                    capabilities = device.capabilities()
                    
                    # Check for keyboard events (key presses)
                    has_keys = ecodes.EV_KEY in capabilities
                    
                    # Check for mouse events (relative movement)
                    has_rel = ecodes.EV_REL in capabilities
                    
                    if has_keys or has_rel:
                        self.devices.append(device)
                        device_info = {
                            "path": path,
                            "name": device.name,
                            "has_keys": has_keys,
                            "has_rel": has_rel
                        }
                        self.log_event("device_added", device_info)
                        
                except (OSError, PermissionError) as e:
                    # Skip devices we can't access
                    continue
            
            if not self.devices:
                self.log_event("error", {
                    "message": "No accessible input devices found. Try running with sudo or add user to input group."
                })
                return False
            
            self.log_event("info", {"message": f"Monitoring {len(self.devices)} input devices"})
            return True
            
        except Exception as e:
            self.log_event("error", {"message": f"Failed to setup devices: {e}"})
            return False
    
    def monitor_device(self, device):
        """Monitor a single device for events"""
        try:
            while self.running:
                # Use select to avoid blocking forever
                r, w, x = select.select([device], [], [], 1)
                
                if not r:
                    continue  # Timeout, check if still running
                
                for event in device.read():
                    now = int(time.time())
                    self.activity_map.add(now)
                    
                    if event.type == ecodes.EV_KEY:
                        # Keyboard event
                        if event.value == 1:  # Key press (not release)
                            self.log_event("key", {
                                "device": device.name,
                                "keycode": event.code
                            })
                    
                    elif event.type == ecodes.EV_REL:
                        # Mouse movement event
                        if event.code == ecodes.REL_X or event.code == ecodes.REL_Y:
                            self.log_event("move", {
                                "device": device.name,
                                "axis": "x" if event.code == ecodes.REL_X else "y",
                                "value": event.value
                            })
                    
                    elif event.type == ecodes.EV_KEY and event.code in [ecodes.BTN_LEFT, ecodes.BTN_RIGHT, ecodes.BTN_MIDDLE]:
                        # Mouse button event
                        if event.value == 1:  # Button press (not release)
                            button_map = {
                                ecodes.BTN_LEFT: "left",
                                ecodes.BTN_RIGHT: "right",
                                ecodes.BTN_MIDDLE: "middle"
                            }
                            self.log_event("click", {
                                "device": device.name,
                                "button": button_map.get(event.code, "unknown")
                            })
                        
        except OSError:
            # Device disconnected
            self.log_event("warning", {"message": f"Device {device.name} disconnected"})
        except Exception as e:
            self.log_event("error", {"message": f"Error monitoring device {device.name}: {e}"})
    
    def start(self):
        """Start the input monitoring"""
        if not EVDEV_AVAILABLE:
            self.log_event("error", {"message": "Cannot start - evdev not available"})
            return False
        
        try:
            self.running = True
            
            # Setup input devices
            if not self.setup_devices():
                return False
            
            # Start activity tracking thread
            activity_thread = threading.Thread(target=self.activity_tracker, daemon=True)
            activity_thread.start()
            
            # Start monitoring threads for each device
            monitor_threads = []
            for device in self.devices:
                thread = threading.Thread(
                    target=self.monitor_device,
                    args=(device,),
                    daemon=True
                )
                thread.start()
                monitor_threads.append(thread)
            
            self.log_event("started", {
                "message": "Linux input monitoring started successfully",
                "device_count": len(self.devices)
            })
            
            # Main loop - just wait for interruption
            try:
                while self.running:
                    time.sleep(1)
            except KeyboardInterrupt:
                self.stop()
            
            # Wait for threads to finish
            for thread in monitor_threads:
                thread.join(timeout=1)
            
            return True
            
        except Exception as e:
            self.log_event("error", {"message": f"Failed to start monitoring: {e}"})
            return False
    
    def stop(self):
        """Stop the input monitoring"""
        self.running = False
        
        # Close all devices
        for device in self.devices:
            try:
                device.close()
            except:
                pass
        
        self.log_event("stopped", {"message": "Linux input monitoring stopped"})

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
    monitor = LinuxInputMonitor()
    
    print(json.dumps({
        "type": "init",
        "message": "External Linux input monitor starting",
        "timestamp": time.time(),
        "evdev_available": EVDEV_AVAILABLE
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