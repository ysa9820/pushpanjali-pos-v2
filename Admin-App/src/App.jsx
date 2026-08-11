import React, { useState, useEffect, useRef } from 'react';

const ALL_BLOCKS = [
  { id: 'HEADER_LOGO', label: 'Firm Logo (Image)', type: 'image', preview: '[ 🖼️ FIRM LOGO ]' },
  { id: 'HEADER_SHOPNAME', label: 'Shop Name', type: 'text', preview: 'PUSHPANJALI FASHION' },
  { id: 'HEADER_TAGLINE', label: 'Tagline', type: 'text', preview: 'Exclusive Menswear & Sarees' },
  { id: 'HEADER_ADDRESS_1', label: 'Address Line 1', type: 'text', preview: 'Shop No 12, Main Market' },
  { id: 'HEADER_ADDRESS_2', label: 'Address Line 2', type: 'text', preview: 'Risod, Maharashtra' },
  { id: 'HEADER_PHONE_EMAIL', label: 'Phone & Email', type: 'text', preview: 'Ph: 9876543210 | test@test.com' },
  { id: 'HEADER_GSTIN', label: 'GSTIN Number', type: 'text', preview: 'GSTIN: 27AABC1234D1Z5' },
  { id: 'DIVIDER_DASHED', label: 'Dashed Line (---)', type: 'line', preview: '----------------------------------------' },
  { id: 'DIVIDER_SOLID', label: 'Solid Line (===)', type: 'line', preview: '========================================' },
  { id: 'BLANK_LINE', label: 'Empty Blank Line', type: 'line', preview: '[ BLANK LINE ]' },
  { id: 'BILL_INFO', label: 'Bill No & Date', type: 'data', preview: 'Bill: #INV-1234   Date: 25/10/23' },
  { id: 'CASHIER_INFO', label: 'Cashier & Time', type: 'data', preview: 'Cashier: Admin    Time: 14:30' },
  { id: 'CUSTOMER_INFO', label: 'Customer Name & Ph', type: 'data', preview: 'Customer: Rahul (9876543210)' },
  { id: 'KHATA_BALANCE', label: 'Old Khata Balance', type: 'data', preview: 'Previous Dues: Rs. 1500' },
  { id: 'ITEM_TABLE', label: 'Itemized Table', type: 'table', preview: 'Item         Qty    Rate    Total\nShirt (M)     2      500     1000' },
  { id: 'TAX_BREAKDOWN', label: 'Tax/GST Breakdown', type: 'table', preview: 'CGST (2.5%): 25 | SGST (2.5%): 25' },
  { id: 'TOTAL_SAVINGS', label: 'Total Savings Banner', type: 'data', preview: '** YOU SAVED RS. 150 TODAY! **' },
  { id: 'BLANK_SPACE_DYNAMIC', label: 'Middle Padding (Push to Bottom)', type: 'system', preview: '[ Dynamic Blank Space to make 5-Inch Bill ]' },
  { id: 'TOTAL_AMOUNT', label: 'Net Total & Qty', type: 'data', preview: 'NET TOTAL (2 Qty)        Rs. 1000' },
  { id: 'PAYMENT_METHOD', label: 'Payment Mode', type: 'data', preview: 'Payment Method: CASH' },
  { id: 'TERMS_CONDITIONS', label: 'Terms & Conditions', type: 'text', preview: 'T&C: No return without original bill.' },
  { id: 'FOOTER_MESSAGE', label: 'Thank You Message', type: 'text', preview: 'Thank you for shopping! Visit Again.' },
  { id: 'UPI_QR', label: 'UPI Payment QR Code', type: 'image', preview: '[ 📱 SCANNABLE UPI QR CODE ]' }
];

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));
  
  const [activeTab, setActiveTab] = useState('DASHBOARD'); 
  const [subTab, setSubTab] = useState('SUPPLIER'); 

  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', gstin: '', upiId: '', logoBase64: '', billFooterMsg: '', defaultGstRate: 5, minReceiptLines: 32, receiptLayout: [] });
  const [users, setUsers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [logs, setLogs] = useState([]);

  // REPORT FILTERS
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterCashier, setFilterCashier] = useState('ALL');
  const [filterMethod, setFilterMethod] = useState('ALL');

  // FORMS
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'cashier', permissions: { canViewOldBills: false, canDiscount: false, canEditCart: true } });
  const [newSalesman, setNewSalesman] = useState({ name: '', commissionRate: '' });
  
  // MODALS
  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });
  const [appConfirm, setAppConfirm] = useState({ show: false, msg: '', onYes: null });
  const [editingBlockIndex, setEditingBlockIndex] = useState(null);
  const [passbookCustomer, setPassbookCustomer] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);

  const dragItem = useRef();
  const dragOverItem = useRef();

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
      setSettings(await setRes.json());
      setUsers(await usrRes.json()); setSalesmen(await smRes.json());
      setSales(await salRes.json()); setInventory(await invRes.json());
      setCustomers(await cusRes.json()); setLogs(await logRes.json());
    } catch (e) { console.error("Server Connection Error"); }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(`http://${serverIP}:5000/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      safeAlert("✅ Settings & Receipt Layout Saved!"); fetchData();
    } catch (e) { safeAlert("Error saving."); }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setSettings({ ...settings, logoBase64: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.pin) return safeAlert("Name & PIN required.");
    await fetch(`http://${serverIP}:5000/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
    setNewUser({ name: '', pin: '', role: 'cashier', permissions: { canViewOldBills: false, canDiscount: false, canEditCart: true } }); 
    fetchData(); safeAlert("User Added.");
  };

  const deleteUser = async (id) => { await fetch(`http://${serverIP}:5000/api/users/${id}`, { method: 'DELETE' }); fetchData(); };
  
  const handleAddSalesman = async () => {
    if (!newSalesman.name) return safeAlert("Salesman name required.");
    await fetch(`http://${serverIP}:5000/api/salesmen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSalesman) });
    setNewSalesman({ name: '', commissionRate: '' }); fetchData(); safeAlert("Salesman Added.");
  };

  const deleteSalesman = async (id) => { await fetch(`http://${serverIP}:5000/api/salesmen/${id}`, { method: 'DELETE' }); fetchData(); };
  const handleClearLogs = async () => { await fetch(`http://${serverIP}:5000/api/logs`, { method: 'DELETE' }); fetchData(); safeAlert("Audit Logs Wiped."); };

  const handleVoidInvoice = async (invoiceNo) => {
    try {
      const res = await fetch(`http://${serverIP}:5000/api/sales/${invoiceNo}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminName: 'Master Admin' }) });
      if ((await res.json()).success) { safeAlert(`✅ Bill ${invoiceNo} Voided. Stock restored.`); fetchData(); }
    } catch(e) { safeAlert("Error voiding bill."); }
  };

  const saveEditedInvoice = async () => {
    if(!editingInvoice) return;
    const subT = editingInvoice.items.reduce((s, i) => s + (parseFloat(i.price) * parseInt(i.qty)), 0);
    const disc = parseFloat(editingInvoice.discount || 0);
    const taxAmt = parseFloat(editingInvoice.taxAmount || 0);
    const totalAmt = subT - disc + taxAmt;

    try {
      const res = await fetch(`http://${serverIP}:5000/api/sales/${editingInvoice.invoice}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: editingInvoice.items, subTotal: subT, discount: disc, taxAmount: taxAmt, totalAmount: totalAmt, paymentMethod: editingInvoice.method, customerName: editingInvoice.customerName, customerMobile: editingInvoice.customerMobile, adminName: 'Master Admin' })
      });
      if ((await res.json()).success) { safeAlert(`✅ Bill Edited Successfully!`); setEditingInvoice(null); fetchData(); }
    } catch(e) { safeAlert("Error saving edit."); }
  };

  // DRAG & DROP
  const handleDragStart = (e, index) => { dragItem.current = index; };
  const handleDragEnter = (e, index) => { dragOverItem.current = index; e.preventDefault(); };
  const handleDrop = () => {
    const copyLayout = [...settings.receiptLayout];
    const draggedItem = copyLayout[dragItem.current];
    copyLayout.splice(dragItem.current, 1);
    copyLayout.splice(dragOverItem.current, 0, draggedItem);
    dragItem.current = null; dragOverItem.current = null;
    setSettings({...settings, receiptLayout: copyLayout});
  };
  const addBlockToLayout = (blockId) => { setSettings({...settings, receiptLayout: [...settings.receiptLayout, { id: blockId, props: { align: 'left', size: 'normal', bold: false } }]}); };
  const removeBlockFromLayout = (index) => { const copy = [...settings.receiptLayout]; copy.splice(index, 1); setSettings({...settings, receiptLayout: copy}); };
  const updateBlockProps = (prop, value) => {
    const copy = [...settings.receiptLayout];
    copy[editingBlockIndex].props[prop] = value;
    setSettings({...settings, receiptLayout: copy});
  };

  // EXCEL / CSV EXPORT
  const exportCSV = (filename, rows) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", filename);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };
  
  const exportSales = () => {
    const rows = [["Invoice No", "Date", "Time", "Customer", "Mobile", "Method", "SubTotal", "Discount", "CGST", "SGST", "Net Total", "Cashier"]];
    filteredSales.forEach(s => rows.push([s.invoice, s.date, s.time, s.customerName||'Walk-in', s.customerMobile||'N/A', s.method, s.subTotal||s.amount, s.discount||0, s.cgst||0, s.sgst||0, s.amount, s.cashier]));
    exportCSV("Sales_Tax_Report.csv", rows);
  };

  const exportPassbook = () => {
    if (!passbookCustomer) return;
    const rows = [["Date", "Time", "Transaction Type", "Invoice", "Debit (Sale)", "Credit (Paid)", "Running Balance"]];
    passbookCustomer.history.forEach(h => rows.push([h.date, h.time, h.type, h.invoice||'-', h.type.includes('SALE')||h.type==='EDIT_APPLIED'?h.amount:'', h.type.includes('PAYMENT')||h.type.includes('REVERSAL')?Math.abs(h.amount):'', h.newBalance]));
    exportCSV(`${passbookCustomer.name}_Ledger_Statement.csv`, rows);
  };

  // REPORT FILTERING ENGINE
  const filteredSales = sales.filter(s => {
    let matches = true;
    if (filterCashier !== 'ALL' && s.cashier !== filterCashier) matches = false;
    if (filterMethod !== 'ALL' && s.method !== filterMethod) matches = false;
    if (fromDate && new Date(s.date) < new Date(fromDate)) matches = false;
    if (toDate && new Date(s.date) > new Date(toDate)) matches = false;
    return matches;
  });

  const totalStockValuation = inventory.reduce((sum, item) => sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.qty || 0)), 0);
  const totalSalesValuation = filteredSales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
  const todaySalesValuation = sales.filter(s => s.date === new Date().toLocaleDateString()).reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

  const supplierStats = {};
  inventory.forEach(item => { const sup = item.supplierName || 'Unassigned'; if(!supplierStats[sup]) supplierStats[sup] = { remainingQty: 0, remainingValue: 0, soldQty: 0, salesValue: 0 }; supplierStats[sup].remainingQty += parseInt(item.qty || 0); supplierStats[sup].remainingValue += (parseInt(item.qty || 0) * parseFloat(item.purchasePrice || 0)); });
  filteredSales.forEach(sale => { sale.items.forEach(item => { const invItem = inventory.find(i => i.barcode === item.barcode); const sup = invItem?.supplierName || 'Unassigned'; if(!supplierStats[sup]) supplierStats[sup] = { remainingQty: 0, remainingValue: 0, soldQty: 0, salesValue: 0 }; supplierStats[sup].soldQty += parseInt(item.qty || 0); supplierStats[sup].salesValue += parseFloat(item.total || 0); }); });
  
  const salesmanStats = {};
  filteredSales.forEach(sale => { sale.items.forEach(item => { const smName = item.salesmanName || 'Unassigned'; if(!salesmanStats[smName]) salesmanStats[smName] = { totalSales: 0, commission: 0 }; salesmanStats[smName].totalSales += parseFloat(item.total || 0); const smData = salesmen.find(s => s.name === smName); const rate = smData ? parseFloat(smData.commissionRate || 0) : 0; salesmanStats[smName].commission += (parseFloat(item.total || 0) * rate) / 100; }); });

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
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans overflow-hidden relative">
      
      {appAlert.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p><button onClick={() => setAppAlert({show:false, msg:''})} className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button></div></div> )}
      {appConfirm.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-yellow-500"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appConfirm.msg}</p><div className="flex justify-center gap-4"><button onClick={() => setAppConfirm({show:false, msg:'', onYes:null})} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded hover:bg-gray-400">Cancel</button><button onClick={() => { appConfirm.onYes(); setAppConfirm({show:false, msg:'', onYes:null}); }} className="bg-red-600 text-white font-bold py-2 px-6 rounded hover:bg-red-700">Yes, Proceed</button></div></div></div> )}

      {/* BLOCK PROPERTIES MODAL */}
      {editingBlockIndex !== null && settings.receiptLayout[editingBlockIndex] && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[50] p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px]">
            <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">⚙️ Block Properties</h2>
            <div className="text-sm text-gray-500 mb-4 uppercase font-bold tracking-wider">{ALL_BLOCKS.find(b=>b.id === settings.receiptLayout[editingBlockIndex].id)?.label}</div>
            <div className="space-y-4">
              <div>
                <label className="font-bold text-gray-700 text-sm block mb-1">Alignment</label>
                <select value={settings.receiptLayout[editingBlockIndex].props?.align || 'left'} onChange={e => updateBlockProps('align', e.target.value)} className="w-full border p-2 rounded outline-none font-bold">
                  <option value="left">Align Left</option><option value="center">Align Center</option><option value="right">Align Right</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-gray-700 text-sm block mb-1">Text Size</label>
                <select value={settings.receiptLayout[editingBlockIndex].props?.size || 'normal'} onChange={e => updateBlockProps('size', e.target.value)} className="w-full border p-2 rounded outline-none font-bold">
                  <option value="normal">Normal Text</option><option value="double">Double Size (Large)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 font-bold text-gray-700 cursor-pointer">
                <input type="checkbox" checked={settings.receiptLayout[editingBlockIndex].props?.bold || false} onChange={e => updateBlockProps('bold', e.target.checked)} className="w-4 h-4" />
                Make Text BOLD
              </label>

              {settings.receiptLayout[editingBlockIndex].id === 'ITEM_TABLE' && (
                <div className="bg-blue-50 p-3 rounded border border-blue-200 mt-4 space-y-2">
                  <label className="font-bold text-blue-900 text-sm block border-b border-blue-200 pb-1">Table Columns Config</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.receiptLayout[editingBlockIndex].props?.showSrNo || false} onChange={e => updateBlockProps('showSrNo', e.target.checked)} /> Show Sr No.</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.receiptLayout[editingBlockIndex].props?.showBarcode !== false} onChange={e => updateBlockProps('showBarcode', e.target.checked)} /> Show Barcode below Name</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={settings.receiptLayout[editingBlockIndex].props?.showSize !== false} onChange={e => updateBlockProps('showSize', e.target.checked)} /> Show Size</label>
                </div>
              )}
            </div>
            <button onClick={() => setEditingBlockIndex(null)} className="mt-6 w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Done</button>
          </div>
        </div>
      )}

      {/* EDIT INVOICE MODAL */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col h-[85vh]">
            <div className="bg-blue-900 text-white p-4 flex justify-between items-center rounded-t-xl">
              <h2 className="text-xl font-black">✏️ Edit Invoice: {editingInvoice.invoice}</h2>
              <button onClick={() => setEditingInvoice(null)} className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded font-bold">Cancel</button>
            </div>
            <div className="p-4 flex gap-4 bg-gray-100 border-b">
              <div><label className="text-xs font-bold text-gray-500 block">Customer Mobile</label><input type="text" value={editingInvoice.customerMobile} onChange={e=>setEditingInvoice({...editingInvoice, customerMobile: e.target.value})} className="border p-2 rounded font-bold" /></div>
              <div><label className="text-xs font-bold text-gray-500 block">Payment Mode</label><select value={editingInvoice.method} onChange={e=>setEditingInvoice({...editingInvoice, method: e.target.value})} className="border p-2 rounded font-bold"><option>CASH</option><option>UPI</option><option>CREDIT</option></select></div>
              <div><label className="text-xs font-bold text-gray-500 block">Discount (Rs.)</label><input type="number" value={editingInvoice.discount||0} onChange={e=>setEditingInvoice({...editingInvoice, discount: parseFloat(e.target.value)||0})} className="border p-2 rounded font-bold w-28" /></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left text-sm border"><thead className="bg-gray-100 border-b"><tr><th className="p-2">Item Name</th><th className="p-2 w-24 text-center">Qty</th><th className="p-2 w-28">Rate</th><th className="p-2 w-12 text-center">Del</th></tr></thead>
                <tbody>
                  {editingInvoice.items.map((c, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2 font-bold">{c.name}</td>
                      <td className="p-2 text-center"><input type="number" value={c.qty} onChange={e => { const copy=[...editingInvoice.items]; copy[i].qty=parseInt(e.target.value)||0; setEditingInvoice({...editingInvoice, items:copy}); }} className="w-16 border text-center font-bold p-1 rounded" /></td>
                      <td className="p-2"><input type="number" value={c.price} onChange={e => { const copy=[...editingInvoice.items]; copy[i].price=parseFloat(e.target.value)||0; setEditingInvoice({...editingInvoice, items:copy}); }} className="w-20 border text-right font-bold p-1 rounded" /></td>
                      <td className="p-2 text-center"><button onClick={() => { const copy=[...editingInvoice.items]; copy.splice(i,1); setEditingInvoice({...editingInvoice, items:copy}); }} className="bg-red-500 text-white w-6 h-6 rounded-full font-bold text-xs">X</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-between items-center rounded-b-xl">
              <div className="font-black text-2xl text-blue-900">New Total: ₹{editingInvoice.items.reduce((s,i)=>s+(i.price*i.qty),0) - (editingInvoice.discount||0)}</div>
              <button onClick={() => setAppConfirm({show: true, msg: "Save changes? Reverses old inventory and adjusts customer ledger.", onYes: saveEditedInvoice})} className="bg-green-600 text-white px-8 py-3 rounded-lg font-black text-lg shadow-lg hover:bg-green-700">Apply Edit to Server</button>
            </div>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION */}
      <div className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <h1 className="text-xl font-black tracking-wide">👑 Master Admin Dashboard</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DASHBOARD' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📊 Dashboard</button>
          <button onClick={() => { setActiveTab('ANALYTICS'); setSubTab('SUPPLIER'); }} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'ANALYTICS' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📈 Analytics & Export</button>
          <button onClick={() => { setActiveTab('LEDGERS'); setSubTab('INVOICES'); }} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'LEDGERS' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>🧾 Bills & Khata</button>
          <button onClick={() => setActiveTab('DESIGNER')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DESIGNER' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📝 Designer</button>
          <button onClick={() => setActiveTab('STAFF')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'STAFF' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>👥 Staff & Salesmen</button>
          <button onClick={() => setActiveTab('FIRM')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'FIRM' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>⚙️ Settings & Logs</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        
        {/* --- 1. DASHBOARD --- */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-6 mt-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-blue-500"><h3 className="text-gray-500 font-bold text-sm uppercase">Lifetime Sales Revenue</h3><div className="text-4xl font-black text-gray-800 mt-2">₹{sales.reduce((a,b)=>a+parseFloat(b.amount||0),0).toLocaleString('en-IN')}</div></div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-green-500"><h3 className="text-gray-500 font-bold text-sm uppercase">Today's Total Sales</h3><div className="text-4xl font-black text-gray-800 mt-2">₹{todaySalesValuation.toLocaleString('en-IN')}</div></div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-purple-500 flex flex-col justify-center items-center cursor-pointer hover:bg-gray-50" onClick={() => fetchData()}><span className="text-4xl mb-2">🔄</span><span className="font-bold text-gray-700">Sync Master Server</span></div>
            </div>

            {/* RESTORED: RECENT SALES TABLE */}
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-4">
              <div className="bg-gray-100 p-4 border-b font-bold text-gray-700 text-lg">📝 Recent Sales History</div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr><th className="p-3">Invoice No</th><th className="p-3">Date</th><th className="p-3">Cashier</th><th className="p-3">Customer</th><th className="p-3">Payment</th><th className="p-3 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {sales.slice().reverse().slice(0, 15).map((s, i) => (
                    <tr key={i} className="border-b hover:bg-blue-50">
                      <td className="p-3 font-bold text-blue-700">{s.invoice} {s.isEdited && <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded ml-1">EDITED</span>}</td>
                      <td className="p-3">{s.date} {s.time}</td>
                      <td className="p-3 font-bold">{s.cashier}</td>
                      <td className="p-3">{s.customerName || 'Walk-in'} <span className="text-xs text-gray-500 block">{s.customerMobile}</span></td>
                      <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${s.method === 'CASH' ? 'bg-green-100 text-green-800' : s.method === 'UPI' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>{s.method}</span></td>
                      <td className="p-3 text-right font-bold text-lg">₹{parseFloat(s.amount).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {sales.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-gray-400 font-bold">No sales recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* --- 2. ANALYTICS, EXPORTS & FILTERS --- */}
        {activeTab === 'ANALYTICS' && (
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
            
            {/* DATA FILTERS CONTROL BAR */}
            <div className="bg-gray-800 text-white p-4 flex gap-4 items-center flex-wrap">
              <div><label className="text-xs font-bold text-gray-300 block">From Date</label><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="bg-gray-700 text-white p-1 rounded font-bold text-sm outline-none" /></div>
              <div><label className="text-xs font-bold text-gray-300 block">To Date</label><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="bg-gray-700 text-white p-1 rounded font-bold text-sm outline-none" /></div>
              <div><label className="text-xs font-bold text-gray-300 block">Filter Cashier</label>
                <select value={filterCashier} onChange={e=>setFilterCashier(e.target.value)} className="bg-gray-700 text-white p-1 rounded font-bold text-sm outline-none">
                  <option value="ALL">All Cashiers</option>{users.map(u=><option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-bold text-gray-300 block">Filter Payment</label>
                <select value={filterMethod} onChange={e=>setFilterMethod(e.target.value)} className="bg-gray-700 text-white p-1 rounded font-bold text-sm outline-none">
                  <option value="ALL">All Payment Methods</option><option value="CASH">CASH</option><option value="UPI">UPI</option><option value="CREDIT">CREDIT (Udhaar)</option>
                </select>
              </div>
              <button onClick={() => { setFromDate(''); setToDate(''); setFilterCashier('ALL'); setFilterMethod('ALL'); }} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold mt-4">Clear Filters</button>
            </div>

            <div className="bg-gray-100 p-4 border-b flex justify-between items-center">
              <div className="flex gap-4">
                <button onClick={() => setSubTab('SUPPLIER')} className={`px-6 py-2 font-bold rounded ${subTab === 'SUPPLIER' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>📦 Supplier Analytics</button>
                <button onClick={() => setSubTab('SALESMAN')} className={`px-6 py-2 font-bold rounded ${subTab === 'SALESMAN' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>👔 Salesman Commissions</button>
              </div>
              <button onClick={exportSales} className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded shadow text-sm">📄 Export Sales Tax CSV</button>
            </div>
            
            {subTab === 'SUPPLIER' && (
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b"><tr><th className="p-4">Supplier Name</th><th className="p-4 text-center">Remaining Stock (Qty)</th><th className="p-4 text-right">Dead Stock Value</th><th className="p-4 text-center">Total Sold (Qty)</th><th className="p-4 text-right">Generated Revenue</th></tr></thead>
                <tbody>
                  {Object.keys(supplierStats).map((sup, i) => (
                    <tr key={i} className="border-b hover:bg-yellow-50">
                      <td className="p-4 font-black text-gray-800">{sup}</td><td className="p-4 text-center font-bold text-gray-500">{supplierStats[sup].remainingQty} Pcs</td><td className="p-4 text-right font-black text-red-600">₹{supplierStats[sup].remainingValue.toLocaleString('en-IN')}</td>
                      <td className="p-4 text-center font-bold text-gray-500">{supplierStats[sup].soldQty} Pcs</td><td className="p-4 text-right font-black text-green-600 text-lg">₹{supplierStats[sup].salesValue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {subTab === 'SALESMAN' && (
              <table className="w-full text-left"><thead className="bg-gray-50 border-b"><tr><th className="p-4">Salesman Name</th><th className="p-4 text-right">Total Sold (Value)</th><th className="p-4 text-right">Commission Earned</th></tr></thead>
                <tbody>{Object.keys(salesmanStats).map((sm, i) => (<tr key={i} className="border-b hover:bg-blue-50"><td className="p-4 font-black text-gray-800">{sm}</td><td className="p-4 text-right font-bold text-gray-600 text-lg">₹{salesmanStats[sm].totalSales.toLocaleString('en-IN')}</td><td className="p-4 text-right font-black text-green-700 text-xl">₹{salesmanStats[sm].commission.toLocaleString('en-IN')}</td></tr>))}</tbody>
              </table>
            )}
          </div>
        )}

        {/* --- 3. LEDGERS, EDIT/VOID BILLS & KHATA PASSBOOKS --- */}
        {activeTab === 'LEDGERS' && (
          <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
            <div className="bg-gray-100 p-4 border-b flex gap-4">
              <button onClick={() => { setSubTab('INVOICES'); setPassbookCustomer(null); }} className={`px-6 py-2 font-bold rounded ${subTab === 'INVOICES' ? 'bg-red-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>🛑 Edit/Void Invoices</button>
              <button onClick={() => setSubTab('KHATA')} className={`px-6 py-2 font-bold rounded ${subTab === 'KHATA' ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border text-gray-700 hover:bg-gray-50'}`}>📒 Customer Khata Passbooks</button>
            </div>
            
            {subTab === 'INVOICES' && (
              <table className="w-full text-left text-sm"><thead className="bg-gray-50 border-b"><tr><th className="p-3">Invoice No</th><th className="p-3">Date/Time</th><th className="p-3">Customer</th><th className="p-3">Method</th><th className="p-3 text-right">Amount</th><th className="p-3 text-center">Admin Action</th></tr></thead>
                <tbody>
                  {filteredSales.slice().reverse().map((s, i) => (
                    <tr key={i} className="border-b hover:bg-red-50">
                      <td className="p-3 font-bold text-blue-700">{s.invoice} {s.isEdited && <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded ml-1">EDITED</span>}</td>
                      <td className="p-3">{s.date} {s.time}</td><td className="p-3">{s.customerName || 'Walk-in'}</td><td className="p-3 font-bold">{s.method}</td><td className="p-3 text-right font-bold text-base">₹{s.amount}</td>
                      <td className="p-3 text-center flex justify-center gap-2">
                        <button onClick={() => setEditingInvoice(s)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-bold text-xs shadow">EDIT</button>
                        <button onClick={() => setAppConfirm({ show: true, msg: `DANGER: Void Bill ${s.invoice}?\n\nThis will permanently delete this sale, restore inventory stock, and reverse Udhaar.`, onYes: () => handleVoidInvoice(s.invoice) })} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded font-bold text-xs shadow">VOID</button>
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
                    <div key={c.id} onClick={() => setPassbookCustomer(c)} className={`p-3 border rounded cursor-pointer transition-all ${passbookCustomer?.id === c.id ? 'bg-blue-100 border-blue-500 shadow' : 'bg-white hover:border-gray-400'}`}>
                      <div className="flex justify-between items-center"><span className="font-bold text-lg">{c.name}</span><span className={`font-black ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{c.balance}</span></div>
                      <div className="text-xs text-gray-500">{c.mobile}</div>
                    </div>
                  ))}
                </div>
                <div className="w-2/3 bg-white p-0 flex flex-col">
                  {passbookCustomer ? (
                    <>
                      <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
                        <div><div className="text-xl font-black">{passbookCustomer.name} (Statement)</div><div className="text-sm font-bold text-gray-300">{passbookCustomer.mobile}</div></div>
                        <div className="flex items-center gap-4">
                          <button onClick={exportPassbook} className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded text-xs shadow">Export Statement CSV</button>
                          <div className="text-right"><div className="text-xs font-bold text-gray-400">Total Outstanding</div><div className={`text-2xl font-black ${passbookCustomer.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>₹{passbookCustomer.balance}</div></div>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm"><thead className="bg-gray-100 border-b sticky top-0"><tr><th className="p-3 w-1/4">Date</th><th className="p-3 w-1/4">Particulars</th><th className="p-3 text-right">Debit (Sale)</th><th className="p-3 text-right">Credit (Paid)</th><th className="p-3 text-right">Running Bal</th></tr></thead>
                          <tbody>
                            {passbookCustomer.history.map((h, i) => (
                              <tr key={i} className="border-b hover:bg-gray-50">
                                <td className="p-3 text-xs font-bold text-gray-600">{h.date} {h.time}</td>
                                <td className="p-3 font-bold text-xs">{h.type.includes('SALE') ? `Bill: ${h.invoice}` : h.type === 'PAYMENT_RECEIVED' ? `Paid via ${h.method}` : h.type}</td>
                                <td className="p-3 text-right font-black text-red-600">{h.type.includes('SALE') || h.type === 'EDIT_APPLIED' ? h.amount : ''}</td>
                                <td className="p-3 text-right font-black text-green-600">{h.type.includes('PAYMENT') || h.type === 'VOID_REVERSAL' || h.type === 'EDIT_REVERSAL' ? Math.abs(h.amount) : ''}</td>
                                <td className="p-3 text-right font-bold bg-gray-50 border-l">{h.newBalance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (<div className="flex-1 flex items-center justify-center text-gray-400 font-bold">Select a customer account from the left to view full passbook statement.</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- 4. RECEIPT DESIGNER --- */}
        {activeTab === 'DESIGNER' && (
          <div className="max-w-6xl mx-auto h-full flex flex-col mt-4">
            <div className="bg-white p-4 border-b rounded-t-xl flex justify-between items-center shadow-sm">
              <div><h2 className="text-xl font-black text-gray-800">📝 Receipt Layout Engine</h2><p className="text-xs text-gray-500 font-bold">Drag, drop, and click the ⚙️ gear icon to customize blocks.</p></div>
              <div className="flex items-center gap-4">
                <div className="text-right"><label className="text-xs font-bold text-gray-600 block">Min Receipt Lines</label><input type="number" value={settings.minReceiptLines} onChange={e => setSettings({...settings, minReceiptLines: parseInt(e.target.value)||0})} className="border-2 border-gray-300 w-24 text-center rounded font-bold text-lg outline-none" /></div>
                <button onClick={handleSaveSettings} className="bg-green-600 text-white px-8 py-2 rounded-lg font-black shadow hover:bg-green-700 text-lg">💾 Save Layout Sync</button>
              </div>
            </div>
            <div className="flex flex-1 gap-6 mt-4 overflow-hidden pb-4">
              <div className="w-1/3 bg-white rounded-xl shadow-sm border p-4 flex flex-col h-[600px] overflow-hidden">
                <h3 className="font-bold text-gray-700 border-b pb-2 mb-3">➕ Available Blocks</h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  {ALL_BLOCKS.map(block => {
                    const isUsed = settings.receiptLayout.find(b => b.id === block.id);
                    return (
                      <div key={block.id} className={`p-3 rounded border-2 transition-all ${isUsed ? 'bg-gray-100 border-gray-200 opacity-50' : 'bg-white border-blue-200 hover:border-blue-500 cursor-pointer shadow-sm'}`} onClick={() => !isUsed && addBlockToLayout(block.id)}>
                        <div className="flex justify-between items-center"><span className="font-bold text-gray-800 text-sm">{block.label}</span>{!isUsed && <span className="text-blue-500 font-black">+</span>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 flex justify-center h-[600px] overflow-y-auto">
                <div className="bg-white shadow-2xl border-4 border-gray-300 w-[400px] min-h-full p-6 pb-20 relative">
                  <div className="absolute top-0 left-0 bg-gray-800 text-white text-[10px] px-2 py-1 font-bold rounded-br">104mm (4-Inch) Preview</div>
                  <div className="mt-6">
                    {settings.receiptLayout.map((layoutBlock, index) => {
                      const blockData = ALL_BLOCKS.find(b => b.id === layoutBlock.id);
                      if (!blockData) return null;
                      return (
                        <div key={index} draggable onDragStart={(e) => handleDragStart(e, index)} onDragEnter={(e) => handleDragEnter(e, index)} onDragEnd={handleDrop} onDragOver={(e) => e.preventDefault()} className={`relative group border-2 border-transparent hover:border-blue-400 hover:bg-blue-50 p-2 mb-1 cursor-grab transition-all ${blockData.id === 'BLANK_SPACE_DYNAMIC' ? 'bg-yellow-50 border-yellow-300 border-dashed py-6' : ''}`}>
                          <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditingBlockIndex(index)} className="bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shadow">⚙️</button>
                            <button onClick={() => removeBlockFromLayout(index)} className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold text-xs shadow">X</button>
                          </div>
                          <div className={`font-mono text-black whitespace-pre-wrap ${layoutBlock.props?.bold ? 'font-black' : ''} ${layoutBlock.props?.align === 'center' ? 'text-center' : layoutBlock.props?.align === 'right' ? 'text-right' : 'text-left'} ${layoutBlock.props?.size === 'double' ? 'text-2xl' : 'text-sm'}`}>{blockData.preview}</div>
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
          <div className="max-w-6xl mx-auto flex flex-col gap-6 mt-4">
            
            {/* System Logins & Granular Permissions */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">🖥️ System Logins & Granular Permissions</h2>
              <div className="flex gap-4 mb-4 border bg-gray-50 p-4 rounded-lg">
                <div className="flex flex-col gap-2 w-1/3">
                  <input type="text" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} placeholder="Name" className="border-2 p-2 rounded font-bold outline-none" />
                  <input type="password" maxLength="4" value={newUser.pin} onChange={e=>setNewUser({...newUser, pin: e.target.value.replace(/\D/g, '')})} placeholder="4-Digit PIN" className="border-2 p-2 rounded font-bold text-center tracking-widest outline-none" />
                  <select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="border-2 p-2 rounded font-bold outline-none"><option value="cashier">Cashier</option><option value="admin">Master Admin</option></select>
                </div>
                <div className="flex flex-col gap-2 w-1/3 border-l pl-4">
                  <label className="font-bold text-gray-700 text-sm">Cashier POS Permissions</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={newUser.permissions.canViewOldBills} onChange={e=>setNewUser({...newUser, permissions: {...newUser.permissions, canViewOldBills: e.target.checked}})} /> Can view old bills / passbooks</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={newUser.permissions.canDiscount} onChange={e=>setNewUser({...newUser, permissions: {...newUser.permissions, canDiscount: e.target.checked}})} /> Can give discounts</label>
                  <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={newUser.permissions.canEditCart} onChange={e=>setNewUser({...newUser, permissions: {...newUser.permissions, canEditCart: e.target.checked}})} /> Can delete items from cart</label>
                </div>
                <div className="w-1/3 flex items-center justify-center border-l"><button onClick={handleAddUser} className="bg-blue-600 text-white font-black text-lg py-4 px-8 rounded-xl shadow-md hover:bg-blue-700">Create Staff</button></div>
              </div>
              <table className="w-full text-left text-sm"><thead className="bg-gray-100 border-b"><tr><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Permissions</th><th className="p-3 text-right">Action</th></tr></thead>
                <tbody>{users.map(u => (<tr key={u.id} className="border-b hover:bg-gray-50"><td className="p-3 font-bold">{u.name}</td><td className="p-3 uppercase font-bold text-xs">{u.role}</td><td className="p-3 text-xs text-gray-600">{u.permissions?.canViewOldBills?'[Passbooks] ':''}{u.permissions?.canDiscount?'[Discount] ':''}{u.permissions?.canEditCart?'[Cart Edit]':''}</td><td className="p-3 text-right">{u.id !== 1 && <button onClick={() => deleteUser(u.id)} className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold">Revoke Access</button>}</td></tr>))}</tbody>
              </table>
            </div>

            {/* RESTORED: FLOOR SALESMEN MANAGEMENT */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">👔 Floor Salesmen (For Commission Tracking)</h2>
              <div className="flex gap-4 mb-4 border bg-gray-50 p-4 rounded-lg">
                <input type="text" value={newSalesman.name} onChange={e=>setNewSalesman({...newSalesman, name: e.target.value})} placeholder="Salesman Name (e.g. Rahul)" className="border-2 p-2 rounded font-bold flex-1 outline-none" />
                <input type="number" value={newSalesman.commissionRate} onChange={e=>setNewSalesman({...newSalesman, commissionRate: e.target.value})} placeholder="Commission Rate (%)" className="border-2 p-2 rounded font-bold w-48 text-center outline-none" />
                <button onClick={handleAddSalesman} className="bg-green-600 text-white font-bold px-6 py-2 rounded-lg shadow hover:bg-green-700">Add Salesman</button>
              </div>
              <table className="w-full text-left text-sm"><thead className="bg-gray-100 border-b"><tr><th className="p-3">Salesman Name</th><th className="p-3">Commission Rate</th><th className="p-3 text-right">Action</th></tr></thead>
                <tbody>{salesmen.map(sm => (<tr key={sm.id} className="border-b hover:bg-gray-50"><td className="p-3 font-bold">{sm.name}</td><td className="p-3 font-black text-green-700">{sm.commissionRate}%</td><td className="p-3 text-right"><button onClick={() => deleteSalesman(sm.id)} className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold">Delete</button></td></tr>))}</tbody>
              </table>
            </div>

          </div>
        )}

        {/* --- 6. FIRM SETTINGS & AUDIT LOGS --- */}
        {activeTab === 'FIRM' && (
          <div className="max-w-6xl mx-auto flex gap-6 mt-4">
            <div className="w-1/3 bg-white rounded-xl shadow-sm border p-6 flex flex-col h-[650px]">
              <div className="flex justify-between items-center border-b pb-3 mb-4"><h2 className="text-xl font-black text-gray-800">🏢 Firm Profile</h2><button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-1.5 rounded font-bold shadow">Save</button></div>
              <div className="flex flex-col gap-3 overflow-y-auto pr-2 text-sm">
                <div><label className="font-bold text-xs text-gray-500">Shop Name</label><input type="text" value={settings.shopName || ''} onChange={e => setSettings({...settings, shopName: e.target.value})} className="w-full border-2 p-2 rounded font-bold" /></div>
                <div><label className="font-bold text-xs text-gray-500">GSTIN Number</label><input type="text" value={settings.gstin || ''} onChange={e => setSettings({...settings, gstin: e.target.value})} className="w-full border-2 p-2 rounded font-bold uppercase" /></div>
                <div><label className="font-bold text-xs text-gray-500">UPI ID (For QR Code)</label><input type="text" value={settings.upiId || ''} onChange={e => setSettings({...settings, upiId: e.target.value})} placeholder="e.g. 9876543210@paytm" className="w-full border-2 p-2 rounded font-bold text-purple-700" /></div>
                <div><label className="font-bold text-xs text-gray-500">Default GST Rate (%)</label><input type="number" value={settings.defaultGstRate || 5} onChange={e => setSettings({...settings, defaultGstRate: parseFloat(e.target.value)||0})} className="w-full border-2 p-2 rounded font-bold text-blue-700" /></div>
                <div><label className="font-bold text-xs text-gray-500">Address</label><textarea value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} rows="2" className="w-full border-2 p-2 rounded font-bold"></textarea></div>
                <div><label className="font-bold text-xs text-gray-500">Phone & Email</label><input type="text" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full border-2 p-2 rounded font-bold" /></div>
                <div><label className="font-bold text-xs text-gray-500">Bill Footer Message</label><input type="text" value={settings.billFooterMsg || ''} onChange={e => setSettings({...settings, billFooterMsg: e.target.value})} className="w-full border-2 p-2 rounded font-bold bg-green-50" /></div>
                <div>
                  <label className="font-bold text-xs text-gray-500 block mb-1">Firm Logo Image</label>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs" />
                  {settings.logoBase64 && <img src={settings.logoBase64} alt="Logo" className="h-12 mt-2 object-contain border" />}
                </div>
              </div>
            </div>
            
            <div className="w-2/3 bg-white rounded-xl shadow-sm border p-6 flex flex-col h-[650px]">
              <div className="flex justify-between items-center border-b pb-3 mb-4"><h2 className="text-xl font-black text-gray-800">🕵️ Security Audit Logs</h2><button onClick={() => setAppConfirm({show: true, msg: "Wipe all audit logs permanently?", onYes: handleClearLogs})} className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded font-bold shadow">Clear All Logs</button></div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-sm"><thead className="bg-gray-50 sticky top-0 border-b"><tr><th className="p-3 w-1/4">Date/Time</th><th className="p-3 w-1/6">User</th><th className="p-3 w-1/6">Action</th><th className="p-3">Details</th></tr></thead>
                  <tbody>
                    {logs.map(log => (<tr key={log.id} className="border-b hover:bg-gray-50"><td className="p-3 text-xs text-gray-500">{log.timestamp}</td><td className="p-3 font-bold">{log.user}</td><td className="p-3 font-black text-red-600 text-xs uppercase">{log.action}</td><td className="p-3 text-gray-700">{log.details}</td></tr>))}
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
