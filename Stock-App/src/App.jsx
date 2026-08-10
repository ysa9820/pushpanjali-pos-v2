import React, { useState, useEffect } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

// --- ANTI-FREEZE HELPERS ---
// Prevents Electron from locking input fields after an alert box closes
const safeAlert = (msg) => {
  if (document.activeElement) document.activeElement.blur();
  setTimeout(() => alert(msg), 10);
};

const safeConfirm = (msg) => {
  if (document.activeElement) document.activeElement.blur();
  return window.confirm(msg);
};

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerPath, setPrinterPath] = useState(localStorage.getItem('barcode_printer') || '\\\\localhost\\TSC');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));

  const [activeTab, setActiveTab] = useState('ENTRY');

  const [supplier, setSupplier] = useState({ name: '', billNo: '', date: new Date().toISOString().split('T')[0] });
  const [item, setItem] = useState({ category: 'Mens', name: '', barcode: '', brand: '', size: '', purPrice: '', mrp: '', qty: '1', hsn: '' });
  
  const [staging, setStaging] = useState([]);
  const [liveStock, setLiveStock] = useState([]);
  const [dirtyEdits, setDirtyEdits] = useState({});
  const [isPrinting, setIsPrinting] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // --- TALLY SUPPLIER LIST ---
  const [supplierList, setSupplierList] = useState([]);
  const [supplierText, setSupplierText] = useState('');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);
  const [supplierFocusIndex, setSupplierFocusIndex] = useState(0); 

  // --- SIZE RULES LIST ---
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showSizeDrop, setShowSizeDrop] = useState(false);
  const [savedSizeRules, setSavedSizeRules] = useState(JSON.parse(localStorage.getItem('saved_size_rules')) || []);
  const [newRuleForm, setNewRuleForm] = useState({ name: '', startSize: '', endSize: '', sizeStep: '2', priceInc: '10' });
  const [activeSizeRule, setActiveSizeRule] = useState(null);

  // --- FETCHING ---
  useEffect(() => {
    if (serverIP && !isSettingUp) { fetchLiveStock(); fetchGlobalSettings(); }
  }, [serverIP, isSettingUp]);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('print-finished', (event, result) => {
        setIsPrinting(false);
        if (!result.success) safeAlert(`❌ Printer Error:\n${result.errorMsg}\n\nMake sure printer is shared as "${printerPath}"`);
      });
    }
    return () => { if (ipcRenderer) ipcRenderer.removeAllListeners('print-finished'); };
  }, [printerPath]);

  const fetchLiveStock = () => {
    fetch(`http://${serverIP}:5000/api/inventory`).then(res => res.json()).then(data => { setLiveStock(data); setDirtyEdits({}); }).catch(() => {});
  };

  const fetchGlobalSettings = () => {
    fetch(`http://${serverIP}:5000/api/settings`).then(res => res.json()).then(data => { if (data.suppliers) setSupplierList(data.suppliers); }).catch(() => {});
  };

  // --- TALLY-STYLE SUPPLIER LOGIC ---
  const filteredSuppliers = supplierList.filter(s => s.toLowerCase().includes(supplierText.toLowerCase()));
  const exactMatchExists = supplierList.some(s => s.toLowerCase() === supplierText.trim().toLowerCase());

  useEffect(() => { setSupplierFocusIndex(0); }, [supplierText]);

  const selectSupplier = (name) => { setSupplierText(name); setSupplier({ ...supplier, name }); setShowSupplierDrop(false); };
  
  const addNewSupplierAndSelect = async (name) => {
    const trimmed = name.trim(); if (!trimmed) return;
    const newList = [...supplierList, trimmed]; setSupplierList(newList); selectSupplier(trimmed);
    await fetch(`http://${serverIP}:5000/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suppliers: newList }) });
  };

  const handleSupplierKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierFocusIndex(prev => Math.min(prev + 1, filteredSuppliers.length - 1)); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierFocusIndex(prev => Math.max(prev - 1, 0)); } 
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSuppliers.length > 0) selectSupplier(filteredSuppliers[supplierFocusIndex]);
      else if (supplierText.trim() && !exactMatchExists) addNewSupplierAndSelect(supplierText);
    }
  };

  // --- BARCODE GENERATOR ---
  const generateNextBarcodes = (count = 1) => {
    const allBarcodes = [...liveStock, ...staging].map(i => i.barcode);
    let maxSeries = 10000;
    allBarcodes.forEach(code => { if (code && code.toUpperCase().startsWith('B')) { const num = parseInt(code.substring(1)); if (!isNaN(num) && num > maxSeries) maxSeries = num; } });
    return Array.from({ length: count }).map((_, i) => 'B' + (maxSeries + 1 + i));
  };

  const handleItemChange = (e, field) => setItem({ ...item, [field]: e.target.value });

  // --- SIZE RULES LOGIC ---
  const saveNewSizeRule = () => {
    if (!newRuleForm.name || !newRuleForm.startSize || !newRuleForm.endSize) return safeAlert("Required fields missing!");
    const newRule = { id: Date.now(), name: newRuleForm.name, startSize: newRuleForm.startSize, endSize: newRuleForm.endSize, sizeStep: newRuleForm.sizeStep || '1', priceInc: newRuleForm.priceInc || '0' };
    const updated = [...savedSizeRules, newRule];
    setSavedSizeRules(updated); localStorage.setItem('saved_size_rules', JSON.stringify(updated));
    setNewRuleForm({ name: '', startSize: '', endSize: '', sizeStep: '2', priceInc: '10' });
  };

  const deleteSizeRule = (id) => {
    const updated = savedSizeRules.filter(r => r.id !== id);
    setSavedSizeRules(updated); localStorage.setItem('saved_size_rules', JSON.stringify(updated));
    if (activeSizeRule && activeSizeRule.id === id) setActiveSizeRule(null);
  };

  // --- ADD TO STAGING ---
  const addToStaging = () => {
    if (!item.name || !item.mrp || !item.qty) return safeAlert("Goods Name, MRP, and Qty are required.");
    
    if (activeSizeRule) {
      let currentSize = parseInt(activeSizeRule.startSize); const endSize = parseInt(activeSizeRule.endSize);
      let step = parseInt(activeSizeRule.sizeStep); if (isNaN(step) || step <= 0) step = 1; 
      let currentMrp = parseFloat(item.mrp); let currentPur = parseFloat(item.purPrice || 0); 
      const priceInc = parseFloat(activeSizeRule.priceInc || 0); const qty = item.qty; 
      
      const generatedItems = [];
      while (currentSize <= endSize) {
        generatedItems.push({ ...item, size: currentSize.toString(), mrp: currentMrp.toString(), purPrice: currentPur.toString(), qty: qty.toString() });
        currentSize += step; currentMrp += priceInc; currentPur += priceInc;
      }
      const newBarcodes = generateNextBarcodes(generatedItems.length);
      const finalizedItems = generatedItems.map((genItem, i) => ({ ...genItem, barcode: newBarcodes[i], supplierName: supplier.name }));
      setStaging([...staging, ...finalizedItems]);
    } else {
      let finalBarcode = item.barcode.trim();
      if (finalBarcode === '') finalBarcode = generateNextBarcodes(1)[0];
      else {
        const isDuplicate = liveStock.some(inv => (inv.barcode||'').toLowerCase() === finalBarcode.toLowerCase());
        if (isDuplicate && !safeConfirm(`⚠️ Barcode [${finalBarcode}] already exists in master. Add anyway?`)) return;
      }
      setStaging([...staging, { ...item, barcode: finalBarcode, supplierName: supplier.name }]);
    }
    setItem({ ...item, barcode: '', size: '', qty: '1' }); 
  };

  // --- EXCEL EDITS ---
  const updateStagingRow = (index, field, value) => { const newStaging = [...staging]; newStaging[index][field] = value; setStaging(newStaging); };
  const updateLiveRow = (barcode, field, value) => {
    const updated = liveStock.map(inv => inv.barcode === barcode ? { ...inv, [field]: value } : inv);
    setLiveStock(updated); const changedItem = updated.find(inv => inv.barcode === barcode);
    setDirtyEdits(prev => ({ ...prev, [barcode]: changedItem }));
  };

  const saveBatch = async (shouldPrint) => {
    if (staging.length === 0) return safeAlert("List is empty!");
    try {
      for (const stgItem of staging) {
        await fetch(`http://${serverIP}:5000/api/inventory`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            barcode: stgItem.barcode, name: stgItem.name, category: stgItem.category, 
            qty: stgItem.qty, price: stgItem.mrp, purchasePrice: stgItem.purPrice, 
            brand: stgItem.brand || '', size: stgItem.size || '', hsn: stgItem.hsn || '', supplierName: stgItem.supplierName || '' 
          })
        });
      }
      
      if (shouldPrint && ipcRenderer) {
        setIsPrinting(true); 
        ipcRenderer.send('print-silent', { printerPath, labels: staging });
        setTimeout(() => { setIsPrinting(false); }, 5000); // 5-Second Failsafe unfreeze
      } else {
        safeAlert("✅ Stock Successfully Saved!");
      }
      setStaging([]); fetchLiveStock();
    } catch (err) { safeAlert("Failed to save to server."); setIsPrinting(false); }
  };

  const saveLiveEdits = async () => {
    const itemsToUpdate = Object.values(dirtyEdits); if (itemsToUpdate.length === 0) return;
    try {
      for (const invItem of itemsToUpdate) {
        await fetch(`http://${serverIP}:5000/api/inventory/${invItem.barcode}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: invItem.name, category: invItem.category, qty: invItem.qty, price: invItem.price, purchasePrice: invItem.purchasePrice, brand: invItem.brand, size: invItem.size, supplierName: invItem.supplierName })
        });
      }
      safeAlert(`✅ Updated ${itemsToUpdate.length} item(s)!`); setDirtyEdits({}); fetchLiveStock();
    } catch (e) { safeAlert("Update failed."); }
  };

  const deleteLiveItem = async (barcode) => {
    if (!safeConfirm("Permanently delete?")) return;
    await fetch(`http://${serverIP}:5000/api/inventory/${barcode}`, { method: 'DELETE' }); fetchLiveStock();
  };

  const filteredInventory = liveStock.filter(inv => {
    const term = reportSearch.toLowerCase();
    return (inv.name||'').toLowerCase().includes(term) || (inv.barcode||'').toLowerCase().includes(term) || (inv.supplierName||'').toLowerCase().includes(term) || (inv.category||'').toLowerCase().includes(term);
  });

  const inputClass = "w-full bg-transparent border border-transparent hover:border-gray-400 focus:border-blue-500 focus:bg-white rounded px-1 outline-none font-bold";

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ Local PC Setup</h1>
          <div className="mb-4"><label className="font-bold text-gray-700">Master Server IP Address</label><input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="192.168.1.50" className="w-full border-2 border-blue-400 p-2 rounded font-bold text-lg bg-blue-50" /></div>
          <div className="mb-6"><label className="font-bold text-gray-700">Shared Printer Network Path</label><p className="text-xs text-gray-500 mb-1">Must be the exact Windows Share Path.</p><input type="text" value={printerPath} onChange={(e) => setPrinterPath(e.target.value)} placeholder="\\localhost\TSC" className="w-full border-2 border-gray-400 p-2 rounded font-bold text-lg" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); localStorage.setItem('barcode_printer', printerPath); setIsSettingUp(false); }} className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700">Save & Connect</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans text-sm overflow-hidden relative">
      
      {isPrinting && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded shadow-2xl text-center border-t-4 border-blue-600">
            <h2 className="text-2xl font-bold text-blue-900 mb-2">🖨️ Sending Data to Printer...</h2>
            <p className="text-gray-600">Sending 2-Up Side-by-Side TSPL code directly to {printerPath}. Please wait.</p>
          </div>
        </div>
      )}

      {/* SIZE RULES CREATOR MODAL */}
      {showSizeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-[600px] flex overflow-hidden h-[400px]">
            <div className="w-1/2 bg-gray-100 border-r p-4 flex flex-col">
              <h3 className="font-bold text-gray-700 border-b pb-2 mb-2">📋 Existing Rules</h3>
              <div className="flex-1 overflow-y-auto pr-2">
                {savedSizeRules.length === 0 ? <p className="text-gray-400 text-xs italic mt-2">No rules saved yet.</p> : null}
                {savedSizeRules.map((r) => (
                  <div key={r.id} className="bg-white border rounded p-2 mb-2 shadow-sm relative group">
                    <div className="font-bold text-purple-900 text-base">{r.name}</div>
                    <div className="text-xs text-gray-600 mt-1">{r.startSize} to {r.endSize} (Step: {r.sizeStep})</div>
                    <div className="text-xs text-green-700 font-bold">+₹{r.priceInc} / size</div>
                    <button onClick={() => deleteSizeRule(r.id)} className="absolute top-2 right-2 text-red-500 hidden group-hover:block font-bold">❌</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-1/2 p-6 flex flex-col bg-white">
              <h3 className="font-bold text-blue-900 border-b pb-2 mb-4">➕ Add New Rule</h3>
              <label className="text-xs font-bold text-gray-600">Rule Name</label><input type="text" value={newRuleForm.name} onChange={e => setNewRuleForm({...newRuleForm, name: e.target.value})} className="border p-2 rounded w-full mb-3 outline-none focus:border-purple-500" />
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div><label className="text-xs font-bold text-gray-600">Start Size</label><input type="number" value={newRuleForm.startSize} onChange={e => setNewRuleForm({...newRuleForm, startSize: e.target.value})} className="border p-2 rounded w-full outline-none" /></div>
                <div><label className="text-xs font-bold text-gray-600">End Size</label><input type="number" value={newRuleForm.endSize} onChange={e => setNewRuleForm({...newRuleForm, endSize: e.target.value})} className="border p-2 rounded w-full outline-none" /></div>
                <div><label className="text-xs font-bold text-gray-600">Size Step</label><input type="number" value={newRuleForm.sizeStep} onChange={e => setNewRuleForm({...newRuleForm, sizeStep: e.target.value})} className="border p-2 rounded w-full outline-none" /></div>
                <div><label className="text-xs font-bold text-gray-600">+₹ Inc/Size</label><input type="number" value={newRuleForm.priceInc} onChange={e => setNewRuleForm({...newRuleForm, priceInc: e.target.value})} className="border p-2 rounded w-full outline-none" /></div>
              </div>
              <button onClick={saveNewSizeRule} className="bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">Save Rule</button>
              <button onClick={() => setShowSizeModal(false)} className="mt-auto bg-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-400">Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-900 text-white p-2 flex justify-between items-center shadow z-10">
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('ENTRY')} className={`px-6 py-2 font-bold rounded ${activeTab === 'ENTRY' ? 'bg-white text-blue-900 shadow' : 'bg-blue-800 hover:bg-blue-700'}`}>📥 Stock In & Print</button>
          <button onClick={() => setActiveTab('INVENTORY')} className={`px-6 py-2 font-bold rounded ${activeTab === 'INVENTORY' ? 'bg-white text-blue-900 shadow' : 'bg-blue-800 hover:bg-blue-700'}`}>📊 Inventory Master</button>
        </div>
        <button onClick={() => setIsSettingUp(true)} className="bg-gray-800 px-4 py-1.5 rounded font-bold hover:bg-black text-xs">⚙️ Setup</button>
      </div>

      {activeTab === 'ENTRY' && (
        <div className="flex flex-col flex-1 p-2 gap-2 overflow-hidden">
          
          <div className="bg-white border border-gray-300 p-2 shadow-sm flex items-center gap-4 rounded z-20">
            <span className="font-bold text-gray-700">Supplier</span>
            <div className="relative w-72">
              <input type="text" value={supplierText} onChange={(e) => { setSupplierText(e.target.value); setShowSupplierDrop(true); setSupplier({...supplier, name: e.target.value}); }} onFocus={() => setShowSupplierDrop(true)} onBlur={() => setTimeout(() => setShowSupplierDrop(false), 200)} onKeyDown={handleSupplierKeyDown} placeholder="Search/add supplier..." className="border-2 border-blue-400 p-1.5 w-full bg-blue-50 outline-none focus:border-blue-600 rounded font-bold text-blue-900" />
              {showSupplierDrop && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 shadow-xl max-h-60 overflow-y-auto rounded-b z-50">
                  {filteredSuppliers.map((s, i) => (
                    <div key={i} className={`p-2 border-b cursor-pointer font-bold ${i === supplierFocusIndex ? 'bg-blue-600 text-white' : 'hover:bg-blue-100 text-gray-700'}`} onMouseEnter={() => setSupplierFocusIndex(i)} onClick={() => selectSupplier(s)}>{s}</div> 
                  ))}
                  {supplierText.trim() && !exactMatchExists && ( <div className="p-2 bg-green-100 text-green-800 font-bold cursor-pointer flex items-center gap-2" onClick={() => addNewSupplierAndSelect(supplierText)}><span>➕</span> Add "{supplierText}"</div> )}
                </div>
              )}
            </div>
            <span className="font-bold text-gray-700 ml-4">Bill No</span><input type="text" value={supplier.billNo} onChange={e => setSupplier({ ...supplier, billNo: e.target.value })} className="border p-1.5 w-32 rounded outline-none" />
            <span className="font-bold text-gray-700 ml-4">Date</span><input type="date" value={supplier.date} onChange={e => setSupplier({ ...supplier, date: e.target.value })} className="border p-1.5 rounded outline-none" />
          </div>

          <div className="flex gap-2 bg-white border border-gray-300 p-3 shadow-sm rounded items-end z-10">
            <div className="flex flex-col"><label className="font-bold text-gray-600 text-xs">Head</label><select value={item.category} onChange={e => handleItemChange(e, 'category')} className="border p-1.5 rounded outline-none"><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select></div>
            <div className="flex flex-col flex-1"><label className="font-bold text-blue-900 text-xs">Goods Name *</label><input type="text" value={item.name} onChange={e => handleItemChange(e, 'name')} className="border-2 border-blue-400 p-1.5 rounded bg-blue-50 outline-none focus:border-blue-600" /></div>
            <div className="flex flex-col w-32"><label className="font-bold text-gray-600 text-xs">Barcode</label><input type="text" value={item.barcode} onChange={e => handleItemChange(e, 'barcode')} placeholder="Auto" className="border-2 border-gray-400 p-1.5 rounded font-mono font-bold outline-none" /></div>
            <div className="flex flex-col w-24"><label className="font-bold text-gray-600 text-xs">Brand</label><input type="text" value={item.brand} onChange={e => handleItemChange(e, 'brand')} className="border p-1.5 rounded outline-none" /></div>
            
            {/* NATIVE SIZE RULE COMBOBOX */}
            <div className="flex flex-col w-36 relative">
              <label className="font-bold text-purple-800 text-xs flex justify-between">Size <span className="cursor-pointer underline" onClick={() => setShowSizeModal(true)}>+ Rule</span></label>
              <div className="flex h-[34px] border border-gray-400 rounded focus-within:border-blue-500 bg-white overflow-hidden">
                {activeSizeRule ? (
                  <div className="flex-1 bg-purple-100 flex items-center justify-between px-2 cursor-pointer" onClick={() => setActiveSizeRule(null)}>
                    <span className="text-xs font-bold text-purple-900 truncate">Rule: {activeSizeRule.name}</span>
                    <span className="text-red-500 ml-1 font-bold">X</span>
                  </div>
                ) : (
                  <>
                    <input type="text" value={item.size} onChange={e => handleItemChange(e, 'size')} className="flex-1 w-full px-1.5 uppercase outline-none" placeholder="Size" />
                    {savedSizeRules.length > 0 && (
                      <select className="w-5 bg-gray-200 border-l outline-none cursor-pointer" onChange={e => { const rule = savedSizeRules.find(r => r.id.toString() === e.target.value); setActiveSizeRule(rule || null); e.target.value = ""; }}>
                        <option value="" disabled hidden></option>
                        {savedSizeRules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col w-24"><label className="font-bold text-gray-600 text-xs">Pur Price</label><input type="number" value={item.purPrice} onChange={e => handleItemChange(e, 'purPrice')} className="border p-1.5 rounded outline-none" /></div>
            <div className="flex flex-col w-24"><label className="font-bold text-green-700 text-xs">MRP *</label><input type="number" value={item.mrp} onChange={e => handleItemChange(e, 'mrp')} className="border-2 border-green-500 p-1.5 rounded bg-green-50 font-bold outline-none focus:border-green-600" /></div>
            <div className="flex flex-col w-20"><label className="font-bold text-red-600 text-xs">Qty *</label><input type="number" value={item.qty} onChange={e => handleItemChange(e, 'qty')} className="border-2 border-red-500 p-1.5 rounded bg-red-50 text-center font-bold outline-none focus:border-red-600" /></div>
            <button onClick={addToStaging} className="bg-blue-600 text-white font-bold py-1.5 px-6 rounded shadow hover:bg-blue-700 h-[34px]">Add</button>
          </div>

          <div className="flex-1 bg-white border border-gray-300 shadow-sm rounded flex flex-col overflow-hidden z-0">
            <div className="p-2 bg-gray-200 border-b font-bold text-gray-700 flex justify-between"><span>📋 Unsaved Staging List ({staging.length} Items)</span></div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-100 sticky top-0 font-bold border-b-2"><tr><th className="p-2 border-r w-12 text-center">Sr</th><th className="p-2 border-r">Goods Name</th><th className="p-2 border-r w-24">Brand</th><th className="p-2 border-r w-16">Size</th><th className="p-2 border-r w-24">MRP</th><th className="p-2 border-r w-24">Pur Price</th><th className="p-2 border-r w-32">Barcode</th><th className="p-2 border-r w-16 text-center">Qty</th><th className="p-2 text-center w-12">Del</th></tr></thead>
                <tbody>
                  {staging.map((stg, idx) => (
                    <tr key={idx} className="border-b hover:bg-yellow-50">
                      <td className="p-2 border-r text-center font-bold text-gray-500">{idx + 1}</td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.name} onChange={e => updateStagingRow(idx, 'name', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.brand} onChange={e => updateStagingRow(idx, 'brand', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.size} onChange={e => updateStagingRow(idx, 'size', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={stg.mrp} onChange={e => updateStagingRow(idx, 'mrp', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={inputClass} value={stg.purPrice} onChange={e => updateStagingRow(idx, 'purPrice', e.target.value)} /></td>
                      <td className="p-2 border-r font-mono text-purple-700">{stg.barcode}</td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center text-red-600`} value={stg.qty} onChange={e => updateStagingRow(idx, 'qty', e.target.value)} /></td>
                      <td className="p-2 text-center"><button onClick={() => setStaging(staging.filter((_, i) => i !== idx))} className="text-red-500 font-bold">❌</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-200 border-t p-3 flex gap-4">
              <button onClick={() => saveBatch(false)} className="bg-white border-2 border-gray-400 font-bold py-2.5 px-8 rounded shadow-sm hover:bg-gray-100">💾 Save to Master Only</button>
              <button onClick={() => saveBatch(true)} className="bg-green-700 text-white border-2 border-green-900 font-bold py-2.5 px-8 rounded shadow-sm hover:bg-green-600">🖨️ Save & Fire RAW 2-Up Barcodes</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'INVENTORY' && (
        <div className="flex flex-col flex-1 p-2 gap-2 overflow-hidden">
          <div className="bg-white border border-gray-300 p-3 shadow-sm rounded flex items-center gap-4">
            <span className="font-bold text-gray-700">🔍 Search:</span>
            <input autoFocus type="text" value={reportSearch} onChange={e => setReportSearch(e.target.value)} placeholder="Type name, barcode, or supplier..." className="border-2 border-blue-400 p-2 rounded flex-1 bg-blue-50 font-bold outline-none" />
            <div className="font-bold text-blue-900 bg-blue-100 px-4 py-2 rounded">Found: {filteredInventory.length}</div>
            {Object.keys(dirtyEdits).length > 0 && <button onClick={saveLiveEdits} className="bg-orange-600 text-white px-6 py-2 rounded font-bold shadow animate-pulse">💾 Save {Object.keys(dirtyEdits).length} Edits</button>}
          </div>

          <div className="flex-1 bg-white border border-gray-300 shadow-sm rounded flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-200 sticky top-0 font-bold border-b-2">
                  <tr><th className="p-2 border-r">Goods Name</th><th className="p-2 border-r w-24">Brand</th><th className="p-2 border-r w-16">Size</th><th className="p-2 border-r w-24">Supplier</th><th className="p-2 border-r w-24">MRP</th><th className="p-2 border-r w-32">Barcode</th><th className="p-2 border-r w-16 text-center">In Stock</th><th className="p-2 text-center w-12">Del</th></tr>
                </thead>
                <tbody>
                  {filteredInventory.map((inv, idx) => (
                    <tr key={idx} className={`border-b hover:bg-orange-50 ${dirtyEdits[inv.barcode] ? 'bg-orange-100' : 'bg-white'}`}>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.name} onChange={e => updateLiveRow(inv.barcode, 'name', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.brand} onChange={e => updateLiveRow(inv.barcode, 'brand', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.size} onChange={e => updateLiveRow(inv.barcode, 'size', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.supplierName} onChange={e => updateLiveRow(inv.barcode, 'supplierName', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={inv.price} onChange={e => updateLiveRow(inv.barcode, 'price', e.target.value)} /></td>
                      <td className="p-2 border-r font-mono text-blue-700">{inv.barcode}</td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center font-bold`} value={inv.qty} onChange={e => updateLiveRow(inv.barcode, 'qty', e.target.value)} /></td>
                      <td className="p-2 text-center"><button onClick={() => deleteLiveItem(inv.barcode)} className="text-red-500 font-bold hover:text-red-700">❌</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
