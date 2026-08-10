import React, { useState, useEffect } from 'react';
import Barcode from 'react-barcode';

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
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

  // Setup Screen
  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <div className="bg-white p-8 rounded shadow-lg w-96 text-center">
          <h1 className="text-xl font-bold mb-4">Connect to Master Server</h1>
          <p className="text-sm text-gray-600 mb-4">Look at the Master Server window on your Cabin PC and enter the IP Address below:</p>
          <input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="e.g. 192.168.1.50" className="w-full border-2 border-blue-400 p-3 rounded font-bold text-center text-lg mb-4" />
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); setIsSettingUp(false); }} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700">Connect Stock Room</button>
        </div>
      </div>
    );
  }

  // Fetch Live Stock when "Edit Mode" is checked
  useEffect(() => {
    if (isEditMode) {
      fetch(`http://${serverIP}:5000/api/inventory`)
        .then(res => res.json())
        .then(data => setLiveStock(data))
        .catch(() => alert("Cannot connect to server!"));
    }
  }, [isEditMode, serverIP]);

  // Handle Form Inputs
  const handleItemChange = (e, field) => setItem({ ...item, [field]: e.target.value });
  const handleSupplierChange = (e, field) => setSupplier({ ...supplier, [field]: e.target.value });

  // Add to Staging List
  const addToStaging = () => {
    if (!item.barcode || !item.name || !item.mrp) return alert("Barcode, Name, and MRP are required!");
    setStaging([...staging, { ...item, supplierName: supplier.name }]);
    // Clear barcode and qty for the next quick entry, but keep brand/category/prices sticky!
    setItem({ ...item, barcode: '', qty: '1' });
  };

  // Finalize Stock (Send to Server)
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
        setTimeout(() => { window.print(); setPrintQueue([]); }, 500);
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

  // Live Filtering Logic (Genius UI)
  const filteredLiveStock = liveStock.filter(inv => {
    return inv.name.toLowerCase().includes(item.name.toLowerCase()) && inv.barcode.includes(item.barcode);
  });

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 font-sans text-sm overflow-hidden p-2">
      
      {/* HIDDEN PRINT LAYOUT */}
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

      {/* TOP BAR: SUPPLIER INFO */}
      <div className="bg-white border border-gray-300 p-2 shadow-sm flex items-center gap-4 mb-2">
        <span className="font-bold text-gray-700 w-24">Supplier Name</span>
        <input type="text" value={supplier.name} onChange={e => handleSupplierChange(e, 'name')} className="border p-1 w-64 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">LR No</span>
        <input type="text" value={supplier.lrNo} onChange={e => handleSupplierChange(e, 'lrNo')} className="border p-1 w-32 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">Purchase BillNo</span>
        <input type="text" value={supplier.billNo} onChange={e => handleSupplierChange(e, 'billNo')} className="border p-1 w-32 focus:bg-yellow-50" />
        <span className="font-bold text-gray-700">Date</span>
        <input type="date" value={supplier.date} onChange={e => handleSupplierChange(e, 'date')} className="border p-1" />
        
        <div className="ml-auto text-xs text-blue-600 font-bold border border-blue-300 bg-blue-50 px-2 py-1 rounded">
          Connected to Server: {serverIP}
        </div>
      </div>

      <div className="flex flex-1 gap-2 overflow-hidden">
        
        {/* LEFT COLUMN: ITEM FORM */}
        <div className="w-80 bg-white border border-gray-300 shadow-sm p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Main Head</span><select value={item.category} onChange={e => handleItemChange(e, 'category')} className="flex-1 border p-1"><option>Mens</option><option>Girls</option><option>Boys</option><option>Saree</option></select></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Sub Head</span><input type="text" value={item.subCategory} onChange={e => handleItemChange(e, 'subCategory')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2 mt-2"><span className="w-24 font-bold text-gray-700 text-blue-900">Goods Name</span><input type="text" value={item.name} onChange={e => handleItemChange(e, 'name')} className="flex-1 border-2 border-blue-300 p-1 font-bold focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Barcode</span><input type="text" value={item.barcode} onChange={e => handleItemChange(e, 'barcode')} className="flex-1 border border-gray-400 p-1 font-mono font-bold focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Brand</span><input type="text" value={item.brand} onChange={e => handleItemChange(e, 'brand')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Size</span><input type="text" value={item.size} onChange={e => handleItemChange(e, 'size')} className="flex-1 border p-1 focus:bg-yellow-50 uppercase" /></div>
          
          <div className="border-t border-gray-300 my-1"></div>
          
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">Pur Price</span><input type="number" value={item.purPrice} onChange={e => handleItemChange(e, 'purPrice')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700 text-green-700">MRP</span><input type="number" value={item.mrp} onChange={e => handleItemChange(e, 'mrp')} className="flex-1 border-2 border-green-400 p-1 font-bold bg-green-50" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-red-600">Qty / Stock</span><input type="number" value={item.qty} onChange={e => handleItemChange(e, 'qty')} className="flex-1 border-2 border-red-400 p-1 font-bold bg-red-50 text-center" /></div>
          <div className="flex gap-2"><span className="w-24 font-bold text-gray-700">HSN Code</span><input type="text" value={item.hsn} onChange={e => handleItemChange(e, 'hsn')} className="flex-1 border p-1 focus:bg-yellow-50" /></div>

          <div className="flex gap-2 mt-4">
            <button onClick={addToStaging} className="flex-1 bg-white border-2 border-gray-400 font-bold py-2 hover:bg-gray-200">Add to List</button>
            <button onClick={() => setItem({ ...item, barcode: '', name: '', purPrice: '', mrp: '', qty: '1' })} className="flex-1 bg-white border border-gray-300 py-2 hover:bg-gray-100">Clear Form</button>
          </div>
        </div>

        {/* MIDDLE AREA: STAGING OR LIVE EDIT TABLE */}
        <div className="flex-1 bg-white border border-gray-300 shadow-sm flex flex-col overflow-hidden">
          
          {/* Header row toggles based on Edit Mode */}
          <div className={`p-2 border-b flex justify-between items-center ${isEditMode ? 'bg-orange-100' : 'bg-gray-100'}`}>
            <span className="font-bold text-gray-800">
              {isEditMode ? `Live Master Database (Auto-Filtered by Form)` : `Temporary Staging List (${staging.length} Items)`}
            </span>
            <label className="flex items-center gap-2 font-bold text-red-600 cursor-pointer bg-white px-3 py-1 border border-red-300 rounded shadow-sm hover:bg-red-50">
              <input type="checkbox" checked={isEditMode} onChange={(e) => setIsEditMode(e.target.checked)} className="w-4 h-4 cursor-pointer" />
              Edit / Delete? (Live Search)
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-200 sticky top-0 font-bold border-b border-gray-400">
                <tr>
                  <th className="p-2 border-r w-10">SrNo</th>
                  <th className="p-2 border-r">Goods Name</th>
                  <th className="p-2 border-r">Brand</th>
                  <th className="p-2 border-r">Size</th>
                  <th className="p-2 border-r">Sale Price</th>
                  <th className="p-2 border-r">Pur Price</th>
                  <th className="p-2 border-r">Barcode</th>
                  <th className="p-2 border-r w-16 text-center">Qty</th>
                  {isEditMode && <th className="p-2 text-center w-20">Action</th>}
                </tr>
              </thead>
              <tbody>
                {!isEditMode && staging.map((stg, idx) => (
                  <tr key={idx} className="border-b hover:bg-yellow-50">
                    <td className="p-2 border-r">{idx + 1}</td><td className="p-2 border-r font-bold">{stg.name}</td>
                    <td className="p-2 border-r">{stg.brand}</td><td className="p-2 border-r">{stg.size}</td>
                    <td className="p-2 border-r font-bold text-green-700">₹{stg.mrp}</td><td className="p-2 border-r">₹{stg.purPrice}</td>
                    <td className="p-2 border-r font-mono">{stg.barcode}</td><td className="p-2 border-r text-center font-bold text-red-600">{stg.qty}</td>
                  </tr>
                ))}
                
                {isEditMode && filteredLiveStock.map((inv, idx) => (
                  <tr key={idx} className="border-b hover:bg-orange-50 bg-white">
                    <td className="p-2 border-r">{idx + 1}</td><td className="p-2 border-r font-bold">{inv.name}</td>
                    <td className="p-2 border-r">{inv.brand}</td><td className="p-2 border-r">{inv.size}</td>
                    <td className="p-2 border-r font-bold text-green-700">₹{inv.price}</td><td className="p-2 border-r">₹{inv.purchasePrice}</td>
                    <td className="p-2 border-r font-mono text-blue-700">{inv.barcode}</td><td className="p-2 border-r text-center font-bold">{inv.qty}</td>
                    <td className="p-2 text-center">
                      <button onClick={() => deleteLiveItem(inv.barcode)} className="bg-red-500 text-white px-2 py-1 rounded shadow hover:bg-red-600 font-bold">Del</button>
                    </td>
                  </tr>
                ))}

                {!isEditMode && staging.length === 0 && <tr><td colSpan="8" className="p-8 text-center text-gray-400">List is empty. Add items from the left column.</td></tr>}
                {isEditMode && filteredLiveStock.length === 0 && <tr><td colSpan="9" className="p-8 text-center text-gray-400">No items in master database match your left column inputs.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* BOTTOM ROW BUTTONS */}
          <div className="bg-gray-200 border-t border-gray-400 p-2 flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={() => handleStockIn(false)} className="bg-white border-2 border-gray-400 font-bold py-2 px-6 hover:bg-gray-100 shadow-sm">Stock In</button>
              <button onClick={() => handleStockIn(true)} className="bg-green-700 text-white border-2 border-green-800 font-bold py-2 px-6 shadow-sm hover:bg-green-600">Print & Stock In</button>
            </div>
            
            <button className="bg-white border border-gray-400 font-bold py-2 px-6 hover:bg-gray-100 shadow-sm ml-auto">Stock Report</button>
          </div>

        </div>
      </div>
    </div>
  );
}
