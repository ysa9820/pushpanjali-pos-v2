import React, { useState, useEffect } from 'react';
import Barcode from 'react-barcode';

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerName, setPrinterName] = useState(localStorage.getItem('barcode_printer') || '');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));

  // Supplier Top Bar
  const [supplier, setSupplier] = useState({ name: '', lrNo: '', billNo: '', date: new Date().toISOString().split('T')[0] });

  // Left Column Form
  const [item, setItem] = useState({ category: 'Mens', subCategory: 'Shirt', name: '', barcode: '', brand: '', size: '', purPrice: '', mrp: '', qty: '1', hsn: '' });

  // Middle Staging Area
  const [staging, setStaging] = useState([]);
  
  // Edit/Delete Mode States
  const [isEditMode, setIsEditMode] = useState(false);
  const [liveStock, setLiveStock] = useState([]);
  const [printQueue, setPrintQueue] = useState([]);

  // Fetch Live Stock when "Edit Mode" is checked
  useEffect(() => {
    if (isEditMode && serverIP) {
      fetch(`http://${serverIP}:5000/api/inventory`)
        .then(res => res.json())
        .then(data => setLiveStock(data))
        .catch(() => alert("Cannot connect to server! Check IP Address."));
    }
  }, [isEditMode, serverIP]);

  const handleItemChange = (e, field) => setItem({ ...item, [field]: e.target.value });
  const handleSupplierChange = (e, field) => setSupplier({ ...supplier, [field]: e.target.value });

  const addToStaging = () => {
    if (!item.barcode || !item.name || !item.mrp) return alert("Barcode, Name, and MRP are required!");
    setStaging([...staging, { ...item, supplierName: supplier.name }]);
    setItem({ ...item, barcode: '', qty: '1' });
  };

  const handleStockIn = async (shouldPrint) => {
    if (staging.length === 0) return alert("Staging list is empty!");
    
    try {
      for (const stgItem of staging) {
        await fetch(`http://${serverIP}:5000/api/inventory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            barcode: stgItem.barcode, name: stgItem.name, category: stgItem.category, 
            qty: stgItem.qty, price: stgItem.mrp, purchasePrice: stgItem.purPrice, 
            brand: stgItem.brand, size: stgItem.size, hsn: stgItem.hsn 
          })
        });
      }

      if (shouldPrint) {
        setPrintQueue(staging);
        setTimeout(() => { 
          window.print(); // Will route to TSC if set as default, or we can use Electron IPC later
          setPrintQueue([]); 
        }, 500);
      }

      alert("✅ Successfully Stocked In to Master Database!");
      setStaging([]);
    } catch (err) {
      alert("Error sending to Master Server.");
    }
  };

  const deleteLiveItem = async (barcode) => {
    if (!window.confirm("Permanently delete this item from Master Database?")) return;
    await fetch(`http://${serverIP}:5000/api/inventory/${barcode}`, { method: 'DELETE' });
    setLiveStock(liveStock.filter(i => i.barcode !== barcode));
  };

  const filteredLiveStock = liveStock.filter(inv => {
    return inv.name.toLowerCase().includes(item.name.toLowerCase()) && inv.barcode.includes(item.barcode);
  });

  // --- LOCAL HARDWARE & NETWORK SETUP MODAL ---
  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ Local PC Setup</h1>
          
          <div className="mb-4">
            <label className="font-bold text-gray-700 text-sm">Master Server IP Address</label>
            <p className="text-xs text-gray-500 mb-1">Look at the Master Server app on your Cabin PC to get this number.</p>
            <input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="e.g. 192.168.1.50" className="w-full border-2 border-blue-400 p-2 rounded font-bold text-lg bg-blue-50" />
          </div>

          <div className="mb-6">
            <label className="font-bold text-gray-700 text-sm">Barcode Printer Name (Optional)</label>
            <p className="text-xs text-gray-500 mb-1">Type the exact Windows printer name (e.g. TSC TE244) to enable auto-printing.</p>
            <input type="text" value={printerName} onChange={(e) => setPrinterName(e.target.value)} placeholder="e.g. TSC TE244" className="w-full border-2 border-gray-400 p-2 rounded font-bold text-lg" />
          </div>

          <button onClick={() => { 
            localStorage.setItem('server_ip', serverIP); 
            localStorage.setItem('barcode_printer', printerName);
            setIsSettingUp(false); 
          }} className="w-full bg-green-600 text-white font-bold py-3 rounded hover:bg-green-700 shadow-md">
            Save & Launch Stock Room
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans text-sm overflow-hidden p-2">
      
      {/* HIDDEN PRINT LAYOUT FOR TSC PRINTER */}
      <div id="printable-barcode" className="hidden print:flex flex-col gap-2">
        {printQueue.map((p, idx) => (
          Array.from({ length: p.qty }).map((_, i) => (
            <div key={`${idx}-${i}`} className="w-[50mm] h-[25mm] bg-white flex flex-col items-center justify-center p-1 border">
              <div className="font-bold text-[10px] uppercase">Pushpanjali Fashion</div>
              <Barcode value={p.barcode} width={1.2} height={20} fontSize={10} margin={0} displayValue={true} />
              <div className="font-bold text-[12px]">₹ {p.mrp}</div>
            </div>
          ))
        ))}
      </div>

      {/* TOP BAR: SUPPLIER INFO & SETUP BUTTON */}
      <div className="bg-white border border-gray-300 p-2 shadow-sm flex items-center gap-4 mb-2">
        <span className="font-bold text-gray-700 w-24">Supplier Name</span>
        <input type="text" value={supplier.name} onChange={e => handleSupplierChange(e, 'name')} className="border p-1 w-64 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">LR No</span>
        <input type="text" value={supplier.lrNo} onChange={e => handleSupplierChange(e, 'lrNo')} className="border p-1 w-32 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">Purchase BillNo</span>
        <input type="text" value={supplier.billNo} onChange={e => handleSupplierChange(e, 'billNo')} className="border p-1 w-32 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">Date</span>
        <input type="date" value={supplier.date} onChange={e => handleSupplierChange(e, 'date')} className="border p-1" />
        
        {/* NETWORK & SETUP ICONS */}
        <div className="ml-auto flex gap-2">
          <div className="text-xs text-blue-800 font-bold border-2 border-blue-300 bg-blue-100 px-3 py-1.5 rounded flex items-center shadow-sm">
            📡 Server: {serverIP}
          </div>
          <button onClick={() => setIsSettingUp(true)} className="bg-gray-800 text-white px-3 py-1.5 rounded font-bold shadow-sm hover:bg-black">
            ⚙️ Setup
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-2 overflow-hidden">
        
        {/* LEFT COLUMN: ITEM FORM */}
        <div className="w-[340px] bg-white border border-gray-300 shadow-sm p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Main Head</span><select value={item.category} onChange={e => handleItemChange(e, 'category')} className="flex-1 border p-1"><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Sub Head</span><input type="text" value={item.subCategory} onChange={e => handleItemChange(e, 'subCategory')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2 mt-2"><span className="w-24 font-bold text-gray-700 text-blue-900">Goods Name</span><input type="text" value={item.name} onChange={e => handleItemChange(e, 'name')} className="flex-1 border-2 border-blue-400 p-1 font-bold focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Barcode</span><input type="text" value={item.barcode} onChange={e => handleItemChange(e, 'barcode')} className="flex-1 border-2 border-gray-400 p-1 font-mono font-bold focus:bg-yellow-50" /></div>
          
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Brand</span><input type="text" value={item.brand} onChange={e => handleItemChange(e, 'brand')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Size</span><input type="text" value={item.size} onChange={e => handleItemChange(e, 'size')} className="flex-1 border p-1 focus:bg-yellow-50 uppercase" /></div>
          
          <div className="border-t-2 border-gray-300 my-2"></div>
          
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Pur Price</span><input type="number" value={item.purPrice} onChange={e => handleItemChange(e, 'purPrice')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700 text-green-700">MRP</span><input type="number" value={item.mrp} onChange={e => handleItemChange(e, 'mrp')} className="flex-1 border-2 border-green-500 p-1 font-bold bg-green-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-red-600">Qty / Stock</span><input type="number" value={item.qty} onChange={e => handleItemChange(e, 'qty')} className="flex-1 border-2 border-red-500 p-1 font-bold bg-red-50 text-center text-lg" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">HSN Code</span><input type="text" value={item.hsn} onChange={e => handleItemChange(e, 'hsn')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>

          <div className="flex gap-2 mt-4">
            <button onClick={addToStaging} className="flex-1 bg-blue-100 text-blue-900 border-2 border-blue-400 font-bold py-2 shadow-sm hover:bg-blue-200">➕ Add to List</button>
            <button onClick={() => setItem({ ...item, barcode: '', name: '', purPrice: '', mrp: '', qty: '1' })} className="w-1/3 bg-gray-200 border border-gray-400 py-2 hover:bg-gray-300 font-bold text-gray-700">Clear</button>
          </div>
        </div>

        {/* MIDDLE AREA: STAGING OR LIVE EDIT TABLE */}
        <div className="flex-1 bg-white border border-gray-300 shadow-sm flex flex-col overflow-hidden">
          
          {/* Header row toggles based on Edit Mode */}
          <div className={`p-2 border-b flex justify-between items-center ${isEditMode ? 'bg-orange-200 border-orange-400' : 'bg-gray-200'}`}>
            <span className="font-extrabold text-gray-800 text-base">
              {isEditMode ? `🔍 Live Master Database (Filtered by Form)` : `📋 Temporary Staging List (${staging.length} Items)`}
            </span>
            <label className="flex items-center gap-2 font-bold text-red-700 cursor-pointer bg-white px-4 py-1.5 border-2 border-red-400 rounded shadow-sm hover:bg-red-50 transition-colors">
              <input type="checkbox" checked={isEditMode} onChange={(e) => setIsEditMode(e.target.checked)} className="w-5 h-5 cursor-pointer" />
              Edit / Delete? (Live Search)
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-gray-100 sticky top-0 font-bold border-b-2 border-gray-400">
                <tr>
                  <th className="p-2 border-r w-12 text-center">Sr</th>
                  <th className="p-2 border-r">Goods Name</th>
                  <th className="p-2 border-r w-24">Brand</th>
                  <th className="p-2 border-r w-16">Size</th>
                  <th className="p-2 border-r w-24">Sale Price</th>
                  <th className="p-2 border-r w-24">Pur Price</th>
                  <th className="p-2 border-r w-32">Barcode</th>
                  <th className="p-2 border-r w-16 text-center">Qty</th>
                  {isEditMode && <th className="p-2 text-center w-20">Action</th>}
                </tr>
              </thead>
              <tbody>
                {!isEditMode && staging.map((stg, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-yellow-50">
                    <td className="p-2 border-r text-center font-bold text-gray-500">{idx + 1}</td><td className="p-2 border-r font-bold text-blue-900">{stg.name}</td>
                    <td className="p-2 border-r">{stg.brand}</td><td className="p-2 border-r font-bold">{stg.size}</td>
                    <td className="p-2 border-r font-bold text-green-700 text-base">₹{stg.mrp}</td><td className="p-2 border-r text-gray-600">₹{stg.purPrice}</td>
                    <td className="p-2 border-r font-mono">{stg.barcode}</td><td className="p-2 border-r text-center font-bold text-red-600">{stg.qty}</td>
                  </tr>
                ))}
                
                {isEditMode && filteredLiveStock.map((inv, idx) => (
                  <tr key={idx} className="border-b border-gray-200 hover:bg-orange-50 bg-white">
                    <td className="p-2 border-r text-center text-gray-500">{idx + 1}</td><td className="p-2 border-r font-bold">{inv.name}</td>
                    <td className="p-2 border-r">{inv.brand}</td><td className="p-2 border-r font-bold">{inv.size}</td>
                    <td className="p-2 border-r font-bold text-green-700 text-base">₹{inv.price}</td><td className="p-2 border-r text-gray-600">₹{inv.purchasePrice}</td>
                    <td className="p-2 border-r font-mono text-blue-700">{inv.barcode}</td><td className="p-2 border-r text-center font-bold">{inv.qty}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => deleteLiveItem(inv.barcode)} className="bg-red-500 text-white px-3 py-1 rounded shadow hover:bg-red-600 font-bold">Del</button>
                    </td>
                  </tr>
                ))}

                {!isEditMode && staging.length === 0 && <tr><td colSpan="8" className="p-12 text-center text-gray-400 font-bold text-lg">Staging List is empty. Fill the form on the left to add items.</td></tr>}
                {isEditMode && filteredLiveStock.length === 0 && <tr><td colSpan="9" className="p-12 text-center text-gray-400 font-bold text-lg">No items in the master database match your left column inputs.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* BOTTOM ROW BUTTONS */}
          <div className="bg-gray-200 border-t-2 border-gray-400 p-3 flex items-center justify-between">
            <div className="flex gap-4">
              <button onClick={() => handleStockIn(false)} className="bg-white border-2 border-gray-400 font-bold py-2.5 px-8 hover:bg-gray-100 shadow-sm text-gray-800 rounded">
                💾 Stock In Only
              </button>
              <button onClick={() => handleStockIn(true)} className="bg-green-700 text-white border-2 border-green-900 font-bold py-2.5 px-8 shadow-sm hover:bg-green-600 rounded">
                🖨️ Print Barcodes & Stock In
              </button>
            </div>
            
            <button className="bg-blue-800 text-white font-bold py-2.5 px-8 hover:bg-blue-900 shadow-sm rounded">
              📊 View Stock Report
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
