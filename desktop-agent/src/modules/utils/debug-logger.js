/**
 * Debug Logger Utility
 * Provides conditional logging based on environment flags
 * Usage: DEBUG_SCREENSHOT=1 DEBUG_INPUT=1 npm run start
 */

class DebugLogger {
  constructor() {
    this.screenshotDebug = process.env.DEBUG_SCREENSHOT === '1';
    this.inputDebug = process.env.DEBUG_INPUT === '1';
    this.enabled = this.screenshotDebug || this.inputDebug;
  }

  /**
   * Screenshot pipeline logs [SS0-SS5]
   */
  ss0(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS0] ${message}`, data);
    }
  }

  ss1(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS1] ${message}`, data);
    }
  }

  ss2(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS2] ${message}`, data);
    }
  }

  ss3(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS3] ${message}`, data);
    }
  }

  ss4(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS4] ${message}`, data);
    }
  }

  ss5(message, data = {}) {
    if (this.screenshotDebug) {
      console.log(`[SS5] ${message}`, data);
    }
  }

  /**
   * Input pipeline logs [IN0-IN6]
   */
  in0(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN0] ${message}`, data);
    }
  }

  in1(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN1] ${message}`, data);
    }
  }

  in2(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN2] ${message}`, data);
    }
  }

  in3(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN3] ${message}`, data);
    }
  }

  in4(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN4] ${message}`, data);
    }
  }

  in5(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN5] ${message}`, data);
    }
  }

  in6(message, data = {}) {
    if (this.inputDebug) {
      console.log(`[IN6] ${message}`, data);
    }
  }

  /**
   * Guard and validation logs
   */
  guard(subsystem, message, data = {}) {
    if (this.enabled) {
      console.log(`[GUARD-${subsystem.toUpperCase()}] ${message}`, data);
    }
  }

  init(subsystem, message, data = {}) {
    if (this.enabled) {
      console.log(`[INIT-${subsystem.toUpperCase()}] ${message}`, data);
    }
  }

  /**
   * Utility methods
   */
  isScreenshotDebugEnabled() {
    return this.screenshotDebug;
  }

  isInputDebugEnabled() {
    return this.inputDebug;
  }

  isEnabled() {
    return this.enabled;
  }

  logStartupInfo() {
    if (this.enabled) {
      console.log('🔍 Debug Logger initialized:');
      console.log(`  - Screenshot debug: ${this.screenshotDebug ? 'ENABLED' : 'disabled'}`);
      console.log(`  - Input debug: ${this.inputDebug ? 'ENABLED' : 'disabled'}`);
      console.log('  Use DEBUG_SCREENSHOT=1 DEBUG_INPUT=1 for full logging');
    }
  }
}

// Create singleton instance
const debugLogger = new DebugLogger();

module.exports = debugLogger;
