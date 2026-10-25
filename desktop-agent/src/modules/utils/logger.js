// Centralized structured logger for the Electron desktop agent
// Produces concise, high-signal logs with optional JSON context

const DEFAULT_LEVEL = process.env.TIMEFLOW_LOG_LEVEL || process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Local log file sink — buffered, best-effort, never throws.
 * One file per calendar day so it can be rotated + uploaded to S3 (see log-uploader.js).
 */
function resolveLogDir() {
  try {
    const path = require('path');
    const os = require('os');
    const userDataDir =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));
    return path.join(userDataDir, 'Alyson Work Time', 'logs');
  } catch (_) {
    return null;
  }
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Disk limits. One runaway loop once wrote 7 GB in a day, and old days were
 * never deleted. Keep a week (the uploader ships yesterday's file on day
 * roll) and stop writing routine lines once a day's file gets big.
 */
const LOG_RETENTION_DAYS = 7;
const MAX_DAILY_BYTES = 40 * 1024 * 1024; // per file (.log and .jsonl each)
const MAX_DAILY_ERROR_BYTES = 60 * 1024 * 1024; // errors may go a bit past the cap

/** A closed terminal / pipe makes console writes fail; never treat that as an error to log. */
function isBrokenStreamError(err) {
  const code = err && err.code;
  return code === 'EPIPE' || code === 'EIO' || code === 'ERR_STREAM_DESTROYED' || code === 'EBADF';
}

const fileSink = {
  dir: resolveLogDir(),
  buffer: [],
  jsonlBuffer: [],
  flushTimer: null,
  // Bytes written per file today, so we can stop at MAX_DAILY_BYTES.
  sizeDate: null,
  sizes: { log: 0, jsonl: 0 },
  capNoted: { log: false, jsonl: false },
  lastPruneDate: null,
  ensureDir() {
    if (!this.dir) return false;
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      return true;
    } catch (_) {
      return false;
    }
  },
  currentFilePath(dateStr = todayDateStr()) {
    if (!this.dir) return null;
    const path = require('path');
    return path.join(this.dir, `${dateStr}.log`);
  },
  currentJsonlPath(dateStr = todayDateStr()) {
    if (!this.dir) return null;
    const path = require('path');
    return path.join(this.dir, `${dateStr}.jsonl`);
  },
  /** Start-of-day bookkeeping: pick up existing file sizes and prune old days. */
  rollDay() {
    const today = todayDateStr();
    if (this.sizeDate === today) return;
    this.sizeDate = today;
    this.capNoted = { log: false, jsonl: false };
    const fs = require('fs');
    const statSize = (p) => {
      try { return p && fs.existsSync(p) ? fs.statSync(p).size : 0; } catch (_) { return 0; }
    };
    this.sizes = {
      log: statSize(this.currentFilePath(today)),
      jsonl: statSize(this.currentJsonlPath(today)),
    };
    if (this.lastPruneDate !== today) {
      this.lastPruneDate = today;
      this.pruneOldLogs();
    }
  },
  /** Delete .log / .jsonl files older than LOG_RETENTION_DAYS. */
  pruneOldLogs() {
    if (!this.dir) return;
    try {
      const fs = require('fs');
      const path = require('path');
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - LOG_RETENTION_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (const name of fs.readdirSync(this.dir)) {
        const m = /^(\d{4}-\d{2}-\d{2})\.(log|jsonl)$/.exec(name);
        if (m && m[1] < cutoffStr) {
          try { fs.unlinkSync(path.join(this.dir, name)); } catch (_) { /* in use / gone */ }
        }
      }
    } catch (_) { /* best-effort only */ }
  },
  /** true if a line of this kind may still be written today. */
  hasRoom(kind, bytes, isError) {
    this.rollDay();
    const limit = isError ? MAX_DAILY_ERROR_BYTES : MAX_DAILY_BYTES;
    if (this.sizes[kind] + bytes <= limit) {
      this.sizes[kind] += bytes;
      return true;
    }
    if (!this.capNoted[kind]) {
      this.capNoted[kind] = true;
      const note = `${new Date().toISOString()} [WARN] [LOG] Daily log size limit reached — routine lines skipped until tomorrow`;
      if (kind === 'log') this.buffer.push(note);
      else this.jsonlBuffer.push(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', message: note, category: 'log_cap' }));
    }
    return false;
  },
  append(line, isError = false) {
    if (!this.dir) return;
    if (!this.hasRoom('log', line.length + 1, isError)) return;
    this.buffer.push(line);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 2000);
      if (this.flushTimer.unref) this.flushTimer.unref();
    }
  },
  appendJsonl(obj, isError = false) {
    if (!this.dir || !obj) return;
    try {
      const line = JSON.stringify(obj);
      if (!this.hasRoom('jsonl', line.length + 1, isError)) return;
      this.jsonlBuffer.push(line);
    } catch (_) {
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 2000);
      if (this.flushTimer.unref) this.flushTimer.unref();
    }
  },
  flush() {
    this.flushTimer = null;
    const lines = this.buffer;
    const jsonlLines = this.jsonlBuffer;
    this.buffer = [];
    this.jsonlBuffer = [];
    if (!this.ensureDir()) return;
    try {
      const fs = require('fs');
      if (lines.length > 0) {
        fs.appendFile(this.currentFilePath(), lines.join('\n') + '\n', () => {});
      }
      if (jsonlLines.length > 0) {
        fs.appendFile(this.currentJsonlPath(), jsonlLines.join('\n') + '\n', () => {});
      }
    } catch (_) { /* best-effort only */ }
  },
};

const ERROR_STACK_LINES = 5;
const ERROR_CAUSE_DEPTH = 3;
// Allowlist only: HTTP client errors also carry request config with auth headers.
const ERROR_DETAIL_FIELDS = ['code', 'errno', 'syscall', 'hostname', 'address', 'port', 'status', 'statusCode'];

function isError(value) {
  return value instanceof Error || require('util').types.isNativeError(value);
}

/**
 * JSON.stringify(error) is "{}" because message, stack and cause are not
 * enumerable, which hid every `console.error('…', error)` in the S3 logs.
 */
function describeError(error, depth = 0) {
  const out = { name: error.name || 'Error', message: String(error.message || '') };
  for (const field of ERROR_DETAIL_FIELDS) {
    const value = error[field];
    if (value !== undefined && value !== null && typeof value !== 'object') out[field] = value;
  }
  if (typeof error.stack === 'string') {
    const frames = error.stack.split('\n').filter((l) => /^\s+at /.test(l)).slice(0, ERROR_STACK_LINES);
    if (frames.length) out.stack = frames.map((l) => l.trim()).join(' | ');
  }
  if (error.cause !== undefined && depth < ERROR_CAUSE_DEPTH) {
    out.cause = isError(error.cause) ? describeError(error.cause, depth + 1) : error.cause;
  }
  return out;
}

function errorReplacer(_key, value) {
  return isError(value) ? describeError(value) : value;
}

function formatError(error) {
  const { name, message, ...details } = describeError(error);
  const extra = Object.keys(details).length ? ` ${safeStringify(details)}` : '';
  return `${name}: ${message}${extra}`;
}

/**
 * The app logs almost entirely via raw console.* calls scattered across every module,
 * not the structured Logger below — tee those into the same file sink so the log file
 * (and what ends up in S3) actually reflects what's happening, not just the ~5% of
 * lines that go through createFeatureLogger.
 */
function stringifyConsoleArgs(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (isError(a)) return formatError(a);
      try {
        const json = JSON.stringify(a, errorReplacer);
        return json === undefined ? String(a) : json;
      } catch (_) {
        return String(a);
      }
    })
    .join(' ');
}

// Set once stdout/stderr is gone (terminal closed, app launched without one).
// Before this, a failed console write threw, the crash handler logged it to
// the console, that write failed too… looping at full CPU for days.
let consoleOutputDisabled = false;

function installConsoleFileTee() {
  if (console.__alysonFileTeeInstalled) return;
  console.__alysonFileTeeInstalled = true;

  for (const stream of [process.stdout, process.stderr]) {
    try {
      stream?.on?.('error', (err) => {
        if (isBrokenStreamError(err)) consoleOutputDisabled = true;
      });
    } catch (_) { /* ignore */ }
  }

  ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    const original = console[method].bind(console);
    const level = method === 'log' ? 'info' : method;
    const isError = level === 'error' || level === 'warn';
    console[method] = (...args) => {
      if (!consoleOutputDisabled) {
        try {
          original(...args);
        } catch (err) {
          if (isBrokenStreamError(err)) consoleOutputDisabled = true;
        }
      }
      try {
        const message = stringifyConsoleArgs(args);
        fileSink.append(`${new Date().toISOString()} [${level.toUpperCase()}] ${message}`, isError);
        // Structured JSONL for S3 / Athena — identity fields when available.
        let userId = null;
        let deviceId = null;
        let workspaceId = null;
        let agentVersion = null;
        try {
          userId = global.currentUserId || global.config?.user_id || null;
          workspaceId =
            global.currentOrganizationId ||
            global.config?.organization_id ||
            global.config?.workspace_id ||
            null;
          agentVersion = global.config?.version || global.appVersion || null;
        } catch (_) { /* ignore */ }
        try {
          const { getDeviceId } = require('./device-id');
          deviceId = getDeviceId();
        } catch (_) { /* ignore */ }
        fileSink.appendJsonl({
          ts: new Date().toISOString(),
          level,
          message,
          user_id: userId != null ? String(userId) : null,
          device_id: deviceId,
          workspace_id: workspaceId != null ? String(workspaceId) : null,
          agent_version: agentVersion,
          category: 'console',
        }, isError);
      } catch (_) { /* best-effort only */ }
    };
  });
}

installConsoleFileTee();

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Categories that also emit a strict `[JSON]` line for machine parsing.
 *
 * Kept deliberately small — these are the ones queried out of S3 when
 * reconstructing what happened to a session. High-frequency categories (SCREEN,
 * INPUT, APP_DETECTION, URL) log once and are read by eye.
 */
const JSON_DUPLICATE_CATEGORIES = new Set(['SESSION_AUDIT', 'SESSION', 'DB']);

function safeStringify(value) {
  try {
    return JSON.stringify(value, errorReplacer);
  } catch (_err) {
    return '"[unserializable]"';
  }
}

class Logger {
  /**
   * @param {Object} options
   * @param {keyof typeof LEVELS} [options.level]
   * @param {string} [options.scope] - Optional static scope/category
   */
  constructor(options = {}) {
    this.level = options.level && LEVELS[options.level] ? options.level : DEFAULT_LEVEL;
    this.scope = options.scope || null;
  }

  setLevel(level) {
    if (LEVELS[level]) this.level = level;
  }

  shouldLog(level) {
    const configured = LEVELS[this.level] ?? LEVELS.info;
    const incoming = LEVELS[level] ?? LEVELS.info;
    return incoming >= configured;
  }

  /**
   * Base log method
   * @param {('debug'|'info'|'warn'|'error')} level
   * @param {Object} entry
   * @param {string} [entry.category]
   * @param {string} [entry.screen]
   * @param {string} [entry.step]
   * @param {string} [entry.message]
   * @param {Object} [entry.ctx]
   * @param {string} [entry.sessionId]
   */
  log(level, entry = {}) {
    if (!this.shouldLog(level)) return;

    const ts = new Date().toISOString();
    const category = entry.category || this.scope || 'LOG';
    const parts = [];

    // Human-friendly prefix
    parts.push(`[${category}]`);
    if (entry.screen) parts.push(`${entry.screen}:`);
    if (entry.step) parts.push(`${entry.step}`);
    if (entry.message) parts.push(`– ${entry.message}`);

    const prefix = parts.join(' ').replace(/\s+/g, ' ').trim();

    const payload = {
      ts,
      level,
      category,
      screen: entry.screen || undefined,
      step: entry.step || undefined,
      message: entry.message || undefined,
      sessionId: entry.sessionId || undefined,
      ctx: entry.ctx || undefined,
    };

    const line = `${prefix}${entry.ctx ? ' ' + safeStringify(entry.ctx) : ''}`;

    // Route to appropriate console method (file sink is fed via the console.* tee below)
    /* eslint-disable no-console */
    switch (level) {
      case 'debug':
        console.debug(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
      default:
        console.log(line);
    }
    // Machine-readable duplicate, for forensic categories only.
    //
    // This used to fire for every info/warn/error, writing each entry to disk
    // twice and shipping twice as much to S3 — one user produced 97,652 lines
    // and 28.8 MB in a day. The human line above already carries category, step,
    // message and ctx, and the file stamps its own timestamps, so the duplicate
    // was almost entirely redundant.
    //
    // Categories here are the ones reconstructed after the fact, where a strict
    // JSON shape is worth the extra write. Everything else keeps the single line.
    if (this.level === 'debug' && level !== 'debug' && JSON_DUPLICATE_CATEGORIES.has(category)) {
      console.debug(`[JSON] ${safeStringify(payload)}`);
    }
    /* eslint-enable no-console */
  }

  debug(entry) { this.log('debug', entry); }
  info(entry) { this.log('info', entry); }
  warn(entry) { this.log('warn', entry); }
  error(entry) { this.log('error', entry); }

  /**
   * Creates a screen session logger with standardized methods
   * @param {string} screenName
   */
  createScreenSession(screenName) {
    const sessionId = `${screenName}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
    const startedAt = Date.now();
    const base = (step, message, ctx) => {
      this.info({ category: 'SCREEN', screen: screenName, step, message, ctx, sessionId });
    };
    return {
      sessionId,
      open(ctx) { base('OPEN', undefined, ctx); },
      dataLoadStart(ctx) { base('DATA LOAD START', undefined, ctx); },
      dataLoadEnd(recordsCount, durationMs, extraCtx) { base('DATA LOAD END', undefined, { records: recordsCount, duration_ms: durationMs, ...extraCtx }); },
      action(actionName, ctx) { base('ACTION', actionName, ctx); },
      refresh(reason, ctx) { base('REFRESH', `Reason: ${reason}`, ctx); },
      dbSaveStart(table, ctx) { thisDb.info({ category: 'SCREEN', screen: screenName, step: 'DB SAVE START', message: `Table: ${table}`, ctx, sessionId }); },
      dbSaveSuccess(rows, ctx) { thisDb.info({ category: 'SCREEN', screen: screenName, step: 'DB SAVE SUCCESS', message: `Rows: ${rows}`, ctx, sessionId }); },
      dbSaveError(error, ctx) { thisDb.error({ category: 'SCREEN', screen: screenName, step: 'DB SAVE ERROR', message: error?.message || String(error), ctx, sessionId }); },
      close() {
        const durationMs = Date.now() - startedAt;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.round((durationMs % 60000) / 1000);
        base('CLOSE', `Session Duration: ${minutes}m${seconds}s`);
      },
    };
  }

  /**
   * Wrap an ipc handler with START/SUCCESS/ERROR logs
   * @param {import('electron').IpcMain} ipcMain
   * @param {string} channel
   * @param {(event: any, ...args: any[]) => any} handler
   */
  wrapIpcHandler(ipcMain, channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      const startTs = Date.now();
      this.info({ category: 'IPC', step: `${channel}: START` });
      try {
        const result = await handler(event, ...args);
        const durationMs = Date.now() - startTs;
        // Avoid logging entire result; include summary only
        const summary = result && typeof result === 'object' ? {
          keys: Object.keys(result).slice(0, 5),
        } : undefined;
        this.info({ category: 'IPC', step: `${channel}: SUCCESS`, ctx: { duration_ms: durationMs, summary } });
        return result;
      } catch (error) {
        const durationMs = Date.now() - startTs;
        this.error({ category: 'IPC', step: `${channel}: ERROR`, message: error?.message || String(error), ctx: { duration_ms: durationMs } });
        throw error;
      }
    });
  }
}

// Provide a singleton default logger
const logger = new Logger({ level: DEFAULT_LEVEL });

/**
 * Production-safe console wrapper
 * Reduces verbose logging in production to improve performance
 * Use these instead of raw console.log for non-critical output
 */
const safeConsole = {
  _isProduction: process.env.NODE_ENV === 'production' || DEFAULT_LEVEL !== 'debug',
  _throttleCache: new Map(),
  
  // Always logs (errors, critical info)
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  
  // Only logs in debug mode
  log: (...args) => {
    if (!safeConsole._isProduction) console.log(...args);
  },
  debug: (...args) => {
    if (!safeConsole._isProduction) console.debug(...args);
  },
  
  // Throttled log - only logs once per interval (default 30s)
  throttled: (key, intervalMs = 30000, ...args) => {
    const now = Date.now();
    const lastLog = safeConsole._throttleCache.get(key) || 0;
    if (now - lastLog >= intervalMs) {
      safeConsole._throttleCache.set(key, now);
      console.log(...args);
    }
  },
  
  // Info-level (logs in production but can be throttled)
  info: (...args) => console.info(...args),
};

function createFeatureLogger(scope, defaultCtx = {}) {
  const normalizedScope = scope ? String(scope).toUpperCase() : 'LOG';
  const mergeEntry = (entry = {}) => ({
    ...entry,
    category: entry.category || normalizedScope,
    ctx: entry.ctx ? { ...defaultCtx, ...entry.ctx } : (Object.keys(defaultCtx).length ? { ...defaultCtx } : undefined),
  });

  return {
    debug(entry) { logger.debug(mergeEntry(entry)); },
    info(entry) { logger.info(mergeEntry(entry)); },
    warn(entry) { logger.warn(mergeEntry(entry)); },
    error(entry) { logger.error(mergeEntry(entry)); },
    child(childScope, childCtx = {}) {
      return createFeatureLogger(childScope || normalizedScope, { ...defaultCtx, ...childCtx });
    },
  };
}

// Auxiliary db helpers for explicit save points
const db = {
  saveStart(table, ctx) {
    logger.info({ category: 'DB', step: 'SAVE START', message: `Table: ${table}`, ctx });
  },
  saveSuccess(table, rows, ctx) {
    logger.info({ category: 'DB', step: 'SAVE SUCCESS', message: `Table: ${table}`, ctx: { rows, ...ctx } });
  },
  saveError(table, error, ctx) {
    logger.error({ category: 'DB', step: 'SAVE ERROR', message: `Table: ${table} – ${error?.message || String(error)}`, ctx });
  },
};

module.exports = {
  isBrokenStreamError,
  MAX_DAILY_BYTES,
  LOG_RETENTION_DAYS,
  Logger,
  logger,
  db,
  LEVELS,
  createFeatureLogger,
  safeConsole,
  stringifyConsoleArgs,
  logFile: {
    dir: () => fileSink.dir,
    pathFor: (dateStr) => fileSink.currentFilePath(dateStr),
    jsonlPathFor: (dateStr) => fileSink.currentJsonlPath(dateStr),
    flush: () => fileSink.flush(),
    pruneOldLogs: () => fileSink.pruneOldLogs(),
    _sink: fileSink,
  },
};


