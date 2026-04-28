/**
 * IPC Event Map Test Suite
 * Tests IPC handlers including projectId validation
 */

const IpcEventMap = require('../src/modules/core/ipc-event-map');

describe('IpcEventMap', () => {
  let ipcEventMap;
  let mockIpcMain;
  let mockTrackingManager;

  beforeEach(() => {
    // Mock IPC main
    mockIpcMain = {
      handle: jest.fn(),
      on: jest.fn()
    };

    // Mock tracking manager
    mockTrackingManager = {
      startTracking: jest.fn().mockResolvedValue({
        success: true,
        timeLogId: 'test-log-123',
        projectId: 'test-project'
      })
    };

    // Set up globals
    global.trackingManager = mockTrackingManager;
    global.currentProjectId = null;

    ipcEventMap = new IpcEventMap(mockIpcMain);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start-timer handler', () => {
    let startTimerHandler;

    beforeEach(() => {
      // Get the registered handler
      startTimerHandler = ipcEventMap.handlers.get('start-timer');
    });

    it('should require projectId to start timer', async () => {
      const result = await startTimerHandler(null, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project required to start timer');
      expect(result.message).toBe('Please select a project before starting the timer');
      expect(mockTrackingManager.startTracking).not.toHaveBeenCalled();
    });

    it('should use provided projectId', async () => {
      const result = await startTimerHandler(null, 'provided-project');

      expect(result.success).toBe(true);
      expect(mockTrackingManager.startTracking).toHaveBeenCalledWith('provided-project');
    });

    it('should fall back to global projectId', async () => {
      global.currentProjectId = 'global-project';

      const result = await startTimerHandler(null, null);

      expect(result.success).toBe(true);
      expect(mockTrackingManager.startTracking).toHaveBeenCalledWith('global-project');
    });

    it('should prefer provided projectId over global', async () => {
      global.currentProjectId = 'global-project';

      const result = await startTimerHandler(null, 'provided-project');

      expect(result.success).toBe(true);
      expect(mockTrackingManager.startTracking).toHaveBeenCalledWith('provided-project');
    });
  });

  describe('start-tracking legacy alias', () => {
    it('should delegate to start-timer handler', async () => {
      const startTimerHandler = ipcEventMap.handlers.get('start-timer');
      const startTrackingHandler = ipcEventMap.handlers.get('start-tracking');

      // Mock start-timer handler
      jest.spyOn(ipcEventMap.handlers, 'get').mockReturnValue(jest.fn().mockResolvedValue({ success: true }));

      await startTrackingHandler(null, 'test-project');

      expect(ipcEventMap.handlers.get).toHaveBeenCalledWith('start-timer');
    });
  });

  describe('handler registration', () => {
    it('should register all timer control handlers', () => {
      expect(ipcEventMap.handlers.has('start-timer')).toBe(true);
      expect(ipcEventMap.handlers.has('start-tracking')).toBe(true);
      expect(ipcEventMap.handlers.has('stop-timer')).toBe(true);
      expect(ipcEventMap.handlers.has('pause-timer')).toBe(true);
      expect(ipcEventMap.handlers.has('resume-timer')).toBe(true);
    });

    it('should not duplicate system-health-check handler', () => {
      // system-health-check should only be in CoreIPCManager
      expect(ipcEventMap.handlers.has('system-health-check')).toBe(false);
    });
  });
});
