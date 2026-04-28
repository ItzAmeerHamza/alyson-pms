/**
 * Detect process elevation using Win32 APIs via ffi-napi
 * 
 * IMPORTANT: This module requires ffi-napi and ref-napi to be installed and built.
 * If these dependencies are missing (e.g., on ARM64 Windows), gracefully degrade.
 */

let ffi, ref, kernel32, advapi32;
let voidPtr, HANDLE, DWORD, DWORDPtr;

try {
  ffi = require('ffi-napi');
  ref = require('ref-napi');

  voidPtr = ref.refType(ref.types.void);
  HANDLE = voidPtr;
  DWORD = ref.types.uint32;
  DWORDPtr = ref.refType(DWORD);

  // Constants
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const TOKEN_QUERY = 0x0008;
  const TokenElevation = 20; // TOKEN_INFORMATION_CLASS

  // kernel32
  kernel32 = ffi.Library('kernel32', {
    OpenProcess: [HANDLE, [DWORD, 'int', DWORD]],
    CloseHandle: ['int', [HANDLE]],
    GetCurrentProcess: [HANDLE, []],
  });

  // advapi32
  advapi32 = ffi.Library('advapi32', {
    OpenProcessToken: ['int', [HANDLE, DWORD, ref.refType(HANDLE)]],
    GetTokenInformation: ['int', [HANDLE, 'int', 'pointer', DWORD, DWORDPtr]],
  });
} catch (err) {
  console.error('[ELEVATION] Failed to load native dependencies:', err.message);
  console.error('[ELEVATION] Elevation detection will be disabled (safe fallback)');
  // Export null functions so module can still be loaded
  module.exports = {
    isProcessElevated: () => null,
    isCurrentProcessElevated: () => null
  };
  return; // Exit early
}

function isProcessElevated(pid) {
  let hProc = null;
  let hTok = null;
  try {
    hProc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid >>> 0);
    if (!hProc || ref.isNull(hProc)) return null;

    const tokenHandleBuf = Buffer.alloc(ref.sizeof.pointer);
    const okTok = advapi32.OpenProcessToken(hProc, TOKEN_QUERY, tokenHandleBuf);
    if (!okTok) return null;
    hTok = ref.readPointer(tokenHandleBuf, 0);
    if (!hTok || ref.isNull(hTok)) return null;

    const outBuf = Buffer.alloc(4);
    const retLen = Buffer.alloc(4);
    const okInfo = advapi32.GetTokenInformation(hTok, TokenElevation, outBuf, 4, retLen);
    if (!okInfo) return null;
    const elevated = outBuf.readUInt32LE(0) !== 0;
    return elevated;
  } catch (_e) {
    return null;
  } finally {
    try { if (hTok && !ref.isNull(hTok)) kernel32.CloseHandle(hTok); } catch {}
    try { if (hProc && !ref.isNull(hProc)) kernel32.CloseHandle(hProc); } catch {}
  }
}

function isCurrentProcessElevated() {
  let hProc = null;
  let hTok = null;
  try {
    hProc = kernel32.GetCurrentProcess();
    if (!hProc || ref.isNull(hProc)) return null;
    const tokenHandleBuf = Buffer.alloc(ref.sizeof.pointer);
    const okTok = advapi32.OpenProcessToken(hProc, TOKEN_QUERY, tokenHandleBuf);
    if (!okTok) return null;
    hTok = ref.readPointer(tokenHandleBuf, 0);
    if (!hTok || ref.isNull(hTok)) return null;
    const outBuf = Buffer.alloc(4);
    const retLen = Buffer.alloc(4);
    const okInfo = advapi32.GetTokenInformation(hTok, TokenElevation, outBuf, 4, retLen);
    if (!okInfo) return null;
    return outBuf.readUInt32LE(0) !== 0;
  } catch (_e) {
    return null;
  } finally {
    try { if (hTok && !ref.isNull(hTok)) kernel32.CloseHandle(hTok); } catch {}
  }
}

module.exports = {
  isProcessElevated,
  isCurrentProcessElevated,
};







