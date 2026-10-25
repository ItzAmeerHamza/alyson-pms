'use strict';

/**
 * Keeps unsent idle logs on disk (userData/idle-log-queue.json) so quitting
 * while offline does not lose them. A lost idle log means away time is
 * counted as worked time.
 *
 * Built to cost nothing in normal use:
 * - writes only when the queue actually changed, and that queue only fills
 *   while offline or when a save to the server fails;
 * - at most one write every SAVE_DELAY_MS, asynchronous, a few KB at most;
 * - written to a temp file and renamed, so a crash mid-write cannot corrupt it;
 * - one small synchronous read, the first time the queue is used;
 * - one tiny synchronous write on quit, only if something changed.
 */

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'idle-log-queue.json';
const SAVE_DELAY_MS = 5000;

let filePathOverride = null; // tests
let saveTimer = null;
let lastWritten = null;
let restored = false;
let quitHooked = false;

function filePath() {
  if (filePathOverride) return filePathOverride;
  try {
    const { app } = require('electron');
    if (app?.getPath) return path.join(app.getPath('userData'), FILE_NAME);
  } catch (_) { /* not in Electron */ }
  return null;
}

function currentQueue() {
  const q = global.offlineQueue;
  return q && typeof q === 'object' ? q : null;
}

function serialize(queue) {
  const items = Array.isArray(queue?.idleLogs) ? queue.idleLogs : [];
  return JSON.stringify(items);
}

function hookQuit() {
  if (quitHooked) return;
  quitHooked = true;
  try {
    const { app } = require('electron');
    app?.on?.('will-quit', () => saveNowSync());
  } catch (_) { /* not in Electron */ }
}

/**
 * Merge idle logs saved by a previous run into `queue` (once per run).
 * Must run before the first save, or the save would overwrite them.
 */
function ensureRestored(queue = currentQueue()) {
  if (restored || !queue) return 0;
  restored = true;
  hookQuit();
  const p = filePath();
  if (!p) return 0;
  let items = [];
  try {
    if (fs.existsSync(p)) items = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn('⚠️ [IDLE-QUEUE] Could not read saved idle logs:', err?.message || err);
    items = [];
  }
  if (!Array.isArray(items) || items.length === 0) {
    lastWritten = '[]';
    return 0;
  }
  const { enqueueIdleLogOnce } = require('./idle-log-period-key');
  let added = 0;
  for (const item of items) {
    if (enqueueIdleLogOnce(queue, item)) added += 1;
  }
  lastWritten = JSON.stringify(items);
  if (added) console.log(`💾 [IDLE-QUEUE] Restored ${added} unsent idle log(s) from the last run`);
  return added;
}

/** Queue changed: save soon (bundled, async). */
function scheduleSave() {
  hookQuit();
  ensureRestored();
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveAsync().catch(() => {});
  }, SAVE_DELAY_MS);
  if (typeof saveTimer.unref === 'function') saveTimer.unref();
}

async function saveAsync() {
  const p = filePath();
  const queue = currentQueue();
  if (!p || !queue) return false;
  const data = serialize(queue);
  if (data === lastWritten) return false;
  try {
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.promises.writeFile(tmp, data, 'utf8');
    await fs.promises.rename(tmp, p);
    lastWritten = data;
    return true;
  } catch (err) {
    console.warn('⚠️ [IDLE-QUEUE] Could not save idle logs:', err?.message || err);
    return false;
  }
}

/** Quit: write whatever is pending, only if it changed. */
function saveNowSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const p = filePath();
  const queue = currentQueue();
  if (!p || !queue || !restored) return false;
  const data = serialize(queue);
  if (data === lastWritten) return false;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    fs.writeFileSync(tmp, data, 'utf8');
    fs.renameSync(tmp, p);
    lastWritten = data;
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  ensureRestored,
  scheduleSave,
  saveAsync,
  saveNowSync,
  SAVE_DELAY_MS,
  _setFilePathForTests(p) {
    filePathOverride = p;
    saveTimer && clearTimeout(saveTimer);
    saveTimer = null;
    lastWritten = null;
    restored = false;
  },
};
