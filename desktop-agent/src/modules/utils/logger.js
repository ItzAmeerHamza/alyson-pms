// Centralized structured logger for the Electron desktop agent
// Produces concise, high-signal logs with optional JSON context

const DEFAULT_LEVEL = process.env.TIMEFLOW_LOG_LEVEL || process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function safeStringify(value) {
  try {
    return JSON.stringify(value);
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

    // Route to appropriate console method
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
    // Emit JSON payload at debug level for ingestion when needed
    if (this.level === 'debug' && level !== 'debug') {
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
  Logger,
  logger,
  db,
  LEVELS,
  createFeatureLogger,
  safeConsole,
};


