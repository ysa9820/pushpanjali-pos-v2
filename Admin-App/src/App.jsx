import React, { useState, useEffect } from 'react';

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, PROFILE, STAFF

  const [settings, setSettings] = useState({ shopName: '', address: '', phone: '', gstin: '', billFooterMsg: '' });
  const [users, setUsers] = useState([]);
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'cashier' });

  // Custom Alert State
  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });

  const safeAlert = (msg) => {
    if (document.activeElement) document.activeElement.blur();
    setAppAlert({ show: true, msg });
  };

  useEffect(() => {
    if (serverIP && !isSettingUp) {
      fetchData();
    }
  }, [serverIP, isSettingUp]);

  const fetchData = async () => {
    try {
      const setRes = await fetch(`http://${serverIP}:5000/api/settings`);
      setSettings(await setRes.json());

      const userRes = await fetch(`http://${serverIP}:5000/api/users`);
      setUsers(await userRes.json());

      const salesRes = await fetch(`http://${serverIP}:5000/api/sales`);
      setSales(await salesRes.json());

      const invRes = await fetch(`http://${serverIP}:5000/api/inventory`);
      setInventory(await invRes.json());
    } catch (e) {
      console.error("Server not reachable");
    }
  };

  // --- PROFILE ACTIONS ---
  const handleSaveProfile = async () => {
    try {
      await fetch(`http://${serverIP}:5000/api/settings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      safeAlert("✅ Firm Profile Updated! All billing apps will now use these details.");
    } catch (e) { safeAlert("Error saving settings."); }
  };

  // --- STAFF ACTIONS ---
  const handleAddUser = async () => {
    if (!newUser.name || !newUser.pin) return safeAlert("Name and PIN are required.");
    try {
      await fetch(`http://${serverIP}:5000/api/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      setNewUser({ name: '', pin: '', role: 'cashier' });
      fetchData();
      safeAlert("✅ Staff Member Added!");
    } catch (e) { safeAlert("Error adding staff."); }
  };

  const deleteUser = async (id) => {
    try {
      await fetch(`http://${serverIP}:5000/api/users/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (e) { safeAlert("Error deleting staff."); }
  };

  // --- CALCS ---
  const totalStockValuation = inventory.reduce((sum, item) => sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.qty || 0)), 0);
  const totalSalesValuation = sales.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ Connect to Master Server</h1>
          <div className="mb-4">
            <label className="font-bold text-gray-700">Master Server IP Address</label>
            <input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="192.168.1.50" className="w-full border-2 border-blue-400 p-2 rounded font-bold text-lg bg-blue-50 mt-1" />
          </div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); setIsSettingUp(false); }} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 shadow-md">Connect Admin</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans">
      
      {/* CUSTOM ALERT */}
      {appAlert.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600">
            <p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p>
            <button onClick={() => setAppAlert({show: false, msg: ''})} className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION */}
      <div className="bg-gray-900 text-white p-4 flex justify-between items-center shadow-md z-10">
        <h1 className="text-2xl font-black tracking-wide">👑 Master Admin Panel</h1>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`px-6 py-2 font-bold rounded transition-colors ${activeTab === 'DASHBOARD' ? 'bg-blue-600 shadow-inner' : 'bg-gray-800 hover:bg-gray-700'}`}>📊 Dashboard</button>
          <button onClick={() => setActiveTab('PROFILE')} className={`px-6 py-2 font-bold rounded transition-colors ${activeTab === 'PROFILE' ? 'bg-blue-600 shadow-inner' : 'bg-gray-800 hover:bg-gray-700'}`}>🏢 Firm Profile</button>
          <button onClick={() => setActiveTab('STAFF')} className={`px-6 py-2 font-bold rounded transition-colors ${activeTab === 'STAFF' ? 'bg-blue-600 shadow-inner' : 'bg-gray-800 hover:bg-gray-700'}`}>👥 Staff & PINs</button>
          <button onClick={() => setIsSettingUp(true)} className="bg-red-600 hover:bg-red-700 px-4 py-2 font-bold rounded ml-4">⚙️ IP</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        
        {/* --- TAB: DASHBOARD --- */}
        {activeTab === 'DASHBOARD' && (
          <div className="max-w-6xl mx-auto flex flex-col gap-6">
            
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-blue-500">
                <h3 className="text-gray-500 font-bold text-sm uppercase">Total Lifetime Sales</h3>
                <div className="text-4xl font-black text-gray-800 mt-2">₹{totalSalesValuation.toLocaleString('en-IN')}</div>
                <div className="text-sm font-bold text-blue-600 mt-2">{sales.length} Invoices Generated</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-green-500">
                <h3 className="text-gray-500 font-bold text-sm uppercase">Current Stock Value (Purchase)</h3>
                <div className="text-4xl font-black text-gray-800 mt-2">₹{totalStockValuation.toLocaleString('en-IN')}</div>
                <div className="text-sm font-bold text-green-600 mt-2">{inventory.reduce((a,b)=>a+Number(b.qty),0)} Items in Godown</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border-l-8 border-purple-500 flex flex-col justify-center items-center cursor-pointer hover:bg-gray-50" onClick={() => fetchData()}>
                <span className="text-4xl mb-2">🔄</span>
                <span className="font-bold text-gray-700">Refresh Data</span>
              </div>
            </div>

            <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-4">
              <div className="bg-gray-100 p-4 border-b font-bold text-gray-700 text-lg">📝 Recent Sales History</div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr><th className="p-3">Invoice No</th><th className="p-3">Date</th><th className="p-3">Cashier</th><th className="p-3">Customer</th><th className="p-3">Payment</th><th className="p-3 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {sales.slice().reverse().slice(0, 15).map((s, i) => (
                    <tr key={i} className="border-b hover:bg-blue-50">
                      <td className="p-3 font-bold text-blue-700">{s.invoice}</td>
                      <td className="p-3">{s.date} {s.time}</td>
                      <td className="p-3 font-bold">{s.cashier}</td>
                      <td className="p-3">{s.customerName} <span className="text-xs text-gray-500 block">{s.customerMobile !== 'N/A' ? s.customerMobile : ''}</span></td>
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

        {/* --- TAB: FIRM PROFILE --- */}
        {activeTab === 'PROFILE' && (
          <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="bg-gray-100 p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-black text-gray-800">🏢 Firm Global Profile</h2>
              <button onClick={handleSaveProfile} className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold shadow hover:bg-blue-700">💾 Save Firm Details</button>
            </div>
            
            <div className="p-8 flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="font-bold text-gray-700 block mb-2">Shop Name (Prints on Bill Header)</label>
                  <input type="text" value={settings.shopName || ''} onChange={e => setSettings({...settings, shopName: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold text-xl outline-none focus:border-blue-500 bg-blue-50" />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-2">GSTIN Number (Optional)</label>
                  <input type="text" value={settings.gstin || ''} onChange={e => setSettings({...settings, gstin: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold text-xl outline-none focus:border-blue-500 uppercase" />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-2">Full Address</label>
                <textarea value={settings.address || ''} onChange={e => setSettings({...settings, address: e.target.value})} rows="3" className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500"></textarea>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="font-bold text-gray-700 block mb-2">Phone Number(s)</label>
                  <input type="text" value={settings.phone || ''} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-2">Bill Footer Message (e.g. Thanks for shopping!)</label>
                  <input type="text" value={settings.billFooterMsg || ''} onChange={e => setSettings({...settings, billFooterMsg: e.target.value})} className="w-full border-2 border-gray-300 p-3 rounded font-bold outline-none focus:border-blue-500 bg-green-50" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: STAFF --- */}
        {activeTab === 'STAFF' && (
          <div className="max-w-5xl mx-auto flex gap-6">
            
            <div className="w-1/3 bg-white rounded-xl shadow-sm border p-6 self-start">
              <h2 className="text-lg font-black text-gray-800 border-b pb-4 mb-4">➕ Add Staff</h2>
              <div className="flex flex-col gap-4">
                <div><label className="font-bold text-gray-700 text-sm">Full Name</label><input type="text" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} className="w-full border-2 p-2 rounded outline-none font-bold focus:border-blue-500" /></div>
                <div><label className="font-bold text-gray-700 text-sm">4-Digit Secret PIN</label><input type="password" maxLength="4" value={newUser.pin} onChange={e=>setNewUser({...newUser, pin: e.target.value.replace(/\D/g, '')})} className="w-full border-2 p-2 rounded outline-none font-bold text-xl tracking-widest text-center focus:border-blue-500 bg-yellow-50" /></div>
                <div><label className="font-bold text-gray-700 text-sm">Role</label><select value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value})} className="w-full border-2 p-2 rounded outline-none font-bold focus:border-blue-500"><option value="cashier">Cashier</option><option value="admin">Master Admin</option></select></div>
                <button onClick={handleAddUser} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 mt-2">Create Staff Login</button>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gray-100 p-4 border-b">
                <h2 className="text-lg font-black text-gray-800">👥 Authorized Logins</h2>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr><th className="p-3">Staff Name</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-b">
                      <td className="p-3 font-bold text-gray-800">{u.name}</td>
                      <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{u.role}</span></td>
                      <td className="p-3 font-bold text-green-600">Active</td>
                      <td className="p-3 text-right">
                        {u.id !== 1 && <button onClick={() => deleteUser(u.id)} className="bg-red-500 text-white px-3 py-1 rounded font-bold text-xs hover:bg-red-600">Revoke</button>}
                        {u.id === 1 && <span className="text-xs text-gray-400 font-bold">Cannot delete Master</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
