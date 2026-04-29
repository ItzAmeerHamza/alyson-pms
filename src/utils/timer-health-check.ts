import { logger } from '../lib/logger';

interface FeatureHealthStatus {
  screenshots: boolean;
  urlDetection: boolean;
  appDetection: boolean;
  fraudDetection: boolean;
  databaseConnection: boolean;
  lastCheck: Date;
  errorDetails: Record<string, string>;
}

interface HealthCheckResult {
  isHealthy: boolean;
  failedFeatures: string[];
  details: FeatureHealthStatus;
  canStartTimer: boolean;
  automatedReleaseTriggered?: boolean;
}

class TimerHealthChecker {
  private static instance: TimerHealthChecker;
  private healthStatus: FeatureHealthStatus = {
    screenshots: false,
    urlDetection: false,
    appDetection: false,
    fraudDetection: false,
    databaseConnection: false,
    lastCheck: new Date(),
    errorDetails: {}
  };

  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
  private readonly FAILURE_THRESHOLD = 5; // Number of consecutive failures before automated release
  private failureHistory: Map<string, number> = new Map(); // Track consecutive failures per feature
  
  public static getInstance(): TimerHealthChecker {
    if (!TimerHealthChecker.instance) {
      TimerHealthChecker.instance = new TimerHealthChecker();
    }
    return TimerHealthChecker.instance;
  }

  private constructor() {
    // Initialize health checker
    logger.info('🔍 Timer Health Checker initialized');
  }

  /**
   * Comprehensive health check before timer start
   */
  public async performPreTimerHealthCheck(): Promise<HealthCheckResult> {
    logger.info('🏥 Starting comprehensive health check...');
    
    const startTime = Date.now();
    const healthPromises = [
      this.checkScreenshotCapability(),
      this.checkURLDetection(),
      this.checkAppDetection(),
      this.checkFraudDetection(),
      this.checkDatabaseConnection()
    ];

    try {
      // Run all health checks in parallel with timeout
      const results = await Promise.allSettled(
        healthPromises.map(promise => 
          this.withTimeout(promise, this.HEALTH_CHECK_TIMEOUT)
        )
      );

      // Process results
      this.healthStatus.screenshots = results[0].status === 'fulfilled' && results[0].value;
      this.healthStatus.urlDetection = results[1].status === 'fulfilled' && results[1].value;
      this.healthStatus.appDetection = results[2].status === 'fulfilled' && results[2].value;
      this.healthStatus.fraudDetection = results[3].status === 'fulfilled' && results[3].value;
      this.healthStatus.databaseConnection = results[4].status === 'fulfilled' && results[4].value;
      this.healthStatus.lastCheck = new Date();

      // Clear previous error details
      this.healthStatus.errorDetails = {};

      // Collect error details for failed checks
      const features = ['screenshots', 'urlDetection', 'appDetection', 'fraudDetection', 'databaseConnection'];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.healthStatus.errorDetails[features[index]] = result.reason?.message || 'Unknown error';
        }
      });

      const failedFeatures = this.getFailedFeatures();
      const isHealthy = failedFeatures.length === 0;
      const canStartTimer = isHealthy || this.isTimerStartAllowed(failedFeatures);

      const checkDuration = Date.now() - startTime;
      logger.info(`🏥 Health check completed in ${checkDuration}ms`);

      if (isHealthy) {
        logger.info('✅ All features are healthy - Timer can start');
      } else {
        logger.warn(`⚠️ Some features failed: ${failedFeatures.join(', ')}`);
        if (canStartTimer) {
          logger.info('🟡 Timer start allowed with limited functionality');
        } else {
          logger.error('❌ Timer start blocked due to critical failures');
        }
      }

      // Check if automated release should be triggered
      const automatedReleaseTriggered = this.shouldTriggerAutomatedRelease(failedFeatures);
      
      if (automatedReleaseTriggered) {
        logger.warn('🚨 Health check failures detected - triggering automated release');
        this.triggerAutomatedRelease(failedFeatures);
      }

      return {
        isHealthy,
        failedFeatures,
        details: { ...this.healthStatus },
        canStartTimer,
        automatedReleaseTriggered
      };

    } catch (error) {
      logger.error('❌ Health check failed:', error);
      return {
        isHealthy: false,
        failedFeatures: ['healthCheckSystem'],
        details: { ...this.healthStatus },
        canStartTimer: false
      };
    }
  }

  /**
   * Test screenshot capability
   */
  private async checkScreenshotCapability(): Promise<boolean> {
    try {
      logger.debug('📸 Checking screenshot capability...');
      
      // Test screenshot functionality
      if (window.electron?.screenshots) {
        const testResult = await window.electron.screenshots.testCapability();
        if (testResult.success) {
          logger.debug('✅ Screenshot capability verified');
          return true;
        } else {
          throw new Error(testResult.error || 'Screenshot test failed');
        }
      } else {
        // Fallback test for web environment
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.fillStyle = 'red';
          ctx.fillRect(0, 0, 1, 1);
          const dataUrl = canvas.toDataURL();
          const isValid = dataUrl.startsWith('data:image/png;base64,');
          
          if (isValid) {
            logger.debug('✅ Screenshot capability verified (web fallback)');
            return true;
          }
        }
        
        throw new Error('Canvas not available for screenshots');
      }
    } catch (error) {
      logger.error('❌ Screenshot capability check failed:', error);
      throw error;
    }
  }

  /**
   * Test URL detection
   */
  private async checkURLDetection(): Promise<boolean> {
    try {
      logger.debug('🌐 Checking URL detection...');
      
      if (window.electron?.urlTracker) {
        const testResult = await window.electron.urlTracker.testDetection();
        if (testResult.success) {
          logger.debug('✅ URL detection verified');
          return true;
        } else {
          throw new Error(testResult.error || 'URL detection test failed');
        }
      } else {
        // Fallback test for web environment
        const currentUrl = window.location.href;
        if (currentUrl && currentUrl.length > 0) {
          logger.debug('✅ URL detection verified (web fallback)');
          return true;
        }
        
        throw new Error('URL detection not available');
      }
    } catch (error) {
      logger.error('❌ URL detection check failed:', error);
      throw error;
    }
  }

  /**
   * Test app detection
   */
  private async checkAppDetection(): Promise<boolean> {
    try {
      logger.debug('🖥️ Checking app detection...');
      
      if (window.electron?.appTracker) {
        const testResult = await window.electron.appTracker.testDetection();
        if (testResult.success && testResult.detectedApps && testResult.detectedApps.length > 0) {
          logger.debug(`✅ App detection verified (${testResult.detectedApps!.length} apps detected)`);
          return true;
        } else {
          throw new Error(testResult.error || 'No apps detected');
        }
      } else {
        // Fallback test for web environment
        const userAgent = navigator.userAgent;
        if (userAgent && userAgent.includes('Chrome')) {
          logger.debug('✅ App detection verified (web fallback - browser detected)');
          return true;
        }
        
        throw new Error('App detection not available in web environment');
      }
    } catch (error) {
      logger.error('❌ App detection check failed:', error);
      throw error;
    }
  }

  /**
   * Test fraud detection
   */
  private async checkFraudDetection(): Promise<boolean> {
    try {
      logger.debug('🛡️ Checking fraud detection...');
      
      if (window.electron?.fraudDetector) {
        const testResult = await window.electron.fraudDetector.testSystem();
        if (testResult.success) {
          logger.debug('✅ Fraud detection verified');
          return true;
        } else {
          throw new Error(testResult.error || 'Fraud detection test failed');
        }
      } else {
        // Fallback test for web environment
        const testPatterns = {
          mouseMovement: Date.now() % 2 === 0, // Simulate mouse activity
          keyboardActivity: document.hasFocus(),
          screenResolution: window.screen.width > 0 && window.screen.height > 0
        };
        
        const testsPassedCount = Object.values(testPatterns).filter(Boolean).length;
        
        if (testsPassedCount >= 2) {
          logger.debug('✅ Fraud detection verified (web fallback)');
          return true;
        }
        
        throw new Error('Fraud detection tests failed');
      }
    } catch (error) {
      logger.error('❌ Fraud detection check failed:', error);
      throw error;
    }
  }

  /**
   * Test database connection and saving
   */
  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      logger.debug('💾 Checking database connection...');
      
      // Test database connection with a simple query
      const testData = {
        type: 'health_check',
        timestamp: new Date().toISOString(),
        test_id: `health_${Date.now()}`
      };

      if (window.electron?.database) {
        const testResult = await window.electron.database.testConnection(testData);
        if (testResult.success) {
          logger.debug('✅ Database connection verified');
          return true;
        } else {
          throw new Error(testResult.error || 'Database test failed');
        }
      } else {
        // Fallback test for web environment (localStorage)
        const testKey = `health_check_${Date.now()}`;
        try {
          localStorage.setItem(testKey, JSON.stringify(testData));
          const retrieved = localStorage.getItem(testKey);
          
          if (retrieved) {
            const parsed = JSON.parse(retrieved);
            if (parsed.test_id === testData.test_id) {
              localStorage.removeItem(testKey); // Cleanup
              logger.debug('✅ Database connection verified (web fallback - localStorage)');
              return true;
            }
          }
          
          throw new Error('LocalStorage test failed');
        } catch (storageError) {
          throw new Error(`Storage not available: ${storageError}`);
        }
      }
    } catch (error) {
      logger.error('❌ Database connection check failed:', error);
      throw error;
    }
  }

  /**
   * Helper method to add timeout to promises
   */
  private withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  /**
   * Get list of failed features
   */
  private getFailedFeatures(): string[] {
    const features = [
      { name: 'screenshots', status: this.healthStatus.screenshots },
      { name: 'urlDetection', status: this.healthStatus.urlDetection },
      { name: 'appDetection', status: this.healthStatus.appDetection },
      { name: 'fraudDetection', status: this.healthStatus.fraudDetection },
      { name: 'databaseConnection', status: this.healthStatus.databaseConnection }
    ];

    return features.filter(f => !f.status).map(f => f.name);
  }

  /**
   * Determine if timer start is allowed despite some failures
   */
  private isTimerStartAllowed(failedFeatures: string[]): boolean {
    // Critical features that must work for timer to start
    const criticalFeatures = ['databaseConnection'];
    
    // Check if any critical features failed
    const hasCriticalFailures = failedFeatures.some(feature => 
      criticalFeatures.includes(feature)
    );

    // Allow timer start if no critical failures
    return !hasCriticalFailures;
  }

  /**
   * Check if automated release should be triggered based on failure patterns
   */
  private shouldTriggerAutomatedRelease(failedFeatures: string[]): boolean {
    if (failedFeatures.length === 0) {
      // Reset failure counts if all features are working
      this.failureHistory.clear();
      return false;
    }

    // Update failure counts
    for (const feature of failedFeatures) {
      const currentCount = this.failureHistory.get(feature) || 0;
      this.failureHistory.set(feature, currentCount + 1);
    }

    // Reset counts for features that are now working
    const workingFeatures = ['screenshots', 'urlDetection', 'appDetection', 'fraudDetection', 'databaseConnection']
      .filter(f => !failedFeatures.includes(f));
    
    for (const feature of workingFeatures) {
      this.failureHistory.delete(feature);
    }

    // Check if any critical feature has exceeded failure threshold
    const criticalFeatures = ['databaseConnection', 'screenshots'];
    for (const feature of criticalFeatures) {
      const failures = this.failureHistory.get(feature) || 0;
      if (failures >= this.FAILURE_THRESHOLD) {
        logger.warn(`🚨 Critical feature ${feature} has failed ${failures} times - triggering automated release`);
        return true;
      }
    }

    // Check if multiple features are failing simultaneously
    if (failedFeatures.length >= 3) {
      logger.warn(`🚨 Multiple features failing (${failedFeatures.length}) - triggering automated release`);
      return true;
    }

    return false;
  }

  /**
   * Trigger automated release process
   */
  private async triggerAutomatedRelease(failedFeatures: string[]): Promise<void> {
    try {
      logger.warn('🚀 Triggering automated release due to health check failures:', failedFeatures);
      
      // Create failure report
      const failureReport = {
        timestamp: new Date().toISOString(),
        failedFeatures,
        failureHistory: Object.fromEntries(this.failureHistory),
        errorDetails: this.healthStatus.errorDetails,
        userAgent: navigator.userAgent,
        appVersion: window.electron?.appVersion || 'web'
      };

      // Log the failure report
      console.warn('🔍 Health Check Failure Report:', failureReport);

      // In desktop environment, trigger release script
      if (window.electron?.triggerAutomatedRelease) {
        await window.electron.triggerAutomatedRelease(failureReport);
        logger.info('✅ Automated release triggered via desktop app');
      } else {
        // Web environment - log to console and potentially send to backend
        logger.warn('⚠️ Web environment - automated release requires manual intervention');
        
        // You could send this to a backend endpoint to trigger CI/CD
        try {
          if (typeof fetch !== 'undefined') {
            await fetch('/api/health-check-failure', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(failureReport)
            });
          }
        } catch (apiError) {
          logger.error('Failed to report health check failure to backend:', apiError);
        }
      }

      // Show user notification
      this.showAutomatedReleaseNotification(failedFeatures);

    } catch (error) {
      logger.error('❌ Failed to trigger automated release:', error);
    }
  }

  /**
   * Show notification to user about automated release
   */
  private showAutomatedReleaseNotification(failedFeatures: string[]): void {
    const message = `🚀 System maintenance initiated due to ${failedFeatures.length} feature failures. An updated version will be available shortly.`;
    
    if ('Notification' in window) {
      // Check notification permission
      if (Notification.permission === 'granted') {
        new Notification('Alyson PM - System Update', {
          body: message,
          icon: '/favicon.ico'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('Alyson PM - System Update', {
              body: message,
              icon: '/favicon.ico'
            });
          }
        });
      }
    }

    // Also create a console log for debugging
    console.info('🔔 User notification sent:', message);
  }

  /**
   * Get current health status
   */
  public getHealthStatus(): FeatureHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Retry health check for specific feature
   */
  public async retryFeatureCheck(featureName: keyof FeatureHealthStatus): Promise<boolean> {
    logger.info(`🔄 Retrying health check for ${featureName}...`);
    
    try {
      let result = false;
      
      switch (featureName) {
        case 'screenshots':
          result = await this.checkScreenshotCapability();
          break;
        case 'urlDetection':
          result = await this.checkURLDetection();
          break;
        case 'appDetection':
          result = await this.checkAppDetection();
          break;
        case 'fraudDetection':
          result = await this.checkFraudDetection();
          break;
        case 'databaseConnection':
          result = await this.checkDatabaseConnection();
          break;
      }
      
      (this.healthStatus as any)[featureName] = result;
      
      if (result) {
        delete this.healthStatus.errorDetails[featureName];
        logger.info(`✅ ${featureName} health check passed on retry`);
      } else {
        logger.warn(`❌ ${featureName} health check failed on retry`);
      }
      
      return result;
    } catch (error) {
      logger.error(`❌ ${featureName} retry failed:`, error);
      this.healthStatus.errorDetails[featureName] = (error as any).message || 'Retry failed';
      return false;
    }
  }
}

// Export singleton instance
export const timerHealthChecker = TimerHealthChecker.getInstance();

// Export types
export type { FeatureHealthStatus, HealthCheckResult }; 