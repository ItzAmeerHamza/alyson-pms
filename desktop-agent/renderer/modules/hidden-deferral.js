// Defers renderer work while the window is hidden (tray-only for days).
// runWhenVisible(key, fn): runs fn now when visible; otherwise remembers the
// latest fn per key and runs each once when the window is shown again, so the
// user sees exactly the same fresh data without hidden-time CPU/network work.
function createHiddenDeferral(doc) {
  const pending = new Map();
  const isHidden = () => !!(doc && doc.hidden);

  function runWhenVisible(key, fn) {
    if (typeof fn !== 'function') return false;
    if (!isHidden()) {
      fn();
      return true;
    }
    pending.set(key, fn);
    return false;
  }

  function flush() {
    if (isHidden() || pending.size === 0) return 0;
    const jobs = Array.from(pending.values());
    pending.clear();
    for (const job of jobs) {
      try {
        job();
      } catch (err) {
        try { console.warn('[hidden-deferral] deferred job failed:', err?.message || err); } catch (_) { /* ignore */ }
      }
    }
    return jobs.length;
  }

  if (doc && typeof doc.addEventListener === 'function') {
    // Run after the other visibilitychange handlers (work-day rollover sync
    // etc.) so deferred refreshes see the current day context.
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden) setTimeout(flush, 0);
    });
  }

  return { runWhenVisible, flush, pendingCount: () => pending.size };
}

module.exports = { createHiddenDeferral };
