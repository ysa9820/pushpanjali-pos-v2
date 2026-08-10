const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow } = require('electron');

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
        settings: { shopName: "Pushpanjali Fashion Centre", phone: "+91 8767571916", receiptWidth: "110", labelWidth: "50", labelHeight: "25", defaultCommissionRate: 2, billShowCustomer: true, billShowSalesperson: true, billFooterMsg: "Thank you for shopping!", barcodeShowShopName: true, barcodeShowPrice: true }
      };
      atomicSaveToDisk();
    } else {
      try { dbCache = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch (err) { console.error("Database read error:", err); }
    }
  };

  const atomicSaveToDisk = () => {
    try { fs.writeFileSync(tempDbPath, JSON.stringify(dbCache, null, 2)); fs.renameSync(tempDbPath, dbPath); } catch (err) { console.error("Save error:", err); }
  };

  loadDatabaseToRAM();

  // Settings & Users & Khata
  serverApp.get('/api/settings', (req, res) => res.json(dbCache.settings));
  serverApp.post('/api/settings', (req, res) => { dbCache.settings = { ...dbCache.settings, ...req.body }; atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.post('/api/login', (req, res) => { const user = dbCache.users.find(u => u.pin === req.body.pin); if (user) res.json({ success: true, user }); else res.json({ success: false, message: 'Invalid PIN' }); });
  serverApp.get('/api/users', (req, res) => res.json(dbCache.users));
  serverApp.post('/api/users', (req, res) => { const { id, name, pin, role, code } = req.body; if (id) { const index = dbCache.users.findIndex(u => u.id === id); if (index >= 0) dbCache.users[index] = { id, name, pin, role, code }; } else { dbCache.users.push({ id: Date.now(), name, pin, role, code }); } atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.delete('/api/users/:id', (req, res) => { dbCache.users = dbCache.users.filter(u => u.id !== parseInt(req.params.id)); atomicSaveToDisk(); res.json({ success: true }); });
  serverApp.get('/api/customers', (req, res) => res.json(dbCache.customers || []));
  serverApp.post('/api/customers/pay', (req, res) => { const { customerId, amountPaid } = req.body; const customer = dbCache.customers.find(c => c.id === customerId); if (customer) { customer.balance -= Number(amountPaid); customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), type: 'PAYMENT', amount: Number(amountPaid) }); atomicSaveToDisk(); res.json({ success: true, newBalance: customer.balance }); } else res.status(404).json({ error: "Customer not found" }); });

  // INVENTORY
  serverApp.get('/api/inventory', (req, res) => res.json(dbCache.inventory));
  serverApp.get('/api/sales', (req, res) => res.json(dbCache.sales));
  serverApp.post('/api/inventory', (req, res) => {
    const { barcode, name, category, qty, price, purchasePrice, brand, size, hsn } = req.body;
    const existing = dbCache.inventory.findIndex(item => item.barcode === barcode);
    if (existing >= 0) {
      dbCache.inventory[existing].qty += Number(qty); dbCache.inventory[existing].price = Number(price); dbCache.inventory[existing].purchasePrice = Number(purchasePrice || 0); dbCache.inventory[existing].brand = brand || ''; dbCache.inventory[existing].size = size || ''; dbCache.inventory[existing].hsn = hsn || '';
    } else {
      dbCache.inventory.push({ barcode, name, category, qty: Number(qty), price: Number(price), purchasePrice: Number(purchasePrice || 0), brand: brand || '', size: size || '', hsn: hsn || '' });
    }
    atomicSaveToDisk(); res.json({ success: true });
  });

  // BULK UPDATE FOR INLINE EXCEL EDITS
  serverApp.put('/api/inventory/bulk', (req, res) => {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: "No items provided" });
    
    items.forEach(updatedItem => {
      const index = dbCache.inventory.findIndex(i => i.barcode === updatedItem.barcode);
      if (index >= 0) {
        dbCache.inventory[index] = { 
          ...dbCache.inventory[index], 
          name: updatedItem.name, 
          brand: updatedItem.brand, 
          size: updatedItem.size, 
          qty: Number(updatedItem.qty), 
          price: Number(updatedItem.price), 
          purchasePrice: Number(updatedItem.purchasePrice || 0) 
        };
      }
    });
    
    atomicSaveToDisk();
    res.json({ success: true });
  });

  serverApp.delete('/api/inventory/:barcode', (req, res) => { dbCache.inventory = dbCache.inventory.filter(item => item.barcode !== req.params.barcode); atomicSaveToDisk(); res.json({ success: true }); });

  // Checkout
  serverApp.post('/api/checkout', (req, res) => {
    const { cart, totalAmount, paymentMethod, cashierName, customerName, customerMobile, terminalId } = req.body;
    cart.forEach(cartItem => { if (cartItem.barcode) { const itemIndex = dbCache.inventory.findIndex(inv => inv.barcode === cartItem.barcode); if (itemIndex >= 0) dbCache.inventory[itemIndex].qty -= cartItem.qty; } });
    const invoiceNo = '#INV-' + Math.floor(100000 + Math.random() * 900000);
    if (paymentMethod === 'CREDIT') { let customer = dbCache.customers.find(c => c.mobile === customerMobile); if (!customer) { customer = { id: Date.now(), name: customerName, mobile: customerMobile, balance: 0, history: [] }; dbCache.customers.push(customer); } customer.balance += Number(totalAmount); customer.history.push({ date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), invoice: invoiceNo, type: 'CREDIT_SALE', amount: Number(totalAmount) }); }
    const saleRecord = { invoice: invoiceNo, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString(), amount: totalAmount, method: paymentMethod, cashier: cashierName, customerName: customerName || 'Walk-in', customerMobile: customerMobile || 'N/A', terminal: terminalId, items: cart };
    dbCache.sales.push(saleRecord); atomicSaveToDisk(); res.json({ success: true, sale: saleRecord });
  });

  serverApp.listen(5000, '0.0.0.0', () => console.log('Master Server Running.'));
}

app.whenReady().then(() => {
  startServer();
  const win = new BrowserWindow({ width: 500, height: 400, autoHideMenuBar: true, webPreferences: { nodeIntegration: true } });
  const ipAddress = getLocalIP();
  const htmlContent = `<!DOCTYPE html><html><body style="font-family: sans-serif; background-color: #f3f4f6; color: #1f2937; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;"><div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center;"><h1 style="color: #1e3a8a; margin-top: 0;">🧠 Master Server</h1><div style="background: #d1fae5; color: #047857; padding: 5px 15px; border-radius: 20px; font-weight: bold; display: inline-block; margin-bottom: 20px;">● ONLINE & RUNNING</div><p style="margin: 0; color: #4b5563;">Your POS & Stock Room IP Address is:</p><div style="font-size: 32px; font-weight: bold; font-family: monospace; background: #e5e7eb; padding: 10px; border-radius: 5px; margin: 10px 0; letter-spacing: 2px;">${ipAddress}</div><p style="font-size: 12px; color: #9ca3af; max-width: 300px; margin: 20px auto 0;">Leave this window open in the background. Do not close this app.</p></div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
