import React, { useState, useEffect } from 'react';
import Barcode from 'react-barcode';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerName, setPrinterName] = useState(localStorage.getItem('barcode_printer') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));

  const [supplier, setSupplier] = useState({ name: '', lrNo: '', billNo: '', date: new Date().toISOString().split('T')[0] });
  const [item, setItem] = useState({ category: 'Mens', name: '', barcode: '', brand: '', size: '', purPrice: '', mrp: '', qty: '1', hsn: '' });
  
  const [staging, setStaging] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [liveStock, setLiveStock] = useState([]);
  const [dirtyEdits, setDirtyEdits] = useState({});
  const [printQueue, setPrintQueue] = useState([]);

  // --- MODAL STATES ---
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierList, setSupplierList] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [sizeMatrix, setSizeMatrix] = useState({ 
    startSize: '', endSize: '', 
    sizeStep: localStorage.getItem('matrix_step') || '2', 
    priceInc: localStorage.getItem('matrix_inc') || '10'
  });

  // --- REPORT STATES ---
  const [showStockReport, setShowStockReport] = useState(false);
  const [reportFilters, setReportFilters] = useState({ category: 'ALL', brand: '', supplier: '', search: '' });

  // --- FETCHING ---
  useEffect(() => {
    if (serverIP && !isSettingUp) { fetchLiveStock(); fetchGlobalSettings(); }
  }, [serverIP, isSettingUp]);

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

  // --- HANDLERS ---
  const handleItemChange = (e, field) => setItem({ ...item, [field]: e.target.value });
  
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

  // --- 1. SUPPLIER LOGIC (Fixed Duplicates & Enter Key) ---
  const selectSupplier = (name) => { setSupplier({ ...supplier, name }); setShowSupplierModal(false); setSupplierSearch(''); };
  const handleAddSupplier = () => {
    const trimmed = supplierSearch.trim();
    if (!trimmed) return;
    const exists = supplierList.find(s => s.toLowerCase() === trimmed.toLowerCase());
    if (exists) { selectSupplier(exists); } 
    else {
      const newList = [...supplierList, trimmed];
      fetch(`http://${serverIP}:5000/api/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suppliers: newList }) });
      setSupplierList(newList);
      selectSupplier(trimmed);
    }
  };
  const handleSupplierKeyDown = (e) => { if (e.key === 'Enter') handleAddSupplier(); };

  // --- 2. ADD TO STAGING LOGIC ---
  const addToStaging = () => {
    if (!item.name || !item.mrp) return alert("Goods Name and MRP are strictly required!");
    let finalBarcode = item.barcode.trim();
    if (finalBarcode === '') finalBarcode = generateNextBarcodes(1)[0];
    else {
      const isDuplicate = liveStock.some(inv => (inv.barcode||'').toLowerCase() === finalBarcode.toLowerCase()) || staging.some(stg => (stg.barcode||'').toLowerCase() === finalBarcode.toLowerCase());
      if (isDuplicate) { if (!window.confirm(`⚠️ Barcode [${finalBarcode}] already exists!\nClick OK to add to existing stock.`)) return; }
    }
    setStaging([...staging, { ...item, barcode: finalBarcode, supplierName: supplier.name }]);
    setItem({ ...item, barcode: '', qty: '1' }); 
  };

  // --- 3. SIZE & PRICE MATRIX GENERATOR (Fixed Inheritance & Saves) ---
  const openMatrix = () => {
    if (!item.name || !item.mrp) return alert("Please fill Goods Name and Base MRP in the left form first!");
    setShowSizeModal(true);
  };

  const generateMatrixAndAdd = () => {
    if (!sizeMatrix.startSize || !sizeMatrix.endSize) return alert("Start and End sizes required!");
    
    // Save rules for next time
    localStorage.setItem('matrix_step', sizeMatrix.sizeStep);
    localStorage.setItem('matrix_inc', sizeMatrix.priceInc);

    let currentSize = parseInt(sizeMatrix.startSize); const endSize = parseInt(sizeMatrix.endSize); const step = parseInt(sizeMatrix.sizeStep);
    let currentMrp = parseFloat(item.mrp); let currentPur = parseFloat(item.purPrice || 0); // Inherits from left column
    const priceInc = parseFloat(sizeMatrix.priceInc); const qty = parseInt(item.qty || 1); // Inherits from left column
    
    const generatedItems = [];
    while (currentSize <= endSize) {
      generatedItems.push({ ...item, size: currentSize.toString(), mrp: currentMrp.toString(), purPrice: currentPur.toString(), qty: qty.toString() });
      currentSize += step; currentMrp += priceInc; currentPur += priceInc; 
    }
    const newBarcodes = generateNextBarcodes(generatedItems.length);
    const finalizedItems = generatedItems.map((genItem, i) => ({ ...genItem, barcode: newBarcodes[i], supplierName: supplier.name }));
    setStaging([...staging, ...finalizedItems]);
    setShowSizeModal(false);
  };

  // --- 4. EXCEL EDIT LOGIC (Fixed Save) ---
  const updateStagingRow = (index, field, value) => {
    const newStaging = [...staging];
    newStaging[index][field] = value;
    setStaging(newStaging);
  };

  const updateLiveRow = (barcode, field, value) => {
    const updatedLiveStock = liveStock.map(inv => inv.barcode === barcode ? { ...inv, [field]: value } : inv);
    setLiveStock(updatedLiveStock);
    const changedItem = updatedLiveStock.find(inv => inv.barcode === barcode);
    setDirtyEdits(prev => ({ ...prev, [barcode]: changedItem }));
  };

  const saveSafeEdits = async () => {
    const itemsToUpdate = Object.values(dirtyEdits);
    if (itemsToUpdate.length === 0) return alert("No changes to save!");
    
    try {
      for (const invItem of itemsToUpdate) {
        await fetch(`http://${serverIP}:5000/api/inventory/${invItem.barcode}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name: invItem.name, category: invItem.category, qty: invItem.qty, 
            price: invItem.price, purchasePrice: invItem.purchasePrice, 
            brand: invItem.brand, size: invItem.size, hsn: invItem.hsn, supplierName: invItem.supplierName 
          })
        });
      }
      alert(`✅ Safely updated ${itemsToUpdate.length} item(s)!`);
      setDirtyEdits({}); fetchLiveStock();
    } catch (e) { alert("Server connection failed during update."); }
  };

  const deleteLiveItem = async (barcode) => {
    if (!window.confirm("Permanently delete this item from Master Database?")) return;
    await fetch(`http://${serverIP}:5000/api/inventory/${barcode}`, { method: 'DELETE' });
    fetchLiveStock();
  };

  // --- 5. STOCK IN ---
  const handleStockIn = async (shouldPrint) => {
    if (staging.length === 0) return alert("Staging list is empty!");
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
        setPrintQueue(staging);
        setTimeout(() => { if (ipcRenderer && printerName) ipcRenderer.send('print-silent', printerName); else window.print(); setPrintQueue([]); }, 500);
      }
      alert("✅ Stocked In to Master Database!");
      setStaging([]); fetchLiveStock();
    } catch (err) { alert("Error sending to Master Server."); }
  };

  // --- FILTERS ---
  const filteredLiveStock = liveStock.filter(inv => {
    return (inv.name||'').toLowerCase().includes(item.name.toLowerCase()) && (inv.barcode||'').toLowerCase().includes(item.barcode.toLowerCase());
  });
  
  const reportData = liveStock.filter(inv => {
    const cMatch = reportFilters.category === 'ALL' || inv.category === reportFilters.category;
    const bMatch = !reportFilters.brand || (inv.brand||'').toLowerCase().includes(reportFilters.brand.toLowerCase());
    const sMatch = !reportFilters.supplier || (inv.supplierName||'').toLowerCase().includes(reportFilters.supplier.toLowerCase());
    const textMatch = !reportFilters.search || (inv.name||'').toLowerCase().includes(reportFilters.search.toLowerCase()) || (inv.barcode||'').includes(reportFilters.search);
    return cMatch && bMatch && sMatch && textMatch;
  });

  const inputClass = "w-full bg-transparent border border-transparent hover:border-gray-400 focus:border-blue-500 focus:bg-white rounded px-1 outline-none font-bold";
  const dirtyCount = Object.keys(dirtyEdits).length;

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ Local PC Setup</h1>
          <div className="mb-4"><label className="font-bold text-gray-700 text-sm">Master Server IP Address</label><input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="192.168.1.50" className="w-full border-2 border-blue-400 p-2 rounded font-bold text-lg bg-blue-50" /></div>
          <div className="mb-6"><label className="font-bold text-gray-700 text-sm">Barcode Printer Name</label><input type="text" value={printerName} onChange={(e) => setPrinterName(e.target.value)} placeholder="TSC TE244" className="w-full border-2 border-gray-400 p-2 rounded font-bold text-lg" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); localStorage.setItem('barcode_printer', printerName); setIsSettingUp(false); }} className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 shadow-md">Save & Connect</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans text-sm overflow-hidden p-2">
      
      {/* HIDDEN PRINT LAYOUT (Strict CSS to prevent blank pages on TSC) */}
      <div id="printable-barcode" className="hidden print:flex flex-col">
        {printQueue.map((p, idx) => (
          Array.from({ length: p.qty }).map((_, i) => (
            <div key={`${idx}-${i}`} className="barcode-page bg-white flex flex-col items-center justify-center box-border border-b border-dashed" style={{ width: '50mm', height: '25mm', padding: '1mm' }}>
              <div className="font-bold text-[9px] uppercase leading-none mb-1 text-center w-full truncate text-black">Pushpanjali Fashion</div>
              <Barcode value={p.barcode} width={1.2} height={20} fontSize={10} margin={0} displayValue={true} />
              <div className="font-bold text-[12px] leading-none mt-1 text-black">₹ {p.mrp}</div>
            </div>
          ))
        ))}
      </div>

      {/* SUPPLIER MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-[600px] flex overflow-hidden h-[400px]">
            <div className="w-1/2 bg-gray-100 border-r p-4 flex flex-col">
              <h3 className="font-bold text-gray-700 border-b pb-2 mb-2">Select Existing</h3>
              <div className="flex-1 overflow-y-auto">
                {supplierList.map((s, i) => (
                  <div key={i} onClick={() => selectSupplier(s)} className="p-2 border-b cursor-pointer hover:bg-blue-100 font-bold text-blue-900">{s}</div>
                ))}
              </div>
            </div>
            <div className="w-1/2 p-6 flex flex-col">
              <h3 className="font-bold text-blue-900 border-b pb-2 mb-4">Search / Add New</h3>
              <input autoFocus type="text" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} onKeyDown={handleSupplierKeyDown} placeholder="Type name & hit Enter..." className="w-full border-2 border-blue-400 p-3 rounded font-bold mb-4 bg-blue-50" />
              <button onClick={handleAddSupplier} className="bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Add & Select</button>
              <button onClick={() => setShowSupplierModal(false)} className="mt-auto bg-gray-300 text-gray-800 font-bold py-2 rounded hover:bg-gray-400">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* SIZE MATRIX MODAL */}
      {showSizeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-2xl w-[450px] border-4 border-purple-600">
            <h2 className="font-extrabold text-xl text-center border-b pb-2 mb-4 text-purple-900">📏 Size & Rate Generator</h2>
            <p className="text-xs text-gray-500 text-center mb-4">Goods Name: <strong className="text-black">{item.name}</strong></p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><label className="text-xs font-bold text-gray-600">Start Size</label><input type="number" value={sizeMatrix.startSize} onChange={e => setSizeMatrix({...sizeMatrix, startSize: e.target.value})} placeholder="32" className="w-full border-2 p-2 rounded mt-1 font-bold" /></div>
              <div><label className="text-xs font-bold text-gray-600">End Size</label><input type="number" value={sizeMatrix.endSize} onChange={e => setSizeMatrix({...sizeMatrix, endSize: e.target.value})} placeholder="40" className="w-full border-2 p-2 rounded mt-1 font-bold" /></div>
              <div><label className="text-xs font-bold text-gray-600">Size Step</label><input type="number" value={sizeMatrix.sizeStep} onChange={e => setSizeMatrix({...sizeMatrix, sizeStep: e.target.value})} className="w-full border-2 p-2 rounded mt-1 font-bold text-blue-700 bg-blue-50" /></div>
              <div><label className="text-xs font-bold text-gray-600">Price Increase (Per Size)</label><input type="number" value={sizeMatrix.priceInc} onChange={e => setSizeMatrix({...sizeMatrix, priceInc: e.target.value})} className="w-full border-2 p-2 rounded mt-1 font-bold text-green-700 bg-green-50" /></div>
              
              <div className="col-span-2 text-xs text-center text-gray-500 mt-2">
                <span className="font-bold text-gray-700">Note:</span> Base MRP ({item.mrp}) and Qty ({item.qty}) will be pulled directly from the main form.
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSizeModal(false)} className="flex-1 bg-gray-300 py-2 rounded font-bold">Cancel</button>
              <button onClick={generateMatrixAndAdd} className="flex-[2] bg-purple-700 text-white py-2 rounded font-bold hover:bg-purple-800">Generate & Add</button>
            </div>
          </div>
        </div>
      )}

      {/* STOCK REPORT */}
      {showStockReport && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          <div className="flex justify-between items-center bg-blue-900 text-white p-3 shadow">
            <h1 className="text-xl font-bold">📊 Complete Stock Report</h1>
            <button onClick={() => setShowStockReport(false)} className="bg-red-500 px-4 py-1.5 rounded font-bold hover:bg-red-600 shadow">Close Report</button>
          </div>
          
          {/* REPORT FILTERS */}
          <div className="bg-gray-100 border-b p-3 flex gap-4 items-center">
            <span className="font-bold text-gray-600">Filters:</span>
            <select value={reportFilters.category} onChange={e => setReportFilters({...reportFilters, category: e.target.value})} className="border p-2 rounded font-bold text-sm"><option value="ALL">All Heads</option><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select>
            <input type="text" placeholder="Filter Brand..." value={reportFilters.brand} onChange={e => setReportFilters({...reportFilters, brand: e.target.value})} className="border p-2 rounded w-32" />
            <input type="text" placeholder="Filter Supplier..." value={reportFilters.supplier} onChange={e => setReportFilters({...reportFilters, supplier: e.target.value})} className="border p-2 rounded w-40" />
            <input type="text" placeholder="Search Item or Barcode..." value={reportFilters.search} onChange={e => setReportFilters({...reportFilters, search: e.target.value})} className="border p-2 rounded flex-1 bg-yellow-50 font-bold" />
            <div className="font-bold text-blue-900 bg-blue-100 px-4 py-2 rounded border border-blue-300">Total Found: {reportData.length} Items</div>
          </div>

          <div className="flex-1 overflow-auto bg-gray-50 p-2">
            <table className="w-full text-left text-sm border-collapse bg-white shadow-sm border">
              <thead className="bg-gray-200 sticky top-0 font-bold border-b-2">
                <tr><th className="p-2 border-r">Main Head</th><th className="p-2 border-r">Goods Name</th><th className="p-2 border-r">Brand</th><th className="p-2 border-r">Size</th><th className="p-2 border-r">Supplier</th><th className="p-2 border-r">Barcode</th><th className="p-2 border-r text-right">MRP</th><th className="p-2 text-center">In Stock</th></tr>
              </thead>
              <tbody>
                {reportData.map((inv, i) => (
                  <tr key={i} className="border-b hover:bg-yellow-50">
                    <td className="p-2 border-r font-bold text-gray-600">{inv.category}</td><td className="p-2 border-r font-bold text-blue-900">{inv.name}</td>
                    <td className="p-2 border-r">{inv.brand}</td><td className="p-2 border-r font-bold">{inv.size}</td><td className="p-2 border-r text-xs text-gray-600">{inv.supplierName}</td>
                    <td className="p-2 border-r font-mono">{inv.barcode}</td><td className="p-2 border-r text-right font-bold text-green-700">₹{inv.price}</td><td className="p-2 text-center font-bold text-red-600">{inv.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TOP BAR: SUPPLIER INFO --- */}
      <div className="bg-white border border-gray-300 p-2 shadow-sm flex items-center gap-4 mb-2">
        <span className="font-bold text-gray-700 w-24">Supplier Name</span>
        <div onClick={() => setShowSupplierModal(true)} className="border-2 border-blue-400 p-1.5 w-64 bg-blue-50 cursor-pointer font-bold text-blue-900 flex justify-between items-center rounded">
          {supplier.name ? supplier.name : <span className="text-gray-400 font-normal">Click to select...</span>} <span className="text-xs">🔍</span>
        </div>
        <span className="font-bold text-gray-700">LR No</span><input type="text" value={supplier.lrNo} onChange={e => handleSupplierChange(e, 'lrNo')} className="border p-1.5 w-32 focus:bg-yellow-50 rounded" />
        <span className="font-bold text-gray-700">Purchase BillNo</span><input type="text" value={supplier.billNo} onChange={e => handleSupplierChange(e, 'billNo')} className="border p-1.5 w-32 focus:bg-yellow-50 rounded" />
        <span className="font-bold text-gray-700">Date</span><input type="date" value={supplier.date} onChange={e => handleSupplierChange(e, 'date')} className="border p-1.5 rounded" />
        <div className="ml-auto flex gap-2">
          <button onClick={() => setIsSettingUp(true)} className="bg-gray-800 text-white px-3 py-1.5 rounded font-bold shadow-sm hover:bg-black">⚙️ Setup</button>
        </div>
      </div>

      <div className="flex flex-1 gap-2 overflow-hidden">
        
        {/* LEFT COLUMN: ITEM FORM */}
        <div className="w-[350px] bg-white border border-gray-300 shadow-sm p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Main Head</span><select value={item.category} onChange={e => handleItemChange(e, 'category')} className="flex-1 border p-1 rounded"><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select></div>
          <div className="flex gap-2 mt-2"><span className="w-24 font-bold text-blue-900">Goods Name *</span><input type="text" value={item.name} onChange={e => handleItemChange(e, 'name')} placeholder="Required" className="flex-1 border-2 border-blue-400 p-1.5 font-bold focus:bg-yellow-50 rounded bg-blue-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Barcode</span><input type="text" value={item.barcode} onChange={e => handleItemChange(e, 'barcode')} placeholder="Leave blank to auto-gen" className="flex-1 border-2 border-gray-400 p-1.5 font-mono font-bold focus:bg-yellow-50 rounded" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Brand</span><input type="text" value={item.brand} onChange={e => handleItemChange(e, 'brand')} placeholder="Optional" className="flex-1 border p-1.5 focus:bg-yellow-50 rounded" /></div>
          <div className="flex gap-2 items-center"><span className="w-24 font-bold text-gray-700">Size</span><input type="text" value={item.size} onChange={e => handleItemChange(e, 'size')} className="flex-1 border p-1.5 focus:bg-yellow-50 uppercase rounded" />
            <button onClick={openMatrix} className="bg-purple-100 border border-purple-400 text-purple-800 font-bold px-2 py-1.5 rounded shadow-sm hover:bg-purple-200" title="Auto-Generate Size Range">📏 Rules</button>
          </div>
          <div className="border-t-2 border-gray-300 my-2"></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Pur Price</span><input type="number" value={item.purPrice} onChange={e => handleItemChange(e, 'purPrice')} className="flex-1 border p-1.5 focus:bg-yellow-50 rounded" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-green-700">MRP *</span><input type="number" value={item.mrp} onChange={e => handleItemChange(e, 'mrp')} className="flex-1 border-2 border-green-500 p-1.5 font-bold bg-green-50 rounded" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-red-600">Qty / Stock *</span><input type="number" value={item.qty} onChange={e => handleItemChange(e, 'qty')} className="flex-1 border-2 border-red-500 p-1.5 font-bold bg-red-50 text-center text-lg rounded" /></div>

          <div className="flex gap-2 mt-4">
            <button onClick={addToStaging} className="flex-[2] bg-blue-100 text-blue-900 border-2 border-blue-400 font-bold py-2 shadow-sm hover:bg-blue-200 rounded">➕ Add to List</button>
            <button onClick={() => setItem({ ...item, barcode: '', name: '', purPrice: '', mrp: '', qty: '1' })} className="flex-1 bg-gray-200 border border-gray-400 py-2 hover:bg-gray-300 font-bold text-gray-700 rounded">Clear</button>
          </div>
        </div>

        {/* MIDDLE AREA: EXCEL-STYLE EDITABLE TABLE */}
        <div className="flex-1 bg-white border border-gray-300 shadow-sm flex flex-col overflow-hidden">
          <div className={`p-2 border-b flex justify-between items-center ${isEditMode ? 'bg-orange-200 border-orange-400' : 'bg-gray-200'}`}>
            <span className="font-extrabold text-gray-800 text-base">
              {isEditMode ? `🔍 Live Master Database (Click cell to edit)` : `📋 Temporary Staging List (Click cell to edit)`}
            </span>
            <div className="flex items-center gap-4">
              {dirtyCount > 0 && isEditMode && (<span className="bg-red-100 text-red-800 px-2 py-1 rounded font-bold text-xs border border-red-300 animate-pulse">⚠️ {dirtyCount} Unsaved Edits</span>)}
              <label className="flex items-center gap-2 font-bold text-red-700 cursor-pointer bg-white px-4 py-1.5 border-2 border-red-400 rounded shadow-sm hover:bg-red-50 transition-colors">
                <input type="checkbox" checked={isEditMode} onChange={(e) => { setIsEditMode(e.target.checked); if(!e.target.checked) fetchLiveStock(); }} className="w-5 h-5 cursor-pointer" /> Edit / Delete? (Live Search)
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-100 sticky top-0 font-bold border-b-2 border-gray-400">
                <tr>
                  <th className="p-2 border-r w-12 text-center">Sr</th><th className="p-2 border-r">Goods Name</th><th className="p-2 border-r w-24">Brand</th><th className="p-2 border-r w-16">Size</th>
                  <th className="p-2 border-r w-24">Sale Price</th><th className="p-2 border-r w-24">Pur Price</th><th className="p-2 border-r w-32">Barcode</th>
                  {isEditMode && <th className="p-2 border-r w-24">Supplier</th>}
                  <th className="p-2 border-r w-16 text-center">Qty</th><th className="p-2 text-center w-12">Del</th>
                </tr>
              </thead>
              <tbody>
                {!isEditMode && staging.map((stg, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-yellow-50">
                    <td className="p-2 border-r text-center font-bold text-gray-500">{idx + 1}</td>
                    <td className="p-1 border-r"><input className={inputClass} value={stg.name} onChange={e => updateStagingRow(idx, 'name', e.target.value)} /></td>
                    <td className="p-1 border-r"><input className={inputClass} value={stg.brand} onChange={e => updateStagingRow(idx, 'brand', e.target.value)} /></td>
                    <td className="p-1 border-r"><input className={inputClass} value={stg.size} onChange={e => updateStagingRow(idx, 'size', e.target.value)} /></td>
                    <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={stg.mrp} onChange={e => updateStagingRow(idx, 'mrp', e.target.value)} /></td>
                    <td className="p-1 border-r"><input type="number" className={inputClass} value={stg.purPrice} onChange={e => updateStagingRow(idx, 'purPrice', e.target.value)} /></td>
                    <td className="p-2 border-r font-mono font-bold text-purple-700 bg-gray-50">{stg.barcode}</td>
                    <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center text-red-600`} value={stg.qty} onChange={e => updateStagingRow(idx, 'qty', e.target.value)} /></td>
                    <td className="p-2 text-center"><button onClick={() => setStaging(staging.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 font-bold">❌</button></td>
                  </tr>
                ))}
                
                {isEditMode && filteredLiveStock.map((inv, idx) => (
                  <tr key={idx} className={`border-b border-gray-200 hover:bg-orange-50 ${dirtyEdits[inv.barcode] ? 'bg-orange-100' : 'bg-white'}`}>
                    <td className="p-2 border-r text-center text-gray-500">{idx + 1}</td>
                    <td className="p-1 border-r"><input className={inputClass} value={inv.name} onChange={e => updateLiveRow(inv.barcode, 'name', e.target.value)} /></td>
                    <td className="p-1 border-r"><input className={inputClass} value={inv.brand} onChange={e => updateLiveRow(inv.barcode, 'brand', e.target.value)} /></td>
                    <td className="p-1 border-r"><input className={inputClass} value={inv.size} onChange={e => updateLiveRow(inv.barcode, 'size', e.target.value)} /></td>
                    <td className="p-1 border-r"><input type="number" className={`${inputClass} text-green-700`} value={inv.price} onChange={e => updateLiveRow(inv.barcode, 'price', e.target.value)} /></td>
                    <td className="p-1 border-r"><input type="number" className={inputClass} value={inv.purchasePrice} onChange={e => updateLiveRow(inv.barcode, 'purchasePrice', e.target.value)} /></td>
                    <td className="p-2 border-r font-mono text-blue-700 bg-gray-50">{inv.barcode}</td>
                    <td className="p-1 border-r"><input className={inputClass} value={inv.supplierName} onChange={e => updateLiveRow(inv.barcode, 'supplierName', e.target.value)} /></td>
                    <td className="p-1 border-r"><input type="number" className={`${inputClass} text-center font-bold`} value={inv.qty} onChange={e => updateLiveRow(inv.barcode, 'qty', e.target.value)} /></td>
                    <td className="p-1 text-center"><button onClick={() => deleteLiveItem(inv.barcode)} className="text-red-500 hover:text-red-700 font-bold">❌</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-200 border-t-2 border-gray-400 p-3 flex items-center justify-between">
            <div className="flex gap-4">
              {!isEditMode ? (
                <><button onClick={() => handleStockIn(false)} className="bg-white border-2 border-gray-400 font-bold py-2.5 px-8 hover:bg-gray-100 shadow-sm text-gray-800 rounded">💾 Stock In Only</button>
                  <button onClick={() => handleStockIn(true)} className="bg-green-700 text-white border-2 border-green-900 font-bold py-2.5 px-8 shadow-sm hover:bg-green-600 rounded">🖨️ Print & Stock In</button></>
              ) : (
                <button onClick={saveSafeEdits} className="bg-orange-600 text-white border-2 border-orange-800 font-bold py-2.5 px-8 shadow-sm hover:bg-orange-700 rounded transition-colors">💾 Save Edits to Database</button>
              )}
            </div>
            <button onClick={() => setShowStockReport(true)} className="bg-blue-800 text-white font-bold py-2.5 px-8 hover:bg-blue-900 shadow-sm rounded">📊 View Stock Report</button>
          </div>
        </div>
      </div>
    </div>
  );
}
