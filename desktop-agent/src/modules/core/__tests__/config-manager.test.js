/**
 * Unit Tests for ConfigManager
 * Tests configuration management functionality
 */

const ConfigManager = require('../config-manager');
const fs = require('fs');

// Mock dependencies
jest.mock('fs');
jest.mock('../../core/cleanup-registry', () => ({
  registerResource: jest.fn()
}));

describe('ConfigManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new ConfigManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    configManager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with default settings', () => {
      expect(configManager.defaultSettings).toBeDefined();
      expect(configManager.defaultSettings.screenshot_interval_seconds).toBe(30);
      expect(configManager.defaultSettings.idle_threshold_seconds).toBe(900);
    });

    it('should register with cleanup registry', () => {
      const cleanupRegistry = require('../../core/cleanup-registry');
      expect(cleanupRegistry.registerResource).toHaveBeenCalledWith({
        name: 'configManager',
        cleanup: expect.any(Function)
      });
    });
  });

  describe('configuration loading', () => {
    it('should load environment config', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      process.env.BACKEND_API_URL = 'test-url';

      await configManager.loadEnvironmentConfig();

      expect(configManager.envConfig.BACKEND_API_URL).toBe('test-url');
    });

    it('should load user settings with defaults', async () => {
      await configManager.loadUserSettings();

      expect(configManager.appSettings).toEqual(configManager.defaultSettings);
    });
  });

  describe('performance mode detection', () => {
    it('should detect low power mode', () => {
      jest.spyOn(require('os'), 'totalmem').mockReturnValue(2 * 1024 * 1024 * 1024); // 2GB

      const mode = configManager.detectPerformanceMode();
      expect(mode).toBe('low_power');
    });

    it('should detect high performance mode', () => {
      jest.spyOn(require('os'), 'totalmem').mockReturnValue(20 * 1024 * 1024 * 1024); // 20GB

      const mode = configManager.detectPerformanceMode();
      expect(mode).toBe('high_performance');
    });

    it('should detect standard mode', () => {
      jest.spyOn(require('os'), 'totalmem').mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB

      const mode = configManager.detectPerformanceMode();
      expect(mode).toBe('standard');
    });
  });

  describe('configuration access', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get configuration values', () => {
      configManager.config.test_value = 'test';

      const value = configManager.get('test_value');
      expect(value).toBe('test');
    });

    it('should get nested configuration values', () => {
      configManager.config.nested = { test: 'value' };

      const value = configManager.get('nested.test');
      expect(value).toBe('value');
    });

    it('should return default for missing values', () => {
      const value = configManager.get('missing_key', 'default');
      expect(value).toBe('default');
    });

    it('should set configuration values', () => {
      configManager.set('new_key', 'new_value');
      expect(configManager.config.new_key).toBe('new_value');
    });
  });

  describe('app settings', () => {
    it('should get app setting', () => {
      const interval = configManager.getSetting('screenshot_interval_seconds');
      expect(interval).toBe(30);
    });

    it('should set app setting', () => {
      configManager.setSetting('screenshot_interval_seconds', 60);
      expect(configManager.appSettings.screenshot_interval_seconds).toBe(60);
    });

    it('should return default for missing setting', () => {
      const value = configManager.getSetting('missing_setting', 'default');
      expect(value).toBe('default');
    });
  });

  describe('validation', () => {
    it('should validate screenshot interval minimum', () => {
      configManager.appSettings.screenshot_interval_seconds = 5;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      configManager.validateConfiguration();

      expect(configManager.appSettings.screenshot_interval_seconds).toBe(10);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Screenshot interval too low')
      );

      consoleSpy.mockRestore();
    });

    it('should validate idle threshold minimum', () => {
      configManager.appSettings.idle_threshold_seconds = 100;
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      configManager.validateConfiguration();

      expect(configManager.appSettings.idle_threshold_seconds).toBe(300);

      consoleSpy.mockRestore();
    });
  });

  describe('configuration export', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should export safe configuration', () => {
      configManager.config.INTERNAL_API_KEY = 'secret';
      configManager.config.safe_value = 'public';

      const exported = configManager.exportConfig();

      expect(exported.config.safe_value).toBe('public');
      // INTERNAL_API_KEY is now the only backend credential; it must never be exported.
      expect(exported.config.INTERNAL_API_KEY).toBeUndefined();
    });
  });

  describe('reset functionality', () => {
    it('should reset to defaults', () => {
      configManager.appSettings.screenshot_interval_seconds = 120;

      configManager.resetToDefaults();

      expect(configManager.appSettings.screenshot_interval_seconds).toBe(30);
    });
  });
});