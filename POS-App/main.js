const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280, height: 800,
    autoHideMenuBar: true, fullscreen: true, 
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
});

const ESC = 0x1B; const GS = 0x1D;

function padRight(str, len) {
  str = String(str || ''); if (str.length > len) return str.substring(0, len);
  return str + " ".repeat(len - str.length);
}
function padLeft(str, len) {
  str = String(str || ''); if (str.length > len) return str.substring(0, len);
  return " ".repeat(len - str.length) + str;
}

// 1. DYNAMIC ESC/POS SALES RECEIPT
ipcMain.on('print-receipt', (event, { printerPath, invoice, firmSettings }) => {
  let buffer = Buffer.alloc(0);
  function append(data) {
    if (typeof data === 'string') buffer = Buffer.concat([buffer, Buffer.from(data, 'ascii')]);
    else buffer = Buffer.concat([buffer, Buffer.from(data)]);
  }

  append([ESC, 0x40]);
  const layout = firmSettings.receiptLayout || [];
  const minLines = firmSettings.minReceiptLines || 32;
  const totalLinesEstimated = layout.length + (invoice.items.length * 2);

  layout.forEach(blockObj => {
    // Legacy support or new object format support
    const blockId = typeof blockObj === 'string' ? blockObj : blockObj.id;
    const props = blockObj.props || {};

    // Apply alignment
    if (props.align === 'center') append([ESC, 0x61, 0x01]);
    else if (props.align === 'right') append([ESC, 0x61, 0x02]);
    else append([ESC, 0x61, 0x00]);

    // Apply text size & bold
    if (props.size === 'double') append([GS, 0x21, 0x11]); else append([GS, 0x21, 0x00]);
    if (props.bold) append([ESC, 0x45, 0x01]); else append([ESC, 0x45, 0x00]);

    switch(blockId) {
      case 'HEADER_LOGO': append("[ FIRM LOGO ]\n"); break; // Requires pre-flashed NV NVRAM logo in thermal printers
      case 'HEADER_SHOPNAME': append((firmSettings.shopName || "Shop Name") + "\n"); break;
      case 'HEADER_TAGLINE': append("Exclusive Menswear & Sarees\n"); break;
      case 'HEADER_ADDRESS_1': if (firmSettings.address) append(firmSettings.address.split(',')[0] + "\n"); break;
      case 'HEADER_ADDRESS_2': if (firmSettings.address && firmSettings.address.split(',')[1]) append(firmSettings.address.split(',')[1] + "\n"); break;
      case 'HEADER_PHONE_EMAIL': if (firmSettings.phone) append(`Ph: ${firmSettings.phone}\n`); break;
      case 'HEADER_GSTIN': if (firmSettings.gstin) append(`GSTIN: ${firmSettings.gstin}\n`); break;
      case 'DIVIDER_DASHED': append("-".repeat(69) + "\n"); break;
      case 'DIVIDER_SOLID': append("=".repeat(69) + "\n"); break;
      case 'BLANK_LINE': append("\n"); break;
      case 'BILL_INFO': append(padRight(`Bill No: ${invoice.invoice}`, 35) + padLeft(`Date: ${invoice.date}`, 34) + "\n"); break;
      case 'CASHIER_INFO': append(padRight(`Cashier: ${invoice.cashier}`, 35) + padLeft(`Time: ${invoice.time}`, 34) + "\n"); break;
      case 'CUSTOMER_INFO':
        if (invoice.customerName) append(`Customer: ${invoice.customerName} ${invoice.customerMobile ? '| Ph:'+invoice.customerMobile : ''}\n`);
        break;
      case 'KHATA_BALANCE':
        if (invoice.method === 'CREDIT') append(`Udhaar Balance Updated.\n`);
        break;
      case 'ITEM_TABLE':
        append([ESC, 0x45, 0x01]);
        append(padRight("Item Name", 34) + padLeft("Qty", 7) + padLeft("Rate", 12) + padLeft("Total", 16) + "\n");
        append([ESC, 0x45, 0x00]);
        append("-".repeat(69) + "\n");
        invoice.items.forEach(item => {
          let itemName = item.name;
          if (props.showSize !== false && item.size) itemName += ` (Sz:${item.size})`;
          if (itemName.length > 34) itemName = itemName.substring(0, 34);
          append(padRight(itemName, 34) + padLeft(item.qty.toString(), 7) + padLeft(item.price.toString(), 12) + padLeft(item.total.toString(), 16) + "\n");
          if (props.showBarcode !== false) append(padRight(`${item.barcode}`, 69) + "\n");
        });
        break;
      case 'TAX_BREAKDOWN':
        if (invoice.taxAmount > 0) append(`CGST: Rs.${invoice.cgst} | SGST: Rs.${invoice.sgst} | Tax: Rs.${invoice.taxAmount}\n`);
        break;
      case 'TOTAL_SAVINGS':
        if (invoice.discount > 0) append(`*** YOU SAVED RS. ${invoice.discount} TODAY! ***\n`);
        break;
      case 'BLANK_SPACE_DYNAMIC':
        let padding = minLines - totalLinesEstimated;
        if (padding > 0) append("\n".repeat(padding));
        break;
      case 'TOTAL_AMOUNT':
        const totalItems = invoice.items.reduce((s, i) => s + parseInt(i.qty), 0);
        append(padRight(`NET TOTAL (${totalItems} Qty)`, 40) + padLeft(`Rs. ${invoice.amount}`, 29) + "\n");
        break;
      case 'PAYMENT_METHOD': append(`Payment Method: ${invoice.method}\n`); break;
      case 'TERMS_CONDITIONS': append("T&C: No return without original bill.\n"); break;
      case 'FOOTER_MESSAGE': append((firmSettings.billFooterMsg || "Thank you for shopping! Visit Again.") + "\n"); break;
      case 'UPI_QR': if (firmSettings.upiId) append(`[ Pay via UPI: ${firmSettings.upiId} ]\n`); break;
    }
    
    // Reset formatting after every block
    append([ESC, 0x61, 0x00, GS, 0x21, 0x00, ESC, 0x45, 0x00]); 
  });

  append("\n\n\n\n\n");
  append([GS, 0x56, 0x41, 0x00]);

  const tempPath = path.join(os.tmpdir(), 'receipt.bin');
  fs.writeFileSync(tempPath, buffer);
  exec(`copy /B "${tempPath}" "${printerPath}"`, (error) => {
    event.reply('print-finished', { success: !error, errorMsg: error ? error.message : null });
  });
});

ipcMain.on('print-payment-receipt', (event, { printerPath, payment, firmSettings, newBalance }) => {
  let buffer = Buffer.alloc(0);
  function append(data) { if (typeof data === 'string') buffer = Buffer.concat([buffer, Buffer.from(data, 'ascii')]); else buffer = Buffer.concat([buffer, Buffer.from(data)]); }
  append([ESC, 0x40, ESC, 0x61, 0x01, GS, 0x21, 0x11, ESC, 0x45, 0x01]);
  append((firmSettings.shopName || "Pushpanjali Fashion") + "\n");
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00]);
  append("=".repeat(69) + "\nKHATA PAYMENT RECEIPT\n" + "=".repeat(69) + "\n");
  append(padRight(`Date: ${payment.date}`, 35) + padLeft(`Time: ${payment.time}`, 34) + "\n");
  append(`Customer: ${payment.customerName} (${payment.customerMobile})\n`);
  append("-".repeat(69) + "\n");
  append([GS, 0x21, 0x01, ESC, 0x45, 0x01]);
  append(padRight("AMOUNT RECEIVED:", 40) + padLeft(`Rs. ${payment.amount}`, 29) + "\n");
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00]);
  append(`Payment Mode: ${payment.method}\n`);
  append("-".repeat(69) + "\n");
  append(padRight("REMAINING BALANCE:", 40) + padLeft(`Rs. ${newBalance}`, 29) + "\n");
  append("=".repeat(69) + "\n\n");
  append([ESC, 0x61, 0x01]); append("Thank you!\n\n\n\n\n\n"); append([GS, 0x56, 0x41, 0x00]);
  const tempPath = path.join(os.tmpdir(), 'payment.bin'); fs.writeFileSync(tempPath, buffer);
  exec(`copy /B "${tempPath}" "${printerPath}"`, (error) => event.reply('print-finished', { success: !error, errorMsg: error ? error.message : null }));
});

ipcMain.on('print-eod-report', (event, { printerPath, summary, firmSettings, cashierName }) => {
  let buffer = Buffer.alloc(0);
  function append(data) { if (typeof data === 'string') buffer = Buffer.concat([buffer, Buffer.from(data, 'ascii')]); else buffer = Buffer.concat([buffer, Buffer.from(data)]); }
  append([ESC, 0x40, ESC, 0x61, 0x01, GS, 0x21, 0x11, ESC, 0x45, 0x01]);
  append((firmSettings.shopName || "Pushpanjali Fashion") + "\n");
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00]);
  append("DAILY CASHIER Z-REPORT\n" + "=".repeat(69) + "\n");
  append(padRight(`Date: ${new Date().toLocaleDateString()}`, 35) + padLeft(`Time: ${new Date().toLocaleTimeString()}`, 34) + "\n");
  append(`Cashier: ${cashierName}\n` + "=".repeat(69) + "\n\n");
  append([ESC, 0x45, 0x01]); append("--- BILLING SUMMARY (TODAY) ---\n"); append([ESC, 0x45, 0x00]);
  append(padRight("Total Cash Sales:", 45) + padLeft(`Rs. ${summary.cashSales}`, 24) + "\n");
  append(padRight("Total UPI Sales:", 45) + padLeft(`Rs. ${summary.upiSales}`, 24) + "\n");
  append(padRight("Total Udhaar (Credit Sales):", 45) + padLeft(`Rs. ${summary.creditSales}`, 24) + "\n");
  append("-".repeat(69) + "\n\n");
  append([ESC, 0x45, 0x01]); append("--- KHATA RECOVERIES (TODAY) ---\n"); append([ESC, 0x45, 0x00]);
  append(padRight("Khata Cash Received:", 45) + padLeft(`Rs. ${summary.khataCash}`, 24) + "\n");
  append(padRight("Khata UPI Received:", 45) + padLeft(`Rs. ${summary.khataUpi}`, 24) + "\n");
  append("-".repeat(69) + "\n\n");
  append([GS, 0x21, 0x01, ESC, 0x45, 0x01]);
  append(padRight("NET CASH IN DRAWER:", 40) + padLeft(`Rs. ${summary.netCashInDrawer}`, 29) + "\n");
  append([GS, 0x21, 0x00, ESC, 0x45, 0x00]);
  append("=".repeat(69) + "\n\n\n\n\n\n"); append([GS, 0x56, 0x41, 0x00]);
  const tempPath = path.join(os.tmpdir(), 'eod.bin'); fs.writeFileSync(tempPath, buffer);
  exec(`copy /B "${tempPath}" "${printerPath}"`, (error) => event.reply('print-finished', { success: !error, errorMsg: error ? error.message : null }));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
