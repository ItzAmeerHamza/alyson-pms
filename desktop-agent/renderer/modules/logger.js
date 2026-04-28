(function (global) {
  const DEFAULT_LEVEL = (global.TIMEFLOW_LOG_LEVEL || global.LOG_LEVEL || (global.process && global.process.env && (global.process.env.TIMEFLOW_LOG_LEVEL || global.process.env.LOG_LEVEL))) || 'info';
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

  function safeStringify(value) {
    try { return JSON.stringify(value); } catch { return '"[unserializable]"'; }
  }

  function shouldLog(currentLevel, level) {
    const configured = LEVELS[currentLevel] ?? LEVELS.info;
    const incoming = LEVELS[level] ?? LEVELS.info;
    return incoming >= configured;
  }

  const RendererLogger = {
    level: DEFAULT_LEVEL,
    setLevel(lvl) { if (LEVELS[lvl]) this.level = lvl; },
    _emit(level, entry) {
      if (!shouldLog(this.level, level)) return;
      const ts = new Date().toISOString();
      const category = entry.category || 'LOG';
      const parts = [`[${category}]`];
      if (entry.screen) parts.push(`${entry.screen}:`);
      if (entry.step) parts.push(entry.step);
      if (entry.message) parts.push(`– ${entry.message}`);
      const prefix = parts.join(' ').replace(/\s+/g, ' ').trim();
      const line = `${prefix}${entry.ctx ? ' ' + safeStringify(entry.ctx) : ''}`;
      switch (level) {
        case 'debug': console.debug(line); break;
        case 'info': console.info(line); break;
        case 'warn': console.warn(line); break;
        case 'error': console.error(line); break;
        default: console.log(line);
      }
    },
    debug(e) { this._emit('debug', e || {}); },
    info(e) { this._emit('info', e || {}); },
    warn(e) { this._emit('warn', e || {}); },
    error(e) { this._emit('error', e || {}); }
  };

  global.RendererLogger = RendererLogger;
})(typeof window !== 'undefined' ? window : globalThis);


