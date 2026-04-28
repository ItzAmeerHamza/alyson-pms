// Quick script to open DevTools in the running app
const { app, BrowserWindow } = require('electron');

// Get all windows
const windows = BrowserWindow.getAllWindows();

if (windows.length > 0) {
  console.log(`Found ${windows.length} window(s)`);
  windows.forEach((win, index) => {
    console.log(`Opening DevTools for window ${index + 1}...`);
    win.webContents.openDevTools({ mode: 'detach' });
  });
  console.log('DevTools opened!');
} else {
  console.log('No windows found');
}

