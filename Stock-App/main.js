const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: { 
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
});

// INTERCEPT SILENT PRINT REQUEST & SEND ABSOLUTE SETTINGS
ipcMain.on('print-silent', (event, printerName) => {
  win.webContents.print({ 
    silent: true, 
    deviceName: printerName || '', 
    color: false,
    margins: { marginType: 'none' },
    printBackground: true,
    landscape: false,
    pageSize: { width: 50000, height: 25000 } // Absolute Size: 50mm x 25mm in microns
  }, (success, failureReason) => {
    // Send a message back to the app so it can remove the loading screen
    event.reply('print-finished', success);
    if (!success) console.error("Print Failed:", failureReason);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
