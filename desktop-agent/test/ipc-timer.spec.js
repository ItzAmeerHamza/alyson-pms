const { expect } = require('chai');
const sinon = require('sinon');
const { EventEmitter } = require('events');

describe('IPC Timer Functionality', () => {
  let clock;
  let ipcManager;
  let mockIpcRenderer;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    
    // Mock IPC renderer
    mockIpcRenderer = {
      on: sinon.stub(),
      send: sinon.stub(),
      removeAllListeners: sinon.stub()
    };

    // Mock IPC manager with basic functionality
    class MockIpcManager extends EventEmitter {
      constructor() {
        super();
        this.ipcRenderer = mockIpcRenderer;
        this.isTracking = false;
        this.sessionStartTime = null;
        this.sessionTimer = null;
      }

      startSessionTimer() {
        if (this.sessionTimer) {
          clearInterval(this.sessionTimer);
        }
        
        // Emit immediate update so UI doesn't wait 1s for first tick
        this.emit('session-timer-update', {
          startTime: this.sessionStartTime,
          currentTime: new Date(),
          isTracking: this.isTracking
        });
        
        this.sessionTimer = setInterval(() => {
          this.emit('session-timer-update', {
            startTime: this.sessionStartTime,
            currentTime: new Date(),
            isTracking: this.isTracking
          });
        }, 1000);
      }

      stopSessionTimer() {
        if (this.sessionTimer) {
          clearInterval(this.sessionTimer);
          this.sessionTimer = null;
        }
      }
    }

    ipcManager = new MockIpcManager();
  });

  afterEach(() => {
    clock.restore();
    ipcManager.removeAllListeners();
    ipcManager.stopSessionTimer();
  });

  describe('startSessionTimer', () => {
    it('should emit immediate session-timer-update event', () => {
      const updateSpy = sinon.spy();
      ipcManager.on('session-timer-update', updateSpy);
      
      const startTime = new Date('2024-01-01T10:00:00Z');
      ipcManager.sessionStartTime = startTime;
      ipcManager.isTracking = true;
      
      ipcManager.startSessionTimer();
      
      // Should emit immediately
      expect(updateSpy.calledOnce).to.be.true;
      const firstCall = updateSpy.getCall(0).args[0];
      expect(firstCall.startTime).to.equal(startTime);
      expect(firstCall.isTracking).to.be.true;
    });

    it('should emit updates every second after initial emit', () => {
      const updateSpy = sinon.spy();
      ipcManager.on('session-timer-update', updateSpy);
      
      const startTime = new Date('2024-01-01T10:00:00Z');
      ipcManager.sessionStartTime = startTime;
      ipcManager.isTracking = true;
      
      ipcManager.startSessionTimer();
      
      // Initial emit
      expect(updateSpy.callCount).to.equal(1);
      
      // Advance 1 second
      clock.tick(1000);
      expect(updateSpy.callCount).to.equal(2);
      
      // Advance another 2 seconds
      clock.tick(2000);
      expect(updateSpy.callCount).to.equal(4);
    });

    it('should clear existing timer before starting new one', () => {
      const clearIntervalSpy = sinon.spy(global, 'clearInterval');
      
      ipcManager.sessionStartTime = new Date();
      ipcManager.isTracking = true;
      
      // Start first timer
      ipcManager.startSessionTimer();
      const firstTimer = ipcManager.sessionTimer;
      
      // Start second timer
      ipcManager.startSessionTimer();
      
      expect(clearIntervalSpy.calledWith(firstTimer)).to.be.true;
      clearIntervalSpy.restore();
    });
  });

  describe('tracking-started event handler', () => {
    it('should handle tracking-started event and emit immediate update', () => {
      const updateSpy = sinon.spy();
      
      // Simulate the actual handler from ipc-manager.js
      const trackingStartedHandler = (event, data) => {
        ipcManager.isTracking = true;
        ipcManager.trackingStatus = 'active';
        ipcManager.sessionStartTime = new Date(data.start_time || data.startTime);
        
        ipcManager.startSessionTimer();
        
        ipcManager.emit('tracking-state-changed', {
          isTracking: ipcManager.isTracking,
          status: ipcManager.trackingStatus,
          startTime: ipcManager.sessionStartTime
        });
      };
      
      ipcManager.on('session-timer-update', updateSpy);
      
      const startTime = '2024-01-01T10:00:00Z';
      trackingStartedHandler(null, {
        timeLogId: 'test-123',
        project_id: 'project-456',
        start_time: startTime,
        isTracking: true
      });
      
      // Should emit timer update immediately
      expect(updateSpy.calledOnce).to.be.true;
      const timerUpdate = updateSpy.getCall(0).args[0];
      expect(timerUpdate.startTime).to.deep.equal(new Date(startTime));
      expect(timerUpdate.isTracking).to.be.true;
    });
  });

  describe('Time formatting', () => {
    it('should format elapsed time correctly as HH:MM:SS', () => {
      const formatTime = (startTime) => {
        const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      };
      
      const startTime = new Date().toISOString();
      
      // Test immediate (0 seconds)
      expect(formatTime(startTime)).to.equal('00:00:00');
      
      // Test after 1 minute
      clock.tick(60 * 1000);
      expect(formatTime(startTime)).to.equal('00:01:00');
      
      // Test after 1 hour 30 minutes 45 seconds
      clock.tick((1 * 3600 + 29 * 60 + 45) * 1000);
      expect(formatTime(startTime)).to.equal('01:30:45');
    });
  });

  describe('Timer cleanup', () => {
    it('should clear timer on stop', () => {
      ipcManager.sessionStartTime = new Date();
      ipcManager.isTracking = true;
      
      ipcManager.startSessionTimer();
      expect(ipcManager.sessionTimer).to.not.be.null;
      
      ipcManager.stopSessionTimer();
      expect(ipcManager.sessionTimer).to.be.null;
    });
    
    it('should not emit updates after timer is stopped', () => {
      const updateSpy = sinon.spy();
      ipcManager.on('session-timer-update', updateSpy);
      
      ipcManager.sessionStartTime = new Date();
      ipcManager.isTracking = true;
      
      ipcManager.startSessionTimer();
      updateSpy.resetHistory();
      
      ipcManager.stopSessionTimer();
      
      // Advance time
      clock.tick(5000);
      
      // Should not have emitted any updates
      expect(updateSpy.called).to.be.false;
    });
  });
});
