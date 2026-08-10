const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

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

// RAW TSPL PRINT ENGINE
ipcMain.on('print-silent', (event, { printerPath, labels }) => {
  
  let tspl = `SIZE 50 mm, 25 mm\r\n`;
  tspl += `GAP 3 mm, 0 mm\r\n`;
  tspl += `DIRECTION 1,0\r\n`;
  tspl += `DENSITY 8\r\n`;
  tspl += `SPEED 3\r\n`;
  tspl += `CODEPAGE 850\r\n`;

  labels.forEach(label => {
    const qty = parseInt(label.qty) || 1;
    tspl += `CLS\r\n`;
    tspl += `TEXT 30,20,"3",0,1,1,"Pushpanjali Fashion"\r\n`;
    tspl += `BARCODE 30,60,"128",70,1,0,2,2,"${label.barcode}"\r\n`;
    tspl += `TEXT 30,160,"3",0,1,1,"Rs. ${label.mrp}"\r\n`;
    tspl += `PRINT ${qty},1\r\n`;
  });

  const tempPath = path.join(os.tmpdir(), 'barcode.tspl');
  fs.writeFileSync(tempPath, tspl, 'utf8');

  // Using /B (Binary Mode) is critical for RAW TSPL printing on Windows
  const command = `copy /B "${tempPath}" "${printerPath}"`;
  
  exec(command, (error, stdout, stderr) => {
    // Send back a success boolean and the actual Windows error if it failed
    event.reply('print-finished', { 
      success: !error, 
      errorMsg: error ? error.message : null 
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
