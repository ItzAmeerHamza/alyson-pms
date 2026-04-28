/**
 * Randomizer - Utility functions for random interval generation and timing
 * Extracted from main.js to improve modularity and maintainability
 */

class Randomizer {
  constructor(options = {}) {
    this.baseInterval = options.baseInterval || 60000; // 1 minute default
    this.variancePercent = options.variancePercent || 0.2; // 20% variance default
    this.minInterval = options.minInterval || 10000; // 10 seconds minimum
    this.maxInterval = options.maxInterval || 300000; // 5 minutes maximum
    
    console.log('✅ Randomizer initialized');
  }

  /**
   * Generate a random interval based on base interval with variance
   * @param {number} baseInterval - Base interval in milliseconds
   * @param {number} variancePercent - Variance as percentage (0.2 = 20%)
   * @returns {number} Random interval in milliseconds
   */
  randomInterval(baseInterval = null, variancePercent = null) {
    const base = baseInterval || this.baseInterval;
    const variance = variancePercent !== null ? variancePercent : this.variancePercent;
    
    // Calculate variance range
    const varianceRange = base * variance;
    const minValue = base - varianceRange;
    const maxValue = base + varianceRange;
    
    // Generate random value within range
    const randomValue = minValue + (Math.random() * (maxValue - minValue));
    
    // Ensure within absolute bounds
    return Math.max(this.minInterval, Math.min(this.maxInterval, Math.round(randomValue)));
  }

  /**
   * Generate a random delay for retry operations with exponential backoff
   * @param {number} attempt - Current attempt number (0-based)
   * @param {number} baseDelay - Base delay in milliseconds
   * @param {number} maxDelay - Maximum delay in milliseconds
   * @returns {number} Random delay in milliseconds
   */
  exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
    // Exponential backoff: delay = baseDelay * 2^attempt
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    
    // Add jitter (random variance)
    const jitter = exponentialDelay * 0.1 * Math.random();
    const delayWithJitter = exponentialDelay + jitter;
    
    // Cap at maximum delay
    return Math.min(delayWithJitter, maxDelay);
  }

  /**
   * Generate random screenshot intervals to avoid predictable patterns
   * @param {number} baseScreenshotInterval - Base interval for screenshots
   * @returns {number} Random screenshot interval
   */
  randomScreenshotInterval(baseScreenshotInterval = 60000) {
    // Screenshots should have more variance to avoid detection patterns
    return this.randomInterval(baseScreenshotInterval, 0.3); // 30% variance
  }

  /**
   * Generate random idle check intervals
   * @param {number} baseIdleInterval - Base interval for idle checks
   * @returns {number} Random idle check interval
   */
  randomIdleCheckInterval(baseIdleInterval = 30000) {
    // Idle checks can have moderate variance
    return this.randomInterval(baseIdleInterval, 0.15); // 15% variance
  }

  /**
   * Generate random app detection intervals
   * @param {number} baseAppInterval - Base interval for app detection
   * @returns {number} Random app detection interval
   */
  randomAppDetectionInterval(baseAppInterval = 5000) {
    // App detection should be fairly regular but with some variance
    return this.randomInterval(baseAppInterval, 0.1); // 10% variance
  }

  /**
   * Generate random URL capture intervals
   * @param {number} baseUrlInterval - Base interval for URL capture
   * @returns {number} Random URL capture interval
   */
  randomUrlCaptureInterval(baseUrlInterval = 10000) {
    // URL capture can have moderate variance
    return this.randomInterval(baseUrlInterval, 0.2); // 20% variance
  }

  /**
   * Generate random sync intervals
   * @param {number} baseSyncInterval - Base interval for data sync
   * @returns {number} Random sync interval
   */
  randomSyncInterval(baseSyncInterval = 30000) {
    // Sync intervals should have minimal variance for reliability
    return this.randomInterval(baseSyncInterval, 0.05); // 5% variance
  }

  /**
   * Generate a random delay within a specified range
   * @param {number} min - Minimum delay in milliseconds
   * @param {number} max - Maximum delay in milliseconds
   * @returns {number} Random delay in milliseconds
   */
  randomDelay(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Generate a random timeout for operations
   * @param {number} baseTimeout - Base timeout in milliseconds
   * @param {number} variancePercent - Variance percentage
   * @returns {number} Random timeout in milliseconds
   */
  randomTimeout(baseTimeout = 5000, variancePercent = 0.1) {
    return this.randomInterval(baseTimeout, variancePercent);
  }

  /**
   * Generate random batch sizes for data processing
   * @param {number} baseBatchSize - Base batch size
   * @param {number} maxVariance - Maximum variance in items
   * @returns {number} Random batch size
   */
  randomBatchSize(baseBatchSize = 10, maxVariance = 3) {
    const variance = Math.floor(Math.random() * (maxVariance * 2 + 1)) - maxVariance;
    return Math.max(1, baseBatchSize + variance);
  }

  /**
   * Generate random intervals for different types of monitoring
   * @param {string} type - Type of monitoring ('screenshot', 'idle', 'app', 'url', 'sync')
   * @param {number} baseInterval - Base interval for the monitoring type
   * @returns {number} Random interval appropriate for the monitoring type
   */
  getRandomIntervalForType(type, baseInterval) {
    switch (type) {
      case 'screenshot':
        return this.randomScreenshotInterval(baseInterval);
      case 'idle':
        return this.randomIdleCheckInterval(baseInterval);
      case 'app':
        return this.randomAppDetectionInterval(baseInterval);
      case 'url':
        return this.randomUrlCaptureInterval(baseInterval);
      case 'sync':
        return this.randomSyncInterval(baseInterval);
      default:
        return this.randomInterval(baseInterval);
    }
  }

  /**
   * Create a randomized scheduler for repeating tasks
   * @param {Function} callback - Function to execute
   * @param {string} type - Type of task for appropriate randomization
   * @param {number} baseInterval - Base interval for the task
   * @returns {Object} Scheduler object with start/stop methods
   */
  createRandomScheduler(callback, type = 'default', baseInterval = 60000) {
    let timeoutId = null;
    let isRunning = false;

    const scheduleNext = () => {
      if (!isRunning) return;
      
      const nextInterval = this.getRandomIntervalForType(type, baseInterval);
      timeoutId = setTimeout(() => {
        if (isRunning) {
          try {
            callback();
          } catch (error) {
            console.error(`❌ [RANDOMIZER] Error in scheduled ${type} task:`, error);
          }
          scheduleNext(); // Schedule next execution
        }
      }, nextInterval);
    };

    return {
      start() {
        if (!isRunning) {
          isRunning = true;
          scheduleNext();
          console.log(`🎲 [RANDOMIZER] Started random scheduler for ${type}`);
        }
      },
      
      stop() {
        isRunning = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.log(`🛑 [RANDOMIZER] Stopped random scheduler for ${type}`);
      },
      
      isRunning() {
        return isRunning;
      }
    };
  }

  /**
   * Generate random coordinates within screen bounds
   * @param {number} screenWidth - Screen width in pixels
   * @param {number} screenHeight - Screen height in pixels
   * @param {Object} padding - Padding from edges {top, right, bottom, left}
   * @returns {Object} Random coordinates {x, y}
   */
  randomCoordinates(screenWidth, screenHeight, padding = {}) {
    const pad = {
      top: padding.top || 0,
      right: padding.right || 0,
      bottom: padding.bottom || 0,
      left: padding.left || 0
    };

    const x = pad.left + Math.random() * (screenWidth - pad.left - pad.right);
    const y = pad.top + Math.random() * (screenHeight - pad.top - pad.bottom);

    return {
      x: Math.round(x),
      y: Math.round(y)
    };
  }

  /**
   * Generate a random user agent string from a predefined list
   * @returns {string} Random user agent string
   */
  randomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Generate random sleep time for avoiding rate limits
   * @param {number} minMs - Minimum sleep time in milliseconds
   * @param {number} maxMs - Maximum sleep time in milliseconds
   * @returns {Promise} Promise that resolves after random delay
   */
  async randomSleep(minMs = 100, maxMs = 1000) {
    const delay = this.randomDelay(minMs, maxMs);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate random boolean with specified probability
   * @param {number} probability - Probability of true (0.0 to 1.0)
   * @returns {boolean} Random boolean
   */
  randomBoolean(probability = 0.5) {
    return Math.random() < probability;
  }

  /**
   * Select random item from array
   * @param {Array} array - Array to select from
   * @returns {*} Random item from array
   */
  randomFromArray(array) {
    if (!Array.isArray(array) || array.length === 0) {
      return null;
    }
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Generate random string of specified length
   * @param {number} length - Length of string to generate
   * @param {string} charset - Character set to use
   * @returns {string} Random string
   */
  randomString(length = 8, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }
}

// Create default instance for easy access
const defaultRandomizer = new Randomizer();

// Export both class and default instance
module.exports = {
  Randomizer,
  randomizer: defaultRandomizer,
  
  // Convenience functions using default instance
  randomInterval: (base, variance) => defaultRandomizer.randomInterval(base, variance),
  exponentialBackoff: (attempt, baseDelay, maxDelay) => defaultRandomizer.exponentialBackoff(attempt, baseDelay, maxDelay),
  randomScreenshotInterval: (base) => defaultRandomizer.randomScreenshotInterval(base),
  randomIdleCheckInterval: (base) => defaultRandomizer.randomIdleCheckInterval(base),
  randomAppDetectionInterval: (base) => defaultRandomizer.randomAppDetectionInterval(base),
  randomUrlCaptureInterval: (base) => defaultRandomizer.randomUrlCaptureInterval(base),
  randomSyncInterval: (base) => defaultRandomizer.randomSyncInterval(base),
  randomDelay: (min, max) => defaultRandomizer.randomDelay(min, max),
  randomTimeout: (base, variance) => defaultRandomizer.randomTimeout(base, variance),
  randomBatchSize: (base, variance) => defaultRandomizer.randomBatchSize(base, variance),
  createRandomScheduler: (callback, type, baseInterval) => defaultRandomizer.createRandomScheduler(callback, type, baseInterval),
  randomCoordinates: (width, height, padding) => defaultRandomizer.randomCoordinates(width, height, padding),
  randomUserAgent: () => defaultRandomizer.randomUserAgent(),
  randomSleep: (min, max) => defaultRandomizer.randomSleep(min, max),
  randomBoolean: (probability) => defaultRandomizer.randomBoolean(probability),
  randomFromArray: (array) => defaultRandomizer.randomFromArray(array),
  randomString: (length, charset) => defaultRandomizer.randomString(length, charset)
};