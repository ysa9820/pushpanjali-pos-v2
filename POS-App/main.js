const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    fullscreen: true, // POS usually runs in fullscreen
    webPreferences: { 
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
});

// INTERCEPT THERMAL RECEIPT PRINT REQUEST
ipcMain.on('print-receipt', (event, printerName) => {
  win.webContents.print({ 
    silent: true, 
    deviceName: printerName || '', 
    color: false,
    margins: { marginType: 'none' }, // Strips out browser headers/footers
    printBackground: true
  }, (success, failureReason) => {
    event.reply('print-finished', { success, errorMsg: failureReason });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
