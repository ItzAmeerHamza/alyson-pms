class AuthManager {
  constructor(supabaseClient, ipcRenderer, uiManager, notificationManager) {
    this.supabaseClient = supabaseClient;
    this.ipcRenderer = ipcRenderer;
    this.uiManager = uiManager;
    this.notificationManager = notificationManager;
    
    this.currentUser = null;
    this.credentialManager = null;
    this.isAuthenticated = false;
    this.init();
  }

  async init() {
    console.log('🔐 AuthManager initializing...');
    
    // Initialize credential manager
    try {
      const CredentialManager = require('../../src/modules/auth/credential-manager');
      this.credentialManager = new CredentialManager();
      await this.credentialManager.init();
      console.log('✅ CredentialManager initialized');
    } catch (error) {
      console.error('❌ Failed to initialize CredentialManager:', error);
    }
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Try to restore remembered credentials
    await this.loadRememberedCredentials();
    
    // Only restore an existing valid session. If none, show login screen.
    await this.tryAutoLogin();
  }

  setupEventListeners() {
    // Defer DOM event binding to renderer to avoid duplicate listeners
    // Renderer sets up legacy listeners with guards and centralizes UI wiring
    console.log('[AUTH] Deferring DOM event binding to renderer (avoids duplicates)');
  }

  async loadRememberedCredentials() {
    try {
      // Check for auth reset flag (can be set via developer tools)
      const authReset = localStorage.getItem('auth_reset');
      if (authReset) {
        console.log('🔧 [AUTH-RESET] Clearing all stored credentials due to reset flag');
        if (this.credentialManager) {
          await this.credentialManager.deleteCredentials();
        }
        localStorage.removeItem('alyson_user');
        localStorage.removeItem('alyson_session');
        localStorage.removeItem('auth_reset');
        console.log('✅ [AUTH-RESET] All credentials cleared');
        return; // Don't auto-fill anything
      }
      
      // Try to get stored credentials
      if (this.credentialManager) {
        const storedCredentials = await this.credentialManager.getCredentials();
        
        if (storedCredentials) {
          const emailInput = document.getElementById('loginEmail');
          const passwordInput = document.getElementById('loginPassword');
          const rememberMeCheckbox = document.getElementById('rememberMe');
          
          if (emailInput) {
            emailInput.value = storedCredentials.email;
            console.log('📧 Auto-filled email from secure storage:', storedCredentials.email);
          }
          
          if (passwordInput) {
            passwordInput.value = storedCredentials.password;
            console.log('🔑 Auto-filled password from secure storage');
          }
          
          if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
            console.log('✅ Remember me checkbox restored');
          }
          
          return storedCredentials;
        }
      }
      
      // Fallback to localStorage method
      const rememberedEmail = localStorage.getItem('alyson_remember_email');
      const rememberedCompany = localStorage.getItem('alyson_remember_company');
      const rememberMeChecked = localStorage.getItem('alyson_remember_me') === 'true';
      
      const emailInput = document.getElementById('loginEmail');
      const companyInput = document.getElementById('loginCompany');
      const rememberMeCheckbox = document.getElementById('rememberMe');
      
      if (emailInput && rememberedEmail && rememberMeChecked) {
        emailInput.value = rememberedEmail;
        console.log('📧 Auto-filled email from localStorage:', rememberedEmail);
      }
      
      if (companyInput && rememberedCompany) {
        companyInput.value = rememberedCompany;
        console.log('🏢 Auto-filled company from localStorage:', rememberedCompany);
      } else if (companyInput && !companyInput.value) {
        companyInput.value = 'Revcloud';
      }
      
      if (rememberMeCheckbox && rememberMeChecked) {
        rememberMeCheckbox.checked = true;
        console.log('✅ Remember me checkbox restored');
      }
      
    } catch (error) {
      console.error('❌ Error loading remembered credentials:', error);
    }
  }

  async tryAutoLogin() {
    try {
      console.log('🔄 [AUTH] Checking for saved session...');
      const savedUserSession = await this.ipcRenderer.invoke('load-user-session');
      console.log('📋 [AUTH] Load session result:', savedUserSession);
      
      if (savedUserSession && savedUserSession.success && savedUserSession.session && savedUserSession.session.remember_me) {
        const session = savedUserSession.session;
        console.log('📂 [AUTH] Found saved user session, attempting auto-login...', {
          email: session.email,
          remember_me: session.remember_me
        });
        
        // Restore Supabase session with proper error handling
        const { data: sessionData, error: sessionError } = await this.supabaseClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        
        if (!sessionError && sessionData.session && sessionData.user) {
          // Forward session to main process so main Supabase clients carry the JWT for RLS
          try {
            await this.ipcRenderer.invoke('auth:set-session', {
              access_token: sessionData.session.access_token,
              refresh_token: sessionData.session.refresh_token
            });
            console.log('🔐 [AUTH] Session forwarded to main process (auto-login)');
          } catch (e) {
            console.warn('⚠️ [AUTH] Failed to forward session to main process (auto-login):', e?.message || e);
          }
          // Get fresh user details from database
          let userDetails = null;
          try {
            // Ensure we have auth headers for the request
            const { data, error: userError } = await this.supabaseClient
              .from('users')
              .select('id, email, full_name, role')
              .eq('id', sessionData.user.id)
              .maybeSingle();
            if (userError) {
              console.warn('⚠️ [AUTH] Error fetching user details:', userError);
            } else {
              userDetails = data || null;
            }
          } catch (e) {
            console.warn('⚠️ [AUTH] Could not fetch user details, using session data:', e.message);
          }
          
          // Set current user from saved session
          this.currentUser = {
            id: sessionData.user.id,
            email: sessionData.user.email,
            name: userDetails ? userDetails.full_name : sessionData.user.email.split('@')[0],
            role: userDetails ? userDetails.role : 'employee'
          };
          
          console.log('👤 User restored from saved session:', this.currentUser);
          
          // Set current user ID in main process for database operations
          console.log('🔑 [AUTH] Attempting to set user ID in main process...');
          const setResult = await this.ipcRenderer.invoke('set-current-user-id', this.currentUser.id, this.currentUser.role);
          console.log('📊 [AUTH] Set user ID result:', setResult);
          
          // Update localStorage for UI consistency
          localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));
          localStorage.setItem('alyson_remember_email', this.currentUser.email);
          localStorage.setItem('alyson_remember_me', 'true');
          
          // CHECK FOR UPDATES before proceeding to main app
          console.log('🔄 [AUTH] Checking for updates after auto-login...');          try {
            const updateStatus = await this.ipcRenderer.invoke('check-for-update');
            console.log('📊 [AUTH] Auto-login update check result:', updateStatus);            
            if (updateStatus && updateStatus.updateAvailable) {
              console.log('🆕 [AUTH] Update required, showing update modal');              // Show update modal instead of proceeding to main app
              if (this.uiManager && this.uiManager.showUpdateModal) {
                this.uiManager.showUpdateModal({
                  newVersion: updateStatus.newVersion,
                  currentVersion: updateStatus.currentVersion
                });
              }
              this.notificationManager.showNotification('Update required before continuing.', 'warning');
              console.log('✅ Auto-login successful (update modal shown)');
              // Return true to indicate login success, but update modal is blocking
              return true;
            }
          } catch (updateError) {
            console.log('⚠️ [AUTH] Auto-login update check failed, proceeding anyway:', updateError.message);            // If update check fails, proceed to app (network issues, etc.)
          }
          
          // Auto-login successful - go directly to main app
          this.uiManager.showMainApp();
          this.notificationManager.showNotification('Welcome back! Automatically signed in.', 'success');
          
          console.log('✅ Auto-login successful');
          return true;
        } else {
          console.log('⚠️ Failed to restore session:', sessionError);
          // Clear invalid session
          await this.ipcRenderer.invoke('user-logged-out');
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Auto-login error:', error);
      // Clear invalid session
      await this.ipcRenderer.invoke('user-logged-out');
      return false;
    }
  }

  // Fallback auto-login using stored credentials (keytar) - DISABLED to prevent UI conflicts
  async tryAutoLoginWithStoredCredentials() {
    // Disabled to prevent race conditions with UI navigation
    return false;
  }

  async handleLogin(e) {
    e.preventDefault();
    
    const companyInput = document.getElementById('loginCompany');
    const company = companyInput ? companyInput.value.trim().toLowerCase() : '';
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    // Save credentials by default (no need to tick the checkbox)
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
    const rememberMe = true;
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginLoader = document.getElementById('loginLoader');
    const errorDiv = document.getElementById('loginError');

    // macOS: check permissions and guide user, but never block sign-in.
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      try {
        const perm = await this.ipcRenderer.invoke('check-permissions');
        if (!perm?.screen || !perm?.accessibility) {
          if (errorDiv) {
            errorDiv.textContent =
              'Sign-in is allowed. For screenshots and activity tracking, grant Screen Recording and Accessibility from System access below.';
            errorDiv.style.display = 'block';
          }
        }
      } catch (gateErr) {
        console.warn('[AUTH] macOS permission pre-check failed:', gateErr?.message || gateErr);
      }
    }

    console.log('🔐 Starting Supabase authentication...');
    console.log('📊 Login attempt details:', {
      company: company || '(none)',
      email: email,
      passwordLength: password.length,
      rememberMe: rememberMe
    });

    // Show loading state
    if (loginBtn) loginBtn.disabled = true;
    if (loginBtnText) loginBtnText.textContent = 'Signing In...';
    if (loginLoader) loginLoader.classList.remove('hidden');
    if (errorDiv) errorDiv.style.display = 'none';

    try {
      const LOGIN_TIMEOUT_MS = 15000;
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('CONNECTION_TIMEOUT')), ms))
      ]);

      // Clear any existing session first (non-blocking)
      try { await withTimeout(this.supabaseClient.auth.signOut(), 5000); } catch (_) {}
      
      // Attempt to sign in
      const { data, error } = await withTimeout(
        this.supabaseClient.auth.signInWithPassword({ email, password }),
        LOGIN_TIMEOUT_MS
      );

      if (error) {
        throw error;
      }

      if (data.user) {
        console.log('✅ Supabase authentication successful:', data.user.id);
        // Forward session to main process immediately to satisfy RLS for subsequent inserts
        try {
          await this.ipcRenderer.invoke('auth:set-session', {
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token
          });
          console.log('🔐 [AUTH] Session forwarded to main process (login)');
        } catch (e) {
          console.warn('⚠️ [AUTH] Failed to forward session to main process (login):', e?.message || e);
        }
        
        // Get user details from database (including organization info)
        let userDetails = null;
        let userError = null;
        try {
          const result = await this.supabaseClient
            .from('users')
            .select('id, email, full_name, role, is_active, organization_id, is_org_admin, is_super_admin')
            .eq('id', data.user.id)
            .maybeSingle();
          userDetails = result.data || null;
          userError = result.error || null;
        } catch (e) {
          console.warn('⚠️ [AUTH] Could not fetch user details, using auth data:', e.message);
          userError = e;
        }

        // If user profile can't be read (often due to RLS), proceed with auth data fallback.
        // Desktop agent must allow login for employees even when profile tables are restricted.
        if (userError && userError.status && userError.status !== 406) {
          console.warn('⚠️ [AUTH] Failed to get user details (non-406). Proceeding with auth fallback:', {
            status: userError.status,
            message: userError.message
          });
          userDetails = null;
        }

        if (userDetails && userDetails.is_active === false) {
          throw new Error('Your account has been deactivated. Please contact your administrator.');
        }

        // Validate organization if company slug was provided
        let organizationId = userDetails?.organization_id || null;
        let organizationSlug = null;
        
        if (company && userDetails?.organization_id) {
          try {
            const { data: orgData, error: orgError } = await this.supabaseClient
              .from('organizations')
              .select('id, slug, name, is_active')
              .eq('id', userDetails.organization_id)
              .maybeSingle();
            
            if (orgError) {
              console.warn('⚠️ [AUTH] Could not verify organization:', orgError.message);
            } else if (orgData) {
              // Verify the slug matches what user entered
              if (orgData.slug !== company) {
                await this.supabaseClient.auth.signOut();
                throw new Error('You are not a member of this organization. Please check the company name.');
              }
              if (!orgData.is_active) {
                await this.supabaseClient.auth.signOut();
                throw new Error('This organization is not active. Please contact your administrator.');
              }
              organizationSlug = orgData.slug;
              console.log('✅ [AUTH] Organization verified:', orgData.name);
            }
          } catch (orgCheckError) {
            if (orgCheckError.message.includes('not a member') || orgCheckError.message.includes('not active')) {
              throw orgCheckError;
            }
            console.warn('⚠️ [AUTH] Organization check failed, proceeding anyway:', orgCheckError.message);
          }
        }

        // Set current user (with organization info)
        this.currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: (userDetails && userDetails.full_name) ? userDetails.full_name : data.user.email.split('@')[0],
          role: (userDetails && userDetails.role) ? userDetails.role : 'employee',
          organization_id: organizationId,
          organization_slug: organizationSlug || company || null,
          is_org_admin: userDetails?.is_org_admin || false,
          is_super_admin: userDetails?.is_super_admin || false
        };

        console.log('👤 User details retrieved:', this.currentUser);

        // Set current user ID in main process for database operations
        console.log('🔑 [AUTH] Attempting to set user ID in main process...');
        const setResult = await this.ipcRenderer.invoke('set-current-user-id', this.currentUser.id, this.currentUser.role);
        console.log('📊 [AUTH] Set user ID result:', setResult);

        // Store in localStorage
        localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));

        // Always save credentials securely (default behavior)
        if (this.credentialManager) {
          const saveSuccess = await this.credentialManager.saveCredentials(email, password);
          if (saveSuccess) {
            console.log('✅ Credentials saved securely');
          } else {
            console.warn('⚠️ Failed to save credentials securely, using localStorage fallback');
            localStorage.setItem('alyson_remember_email', email);
            localStorage.setItem('alyson_remember_me', 'true');
          }
        } else {
          // Fallback to localStorage
          localStorage.setItem('alyson_remember_email', email);
          localStorage.setItem('alyson_remember_me', 'true');
        }
        
        // Store company for next login
        if (company) {
          localStorage.setItem('alyson_remember_company', company);
        }
        
        // Save session for auto-login using IPC (remember_me enforced true)
        const sessionSaveResult = await this.ipcRenderer.invoke('user-logged-in', {
          user: this.currentUser,
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            // Save expiry in milliseconds (SessionManager compares against Date.now())
            expires_at: (data.session.expires_at || 0) * 1000,
            email: email,
            remember_me: true,
            // Multi-tenant organization info
            organization_id: this.currentUser.organization_id,
            organization_slug: this.currentUser.organization_slug
          }
        });
        console.log('💾 [AUTH] Session save result:', sessionSaveResult);

        // Clear any auth failure count on successful login
        localStorage.removeItem('auth_failure_count');
        
        // CHECK FOR UPDATES before proceeding
        console.log('🔄 [AUTH] Checking for updates after login...');
        try {
          const updateStatus = await this.ipcRenderer.invoke('check-for-update');
          console.log('📊 [AUTH] Update check result:', updateStatus);
          
          if (updateStatus && updateStatus.updateAvailable) {
            console.log('🆕 [AUTH] Update required, showing update modal');
            // Show update modal instead of proceeding to main app
            if (this.uiManager && this.uiManager.showUpdateModal) {
              this.uiManager.showUpdateModal({
                newVersion: updateStatus.newVersion,
                currentVersion: updateStatus.currentVersion
              });
            }
            this.notificationManager.showNotification('Update required before continuing.', 'warning');
            // Don't proceed to main app - update modal is blocking
            return;
          }
        } catch (updateError) {
          console.log('⚠️ [AUTH] Update check failed, proceeding anyway:', updateError.message);
          // If update check fails, proceed to app (network issues, etc.)
        }
        
        // Trigger onboarding guide for first-time user experience
        // Note: The userLoggedIn event listener in renderer-modular.js will handle showing main app
        window.dispatchEvent(new Event('userLoggedIn'));
        this.notificationManager.showNotification('Login successful! Welcome to Alyson PM.', 'success');

      } else {
        throw new Error('No user data returned from authentication');
      }

    } catch (error) {
      console.error('❌ Login failed:', error);
      
      let errorMessage = 'Login failed. Please try again.';
      
      const msg = error.message || '';
      if (msg === 'CONNECTION_TIMEOUT' || msg.includes('fetch failed') || msg.includes('ConnectTimeoutError') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        errorMessage = 'Cannot connect to the server. Please check your internet connection and try again.';
      } else if (msg.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password. Please check your credentials.';
        
        // Track login failures to auto-clear bad stored credentials
        const failureCount = parseInt(localStorage.getItem('auth_failure_count') || '0') + 1;
        localStorage.setItem('auth_failure_count', failureCount.toString());
        
        if (failureCount >= 2) {
          console.log('🔧 [AUTH] Multiple failures detected, clearing stored credentials');
          localStorage.removeItem('alyson_remember_email');
          localStorage.removeItem('alyson_remember_me');  
          localStorage.removeItem('alyson_saved_password');
          localStorage.removeItem('alyson_user');
          localStorage.removeItem('alyson_session');
          localStorage.removeItem('auth_failure_count');
          errorMessage += ' Stored credentials cleared - please enter fresh login details.';
          
          // Clear the form
          const emailInput = document.getElementById('loginEmail');
          const passwordInput = document.getElementById('loginPassword');
          const rememberCheckbox = document.getElementById('rememberMe');
          if (emailInput) emailInput.value = '';
          if (passwordInput) passwordInput.value = '';
          if (rememberCheckbox) rememberCheckbox.checked = false;
        }
      } else if (error.message.includes('deactivated')) {
        errorMessage = error.message;
      } else if (error.message.includes('Email not confirmed')) {
        // Supabase email verification required. Attempt to resend the confirmation email (best-effort).
        try {
          await this.supabaseClient.auth.resend({ type: 'signup', email });
          console.log('📨 [AUTH] Verification email re-sent (best effort)');
        } catch (resendError) {
          console.warn('⚠️ [AUTH] Failed to resend verification email:', resendError?.message || resendError);
        }

        errorMessage = 'Your account email is not verified yet. Please check your inbox (and spam) for the verification email. If you didn’t get it, try again to resend the email or ask your admin to confirm your account.';
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please wait before trying again.';
      }
      
      if (errorDiv) {
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
      }
      
      this.notificationManager.showNotification(errorMessage, 'error');
    } finally {
      // Reset loading state
      if (loginBtn) loginBtn.disabled = false;
      if (loginBtnText) loginBtnText.textContent = 'Sign In';
      if (loginLoader) loginLoader.classList.add('hidden');
    }
  }

  async handleLogout() {
    try {
      console.log('🚪 Logging out user...');
      
      // Sign out from Supabase
      await this.supabaseClient.auth.signOut();
      
      // Clear stored credentials securely (optional - user can choose to keep them)
      // We don't automatically delete credentials on logout, only on explicit "forget me" action
      
      // Clear user data
      this.currentUser = null;
      this.isAuthenticated = false;
      localStorage.removeItem('alyson_user');
      
      // Notify main process
      await this.ipcRenderer.invoke('user-logged-out');
      
      // Show login screen
      this.uiManager.showLogin();
      this.notificationManager.showNotification('Logged out successfully', 'success');
      
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
      this.notificationManager.showNotification('Error during logout', 'error');
    }
  }

  // Method to clear all stored credentials (for security purposes)
  async clearStoredCredentials() {
    try {
      if (this.credentialManager) {
        const currentEmail = localStorage.getItem('alyson_remember_email') || 
                           (this.currentUser && this.currentUser.email);
        if (currentEmail) {
          await this.credentialManager.deleteCredentials(currentEmail);
          console.log('🗑️ All stored credentials cleared');
        }
      }
      
      localStorage.removeItem('alyson_remember_email');
      localStorage.removeItem('alyson_remember_me');
      localStorage.removeItem('alyson_saved_password');
      localStorage.removeItem('alyson_credentials_stored');
      
      return true;
    } catch (error) {
      console.error('❌ Error clearing stored credentials:', error);
      return false;
    }
  }

  getCurrentUser() {
    return this.currentUser;
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  updateUserInfo() {
    if (!this.currentUser) return;
    
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) {
      userName.textContent = this.currentUser.name || this.currentUser.email.split('@')[0];
    }
    
    if (userRole) {
      const roleMap = {
        'admin': 'Administrator', 
        'manager': 'Manager',
        'employee': 'Employee'
      };
      userRole.textContent = roleMap[this.currentUser.role] || 'Employee';
    }
    
    if (userAvatar) {
      // Set user initials as avatar
      const initials = this.currentUser.name 
        ? this.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase()
        : this.currentUser.email[0].toUpperCase();
      userAvatar.textContent = initials;
    }
  }
}

// Export for use in main renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
} 