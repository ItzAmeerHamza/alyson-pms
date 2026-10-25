/**
 * What the window X does on Windows/Linux.
 *
 * Users could not find Quit (it lives in the tray menu, which Windows 11
 * hides behind the ^ arrow), so X now asks: keep running in the background,
 * or quit completely. macOS keeps its usual behavior (red button hides,
 * Cmd+Q / Dock quits).
 *
 * "Don't ask again" only ever remembers "keep running" — never Quit — so a
 * habit click on X can't silently stop someone's timer.
 */

const fs = require('fs');
const path = require('path');

const PREF_FILENAME = 'close-behavior.json';
const CHOICE = { BACKGROUND: 'background', QUIT: 'quit', CANCEL: 'cancel' };

let dialogOpen = false;

function prefPath() {
  try {
    const { app } = require('electron');
    if (app?.getPath) return path.join(app.getPath('userData'), PREF_FILENAME);
  } catch (_) { /* not in Electron (tests) */ }
  return null;
}

/** true when the user picked "Don't ask again" (always keep running). */
function isAskDisabled() {
  try {
    const p = prefPath();
    if (!p || !fs.existsSync(p)) return false;
    return JSON.parse(fs.readFileSync(p, 'utf8'))?.askOnClose === false;
  } catch (_) {
    return false; // unreadable file → ask, which is the safe default
  }
}

function setAskOnClose(ask) {
  try {
    const p = prefPath();
    if (!p) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      JSON.stringify({ askOnClose: !!ask, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  } catch (err) {
    console.warn('⚠️ [CLOSE-PROMPT] Could not save preference:', err?.message || err);
  }
}

/** Ask only on Windows/Linux, and never while the OS is shutting down. */
function shouldAsk(platform = process.platform) {
  if (platform === 'darwin') return false;
  if (global.isSystemShuttingDown) return false;
  return !isAskDisabled();
}

function buildDialogOptions(tracking) {
  return {
    type: 'question',
    title: 'Close Tavilo Time',
    message: tracking ? 'Your timer is still running.' : 'Close Tavilo Time?',
    detail: tracking
      ? 'Minimize the app to keep tracking, or quit to stop the timer and close the app.'
      : 'Minimize the app, or quit to close it completely.',
    buttons: [
      'Minimize the app',
      tracking ? 'Stop timer and quit' : 'Quit',
      'Cancel',
    ],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    checkboxLabel: "Don't ask again (always minimize the app)",
    checkboxChecked: false,
  };
}

/**
 * Show the prompt. Resolves to CHOICE.*. A second X click while the prompt
 * is up resolves to CANCEL so we never stack dialogs.
 */
async function askCloseChoice(win, { tracking, dialog } = {}) {
  if (dialogOpen) return CHOICE.CANCEL;
  dialogOpen = true;
  try {
    const dlg = dialog || require('electron').dialog;
    const options = buildDialogOptions(tracking);
    const parent = win && !win.isDestroyed?.() ? win : undefined;
    const { response, checkboxChecked } = parent
      ? await dlg.showMessageBox(parent, options)
      : await dlg.showMessageBox(options);

    if (checkboxChecked) setAskOnClose(false);
    if (response === 0) return CHOICE.BACKGROUND;
    if (response === 1) return CHOICE.QUIT;
    return CHOICE.CANCEL;
  } finally {
    dialogOpen = false;
  }
}

module.exports = {
  CHOICE,
  shouldAsk,
  askCloseChoice,
  isAskDisabled,
  setAskOnClose,
  buildDialogOptions,
  _resetForTests: () => { dialogOpen = false; },
};
