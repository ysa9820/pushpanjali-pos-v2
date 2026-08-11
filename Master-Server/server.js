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

  let dbCache = null;

  const loadDatabaseToRAM = () => {
    if (!fs.existsSync(dbPath)) {
      dbCache = { 
        inventory: [], sales: [], customers: [], 
        users: [{ id: 1, name: 'Master Admin', pin: '1234', role: 'admin', code: '01' }],
        settings: { 
          shopName: "Pushpanjali Fashion", phone: "", address: "", gstin: "", billFooterMsg: "Thank you for shopping!",
          minReceiptLines: 32, // ≈ 5 inches minimum length
          // The Default Standard Block Layout Map
          receiptLayout: [
            "HEADER_SHOPNAME", "HEADER_ADDRESS", "HEADER_PHONE_GST", 
            "DIVIDER_DASHED", "BILL_INFO", "CUSTOMER_INFO", "DIVIDER_SOLID", 
            "ITEM_TABLE", "DIVIDER_SOLID", "BLANK_SPACE_DYNAMIC", 
            "TOTAL_AMOUNT", "PAYMENT_METHOD", "DIVIDER_DASHED", "FOOTER_MESSAGE"
          ]
        }
      };
      atomicSaveToDisk();
    } else {
      try { 
        dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8')); 
        // Inject default layout if older DB version doesn't have it
        if (!dbCache.settings.receiptLayout) {
          dbCache.settings.minReceiptLines = 32;
          dbCache.settings.receiptLayout = ["HEADER_SHOPNAME", "HEADER_ADDRESS", "HEADER_PHONE_GST", "DIVIDER_DASHED", "BILL_INFO", "CUSTOMER_INFO", "DIVIDER_SOLID", "ITEM_TABLE", "DIVIDER_SOLID", "BLANK_SPACE_DYNAMIC", "TOTAL_AMOUNT", "PAYMENT_METHOD", "DIVIDER_DASHED", "FOOTER_MESSAGE"];
          atomicSaveToDisk();
        }
      } catch (err) { console.error("Database read error:", err); }
    }
  };

  const atomicSaveToDisk = () => {
    try { fs.writeFileSync(tempDbPath, JSON.stringify(dbCache, null, 2)); fs.renameSync(tempDbPath, dbPath); } catch (err) { console.error("Save error:", err); }
  };

  loadDatabaseToRAM();

  serverApp.get('/api/settings', (req, res) => res.json(dbCache.settings));
  serverApp.post('/api/settings', (req, res) => { dbCache.settings = { ...dbCache.settings, ...req.body }; atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.post('/api/login', (req, res) => { const user = dbCache.users.find(u => u.pin === req.body.pin); if (user) res.json({ success: true, user }); else res.json({ success: false, message: 'Invalid PIN' }); });
  serverApp.get('/api/users', (req, res) => res.json(dbCache.users));
  serverApp.post('/api/users', (req, res) => { const { id, name, pin, role, code } = req.body; if (id) { const index = dbCache.users.findIndex(u => u.id === id); if (index >= 0) dbCache.users[index] = { id, name, pin, role, code }; } else { dbCache.users.push({ id: Date.now(), name, pin, role, code }); } atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.delete('/api/users/:id', (req, res) => { dbCache.users = dbCache.users.filter(u => u.id !== parseInt(req.params.id)); atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.get('/api/customers', (req, res) => res.json(dbCache.customers || []));
  
  serverApp.get('/api/inventory', (req, res) => res.json(dbCache.inventory));
  serverApp.get('/api/sales', (req, res) => res.json(dbCache.sales));
  
  serverApp.post('/api/inventory', (req, res) => {
    const { barcode, name, category, qty, price, purchasePrice, brand, size, hsn, supplierName } = req.body;
    const existing = dbCache.inventory.findIndex(item => item.barcode === barcode);
    if (existing >= 0) {
      dbCache.inventory[existing].qty += Number(qty); dbCache.inventory[existing].price = Number(price); dbCache.inventory[existing].purchasePrice = Number(purchasePrice || 0); dbCache.inventory[existing].brand = brand || ''; dbCache.inventory[existing].size = size || ''; dbCache.inventory[existing].hsn = hsn || ''; dbCache.inventory[existing].supplierName = supplierName || dbCache.inventory[existing].supplierName;
    } else { dbCache.inventory.push({ barcode, name, category, qty: Number(qty), price: Number(price), purchasePrice: Number(purchasePrice || 0), brand: brand || '', size: size || '', hsn: hsn || '', supplierName: supplierName || '' }); }
    atomicSaveToDisk(); res.json({ success: true });
  });

  serverApp.put('/api/inventory/:barcode', (req, res) => {
    const { name, category, qty, price, purchasePrice, brand, size, hsn, supplierName } = req.body;
    const existing = dbCache.inventory.findIndex(item => item.barcode === req.params.barcode);
    if (existing >= 0) {
      dbCache.inventory[existing] = { ...dbCache.inventory[existing], name, category, qty: Number(qty), price: Number(price), purchasePrice: Number(purchasePrice || 0), brand, size, hsn, supplierName };
      atomicSaveToDisk(); res.json({ success: true });
    } else { res.status(404).json({ error: "Item not found" }); }
  });

  serverApp.delete('/api/inventory/:barcode', (req, res) => { dbCache.inventory = dbCache.inventory.filter(item => item.barcode !== req.params.barcode); atomicSaveToDisk(); res.json({ success: true }); });

  serverApp.post('/api/checkout', (req, res) => {
    const { cart, totalAmount, paymentMethod, cashierName, customerName, customerMobile, terminalId } = req.body;
    cart.forEach(cartItem => { if (cartItem.barcode) { const itemIndex = dbCache.inventory.findIndex(inv => inv.barcode === cartItem.barcode); if (itemIndex >= 0) dbCache.inventory[itemIndex].qty -= cartItem.qty; } });
    const invoiceNo = '#INV-' + Math.floor(100000 + Math.random() * 900000);
    const saleRecord = { invoice: invoiceNo, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), amount: totalAmount, method: paymentMethod, cashier: cashierName, customerName: customerName || '', customerMobile: customerMobile || '', terminal: terminalId, items: cart };
    dbCache.sales.push(saleRecord); atomicSaveToDisk(); res.json({ success: true, sale: saleRecord });
  });

  serverApp.listen(5000, '0.0.0.0', () => console.log('Master Server Running.'));
}

app.whenReady().then(() => {
  app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
  startServer();
  win = new BrowserWindow({ width: 550, height: 450, autoHideMenuBar: true, webPreferences: { nodeIntegration: true }, icon: nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAoSURBVDhPY3jP4PgfCDmA2Hhg1YAAAxoYRh2AA4yhA0YdgAOMoQMGAAx+Ew3w7U+KAAAAAElFTkSuQmCC') });
  const htmlContent = `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f3f4f6; color: #1f2937; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; border-top: 5px solid #2563eb;"><h1 style="color: #1e3a8a; margin-top: 0; font-size: 24px;">🧠 Master Server Engine</h1><div style="background: #d1fae5; color: #047857; padding: 5px 15px; border-radius: 20px; font-weight: bold; display: inline-block; margin-bottom: 20px;">● ONLINE & RUNNING IN BACKGROUND</div><p style="margin: 0; color: #4b5563; font-weight: bold;">Your POS & Stock Room IP Address is:</p><div style="font-size: 36px; font-weight: bold; font-family: monospace; background: #e5e7eb; padding: 10px; border-radius: 5px; margin: 10px 0; letter-spacing: 2px;">${getLocalIP()}</div><div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 10px; text-align: left; margin-top: 20px; font-size: 12px; color: #991b1b;"><strong>🛡️ SERVER PROTECTION ACTIVE:</strong><br>If you close this window, the server will NOT shut down. It will hide safely near the Windows clock.<br>To fully turn off the server, right-click the blue dot in the system tray and select "Quit Server".</div></div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
  win.on('close', (event) => { if (!isQuitting) { event.preventDefault(); win.hide(); } return false; });
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAoSURBVDhPY3jP4PgfCDmA2Hhg1YAAAxoYRh2AA4yhA0YdgAOMoQMGAAx+Ew3w7U+KAAAAAElFTkSuQmCC');
  tray = new Tray(icon);
  tray.setToolTip('Pushpanjali Master Server');
  const contextMenu = Menu.buildFromTemplate([{ label: 'Show Server Status', click: () => win.show() }, { type: 'separator' }, { label: 'Quit Server', click: () => { isQuitting = true; app.quit(); } }]);
  tray.setContextMenu(contextMenu); tray.on('double-click', () => win.show());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
