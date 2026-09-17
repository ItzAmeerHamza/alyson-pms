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
    this._initialized = false;
    this._initPromise = null;
    this._pendingNewPassword = null;
    this._passwordReset = { email: '', stayLoggedIn: false, delivery: null };
    // Initialization deferred until renderer completes mandatory update check
  }

  /**
   * Safe to call more than once. The boot path skips initialization entirely
   * while the update gate is up, so whoever takes the gate down has to be able
   * to ask for initialization again without double-binding anything.
   */
  async initialize() {
    if (window.__updateGateActive) {
      console.log('🛑 [AUTH] Update gate active — skipping auth initialization');
      return;
    }
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._initializeOnce().finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  /**
   * Cognito settings for this build. initialize() loads them, but it is skipped
   * while the update gate is up, and the gate can come down and reveal the login
   * form without anything re-running it. The form was then live with authConfig
   * still null, so createPool() threw "Cognito is not configured on the desktop
   * agent" and every correct password looked rejected until the app restarted.
   * Loading on demand means no lifecycle path can leave this missing.
   */
  async ensureAuthConfig() {
    if (isCognitoAuthEnabled(this.authConfig)) return this.authConfig;
    try {
      this.authConfig = await this.ipcRenderer.invoke('get-config');
    } catch (e) {
      console.warn('⚠️ [AUTH] Could not load auth config on demand:', e?.message || e);
    }
    return this.authConfig;
  }

  async _initializeOnce() {
    console.log('🔐 AuthManager initializing...');

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

    // Set before the calls below so a re-entrant initialize() during auto-login
    // joins rather than binding a second time.
    this._initialized = true;

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

  showAuthLoading(message) {
    try {
      if (typeof window !== 'undefined' && typeof window.showAuthLoading === 'function') {
        window.showAuthLoading(message);
        return;
      }
      if (typeof document === 'undefined') return;
      const overlay = document.getElementById('authLoadingOverlay');
      const status = document.getElementById('authLoadingStatus');
      if (status && message) status.textContent = message;
      if (overlay) {
        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
      }
    } catch (_) {}
  }

  hideAuthLoading() {
    try {
      if (typeof window !== 'undefined' && typeof window.hideAuthLoading === 'function') {
        window.hideAuthLoading();
        return;
      }
      if (typeof document === 'undefined') return;
      const overlay = document.getElementById('authLoadingOverlay');
      if (overlay) {
        overlay.classList.remove('is-visible');
        overlay.setAttribute('aria-hidden', 'true');
      }
    } catch (_) {}
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
      if (this.currentUser?.id) return true;
      console.log('🔄 [AUTH] Checking for saved session...');
      const savedUserSession = await this.ipcRenderer.invoke('load-user-session');
      console.log('📋 [AUTH] Load session result:', savedUserSession);
      
      if (savedUserSession && savedUserSession.success && savedUserSession.session && savedUserSession.session.remember_me) {
        const session = savedUserSession.session;

        console.log('📂 [AUTH] Found saved user session, attempting auto-login...', {
          email: session.email,
          remember_me: session.remember_me
        });

        this.showAuthLoading('Restoring your session…');
        const opened = await this.tryAutoLoginCognito(session);
        this.hideAuthLoading();
        return opened;
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

  _applyDiskSessionUser(savedSession) {
    this.currentUser = {
      id: String(savedSession.id).trim(),
      email: savedSession.email,
      name: savedSession.full_name || String(savedSession.email || '').split('@')[0],
      role: savedSession.role || 'employee',
      organization_id: savedSession.organization_id,
      organization_slug: savedSession.organization_slug || null,
      is_org_admin: savedSession.is_org_admin,
      is_super_admin: savedSession.is_super_admin,
    };
  }

  _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label || 'request'} timeout`)), ms),
      ),
    ]);
  }

  async _verifyCognitoSessionInBackground(savedSession) {
    try {
      await this.ensureAuthConfig();
      let stored = await this._withTimeout(
        cognitoAuth.getCurrentCognitoSession(this.authConfig),
        5000,
        'cognito session',
      );
      if (!stored?.idToken && savedSession?.refresh_token) {
        stored = await this._withTimeout(
          cognitoAuth.refreshCognitoSession(this.authConfig, {
            refreshToken: savedSession.refresh_token,
            email: savedSession.email,
            refreshExpiresAt: savedSession.refresh_expires_at,
          }),
          5000,
          'cognito refresh',
        );
      }
      const idToken = stored?.idToken || savedSession.access_token;
      if (!idToken) return;
      const profile = await this._withTimeout(
        fetchAuthMe(idToken, this.authConfig, this.ipcRenderer),
        5000,
        'auth/me',
      );
      const details = profile?.user;
      const org = profile?.organization;
      const normalizedId = String(details?.id || '').trim();
      if (/^\d+$/.test(normalizedId)) {
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
        try {
          await this.ipcRenderer.invoke('set-current-user-id', this.currentUser.id, this.currentUser.role);
          localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));
        } catch (_) {}
      }
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
        } catch (_) {}
      }
    } catch (error) {
      const msg = String(error?.message || error);
      const definitiveAuthFailure =
        /NotAuthorizedException|Token.*revoked|Refresh Token has expired|Invalid Refresh Token|unauthorized|401|403|user.*not found/i.test(
          msg,
        );
      if (definitiveAuthFailure) {
        console.warn('⚠️ [AUTH] Background session verify failed — signing out:', msg);
        try {
          await this.ipcRenderer.invoke('user-logged-out');
          cognitoAuth.clearCognitoSession();
        } catch (_) {}
      } else {
        console.warn('⚠️ [AUTH] Background session verify skipped (network):', msg);
      }
    }

    try {
      const updateStatus = await this._withTimeout(
        this.ipcRenderer.invoke('check-for-update'),
        4000,
        'update check',
      );
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
      }
    } catch (_) { /* update check must never block or bounce a restored session */ }
  }

  async tryAutoLoginCognito(savedSession) {
    try {
      await this.ensureAuthConfig();
      cognitoAuth.hydrateCognitoSessionFromDisk(savedSession);

      const diskId = String(savedSession.id || '').trim();
      if (/^\d+$/.test(diskId) && savedSession.email) {
        this._applyDiskSessionUser(savedSession);
        try {
          await this.ipcRenderer.invoke('set-current-user-id', this.currentUser.id, this.currentUser.role);
        } catch (e) {
          console.warn('⚠️ [AUTH] Failed to set user id from disk session:', e?.message || e);
        }
        try {
          localStorage.setItem('alyson_user', JSON.stringify(this.currentUser));
        } catch (_) {}
        if (!window.__updateGateActive) {
          this.uiManager?.showMainApp?.();
        }
        void this._verifyCognitoSessionInBackground(savedSession);
        return true;
      }

      this.showAuthLoading('Signing you in…');
      let stored = await this._withTimeout(
        cognitoAuth.getCurrentCognitoSession(this.authConfig),
        5000,
        'cognito session',
      );
      if (!stored?.idToken && savedSession?.refresh_token) {
        stored = await this._withTimeout(
          cognitoAuth.refreshCognitoSession(this.authConfig, {
            refreshToken: savedSession.refresh_token,
            email: savedSession.email,
            refreshExpiresAt: savedSession.refresh_expires_at,
          }),
          5000,
          'cognito refresh',
        );
      }

      const idToken = stored?.idToken || savedSession.access_token;
      if (!idToken) {
        console.warn('⚠️ [AUTH] Cognito auto-login: no usable tokens');
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
        this.hideAuthLoading();
        return false;
      }

      let profile;
      try {
        this.showAuthLoading('Verifying your account…');
        profile = await this._withTimeout(
          fetchAuthMe(idToken, this.authConfig, this.ipcRenderer),
          5000,
          'auth/me',
        );
      } catch (meErr) {
        const refreshed = await this._withTimeout(
          cognitoAuth.refreshCognitoSession(this.authConfig, stored || {
            refreshToken: savedSession.refresh_token,
            email: savedSession.email,
            refreshExpiresAt: savedSession.refresh_expires_at,
          }),
          5000,
          'cognito refresh',
        );
        if (!refreshed?.idToken) {
          throw meErr;
        }
        stored = refreshed;
        profile = await this._withTimeout(
          fetchAuthMe(refreshed.idToken, this.authConfig, this.ipcRenderer),
          5000,
          'auth/me',
        );
      }

      const details = profile.user;
      const org = profile.organization;

      const normalizedId = String(details.id || '').trim();
      if (!/^\d+$/.test(normalizedId)) {
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
        this.hideAuthLoading();
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
        this.hideAuthLoading();
        return false;
      }

      this.uiManager.showMainApp();
      void this._verifyCognitoSessionInBackground(savedSession);
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

      if (definitiveAuthFailure || (!isTransient && /invalid.*(token|session)|expired.*token/i.test(msg))) {
        await this.ipcRenderer.invoke('user-logged-out');
        cognitoAuth.clearCognitoSession();
      }
      this.hideAuthLoading();
      return false;
    }
  }

  showNewPasswordChallenge(email) {
    const loginForm = document.getElementById('loginForm');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const hint = document.getElementById('newPasswordHint');
    const errorDiv = document.getElementById('newPasswordError');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmInput = document.getElementById('confirmNewPassword');
    if (loginForm) loginForm.style.display = 'none';
    if (newPasswordForm) {
      newPasswordForm.hidden = false;
      newPasswordForm.style.display = 'block';
    }
    if (hint) {
      const who = email ? ` for ${email}` : '';
      hint.textContent = `Create a new password to finish signing in${who}.`;
    }
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (newPasswordInput) newPasswordInput.focus();
  }

  hideNewPasswordChallenge() {
    const newPasswordForm = document.getElementById('newPasswordForm');
    const errorDiv = document.getElementById('newPasswordError');
    if (newPasswordForm) {
      newPasswordForm.hidden = true;
      newPasswordForm.style.display = 'none';
    }
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
    this._pendingNewPassword = null;
  }

  cancelNewPasswordChallenge() {
    this.hideNewPasswordChallenge();
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.style.display = 'block';
  }

  openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    const errorDiv = document.getElementById('changePasswordError');
    if (form) form.reset();
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
    if (modal) {
      modal.hidden = false;
      modal.classList.add('visible');
    }
    this._syncPasswordModalLayer();
    const current = document.getElementById('currentPassword');
    if (current) current.focus();
  }

  closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    const errorDiv = document.getElementById('changePasswordError');
    if (form) form.reset();
    if (errorDiv) {
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
    }
    if (modal) {
      modal.hidden = true;
      modal.classList.remove('visible');
    }
    this._syncPasswordModalLayer();
  }

  openForgotPasswordModal({ email = '', stayLoggedIn = false, autoSend = false } = {}) {
    const loginEmail = document.getElementById('loginEmail')?.value || '';
    const knownEmail = email || this.currentUser?.email || loginEmail;
    this._passwordReset = {
      email: String(knownEmail || '').trim().toLowerCase(),
      stayLoggedIn: Boolean(stayLoggedIn && this.currentUser),
      delivery: null,
    };
    const modal = document.getElementById('forgotPasswordModal');
    const requestForm = document.getElementById('forgotRequestForm');
    const confirmForm = document.getElementById('forgotConfirmForm');
    const emailInput = document.getElementById('forgotEmail');
    const requestError = document.getElementById('forgotRequestError');
    const confirmError = document.getElementById('forgotConfirmError');
    if (requestForm) requestForm.reset();
    if (confirmForm) confirmForm.reset();
    if (emailInput) {
      emailInput.value = this._passwordReset.email;
      emailInput.readOnly = Boolean(this._passwordReset.stayLoggedIn && this._passwordReset.email);
    }
    if (requestError) {
      requestError.textContent = '';
      requestError.style.display = 'none';
    }
    if (confirmError) {
      confirmError.textContent = '';
      confirmError.style.display = 'none';
    }
    this._showForgotStep('request');
    if (modal) {
      modal.hidden = false;
      modal.classList.add('visible');
    }
    this._syncPasswordModalLayer();
    if (autoSend && this._passwordReset.email) {
      void this.handleSendResetCode();
      return;
    }
    if (emailInput) emailInput.focus();
  }

  closeForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    const requestForm = document.getElementById('forgotRequestForm');
    const confirmForm = document.getElementById('forgotConfirmForm');
    if (requestForm) requestForm.reset();
    if (confirmForm) confirmForm.reset();
    if (modal) {
      modal.hidden = true;
      modal.classList.remove('visible');
    }
    this._passwordReset = { email: '', stayLoggedIn: false, delivery: null };
    this._syncPasswordModalLayer();
  }

  _syncPasswordModalLayer() {
    const changeOpen = document.getElementById('changePasswordModal')?.classList.contains('visible');
    const forgotOpen = document.getElementById('forgotPasswordModal')?.classList.contains('visible');
    document.body?.classList?.toggle('password-modal-open', Boolean(changeOpen || forgotOpen));
  }

  _showForgotStep(step) {
    const requestForm = document.getElementById('forgotRequestForm');
    const confirmForm = document.getElementById('forgotConfirmForm');
    const hint = document.getElementById('forgotConfirmHint');
    if (requestForm) {
      requestForm.hidden = step !== 'request';
      requestForm.style.display = step === 'request' ? 'block' : 'none';
    }
    if (confirmForm) {
      confirmForm.hidden = step !== 'confirm';
      confirmForm.style.display = step === 'confirm' ? 'block' : 'none';
    }
    if (hint && step === 'confirm') {
      const dest = this._passwordReset.delivery?.Destination || this._passwordReset.email;
      const who = dest ? ` ${dest}` : ' your email';
      hint.textContent = `Enter the code we sent to${who}, then choose a new password. If you never got a code, sign in with the temporary password from your invite email first.`;
    }
  }

  _setForgotError(id, message) {
    const errorDiv = document.getElementById(id);
    if (errorDiv) {
      errorDiv.textContent = message || '';
      errorDiv.style.display = message ? 'block' : 'none';
    }
  }

  async handleSendResetCode(e) {
    if (e?.preventDefault) e.preventDefault();
    const emailInput = document.getElementById('forgotEmail');
    const email = (emailInput?.value || this._passwordReset.email || '').trim();
    const btn = document.getElementById('forgotSendCodeBtn');
    this._setForgotError('forgotRequestError', '');
    if (!cognitoAuth.isValidEmail(email)) {
      this._setForgotError('forgotRequestError', 'Enter a valid email address.');
      return;
    }
    if (btn) btn.disabled = true;
    try {
      await this.ensureAuthConfig();
      const sent = await cognitoAuth.forgotPassword(email, this.authConfig, this.ipcRenderer);
      this._passwordReset.email = sent?.email || email.toLowerCase();
      this._passwordReset.delivery = sent?.delivery || null;
      this._showForgotStep('confirm');
      const codeInput = document.getElementById('forgotResetCode');
      if (codeInput) codeInput.focus();
      this.notificationManager?.showNotification?.(
        'If an account exists for this email, we sent a reset code.',
        'success',
      );
    } catch (error) {
      this._setForgotError(
        'forgotRequestError',
        error?.message || 'Could not send a reset code. Please try again.',
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async handleResendResetCode() {
    const email = this._passwordReset.email || document.getElementById('forgotEmail')?.value || '';
    this._setForgotError('forgotConfirmError', '');
    if (!cognitoAuth.isValidEmail(email)) {
      this._setForgotError('forgotConfirmError', 'Enter a valid email address.');
      this._showForgotStep('request');
      return;
    }
    try {
      await this.ensureAuthConfig();
      const sent = await cognitoAuth.forgotPassword(email, this.authConfig, this.ipcRenderer);
      this._passwordReset.email = sent?.email || String(email).toLowerCase();
      this._passwordReset.delivery = sent?.delivery || null;
      this._showForgotStep('confirm');
      this.notificationManager?.showNotification?.(
        'If an account exists for this email, we sent a reset code.',
        'success',
      );
    } catch (error) {
      this._setForgotError(
        'forgotConfirmError',
        error?.message || 'Could not resend the code. Please try again.',
      );
    }
  }

  async handleConfirmResetPassword(e) {
    if (e?.preventDefault) e.preventDefault();
    const code = document.getElementById('forgotResetCode')?.value || '';
    const newPassword = document.getElementById('forgotNewPassword')?.value || '';
    const confirmPassword = document.getElementById('forgotConfirmPassword')?.value || '';
    const btn = document.getElementById('forgotResetSaveBtn');
    this._setForgotError('forgotConfirmError', '');
    if (newPassword !== confirmPassword) {
      this._setForgotError('forgotConfirmError', 'Passwords do not match.');
      return;
    }
    if (!cognitoAuth.isStrongPassword(newPassword)) {
      this._setForgotError('forgotConfirmError', cognitoAuth.PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (btn) btn.disabled = true;
    try {
      await this.ensureAuthConfig();
      const email = this._passwordReset.email;
      await cognitoAuth.confirmForgotPassword(
        email,
        code,
        newPassword,
        this.authConfig,
        this.ipcRenderer,
      );
      if (this.credentialManager && email) {
        await this.credentialManager.saveCredentials(email, newPassword);
      }
      const stayLoggedIn = this._passwordReset.stayLoggedIn;
      this.closeForgotPasswordModal();
      this.closeChangePasswordModal();
      if (stayLoggedIn) {
        this.notificationManager?.showNotification?.('Password reset successfully.', 'success');
        return;
      }
      const loginEmail = document.getElementById('loginEmail');
      const loginPassword = document.getElementById('loginPassword');
      if (loginEmail) loginEmail.value = email;
      if (loginPassword) loginPassword.value = '';
      this.notificationManager?.showNotification?.(
        'Password reset. Sign in with your new password.',
        'success',
      );
    } catch (error) {
      this._setForgotError(
        'forgotConfirmError',
        error?.message || 'Could not reset password. Please try again.',
      );
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async handleCognitoLogin(email, password, company, rememberMe) {
    this.showAuthLoading('Signing in…');
    await this.ensureAuthConfig();
    const stored = await cognitoAuth.signInWithEmailPassword(email, password, this.authConfig);
    if (cognitoAuth.isNewPasswordChallenge(stored)) {
      this._pendingNewPassword = {
        cognitoUser: stored.cognitoUser,
        email,
        company,
        rememberMe,
        userAttributes: stored.userAttributes || {},
      };
      this.hideAuthLoading();
      this.showNewPasswordChallenge(email);
      return { challengeName: 'NEW_PASSWORD_REQUIRED' };
    }
    await this._finishCognitoLogin(stored, email, password, company, rememberMe);
    return stored;
  }

  async handleCompleteNewPassword(e) {
    if (e?.preventDefault) e.preventDefault();
    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmNewPassword')?.value || '';
    const errorDiv = document.getElementById('newPasswordError');
    const btn = document.getElementById('newPasswordBtn');
    const btnText = document.getElementById('newPasswordBtnText');
    const loader = document.getElementById('newPasswordLoader');
    const showError = (message) => {
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
      }
      this.notificationManager?.showNotification?.(message, 'error');
    };

    if (!this._pendingNewPassword?.cognitoUser) {
      showError('Sign in again with your temporary password to set a new one.');
      this.hideNewPasswordChallenge();
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }
    if (!cognitoAuth.isStrongPassword(newPassword)) {
      showError(cognitoAuth.PASSWORD_POLICY_MESSAGE);
      return;
    }

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Saving…';
    if (loader) loader.classList.remove('hidden');
    if (errorDiv) errorDiv.style.display = 'none';
    this.showAuthLoading('Saving your password…');

    try {
      const pending = this._pendingNewPassword;
      const stored = await cognitoAuth.completeNewPasswordChallenge(
        pending.cognitoUser,
        newPassword,
        pending.userAttributes,
      );
      this._pendingNewPassword = null;
      await this._finishCognitoLogin(
        stored,
        pending.email,
        newPassword,
        pending.company,
        pending.rememberMe,
      );
      this.hideNewPasswordChallenge();
    } catch (error) {
      const message = error?.message || 'Could not set password. Please try again.';
      showError(message);
      this.hideAuthLoading();
    } finally {
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = 'Set Password & Sign In';
      if (loader) loader.classList.add('hidden');
    }
  }

  async handleChangePassword(e) {
    if (e?.preventDefault) e.preventDefault();
    const oldPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('changeNewPassword')?.value || '';
    const confirmPassword = document.getElementById('changeConfirmPassword')?.value || '';
    const errorDiv = document.getElementById('changePasswordError');
    const btn = document.getElementById('changePasswordSaveBtn');
    const showError = (message) => {
      if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
      }
    };

    if (!this.currentUser) {
      showError('Please sign in again to change your password.');
      return;
    }
    if (!oldPassword) {
      showError('Enter your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('Passwords do not match.');
      return;
    }
    if (!cognitoAuth.isStrongPassword(newPassword)) {
      showError(cognitoAuth.PASSWORD_POLICY_MESSAGE);
      return;
    }

    if (btn) btn.disabled = true;
    if (errorDiv) errorDiv.style.display = 'none';

    try {
      await this.ensureAuthConfig();
      await cognitoAuth.changePassword(oldPassword, newPassword, this.authConfig);
      if (this.credentialManager && this.currentUser.email) {
        await this.credentialManager.saveCredentials(this.currentUser.email, newPassword);
      }
      this.closeChangePasswordModal();
      this.notificationManager?.showNotification?.('Password changed successfully.', 'success');
    } catch (error) {
      showError(error?.message || 'Could not change password. Please try again.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async _finishCognitoLogin(stored, email, password, company, rememberMe) {
    this.showAuthLoading('Verifying your account…');
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

    this.showAuthLoading('Loading your workspace…');
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
          this.hideAuthLoading();
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
    this.showAuthLoading('Signing in…');

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
      this.hideAuthLoading();
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
      this.hideNewPasswordChallenge();
      this.closeChangePasswordModal();
      this.closeForgotPasswordModal();
      
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

    const userEmail = document.getElementById('userEmail');
    if (userEmail) {
      userEmail.textContent = this.currentUser.email || '';
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