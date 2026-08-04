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
    this.supabaseService = null;
    
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
      const authProvider = incomingSession?.auth_provider || userData.auth_provider || 'supabase';

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

      // Forward Supabase session only for legacy Supabase auth (not Cognito JWT)
      try {
        if (
          sessionToSave.auth_provider !== 'cognito' &&
          this.supabaseService?.auth?.setSession &&
          accessToken &&
          refreshToken
        ) {
          await this.supabaseService.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        }
      } catch (e) {
        console.log('⚠️ [SESSION] Failed to set Supabase session in main process:', e?.message || e);
      }

      console.log('✅ [SESSION] User login handled and session persisted for:', email, organizationSlug ? `(org: ${organizationSlug})` : '');
      try {
        const { refreshWorkspaceSettings, startWorkspaceSettingsRefresh } = require('../utils/workspace-settings');
        await refreshWorkspaceSettings(this.config, { restartCapture: false });
        startWorkspaceSettingsRefresh(this.config);
      } catch (settingsErr) {
        console.warn('⚠️ [SESSION] Workspace settings load failed:', settingsErr?.message || settingsErr);
      }
      return { success: true, message: 'Session saved' };
    } catch (error) {
      console.error('❌ [SESSION] handleUserLogin error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.supabaseService = dependencies.supabaseService;
  }

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
          if (session.auth_provider === 'cognito') {
            console.log(
              '⚠️ Cognito access token expired — keeping session for refresh-token restore',
            );
            return session;
          }

          console.log('⚠️ Desktop agent session expired, attempting recovery...');
          const recoveredSession = await this.recoverExpiredSession(session);
          if (recoveredSession) {
            console.log('✅ Session recovered successfully');
            return recoveredSession;
          }

          // Supabase recovery failed but refresh token still present — hand to renderer
          console.log(
            '⚠️ Access token expired — keeping session for renderer refresh restore',
          );
          return session;
        }

        // CRITICAL FIX: Check for active database sessions before clearing
        const activeSession = await this.syncWithActiveTrackingSession(session);
        if (activeSession) {
          console.log('✅ Session synchronized with active tracking');
          return activeSession;
        }
        
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
   * CRITICAL FIX: Try to recover expired session using refresh token
   */
  async recoverExpiredSession(expiredSession) {
    try {
      if (!expiredSession.refresh_token || !this.supabaseService) {
        return null;
      }
      
      console.log('🔄 Attempting to refresh expired session...');
      
      // Try to refresh the session
      const { data, error } = await this.supabaseService.auth.setSession({
        access_token: expiredSession.access_token,
        refresh_token: expiredSession.refresh_token
      });
      
      if (!error && data.session) {
        // Session refreshed successfully, save new tokens
        const refreshedSession = {
          ...expiredSession,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at * 1000 // Convert to milliseconds
        };
        
        await this.saveDesktopAgentSession(refreshedSession);
        
        // Update globals
        global.currentUserId = expiredSession.id;
        global.currentOrganizationId = expiredSession.organization_id || null;
        if (global.config) {
          global.config.user_id = expiredSession.id;
          global.config.organization_id = expiredSession.organization_id || null;
        }
        
        console.log('✅ Session refreshed and saved');
        return refreshedSession;
      }
      
      console.log('⚠️ Session refresh failed:', error?.message);
      return null;
    } catch (error) {
      console.warn('⚠️ Session recovery error:', error.message);
      return null;
    }
  }

  /**
   * CRITICAL FIX: Sync with active tracking sessions in database
   */
  async syncWithActiveTrackingSession(expiredSession) {
    try {
      if (!this.supabaseService || !expiredSession.id) {
        return null;
      }
      
      console.log('🔍 Checking for active tracking sessions in database...');
      
      // Check for active time logs for this user
      const { data: activeLogs, error } = await this.supabaseService
        .from('time_logs')
        .select('*')
        .eq('user_id', expiredSession.id)
        .is('end_time', null)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.warn('⚠️ Failed to check active sessions:', error.message);
        return null;
      }
      
      if (activeLogs && activeLogs.length > 0) {
        const activeLog = activeLogs[0];
        
        // CRITICAL FIX: Don't restore tracking if we're in the middle of stopping
        if (global.isStopping) {
          console.log('⏸️ Skipping session restoration - stop in progress');
          return null;
        }
        
        console.log('✅ Found active tracking session:', activeLog.id);
        
        // Restore session with extended expiry (24 hours from now)
        const restoredSession = {
          ...expiredSession,
          expires_at: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
          restored_from_db: true
        };
        
        await this.saveDesktopAgentSession(restoredSession);
        
        // Update globals to restore tracking state
        global.currentUserId = expiredSession.id;
        global.currentTimeLogId = activeLog.id;
        global.currentProjectId = activeLog.project_id;
        global.currentOrganizationId = expiredSession.organization_id || null;
        global.isTracking = true;
        global.isPaused = false;
        
        if (global.config) {
          global.config.user_id = expiredSession.id;
          global.config.organization_id = expiredSession.organization_id || null;
        }
        
        console.log('🎯 Restored tracking state from database:', {
          userId: global.currentUserId,
          timeLogId: global.currentTimeLogId,
          projectId: global.currentProjectId,
          isTracking: global.isTracking
        });
        
        return restoredSession;
      }
      
      console.log('ℹ️ No active tracking sessions found');
      return null;
    } catch (error) {
      console.warn('⚠️ Database sync error:', error.message);
      return null;
    }
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
      
      // Clear saved session file
      try {
        await fs.unlink(this.USER_SESSION_PATH);
        console.log('✅ [SESSION] Cleared saved session file');
      } catch (error) {
        // File might not exist, which is fine
        console.log('ℹ️ [SESSION] No saved session file to clear');
      }
      
      // Clear Supabase session if available
      try {
        if (this.supabaseService?.auth?.signOut) {
          await this.supabaseService.auth.signOut();
          console.log('✅ [SESSION] Cleared Supabase session');
        }
      } catch (error) {
        console.log('⚠️ [SESSION] Failed to clear Supabase session:', error?.message || error);
      }
      
      console.log('✅ [SESSION] User logout completed successfully');
      return { success: true, message: 'User logged out successfully' };
      
    } catch (error) {
      console.error('❌ [SESSION] handleUserLogout error:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Clean up stale active sessions
   * CRITICAL FIX: Sets end_time to start_time + 1 hour (not NOW) to prevent inflated hours
   */
  async cleanupStaleActiveSessions() {
    try {
      // Skip cleanup if no user is logged in (first-time user scenario)
      if (!this.config.user_id) {
        console.log('🧹 [CLEANUP] Skipping cleanup - no user session found (first-time user)');
        return;
      }
      
      if (!this.supabaseService) {
        console.log('⚠️ [CLEANUP] Supabase not initialized - skipping session cleanup');
        return;
      }
      
      console.log('🧹 [CLEANUP] Cleaning up any stale active sessions...');
      
      // First, get all unclosed sessions to close them with proper end times
      const { data: staleSessions, error: fetchError } = await this.supabaseService
        .from('time_logs')
        .select('id, start_time')
        .eq('user_id', this.config.user_id)
        .is('end_time', null)
        .neq('status', 'completed');
      
      if (fetchError) {
        console.log('⚠️ [CLEANUP] Failed to fetch stale sessions:', fetchError);
        return;
      }
      
      if (!staleSessions || staleSessions.length === 0) {
        console.log('✅ [CLEANUP] No stale sessions found');
        return;
      }
      
      console.log(`🧹 [CLEANUP] Found ${staleSessions.length} stale sessions to close`);
      
      // Close each session at stop time (not start+1h — that silently ate hours)
      const nowIso = new Date().toISOString();
      for (const session of staleSessions) {
        const { error: updateError } = await this.supabaseService
          .from('time_logs')
          .update({
            end_time: nowIso,
            status: 'completed'
          })
          .eq('id', session.id);
        
        if (updateError) {
          console.log(`⚠️ [CLEANUP] Failed to close session ${session.id}:`, updateError);
        }
      }
      
      console.log(`✅ [CLEANUP] Closed ${staleSessions.length} stale active sessions`);
    } catch (error) {
      console.error('❌ [CLEANUP] Cleanup error (non-critical):', error);
      // Don't throw - this is a non-critical cleanup operation
    }
  }
  
  /**
   * Close any existing unclosed sessions before starting a new one.
   * Returns { success: boolean, closedCount: number } so the caller knows
   * whether cleanup actually worked.
   */
  async closeExistingSessionsBeforeStart() {
    try {
      const userId = this.config.user_id;
      const client = this.supabaseService || global.supabaseClient || global.supabase;
      if (!userId) {
        console.warn('⚠️ [SESSION] Cannot close existing sessions - missing user_id');
        return { success: false, closedCount: 0 };
      }

      console.log('🔄 [SESSION] Closing any existing unclosed sessions before starting new one...');

      // Tenant integer ids (e.g. "1195") are not UUIDs — Supabase RPC/uuid columns fail.
      // Prefer Nest/RDS close when enabled.
      const { isBackendTimeLogsEnabled, closeActiveSessions } = require('../utils/backend-time-logs');
      const { isTenantUserId } = require('../utils/tenant-user-id');
      if (isBackendTimeLogsEnabled()) {
        try {
          const { getDeviceId } = require('../utils/device-id');
          const deviceId = getDeviceId();
          const result = await closeActiveSessions(userId, deviceId);
          const closed = result?.closed ?? 0;
          console.log(`🔒 [SESSION] RDS close_active_sessions: closed ${closed} session(s)`);
          return { success: true, closedCount: closed };
        } catch (rdsErr) {
          console.warn('⚠️ [SESSION] RDS close failed:', rdsErr.message || rdsErr);
          if (isTenantUserId(userId)) {
            // Don't call uuid-typed Supabase RPC with an integer id.
            return { success: false, closedCount: 0 };
          }
        }
      }

      if (!client) {
        console.warn('⚠️ [SESSION] Cannot close existing sessions - missing supabase client');
        return { success: false, closedCount: 0 };
      }

      if (isTenantUserId(userId)) {
        console.warn('⚠️ [SESSION] Skipping Supabase UUID RPC for tenant user id', userId);
        return { success: false, closedCount: 0 };
      }

      // Strategy 1: SECURITY DEFINER RPC (bypasses RLS) — UUID users only
      try {
        const { data: rpcCount, error: rpcError } = await client
          .rpc('close_user_active_sessions', { p_user_id: userId });
        if (!rpcError) {
          const closed = typeof rpcCount === 'number' ? rpcCount : 0;
          console.log(`🔒 [SESSION] RPC close_user_active_sessions: closed ${closed} session(s)`);
          return { success: true, closedCount: closed };
        }
        console.warn('⚠️ [SESSION] RPC failed, falling back to direct UPDATE:', rpcError.message || rpcError);
      } catch (rpcErr) {
        console.warn('⚠️ [SESSION] RPC threw, falling back to direct UPDATE:', rpcErr.message || rpcErr);
      }

      // Strategy 2: Direct UPDATE fallback (may be blocked by RLS on anon client)
      const { data: existingSessions, error: fetchError } = await client
        .from('time_logs')
        .select('id, start_time')
        .eq('user_id', userId)
        .or('end_time.is.null,status.eq.active');
      
      if (fetchError) {
        console.warn('⚠️ [SESSION] Failed to query existing sessions:', fetchError.message || fetchError);
        return { success: false, closedCount: 0 };
      }

      if (!existingSessions || existingSessions.length === 0) {
        console.log('🔒 [SESSION] No unclosed sessions found via direct query (RLS may be filtering)');
        return { success: true, closedCount: 0 };
      }
      
      console.log(`🔄 [SESSION] Found ${existingSessions.length} unclosed sessions - closing them now`);
      
      const now = new Date();
      let closedCount = 0;
      for (const session of existingSessions) {
        const endTime = now;
        
        const { error: updateError } = await client
          .from('time_logs')
          .update({
            end_time: endTime.toISOString(),
            status: 'completed'
          })
          .eq('id', session.id);
        
        if (updateError) {
          console.log(`⚠️ [SESSION] Failed to close session ${session.id}:`, updateError.message || updateError);
        } else {
          closedCount++;
        }
      }
      
      const allClosed = closedCount === existingSessions.length;
      console.log(`${allClosed ? '✅' : '⚠️'} [SESSION] Closed ${closedCount}/${existingSessions.length} existing sessions`);
      return { success: allClosed, closedCount };
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