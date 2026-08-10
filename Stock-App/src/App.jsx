import React, { useState, useEffect, useRef } from 'react';
import Barcode from 'react-barcode';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerName, setPrinterName] = useState(localStorage.getItem('barcode_printer') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));

  const [activeTab, setActiveTab] = useState('ENTRY');

  // --- APP STATE ---
  const [supplier, setSupplier] = useState({ name: '', billNo: '', date: new Date().toISOString().split('T')[0] });
  const [item, setItem] = useState({ category: 'Mens', name: '', barcode: '', brand: '', size: '', purPrice: '', mrp: '', qty: '1', hsn: '' });
  
  const [staging, setStaging] = useState([]);
  const [liveStock, setLiveStock] = useState([]);
  const [dirtyEdits, setDirtyEdits] = useState({});
  const [printQueue, setPrintQueue] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // --- TALLY-STYLE SUPPLIER SEARCH STATES ---
  const [supplierList, setSupplierList] = useState([]);
  const [supplierText, setSupplierText] = useState('');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);

  // --- SIZE RULES LIST STATES ---
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [savedSizeRules, setSavedSizeRules] = useState(JSON.parse(localStorage.getItem('saved_size_rules')) || []);
  const [newRuleForm, setNewRuleForm] = useState({ name: '', startSize: '', endSize: '', sizeStep: '2', priceInc: '10' });
  const [activeSizeRule, setActiveSizeRule] = useState(null); // Holds the currently selected rule

  // --- FETCH DATA ---
  useEffect(() => {
    if (serverIP && !isSettingUp) {
      fetchLiveStock();
      fetchGlobalSettings();
    }
  }, [serverIP, isSettingUp]);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('print-finished', () => { setIsPrinting(false); setPrintQueue([]); });
    }
    return () => { if (ipcRenderer) ipcRenderer.removeAllListeners('print-finished'); };
  }, []);

  const fetchLiveStock = () => {
    fetch(`http://${serverIP}:5000/api/inventory`)
      .then(res => res.json())
      .then(data => { setLiveStock(data); setDirtyEdits({}); })
      .catch(() => console.error("Cannot connect to server."));
  };

  const fetchGlobalSettings = () => {
    fetch(`http://${serverIP}:5000/api/settings`)
      .then(res => res.json())
      .then(data => { if (data.suppliers) setSupplierList(data.suppliers); })
      .catch(() => console.error("Cannot fetch settings."));
  };

  // --- TALLY-STYLE SUPPLIER LOGIC ---
  const selectSupplier = (name) => {
    setSupplierText(name);
    setSupplier({ ...supplier, name });
    setShowSupplierDrop(false);
  };

  const addNewSupplierAndSelect = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newList = [...supplierList, trimmed];
    setSupplierList(newList);
    selectSupplier(trimmed);
    await fetch(`http://${serverIP}:5000/api/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suppliers: newList })
    });
  };

  const filteredSuppliers = supplierList.filter(s => s.toLowerCase().includes(supplierText.toLowerCase()));
  const exactMatchExists = supplierList.some(s => s.toLowerCase() === supplierText.trim().toLowerCase());

  // --- BARCODE GENERATOR ---
  const generateNextBarcodes = (count = 1) => {
    const allBarcodes = [...liveStock, ...staging].map(i => i.barcode);
    let maxSeries = 10000;
    allBarcodes.forEach(code => {
      if (code && code.toUpperCase().startsWith('B')) {
        const num = parseInt(code.substring(1));
        if (!isNaN(num) && num > maxSeries) maxSeries = num;
      }
    });
    return Array.from({ length: count }).map((_, i) => 'B' + (maxSeries + 1 + i));
  };

  const handleItemChange = (e, field) => setItem({ ...item, [field]: e.target.value });

  // --- SIZE RULES LOGIC ---
  const saveNewSizeRule = () => {
    if (!newRuleForm.name || !newRuleForm.startSize || !newRuleForm.endSize) return alert("Rule Name, Start, and End sizes are required!");
    const newRule = { 
      id: Date.now(), 
      name: newRuleForm.name, 
      startSize: newRuleForm.startSize, 
      endSize: newRuleForm.endSize, 
      sizeStep: newRuleForm.sizeStep || '1', 
      priceInc: newRuleForm.priceInc || '0' 
    };
    const updatedRules = [...savedSizeRules, newRule];
    setSavedSizeRules(updatedRules);
    localStorage.setItem('saved_size_rules', JSON.stringify(updatedRules));
    setNewRuleForm({ name: '', startSize: '', endSize: '', sizeStep: '2', priceInc: '10' });
  };

  const deleteSizeRule = (id) => {
    const updated = savedSizeRules.filter(r => r.id !== id);
    setSavedSizeRules(updated);
    localStorage.setItem('saved_size_rules', JSON.stringify(updated));
    if (activeSizeRule && activeSizeRule.id === id) setActiveSizeRule(null);
  };

  const applySizeRuleToForm = (rule) => {
    setActiveSizeRule(rule);
    setShowSizeModal(false);
  };

  // --- ADD TO STAGING ---
  const addToStaging = () => {
    if (!item.name || !item.mrp || !item.qty) return alert("Goods Name, MRP, and Qty are required.");
    
    if (activeSizeRule) {
      // APPLY THE SAVED SIZE RULE
      let currentSize = parseInt(activeSizeRule.startSize);
      const endSize = parseInt(activeSizeRule.endSize);
      let step = parseInt(activeSizeRule.sizeStep);
      if (isNaN(step) || step <= 0) step = 1; // Failsafe

      let currentMrp = parseFloat(item.mrp); 
      let currentPur = parseFloat(item.purPrice || 0); 
      const priceInc = parseFloat(activeSizeRule.priceInc || 0);
      const qty = item.qty; 

      const generatedItems = [];
      while (currentSize <= endSize) {
        generatedItems.push({
          ...item, size: currentSize.toString(), mrp: currentMrp.toString(), purPrice: currentPur.toString(), qty: qty.toString()
        });
        currentSize += step; currentMrp += priceInc; currentPur += priceInc;
      }
      
      const newBarcodes = generateNextBarcodes(generatedItems.length);
      const finalizedItems = generatedItems.map((genItem, i) => ({ ...genItem, barcode: newBarcodes[i], supplierName: supplier.name }));
      setStaging([...staging, ...finalizedItems]);

    } else {
      // SINGLE ITEM
      let finalBarcode = item.barcode.trim();
      if (finalBarcode === '') finalBarcode = generateNextBarcodes(1)[0];
      else {
        const isDuplicate = liveStock.some(inv => (inv.barcode||'').toLowerCase() === finalBarcode.toLowerCase());
        if (isDuplicate && !window.confirm(`⚠️ Barcode [${finalBarcode}] already exists in master. Add anyway?`)) return;
      }
      setStaging([...staging, { ...item, barcode: finalBarcode, supplierName: supplier.name }]);
    }
    
    setItem({ ...item, barcode: '', size: '', qty: '1' }); 
  };

  // --- EXCEL EDITS ---
  const updateStagingRow = (index, field, value) => {
    const newStaging = [...staging];
    newStaging[index][field] = value;
    setStaging(newStaging);
  };

  const updateLiveRow = (barcode, field, value) => {
    const updated = liveStock.map(inv => inv.barcode === barcode ? { ...inv, [field]: value } : inv);
    setLiveStock(updated);
    const changedItem = updated.find(inv => inv.barcode === barcode);
    setDirtyEdits(prev => ({ ...prev, [barcode]: changedItem }));
  };

  const saveBatch = async (shouldPrint) => {
    if (staging.length === 0) return alert("List is empty!");
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
      if (shouldPrint) {
        setPrintQueue([...staging]);
        setIsPrinting(true); 
        setTimeout(() => { 
          if (ipcRenderer && printerName) ipcRenderer.send('print-silent', printerName);
          else { window.print(); setIsPrinting(false); setPrintQueue([]); }
        }, 1000);
      } else {
        alert("✅ Stock Successfully Saved!");
      }
      setStaging([]); fetchLiveStock();
    } catch (err) { alert("Failed to save to server."); setIsPrinting(false); }
  };

  const saveLiveEdits = async () => {
    const itemsToUpdate = Object.values(dirtyEdits);
    if (itemsToUpdate.length === 0) return;
    try {
      for (const invItem of itemsToUpdate) {
        await fetch(`http://${serverIP}:5000/api/inventory/${invItem.barcode}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: invItem.name, category: invItem.category, qty: invItem.qty, 
            price: invItem.price, purchasePrice: invItem.purchasePrice, 
            brand: invItem.brand, size: invItem.size, supplierName: invItem.supplierName 
          })
        });
      }
      alert(`✅ Updated ${itemsToUpdate.length} item(s)!`);
      setDirtyEdits({}); fetchLiveStock();
    } catch (e) { alert("Update failed."); }
  };

  const deleteLiveItem = async (barcode) => {
    if (!window.confirm("Permanently delete?")) return;
    await fetch(`http://${serverIP}:5000/api/inventory/${barcode}`, { method: 'DELETE' });
    fetchLiveStock();
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
          <div className="mb-6"><label className="font-bold text-gray-700">Barcode Printer Name</label><input type="text" value={printerName} onChange={(e) => setPrinterName(e.target.value)} placeholder="TSC TE244" className="w-full border-2 border-gray-400 p-2 rounded font-bold text-lg" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); localStorage.setItem('barcode_printer', printerName); setIsSettingUp(false); }} className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700">Save & Connect</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans text-sm overflow-hidden relative">
      
      {isPrinting && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-blue-900 mb-2">🖨️ Printing Barcodes...</h2>
            <p className="text-gray-600">Sending absolute data to {printerName}. Please wait.</p>
          </div>
        </div>
      )}

      <div id="printable-barcode" className="hidden print:flex flex-col">
        {printQueue.map((p, idx) => (
          Array.from({ length: parseInt(p.qty) || 1 }).map((_, i) => (
            <div key={`${idx}-${i}`} className="barcode-page">
              <div className="font-bold text-[10px] uppercase leading-none mb-1 text-center w-full truncate text-black">Pushpanjali Fashion</div>
              <Barcode value={p.barcode} format="CODE128" width={1.5} height={25} fontSize={12} fontOptions="bold" margin={0} displayValue={true} />
              <div className="font-bold text-[14px] leading-none mt-1 text-black">₹ {p.mrp}</div>
            </div>
          ))
        ))}
      </div>

      {/* SIZE RULES MODAL */}
      {showSizeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-[800px] flex overflow-hidden h-[500px]">
            {/* Left: Saved Rules */}
            <div className="w-1/2 bg-gray-100 border-r p-4 flex flex-col">
              <h3 className="font-bold text-gray-700 border-b pb-2 mb-2">📋 Saved Size Rules</h3>
              <div className="flex-1 overflow-y-auto pr-2">
                {savedSizeRules.length === 0 ? <p className="text-gray-400 text-xs italic mt-2">No rules saved yet.</p> : null}
                {savedSizeRules.map((r) => (
                  <div key={r.id} className="bg-white border rounded p-2 mb-2 shadow-sm relative group">
                    <div className="font-bold text-purple-900 text-base">{r.name}</div>
                    <div className="text-xs text-gray-600 mt-1">Sizes: {r.startSize} to {r.endSize} (Step: {r.sizeStep})</div>
                    <div className="text-xs text-green-700 font-bold">Price +₹{r.priceInc} per size</div>
                    <button onClick={() => deleteSizeRule(r.id)} className="absolute top-2 right-2 text-red-500 hidden group-hover:block font-bold">❌</button>
                    <button onClick={() => applySizeRuleToForm(r)} className="mt-2 w-full bg-purple-100 text-purple-800 font-bold py-1 rounded hover:bg-purple-200">✅ Apply Rule</button>
                  </div>
                ))}
              </div>
            </div>
            {/* Right: Create New Rule */}
            <div className="w-1/2 p-6 flex flex-col bg-white">
              <h3 className="font-bold text-blue-900 border-b pb-2 mb-4">➕ Create New Rule</h3>
              <label className="text-xs font-bold text-gray-600">Rule Name (e.g. Mens Shirts Standard)</label>
              <input type="text" value={newRuleForm.name} onChange={e => setNewRuleForm({...newRuleForm, name: e.target.value})} className="border p-2 rounded w-full mb-3 outline-none focus:border-purple-500" />
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div><label className="text-xs font-bold text-gray-600">Start Size</label><input type="number" value={newRuleForm.startSize} onChange={e => setNewRuleForm({...newRuleForm, startSize: e.target.value})} className="border p-2 rounded w-full outline-none focus:border-purple-500" /></div>
                <div><label className="text-xs font-bold text-gray-600">End Size</label><input type="number" value={newRuleForm.endSize} onChange={e => setNewRuleForm({...newRuleForm, endSize: e.target.value})} className="border p-2 rounded w-full outline-none focus:border-purple-500" /></div>
                <div><label className="text-xs font-bold text-gray-600">Size Step</label><input type="number" value={newRuleForm.sizeStep} onChange={e => setNewRuleForm({...newRuleForm, sizeStep: e.target.value})} className="border p-2 rounded w-full outline-none focus:border-purple-500" /></div>
                <div><label className="text-xs font-bold text-gray-600">+₹ Increase/Size</label><input type="number" value={newRuleForm.priceInc} onChange={e => setNewRuleForm({...newRuleForm, priceInc: e.target.value})} className="border p-2 rounded w-full outline-none focus:border-purple-500" /></div>
              </div>
              
              <button onClick={saveNewSizeRule} className="bg-blue-600 text-white font-bold py-2 rounded shadow hover:bg-blue-700">Save Rule to List</button>
              <button onClick={() => setShowSizeModal(false)} className="mt-auto bg-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-400">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER TABS */}
      <div className="bg-blue-900 text-white p-2 flex justify-between items-center shadow z-10">
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('ENTRY')} className={`px-6 py-2 font-bold rounded ${activeTab === 'ENTRY' ? 'bg-white text-blue-900 shadow' : 'bg-blue-800 hover:bg-blue-700'}`}>📥 Stock In & Print</button>
          <button onClick={() => setActiveTab('INVENTORY')} className={`px-6 py-2 font-bold rounded ${activeTab === 'INVENTORY' ? 'bg-white text-blue-900 shadow' : 'bg-blue-800 hover:bg-blue-700'}`}>📊 Inventory Master</button>
        </div>
        <button onClick={() => setIsSettingUp(true)} className="bg-gray-800 px-4 py-1.5 rounded font-bold hover:bg-black text-xs">⚙️ Setup</button>
      </div>

      {/* TAB 1: ENTRY */}
      {activeTab === 'ENTRY' && (
        <div className="flex flex-col flex-1 p-2 gap-2 overflow-hidden">
          
          {/* TALLY-STYLE TOP BAR */}
          <div className="bg-white border border-gray-300 p-2 shadow-sm flex items-center gap-4 rounded z-20">
            <span className="font-bold text-gray-700">Supplier</span>
            
            {/* TALLY COMBOBOX */}
            <div className="relative w-72">
              <input 
                type="text" 
                value={supplierText} 
                onChange={(e) => { setSupplierText(e.target.value); setShowSupplierDrop(true); setSupplier({...supplier, name: e.target.value}); }}
                onFocus={() => setShowSupplierDrop(true)}
                onBlur={() => setTimeout(() => setShowSupplierDrop(false), 200)}
                placeholder="Search or add supplier..." 
                className="border-2 border-blue-400 p-1.5 w-full bg-blue-50 outline-none focus:border-blue-600 rounded font-bold text-blue-900" 
              />
              {showSupplierDrop && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 shadow-xl max-h-60 overflow-y-auto rounded-b z-50">
                  {filteredSuppliers.map((s, i) => (
                    <div key={i} className="p-2 border-b hover:bg-blue-100 cursor-pointer font-bold text-gray-700" onClick={() => selectSupplier(s)}>{s}</div>
                  ))}
                  {supplierText.trim() && !exactMatchExists && (
                    <div className="p-2 bg-green-100 text-green-800 font-bold cursor-pointer hover:bg-green-200 flex items-center gap-2" onClick={() => addNewSupplierAndSelect(supplierText)}>
                      <span>➕</span> Add "{supplierText}" as new
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="font-bold text-gray-700 ml-4">Bill No</span><input type="text" value={supplier.billNo} onChange={e => setSupplier({ ...supplier, billNo: e.target.value })} className="border p-1.5 w-32 rounded outline-none" />
            <span className="font-bold text-gray-700 ml-4">Date</span><input type="date" value={supplier.date} onChange={e => setSupplier({ ...supplier, date: e.target.value })} className="border p-1.5 rounded outline-none" />
          </div>

          <div className="flex gap-2 bg-white border border-gray-300 p-3 shadow-sm rounded items-end z-10">
            <div className="flex flex-col"><label className="font-bold text-gray-600 text-xs">Head</label><select value={item.category} onChange={e => handleItemChange(e, 'category')} className="border p-1.5 rounded outline-none"><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select></div>
            <div className="flex flex-col flex-1"><label className="font-bold text-blue-900 text-xs">Goods Name *</label><input type="text" value={item.name} onChange={e => handleItemChange(e, 'name')} className="border-2 border-blue-400 p-1.5 rounded bg-blue-50 outline-none focus:border-blue-600" /></div>
            <div className="flex flex-col w-32"><label className="font-bold text-gray-600 text-xs">Barcode (Auto)</label><input type="text" value={item.barcode} onChange={e => handleItemChange(e, 'barcode')} placeholder="Blank=Auto" className="border-2 border-gray-400 p-1.5 rounded font-mono font-bold outline-none" /></div>
            <div className="flex flex-col w-24"><label className="font-bold text-gray-600 text-xs">Brand</label><input type="text" value={item.brand} onChange={e => handleItemChange(e, 'brand')} className="border p-1.5 rounded outline-none" /></div>
            
            <div className="flex flex-col w-32 relative">
              <label className="font-bold text-purple-800 text-xs flex justify-between">Size <span className="cursor-pointer underline" onClick={() => setShowSizeModal(true)}>Rules</span></label>
              {activeSizeRule ? (
                <div className="border-2 border-purple-400 bg-purple-100 p-1 rounded flex justify-between items-center text-xs font-bold text-purple-900 shadow-inner h-[34px]">
                  <span className="truncate">{activeSizeRule.name}</span>
                  <button onClick={() => setActiveSizeRule(null)} className="ml-1 text-red-500 hover:text-red-700">❌</button>
                </div>
              ) : (
                <input type="text" value={item.size} onChange={e => handleItemChange(e, 'size')} className="border p-1.5 rounded uppercase outline-none focus:border-blue-500 h-[34px]" />
              )}
            </div>

            <div className="flex flex-col w-24"><label className="font-bold text-gray-600 text-xs">Pur Price</label><input type="number" value={item.purPrice} onChange={e => handleItemChange(e, 'purPrice')} className="border p-1.5 rounded outline-none" /></div>
            <div className="flex flex-col w-24"><label className="font-bold text-green-700 text-xs">MRP *</label><input type="number" value={item.mrp} onChange={e => handleItemChange(e, 'mrp')} className="border-2 border-green-500 p-1.5 rounded bg-green-50 font-bold outline-none focus:border-green-600" /></div>
            <div className="flex flex-col w-20"><label className="font-bold text-red-600 text-xs">Qty *</label><input type="number" value={item.qty} onChange={e => handleItemChange(e, 'qty')} className="border-2 border-red-500 p-1.5 rounded bg-red-50 text-center font-bold outline-none focus:border-red-600" /></div>
            <button onClick={addToStaging} className="bg-blue-600 text-white font-bold py-1.5 px-6 rounded shadow hover:bg-blue-700 h-[34px]">Add</button>
          </div>

          <div className="flex-1 bg-white border border-gray-300 shadow-sm rounded flex flex-col overflow-hidden z-0">
            <div className="p-2 bg-gray-200 border-b font-bold text-gray-700 flex justify-between">
              <span>📋 Unsaved Staging List ({staging.length} Items)</span>
              <span className="text-xs font-normal">Double-click any cell to edit</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-100 sticky top-0 font-bold border-b-2">
                  <tr><th className="p-2 border-r w-12 text-center">Sr</th><th className="p-2 border-r">Goods Name</th><th className="p-2 border-r w-24">Brand</th><th className="p-2 border-r w-16">Size</th><th className="p-2 border-r w-24">MRP</th><th className="p-2 border-r w-24">Pur Price</th><th className="p-2 border-r w-32">Barcode</th><th className="p-2 border-r w-16 text-center">Qty</th><th className="p-2 text-center w-12">Del</th></tr>
                </thead>
                <tbody>
                  {staging.map((stg, idx) => (
                    <tr key={idx} className="border-b hover:bg-yellow-50">
                      <td className="p-2 border-r text-center font-bold text-gray-500">{idx + 1}</td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.name} onChange={e => updateStagingRow(idx, 'name', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.brand} onChange={e => updateStagingRow(idx, 'brand', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={stg.size} onChange={e => updateStagingRow(idx, 'size', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={stg.mrp} onChange={e => updateStagingRow(idx, 'mrp', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={inputClass} value={stg.purPrice} onChange={e => updateStagingRow(idx, 'purPrice', e.target.value)} /></td>
                      <td className="p-2 border-r font-mono text-purple-700 bg-gray-50">{stg.barcode}</td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center text-red-600`} value={stg.qty} onChange={e => updateStagingRow(idx, 'qty', e.target.value)} /></td>
                      <td className="p-2 text-center"><button onClick={() => setStaging(staging.filter((_, i) => i !== idx))} className="text-red-500 font-bold">❌</button></td>
                    </tr>
                  ))}
                  {staging.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-gray-400 font-bold">List is empty. Use the form above to add items.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-200 border-t p-3 flex gap-4">
              <button onClick={() => saveBatch(false)} className="bg-white border-2 border-gray-400 font-bold py-2.5 px-8 rounded shadow-sm hover:bg-gray-100">💾 Save to Master Only</button>
              <button onClick={() => saveBatch(true)} className="bg-green-700 text-white border-2 border-green-900 font-bold py-2.5 px-8 rounded shadow-sm hover:bg-green-600">🖨️ Save & Print Barcodes</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY MASTER */}
      {activeTab === 'INVENTORY' && (
        <div className="flex flex-col flex-1 p-2 gap-2 overflow-hidden">
          <div className="bg-white border border-gray-300 p-3 shadow-sm rounded flex items-center gap-4">
            <span className="font-bold text-gray-700">🔍 Filter Database:</span>
            <input autoFocus type="text" value={reportSearch} onChange={e => setReportSearch(e.target.value)} placeholder="Type name, barcode, or supplier..." className="border-2 border-blue-400 p-2 rounded flex-1 bg-blue-50 font-bold outline-none" />
            <div className="font-bold text-blue-900 bg-blue-100 px-4 py-2 rounded border border-blue-300">Found: {filteredInventory.length}</div>
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
                    <tr key={idx} className={`border-b border-gray-200 hover:bg-orange-50 ${dirtyEdits[inv.barcode] ? 'bg-orange-100' : 'bg-white'}`}>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.name} onChange={e => updateLiveRow(inv.barcode, 'name', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.brand} onChange={e => updateLiveRow(inv.barcode, 'brand', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.size} onChange={e => updateLiveRow(inv.barcode, 'size', e.target.value)} /></td>
                      <td className="p-1 border-r"><input className={inputClass} value={inv.supplierName} onChange={e => updateLiveRow(inv.barcode, 'supplierName', e.target.value)} /></td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={inv.price} onChange={e => updateLiveRow(inv.barcode, 'price', e.target.value)} /></td>
                      <td className="p-2 border-r font-mono text-blue-700 bg-gray-50">{inv.barcode}</td>
                      <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center font-bold`} value={inv.qty} onChange={e => updateLiveRow(inv.barcode, 'qty', e.target.value)} /></td>
                      <td className="p-2 text-center"><button onClick={() => deleteLiveItem(inv.barcode)} className="text-red-500 font-bold hover:text-red-700">❌</button></td>
                    </tr>
                  ))}
                  {filteredInventory.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-gray-400 font-bold">No items found.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
