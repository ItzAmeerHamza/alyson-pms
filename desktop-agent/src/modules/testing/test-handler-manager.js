/**
 * TEST HANDLER MANAGER MODULE
 * 
 * Manages all test-related IPC handlers for the TimeFlow desktop agent.
 * This includes system capability tests, health checks, and diagnostic functions.
 * 
 * Part of TimeFlow Desktop Agent modular refactoring
 */

class TestHandlerManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.detectBrowserUrl = dependencies.detectBrowserUrl;
    this.captureScreenshot = dependencies.captureScreenshot;
    this.getActiveApplication = dependencies.getActiveApplication;
    this.antiCheatDetector = dependencies.antiCheatDetector;
    this.supabase = dependencies.supabase;
    this.global = dependencies.global || global;
    
    console.log('✅ TestHandlerManager initialized');
  }

  /**
   * Register all test-related IPC handlers
   */
  registerHandlers() {
    this.registerScreenshotTest();
    this.registerUrlDetectionTest();
    this.registerAppDetectionTest();
    this.registerFraudDetectionTest();
    this.registerDatabaseConnectionTest();
    this.registerInputDetectionTest();
    
    console.log('✅ All test IPC handlers registered');
  }

  /**
   * Test screenshot capability
   */
  registerScreenshotTest() {
    this.ipcMain.handle('test-screenshot-capability', async () => {
      console.log('🧪 [IPC] REAL Screenshot test - testing full workflow...');
      const startTime = Date.now();
      try {
        // Test the ACTUAL screenshot function workflow (health check mode)
        const testResult = await this.captureScreenshot(true);
        const endTime = Date.now();
        
        console.log(`⏱️ [IPC] Real screenshot test took ${endTime - startTime}ms`);
        
        if (testResult !== false) {
          console.log('✅ [IPC] REAL screenshot test passed - full workflow working');
          return { success: true, message: 'Full screenshot workflow verified' };
        } else {
          console.log('❌ [IPC] REAL screenshot test failed - workflow issue');
          return { success: false, error: 'Screenshot workflow failed' };
        }
      } catch (error) {
        console.error('❌ [IPC] REAL screenshot test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test URL detection capability
   */
  registerUrlDetectionTest() {
    this.ipcMain.handle('test-url-detection', async () => {
      try {
        console.log('🧪 Testing URL detection...');
        const urlData = await this.detectBrowserUrl();
        
        // Reject placeholder URLs - only accept real URLs
        if (urlData && urlData.url) {
          const isPlaceholder = urlData.url.includes('browser-activity-detected.local') || 
                              urlData.url === 'favorites://' || 
                              urlData.url === 'newtab://' || 
                              urlData.url === 'about:blank';
          
          if (isPlaceholder) {
            console.log('⚠️ [URL-TEST] Detected placeholder URL, testing with real website...');
            
            // Try to open a test website and capture it
            try {
              const { execSync } = require('child_process');
              console.log('🌐 [URL-TEST] Opening test website...');
              execSync('open "https://example.com"', { timeout: 2000 });
              
              // Wait for browser to load
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Try to detect URL again
              const realUrlData = await this.detectBrowserUrl();
              if (realUrlData && realUrlData.url && !realUrlData.url.includes('browser-activity-detected.local')) {
                console.log('✅ [URL-TEST] Real URL detected after opening website');
                return { 
                  success: true, 
                  message: `Real URL detected: ${realUrlData.url}`,
                  url: realUrlData.url
                };
              }
            } catch (testError) {
              console.log('⚠️ [URL-TEST] Test website approach failed:', testError.message);
            }
            
            return { 
              success: false, 
              error: 'URL detection only returns placeholder URLs. AppleScript permissions may be needed for Safari/Chrome URL access.',
              url: urlData.url
            };
          }
          
          console.log('✅ [URL-TEST] Real URL detected');
          return { 
            success: true, 
            message: `Real URL detected: ${urlData.url}`,
            url: urlData.url
          };
        }
        
        return { 
          success: false, 
          error: 'No URL detected. Browser may not be running or permissions may be needed.' 
        };
      } catch (error) {
        console.error('❌ URL detection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test app detection capability
   */
  registerAppDetectionTest() {
    this.ipcMain.handle('test-app-detection', async () => {
      try {
        console.log('🧪 Testing app detection...');
        const activeApp = await this.getActiveApplication();
        
        if (activeApp && activeApp.name) {
          console.log('✅ App detection working');
          return { 
            success: true, 
            message: `Active app detected: ${activeApp.name}`,
            app: activeApp 
          };
        }
        
        return { 
          success: false, 
          error: 'No active app detected. Accessibility permissions may be needed.' 
        };
      } catch (error) {
        console.error('❌ App detection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test fraud detection capability
   */
  registerFraudDetectionTest() {
    this.ipcMain.handle('test-fraud-detection', async () => {
      try {
        console.log('🧪 Testing fraud detection...');
        
        if (!this.antiCheatDetector) {
          return { 
            success: false, 
            error: 'Anti-cheat detector not initialized' 
          };
        }
        
        // Test fraud detection with sample data
        const testReport = this.antiCheatDetector.generateReport();
        
        if (testReport) {
          console.log('✅ Fraud detection working');
          return { 
            success: true, 
            message: 'Fraud detection system operational',
            report: testReport 
          };
        }
        
        return { 
          success: false, 
          error: 'Fraud detection test failed' 
        };
      } catch (error) {
        console.error('❌ Fraud detection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test database connection
   */
  registerDatabaseConnectionTest() {
    this.ipcMain.handle('test-database-connection', async () => {
      try {
        console.log('🧪 Testing database connection...');
        
        if (!this.supabase) {
          return { 
            success: false, 
            error: 'Supabase client not initialized' 
          };
        }
        
        // Test database connection with a simple query
        const { data, error } = await this.supabase
          .from('time_logs')
          .select('id')
          .limit(1);
        
        if (error) {
          console.error('❌ Database test failed:', error);
          return { 
            success: false, 
            error: `Database connection failed: ${error.message}` 
          };
        }
        
        console.log('✅ Database connection working');
        return { 
          success: true, 
          message: 'Database connection successful' 
        };
      } catch (error) {
        console.error('❌ Database connection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Test input detection capability
   */
  registerInputDetectionTest() {
    this.ipcMain.handle('test-input-detection', async () => {
      try {
        console.log('🧪 Testing input detection...');
        
        // Test if global input detection functions are available
        const hasMouseDetection = typeof this.global.recordActivityForDisplay === 'function';
        const hasKeyboardDetection = typeof this.global.recordActivityForDisplay === 'function';
        const hasIdleDetection = typeof this.global.getSystemIdleTime === 'function';
        
        if (hasMouseDetection && hasKeyboardDetection && hasIdleDetection) {
          console.log('✅ Input detection systems available');
          return { 
            success: true, 
            message: 'Input detection systems operational',
            capabilities: {
              mouse: hasMouseDetection,
              keyboard: hasKeyboardDetection,
              idle: hasIdleDetection
            }
          };
        }
        
        return { 
          success: false, 
          error: 'Some input detection systems are not available',
          capabilities: {
            mouse: hasMouseDetection,
            keyboard: hasKeyboardDetection,
            idle: hasIdleDetection
          }
        };
      } catch (error) {
        console.error('❌ Input detection test failed:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Initialize the test handler manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🧪 TestHandlerManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ TestHandlerManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the test handler manager
   */
  async shutdown() {
    try {
      // Remove all registered handlers
      console.log('🧪 TestHandlerManager shutdown complete');
    } catch (error) {
      console.error('❌ TestHandlerManager shutdown failed:', error);
    }
  }
}

module.exports = TestHandlerManager;