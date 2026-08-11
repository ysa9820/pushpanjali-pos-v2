import React, { useState, useEffect, useRef } from 'react';

// RECEIPT DESIGNER BLOCKS
const ALL_BLOCKS = [
  { id: 'HEADER_SHOPNAME', label: 'Shop Name (Large/Bold)', type: 'text', preview: 'PUSHPANJALI FASHION' },
  { id: 'HEADER_ADDRESS', label: 'Firm Address', type: 'text', preview: 'Shop 12, Main Market' },
  { id: 'HEADER_PHONE_GST', label: 'Phone & GSTIN', type: 'text', preview: 'Ph: 9876543210 | GST: 27AABC...' },
  { id: 'DIVIDER_DASHED', label: 'Dashed Line Divider', type: 'line', preview: '----------------------------------------' },
  { id: 'DIVIDER_SOLID', label: 'Solid Line Divider', type: 'line', preview: '========================================' },
  { id: 'BILL_INFO', label: 'Bill No, Date & Time', type: 'data', preview: 'Bill: #INV-123456   Date: 25/10/23' },
  { id: 'CASHIER_INFO', label: 'Cashier / Staff Name', type: 'data', preview: 'Cashier: Admin' },
  { id: 'CUSTOMER_INFO', label: 'Customer Name & Mobile', type: 'data', preview: 'Customer: Rahul (9876543210)' },
  { id: 'ITEM_TABLE', label: 'Itemized Products Table', type: 'table', preview: 'Item         Qty    Rate    Total\nShirt (M)     2      500     1000' },
  { id: 'BLANK_SPACE_DYNAMIC', label: 'Middle Padding (Push Total to Bottom)', type: 'system', preview: '[ Auto-Calculated Blank Space for 5-Inch Receipt ]' },
  { id: 'TOTAL_AMOUNT', label: 'Net Total & Item Count', type: 'data', preview: 'NET TOTAL (2 Qty)        Rs. 1000' },
  { id: 'PAYMENT_METHOD', label: 'Payment Mode', type: 'data', preview: 'Payment Method: CASH' },
  { id: 'FOOTER_MESSAGE', label: 'Thank You Message', type: 'text', preview: 'Thank you for shopping! Visit Again.' }
];

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));
  
  // TABS: DASHBOARD, ANALYTICS, LEDGERS, DESIGNER, STAFF, FIRM
  const [activeTab, setActiveTab] = useState('DASHBOARD'); 
  const [subTab, setSubTab] = useState('SUPPLIER'); // Used for nested tabs

  // GLOBAL STATE
  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', gstin: '', billFooterMsg: '', minReceiptLines: 32, receiptLayout: [] });
  const [users, setUsers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [logs, setLogs] = useState([]);

  // FORMS
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'cashier' });
  const [newSalesman, setNewSalesman] = useState({ name: '', commissionRate: '' });
  
  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });
  const [appConfirm, setAppConfirm] = useState({ show: false, msg: '', onYes: null });

  // DRAG & DROP
  const dragItem = useRef();
  const dragOverItem = useRef();

  const closeAlert = () => setAppAlert({ show: false, msg: '' });
  const closeConfirm = () => setAppConfirm({ show: false, msg: '', onYes: null });
  const safeAlert = (msg) => setAppAlert({ show: true, msg });

  useEffect(() => { if (serverIP && !isSettingUp) fetchData(); }, [serverIP, isSettingUp]);

  const fetchData = async () => {
    try {
      const [setRes, usrRes, smRes, salRes, invRes, cusRes, logRes] = await Promise.all([
        fetch(`http://${serverIP}:5000/api/settings`), fetch(`http://${serverIP}:5000/api/users`),
        fetch(`http://${serverIP}:5000/api/salesmen`), fetch(`http://${serverIP}:5000/api/sales`),
        fetch(`http://${serverIP}:5000/api/inventory`), fetch(`http://${serverIP}:5000/api/customers`),
        fetch(`http://${serverIP}:5000/api/logs`)
      ]);
      const setData = await setRes.json();
      if(!setData.receiptLayout) setData.receiptLayout = ["HEADER_SHOPNAME", "ITEM_TABLE", "TOTAL_AMOUNT"];
      setSettings(setData);
      setUsers(await usrRes.json()); setSalesmen(await smRes.json());
      setSales(await salRes.json()); setInventory(await invRes.json());
      setCustomers(await cusRes.json()); setLogs(await logRes.json());
    } catch (e) { console.error("Server Connection Error"); }
  };

  // --- API ACTIONS ---
  const handleSaveSettings = async () => {
    try {
      await fetch(`http://${serverIP}:5000/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      safeAlert("✅ Settings Saved!"); fetchData();
    } catch (e) { safeAlert("Error saving."); }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.pin) return safeAlert("Name & PIN required.");
    await fetch(`http://${serverIP}:5000/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    setNewUser({ name: '', pin: '', role: 'cashier' }); fetchData(); safeAlert("User Added.");
  };

  const handleAddSalesman = async () => {
    if (!newSalesman.name) return safeAlert("Salesman Name required.");
    await fetch(`http://${serverIP}:5000/api/salesmen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSalesman) });
    setNewSalesman({ name: '', commissionRate: '' }); fetchData(); safeAlert("Salesman Added.");
  };

  const deleteUser = async (id) => { await fetch(`http://${serverIP}:5000/api/users/${id}`, { method: 'DELETE' }); fetchData(); };
  const deleteSalesman = async (id) => { await fetch(`http://${serverIP}:5000/api/salesmen/${id}`, { method: 'DELETE' }); fetchData(); };

  const handleVoidInvoice = async (invoiceNo) => {
    try {
      const res = await fetch(`http://${serverIP}:5000/api/sales/${invoiceNo}`, { 
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminName: 'Master Admin' }) 
      });
      const data = await res.json();
      if (data.success) { safeAlert(`✅ Bill ${invoiceNo} Voided.\nStock has been mathematically restored.`); fetchData(); }
    } catch(e) { safeAlert("Error voiding bill."); }
  };

  const handleClearLogs = async () => {
    await fetch(`http://${serverIP}:5000/api/logs`, { method: 'DELETE' }); fetchData(); safeAlert("Audit Logs Wiped.");
  };

  // --- DRAG AND DROP (DESIGNER) ---
  const handleDragStart = (e, index) => { dragItem.current = index; };
  const handleDragEnter = (e, index) => { dragOverItem.current = index; e.preventDefault(); };
  const handleDrop = (e) => {
    const copyLayout = [...settings.receiptLayout];
    const draggedItemContent = copyLayout[dragItem.current];
    copyLayout.splice(dragItem.current, 1);
    copyLayout.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null; dragOverItem.current = null;
    setSettings({...settings, receiptLayout: copyLayout});
  };
  const addBlockToLayout = (blockId) => { if (!settings.receiptLayout.includes(blockId)) setSettings({...settings, receiptLayout: [...settings.receiptLayout, blockId]}); };
  const removeBlockFromLayout = (index) => { const copy = [...settings.receiptLayout]; copy.splice(index, 1); setSettings({...settings, receiptLayout: copy}); };

  // --- ANALYTICS MATH ENGINE ---
  const totalStockValuation = inventory.reduce((sum, item) => sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.qty || 0)), 0);
  const totalSalesValuation = sales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

  // 1. Supplier Math
  const supplierStats = {};
  inventory.forEach(item => {
    const sup = item.supplierName || 'Unassigned Supplier';
    if(!supplierStats[sup]) supplierStats[sup] = { remainingQty: 0, remainingValue: 0, soldQty: 0, salesValue: 0 };
    supplierStats[sup].remainingQty += parseInt(item.qty || 0);
    supplierStats[sup].remainingValue += (parseInt(item.qty || 0) * parseFloat(item.purchasePrice || 0));
  });
  sales.forEach(sale => {
    sale.items.forEach(item => {
      const invItem = inventory.find(i => i.barcode === item.barcode);
      const sup = invItem?.supplierName || 'Unassigned Supplier';
      if(!supplierStats[sup]) supplierStats[sup] = { remainingQty: 0, remainingValue: 0, soldQty: 0, salesValue: 0 };
      supplierStats[sup].soldQty += parseInt(item.qty || 0);
      supplierStats[sup].salesValue += parseFloat(item.total || 0);
    });
  });

  // 2. Salesman Math
  const salesmanStats = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      const smName = item.salesmanName || 'No Salesman Assigned';
      if(!salesmanStats[smName]) salesmanStats[smName] = { totalSales: 0, commission: 0 };
      salesmanStats[smName].totalSales += parseFloat(item.total || 0);
      const smData = salesmen.find(s => s.name === smName);
      const rate = smData ? parseFloat(smData.commissionRate || 0) : 0;
      salesmanStats[smName].commission += (parseFloat(item.total || 0) * rate) / 100;
    });
  });

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ Connect to Master Server</h1>
          <div className="mb-4"><label className="font-bold text-gray-700">Master Server IP</label><input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="192.168.1.50" className="w-full border-2 border-blue-400 p-2 rounded font-bold text-lg bg-blue-50 mt-1" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); setIsSettingUp(false); }} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 shadow-md">Connect Admin</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans overflow-hidden">
      
      {/* ALERTS & CONFIRMS */}
      {appAlert.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p><button onClick={closeAlert} autoFocus className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button></div></div> )}
      {appConfirm.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-yellow-500"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appConfirm.msg}</p><div className="flex justify-center gap-4"><button onClick={closeConfirm} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded hover:bg-gray-400">Cancel</button><button onClick={() => { appConfirm.onYes(); closeConfirm(); }} autoFocus className="bg-red-600 text-white font-bold py-2 px-6 rounded hover:bg-red-700">Yes, Proceed</button></div></div></div> )}

      {/* TOP NAVIGATION */}
      <div className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <h1 className="text-xl font-black tracking-wide">👑 Master Admin Dashboard</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DASHBOARD' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📊 Dashboard</button>
          <button onClick={() => { setActiveTab('ANALYTICS'); setSubTab('SUPPLIER'); }} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'ANALYTICS' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📈 Analytics</button>
          <button onClick={() => { setActiveTab('LEDGERS'); setSubTab('INVOICES'); }} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'LEDGERS' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>🧾 Bills & Khata</button>
          <button onClick={() => setActiveTab('DESIGNER')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DESIGNER' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📝 Designer</button>
          <button onClick={() => setActiveTab('STAFF')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'STAFF' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>👥 Staff</button>
          <button onClick={() => setActiveTab('FIRM')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'FIRM' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>⚙️ Settings</button>
          <button onClick={() => setIsSettingUp(true)} className="bg-red-600 hover:bg-red-700 px-3 py-1.5 font-bold rounded ml-2">IP</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        
        {/* --- 1. DASHBOARD --- */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-6 mt-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-blue-500">
                <h3 className="text-gray-500 font-bold text-sm uppercase">Lifetime Sales Revenue</h3>
                <div className="text-4xl font-black text-gray-800 mt-2">₹{totalSalesValuation.toLocaleString('en-IN')}</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-green-500">
                <h3 className="text-gray-500 font-bold text-sm uppercase">Total Inventory Value (Purchase)</h3>
                <div className="text-4xl font-black text-gray-800 mt-2">₹{totalStockValuation.toLocaleString('en-IN')}</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-purple-500 flex flex-col justify-center items-center cursor-pointer hover:bg-gray-50" onClick={() => fetchData()}>
                <span className="text-4xl mb-2">🔄</span><span className="font-bold text-gray-700">Sync Master Server</span>
              </div>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-4">
              <div className="bg-gray-100 p-4 border-b font-bold text-gray-700 text-lg">📝 Recent Sales History (Read-Only)</div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b"><tr><th className="p-3">Invoice No</th><th className="p-3">Date</th><th className="p-3">Cashier</th><th className="p-3">Customer</th><th className="p-3">Payment</th><th className="p-3 text-right">Amount</th></tr></thead>
                <tbody>
                  {sales.slice().reverse().slice(0, 15).map((s, i) => (
                    <tr key={i} className="border-b hover:bg-blue-50">
                      <td className="p-3 font-bold text-blue-700">{s.invoice}</td><td className="p-3">{s.date} {s.time}</td>
                      <td className="p-3 font-bold">{s.cashier}</td>
                      <td className="p-3">{s.customerName || 'Walk-in'} <span className="text-xs text-gray-500 block">{s.customerMobile}</span></td>
                      <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${s.method === 'CASH' ? 'bg-green-100 text-green-800' : s.method === 'UPI' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>{s.method}</span></td>
                      <td className="p-3 text-right font-bold text-lg">₹{parseFloat(s.amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- 2. ANALYTICS --- */}
        {activeTab === 'ANALYTICS' && (
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
            <div className="bg-gray-100 p-4 border-b flex gap-4">
              <button onClick={() => setSubTab('SUPPLIER')} className={`px-6 py-2 font-bold rounded ${subTab === 'SUPPLIER' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>📦 Supplier Analytics</button>
              <button onClick={() => setSubTab('SALESMAN')} className={`px-6 py-2 font-bold rounded ${subTab === 'SALESMAN' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>👔 Salesman Commissions</button>
            </div>
            
            {subTab === 'SUPPLIER' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b"><tr><th className="p-4">Supplier Name</th><th className="p-4 text-center">Remaining Stock (Qty)</th><th className="p-4 text-right">Dead Stock Value (Purchase)</th><th className="p-4 text-center">Total Sold (Qty)</th><th className="p-4 text-right">Generated Revenue</th></tr></thead>
                <tbody>
                  {Object.keys(supplierStats).map((sup, i) => (
                    <tr key={i} className="border-b hover:bg-yellow-50">
                      <td className="p-4 font-black text-gray-800 text-lg">{sup}</td>
                      <td className="p-4 text-center font-bold text-gray-500">{supplierStats[sup].remainingQty} Pcs</td>
                      <td className="p-4 text-right font-black text-red-600">₹{supplierStats[sup].remainingValue.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-center font-bold text-gray-500">{supplierStats[sup].soldQty} Pcs</td>
                      <td className="p-4 text-right font-black text-green-600 text-lg">₹{supplierStats[sup].salesValue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {Object.keys(supplierStats).length === 0 && <tr><td colSpan="5" className="p-10 text-center text-gray-400 font-bold">No inventory mapped to suppliers yet.</td></tr>}
                </tbody>
              </table>
            )}

            {subTab === 'SALESMAN' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b"><tr><th className="p-4">Salesman Name</th><th className="p-4 text-right">Total Items Sold (Value)</th><th className="p-4 text-right">Commission Earned</th></tr></thead>
                <tbody>
                  {Object.keys(salesmanStats).map((sm, i) => (
                    <tr key={i} className="border-b hover:bg-blue-50">
                      <td className="p-4 font-black text-gray-800 text-lg">{sm}</td>
                      <td className="p-4 text-right font-bold text-gray-600 text-lg">₹{salesmanStats[sm].totalSales.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-right font-black text-green-700 text-xl">₹{salesmanStats[sm].commission.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* --- 3. LEDGERS & BILLS (VOID ENGINE) --- */}
        {activeTab === 'LEDGERS' && (
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
            <div className="bg-gray-100 p-4 border-b flex gap-4">
              <button onClick={() => setSubTab('INVOICES')} className={`px-6 py-2 font-bold rounded ${subTab === 'INVOICES' ? 'bg-red-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>🛑 All Invoices & Voiding</button>
              <button onClick={() => setSubTab('KHATA')} className={`px-6 py-2 font-bold rounded ${subTab === 'KHATA' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>📒 Customer Khata Passbooks</button>
            </div>
            
            {subTab === 'INVOICES' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b"><tr><th className="p-3">Invoice No</th><th className="p-3">Date/Time</th><th className="p-3">Customer</th><th className="p-3">Method</th><th className="p-3 text-right">Amount</th><th className="p-3 text-center">Admin Action</th></tr></thead>
                <tbody>
                  {sales.slice().reverse().map((s, i) => (
                    <tr key={i} className="border-b hover:bg-red-50">
                      <td className="p-3 font-bold text-gray-800">{s.invoice}</td><td className="p-3">{s.date} {s.time}</td>
                      <td className="p-3">{s.customerName || 'Walk-in'}</td>
                      <td className="p-3 font-bold">{s.method}</td>
                      <td className="p-3 text-right font-bold text-base">₹{s.amount}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => setAppConfirm({ show: true, msg: `DANGER: Void Bill ${s.invoice}?\n\nThis will permanently delete this sale, restore inventory stock, and reverse any Udhaar balance given to the customer.`, onYes: () => handleVoidInvoice(s.invoice) })} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-bold text-xs shadow">VOID BILL</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {subTab === 'KHATA' && (
              <div className="flex h-[600px]">
                <div className="w-1/3 border-r overflow-y-auto bg-gray-50 p-2 space-y-2">
                  {customers.map(c => (
                    <div key={c.id} className="p-3 bg-white border rounded shadow-sm">
                      <div className="flex justify-between items-center"><span className="font-bold text-lg">{c.name}</span><span className="text-red-600 font-black">₹{c.balance}</span></div>
                      <div className="text-xs text-gray-500">{c.mobile}</div>
                    </div>
                  ))}
                  {customers.length === 0 && <div className="p-8 text-center text-gray-400 font-bold">No Khata accounts exist.</div>}
                </div>
                <div className="w-2/3 p-6 flex flex-col items-center justify-center text-gray-400 font-bold text-lg text-center">
                  Full Customer Passbook detailed view is available natively on the Cashier POS Terminal.
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- 4. RECEIPT DESIGNER --- */}
        {activeTab === 'DESIGNER' && (
          <div className="max-w-6xl mx-auto h-full flex flex-col mt-4">
            <div className="bg-white p-4 border-b rounded-t-xl flex justify-between items-center shadow-sm">
              <div><h2 className="text-xl font-black text-gray-800">📝 Receipt Layout Engine</h2><p className="text-xs text-gray-500 font-bold">Drag and drop blocks to configure the POS Printer.</p></div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <label className="text-xs font-bold text-gray-600 block">Min Receipt Length (Lines)</label>
                  <input type="number" value={settings.minReceiptLines} onChange={e => setSettings({...settings, minReceiptLines: parseInt(e.target.value)||0})} className="border-2 border-gray-300 w-24 text-center rounded font-bold text-lg outline-none focus:border-blue-500" />
                </div>
                <button onClick={handleSaveSettings} className="bg-green-600 text-white px-8 py-2 rounded-lg font-black shadow hover:bg-green-700 text-lg">💾 Save Layout Sync</button>
              </div>
            </div>
            <div className="flex flex-1 gap-6 mt-4 overflow-hidden pb-4">
              <div className="w-1/3 bg-white rounded-xl shadow-sm border p-4 flex flex-col h-[600px] overflow-hidden">
                <h3 className="font-bold text-gray-700 border-b pb-2 mb-3">➕ Available Data Blocks</h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  {ALL_BLOCKS.map(block => {
                    const isUsed = settings.receiptLayout.includes(block.id);
                    return (
                      <div key={block.id} className={`p-3 rounded border-2 transition-all ${isUsed ? 'bg-gray-100 border-gray-200 opacity-50' : 'bg-white border-blue-200 hover:border-blue-500 cursor-pointer shadow-sm'}`} onClick={() => !isUsed && addBlockToLayout(block.id)}>
                        <div className="flex justify-between items-center"><span className="font-bold text-gray-800 text-sm">{block.label}</span>{!isUsed && <span className="text-blue-500 font-black">+</span>}</div>
                        <div className="text-xs text-gray-400 mt-1 uppercase">ID: {block.id}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 flex justify-center h-[600px] overflow-y-auto">
                <div className="bg-white shadow-2xl border-4 border-gray-300 w-[400px] min-h-full p-6 pb-20 relative">
                  <div className="absolute top-0 left-0 bg-gray-800 text-white text-[10px] px-2 py-1 font-bold rounded-br">104mm (4-Inch) Preview</div>
                  <div className="mt-6">
                    {settings.receiptLayout.map((blockId, index) => {
                      const blockData = ALL_BLOCKS.find(b => b.id === blockId);
                      if (!blockData) return null;
                      return (
                        <div key={index} draggable onDragStart={(e) => handleDragStart(e, index)} onDragEnter={(e) => handleDragEnter(e, index)} onDragEnd={handleDrop} onDragOver={(e) => e.preventDefault()} className={`relative group border-2 border-transparent hover:border-blue-400 hover:bg-blue-50 p-2 mb-1 cursor-grab transition-all ${blockData.id === 'BLANK_SPACE_DYNAMIC' ? 'bg-yellow-50 border-yellow-300 border-dashed py-6' : ''}`}>
                          <button onClick={() => removeBlockFromLayout(index)} className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs opacity-0 group-hover:opacity-100 shadow">X</button>
                          <div className={`font-mono text-black whitespace-pre-wrap ${blockData.id.includes('SHOPNAME') ? 'text-2xl font-black text-center' : blockData.id.includes('HEADER') || blockData.id.includes('FOOTER') ? 'text-center' : blockData.id.includes('TOTAL') ? 'font-black text-lg' : 'text-sm'}`}>{blockData.preview}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- 5. STAFF & SALESMEN --- */}
        {activeTab === 'STAFF' && (
          <div className="max-w-6xl mx-auto flex gap-6 mt-4">
            {/* System Logins */}
            <div className="w-1/2 bg-white rounded-xl shadow-sm border p-6 flex flex-col">
              <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">🖥️ System Logins (Admin/POS)</h2>
              <div className="flex gap-2 mb-4">
                <input type="text" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} placeholder="Name" className="border-2 p-2 rounded w-1/3 font-bold" />
                <input type="password" maxLength="4" value={newUser.pin} onChange={e=>setNewUser({...newUser, pin: e.target.value.replace(/\D/g, '')})} placeholder="PIN" className="border-2 p-2 rounded w-1/4 font-bold text-center tracking-widest" />
                <select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="border-2 p-2 rounded w-1/4 font-bold"><option value="cashier">Cashier</option><option value="admin">Admin</option></select>
                <button onClick={handleAddUser} className="bg-blue-600 text-white font-bold rounded flex-1">Add</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm"><thead className="bg-gray-50 border-b"><tr><th className="p-2">Name</th><th className="p-2">Role</th><th className="p-2 text-right">Action</th></tr></thead>
                  <tbody>{users.map(u => (<tr key={u.id} className="border-b"><td className="p-2 font-bold">{u.name}</td><td className="p-2 uppercase font-bold text-xs">{u.role}</td><td className="p-2 text-right">{u.id !== 1 && <button onClick={() => deleteUser(u.id)} className="bg-red-500 text-white px-2 py-1 rounded text-xs">Revoke</button>}</td></tr>))}</tbody>
                </table>
              </div>
            </div>
            
            {/* Salesmen Commission List */}
            <div className="w-1/2 bg-white rounded-xl shadow-sm border p-6 flex flex-col">
              <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">👔 Floor Salesmen (For Commission)</h2>
              <div className="flex gap-2 mb-4">
                <input type="text" value={newSalesman.name} onChange={e=>setNewSalesman({...newSalesman, name: e.target.value})} placeholder="Salesman Name" className="border-2 p-2 rounded flex-1 font-bold" />
                <input type="number" value={newSalesman.commissionRate} onChange={e=>setNewSalesman({...newSalesman, commissionRate: e.target.value})} placeholder="Comm %" className="border-2 p-2 rounded w-1/4 font-bold text-center" />
                <button onClick={handleAddSalesman} className="bg-green-600 text-white font-bold rounded px-4">Add Floor Staff</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm"><thead className="bg-gray-50 border-b"><tr><th className="p-2">Salesman Name</th><th className="p-2">Comm Rate</th><th className="p-2 text-right">Action</th></tr></thead>
                  <tbody>{salesmen.map(sm => (<tr key={sm.id} className="border-b"><td className="p-2 font-bold">{sm.name}</td><td className="p-2 font-black text-green-700">{sm.commissionRate}%</td><td className="p-2 text-right"><button onClick={() => deleteSalesman(sm.id)} className="bg-red-500 text-white px-2 py-1 rounded text-xs">Delete</button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- 6. FIRM & AUDIT LOGS --- */}
        {activeTab === 'FIRM' && (
          <div className="max-w-6xl mx-auto flex gap-6 mt-4">
            {/* Global Firm Settings */}
            <div className="w-1/3 bg-white rounded-xl shadow-sm border p-6 flex flex-col">
              <div className="flex justify-between items-center border-b pb-3 mb-4"><h2 className="text-xl font-black text-gray-800">🏢 Firm Profile</h2><button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-1.5 rounded font-bold shadow">Save</button></div>
              <div className="flex flex-col gap-4">
                <div><label className="font-bold text-xs text-gray-500">Shop Name</label><input type="text" value={settings.shopName || ''} onChange={e => setSettings({...settings, shopName: e.target.value})} className="w-full border-2 p-2 rounded font-bold" /></div>
                <div><label className="font-bold text-xs text-gray-500">GSTIN Number</label><input type="text" value={settings.gstin || ''} onChange={e => setSettings({...settings, gstin: e.target.value})} className="w-full border-2 p-2 rounded font-bold uppercase" /></div>
                <div><label className="font-bold text-xs text-gray-500">Address</label><textarea value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} rows="2" className="w-full border-2 p-2 rounded font-bold"></textarea></div>
                <div><label className="font-bold text-xs text-gray-500">Phone</label><input type="text" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full border-2 p-2 rounded font-bold" /></div>
                <div><label className="font-bold text-xs text-gray-500">Bill Footer Message</label><input type="text" value={settings.billFooterMsg || ''} onChange={e => setSettings({...settings, billFooterMsg: e.target.value})} className="w-full border-2 p-2 rounded font-bold bg-green-50" /></div>
              </div>
            </div>
            
            {/* Audit Logs */}
            <div className="w-2/3 bg-white rounded-xl shadow-sm border p-6 flex flex-col h-[600px]">
              <div className="flex justify-between items-center border-b pb-3 mb-4"><h2 className="text-xl font-black text-gray-800">🕵️ Security Audit Logs</h2><button onClick={() => setAppConfirm({show: true, msg: "Wipe all audit logs permanently?", onYes: handleClearLogs})} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded font-bold shadow">Clear All Logs</button></div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 sticky top-0 border-b"><tr><th className="p-3 w-1/4">Date/Time</th><th className="p-3 w-1/6">User</th><th className="p-3 w-1/6">Action</th><th className="p-3">Details</th></tr></thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-xs text-gray-500">{log.timestamp}</td><td className="p-3 font-bold">{log.user}</td><td className="p-3 font-black text-red-600 text-xs uppercase">{log.action}</td><td className="p-3 text-gray-700">{log.details}</td>
                      </tr>
                    ))}
                    {logs.length === 0 && <tr><td colSpan="4" className="p-10 text-center text-gray-400 font-bold">No suspicious or critical actions logged yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
