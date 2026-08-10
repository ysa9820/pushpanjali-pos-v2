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

// RAW TSPL PRINT ENGINE (2-UP SIDE-BY-SIDE)
ipcMain.on('print-silent', (event, { printerPath, labels }) => {
  
  // A side-by-side roll of two 50mm labels equals 100mm total width
  let tspl = `SIZE 100 mm, 25 mm\r\n`;
  tspl += `GAP 3 mm, 0 mm\r\n`;
  tspl += `DIRECTION 1,0\r\n`;
  tspl += `DENSITY 8\r\n`;
  tspl += `SPEED 3\r\n`;
  tspl += `CODEPAGE 850\r\n`;

  // 1. Unpack all labels into individual stickers based on Qty
  let allStickers = [];
  labels.forEach(label => {
    const qty = parseInt(label.qty) || 1;
    for (let i = 0; i < qty; i++) {
      allStickers.push(label);
    }
  });

  // 2. Loop through them in pairs (2 at a time)
  for (let i = 0; i < allStickers.length; i += 2) {
    tspl += `CLS\r\n`; // Clear Image Buffer
    
    // --- LEFT LABEL (X Offset: 30 dots) ---
    let left = allStickers[i];
    tspl += `TEXT 30,20,"3",0,1,1,"Pushpanjali Fashion"\r\n`;
    tspl += `BARCODE 30,60,"128",70,1,0,2,2,"${left.barcode}"\r\n`;
    tspl += `TEXT 30,160,"3",0,1,1,"Rs. ${left.mrp}"\r\n`;

    // --- RIGHT LABEL (X Offset: 430 dots) ---
    // (50mm = 400 dots. So 400 + 30 = 430 exact positioning)
    if (i + 1 < allStickers.length) {
      let right = allStickers[i + 1];
      tspl += `TEXT 430,20,"3",0,1,1,"Pushpanjali Fashion"\r\n`;
      tspl += `BARCODE 430,60,"128",70,1,0,2,2,"${right.barcode}"\r\n`;
      tspl += `TEXT 430,160,"3",0,1,1,"Rs. ${right.mrp}"\r\n`;
    }
    
    // Print the row!
    tspl += `PRINT 1,1\r\n`;
  }

  const tempPath = path.join(os.tmpdir(), 'barcode.tspl');
  fs.writeFileSync(tempPath, tspl, 'utf8');

  // Binary copy to the printer
  const command = `copy /B "${tempPath}" "${printerPath}"`;
  
  exec(command, (error, stdout, stderr) => {
    event.reply('print-finished', { 
      success: !error, 
      errorMsg: error ? error.message : null 
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
