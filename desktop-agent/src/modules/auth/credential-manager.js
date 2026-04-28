/**
 * Secure Credential Manager
 * Handles secure storage and retrieval of user credentials using keytar
 */

class CredentialManager {
  constructor() {
    this.keytar = null;
    this.serviceName = 'EbdaaWorkTime';
    // Cache credentials in memory to avoid repeated keychain prompts
    this._cachedCredentials = null;
    this._cacheTime = null;
    this._cacheMaxAge = 24 * 60 * 60 * 1000; // 24 hours
    this.init();
  }

  async init() {
    try {
      // Check if we're in renderer process and use IPC instead of direct keytar access
      if (typeof window !== 'undefined' && window.require) {
        // Renderer process - use IPC for keytar operations
        const { ipcRenderer } = window.require('electron');
        this.ipcRenderer = ipcRenderer;
        this.useIPC = true;
        console.log('🔧 CredentialManager: Using IPC for keytar operations (renderer process)');
      } else if (typeof require !== 'undefined') {
        // Main process - use keytar directly
        this.keytar = require('keytar');
        this.useIPC = false;
        console.log('🔧 CredentialManager: Using keytar directly (main process)');
      } else {
        console.warn('⚠️ Keytar not available in this context');
      }
    } catch (error) {
      console.error('❌ Failed to initialize keytar:', error);
    }
  }

  /**
   * Save user credentials securely
   * @param {string} email - User's email address
   * @param {string} password - User's password
   * @returns {Promise<boolean>} - Success status
   */
  async saveCredentials(email, password) {
    if (this.useIPC && this.ipcRenderer) {
      // Use IPC to communicate with main process
      try {
        console.log('🔐 Saving credentials securely via IPC for:', email);
        const success = await this.ipcRenderer.invoke('save-credentials', email, password);
        
        if (success) {
          // Also save email preference in localStorage for easy access (if available)
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ebdaa_remember_email', email);
            localStorage.setItem('ebdaa_remember_me', 'true');
            localStorage.setItem('ebdaa_credentials_stored', 'true');
          }
          console.log('✅ Credentials saved securely via IPC');
          // Cache to avoid future keychain prompts
          this._cachedCredentials = { email, password };
          this._cacheTime = Date.now();
          return true;
        } else {
          console.warn('⚠️ Failed to save credentials via IPC, falling back to localStorage');
          return this.saveCredentialsLocalStorage(email, password);
        }
      } catch (error) {
        console.error('❌ IPC save credentials failed:', error);
        return this.saveCredentialsLocalStorage(email, password);
      }
    } else if (this.keytar) {
      // Direct keytar access (main process)
      try {
        console.log('🔐 Saving credentials securely for:', email);
        await this.keytar.setPassword(this.serviceName, email, password);
        
        // Also save email preference in localStorage for easy access (if available)
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('ebdaa_remember_email', email);
          localStorage.setItem('ebdaa_remember_me', 'true');
          localStorage.setItem('ebdaa_credentials_stored', 'true');
        }
        
        console.log('✅ Credentials saved securely');
        // Cache to avoid future keychain prompts
        this._cachedCredentials = { email, password };
        this._cacheTime = Date.now();
        return true;
      } catch (error) {
        console.error('❌ Failed to save credentials:', error);
        return false;
      }
    } else {
      console.warn('⚠️ Keytar not available, falling back to localStorage');
      return this.saveCredentialsLocalStorage(email, password);
    }
  }

  /**
   * Retrieve stored credentials
   * @param {string} email - User's email address
   * @returns {Promise<{email: string, password: string} | null>} - Stored credentials or null
   */
  async getCredentials(email = null) {
    // Check cache first to avoid keychain prompt
    if (this._cachedCredentials && this._cacheTime) {
      const cacheAge = Date.now() - this._cacheTime;
      if (cacheAge < this._cacheMaxAge) {
        console.log('✅ Using cached credentials (avoiding keychain prompt)');
        return this._cachedCredentials;
      } else {
        // Cache expired, clear it
        this._cachedCredentials = null;
        this._cacheTime = null;
      }
    }

    if (this.useIPC && this.ipcRenderer) {
      // Use IPC to communicate with main process
      try {
        // If no email provided, get from localStorage (if available)
        if (!email && typeof localStorage !== 'undefined') {
          email = localStorage.getItem('ebdaa_remember_email');
        }

        if (!email) {
          console.log('📭 No stored email found');
          return null;
        }

        const credentials = await this.ipcRenderer.invoke('get-credentials', email);
        
        if (credentials) {
          console.log('✅ Retrieved stored credentials via IPC for:', email);
          // Cache to avoid future keychain prompts
          this._cachedCredentials = credentials;
          this._cacheTime = Date.now();
          return credentials;
        } else {
          console.log('📭 No stored password found via IPC for:', email);
          return null;
        }
      } catch (error) {
        console.error('❌ IPC get credentials failed:', error);
        return this.getCredentialsLocalStorage();
      }
    } else if (this.keytar) {
      // Direct keytar access (main process)
      try {
        // If no email provided, get from localStorage
        if (!email) {
          email = localStorage.getItem('ebdaa_remember_email');
        }

        if (!email) {
          console.log('📭 No stored email found');
          return null;
        }

        const password = await this.keytar.getPassword(this.serviceName, email);
        
        if (password) {
          console.log('✅ Retrieved stored credentials for:', email);
          const credentials = { email, password };
          // Cache to avoid future keychain prompts
          this._cachedCredentials = credentials;
          this._cacheTime = Date.now();
          return credentials;
        } else {
          console.log('📭 No stored password found for:', email);
          return null;
        }
      } catch (error) {
        console.error('❌ Failed to retrieve credentials:', error);
        return null;
      }
    } else {
      console.warn('⚠️ Keytar not available, checking localStorage');
      return this.getCredentialsLocalStorage();
    }
  }

  /**
   * Delete stored credentials
   * @param {string} email - User's email address
   * @returns {Promise<boolean>} - Success status
   */
  async deleteCredentials(email = null) {
    // Clear cache when deleting credentials
    this._cachedCredentials = null;
    this._cacheTime = null;

    if (this.useIPC && this.ipcRenderer) {
      // Use IPC to communicate with main process
      try {
        // If no email provided, get from localStorage
        if (!email) {
          email = localStorage.getItem('ebdaa_remember_email');
        }

        if (email) {
          console.log('🗑️ Deleting stored credentials via IPC for:', email);
          await this.ipcRenderer.invoke('delete-credentials', email);
        }
        
        // Clear localStorage as well
        localStorage.removeItem('ebdaa_remember_email');
        localStorage.removeItem('ebdaa_remember_me');
        localStorage.removeItem('ebdaa_credentials_stored');
        localStorage.removeItem('ebdaa_saved_password');
        
        console.log('✅ Credentials deleted successfully via IPC');
        return true;
      } catch (error) {
        console.error('❌ IPC delete credentials failed:', error);
        return this.deleteCredentialsLocalStorage();
      }
    } else if (this.keytar) {
      // Direct keytar access (main process)
      try {
        // If no email provided, get from localStorage
        if (!email) {
          email = localStorage.getItem('ebdaa_remember_email');
        }

        if (email) {
          console.log('🗑️ Deleting stored credentials for:', email);
          await this.keytar.deletePassword(this.serviceName, email);
        }
        
        // Clear localStorage as well
        localStorage.removeItem('ebdaa_remember_email');
        localStorage.removeItem('ebdaa_remember_me');
        localStorage.removeItem('ebdaa_credentials_stored');
        localStorage.removeItem('ebdaa_saved_password');
        
        console.log('✅ Credentials deleted successfully');
        return true;
      } catch (error) {
        console.error('❌ Failed to delete credentials:', error);
        return false;
      }
    } else {
      console.warn('⚠️ Keytar not available, clearing localStorage');
      return this.deleteCredentialsLocalStorage();
    }
  }

  /**
   * Check if credentials are stored
   * @param {string} email - User's email address
   * @returns {Promise<boolean>} - Whether credentials are stored
   */
  async hasStoredCredentials(email = null) {
    if (!this.keytar) {
      return this.hasStoredCredentialsLocalStorage();
    }

    try {
      if (!email) {
        email = localStorage.getItem('ebdaa_remember_email');
      }

      if (!email) return false;

      const password = await this.keytar.getPassword(this.serviceName, email);
      return !!password;
    } catch (error) {
      console.error('❌ Failed to check stored credentials:', error);
      return false;
    }
  }

  /**
   * Get all stored accounts (emails only)
   * @returns {Promise<string[]>} - Array of stored email addresses
   */
  async getStoredAccounts() {
    if (!this.keytar) {
      const email = localStorage.getItem('ebdaa_remember_email');
      return email ? [email] : [];
    }

    try {
      const credentials = await this.keytar.findCredentials(this.serviceName);
      return credentials.map(cred => cred.account);
    } catch (error) {
      console.error('❌ Failed to get stored accounts:', error);
      return [];
    }
  }

  // Fallback methods for when keytar is not available
  saveCredentialsLocalStorage(email, password) {
    try {
      console.warn('⚠️ Using localStorage for credential storage (INSECURE)');
      localStorage.setItem('ebdaa_remember_email', email);
      localStorage.setItem('ebdaa_remember_me', 'true');
      localStorage.setItem('ebdaa_saved_password', btoa(password)); // Basic encoding (still insecure)
      localStorage.setItem('ebdaa_credentials_stored', 'true');
      return true;
    } catch (error) {
      console.error('❌ Failed to save credentials to localStorage:', error);
      return false;
    }
  }

  getCredentialsLocalStorage() {
    try {
      const email = localStorage.getItem('ebdaa_remember_email');
      const encodedPassword = localStorage.getItem('ebdaa_saved_password');
      
      if (email && encodedPassword) {
        const password = atob(encodedPassword);
        console.warn('⚠️ Retrieved credentials from localStorage (INSECURE)');
        return { email, password };
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to retrieve credentials from localStorage:', error);
      return null;
    }
  }

  deleteCredentialsLocalStorage() {
    try {
      localStorage.removeItem('ebdaa_remember_email');
      localStorage.removeItem('ebdaa_remember_me');
      localStorage.removeItem('ebdaa_saved_password');
      localStorage.removeItem('ebdaa_credentials_stored');
      return true;
    } catch (error) {
      console.error('❌ Failed to delete credentials from localStorage:', error);
      return false;
    }
  }

  hasStoredCredentialsLocalStorage() {
    const email = localStorage.getItem('ebdaa_remember_email');
    const password = localStorage.getItem('ebdaa_saved_password');
    return !!(email && password);
  }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CredentialManager;
} else {
  window.CredentialManager = CredentialManager;
}