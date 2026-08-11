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
    fullscreen: false, 
    webPreferences: { 
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
});

// EXPERIMENTAL: RAW TSPL 4-INCH RECEIPT ENGINE
ipcMain.on('print-receipt', (event, { printerPath, invoice, firmSettings }) => {
  
  // 1. Calculate the dynamic height of the receipt (in dots)
  // Base header/footer height is roughly 1000 dots
  // Each item adds about 80 dots.
  const baseHeight = 1000;
  const itemHeight = 80;
  const totalHeightDots = baseHeight + (invoice.items.length * itemHeight);
  const totalHeightMM = Math.ceil(totalHeightDots / 8); // Convert dots to mm
  
  // Set width to 104mm (4 inch), and dynamic height
  let tspl = `SIZE 104 mm, ${totalHeightMM} mm\r\n`;
  
  // Try to use CONTINUOUS mode so it doesn't look for gaps
  tspl += `GAP 0,0\r\n`;
  tspl += `DIRECTION 1,0\r\n`;
  tspl += `DENSITY 8\r\n`;
  tspl += `SPEED 3\r\n`;
  tspl += `CODEPAGE 850\r\n`;

  // --- CRITICAL TSPL REVERSE FEED ---
  // BACKFEED pulls the paper back by dots. 200 dots ≈ 25mm.
  tspl += `BACKFEED 200\r\n`;

  tspl += `CLS\r\n`; // Clear Image Buffer

  let currentY = 50; // Start printing 50 dots from the top
  const centerStart = 200; // Rough center X coordinate for 104mm
  const leftStart = 20;    // Left margin X coordinate

  // 2. Header (Using TEXT X, Y, "Font", Rotation, X-Mag, Y-Mag, "Text")
  // Font "3" is standard, "4" or "5" is larger
  tspl += `TEXT ${centerStart},${currentY},"4",0,1,1,"${firmSettings.shopName || "Pushpanjali Fashion"}"\r\n`;
  currentY += 60;
  
  if (firmSettings.address) {
    tspl += `TEXT ${centerStart - 50},${currentY},"3",0,1,1,"${firmSettings.address}"\r\n`;
    currentY += 40;
  }
  if (firmSettings.phone) {
    tspl += `TEXT ${centerStart},${currentY},"3",0,1,1,"Ph: ${firmSettings.phone}"\r\n`;
    currentY += 40;
  }
  if (firmSettings.gstin) {
    tspl += `TEXT ${centerStart},${currentY},"3",0,1,1,"GSTIN: ${firmSettings.gstin}"\r\n`;
    currentY += 40;
  }
  
  currentY += 30; // Extra spacing

  // 3. Info
  tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"Bill No: ${invoice.invoice}    Date: ${invoice.date}"\r\n`;
  currentY += 40;
  tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"Cashier: ${invoice.cashier}    Time: ${invoice.time}"\r\n`;
  currentY += 40;
  
  if (invoice.customerName) {
      let cust = `Customer: ${invoice.customerName}`;
      if (invoice.customerMobile) cust += ` | Ph: ${invoice.customerMobile}`;
      tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"${cust}"\r\n`;
      currentY += 40;
  }

  currentY += 20;
  tspl += `BAR ${leftStart},${currentY}, 760, 3\r\n`; // Draw a horizontal line
  currentY += 20;

  // 4. Table Header
  // X coordinates for columns: Item(20), Qty(400), Rate(550), Total(680)
  tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"Item/Barcode"\r\n`;
  tspl += `TEXT 400,${currentY},"3",0,1,1,"Qty"\r\n`;
  tspl += `TEXT 550,${currentY},"3",0,1,1,"Rate"\r\n`;
  tspl += `TEXT 680,${currentY},"3",0,1,1,"Total"\r\n`;
  currentY += 40;
  
  tspl += `BAR ${leftStart},${currentY}, 760, 3\r\n`;
  currentY += 20;

  // 5. Items
  invoice.items.forEach(item => {
      let itemName = item.name;
      if (item.size) itemName += ` (Sz:${item.size})`;
      // Truncate if too long
      if (itemName.length > 25) itemName = itemName.substring(0, 25);
      
      tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"${itemName}"\r\n`;
      tspl += `TEXT 400,${currentY},"3",0,1,1,"${item.qty}"\r\n`;
      tspl += `TEXT 550,${currentY},"3",0,1,1,"${item.price}"\r\n`;
      tspl += `TEXT 680,${currentY},"3",0,1,1,"${item.total}"\r\n`;
      currentY += 40;
      
      tspl += `TEXT ${leftStart},${currentY},"2",0,1,1,"${item.barcode}"\r\n`;
      currentY += 40;
  });
  
  tspl += `BAR ${leftStart},${currentY}, 760, 3\r\n`;
  currentY += 20;

  // 6. Totals
  const totalItems = invoice.items.reduce((s, i) => s + parseInt(i.qty), 0);
  tspl += `TEXT ${leftStart},${currentY},"4",0,1,1,"NET TOTAL (${totalItems} Qty)"\r\n`;
  tspl += `TEXT 550,${currentY},"4",0,1,1,"Rs. ${invoice.amount}"\r\n`;
  currentY += 60;
  
  tspl += `BAR ${leftStart},${currentY}, 760, 3\r\n`;
  currentY += 20;
  
  tspl += `TEXT ${leftStart},${currentY},"3",0,1,1,"Payment Method: ${invoice.method}"\r\n`;
  currentY += 50;

  // 7. Footer
  tspl += `TEXT ${centerStart - 30},${currentY},"3",0,1,1,"${firmSettings.billFooterMsg || "Thank you! Visit Again."}"\r\n`;
  
  // 8. Print 1 copy
  tspl += `PRINT 1,1\r\n`;

  // Save to Temp File
  const tempPath = path.join(os.tmpdir(), 'receipt.tspl');
  fs.writeFileSync(tempPath, tspl, 'utf8');

  // Execute Binary Copy to Printer Share
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
