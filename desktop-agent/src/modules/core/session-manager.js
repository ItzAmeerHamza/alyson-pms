/**
 * Session Manager Module
 * Manages user authentication sessions and tracking sessions
 * Extracted from main.js for modular architecture
 */

const fs = require('fs').promises;
const path = require('path');
const cleanupRegistry = require('./cleanup-registry');

class SessionManager {
  constructor(config) {
    this.config = config;
    this.USER_SESSION_PATH = path.join(
      require('os').homedir(), 
      '.alyson_work_time_agent_session.json'
    );
    
    // Session state
    this.currentSession = null;
    
    // Register for cleanup
    cleanupRegistry.registerResource({
      name: 'sessionManager',
      cleanup: async () => this.cleanup()
    });
  }

  /**
   * Handle user login payload from renderer and persist session
   * This is invoked by ipc-handlers.js when the renderer calls 'user-logged-in'
   */
  async handleUserLogin(userData) {
    try {
      if (!userData) {
        return { success: false, message: 'Missing user data' };
      }

      // Normalize incoming shape: { user, session } or flat fields
      const incomingUser = userData.user || userData;
      const incomingSession = userData.session || userData;

      const userId = incomingUser?.id || userData.id;
      const { normalizeTenantUserId } = require('../utils/tenant-user-id');
      const normalizedUserId = normalizeTenantUserId(userId);
      if (!normalizedUserId) {
        console.warn(
          '⚠️ [SESSION] Ignoring login with non-integer user id (clear old session):',
          userId,
        );
        return {
          success: false,
          message:
            'Invalid user profile id. Sign out, clear saved session, and sign in again.',
        };
      }
      const email = incomingUser?.email || userData.email || incomingSession?.email;
      const role = incomingUser?.role || userData.role || 'employee';
      const fullName = incomingUser?.name || incomingUser?.full_name || email?.split('@')[0] || 'User';
      const accessToken = incomingSession?.access_token;
      const refreshToken = incomingSession?.refresh_token;
      let expiresAt = incomingSession?.expires_at || 0;
      let refreshExpiresAt = incomingSession?.refresh_expires_at || 0;
      
      // Multi-tenant organization support
      const organizationId = incomingUser?.organization_id || incomingSession?.organization_id || null;
      const organizationSlug = incomingUser?.organization_slug || incomingSession?.organization_slug || null;
      const isOrgAdmin = incomingUser?.is_org_admin || false;
      const isSuperAdmin = incomingUser?.is_super_admin || false;
      const authProvider = incomingSession?.auth_provider || userData.auth_provider || 'cognito';

      // Ensure expires_at is in milliseconds
      if (expiresAt && expiresAt < 9999999999) {
        expiresAt = expiresAt * 1000;
      }
      if (refreshExpiresAt && refreshExpiresAt < 9999999999) {
        refreshExpiresAt = refreshExpiresAt * 1000;
      }
      // Standard desktop persistence: keep refresh usable for ~1 year
      // (Cognito app-client refresh expiry must match or be longer)
      if (!refreshExpiresAt && refreshToken) {
        refreshExpiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
      }

      const sessionToSave = {
        id: normalizedUserId,
        email,
        role,
        full_name: fullName,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt || null,
        saved_at: Date.now(),
        remember_me: true,
        auth_provider: authProvider,
        organization_id: organizationId,
        organization_slug: organizationSlug,
        is_org_admin: isOrgAdmin,
        is_super_admin: isSuperAdmin,
      };

      // Persist to disk
      await this.saveDesktopAgentSession(sessionToSave);

      // Update config/globals for downstream modules
      if (this.config) {
        this.config.user_id = normalizedUserId;
        this.config.organization_id = organizationId;
      }
      global.currentUserId = normalizedUserId;
      global.currentUserRole = role;
      global.currentOrganizationId = organizationId;

      console.log('✅ [SESSION] User login handled and session persisted for:', email, organizationSlug ? `(org: ${organizationSlug})` : '');
      try {
        const { refreshWorkspaceSettings, startWorkspaceSettingsRefresh } = require('../utils/workspace-settings');
        await refreshWorkspaceSettings(this.config, { restartCapture: false });
        startWorkspaceSettingsRefresh(this.config);
      } catch (settingsErr) {
        console.warn('⚠️ [SESSION] Workspace settings load failed:', settingsErr?.message || settingsErr);
      }
      try {
        const NotTrackingReminderManager = require('../activity/not-tracking-reminder-manager');
        if (!global.notTrackingReminderManager) {
          global.notTrackingReminderManager = new NotTrackingReminderManager();
        }
        if (!global.isTracking && !global.trackingManager?.isTracking) {
          global.notTrackingReminderManager.start();
        } else {
          global.notTrackingReminderManager.onTrackingStarted();
        }
      } catch (reminderErr) {
        console.warn(
          '⚠️ [SESSION] Not-tracking reminder start failed:',
          reminderErr?.message || reminderErr,
        );
      }
      return { success: true, message: 'Session saved' };
    } catch (error) {
      console.error('❌ [SESSION] handleUserLogin error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Initialize with dependencies.
   * Kept as an explicit no-op: the session store is the API + on-disk session
   * file, so there is nothing left to inject, but startup still calls this.
   */
  initialize(_dependencies = {}) {}

  /**
   * Save desktop agent session to file
   */
  async saveDesktopAgentSession(sessionData) {
    try {
      if (sessionData && sessionData.remember_me) {
        // Move JSON stringification to setImmediate to avoid blocking
        const sessionJson = await new Promise(resolve => {
          setImmediate(() => {
            try {
              resolve(JSON.stringify(sessionData, null, 2));
            } catch (stringifyError) {
              console.error('❌ Failed to stringify session data:', stringifyError);
              resolve('{}');
            }
          });
        });
        
        // Use async file write
        await fs.writeFile(this.USER_SESSION_PATH, sessionJson);
        console.log('✅ Desktop agent session saved:', sessionData.email);
      } else {
        // Clear session if remember_me is false
        await this.clearDesktopAgentSession();
      }
    } catch (error) {
      console.error('❌ Failed to save desktop agent session:', error);
    }
  }

  /**
   * Load desktop agent session from file
   */
  async loadDesktopAgentSession() {
    try {
      // Use async file read
      const data = await fs.readFile(this.USER_SESSION_PATH, 'utf8');
      
      // Move JSON parsing to setImmediate to avoid blocking
      const session = await new Promise(resolve => {
        setImmediate(() => {
          try {
            resolve(JSON.parse(data));
          } catch (parseError) {
            console.error('❌ Failed to parse session data:', parseError);
            resolve(null);
          }
        });
      });
      
      if (!session) return null;

      const { normalizeTenantUserId } = require('../utils/tenant-user-id');
      if (
        (session.auth_provider === 'cognito' || !session.auth_provider) &&
        session.id &&
        !normalizeTenantUserId(session.id)
      ) {
        console.warn('⚠️ Clearing stale session with non-integer user id:', session.id);
        await this.clearDesktopAgentSession();
        return null;
      }
      
      // Access/ID token expiry (~1h for Cognito) is NOT a full logout.
      // Keep the disk session when a refresh token is still usable so the
      // renderer can refresh and restore login after app/OS restarts (~1 year).
      if (session.expires_at && Date.now() > session.expires_at) {
        const refreshSoftExpired =
          session.refresh_expires_at && Date.now() > session.refresh_expires_at;

        if (session.refresh_token && !refreshSoftExpired) {
          // Refresh is a renderer/Cognito concern — keep the session on disk so
          // login is restored instead of forcing the employee to sign in again.
          console.log(
            '⚠️ Access token expired — keeping session for refresh-token restore',
          );
          return session;
        }

        // No usable refresh token left: the main process has no authenticated
        // identity, so it cannot check for an open session here. Rows still open
        // are closed server-side at their last proof-of-life, never at NOW.
        console.log('⚠️ Desktop agent session expired (no usable refresh token), clearing...');
        await this.clearDesktopAgentSession();
        return null;
      }
      
      console.log('✅ Desktop agent session loaded:', session.email);
      return session;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to load desktop agent session:', error);
        await this.clearDesktopAgentSession();
      }
    }
    return null;
  }

  /**
   * Clear desktop agent session
   */
  async clearDesktopAgentSession() {
    try {
      await fs.unlink(this.USER_SESSION_PATH);
      console.log('✅ Desktop agent session cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to clear desktop agent session:', error);
      }
    }
  }

  /**
   * Check if session is valid
   */
  isDesktopAgentSessionValid(session) {
    if (!session || !session.access_token || !session.expires_at) {
      return false;
    }
    
    return Date.now() < session.expires_at;
  }

  /**
   * Handle user logout and cleanup session
   * This is invoked by ipc-handlers.js when the renderer calls 'user-logged-out'
   */
  async handleUserLogout() {
    try {
      console.log('👤 [SESSION] User logout requested');

      // Logging out must stop the clock. This has to happen BEFORE user state is
      // cleared below — once currentUserId is null there is no way to identify
      // which sessions to close, and they stayed open accruing time.
      try {
        if (global.isTracking || global.trackingManager?.isTracking) {
          console.log('🛑 [SESSION] Stopping tracking before logout');
          await global.stopTracking?.('user_logout', 'Signed out — session closed');
        }
        const userId = global.currentUserId || this.config?.user_id;
        if (userId) {
          const { closeOpenSessionsAfterExplicitStop } = require('../utils/session-recovery');
          await closeOpenSessionsAfterExplicitStop({
            userId,
            reason: 'user_logout',
            protectLive: false,
          });
        }
      } catch (stopErr) {
        console.warn('⚠️ [SESSION] Stop-on-logout failed:', stopErr?.message || stopErr);
      }

      // Clear current session
      this.currentSession = null;
      
      // Clear config user ID and organization
      if (this.config) {
        this.config.user_id = null;
        this.config.organization_id = null;
      }
      
      // Clear global user state
      global.currentUserId = null;
      global.currentUserRole = null;
      global.currentOrganizationId = null;

      try {
        global.notTrackingReminderManager?.stop?.();
      } catch (_) { /* ignore */ }
      
      // Clear saved session file
      try {
        await fs.unlink(this.USER_SESSION_PATH);
        console.log('✅ [SESSION] Cleared saved session file');
      } catch (error) {
        // File might not exist, which is fine
        console.log('ℹ️ [SESSION] No saved session file to clear');
      }
      
      console.log('✅ [SESSION] User logout completed successfully');
      return { success: true, message: 'User logged out successfully' };
      
    } catch (error) {
      console.error('❌ [SESSION] handleUserLogout error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Clean up stale active sessions.
   *
   * There is no RDS equivalent of the user-wide sweep this used to run, and there
   * must not be one from here: it had no device scope, so it could close a session
   * this employee is still running on another machine — at that row's own
   * start_time, billing zero for real work. Stale rows are reconciled per device
   * by session-recovery, and server-side by the liveness ceiling / stale-session
   * job, both of which close at the last proof-of-life.
   */
  async cleanupStaleActiveSessions() {
    if (!this.config.user_id) {
      console.log('🧹 [CLEANUP] Skipping cleanup - no user session found (first-time user)');
      return { success: true, closedCount: 0, skipped: 'no_user' };
    }

    console.warn(
      '⚠️ [CLEANUP] Startup stale-session sweep is not performed here — device-scoped reconcile (session-recovery) and the server-side stale-session job own this',
    );
    return { success: true, closedCount: 0, skipped: 'delegated_to_reconcile' };
  }
  
  /**
   * Close any existing unclosed sessions before starting a new one.
   * Returns { success: boolean, closedCount: number } so the caller knows
   * whether cleanup actually worked.
   */
  async closeExistingSessionsBeforeStart() {
    try {
      const userId = this.config.user_id;
      if (!userId) {
        console.warn('⚠️ [SESSION] Cannot close existing sessions - missing user_id');
        return { success: false, closedCount: 0 };
      }

      const { isBackendTimeLogsEnabled, closeActiveSessions } = require('../utils/backend-time-logs');
      if (!isBackendTimeLogsEnabled()) {
        console.warn('⚠️ [SESSION] Cannot close existing sessions - backend API not configured');
        return { success: false, closedCount: 0 };
      }

      console.log('🔄 [SESSION] Closing any existing unclosed sessions before starting new one...');

      try {
        const { getDeviceId } = require('../utils/device-id');
        const deviceId = getDeviceId();
        // Inspect: stale rows are closed at last heartbeat (never NOW).
        const result = await closeActiveSessions(userId, deviceId, global.config, {
          prefer_recover: false,
        });
        const flagged = result?.flagged_count ?? 0;
        console.log(`🚩 [SESSION] RDS inspect/flag open sessions: flagged=${flagged}`);
        return { success: true, closedCount: 0, flaggedCount: flagged };
      } catch (rdsErr) {
        console.warn('⚠️ [SESSION] RDS close failed:', rdsErr.message || rdsErr);
        return { success: false, closedCount: 0 };
      }
    } catch (error) {
      console.error('⚠️ [SESSION] Error closing existing sessions:', error);
      return { success: false, closedCount: 0 };
    }
  }

  /**
   * Update current tracking session
   */
  setCurrentSession(session) {
    this.currentSession = session;
  }

  /**
   * Get current tracking session
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Get current user ID from config or globals
   */
  getUserId() {
    // Priority order: config user_id, global currentUserId, config userId
    return this.config?.user_id || global.currentUserId || this.config?.userId || null;
  }

  /**
   * Cleanup on shutdown
   */
  async cleanup() {
    // Any cleanup needed on shutdown
    this.currentSession = null;
  }
}

module.exports = SessionManager;