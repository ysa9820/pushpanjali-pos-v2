import React, { useState, useEffect, useRef } from 'react';

// ALL AVAILABLE DATA BLOCKS (The POS Engine will read these exact IDs)
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
  const [activeTab, setActiveTab] = useState('DESIGNER'); 

  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', gstin: '', billFooterMsg: '', minReceiptLines: 32, receiptLayout: [] });
  const [users, setUsers] = useState([]);
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'cashier' });
  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });

  // Drag and Drop Refs
  const dragItem = useRef();
  const dragOverItem = useRef();

  const safeAlert = (msg) => { if (document.activeElement) document.activeElement.blur(); setAppAlert({ show: true, msg }); };

  useEffect(() => { if (serverIP && !isSettingUp) fetchData(); }, [serverIP, isSettingUp]);

  const fetchData = async () => {
    try {
      const setRes = await fetch(`http://${serverIP}:5000/api/settings`);
      const setData = await setRes.json();
      if(!setData.receiptLayout) setData.receiptLayout = ["HEADER_SHOPNAME", "ITEM_TABLE", "TOTAL_AMOUNT"]; // Failsafe
      setSettings(setData);

      fetch(`http://${serverIP}:5000/api/users`).then(res=>res.json()).then(setUsers);
      fetch(`http://${serverIP}:5000/api/sales`).then(res=>res.json()).then(setSales);
      fetch(`http://${serverIP}:5000/api/inventory`).then(res=>res.json()).then(setInventory);
    } catch (e) { console.error("Server not reachable"); }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch(`http://${serverIP}:5000/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      safeAlert("✅ Settings & Receipt Layout Saved!\nAll POS Terminals will instantly update.");
    } catch (e) { safeAlert("Error saving settings."); }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.pin) return safeAlert("Name and PIN required.");
    try {
      await fetch(`http://${serverIP}:5000/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
      setNewUser({ name: '', pin: '', role: 'cashier' }); fetchData(); safeAlert("✅ Staff Member Added!");
    } catch (e) { safeAlert("Error adding staff."); }
  };

  const deleteUser = async (id) => {
    try { await fetch(`http://${serverIP}:5000/api/users/${id}`, { method: 'DELETE' }); fetchData(); } catch (e) {}
  };

  // --- DRAG AND DROP LOGIC ---
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

  const addBlockToLayout = (blockId) => {
    if (!settings.receiptLayout.includes(blockId)) {
      setSettings({...settings, receiptLayout: [...settings.receiptLayout, blockId]});
    }
  };

  const removeBlockFromLayout = (index) => {
    const copy = [...settings.receiptLayout];
    copy.splice(index, 1);
    setSettings({...settings, receiptLayout: copy});
  };

  const totalStockValuation = inventory.reduce((sum, item) => sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.qty || 0)), 0);
  const totalSalesValuation = sales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

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
      
      {appAlert.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600">
            <p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p>
            <button onClick={() => setAppAlert({show: false, msg: ''})} className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button>
          </div>
        </div>
      )}

      <div className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <h1 className="text-xl font-black tracking-wide">👑 Master Admin Panel</h1>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DASHBOARD' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📊 Dashboard</button>
          <button onClick={() => setActiveTab('DESIGNER')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'DESIGNER' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>📝 Receipt Designer</button>
          <button onClick={() => setActiveTab('PROFILE')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'PROFILE' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>🏢 Firm Setup</button>
          <button onClick={() => setActiveTab('STAFF')} className={`px-4 py-1.5 font-bold rounded ${activeTab === 'STAFF' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}>👥 Staff</button>
          <button onClick={() => setIsSettingUp(true)} className="bg-red-600 hover:bg-red-700 px-3 py-1.5 font-bold rounded ml-2">⚙️ IP</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        
        {/* --- RECEIPT DESIGNER TAB --- */}
        {activeTab === 'DESIGNER' && (
          <div className="max-w-6xl mx-auto h-full flex flex-col">
            <div className="bg-white p-4 border-b rounded-t-xl flex justify-between items-center shadow-sm">
              <div>
                <h2 className="text-xl font-black text-gray-800">📝 Receipt Layout Engine</h2>
                <p className="text-xs text-gray-500 font-bold">Drag and drop blocks to configure the POS Printer engine.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <label className="text-xs font-bold text-gray-600 block">Min Receipt Length (Lines)</label>
                  <input type="number" value={settings.minReceiptLines} onChange={e => setSettings({...settings, minReceiptLines: parseInt(e.target.value)||0})} className="border-2 border-gray-300 w-24 text-center rounded font-bold text-lg outline-none focus:border-blue-500" title="Prevents tiny 1-item bills. 32 lines = ~5 inches." />
                </div>
                <button onClick={handleSaveSettings} className="bg-green-600 text-white px-8 py-2 rounded-lg font-black shadow hover:bg-green-700 text-lg">💾 Save Layout Sync</button>
              </div>
            </div>

            <div className="flex flex-1 gap-6 mt-4 overflow-hidden pb-4">
              
              {/* LEFT: TOOLBOX */}
              <div className="w-1/3 bg-white rounded-xl shadow-sm border p-4 flex flex-col h-full overflow-hidden">
                <h3 className="font-bold text-gray-700 border-b pb-2 mb-3">➕ Available Data Blocks</h3>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                  {ALL_BLOCKS.map(block => {
                    const isUsed = settings.receiptLayout.includes(block.id);
                    return (
                      <div key={block.id} className={`p-3 rounded border-2 transition-all ${isUsed ? 'bg-gray-100 border-gray-200 opacity-50' : 'bg-white border-blue-200 hover:border-blue-500 cursor-pointer shadow-sm'}`} onClick={() => !isUsed && addBlockToLayout(block.id)}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-gray-800 text-sm">{block.label}</span>
                          {!isUsed && <span className="text-blue-500 font-black">+</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 uppercase">ID: {block.id}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: THE 4-INCH CANVAS */}
              <div className="flex-1 flex justify-center h-full overflow-y-auto">
                <div className="bg-white shadow-2xl border-4 border-gray-300 w-[400px] min-h-full p-6 pb-20 relative">
                  <div className="absolute top-0 left-0 bg-gray-800 text-white text-[10px] px-2 py-1 font-bold rounded-br">104mm (4-Inch) ESC/POS Simulation Canvas</div>
                  <div className="mt-6">
                    {settings.receiptLayout.map((blockId, index) => {
                      const blockData = ALL_BLOCKS.find(b => b.id === blockId);
                      if (!blockData) return null;
                      
                      return (
                        <div 
                          key={index}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnter={(e) => handleDragEnter(e, index)}
                          onDragEnd={handleDrop}
                          onDragOver={(e) => e.preventDefault()}
                          className={`relative group border-2 border-transparent hover:border-blue-400 hover:bg-blue-50 p-2 mb-1 cursor-grab transition-all ${blockData.id === 'BLANK_SPACE_DYNAMIC' ? 'bg-yellow-50 border-yellow-300 border-dashed py-6' : ''}`}
                        >
                          <button onClick={() => removeBlockFromLayout(index)} className="absolute -right-2 -top-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs opacity-0 group-hover:opacity-100 shadow">X</button>
                          
                          {/* VISUAL REPRESENTATION OF BLOCK */}
                          <div className={`font-mono text-black whitespace-pre-wrap ${blockData.id.includes('SHOPNAME') ? 'text-2xl font-black text-center' : blockData.id.includes('HEADER') || blockData.id.includes('FOOTER') ? 'text-center' : blockData.id.includes('TOTAL') ? 'font-black text-lg' : 'text-sm'}`}>
                            {blockData.preview}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* --- FIRM SETUP TAB --- */}
        {activeTab === 'PROFILE' && (
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden mt-4">
            <div className="bg-gray-100 p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-black text-gray-800">🏢 Firm Global Profile</h2>
              <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold shadow hover:bg-blue-700">💾 Save Firm Details</button>
            </div>
            <div className="p-8 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="font-bold text-gray-700 block mb-2">Shop Name</label><input type="text" value={settings.shopName || ''} onChange={e => setSettings({...settings, shopName: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold text-xl outline-none focus:border-blue-500 bg-blue-50" /></div>
                <div><label className="font-bold text-gray-700 block mb-2">GSTIN Number</label><input type="text" value={settings.gstin || ''} onChange={e => setSettings({...settings, gstin: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold text-xl outline-none focus:border-blue-500 uppercase" /></div>
              </div>
              <div><label className="font-bold text-gray-700 block mb-2">Full Address</label><textarea value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} rows="3" className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500"></textarea></div>
              <div className="grid grid-cols-2 gap-6">
                <div><label className="font-bold text-gray-700 block mb-2">Phone Number(s)</label><input type="text" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500" /></div>
                <div><label className="font-bold text-gray-700 block mb-2">Bill Footer Message</label><input type="text" value={settings.billFooterMsg || ''} onChange={e => setSettings({...settings, billFooterMsg: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500 bg-green-50" /></div>
              </div>
            </div>
          </div>
        )}

        {/* --- STAFF TAB --- */}
        {activeTab === 'STAFF' && (
          <div className="max-w-5xl mx-auto flex gap-6 mt-4">
            <div className="w-1/3 bg-white rounded-xl shadow-sm border p-6 self-start">
              <h2 className="text-lg font-black text-gray-800 border-b pb-4 mb-4">➕ Add Staff</h2>
              <div className="flex flex-col gap-4">
                <div><label className="font-bold text-gray-700 text-sm">Full Name</label><input type="text" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} className="w-full border-2 p-2 rounded outline-none font-bold focus:border-blue-500" /></div>
                <div><label className="font-bold text-gray-700 text-sm">4-Digit PIN</label><input type="password" maxLength="4" value={newUser.pin} onChange={e=>setNewUser({...newUser, pin: e.target.value.replace(/\D/g, '')})} className="w-full border-2 p-2 rounded outline-none font-bold text-xl tracking-widest text-center focus:border-blue-500 bg-yellow-50" /></div>
                <div><label className="font-bold text-gray-700 text-sm">Role</label><select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="w-full border-2 p-2 rounded outline-none font-bold focus:border-blue-500"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></div>
                <button onClick={handleAddUser} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 mt-2">Create Staff Login</button>
              </div>
            </div>
            <div className="flex-1 bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gray-100 p-4 border-b"><h2 className="text-lg font-black text-gray-800">👥 Authorized Logins</h2></div>
              <table className="w-full text-left"><thead className="bg-gray-50 border-b"><tr><th className="p-3">Staff Name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
                <tbody>{users.map(u => (<tr key={u.id} className="border-b"><td className="p-3 font-bold text-gray-800">{u.name}</td><td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{u.role}</span></td><td className="p-3 font-bold text-green-600">Active</td><td className="p-3 text-right">{u.id !== 1 && <button onClick={() => deleteUser(u.id)} className="bg-red-500 text-white px-3 py-1 rounded font-bold text-xs hover:bg-red-600">Revoke</button>}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-6 mt-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-blue-500"><h3 className="text-gray-500 font-bold text-sm uppercase">Lifetime Sales</h3><div className="text-4xl font-black text-gray-800 mt-2">₹{totalSalesValuation.toLocaleString('en-IN')}</div></div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-green-500"><h3 className="text-gray-500 font-bold text-sm uppercase">Current Stock Value</h3><div className="text-4xl font-black text-gray-800 mt-2">₹{totalStockValuation.toLocaleString('en-IN')}</div></div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-purple-500 flex flex-col justify-center items-center cursor-pointer hover:bg-gray-50" onClick={() => fetchData()}><span className="text-4xl mb-2">🔄</span><span className="font-bold text-gray-700">Refresh Data</span></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
