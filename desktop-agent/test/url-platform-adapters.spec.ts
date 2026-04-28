/**
 * Platform Adapter Tests
 * Tests for URL capture adapters on different platforms
 */

import { execSync } from 'child_process';
import { MacOSUrlCapture } from '../src/platform/darwin/urlCapture';
import { UrlEvent } from '../src/modules/url/types';

// Mock child_process
jest.mock('child_process');
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Platform Adapters', () => {
  describe('MacOSUrlCapture', () => {
    let adapter: MacOSUrlCapture;
    let capturedEvents: UrlEvent[] = [];
    let stopFn: (() => void) | null = null;

    beforeEach(() => {
      adapter = new MacOSUrlCapture();
      capturedEvents = [];
      jest.clearAllMocks();
      jest.useFakeTimers();
    });

    afterEach(() => {
      if (stopFn) {
        stopFn();
        stopFn = null;
      }
      jest.useRealTimers();
    });

    it('should capture Chrome URLs via AppleScript', () => {
      // Mock active app detection
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Google Chrome|com.google.Chrome|12345';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'Example Page - Chrome';
        }
        if (command.includes('tell application "Google Chrome"')) {
          return 'https://example.com/page';
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      // Trigger capture
      jest.advanceTimersByTime(1000);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0]).toMatchObject({
        app: 'com.google.Chrome',
        source: 'chrome',
        url: 'https://example.com/page',
        title: 'Example Page - Chrome',
        pid: 12345
      });
    });

    it('should capture Safari URLs', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Safari|com.apple.Safari|23456';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'Apple - Safari';
        }
        if (command.includes('tell application "Safari"')) {
          return 'https://apple.com';
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      jest.advanceTimersByTime(1000);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0]).toMatchObject({
        app: 'com.apple.Safari',
        source: 'safari',
        url: 'https://apple.com',
        title: 'Apple - Safari'
      });
    });

    it('should handle Firefox with title extraction fallback', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Firefox|org.mozilla.firefox|34567';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'Mozilla - mozilla.org — Mozilla Firefox';
        }
        if (command.includes('tell application "Firefox"')) {
          throw new Error('Firefox AppleScript not supported');
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      jest.advanceTimersByTime(1000);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0]).toMatchObject({
        app: 'org.mozilla.firefox',
        source: 'firefox',
        url: 'https://mozilla.org', // Extracted from title
        title: 'Mozilla - mozilla.org — Mozilla Firefox'
      });
    });

    it('should skip non-browser applications', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Visual Studio Code|com.microsoft.VSCode|45678';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'main.js - project';
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      jest.advanceTimersByTime(1000);

      expect(capturedEvents).toHaveLength(0);
    });

    it('should handle AppleScript errors gracefully', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('osascript: command not found');
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      // Should not throw
      expect(() => jest.advanceTimersByTime(1000)).not.toThrow();
      expect(capturedEvents).toHaveLength(0);
    });

    it('should handle empty browser windows', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Google Chrome|com.google.Chrome|12345';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'New Tab';
        }
        if (command.includes('tell application "Google Chrome"')) {
          return ''; // Empty URL
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      jest.advanceTimersByTime(1000);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0]).toMatchObject({
        app: 'com.google.Chrome',
        source: 'chrome',
        url: null,
        title: 'New Tab'
      });
    });

    it('should stop capturing when stop function is called', () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('tell application "System Events"') && 
            command.includes('bundle identifier')) {
          return 'Google Chrome|com.google.Chrome|12345';
        }
        if (command.includes('tell application "System Events"') && 
            command.includes('front window')) {
          return 'Example';
        }
        if (command.includes('tell application "Google Chrome"')) {
          return 'https://example.com';
        }
        return '';
      });

      stopFn = adapter.start((event) => {
        capturedEvents.push(event);
      });

      jest.advanceTimersByTime(1000);
      expect(capturedEvents).toHaveLength(1);

      // Stop capturing
      stopFn();
      stopFn = null;

      // Advance time again
      jest.advanceTimersByTime(1000);
      
      // Should not capture more events
      expect(capturedEvents).toHaveLength(1);
    });
  });
});

