import React, { useState, useEffect, useRef } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

// Anti-freeze helpers
const safeAlert = (msg) => { if (document.activeElement) document.activeElement.blur(); setTimeout(() => alert(msg), 10); };
const safeConfirm = (msg) => { if (document.activeElement) document.activeElement.blur(); return window.confirm(msg); };

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerPath, setPrinterPath] = useState(localStorage.getItem('receipt_printer') || '\\\\localhost\\Retsol');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));
  const [firmSettings, setFirmSettings] = useState({ receiptLayout: [] });

  const [users, setUsers] = useState([]);
  const [pinInput, setPinInput] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);

  const [inventory, setInventory] = useState([]);
  const [cart, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeRef = useRef(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);

  const [customer, setCustomer] = useState({ name: '', mobile: '' });
  const [paymentMode, setPaymentMode] = useState('CASH');

  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });
  const [appConfirm, setAppConfirm] = useState({ show: false, msg: '', onYes: null });

  const closeAlert = () => { setAppAlert({ show: false, msg: '' }); setTimeout(() => { if (barcodeRef.current) barcodeRef.current.focus(); }, 100); };
  const closeConfirm = () => { setAppConfirm({ show: false, msg: '', onYes: null }); setTimeout(() => { if (barcodeRef.current) barcodeRef.current.focus(); }, 100); };

  useEffect(() => {
    if (serverIP && !isSettingUp) {
      fetch(`http://${serverIP}:5000/api/users`).then(res => res.json()).then(setUsers).catch(() => {});
      fetch(`http://${serverIP}:5000/api/settings`).then(res => res.json()).then(data => {
        if(!data.receiptLayout) data.receiptLayout = ["HEADER_SHOPNAME", "ITEM_TABLE", "TOTAL_AMOUNT"]; // Failsafe
        setFirmSettings(data);
      }).catch(() => {});
      fetchInventory();
    }
  }, [serverIP, isSettingUp]);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('print-finished', (event, result) => {
        setIsPrinting(false);
        if (!result.success) setAppAlert({ show: true, msg: `❌ Printer Error:\nMake sure your printer is shared in Windows as "${printerPath}"` });
      });
    }
    return () => { if (ipcRenderer) ipcRenderer.removeAllListeners('print-finished'); };
  }, [printerPath]);

  const fetchInventory = () => { fetch(`http://${serverIP}:5000/api/inventory`).then(res => res.json()).then(setInventory).catch(() => {}); };

  const handleLogin = () => {
    const user = users.find(u => u.pin === pinInput);
    if (user) { setLoggedInUser(user); setPinInput(''); } else { setAppAlert({ show: true, msg: "Invalid PIN" }); setPinInput(''); }
  };

  const handleLogout = () => { setLoggedInUser(null); setCart([]); setCustomer({name:'', mobile:''}); };

  const addToCart = (item, code) => {
    const existing = cart.find(c => c.barcode.toLowerCase() === code);
    if (existing) setCart(cart.map(c => c.barcode.toLowerCase() === code ? { ...c, cartQty: c.cartQty + 1 } : c));
    else setCart([...cart, { ...item, cartQty: 1, originalPrice: item.price }]);
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim().toLowerCase();
    if (!code) return;

    const item = inventory.find(i => i.barcode.toLowerCase() === code);
    if (!item) { setAppAlert({ show: true, msg: `Barcode [${barcodeInput}] not found in master!` }); setBarcodeInput(''); return; }
    
    if (item.qty <= 0) {
      setAppConfirm({ show: true, msg: `Item is OUT OF STOCK in database. Sell anyway?`, onYes: () => { addToCart(item, code); } });
      setBarcodeInput(''); return;
    }
    addToCart(item, code); setBarcodeInput('');
  };

  const updateCartQty = (index, newQty) => {
    if (newQty <= 0) { setCart(cart.filter((_, i) => i !== index)); return; }
    const newCart = [...cart]; newCart[index].cartQty = newQty; setCart(newCart);
  };

  const updateCartPrice = (index, newPrice) => {
    const newCart = [...cart]; newCart[index].price = newPrice; setCart(newCart);
  };

  const totalAmount = cart.reduce((sum, item) => sum + (parseFloat(item.price) * item.cartQty), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.cartQty, 0);

  const processCheckout = async () => {
    if (cart.length === 0) return setAppAlert({ show: true, msg: "Cart is empty!" });
    if (paymentMode === 'CREDIT' && (!customer.name || !customer.mobile)) return setAppAlert({ show: true, msg: "Customer Name & Mobile required for Udhaar." });

    try {
      const payload = {
        cart: cart.map(c => ({ barcode: c.barcode, name: c.name, size: c.size, qty: c.cartQty, price: c.price, total: c.cartQty * c.price })),
        totalAmount, paymentMethod: paymentMode, cashierName: loggedInUser.name,
        customerName: customer.name, customerMobile: customer.mobile, terminalId: 'T1'
      };

      const res = await fetch(`http://${serverIP}:5000/api/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (data.success) {
        setLastInvoice(data.sale); 
        
        if (ipcRenderer && printerPath) {
          setIsPrinting(true);
          ipcRenderer.send('print-receipt', { printerPath, invoice: data.sale, firmSettings });
          setTimeout(() => { setIsPrinting(false); if (barcodeRef.current) barcodeRef.current.focus(); }, 4000); 
        } else {
          setAppAlert({ show: true, msg: "✅ Bill Saved! (Printer path not set, skipping print)" });
        }
        
        setCart([]); setCustomer({ name: '', mobile: '' }); setPaymentMode('CASH'); fetchInventory();
      }
    } catch (e) { setAppAlert({ show: true, msg: "Server Error. Checkout failed." }); }
  };

  useEffect(() => {
    if (loggedInUser && barcodeRef.current && !appAlert.show && !appConfirm.show && !isPrinting) barcodeRef.current.focus();
  }, [loggedInUser, cart, isPrinting, appAlert.show, appConfirm.show]);

  // --- DYNAMIC HTML RECEIPT RENDERER ---
  const renderReceiptBlock = (blockId, idx) => {
    if (!lastInvoice) return null;
    
    switch(blockId) {
      case 'HEADER_SHOPNAME': return <div key={idx} className="text-center text-2xl font-black">{firmSettings.shopName}</div>;
      case 'HEADER_ADDRESS': return firmSettings.address ? <div key={idx} className="text-center text-[13px] mt-1">{firmSettings.address}</div> : null;
      case 'HEADER_PHONE_GST': return (firmSettings.phone || firmSettings.gstin) ? <div key={idx} className="text-center text-[13px] mt-1">{firmSettings.phone && `Ph: ${firmSettings.phone} `} {firmSettings.gstin && <span className="font-bold">GSTIN: {firmSettings.gstin}</span>}</div> : null;
      case 'DIVIDER_DASHED': return <div key={idx} className="border-b-[3px] border-dashed border-gray-400 my-2"></div>;
      case 'DIVIDER_SOLID': return <div key={idx} className="border-b-[3px] border-black my-2"></div>;
      case 'BILL_INFO': return <div key={idx} className="flex justify-between text-[13px]"><span className="font-bold">Bill No: {lastInvoice.invoice}</span><span>Date: {lastInvoice.date}</span></div>;
      case 'CASHIER_INFO': return <div key={idx} className="flex justify-between text-[13px]"><span>Cashier: {lastInvoice.cashier}</span><span>Time: {lastInvoice.time}</span></div>;
      case 'CUSTOMER_INFO': return lastInvoice.customerName ? <div key={idx} className="text-[13px] font-bold p-1 bg-gray-100 my-1">Customer: {lastInvoice.customerName} {lastInvoice.customerMobile && ` | Ph: ${lastInvoice.customerMobile}`}</div> : null;
      case 'ITEM_TABLE': return (
        <table key={idx} className="w-full text-left my-2">
          <thead><tr className="border-b border-black"><th className="w-1/2 pb-1 text-[14px]">Item / Barcode</th><th className="w-[15%] text-center pb-1 text-[14px]">Qty</th><th className="w-[15%] text-right pb-1 text-[14px]">Rate</th><th className="w-[20%] text-right pb-1 text-[14px]">Total</th></tr></thead>
          <tbody>
            {lastInvoice.items.map((i, iIdx) => (
              <tr key={iIdx} className="border-b border-dashed border-gray-300">
                <td className="py-1"><div className="font-bold">{i.name} {i.size ? `(Sz:${i.size})` : ''}</div><div className="text-[12px] text-gray-600">{i.barcode}</div></td>
                <td className="text-center align-middle py-1 font-bold">{i.qty}</td><td className="text-right align-middle py-1">{i.price}</td><td className="text-right align-middle py-1 font-bold">{i.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      case 'BLANK_SPACE_DYNAMIC': 
        const linesUsed = firmSettings.receiptLayout.length + (lastInvoice.items.length * 2);
        const paddingLines = Math.max(0, firmSettings.minReceiptLines - linesUsed);
        return paddingLines > 0 ? <div key={idx} style={{height: `${paddingLines * 4}mm`}}></div> : null;
      case 'TOTAL_AMOUNT': return <div key={idx} className="flex justify-between font-black text-xl my-2"><span>NET TOTAL ({lastInvoice.items.reduce((s,i)=>s+parseInt(i.qty),0)} Qty)</span><span>Rs. {lastInvoice.amount}</span></div>;
      case 'PAYMENT_METHOD': return <div key={idx} className="flex justify-between text-[14px] font-bold my-1"><span>Payment Method:</span><span className="border border-black px-2">{lastInvoice.method}</span></div>;
      case 'FOOTER_MESSAGE': return <div key={idx} className="text-center font-bold text-[13px] mt-4 pt-2">{firmSettings.billFooterMsg || 'Thank you for shopping!'}</div>;
      default: return null;
    }
  };

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ POS Hardware Setup</h1>
          <div className="mb-4"><label className="font-bold text-gray-700">Master Server IP</label><input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} placeholder="192.168.1.50" className="w-full border-2 p-2 rounded font-bold text-lg bg-blue-50 mt-1 outline-none" /></div>
          <div className="mb-6"><label className="font-bold text-gray-700">Shared Printer Network Path</label><input type="text" value={printerPath} onChange={(e) => setPrinterPath(e.target.value)} placeholder="\\localhost\Retsol" className="w-full border-2 p-2 rounded font-bold text-lg mt-1 outline-none" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); localStorage.setItem('receipt_printer', printerPath); setIsSettingUp(false); }} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700 shadow-md">Connect to Master</button>
        </div>
      </div>
    );
  }

  if (!loggedInUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        {appAlert.show && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p><button onClick={closeAlert} className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button></div></div>
        )}
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[400px] text-center border-t-8 border-blue-600">
          <h1 className="text-3xl font-black text-gray-800 mb-2">POS Terminal</h1>
          <p className="text-gray-500 font-bold mb-6">Enter PIN to Unlock Till</p>
          <input type="password" maxLength="4" value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} autoFocus onKeyDown={e => e.key === 'Enter' && handleLogin()} className="w-full border-4 border-gray-300 p-4 rounded-xl font-bold text-4xl tracking-[1em] text-center mb-6 focus:border-blue-600 outline-none shadow-inner" />
          <button onClick={handleLogin} className="w-full bg-blue-600 text-white font-black text-xl py-4 rounded-xl shadow-lg hover:bg-blue-700">UNLOCK TILL</button>
          <button onClick={() => setIsSettingUp(true)} className="mt-6 text-sm font-bold text-gray-400 hover:text-gray-600 underline">Hardware Settings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-200 font-sans overflow-hidden">
      
      {appAlert.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p><button onClick={closeAlert} autoFocus className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button></div></div> )}
      {appConfirm.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-yellow-500"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appConfirm.msg}</p><div className="flex justify-center gap-4"><button onClick={closeConfirm} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded hover:bg-gray-400">Cancel</button><button onClick={() => { appConfirm.onYes(); closeConfirm(); }} autoFocus className="bg-red-600 text-white font-bold py-2 px-6 rounded hover:bg-red-700">Yes, Proceed</button></div></div></div> )}

      {isPrinting && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded shadow-2xl text-center border-t-4 border-green-500">
            <h2 className="text-3xl font-black text-gray-800 mb-2">Printing 4-Inch Receipt...</h2>
            <p className="text-gray-600 font-bold">Sending RAW binary layout to {printerPath}.</p>
          </div>
        </div>
      )}

      {/* DYNAMIC 4-INCH (104mm) WIDE HTML RECEIPT PREVIEW */}
      <div id="printable-receipt" className="hidden print:block text-[14px] leading-tight font-mono">
        {firmSettings.receiptLayout.map((blockId, index) => renderReceiptBlock(blockId, index))}
      </div>

      <div className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center gap-4"><h1 className="text-xl font-black tracking-wide">POS Terminal <span className="bg-green-500 text-xs px-2 py-0.5 rounded text-white ml-2">ONLINE</span></h1></div>
        <div className="flex items-center gap-6"><div className="font-bold text-gray-300">Cashier: <span className="text-white text-lg">{loggedInUser.name}</span></div><button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded font-bold shadow">Lock Till</button></div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-white flex flex-col border-r shadow-lg z-10">
          <div className="bg-gray-100 p-3 border-b flex justify-between font-black text-gray-700"><span>🛒 Current Bill ({totalItems} Items)</span><button onClick={() => { setAppConfirm({show: true, msg: "Clear entire cart?", onYes: () => setCart([])}) }} className="text-red-500 hover:text-red-700 text-xs underline">Clear Cart</button></div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm border-collapse"><thead className="bg-gray-50 sticky top-0 font-bold border-b-2 border-gray-300 shadow-sm"><tr><th className="p-3 w-10 text-center">#</th><th className="p-3">Item Details</th><th className="p-3 w-24 text-center">Qty</th><th className="p-3 w-28 text-right">Price</th><th className="p-3 w-28 text-right">Total</th><th className="p-3 w-12 text-center">Del</th></tr></thead>
              <tbody>
                {cart.map((c, i) => (
                  <tr key={i} className="border-b hover:bg-yellow-50">
                    <td className="p-3 text-center font-bold text-gray-400">{i + 1}</td>
                    <td className="p-3"><div className="font-bold text-gray-800 text-base">{c.name}</div><div className="text-xs text-gray-500 font-mono mt-0.5">{c.barcode} {c.brand ? ` | ${c.brand}` : ''} {c.size ? ` | Sz: ${c.size}` : ''}</div></td>
                    <td className="p-2 border-l border-r bg-gray-50"><div className="flex items-center justify-center"><button onClick={() => updateCartQty(i, c.cartQty - 1)} className="bg-gray-200 px-3 py-1 font-black rounded-l hover:bg-gray-300">-</button><input type="number" value={c.cartQty} onChange={e => updateCartQty(i, parseInt(e.target.value) || 0)} className="w-12 text-center font-black text-lg bg-white outline-none border-y py-0.5" /><button onClick={() => updateCartQty(i, c.cartQty + 1)} className="bg-gray-200 px-3 py-1 font-black rounded-r hover:bg-gray-300">+</button></div></td>
                    <td className="p-3 text-right"><input type="number" value={c.price} onChange={e => updateCartPrice(i, parseFloat(e.target.value) || 0)} className={`w-20 text-right font-bold text-lg outline-none focus:border-b-2 focus:border-blue-500 bg-transparent ${c.price < c.originalPrice ? 'text-red-600' : 'text-gray-800'}`} title={`Original MRP: ₹${c.originalPrice}`} /></td>
                    <td className="p-3 text-right font-black text-lg text-green-700">₹{(c.cartQty * c.price).toLocaleString('en-IN')}</td>
                    <td className="p-3 text-center"><button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-500 font-bold hover:bg-red-100 rounded-full w-8 h-8 flex items-center justify-center mx-auto">X</button></td>
                  </tr>
                ))}
                {cart.length === 0 && <tr><td colSpan="6" className="p-20 text-center text-gray-400 font-bold text-2xl">Ready for next customer.<br/><span className="text-sm mt-2 block font-normal">Scan a barcode to begin.</span></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 border-t-4 border-gray-300 p-6 flex justify-between items-center shadow-inner"><div className="text-gray-500 font-bold text-xl uppercase tracking-wider">Net Amount</div><div className="text-6xl font-black text-blue-900">₹ {totalAmount.toLocaleString('en-IN')}</div></div>
        </div>

        <div className="w-[400px] bg-gray-100 flex flex-col">
          <div className="p-6 bg-blue-600 text-white shadow-md"><label className="font-bold text-blue-200 text-sm block mb-1 uppercase tracking-wide">Scan Barcode / Search Code</label><form onSubmit={handleBarcodeSubmit}><input ref={barcodeRef} type="text" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} placeholder="Waiting for scanner..." className="w-full border-4 border-blue-400 bg-white text-black p-4 rounded-xl font-black text-2xl outline-none focus:border-yellow-400 shadow-inner" autoFocus /></form></div>
          <div className="p-6 flex-1 flex flex-col gap-4">
            <h3 className="font-black text-gray-800 text-lg border-b pb-2">Customer / Khata Details</h3>
            <div><label className="font-bold text-gray-600 text-xs block mb-1">Mobile Number</label><input type="tel" maxLength="10" value={customer.mobile} onChange={e => setCustomer({...customer, mobile: e.target.value})} placeholder="Optional for Cash" className="w-full border-2 border-gray-300 p-3 rounded font-bold text-lg outline-none focus:border-blue-500" /></div>
            <div><label className="font-bold text-gray-600 text-xs block mb-1">Customer Name</label><input type="text" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} placeholder="Optional for Cash" className="w-full border-2 border-gray-300 p-3 rounded font-bold text-lg outline-none focus:border-blue-500" /></div>
            <div className="mt-auto">
              <h3 className="font-black text-gray-800 text-lg border-b pb-2 mb-4">Payment Method</h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button onClick={() => setPaymentMode('CASH')} className={`py-4 font-black rounded-lg transition-transform ${paymentMode === 'CASH' ? 'bg-green-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600 hover:bg-gray-50'}`}>💵 CASH</button>
                <button onClick={() => setPaymentMode('UPI')} className={`py-4 font-black rounded-lg transition-transform ${paymentMode === 'UPI' ? 'bg-purple-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600 hover:bg-gray-50'}`}>📱 UPI</button>
                <button onClick={() => setPaymentMode('CREDIT')} className={`py-4 font-black rounded-lg transition-transform ${paymentMode === 'CREDIT' ? 'bg-orange-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600 hover:bg-gray-50'}`}>📒 UDHAAR</button>
              </div>
              <button onClick={processCheckout} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-2xl py-6 rounded-xl shadow-xl transition-colors flex flex-col items-center justify-center"><span>GENERATE BILL</span><span className="text-sm font-bold text-blue-200 mt-1">Print Custom Receipt</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
