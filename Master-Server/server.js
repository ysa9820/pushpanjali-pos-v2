const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');

let win = null;
let tray = null;
let isQuitting = false;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function startServer() {
  const serverApp = express();
  serverApp.use(cors());
  serverApp.use(express.json({ limit: '50mb' }));

  const dbFolder = path.join(app.getPath('appData'), 'Pushpanjali-Master-DB');
  if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder, { recursive: true });

  const dbPath = path.join(dbFolder, 'shop_database.json');
  const tempDbPath = path.join(dbFolder, 'shop_database.tmp.json');
  const logPath = path.join(dbFolder, 'audit_logs.json');

  let dbCache = null;

  const writeAuditLog = (user, action, details) => {
    let logs = [];
    if (fs.existsSync(logPath)) {
      try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) {}
    }
    logs.unshift({ id: Date.now(), timestamp: new Date().toLocaleString(), user, action, details });
    if (logs.length > 1000) logs = logs.slice(0, 1000);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  };

  const loadDatabaseToRAM = () => {
    if (!fs.existsSync(dbPath)) {
      dbCache = { 
        inventory: [], sales: [], customers: [], payments: [], salesmen: [],
        users: [{ id: 1, name: 'Master Admin', pin: '1234', role: 'admin', permissions: { canViewOldBills: true, canDiscount: true, canEditCart: true } }],
        settings: { 
          shopName: "Pushpanjali Fashion", phone: "", address: "", gstin: "", upiId: "", logoBase64: "", billFooterMsg: "Thank you for shopping!",
          defaultGstRate: 5, minReceiptLines: 32,
          receiptLayout: [
            { id: "HEADER_SHOPNAME", props: { align: "center", size: "double", bold: true } },
            { id: "HEADER_ADDRESS_1", props: { align: "center", size: "normal", bold: false } },
            { id: "DIVIDER_DASHED", props: {} },
            { id: "BILL_INFO", props: { align: "left" } },
            { id: "ITEM_TABLE", props: { showSrNo: false, showBarcode: true, showSize: true } },
            { id: "DIVIDER_SOLID", props: {} },
            { id: "TAX_BREAKDOWN", props: { align: "right" } },
            { id: "TOTAL_AMOUNT", props: { align: "right", size: "double", bold: true } },
            { id: "FOOTER_MESSAGE", props: { align: "center" } }
          ]
        }
      };
      atomicSaveToDisk();
    } else {
      try { 
        dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8')); 
        if (!dbCache.salesmen) dbCache.salesmen = [];
        if (!dbCache.payments) dbCache.payments = [];
        if (!dbCache.settings.upiId) dbCache.settings.upiId = "";
        if (!dbCache.settings.logoBase64) dbCache.settings.logoBase64 = "";
        if (!dbCache.settings.defaultGstRate) dbCache.settings.defaultGstRate = 5;

        dbCache.users = dbCache.users.map(u => ({
          ...u, permissions: u.permissions || (u.role === 'admin' ? { canViewOldBills: true, canDiscount: true, canEditCart: true } : { canViewOldBills: false, canDiscount: false, canEditCart: true })
        }));

        if (dbCache.settings.receiptLayout && typeof dbCache.settings.receiptLayout[0] === 'string') {
          dbCache.settings.receiptLayout = dbCache.settings.receiptLayout.map(id => ({ id, props: {} }));
        }

        atomicSaveToDisk();
      } catch (err) { console.error("Database read error:", err); }
    }
  };

  const atomicSaveToDisk = () => {
    try { fs.writeFileSync(tempDbPath, JSON.stringify(dbCache, null, 2)); fs.renameSync(tempDbPath, dbPath); } catch (err) { console.error("Save error:", err); }
  };

  loadDatabaseToRAM();

  // --- API ROUTES ---
  serverApp.get('/api/settings', (req, res) => res.json(dbCache.settings));
  serverApp.post('/api/settings', (req, res) => { dbCache.settings = { ...dbCache.settings, ...req.body }; atomicSaveToDisk(); res.json({ success: true }); });
  
  serverApp.post('/api/login', (req, res) => { const user = dbCache.users.find(u => u.pin === req.body.pin); if (user) res.json({ success: true, user }); else res.json({ success: false, message: 'Invalid PIN' }); });
  serverApp.get('/api/users', (req, res) => res.json(dbCache.users));
  serverApp.post('/api/users', (req, res) => { 
    const { id, name, pin, role, permissions } = req.body; 
    const perms = permissions || { canViewOldBills: false, canDiscount: false, canEditCart: true };
    if (id) { 
      const index = dbCache.users.findIndex(u => u.id === id); 
      if (index >= 0) dbCache.users[index] = { id, name, pin, role, permissions: perms }; 
    } else { 
      dbCache.users.push({ id: Date.now(), name, pin, role, permissions: perms }); 
    } 
    atomicSaveToDisk(); res.json({ success: true }); 
  });
  serverApp.delete('/api/users/:id', (req, res) => { dbCache.users = dbCache.users.filter(u => u.id !== parseInt(req.params.id)); writeAuditLog("Admin", "Deleted User", `Revoked access for user ID: ${req.params.id}`); atomicSaveToDisk(); res.json({ success: true }); });

  serverApp.get('/api/salesmen', (req, res) => res.json(dbCache.salesmen));
  serverApp.post('/api/salesmen', (req, res) => { dbCache.salesmen.push({ id: Date.now(), name: req.body.name, commissionRate: parseFloat(req.body.commissionRate) || 0 }); atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.delete('/api/salesmen/:id', (req, res) => { dbCache.salesmen = dbCache.salesmen.filter(s => s.id !== parseInt(req.params.id)); atomicSaveToDisk(); res.json({ success: true }); });

  serverApp.get('/api/customers', (req, res) => res.json(dbCache.customers));
  
  serverApp.post('/api/customers/pay', (req, res) => {
    const { customerMobile, amountPaid, method, cashierName } = req.body;
    let customer = dbCache.customers.find(c => c.mobile === customerMobile);
    if (customer) {
      customer.balance -= Number(amountPaid);
      const payRecord = { id: Date.now(), date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), amount: Number(amountPaid), method, customerName: customer.name, customerMobile, cashier: cashierName };
      customer.history.push({ date: payRecord.date, time: payRecord.time, type: 'PAYMENT_RECEIVED', method, amount: payRecord.amount, newBalance: customer.balance, invoice: null });
      dbCache.payments.push(payRecord);
      atomicSaveToDisk(); res.json({ success: true, payment: payRecord, newBalance: customer.balance });
    } else { res.status(404).json({ error: "Customer not found" }); }
  });

  serverApp.get('/api/payments', (req, res) => res.json(dbCache.payments));

  serverApp.get('/api/inventory', (req, res) => res.json(dbCache.inventory));
  serverApp.post('/api/inventory', (req, res) => {
    const { barcode, name, category, qty, price, purchasePrice, brand, size, hsn, supplierName } = req.body;
    const existing = dbCache.inventory.findIndex(item => item.barcode === barcode);
    if (existing >= 0) {
      dbCache.inventory[existing].qty += Number(qty); dbCache.inventory[existing].price = Number(price); dbCache.inventory[existing].purchasePrice = Number(purchasePrice || 0); dbCache.inventory[existing].brand = brand || ''; dbCache.inventory[existing].size = size || ''; dbCache.inventory[existing].hsn = hsn || ''; dbCache.inventory[existing].supplierName = supplierName || dbCache.inventory[existing].supplierName;
    } else { dbCache.inventory.push({ barcode, name, category, qty: Number(qty), price: Number(price), purchasePrice: Number(purchasePrice || 0), brand: brand || '', size: size || '', hsn: hsn || '', supplierName: supplierName || '' }); }
    atomicSaveToDisk(); res.json({ success: true });
  });

  serverApp.put('/api/inventory/:barcode', (req, res) => {
    const { name, category, qty, price, purchasePrice, brand, size, hsn, supplierName, adminName } = req.body;
    const existing = dbCache.inventory.findIndex(item => item.barcode === req.params.barcode);
    if (existing >= 0) {
      if (dbCache.inventory[existing].price !== Number(price)) writeAuditLog(adminName || "Admin", "Price Change", `Changed ${name} (${req.params.barcode}) MRP from ${dbCache.inventory[existing].price} to ${price}`);
      dbCache.inventory[existing] = { ...dbCache.inventory[existing], name, category, qty: Number(qty), price: Number(price), purchasePrice: Number(purchasePrice || 0), brand, size, hsn, supplierName };
      atomicSaveToDisk(); res.json({ success: true });
    } else { res.status(404).json({ error: "Item not found" }); }
  });

  serverApp.delete('/api/inventory/:barcode', (req, res) => { 
    writeAuditLog("Admin", "Deleted Master Stock", `Deleted Item Barcode: ${req.params.barcode}`);
    dbCache.inventory = dbCache.inventory.filter(item => item.barcode !== req.params.barcode); 
    atomicSaveToDisk(); res.json({ success: true }); 
  });

  serverApp.get('/api/sales', (req, res) => res.json(dbCache.sales));
  
  serverApp.post('/api/checkout', (req, res) => {
    const { cart, subTotal, discount, taxAmount, totalAmount, paymentMethod, cashierName, customerName, customerMobile, terminalId } = req.body;
    
    cart.forEach(cartItem => { 
      if (cartItem.barcode) { 
        const itemIndex = dbCache.inventory.findIndex(inv => inv.barcode === cartItem.barcode); 
        if (itemIndex >= 0) dbCache.inventory[itemIndex].qty -= cartItem.qty; 
      } 
    });

    const invoiceNo = '#INV-' + Math.floor(100000 + Math.random() * 900000);
    
    if (paymentMethod === 'CREDIT') { 
      let customer = dbCache.customers.find(c => c.mobile === customerMobile); 
      if (!customer) { 
        customer = { id: Date.now(), name: customerName, mobile: customerMobile, balance: 0, history: [] }; 
        dbCache.customers.push(customer); 
      } 
      customer.balance += Number(totalAmount); 
      customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), invoice: invoiceNo, type: 'DEBIT_SALE', amount: Number(totalAmount), newBalance: customer.balance }); 
    }

    const gstRate = dbCache.settings.defaultGstRate || 5;
    const cgst = Number((taxAmount / 2).toFixed(2));
    const sgst = Number((taxAmount / 2).toFixed(2));

    const saleRecord = { 
      invoice: invoiceNo, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), 
      subTotal: subTotal || totalAmount, discount: discount || 0, taxAmount: taxAmount || 0, cgst, sgst, gstRate,
      amount: totalAmount, method: paymentMethod, cashier: cashierName, 
      customerName: customerName || '', customerMobile: customerMobile || '', terminal: terminalId, items: cart 
    };
    
    dbCache.sales.push(saleRecord); atomicSaveToDisk(); res.json({ success: true, sale: saleRecord });
  });

  serverApp.put('/api/sales/:invoice', (req, res) => {
    const invoiceNo = req.params.invoice;
    const { cart, subTotal, discount, taxAmount, totalAmount, paymentMethod, customerName, customerMobile, adminName } = req.body;
    
    const saleIndex = dbCache.sales.findIndex(s => s.invoice === invoiceNo);
    if (saleIndex < 0) return res.status(404).json({ error: "Invoice not found" });
    const oldSale = dbCache.sales[saleIndex];

    oldSale.items.forEach(oldItem => {
      const invIndex = dbCache.inventory.findIndex(inv => inv.barcode === oldItem.barcode);
      if (invIndex >= 0) dbCache.inventory[invIndex].qty += Number(oldItem.qty);
    });

    if (oldSale.method === 'CREDIT' && oldSale.customerMobile) {
      const customer = dbCache.customers.find(c => c.mobile === oldSale.customerMobile);
      if (customer) {
        customer.balance -= Number(oldSale.amount);
        customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), invoice: invoiceNo, type: 'EDIT_REVERSAL', amount: -Number(oldSale.amount), newBalance: customer.balance });
      }
    }

    cart.forEach(newItem => {
      const invIndex = dbCache.inventory.findIndex(inv => inv.barcode === newItem.barcode);
      if (invIndex >= 0) dbCache.inventory[invIndex].qty -= Number(newItem.qty);
    });

    if (paymentMethod === 'CREDIT' && customerMobile) {
      let customer = dbCache.customers.find(c => c.mobile === customerMobile);
      if (!customer) {
        customer = { id: Date.now(), name: customerName, mobile: customerMobile, balance: 0, history: [] };
        dbCache.customers.push(customer);
      }
      customer.balance += Number(totalAmount);
      customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), invoice: invoiceNo, type: 'EDIT_APPLIED', amount: Number(totalAmount), newBalance: customer.balance });
    }

    const cgst = Number(((taxAmount || 0) / 2).toFixed(2));
    const sgst = Number(((taxAmount || 0) / 2).toFixed(2));

    const updatedSale = { ...oldSale, subTotal, discount, taxAmount, cgst, sgst, amount: totalAmount, method: paymentMethod, customerName, customerMobile, items: cart, isEdited: true, editDate: new Date().toLocaleDateString() };
    dbCache.sales[saleIndex] = updatedSale;
    writeAuditLog(adminName || "Admin", "EDITED INVOICE", `Edited Bill ${invoiceNo}. Old Amt: Rs.${oldSale.amount}, New Amt: Rs.${totalAmount}`);
    
    atomicSaveToDisk(); res.json({ success: true, sale: updatedSale });
  });

  serverApp.delete('/api/sales/:invoice', (req, res) => {
    const invoiceNo = req.params.invoice;
    const adminName = req.body.adminName || "Admin";
    const saleIndex = dbCache.sales.findIndex(s => s.invoice === invoiceNo);
    
    if (saleIndex >= 0) {
      const sale = dbCache.sales[saleIndex];
      sale.items.forEach(soldItem => {
        const invIndex = dbCache.inventory.findIndex(inv => inv.barcode === soldItem.barcode);
        if (invIndex >= 0) dbCache.inventory[invIndex].qty += soldItem.qty;
      });
      if (sale.method === 'CREDIT' && sale.customerMobile) {
        const customer = dbCache.customers.find(c => c.mobile === sale.customerMobile);
        if (customer) {
          customer.balance -= Number(sale.amount);
          customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), invoice: invoiceNo, type: 'VOID_REVERSAL', amount: -Number(sale.amount), newBalance: customer.balance });
        }
      }
      dbCache.sales.splice(saleIndex, 1);
      writeAuditLog(adminName, "VOIDED INVOICE", `Voided Bill ${invoiceNo} for Rs.${sale.amount}. Stock restored.`);
      atomicSaveToDisk(); res.json({ success: true });
    } else { res.status(404).json({ error: "Invoice not found" }); }
  });

  serverApp.get('/api/logs', (req, res) => {
    if (fs.existsSync(logPath)) res.json(JSON.parse(fs.readFileSync(logPath, 'utf8')));
    else res.json([]);
  });

  serverApp.delete('/api/logs', (req, res) => {
    writeAuditLog("Admin", "CLEARED LOGS", "Admin permanently wiped audit history."); 
    setTimeout(() => { fs.writeFileSync(logPath, JSON.stringify([], null, 2)); res.json({ success: true }); }, 100);
  });

  serverApp.listen(5000, '0.0.0.0', () => console.log('Master Server Running.'));
}

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
  startServer();
  win = new BrowserWindow({ width: 550, height: 450, autoHideMenuBar: true, webPreferences: { nodeIntegration: true }, icon: nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAoSURBVDhPY3jP4PgfCDmA2Hhg1YAAAxoYRh2AA4yhA0YdgAOMoQMGAAx+Ew3w7U+KAAAAAElFTkSuQmCC') });
  const htmlContent = `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f3f4f6; color: #1f2937; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; border-top: 5px solid #2563eb;"><h1 style="color: #1e3a8a; margin-top: 0; font-size: 24px;">🧠 Master Server Engine</h1><div style="background: #d1fae5; color: #047857; padding: 5px 15px; border-radius: 20px; font-weight: bold; display: inline-block; margin-bottom: 20px;">● ONLINE & SECURE</div><p style="margin: 0; color: #4b5563; font-weight: bold;">Your POS & Stock Room IP Address is:</p><div style="font-size: 36px; font-weight: bold; font-family: monospace; background: #e5e7eb; padding: 10px; border-radius: 5px; margin: 10px 0; letter-spacing: 2px;">${getLocalIP()}</div></div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  win.on('close', (event) => { if (!isQuitting) { event.preventDefault(); win.hide(); } return false; });
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAoSURBVDhPY3jP4PgfCDmA2Hhg1YAAAxoYRh2AA4yhA0YdgAOMoQMGAAx+Ew3w7U+KAAAAAElFTkSuQmCC');
  tray = new Tray(icon);
  tray.setToolTip('Pushpanjali Master Server');
  const contextMenu = Menu.buildFromTemplate([{ label: 'Show Server Status', click: () => win.show() }, { type: 'separator' }, { label: 'Quit Server', click: () => { isQuitting = true; app.quit(); } }]);
  tray.setContextMenu(contextMenu); tray.on('double-click', () => win.show());
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
