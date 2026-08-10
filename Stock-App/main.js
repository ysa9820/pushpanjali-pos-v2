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

// THE ENTERPRISE RAW TSPL PRINT ENGINE
ipcMain.on('print-silent', (event, { printerPath, labels }) => {
  
  // 1. Construct the exact TSPL Commands for the TE244
  let tspl = `SIZE 50 mm, 25 mm\r\n`;
  tspl += `GAP 3 mm, 0 mm\r\n`;
  tspl += `DIRECTION 1,0\r\n`;
  tspl += `DENSITY 8\r\n`;
  tspl += `SPEED 3\r\n`;
  tspl += `CODEPAGE 850\r\n`;

  // Loop through every item in the staging list
  labels.forEach(label => {
    const qty = parseInt(label.qty) || 1;
    tspl += `CLS\r\n`; // Clear Image Buffer
    
    // TEXT: X=30, Y=20, Font=3, Rotation=0, X-Mag=1, Y-Mag=1
    tspl += `TEXT 30,20,"3",0,1,1,"Pushpanjali Fashion"\r\n`;
    
    // BARCODE: X=30, Y=60, Type=128, Height=70, HumanReadable=1, Rot=0, Narrow=2, Wide=2
    tspl += `BARCODE 30,60,"128",70,1,0,2,2,"${label.barcode}"\r\n`;
    
    // MRP TEXT
    tspl += `TEXT 30,160,"3",0,1,1,"Rs. ${label.mrp}"\r\n`;
    
    // Print Command (Quantity, Copies)
    tspl += `PRINT ${qty},1\r\n`;
  });

  // 2. Save the RAW code to a temporary file
  const tempPath = path.join(os.tmpdir(), 'barcode.tspl');
  fs.writeFileSync(tempPath, tspl, 'utf8');

  // 3. Force the file directly into the Windows Spooler using CMD
  // Example command: copy /Y "C:\temp\barcode.tspl" "\\localhost\TSC"
  const command = `copy /Y "${tempPath}" "${printerPath}"`;
  
  exec(command, (error, stdout, stderr) => {
    event.reply('print-finished', !error);
    if (error) {
      console.error("RAW Print Error:", error);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
