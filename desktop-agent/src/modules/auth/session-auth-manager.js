/**
 * SESSION & AUTHENTICATION MANAGER MODULE
 * 
 * Centralized management of user sessions, authentication, and permission handling
 * for the TimeFlow desktop agent.
 * 
 * Part of TimeFlow Desktop Agent Phase 6 refactoring
 */

const fs = require('fs');
const path = require('path');

class SessionAuthManager {
  constructor(dependencies = {}) {
    this.ipcMain = dependencies.ipcMain;
    this.systemPreferences = dependencies.systemPreferences;
    this.shell = dependencies.shell;
    this.supabase = dependencies.supabase;
    this.config = dependencies.config;
    this.saveDesktopAgentSession = dependencies.saveDesktopAgentSession;
    this.loadDesktopAgentSession = dependencies.loadDesktopAgentSession;
    this.wrappers = dependencies.wrappers;
    
    console.log('✅ SessionAuthManager initialized');
  }

  /**
   * Register all session and authentication IPC handlers
   */
  registerHandlers() {
    this.registerUserLoginHandler();
    this.registerPermissionHandlers();
    this.registerSessionLoadHandler();
    this.registerUserLogoutHandler();
    
    console.log('✅ All session and auth IPC handlers registered');
  }

  /**
   * Register user login handler
   */
  registerUserLoginHandler() {
    // DISABLED: user-logged-in handler is registered in ipc-handlers.js to avoid duplicates
    console.log('⚠️ [SESSION-AUTH] User login handler skipped - handled by ipc-handlers.js to avoid duplicates');
    return;
    
    // ORIGINAL CODE COMMENTED OUT TO PREVENT DUPLICATE REGISTRATION:
    /*
    // DISABLED: this.ipcMain.handle('user-logged-in', async (event, userData) => {
      console.log('👤 Desktop agent user login:', userData.user?.email || userData.email);
      
      // ✅ ONLY TRIGGER ONBOARDING IF PERMISSIONS ARE MISSING
      console.log('🎯 [ONBOARDING] User logged in, checking if onboarding should be shown...');
      
      // Skip onboarding completely - go directly to main app
      setTimeout(() => {
        console.log('✅ [ONBOARDING] Skipping onboarding completely, marking as completed');
        global.onboardingCompleted = true;
        
        // Send signal to show main app directly - no onboarding
        event.sender.send('skip-onboarding-complete');
        console.log('🚀 [ONBOARDING] Going directly to main app (no permission checks)');
      }, 500); // Reduced delay for faster transition
      
      // Set the user's session in the main Supabase client for proper authentication
      if (userData.session) {
        try {
          const { data, error } = await this.supabase.auth.setSession({
            access_token: userData.session.access_token,
            refresh_token: userData.session.refresh_token
          });
          
          if (error) {
            console.error('❌ Failed to set user session:', error);
            console.error('Session set error details:', error);
          } else {
            console.log('✅ User session set in Supabase client');
            console.log('✅ Authenticated user ID:', data?.user?.id);
            
            // Verify the session is actually set
            const { data: currentUser } = await this.supabase.auth.getUser();
            if (currentUser?.user) {
              console.log('✅ Session verification successful:', currentUser.user.email);
            } else {
              console.warn('⚠️ Session verification failed - user not authenticated');
            }
          }
        } catch (error) {
          console.error('❌ Error setting user session:', error);
        }
      }
      
      // Save user session if remember_me is true
      if (userData.session && userData.session.remember_me) {
        try {
          const userSession = {
            id: userData.user?.id || userData.id,
            email: userData.user?.email || userData.email,
            access_token: userData.session.access_token,
            refresh_token: userData.session.refresh_token,
            // Ensure expires_at is in milliseconds (handle both seconds and milliseconds)
            expires_at: userData.session.expires_at > 9999999999 ? userData.session.expires_at : (userData.session.expires_at * 1000),
            user_metadata: userData.session.user || {},
            remember_me: userData.session.remember_me,
            full_name: userData.user?.name || userData.name || (userData.user?.email || userData.email).split('@')[0],
            role: userData.user?.role || userData.role || 'employee'
          };
          
          this.saveDesktopAgentSession(userSession);
          console.log('✅ Desktop agent session saved for future logins');
        } catch (error) {
          console.error('❌ Failed to save desktop agent session:', error);
        }
      }
      
      // Set user ID for tracking
      const userId = userData.user?.id || userData.id;
      this.config.user_id = userId;
      console.log('✅ Desktop agent user ID set:', userId);
      
      // Update env-config.js file with the user ID so UI can access it
      this.updateEnvConfigWithUserId(userId);
      
      return { success: true, message: 'User logged in successfully' };
    });
    */
  }

  /**
   * Register permission checking and request handlers
   */
  registerPermissionHandlers() {
    // Handle permission checking for onboarding guide
    this.ipcMain.handle('check-permissions', async (event) => {
      console.log('🚨 [PERMISSION-CHECK] Checking current permission status...');
      
      let screenPermission = 'granted';
      let accessibilityPermission = true;
      
      if (process.platform === 'darwin') {
        // Check if systemPreferences is available and has the methods
        if (this.systemPreferences && typeof this.systemPreferences.getMediaAccessStatus === 'function') {
          screenPermission = this.systemPreferences.getMediaAccessStatus('screen');
        }
        if (this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') {
          accessibilityPermission = this.systemPreferences.isTrustedAccessibilityClient(false);
        }
      }
      
      console.log('🚨 [PERMISSION-CHECK] Screen Recording:', screenPermission);
      console.log('🚨 [PERMISSION-CHECK] Accessibility:', accessibilityPermission);
      
      return {
        screen: screenPermission === 'granted',
        accessibility: accessibilityPermission
      };
    });

    // Handle permission requests
    this.ipcMain.handle('request-permissions', async (event) => {
      console.log('🚨 [PERMISSION-REQUEST] Requesting permissions...');
      
      let screenPermission = 'granted';
      let accessibilityPermission = true;
      let finalScreenPermission = 'granted';
      let finalAccessibilityPermission = true;
      
      if (process.platform === 'darwin') {
        // Check if systemPreferences is available and has the methods
        if (this.systemPreferences && typeof this.systemPreferences.getMediaAccessStatus === 'function') {
          screenPermission = this.systemPreferences.getMediaAccessStatus('screen');
          console.log('🚨 [PERMISSION-REQUEST] Current screen permission:', screenPermission);
          
          if (screenPermission !== 'granted') {
            console.log('🚨 [PERMISSION-REQUEST] Requesting screen recording permission...');
            if (typeof this.systemPreferences.askForMediaAccess === 'function') {
              await this.systemPreferences.askForMediaAccess('screen');
            }
          }
        }
        
        if (this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') {
          accessibilityPermission = this.systemPreferences.isTrustedAccessibilityClient(false);
          console.log('🚨 [PERMISSION-REQUEST] Current accessibility permission:', accessibilityPermission);
          
          if (!accessibilityPermission) {
            console.log('🚨 [PERMISSION-REQUEST] Opening accessibility preferences...');
            if (this.shell && typeof this.shell.openExternal === 'function') {
              this.shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
            }
          }
        }
        
        // Check final status
        if (this.systemPreferences && typeof this.systemPreferences.getMediaAccessStatus === 'function') {
          finalScreenPermission = this.systemPreferences.getMediaAccessStatus('screen');
        }
        if (this.systemPreferences && typeof this.systemPreferences.isTrustedAccessibilityClient === 'function') {
          finalAccessibilityPermission = this.systemPreferences.isTrustedAccessibilityClient(false);
        }
      }
      
      console.log('🚨 [PERMISSION-REQUEST] Final screen permission:', finalScreenPermission);
      console.log('🚨 [PERMISSION-REQUEST] Final accessibility permission:', finalAccessibilityPermission);
      
      return {
        screen: finalScreenPermission === 'granted',
        accessibility: finalAccessibilityPermission,
        message: 'Permission request completed'
      };
    });

    // macOS permission checking
    this.ipcMain.handle('check-mac-permissions', async () => {
      if (process.platform === 'darwin') {
        return this.wrappers?.checkPermissionsStatus();
      }
      return { screen: true, accessibility: true }; // Non-macOS platforms
    });
  }

  /**
   * Register session loading handler
   */
  registerSessionLoadHandler() {
    this.ipcMain.handle('load-user-session', async (event) => {
      try {
        console.log('📂 Loading saved user session...');
        const session = await this.loadDesktopAgentSession();
        
        if (session && session.access_token) {
          // Verify the session is still valid
          try {
            const { data, error } = await this.supabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token
            });
            
            if (error) {
              console.error('❌ Saved session is invalid:', error);
              return { success: false, error: 'Session expired' };
            }
            
            console.log('✅ Saved session restored successfully');
            
            // Set user ID for tracking
            this.config.user_id = session.id;
            global.currentUserId = session.id; // NEW: keep globals in sync on startup
            console.log('✅ User ID restored from session:', session.id);
            
            return { 
              success: true, 
              session: {
                user: data.user,
                session: data.session
              }
            };
          } catch (error) {
            console.error('❌ Error validating saved session:', error);
            return { success: false, error: 'Session validation failed' };
          }
        } else {
          console.log('ℹ️ No saved session found');
          return { success: false, error: 'No saved session' };
        }
      } catch (error) {
        console.error('❌ Error loading user session:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Register user logout handler
   */
  registerUserLogoutHandler() {
    this.ipcMain.handle('user-logged-out', async (event) => {
      try {
        console.log('👤 User logged out - cleaning up session');
        
        // Clear the Supabase session
        await this.supabase.auth.signOut();
        
        // Clear user ID from config
        this.config.user_id = null;
        
        // Clear saved session
        if (this.saveDesktopAgentSession) {
          this.saveDesktopAgentSession(null);
        }
        
        console.log('✅ User session cleaned up successfully');
        return { success: true, message: 'User logged out successfully' };
      } catch (error) {
        console.error('❌ Error during user logout:', error);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Update env-config.js with user ID
   */
  updateEnvConfigWithUserId(userId) {
    try {
      // env-config.js lives at desktop-agent/env-config.js (repo-relative),
      // not under src/modules/.
      const configPath = path.join(__dirname, '..', '..', '..', 'env-config.js');
      
      // Read current config
      const configContent = fs.readFileSync(configPath, 'utf8');
      
      // Parse the module.exports object
      let updatedContent;
      if (configContent.includes('USER_ID:')) {
        // Update existing USER_ID
        updatedContent = configContent.replace(
          /USER_ID:\s*[^,\n}]*/,
          `USER_ID: '${userId}'`
        );
      } else {
        // Add USER_ID to the exports object
        updatedContent = configContent.replace(
          /(module\.exports\s*=\s*{[\s\S]*?)(_generated:\s*true)/,
          `$1USER_ID: '${userId}',\n  $2`
        );
      }
      
      // Write updated config back to file
      fs.writeFileSync(configPath, updatedContent, 'utf8');
      console.log('✅ Updated env-config.js with USER_ID:', userId);
      
      // Force reload the config module
      delete require.cache[require.resolve('../../../env-config.js')];
      const updatedConfig = require('../../../env-config.js');
      Object.assign(this.config, updatedConfig);
      
      console.log('✅ Config reloaded, USER_ID now set to:', this.config.USER_ID);
      
    } catch (error) {
      console.error('❌ Failed to update env-config.js:', error);
    }
  }

  /**
   * Initialize the session auth manager
   */
  async initialize() {
    try {
      this.registerHandlers();
      console.log('🔐 SessionAuthManager initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ SessionAuthManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Shutdown the session auth manager
   */
  async shutdown() {
    try {
      console.log('🔐 SessionAuthManager shutdown complete');
    } catch (error) {
      console.error('❌ SessionAuthManager shutdown failed:', error);
    }
  }
}

module.exports = SessionAuthManager;