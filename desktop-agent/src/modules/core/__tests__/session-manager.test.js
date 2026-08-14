/**
 * Unit Tests for SessionManager
 * Tests session management functionality
 */

const SessionManager = require('../session-manager');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn()
  }
}));

describe('SessionManager', () => {
  let sessionManager;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      user_id: 'test-user-123',
      project_id: 'test-project-456'
    };

    sessionManager = new SessionManager(mockConfig);
    jest.clearAllMocks();
  });

  describe('saveDesktopAgentSession', () => {
    it('should save session data when remember_me is true', async () => {
      const sessionData = {
        email: 'test@example.com',
        remember_me: true,
        access_token: 'token123'
      };

      fs.writeFile.mockResolvedValue();

      await sessionManager.saveDesktopAgentSession(sessionData);

      expect(fs.writeFile).toHaveBeenCalledWith(
        sessionManager.USER_SESSION_PATH,
        expect.stringContaining('test@example.com')
      );
    });

    it('should clear session when remember_me is false', async () => {
      const sessionData = {
        email: 'test@example.com',
        remember_me: false
      };

      fs.unlink.mockResolvedValue();

      await sessionManager.saveDesktopAgentSession(sessionData);

      expect(fs.unlink).toHaveBeenCalledWith(sessionManager.USER_SESSION_PATH);
    });
  });

  describe('loadDesktopAgentSession', () => {
    it('should load valid session data', async () => {
      const mockSessionData = {
        email: 'test@example.com',
        access_token: 'token123',
        expires_at: Date.now() + 3600000 // 1 hour from now
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await sessionManager.loadDesktopAgentSession();

      expect(result).toEqual(mockSessionData);
      expect(fs.readFile).toHaveBeenCalledWith(sessionManager.USER_SESSION_PATH, 'utf8');
    });

    it('should return null for an expired session with no refresh token', async () => {
      const mockSessionData = {
        email: 'test@example.com',
        access_token: 'token123',
        auth_provider: 'cognito',
        expires_at: Date.now() - 3600000 // 1 hour ago
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockSessionData));
      fs.unlink.mockResolvedValue();

      const result = await sessionManager.loadDesktopAgentSession();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should keep expired Cognito session when refresh token is still valid', async () => {
      const mockSessionData = {
        id: 42,
        email: 'test@example.com',
        access_token: 'expired-id-token',
        refresh_token: 'refresh-token-30d',
        auth_provider: 'cognito',
        remember_me: true,
        expires_at: Date.now() - 3600000,
        refresh_expires_at: Date.now() + (365 * 24 * 60 * 60 * 1000),
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockSessionData));

      const result = await sessionManager.loadDesktopAgentSession();

      expect(result).toEqual(mockSessionData);
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should clear Cognito session when refresh token soft-expired', async () => {
      const mockSessionData = {
        id: 42,
        email: 'test@example.com',
        access_token: 'expired-id-token',
        refresh_token: 'stale-refresh',
        auth_provider: 'cognito',
        expires_at: Date.now() - 3600000,
        refresh_expires_at: Date.now() - 1000,
      };

      fs.readFile.mockResolvedValue(JSON.stringify(mockSessionData));
      fs.unlink.mockResolvedValue();

      const result = await sessionManager.loadDesktopAgentSession();

      expect(result).toBeNull();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should return null when file does not exist', async () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      fs.readFile.mockRejectedValue(error);

      const result = await sessionManager.loadDesktopAgentSession();

      expect(result).toBeNull();
    });
  });

  describe('isDesktopAgentSessionValid', () => {
    it('should return true for valid session', () => {
      const validSession = {
        access_token: 'token123',
        expires_at: Date.now() + 3600000
      };

      const result = sessionManager.isDesktopAgentSessionValid(validSession);

      expect(result).toBe(true);
    });

    it('should return false for expired session', () => {
      const expiredSession = {
        access_token: 'token123',
        expires_at: Date.now() - 3600000
      };

      const result = sessionManager.isDesktopAgentSessionValid(expiredSession);

      expect(result).toBe(false);
    });

    it('should return false for invalid session', () => {
      const invalidSession = null;

      const result = sessionManager.isDesktopAgentSessionValid(invalidSession);

      expect(result).toBe(false);
    });
  });

  describe('cleanupStaleActiveSessions', () => {
    // Stale sessions are now reconciled per-device at last proof-of-life by
    // session-recovery, not by a user-wide startup sweep. This must stay inert:
    // the old version closed every open row at start_time, which could zero out
    // work still running on the same employee's other machine.
    it('does not close sessions itself', async () => {
      await expect(sessionManager.cleanupStaleActiveSessions()).resolves.not.toThrow();
    });

    it('is safe to call with no user logged in', async () => {
      sessionManager.config.user_id = null;

      await expect(sessionManager.cleanupStaleActiveSessions()).resolves.not.toThrow();
    });
  });

  describe('setCurrentSession and getCurrentSession', () => {
    it('should set and get current session', () => {
      const testSession = { id: 'session123', start_time: new Date().toISOString() };

      sessionManager.setCurrentSession(testSession);
      const result = sessionManager.getCurrentSession();

      expect(result).toEqual(testSession);
    });
  });
});