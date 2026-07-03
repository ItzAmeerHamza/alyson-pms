/**
 * In-process macOS input capture via uiohook-napi.
 * Runs inside the Electron main process — users only grant Accessibility to "Alyson PM"
 * (no separate macos-input-helper binary / TCC entry).
 */

const MODIFIER_KEYCODES = new Set([
  29,  // Left Ctrl
  3613, // Right Ctrl
  42,  // Left Shift
  54,  // Right Shift
  56,  // Left Alt/Option
  3640, // Right Alt
  3675, // Right Meta
  3676, // Left Meta/Command
  57,  // Caps Lock
  58,  // Fn (some layouts)
]);

let uIOhook = null;
let loadError = null;

try {
  ({ uIOhook } = require('uiohook-napi'));
} catch (err) {
  loadError = err;
}

class MacOSUiohookInput {
  constructor(emitEvent) {
    this.emitEvent = emitEvent;
    this.started = false;
    this._lastMoveEmit = 0;
    this._handlers = [];
  }

  static isAvailable() {
    return Boolean(uIOhook) && !loadError;
  }

  static loadErrorMessage() {
    return loadError ? String(loadError.message || loadError) : null;
  }

  start() {
    if (!MacOSUiohookInput.isAvailable()) {
      throw new Error(loadError?.message || 'uiohook-napi not available');
    }
    if (this.started) return true;

    const onClick = (event) => {
      this.emitEvent({
        type: 'click',
        platform: 'macos',
        button: event.button === 2 ? 'right' : 'left',
        source: 'uiohook',
      });
    };

    const onKeydown = (event) => {
      if (MODIFIER_KEYCODES.has(event.keycode)) return;
      this.emitEvent({
        type: 'key',
        platform: 'macos',
        keycode: event.keycode,
        source: 'uiohook',
      });
    };

    const onMousemove = (event) => {
      const now = Date.now();
      const moveMinMs = Number(process.env.ACTIVITY_MOVE_MIN_MS) || 200;
      if (this._lastMoveEmit && now - this._lastMoveEmit < moveMinMs) return;
      this._lastMoveEmit = now;
      this.emitEvent({
        type: 'move',
        platform: 'macos',
        dx: event.x,
        dy: event.y,
        source: 'uiohook',
      });
    };

    uIOhook.on('click', onClick);
    uIOhook.on('keydown', onKeydown);
    uIOhook.on('mousemove', onMousemove);

    this._handlers = [
      ['click', onClick],
      ['keydown', onKeydown],
      ['mousemove', onMousemove],
    ];

    uIOhook.start();
    this.started = true;
    console.log('✅ [UIOHOOK] In-process macOS input capture started (same app Accessibility grant)');
    return true;
  }

  stop() {
    if (!this.started || !uIOhook) return;
    try {
      for (const [name, handler] of this._handlers) {
        uIOhook.off(name, handler);
      }
      uIOhook.stop();
    } catch (err) {
      console.warn('[UIOHOOK] stop error:', err?.message || err);
    }
    this._handlers = [];
    this.started = false;
  }
}

module.exports = { MacOSUiohookInput };
