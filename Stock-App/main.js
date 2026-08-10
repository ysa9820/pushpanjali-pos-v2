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

// INTERCEPT SILENT PRINT REQUEST
ipcMain.on('print-silent', (event, printerName) => {
  win.webContents.print({ 
    silent: true, 
    deviceName: printerName || '', 
    color: false,
    margins: { marginType: 'none' },
    printBackground: true, // CRITICAL FOR THERMAL PRINTERS
    landscape: false
  }, (success, failureReason) => {
    if (!success) console.error("Silent Print Failed:", failureReason);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
