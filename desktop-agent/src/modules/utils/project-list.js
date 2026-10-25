'use strict';

/**
 * Project list for the Time Tracker dropdown and tray menu.
 *
 * The app often starts at sign-in before Wi-Fi is up, so the first fetch
 * can fail ("fetch failed" / timeout). Before this, that failure became an
 * empty list until the computer restarted. Now:
 *  - every successful fetch is saved to userData/last-projects.json
 *  - a failed fetch returns that saved list for the same user
 *  - with nothing saved, the error is thrown so the renderer can retry
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILENAME = 'last-projects.json';

function cachePath() {
  try {
    const { app } = require('electron');
    if (app?.getPath) return path.join(app.getPath('userData'), CACHE_FILENAME);
  } catch (_) { /* not in Electron (tests) */ }
  return null;
}

function readCachedProjects(userId) {
  try {
    const p = cachePath();
    if (!p || !fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (String(raw?.userId) !== String(userId) || !Array.isArray(raw?.projects)) return null;
    return raw.projects;
  } catch (_) {
    return null;
  }
}

function saveCachedProjects(userId, projects) {
  try {
    const p = cachePath();
    if (!p) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(
      p,
      JSON.stringify({ userId: String(userId), projects, savedAt: new Date().toISOString() }),
      'utf8',
    );
  } catch (err) {
    console.warn('⚠️ [PROJECTS] Could not save project list:', err?.message || err);
  }
}

/**
 * Fetch the user's projects from the backend, falling back to the last
 * saved list. Throws only when the backend fails and nothing is saved.
 */
async function getUserProjects(userId, config, backend = require('./backend-time-logs')) {
  if (!backend.isBackendTimeLogsEnabled(config)) {
    console.error(
      '❌ [PROJECTS] Backend sync not configured — check BACKEND_API_URL + INTERNAL_API_KEY in env-config.js',
    );
    return [];
  }

  try {
    const projects = await backend.listUserProjects(userId, config);
    const list = Array.isArray(projects) ? projects : [];
    saveCachedProjects(userId, list);
    console.log(`✅ [PROJECTS] Found ${list.length} projects from backend`);
    if (list.length) global.trayManager?.setProjectList?.(list);
    return list;
  } catch (error) {
    const cached = readCachedProjects(userId);
    if (cached) {
      console.warn(
        `⚠️ [PROJECTS] Backend fetch failed (${error.message}) — using ${cached.length} saved projects`,
      );
      if (cached.length) global.trayManager?.setProjectList?.(cached);
      return cached;
    }
    console.error(`❌ [PROJECTS] Backend fetch failed and no saved list: ${error.message}`);
    throw new Error(`Could not load projects: ${error.message}`);
  }
}

module.exports = { getUserProjects, readCachedProjects, saveCachedProjects };
