/**
 * Main Process Credential Handler
 * Handles secure credential operations for IPC communication
 */

function getIpcMain() {
  try {
    // Only available in Electron main process
    if (process && process.type !== 'browser') return null;
    const electron = require('electron');
    return electron && electron.ipcMain ? electron.ipcMain : null;
  } catch {
    return null;
  }
}

class MainCredentialHandler {
  constructor() {
    this.keytar = null;
    this.serviceName = 'AlysonWorkTime';
    this.handlersRegistered = false;
    this.init();
  }

  async init() {
    try {
      this.keytar = require('keytar');
      console.log('✅ Keytar initialized in main process');
      this.setupIpcHandlers();
    } catch (error) {
      console.error('❌ Failed to initialize keytar in main process:', error);
    }
  }

  setupIpcHandlers() {
    // Prevent duplicate handler registration
    if (this.handlersRegistered) {
      console.log('⚠️ [MAIN] Credential IPC handlers already registered, skipping...');
      return;
    }
    
    try {
      const ipcMain = getIpcMain();
      if (!ipcMain || typeof ipcMain.handle !== 'function') {
        console.warn('⚠️ [MAIN] ipcMain unavailable; skipping credential IPC handler registration');
        return;
      }

      // Save credentials securely
      ipcMain.handle('save-credentials', async (event, email, password) => {
      if (!this.keytar) return false;
      
      try {
        await this.keytar.setPassword(this.serviceName, email, password);
        console.log('🔐 [MAIN] Credentials saved securely for:', email);
        return true;
      } catch (error) {
        console.error('❌ [MAIN] Failed to save credentials:', error);
        return false;
      }
    });

    // Get stored credentials
    ipcMain.handle('get-credentials', async (event, email) => {
      if (!this.keytar) return null;
      
      try {
        const password = await this.keytar.getPassword(this.serviceName, email);
        if (password) {
          console.log('✅ [MAIN] Retrieved stored credentials for:', email);
          return { email, password };
        }
        return null;
      } catch (error) {
        console.error('❌ [MAIN] Failed to retrieve credentials:', error);
        return null;
      }
    });

    // Delete stored credentials
    ipcMain.handle('delete-credentials', async (event, email) => {
      if (!this.keytar) return false;
      
      try {
        await this.keytar.deletePassword(this.serviceName, email);
        console.log('🗑️ [MAIN] Deleted stored credentials for:', email);
        return true;
      } catch (error) {
        console.error('❌ [MAIN] Failed to delete credentials:', error);
        return false;
      }
    });

    // Check if credentials exist
    ipcMain.handle('has-stored-credentials', async (event, email) => {
      if (!this.keytar) return false;
      
      try {
        const password = await this.keytar.getPassword(this.serviceName, email);
        return !!password;
      } catch (error) {
        console.error('❌ [MAIN] Failed to check stored credentials:', error);
        return false;
      }
    });

    // Get all stored accounts
    ipcMain.handle('get-stored-accounts', async (event) => {
      if (!this.keytar) return [];
      
      try {
        const credentials = await this.keytar.findCredentials(this.serviceName);
        return credentials.map(cred => cred.account);
      } catch (error) {
        console.error('❌ [MAIN] Failed to get stored accounts:', error);
        return [];
      }
    });

      console.log('✅ [MAIN] Credential IPC handlers registered');
      this.handlersRegistered = true;
    } catch (error) {
      console.error('❌ [MAIN] Failed to register credential IPC handlers:', error);
    }
  }
}

module.exports = MainCredentialHandler;