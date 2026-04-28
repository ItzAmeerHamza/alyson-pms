/**
 * Test Setup File
 * Common setup for all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock global objects that might be used
global.isTracking = false;
global.currentTimeLogId = null;
global.currentUserId = 'test-user';
global.performanceMode = 'standard';

// Mock Electron if needed
if (!global.electron) {
  global.electron = {
    app: {
      getPath: jest.fn(() => '/mock/path'),
      quit: jest.fn()
    },
    ipcMain: {
      handle: jest.fn(),
      on: jest.fn()
    }
  };
}

// Clear all mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Cleanup after all tests
afterAll(() => {
  jest.restoreAllMocks();
});

