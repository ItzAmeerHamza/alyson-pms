const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Send acknowledgment to main process
  acknowledgeWarning: (data) => {
    ipcRenderer.send('warning-acknowledge', data);
  },

  // Send dismissal to main process
  dismissWarning: (data) => {
    ipcRenderer.send('warning-dismiss', data);
  },

  // Cancel/close warning
  cancelWarning: () => {
    ipcRenderer.send('warning-cancel');
  },

  // Listen for warning data from main process
  onDisplayWarning: (callback) => {
    ipcRenderer.on('display-warning', (event, data) => {
      callback(data);
    });
  },

  // Listen for response completion
  onWarningResponse: (callback) => {
    ipcRenderer.on('warning-response-complete', (event) => {
      callback();
    });
  },

  // Remove all listeners (cleanup)
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('display-warning');
    ipcRenderer.removeAllListeners('warning-response-complete');
  }
}); 