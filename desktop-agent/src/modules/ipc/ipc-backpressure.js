/**
 * IPC Backpressure Helper
 * Queues renderer sends to avoid flooding during rapid events
 */

const QUEUE_MAX = 50;
const queue = [];
let flushing = false;

function safeIpcSend(win, channel, payload) {
  try {
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ channel, payload });
    if (!flushing) flush(win);
    return true;
  } catch {
    return false;
  }
}

function flush(win) {
  flushing = true;
  (function next() {
    if (!queue.length) {
      flushing = false;
      return;
    }
    const { channel, payload } = queue.shift();
    try { win.webContents.send(channel, payload); } catch {}
    setImmediate(next);
  })();
}

module.exports = { safeIpcSend };


