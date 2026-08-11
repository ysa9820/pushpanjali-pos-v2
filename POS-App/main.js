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

// ROCK-SOLID ESC/POS 4-INCH RECEIPT ENGINE
ipcMain.on('print-receipt', (event, { printerPath, invoice, firmSettings }) => {
  
  let buffer = Buffer.alloc(0);
  
  function append(data) {
    if (typeof data === 'string') {
      buffer = Buffer.concat([buffer, Buffer.from(data, 'ascii')]);
    } else {
      buffer = Buffer.concat([buffer, Buffer.from(data)]);
    }
  }

  const ESC = 0x1B;
  const GS = 0x1D;

  // A 4-inch (104mm) printer fits exactly 69 characters per line on standard font.
  function padRight(str, len) {
    if (str.length > len) return str.substring(0, len);
    return str + " ".repeat(len - str.length);
  }
  function padLeft(str, len) {
    if (str.length > len) return str.substring(0, len);
    return " ".repeat(len - str.length) + str;
  }

  // 1. Initialize Printer (Forces clean ESC/POS Mode)
  append([ESC, 0x40]);
  
  // 2. Header (Centered)
  append([ESC, 0x61, 0x01]); // Align Center
  append([GS, 0x21, 0x11, ESC, 0x45, 0x01]); // Double Size, Bold
  append((firmSettings.shopName || "Pushpanjali Fashion") + "\n");
  
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00]); // Normal Size
  if (firmSettings.address) append(firmSettings.address + "\n");
  if (firmSettings.phone) append("Ph: " + firmSettings.phone + "\n");
  if (firmSettings.gstin) append("GSTIN: " + firmSettings.gstin + "\n");
  append("\n");

  // 3. Info (Left Align)
  append([ESC, 0x61, 0x00]); // Align Left
  
  const sep = "-".repeat(69) + "\n";
  const thickSep = "=".repeat(69) + "\n";
  
  append(sep);
  append(padRight(`Bill No: ${invoice.invoice}`, 35) + padLeft(`Date: ${invoice.date}`, 34) + "\n");
  append(padRight(`Cashier: ${invoice.cashier}`, 35) + padLeft(`Time: ${invoice.time}`, 34) + "\n");
  
  if (invoice.customerName) {
      let cust = `Customer: ${invoice.customerName}`;
      if (invoice.customerMobile) cust += ` | Ph: ${invoice.customerMobile}`;
      append(cust + "\n");
  }
  append(thickSep);

  // 4. Table Header (69 chars total)
  append([ESC, 0x45, 0x01]); // Bold
  append(padRight("Item / Barcode", 34) + padLeft("Qty", 7) + padLeft("Rate", 12) + padLeft("Total", 16) + "\n");
  append([ESC, 0x45, 0x00]); // Bold Off
  append(sep);

  // 5. Items
  invoice.items.forEach(item => {
      let itemName = item.name;
      if (item.size) itemName += ` (Sz:${item.size})`;
      if (itemName.length > 34) itemName = itemName.substring(0, 34);
      
      let line1 = padRight(itemName, 34) + padLeft(item.qty.toString(), 7) + padLeft(item.price.toString(), 12) + padLeft(item.total.toString(), 16) + "\n";
      let line'2' = padRight(item.barcode, 69) + "\n";
      
      append(line1 + line2);
  });
  
  append(thickSep);

  // 6. Totals
  const totalItems = invoice.items.reduce((s, i) => s + parseInt(i.qty), 0);
  append([GS, 0x21, 0x01, ESC, 0x45, 0x01]); // Double Height, Bold
  append(padRight(`NET TOTAL (${totalItems} Qty)`, 40) + padLeft(`Rs. ${invoice.amount}`, 29) + "\n");
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00]); // Normal
  
  append(sep);
  append(`Payment Method: ${invoice.method}\n`);
  append(sep);
  append("\n");

  // 7. Footer
  append([ESC, 0x61, 0x01]); // Align Center
  append((firmSettings.billFooterMsg || "Thank you for shopping! Visit Again.") + "\n");
  
  // 8. Feed paper and Full Cut
  append("\n\n\n\n\n");
  append([GS, 0x56, 0x41, 0x00]); // Native Auto-Cut Command

  // Save to Temp File & Execute
  const tempPath = path.join(os.tmpdir(), 'receipt.bin');
  fs.writeFileSync(tempPath, buffer);

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
