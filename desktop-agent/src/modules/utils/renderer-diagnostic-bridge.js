/**
 * Pipe renderer console / structured tracker events into the main diagnostic
 * JSONL sink (same files uploaded to S3). Without this, display bugs like the
 * live-rollover 22h phantom are invisible in production logs.
 */

const { ipcMain } = require('electron');

const INTERESTING =
  /\[TRACKER\]|\[RENDERER\]|\[TIMEZONE\]|Work-day|work-day|high-water|Clamping|phantom|rollover/i;

function writeRendererLine(level, message, ctx = {}) {
  try {
    const text = String(message || '').slice(0, 4000);
    const line = `${new Date().toISOString()} [${String(level).toUpperCase()}] [RENDERER] ${text}`;
    // Tee through console so installConsoleFileTee → .log + .jsonl
    if (level === 'error') console.error(line, ctx && Object.keys(ctx).length ? ctx : '');
    else if (level === 'warn') console.warn(line, ctx && Object.keys(ctx).length ? ctx : '');
    else console.log(line, ctx && Object.keys(ctx).length ? ctx : '');
  } catch (_) { /* best-effort */ }
}

function electronConsoleLevel(level) {
  // Electron: 0=debug, 1=log/info, 2=warning, 3=error
  if (level >= 3) return 'error';
  if (level === 2) return 'warn';
  if (level === 1) return 'info';
  return 'debug';
}

function shouldForwardConsoleMessage(level, message) {
  if (level >= 2) return true; // warn + error always
  if (level === 1 && INTERESTING.test(message || '')) return true;
  return false;
}

function attachConsoleMessageHook(webContents) {
  if (!webContents || webContents.isDestroyed() || webContents.__alysonRendererLogHooked) return;
  webContents.__alysonRendererLogHooked = true;
  webContents.on('console-message', (_event, level, message, line, sourceId) => {
    try {
      if (!shouldForwardConsoleMessage(level, message)) return;
      writeRendererLine(electronConsoleLevel(level), message, {
        line,
        source: sourceId ? String(sourceId).slice(-120) : undefined,
      });
    } catch (_) { /* ignore */ }
  });
}

function installRendererDiagnosticBridge() {
  if (global._rendererDiagnosticBridgeInstalled) return;
  global._rendererDiagnosticBridgeInstalled = true;

  try {
    ipcMain.removeHandler('renderer-diagnostic-log');
  } catch (_) { /* ignore */ }

  ipcMain.handle('renderer-diagnostic-log', async (_event, payload = {}) => {
    const level = payload.level || 'info';
    const message = payload.message || '';
    const ctx = payload.ctx && typeof payload.ctx === 'object' ? payload.ctx : {};
    writeRendererLine(level, message, ctx);
    return { ok: true };
  });

  try {
    const { app, BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win && !win.isDestroyed()) attachConsoleMessageHook(win.webContents);
    });
    app.on('browser-window-created', (_e, win) => {
      if (win && !win.isDestroyed()) attachConsoleMessageHook(win.webContents);
    });
  } catch (err) {
    console.warn('⚠️ [RENDERER-LOG] Failed to attach console hooks:', err?.message || err);
  }

  console.log('✅ [RENDERER-LOG] Renderer diagnostic bridge installed');
}

module.exports = {
  installRendererDiagnosticBridge,
  attachConsoleMessageHook,
};
