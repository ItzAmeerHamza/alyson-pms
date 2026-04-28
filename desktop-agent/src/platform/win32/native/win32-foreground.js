/**
 * Native Win32 foreground window utilities using ffi-napi
 * Provides low-latency foreground detection without PowerShell
 * 
 * IMPORTANT: This module requires ffi-napi and ref-napi to be installed and built.
 * If these dependencies are missing, the parent module should handle the error gracefully.
 */

let ffi, ref, user32;

try {
  ffi = require('ffi-napi');
  ref = require('ref-napi');
  
  // Types
  const voidPtr = ref.refType(ref.types.void);
  const intPtr = ref.refType(ref.types.int);
  const uint32 = ref.types.uint32;
  const uint32Ptr = ref.refType(uint32);

  // User32 bindings
  user32 = ffi.Library('user32', {
    GetForegroundWindow: [voidPtr, []],
    GetWindowThreadProcessId: ['uint32', [voidPtr, uint32Ptr]],
    GetWindowTextW: ['int', [voidPtr, 'pointer', 'int']],
  });
} catch (err) {
  console.error('[WIN32-FOREGROUND] Failed to load native dependencies:', err.message);
  console.error('[WIN32-FOREGROUND] App will use PowerShell fallback methods');
  // Export null functions so module can still be loaded
  module.exports = {
    getForegroundWindowInfo: () => null,
    getProcessNameByPid: () => null
  };
  return; // Exit early
}

const child_process = require('child_process');

function readWideString(buffer) {
  try {
    // Buffer contains UTF-16LE characters
    const str = buffer.toString('ucs2').replace(/\u0000+$/g, '');
    return str;
  } catch (_e) {
    return '';
  }
}

/**
 * Get the foreground window title and pid via Win32 API
 * @returns {{ hwnd:number, pid:number, title:string }|null}
 */
function getForegroundWindowInfo() {
  try {
    const hwndPtr = user32.GetForegroundWindow();
    if (ref.isNull(hwndPtr)) return null;

    const pidBuf = ref.alloc(uint32);
    user32.GetWindowThreadProcessId(hwndPtr, pidBuf);
    const pid = pidBuf.deref();

    // Read window title (UTF-16LE)
    const maxChars = 512;
    const buf = Buffer.alloc(maxChars * 2); // 2 bytes per char
    const len = user32.GetWindowTextW(hwndPtr, buf, maxChars);
    let title = '';
    if (len > 0) {
      title = readWideString(buf.slice(0, len * 2));
    }

    // Convert pointer to integer handle if possible
    let hwnd = 0;
    try { hwnd = ref.address(hwndPtr); } catch { hwnd = 0; }

    return { hwnd, pid, title };
  } catch (_e) {
    return null;
  }
}

/**
 * Get process name for a PID using tasklist (fast, non-PowerShell)
 * @param {number} pid
 * @returns {string|null}
 */
function getProcessNameByPid(pid) {
  try {
    const cmd = `tasklist /fi "PID eq ${pid}" /fo csv /nh`;
    const out = child_process.execSync(cmd, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!out) return null;
    // CSV: "Image Name","PID","Session Name","Session#","Mem Usage"
    const first = out.split(/\r?\n/).filter(Boolean)[0] || '';
    const match = first.match(/"([^\"]+?)"\s*,/);
    if (match && match[1]) return match[1];
    return null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  getForegroundWindowInfo,
  getProcessNameByPid,
};







