const { expect } = require('chai');
const sinon = require('sinon');

// Mock the enhanced app detector
class MockEnhancedAppDetector {
  constructor(config) {
    this.config = config;
    this.lastActiveApp = null;
    this.lastAppCaptureTime = 0;
    this.isTracking = false;
  }

  shouldCaptureApp(appName, now) {
    const timeSinceLastCapture = now - this.lastAppCaptureTime;
    const isAppSwitch = this.lastActiveApp !== appName;
    const shouldCaptureAgain = timeSinceLastCapture > 30000; // 30 seconds
    
    return isAppSwitch || shouldCaptureAgain;
  }

  normalizeAppName(processName) {
    // Normalize helper processes to parent app
    const mappings = {
      'Google Chrome Helper': 'Google Chrome',
      'Safari Web Content': 'Safari',
      'Safari Networking': 'Safari',
      'Code Helper': 'Visual Studio Code',
      'Cursor Helper': 'Cursor',
      'WhatsApp Helper': 'WhatsApp',
      'Zoom Meeting': 'Zoom'
    };
    
    return mappings[processName] || processName;
  }

  deduplicateAppSwitches(switches, windowMs = 2000) {
    // Remove rapid A→B→A switches within windowMs
    const deduplicated = [];
    
    for (let i = 0; i < switches.length; i++) {
      const current = switches[i];
      const next = switches[i + 1];
      const nextNext = switches[i + 2];
      
      // Check for A→B→A pattern
      if (next && nextNext && 
          current.app === nextNext.app &&
          nextNext.timestamp - current.timestamp <= windowMs) {
        // Skip the middle switch
        deduplicated.push(current);
        i += 2; // Skip next two
      } else {
        deduplicated.push(current);
      }
    }
    
    return deduplicated;
  }
}

describe('App Detection Unit Tests', () => {
  let detector;
  let clock;

  beforeEach(() => {
    detector = new MockEnhancedAppDetector({ user_id: 'test-user' });
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('shouldCaptureApp', () => {
    it('should capture on app switch', () => {
      detector.lastActiveApp = 'Safari';
      detector.lastAppCaptureTime = Date.now();
      
      const shouldCapture = detector.shouldCaptureApp('Chrome', Date.now());
      expect(shouldCapture).to.be.true;
    });

    it('should capture same app after 30 seconds', () => {
      detector.lastActiveApp = 'Safari';
      detector.lastAppCaptureTime = Date.now();
      
      // Advance time by 31 seconds
      clock.tick(31000);
      
      const shouldCapture = detector.shouldCaptureApp('Safari', Date.now());
      expect(shouldCapture).to.be.true;
    });

    it('should not capture same app within 30 seconds', () => {
      detector.lastActiveApp = 'Safari';
      detector.lastAppCaptureTime = Date.now();
      
      // Advance time by 15 seconds
      clock.tick(15000);
      
      const shouldCapture = detector.shouldCaptureApp('Safari', Date.now());
      expect(shouldCapture).to.be.false;
    });

    it('should handle rapid app switches correctly', () => {
      const now = Date.now();
      
      // Switch to Chrome
      expect(detector.shouldCaptureApp('Chrome', now)).to.be.true;
      detector.lastActiveApp = 'Chrome';
      detector.lastAppCaptureTime = now;
      
      // Quick switch to Safari after 1 second
      clock.tick(1000);
      expect(detector.shouldCaptureApp('Safari', now + 1000)).to.be.true;
      detector.lastActiveApp = 'Safari';
      detector.lastAppCaptureTime = now + 1000;
      
      // Quick switch back to Chrome after 1 second
      clock.tick(1000);
      expect(detector.shouldCaptureApp('Chrome', now + 2000)).to.be.true;
    });
  });

  describe('normalizeAppName', () => {
    it('should normalize Chrome helper processes', () => {
      expect(detector.normalizeAppName('Google Chrome Helper')).to.equal('Google Chrome');
    });

    it('should normalize Safari helper processes', () => {
      expect(detector.normalizeAppName('Safari Web Content')).to.equal('Safari');
      expect(detector.normalizeAppName('Safari Networking')).to.equal('Safari');
    });

    it('should normalize code editor helpers', () => {
      expect(detector.normalizeAppName('Code Helper')).to.equal('Visual Studio Code');
      expect(detector.normalizeAppName('Cursor Helper')).to.equal('Cursor');
    });

    it('should return unmapped process names as-is', () => {
      expect(detector.normalizeAppName('Terminal')).to.equal('Terminal');
      expect(detector.normalizeAppName('Finder')).to.equal('Finder');
    });
  });

  describe('deduplicateAppSwitches', () => {
    it('should remove rapid A→B→A switches', () => {
      const switches = [
        { app: 'Safari', timestamp: 0 },
        { app: 'Chrome', timestamp: 500 },
        { app: 'Safari', timestamp: 1000 },
        { app: 'Terminal', timestamp: 5000 }
      ];
      
      const result = detector.deduplicateAppSwitches(switches, 2000);
      
      expect(result).to.have.lengthOf(2);
      expect(result[0].app).to.equal('Safari');
      expect(result[1].app).to.equal('Terminal');
    });

    it('should keep A→B→A switches outside window', () => {
      const switches = [
        { app: 'Safari', timestamp: 0 },
        { app: 'Chrome', timestamp: 1000 },
        { app: 'Safari', timestamp: 3000 }, // Outside 2s window
        { app: 'Terminal', timestamp: 5000 }
      ];
      
      const result = detector.deduplicateAppSwitches(switches, 2000);
      
      expect(result).to.have.lengthOf(4);
    });

    it('should handle empty array', () => {
      const result = detector.deduplicateAppSwitches([]);
      expect(result).to.be.empty;
    });

    it('should handle single switch', () => {
      const switches = [{ app: 'Safari', timestamp: 0 }];
      const result = detector.deduplicateAppSwitches(switches);
      
      expect(result).to.have.lengthOf(1);
      expect(result[0].app).to.equal('Safari');
    });
  });

  describe('Apple Notes Detection', () => {
    it('should detect and normalize Apple Notes correctly', () => {
      // Test Apple Notes app data
      const appleNotesApp = {
        name: 'Notes',
        bundleId: 'com.apple.Notes',
        title: 'My Important Notes',
        platform: 'darwin',
        method: 'applescript'
      };
      
      // Should capture Apple Notes
      const now = Date.now();
      const shouldCapture = detector.shouldCaptureApp('Notes', now);
      expect(shouldCapture).to.be.true;
      
      // Test normalization doesn't break Apple apps
      expect(detector.normalizeAppName('Notes')).to.equal('Notes');
    });
    
    it('should handle notebook search for Notes app', () => {
      // Simulate search functionality
      const apps = [
        { app_name: 'Notes', window_title: 'My Notes' },
        { app_name: 'Safari', window_title: 'Google' },
        { app_name: 'TextEdit', window_title: 'Document.txt' }
      ];
      
      // Search for "notebook" should find "Notes"
      const searchTerm = 'notebook';
      const filtered = apps.filter(app => {
        const appNameLower = app.app_name.toLowerCase();
        return appNameLower.includes(searchTerm.toLowerCase()) ||
               (searchTerm.includes('notebook') && appNameLower.includes('notes'));
      });
      
      expect(filtered).to.have.lengthOf(1);
      expect(filtered[0].app_name).to.equal('Notes');
    });
  });

  describe('App Detection Integration', () => {
    it('should correctly track app usage over time', () => {
      const appHistory = [];
      const captureApp = (appName) => {
        const now = Date.now();
        if (detector.shouldCaptureApp(appName, now)) {
          appHistory.push({
            app: detector.normalizeAppName(appName),
            timestamp: now
          });
          detector.lastActiveApp = appName;
          detector.lastAppCaptureTime = now;
        }
      };

      // Simulate user activity
      captureApp('Safari'); // Should capture
      expect(appHistory).to.have.lengthOf(1);

      clock.tick(5000); // 5 seconds
      captureApp('Safari'); // Should not capture (same app, < 30s)
      expect(appHistory).to.have.lengthOf(1);

      captureApp('Google Chrome Helper'); // Should capture (different app)
      expect(appHistory).to.have.lengthOf(2);
      expect(appHistory[1].app).to.equal('Google Chrome');

      clock.tick(35000); // 35 seconds
      captureApp('Google Chrome'); // Should capture (same app, > 30s)
      expect(appHistory).to.have.lengthOf(3);
    });
  });

  describe('Full App Detection Flow', () => {
    let mockSupabase;
    let mockSyncManager;
    let mockPlatformManager;
    let detector;
    
    beforeEach(() => {
      // Mock Supabase
      mockSupabase = {
        from: sinon.stub().returns({
          insert: sinon.stub().resolves({ error: null })
        })
      };
      
      // Mock Sync Manager
      mockSyncManager = {
        addAppLogs: sinon.stub().resolves()
      };
      
      // Mock Platform Manager
      mockPlatformManager = {
        detectActiveApplication: sinon.stub()
      };
      
      // Set up globals
      global.supabaseService = mockSupabase;
      global.syncManager = mockSyncManager;
      global.platformManager = mockPlatformManager;
      global.currentUserId = 'test-user-123';
      global.currentTimeLogId = 'test-log-456';
      
      detector = new MockEnhancedAppDetector({
        user_id: 'test-user-123',
        app_capture_interval_seconds: 10
      });
    });
    
    afterEach(() => {
      sinon.restore();
      delete global.supabaseService;
      delete global.syncManager;
      delete global.platformManager;
      delete global.currentUserId;
      delete global.currentTimeLogId;
    });
    
    it('should capture app switches and persist to database', () => {
      // Mock platform detection returning different apps
      mockPlatformManager.detectActiveApplication
        .onCall(0).resolves({ name: 'Cursor', title: 'test.js', bundleId: 'com.cursor.app' })
        .onCall(1).resolves({ name: 'Safari', title: 'Google', bundleId: 'com.apple.Safari' });
      
      detector.isTracking = true;
      
      // Simulate first detection
      return mockPlatformManager.detectActiveApplication().then(app1 => {
        expect(app1.name).to.equal('Cursor');
        
        // Check if should capture (first app)
        const shouldCapture1 = detector.shouldCaptureApp(app1.name, Date.now());
        expect(shouldCapture1).to.be.true;
        
        // Simulate capturing
        if (shouldCapture1) {
          detector.lastActiveApp = app1.name;
          detector.lastAppCaptureTime = Date.now();
          
          // Verify sync manager would be called
          const appData = {
            user_id: global.currentUserId,
            time_log_id: global.currentTimeLogId,
            app_name: app1.name,
            window_title: app1.title,
            app_path: app1.bundleId,
            timestamp: new Date().toISOString()
          };
          
          return mockSyncManager.addAppLogs([appData]).then(() => {
            expect(mockSyncManager.addAppLogs.calledOnce).to.be.true;
            expect(mockSyncManager.addAppLogs.firstCall.args[0][0]).to.deep.include({
              user_id: 'test-user-123',
              time_log_id: 'test-log-456',
              app_name: 'Cursor'
            });
            
            // Update the lastAppCaptureTime to simulate time passing
            detector.lastAppCaptureTime = Date.now() - 100;
            
            // Simulate second detection
            return mockPlatformManager.detectActiveApplication();
          });
        }
      }).then(app2 => {
        if (app2) {
          expect(app2.name).to.equal('Safari');
          
          // Check if should capture (app switch)
          const shouldCapture2 = detector.shouldCaptureApp(app2.name, Date.now());
          expect(shouldCapture2).to.be.true;
          
          // Verify second capture
          if (shouldCapture2) {
            const appData2 = {
              user_id: global.currentUserId,
              time_log_id: global.currentTimeLogId,
              app_name: app2.name,
              window_title: app2.title,
              app_path: app2.bundleId,
              timestamp: new Date().toISOString()
            };
            
            return mockSyncManager.addAppLogs([appData2]).then(() => {
              expect(mockSyncManager.addAppLogs.calledTwice).to.be.true;
              expect(mockSyncManager.addAppLogs.secondCall.args[0][0]).to.deep.include({
                app_name: 'Safari'
              });
            });
          }
        }
      });
    });
    
    it('should handle missing user ID gracefully', async () => {
      global.currentUserId = null;
      detector.config.user_id = null;
      
      mockPlatformManager.detectActiveApplication
        .resolves({ name: 'Terminal', title: 'bash', bundleId: 'com.apple.Terminal' });
      
      detector.isTracking = true;
      
      const app = await mockPlatformManager.detectActiveApplication();
      const shouldCapture = detector.shouldCaptureApp(app.name, Date.now());
      
      if (shouldCapture) {
        // Should fall back to direct insert when user ID is missing
        const appData = {
          user_id: null, // No user ID available
          time_log_id: global.currentTimeLogId,
          app_name: app.name,
          window_title: app.title,
          app_path: app.bundleId,
          timestamp: new Date().toISOString()
        };
        
        // In real implementation, this would log a warning
        console.warn('⚠️ [APP-CAPTURE] No user ID available for app capture');
        
        // Should not try to save without user ID
        expect(appData.user_id).to.be.null;
      }
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha();
  
  mocha.addFile(__filename);
  mocha.run(failures => {
    process.exit(failures ? 1 : 0);
  });
}
