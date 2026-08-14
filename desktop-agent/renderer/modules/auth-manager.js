const cognitoAuth = require('./cognito-auth');
const { fetchAuthMe, isCognitoAuthEnabled } = require('./auth-api');

function normalizeCompanyInput(value) {
  return value ? String(value).trim().toLowerCase() : '';
}

function companyMatchesWorkspace(companyInput, org) {
  if (!companyInput || !org) return true;
  const company = normalizeCompanyInput(companyInput);
  return (
    (org.name && org.name.toLowerCase() === company) ||
    String(org.id) === company ||
    (org.slug && org.slug.toLowerCase() === company)
  );
}

function wrongCompanyMessage(org) {
  const label = org?.name || 'your company';
  return (
    `That company name doesn't match your account. ` +
    `Try "${label}" in the Company field, or leave Company blank if you're not sure.`
  );
}

class AuthManager {
  constructor(ipcRenderer, uiManager, notificationManager) {
    this.ipcRenderer = ipcRenderer;
    this.uiManager = uiManager;
    this.notificationManager = notificationManager;
    
    this.currentUser = null;
    this.credentialManager = null;
    this.isAuthenticated = false;
    this.authConfig = null;
    // Initialization deferred until renderer completes mandatory update check
  }

  async initialize() {
    console.log('🔐 AuthManager initializing...');

    if (window.__updateGateActive) {
      console.log('🛑 [AUTH] Update gate active — skipping auth initialization');
      return;
    }

    try {
      this.authConfig = await this.ipcRenderer.invoke('get-config');
      console.log(
        isCognitoAuthEnabled(this.authConfig)
          ? '✅ [AUTH] Using Amazon Cognito (same as web portal)'
          : '⚠️ [AUTH] Cognito config incomplete — sign-in will fail until the build embeds Cognito settings',
      );
    } catch (e) {
      console.warn('⚠️ [AUTH] Could not load auth config:', e?.message || e);
    }
    
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

        return await this.tryAutoLoginCognito(session);
      }
      return false;
    } catch (error) {
      console.error('❌ Auto-login error:', error);
      // Do not wipe disk session on unexpected errors (e.g. startup races)
      return false;
    }
  }

  // Fallback auto-login using stored credentials (keytar) - DISABLED to prevent UI conflicts
  async tryAutoLoginWithStoredCredentials() {
    // Disabled to prevent race conditions with UI navigation
    return false;
  }

  async tryAutoLoginCognito(savedSession) {
    try {
      // Hydrate renderer Cognito store from disk (refresh token survives ID-token expiry)
      cognitoAuth.hydrateCognitoSessionFromDisk(savedSession);

      let stored = await cognitoAuth.getCurrentCognitoSession(this.authConfig);
      if (!stored?.idToken && savedSession?.refresh_token) {
        stored = await cognitoAuth.refreshCognitoSession(this.authConfig, {
          refreshToken: savedSession.refresh_token,
          email: savedSession.email,
          refreshExpiresAt: savedSession.refresh_expires_at,
        });
      }

      const idToken = stored?.idToken || savedSession.access_token;
      if (!idToken) {
        console.warn('⚠️ [AUTH] Cognito auto-login: no usable tokens');
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
        return false;
      }

      let profile;
      try {
        profile = await fetchAuthMe(idToken, this.authConfig, this.ipcRenderer);
      } catch (meErr) {
        // Access token may be stale — force one refresh then retry /auth/me
        const refreshed = await cognitoAuth.refreshCognitoSession(this.authConfig, stored || {
          refreshToken: savedSession.refresh_token,
          email: savedSession.email,
          refreshExpiresAt: savedSession.refresh_expires_at,
        });
        if (!refreshed?.idToken) {
          throw meErr;
        }
        stored = refreshed;
        profile = await fetchAuthMe(refreshed.idToken, this.authConfig, this.ipcRenderer);
      }

      const details = profile.user;
      const org = profile.organization;

      const normalizedId = String(details.id || '').trim();
      if (!/^\d+$/.test(normalizedId)) {
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
        return false;
      }

      this.currentUser = {
        id: normalizedId,
        email: details.email,
        name: details.full_name || details.email.split('@')[0],
        role: details.role || 'employee',
        organization_id: details.organization_id,
        organization_slug: org?.slug || savedSession.organization_slug || null,
        is_org_admin: details.is_org_admin,
        is_super_admin: details.is_super_admin,
      };

      await this.ipcRenderer.invoke('set-current-user-id', this.currentUser.id, this.currentUser.role);
      localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));

      // Persist refreshed tokens so next restart keeps the 30-day session
      if (stored?.idToken && stored?.refreshToken) {
        try {
          await this.ipcRenderer.invoke('user-logged-in', {
            user: this.currentUser,
            session: {
              access_token: stored.idToken,
              refresh_token: stored.refreshToken,
              expires_at: stored.expiresAt,
              refresh_expires_at: stored.refreshExpiresAt,
              email: this.currentUser.email,
              remember_me: true,
              auth_provider: 'cognito',
              organization_id: this.currentUser.organization_id,
              organization_slug: this.currentUser.organization_slug,
            },
          });
        } catch (persistErr) {
          console.warn('⚠️ [AUTH] Failed to persist refreshed Cognito session:', persistErr?.message || persistErr);
        }
      }

      if (window.__updateGateActive) {
        return false;
      }

      try {
        const updateStatus = await this.ipcRenderer.invoke('check-for-update');
        if (updateStatus?.updateAvailable) {
          window.__updateGateActive = true;
          this.uiManager?.showMandatoryUpdateGate?.({
            newVersion: updateStatus.newVersion,
            currentVersion: updateStatus.currentVersion,
            updateDownloaded: updateStatus.updateDownloaded,
            manualInstallRequired: updateStatus.manualInstallRequired,
            dmgInstallReady: updateStatus.dmgInstallReady,
            manualDownloadUrl: updateStatus.manualDownloadUrl,
          });
          return true;
        }
      } catch (updateError) {
        console.warn('⚠️ [AUTH] Cognito auto-login update check failed:', updateError?.message || updateError);
      }

      this.uiManager.showMainApp();
      this.notificationManager.showNotification('Welcome back! Automatically signed in.', 'success');
      console.log('✅ [AUTH] Cognito auto-login successful');
      return true;
    } catch (error) {
      const msg = String(error?.message || error);
      const isTransient =
        /network|fetch|ECONN|ETIMEDOUT|ENOTFOUND|offline|Failed to fetch|timeout|EAI_AGAIN/i.test(msg);
      const definitiveAuthFailure =
        /NotAuthorizedException|Token.*revoked|Refresh Token has expired|Invalid Refresh Token|unauthorized|401|403|user.*not found/i.test(
          msg,
        );

      console.warn('⚠️ [AUTH] Cognito auto-login failed:', msg);

      // Only wipe the persisted session on real auth failures — keep it on network blips
      if (definitiveAuthFailure || (!isTransient && /invalid.*(token|session)|expired.*token/i.test(msg))) {
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
      }
      return false;
    }
  }

  async handleCognitoLogin(email, password, company, rememberMe) {
    const stored = await cognitoAuth.signInWithEmailPassword(email, password, this.authConfig);
    const profile = await fetchAuthMe(stored.idToken, this.authConfig, this.ipcRenderer);
    const details = profile.user;
    const org = profile.organization;

    const companySlug = normalizeCompanyInput(company);
    if (companySlug && org && !companyMatchesWorkspace(company, org)) {
      cognitoAuth.signOutCognito(this.authConfig);
      throw new Error(wrongCompanyMessage(org));
    }

    const normalizedId = String(details.id || '').trim();
    if (!/^\d+$/.test(normalizedId)) {
      cognitoAuth.signOutCognito(this.authConfig);
      throw new Error(
        'Your account setup is incomplete. Ask your admin to fix your employee profile, then try again.',
      );
    }

    this.currentUser = {
      id: normalizedId,
      email: details.email,
      name: details.full_name || details.email.split('@')[0],
      role: details.role || 'employee',
      organization_id: details.organization_id,
      organization_slug: org?.slug || companySlug || null,
      is_org_admin: details.is_org_admin,
      is_super_admin: details.is_super_admin,
    };

    const setResult = await this.ipcRenderer.invoke(
      'set-current-user-id',
      this.currentUser.id,
      this.currentUser.role,
    );
    if (setResult && setResult.success === false) {
      throw new Error(setResult.error || 'Failed to set user session in desktop agent');
    }
    localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));

    if (this.credentialManager) {
      await this.credentialManager.saveCredentials(email, password);
    }
    if (companySlug) {
      localStorage.setItem('alyson_remember_company', companySlug);
    }

    await this.ipcRenderer.invoke('user-logged-in', {
      user: this.currentUser,
      session: {
        access_token: stored.idToken,
        refresh_token: stored.refreshToken,
        expires_at: stored.expiresAt,
        refresh_expires_at: stored.refreshExpiresAt,
        email,
        remember_me: true, // desktop agent always persists (~1y soft limit; Cognito is source of truth)
        auth_provider: 'cognito',
        organization_id: this.currentUser.organization_id,
        organization_slug: this.currentUser.organization_slug,
      },
    });

    localStorage.removeItem('auth_failure_count');

    try {
      const updateStatus = await this.ipcRenderer.invoke('check-for-update');
      if (updateStatus?.updateAvailable) {
        window.__updateGateActive = true;
        this.uiManager?.showMandatoryUpdateGate?.({
          newVersion: updateStatus.newVersion,
          currentVersion: updateStatus.currentVersion,
          updateDownloaded: updateStatus.updateDownloaded,
          manualInstallRequired: updateStatus.manualInstallRequired,
          dmgInstallReady: updateStatus.dmgInstallReady,
          manualDownloadUrl: updateStatus.manualDownloadUrl,
        });
        this.notificationManager.showNotification('Update required before continuing.', 'warning');
        return;
      }
    } catch (updateError) {
      console.log('⚠️ [AUTH] Update check failed, proceeding:', updateError.message);
    }

    window.dispatchEvent(new Event('userLoggedIn'));
    this.notificationManager.showNotification('Login successful! Welcome to Alyson Time Doctor.', 'success');
  }

  async handleLogin(e) {
    e.preventDefault();

    if (window.__updateGateActive) {
      this.notificationManager?.showNotification?.(
        'Please install the available update before signing in.',
        'warning',
      );
      return;
    }

    try {
      const preLoginUpdate = await this.ipcRenderer.invoke('check-for-update');
      if (preLoginUpdate?.updateAvailable) {
        window.__updateGateActive = true;
        this.uiManager?.showMandatoryUpdateGate?.({
          newVersion: preLoginUpdate.newVersion,
          currentVersion: preLoginUpdate.currentVersion,
          updateDownloaded: preLoginUpdate.updateDownloaded,
          manualInstallRequired: preLoginUpdate.manualInstallRequired,
          dmgInstallReady: preLoginUpdate.dmgInstallReady,
          manualDownloadUrl: preLoginUpdate.manualDownloadUrl,
        });
        return;
      }
    } catch (updateErr) {
      console.warn('⚠️ [AUTH] Pre-login update check failed:', updateErr?.message || updateErr);
    }
    
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

    console.log('🔐 Starting Cognito authentication...');
    console.log('📊 Login attempt details:', {
      company: company || '(none)',
      email: email,
      passwordLength: password.length,
      rememberMe: rememberMe,
      provider: 'cognito',
    });

    // Show loading state
    if (loginBtn) loginBtn.disabled = true;
    if (loginBtnText) loginBtnText.textContent = 'Signing In...';
    if (loginLoader) loginLoader.classList.remove('hidden');
    if (errorDiv) errorDiv.style.display = 'none';

    try {
      await this.handleCognitoLogin(email, password, company, rememberMe);
    } catch (error) {
      console.error('❌ Login failed:', error);
      
      let errorMessage = 'Login failed. Please try again.';
      
      const msg = error.message || '';
      if (msg === 'CONNECTION_TIMEOUT' || msg.includes('fetch failed') || msg.includes('ConnectTimeoutError') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        errorMessage = 'Cannot connect to the server. Please check your internet connection and try again.';
      } else if (
        msg.includes('Account not found') ||
        msg.includes('not found. Ask your admin') ||
        msg.includes('not linked to an employee') ||
        msg.includes('link your Cognito')
      ) {
        errorMessage =
          "We couldn't find an employee account for this email. Ask your admin to add you in Alyson Pulse, then try signing in again.";
      } else if (
        msg.includes('Invalid credentials') ||
        msg.includes('Incorrect username or password') ||
        msg.includes('User does not exist') ||
        msg.includes('Invalid login credentials')
      ) {
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
      } else if (
        error.message.includes("doesn't match your account") ||
        error.message.includes('member of this organization')
      ) {
        errorMessage = error.message;
      } else if (
        error.message.includes('Invalid employee profile id') ||
        error.message.includes('account setup is incomplete')
      ) {
        errorMessage =
          'Your account setup is incomplete. Ask your admin to fix your employee profile, then try again.';
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
      
      cognitoAuth.signOutCognito(this.authConfig);
      
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
    const displayName = this.currentUser.name || this.currentUser.email.split('@')[0];
    const firstName = String(displayName).trim().split(/\s+/)[0] || displayName;
    
    if (userName) {
      userName.textContent = displayName;
    }

    const welcomeName = document.getElementById('welcomeUserName');
    if (welcomeName) welcomeName.textContent = firstName;
    const trackerWelcomeName = document.getElementById('trackerWelcomeUserName');
    if (trackerWelcomeName) trackerWelcomeName.textContent = firstName;
    
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