/**
 * Durable offline screenshots — files on disk, not base64 in offline-queue.json.
 *
 * Scale:
 *   - JPEG (~200KB) per shot, not a 1–2MB PNG / JSON blob
 *   - one upload at a time, at most MAX_FLUSH_PER_TICK per wake
 *   - event + single backoff timeout (no 10s poll)
 *   - same screenshot UUID until S3 complete (no double row)
 * Never drop a queued shot. Disk is the source of truth.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FLUSH_PER_TICK = 1;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const MIN_OFFLINE_DELAY_MS = 60 * 1000;
const RECONNECT_DEBOUNCE_MS = 60 * 1000;

function defaultAppDataDir() {
  const userDataDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(userDataDir, 'Alyson Work Time');
}

function retryDelayMs(retryCount) {
  const { jitteredBackoffMs } = require('./sync-backoff');
  return jitteredBackoffMs(retryCount, { maxMs: MAX_BACKOFF_MS });
}

class OfflineScreenshotQueue {
  constructor(options = {}) {
    this._rootDir = options.rootDir || null;
    this._now = options.now || (() => Date.now());
    this._upload = options.upload || null;
    this._isOnline = options.isOnline || this._defaultIsOnline.bind(this);
    this._hooksBound = false;
    this._processing = false;
    this._timeout = null;
    this._writeGen = 0;
    this._globalRetry = 0;
    this._lastIgnoreAt = 0;
    this._dead = false;
  }

  _dir() {
    const root = this._rootDir || path.join(defaultAppDataDir(), 'offline-screenshots');
    const files = path.join(root, 'files');
    if (!fs.existsSync(files)) fs.mkdirSync(files, { recursive: true });
    return { root, files, meta: path.join(root, 'meta.json') };
  }

  _defaultIsOnline() {
    try {
      const { net } = require('electron');
      if (net && typeof net.isOnline === 'function') return net.isOnline();
    } catch (_) { /* assume online and let upload fail */ }
    return true;
  }

  _readMeta() {
    const { meta } = this._dir();
    try {
      if (!fs.existsSync(meta)) return { v: 1, items: [] };
      const parsed = JSON.parse(fs.readFileSync(meta, 'utf8'));
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      return { v: 1, items };
    } catch (_) {
      return { v: 1, items: [] };
    }
  }

  _writeMeta(items) {
    const { root, meta } = this._dir();
    const payload = JSON.stringify({ v: 1, items: Array.isArray(items) ? items : [] }, null, 2);
    const tmp = `${meta}.${process.pid}.${this._now()}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, payload, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, meta);
    this._writeGen += 1;
    try {
      const dirFd = fs.openSync(root, 'r');
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch (_) { /* windows / restricted FS */ }
  }

  list() {
    return this._readMeta().items.slice();
  }

  pendingCount() {
    return this._readMeta().items.length;
  }

  filePathFor(item) {
    const { files } = this._dir();
    return path.join(files, item.fileName || `${item.id}.${item.ext || 'jpg'}`);
  }

  /**
   * Write-ahead: JPEG hits disk before any network call.
   */
  enqueuePrepared({
    id,
    buffer,
    ext = 'jpg',
    contentType = 'image/jpeg',
    meta = {},
  } = {}) {
    const sid = id != null ? String(id) : '';
    if (!sid || !buffer || !buffer.length) {
      throw new Error('enqueuePrepared requires id and buffer');
    }
    const safeExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const fileName = `${sid}.${safeExt}`;
    const { files } = this._dir();
    const dest = path.join(files, fileName);
    const tmp = `${dest}.tmp`;
    // No fsync on the JPEG — tracking must not hitch on every shot.
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dest);

    const items = this._readMeta().items;
    const nowIso = new Date(this._now()).toISOString();
    const next = {
      id: sid,
      fileName,
      ext: safeExt,
      contentType: contentType || 'image/jpeg',
      userId: meta.userId ?? null,
      capturedAt: meta.capturedAt || nowIso,
      timeLogId: meta.timeLogId || null,
      activityPercent: meta.activityPercent || 0,
      focusPercent: meta.focusPercent || 0,
      clicks: meta.clicks || 0,
      keys: meta.keys || 0,
      moves: meta.moves || 0,
      appName: meta.appName || null,
      windowTitle: meta.windowTitle || null,
      agentVersion: meta.agentVersion || null,
      perceptualHash: meta.perceptualHash || null,
      queuedAt: nowIso,
      retryCount: 0,
      nextRetryAt: null,
    };
    const idx = items.findIndex((item) => String(item.id) === sid);
    if (idx >= 0) {
      next.retryCount = items[idx].retryCount || 0;
      next.nextRetryAt = items[idx].nextRetryAt || null;
      next.queuedAt = items[idx].queuedAt || nowIso;
      items[idx] = next;
    } else {
      items.push(next);
    }
    this._writeMeta(items);
    if (items.length >= 200) {
      console.warn(
        `⚠️ [OFFLINE-SCREEN] ${items.length} screenshots waiting on disk — will drain on reconnect, not a 10s poll`,
      );
    }
    this._bindHooks();
    return next;
  }

  markSynced(id) {
    const sid = id != null ? String(id) : '';
    if (!sid) return;
    const items = this._readMeta().items;
    const item = items.find((row) => String(row.id) === sid);
    const next = items.filter((row) => String(row.id) !== sid);
    if (item) {
      try {
        fs.unlinkSync(this.filePathFor(item));
      } catch (_) { /* already gone */ }
    }
    if (next.length !== items.length) this._writeMeta(next);
    this._armTimer();
  }

  noteFailure(id) {
    this._noteQueueBackoff(id);
  }

  /**
   * One failed PUT means the network is bad. Back off the whole queue so we
   * do not hop to the next file every 250ms (Mohita heat loop).
   */
  _noteQueueBackoff(failedId) {
    const items = this._readMeta().items;
    if (!items.length) return;
    this._globalRetry = (this._globalRetry || 0) + 1;
    const when = this._now() + retryDelayMs(this._globalRetry);
    for (const item of items) {
      item.retryCount = (Number(item.retryCount) || 0) + 1;
      item.nextRetryAt = when;
    }
    this._writeMeta(items);
    if (failedId) {
      console.warn(
        `⚠️ [OFFLINE-SCREEN] Upload failed (${failedId}) — queue backoff ${Math.round(retryDelayMs(this._globalRetry) / 1000)}s, tracking unaffected`,
      );
    }
    this._armTimer();
  }

  start() {
    if (this._dead) return;
    this._bindHooks();
    setImmediate(() => {
      if (this._dead) return;
      try {
        this.requestFlush();
      } catch (_) { /* never block tracking */ }
    });
  }

  _bindHooks() {
    if (this._hooksBound) return;
    this._hooksBound = true;
    const onReconnect = (label) => {
      console.log(`🔄 [OFFLINE-SCREEN] ${label} — one screenshot flush`);
      this.requestFlush({ ignoreBackoff: true });
    };
    try {
      const { powerMonitor, ipcMain } = require('electron');
      if (powerMonitor?.on) {
        powerMonitor.on('resume', () => onReconnect('System resume'));
        powerMonitor.on('unlock-screen', () => onReconnect('Screen unlock'));
      }
      if (ipcMain?.on) {
        ipcMain.on('network-online', () => onReconnect('Network online'));
      }
    } catch (_) { /* tests / non-electron */ }
  }

  _clearTimer() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  _earliestRetryAt(items, now) {
    if (!items.length) return null;
    let next = null;
    for (const item of items) {
      const at = Number(item.nextRetryAt);
      if (!Number.isFinite(at)) return now;
      if (next == null || at < next) next = at;
    }
    return next;
  }

  _armTimer({ disconnected = false, afterPartialFlush = false } = {}) {
    this._clearTimer();
    const items = this._readMeta().items;
    if (!items.length) return;
    const now = this._now();
    const when = this._earliestRetryAt(items, now);
    if (when == null) return;
    let delay = Math.max(0, when - now);
    if (disconnected) delay = Math.max(delay, MIN_OFFLINE_DELAY_MS);
    // Reconnect drain: 3 shots, then 15s, so 200 laptops do not burst S3 at once.
    if (afterPartialFlush) delay = Math.max(delay, 15 * 1000);
    delay = Math.min(MAX_BACKOFF_MS, Math.max(delay, 250));
    this._timeout = setTimeout(() => {
      this._timeout = null;
      if (this._dead) return;
      this.requestFlush();
    }, delay);
  }

  requestFlush({ ignoreBackoff = false } = {}) {
    try {
      if (ignoreBackoff) {
        const now = this._now();
        // Flaky wifi fires `online` repeatedly. Do not reset backoff each time.
        if (this._lastIgnoreAt && now - this._lastIgnoreAt < RECONNECT_DEBOUNCE_MS) {
          ignoreBackoff = false;
        } else {
          this._lastIgnoreAt = now;
          const items = this._readMeta().items;
          let changed = false;
          for (const item of items) {
            if (item.nextRetryAt != null) {
              item.nextRetryAt = null;
              changed = true;
            }
          }
          if (changed) this._writeMeta(items);
        }
      }
      void this.flushDue();
      if (!this._processing) this._armTimer();
    } catch (err) {
      console.warn('⚠️ [OFFLINE-SCREEN] Flush request ignored — tracking continues:', err?.message || err);
    }
  }

  async flushDue() {
    if (this._dead) return { uploaded: 0, remaining: this.pendingCount() };
    if (this._processing) return { uploaded: 0, remaining: this.pendingCount() };
    this._processing = true;
    let uploaded = 0;
    try {
      if (!this._isOnline()) {
        this._armTimer({ disconnected: true });
        return { uploaded: 0, remaining: this.pendingCount(), disconnected: true };
      }
      const now = this._now();
      const due = this._readMeta().items.filter((item) => !(Number(item.nextRetryAt) > now));
      const batch = due.slice(0, MAX_FLUSH_PER_TICK);
      for (const item of batch) {
        const filePath = this.filePathFor(item);
        let buffer;
        try {
          buffer = fs.readFileSync(filePath);
        } catch (err) {
          console.warn(`⚠️ [OFFLINE-SCREEN] Missing file for ${item.id} — keeping metadata:`, err?.message || err);
          this._noteQueueBackoff(item.id);
          break;
        }
        try {
          const upload = this._upload || this._defaultUpload.bind(this);
          const result = await upload({
            ...item,
            uploadBuffer: buffer,
            screenshotId: item.id,
          });
          if (result?.error) {
            this._noteQueueBackoff(item.id);
            break;
          }
          this._globalRetry = 0;
          this.markSynced(item.id);
          uploaded += 1;
        } catch (err) {
          console.warn(`⚠️ [OFFLINE-SCREEN] Upload failed for ${item.id}:`, err?.message || err);
          this._noteQueueBackoff(item.id);
          break;
        }
      }
    } catch (err) {
      console.warn('⚠️ [OFFLINE-SCREEN] Flush aborted — tracking continues:', err?.message || err);
      try {
        this._noteQueueBackoff();
      } catch (_) { /* ignore */ }
    } finally {
      this._processing = false;
      try {
        const now = this._now();
        const stillDue = this._readMeta().items.filter((item) => !(Number(item.nextRetryAt) > now));
        this._armTimer({ afterPartialFlush: uploaded > 0 && stillDue.length > 0 });
      } catch (_) { /* ignore */ }
    }
    return { uploaded, remaining: this.pendingCount() };
  }

  async _defaultUpload(item) {
    const { uploadScreenshotViaS3Api } = require('./screenshot-storage');
    return uploadScreenshotViaS3Api({
      userId: item.userId,
      uploadBuffer: item.uploadBuffer,
      contentType: item.contentType,
      ext: item.ext,
      capturedAt: item.capturedAt,
      timeLogId: item.timeLogId,
      activityPercent: item.activityPercent,
      focusPercent: item.focusPercent,
      clicks: item.clicks,
      keys: item.keys,
      moves: item.moves,
      appName: item.appName,
      windowTitle: item.windowTitle,
      agentVersion: item.agentVersion,
      perceptualHash: item.perceptualHash,
      screenshotId: item.screenshotId || item.id,
    });
  }

  shutdown() {
    this._dead = true;
    this._clearTimer();
  }
}

let _singleton = null;

function getOfflineScreenshotQueue() {
  if (!_singleton) _singleton = new OfflineScreenshotQueue();
  return _singleton;
}

function _resetOfflineScreenshotQueueForTests() {
  if (_singleton) _singleton.shutdown();
  _singleton = null;
}

module.exports = {
  OfflineScreenshotQueue,
  getOfflineScreenshotQueue,
  _resetOfflineScreenshotQueueForTests,
  MAX_FLUSH_PER_TICK,
  retryDelayMs,
};
