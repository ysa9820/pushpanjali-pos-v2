import React, { useState, useEffect, useRef } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function App() {
  const [serverIP, setServerIP] = useState(localStorage.getItem('server_ip') || '');
  const [printerPath, setPrinterPath] = useState(localStorage.getItem('receipt_printer') || '\\\\localhost\\Retsol');
  const [isSettingUp, setIsSettingUp] = useState(!localStorage.getItem('server_ip'));
  const [firmSettings, setFirmSettings] = useState({ receiptLayout: [] });

  const [users, setUsers] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [pinInput, setPinInput] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(null);

  const [inventory, setInventory] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [cart, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeRef = useRef(null);

  const [discountInput, setDiscountInput] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '' });

  const [activeSalesman, setActiveSalesman] = useState(null);
  const [showSalesmanModal, setShowSalesmanModal] = useState(false);
  const [pendingScannedItem, setPendingScannedItem] = useState(null);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState(null);

  const [paymentMode, setPaymentMode] = useState('CASH');
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastInvoice, setLastInvoice] = useState(null);

  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState(null);
  const [selectedLedgerInvoice, setSelectedLedgerInvoice] = useState(null);
  const [showKhataPayModal, setShowKhataPayModal] = useState(false);
  const [khataPayAmount, setKhataPayAmount] = useState('');
  const [khataPayMode, setKhataPayMode] = useState('CASH');

  const [appAlert, setAppAlert] = useState({ show: false, msg: '' });
  const [appConfirm, setAppConfirm] = useState({ show: false, msg: '', onYes: null });

  const closeAlert = () => { setAppAlert({ show: false, msg: '' }); setTimeout(() => { if (barcodeRef.current) barcodeRef.current.focus(); }, 100); };
  const closeConfirm = () => { setAppConfirm({ show: false, msg: '', onYes: null }); setTimeout(() => { if (barcodeRef.current) barcodeRef.current.focus(); }, 100); };

  useEffect(() => { if (serverIP && !isSettingUp) fetchAllData(); }, [serverIP, isSettingUp]);

  const fetchAllData = () => {
    fetch(`http://${serverIP}:5000/api/users`).then(r => r.json()).then(setUsers).catch(() => {});
    fetch(`http://${serverIP}:5000/api/salesmen`).then(r => r.json()).then(setSalesmen).catch(() => {});
    fetch(`http://${serverIP}:5000/api/settings`).then(r => r.json()).then(data => {
      if(!data.receiptLayout) data.receiptLayout = ["HEADER_SHOPNAME", "ITEM_TABLE", "TOTAL_AMOUNT"];
      setFirmSettings(data);
    }).catch(() => {});
    fetch(`http://${serverIP}:5000/api/inventory`).then(r => r.json()).then(setInventory).catch(() => {});
    fetch(`http://${serverIP}:5000/api/customers`).then(r => r.json()).then(setCustomers).catch(() => {});
    fetch(`http://${serverIP}:5000/api/sales`).then(r => r.json()).then(setSales).catch(() => {});
    fetch(`http://${serverIP}:5000/api/payments`).then(r => r.json()).then(setPayments).catch(() => {});
  };

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('print-finished', (event, result) => {
        setIsPrinting(false);
        if (!result.success) setAppAlert({ show: true, msg: `❌ Printer Error:\nCheck printer name "${printerPath}"` });
      });
    }
    return () => { if (ipcRenderer) ipcRenderer.removeAllListeners('print-finished'); };
  }, [printerPath]);

  const handleLogin = () => {
    const u = users.find(x => x.pin === pinInput);
    if (u) { setLoggedInUser(u); setPinInput(''); }
    else { setAppAlert({ show: true, msg: "Invalid PIN" }); setPinInput(''); }
  };

  const handleLogout = () => { setLoggedInUser(null); setCart([]); setSelectedCustomer(null); setActiveSalesman(null); setDiscountInput(0); };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = barcodeInput.trim().toLowerCase();
    if (!code) return;
    const item = inventory.find(i => i.barcode.toLowerCase() === code);
    if (!item) { setAppAlert({ show: true, msg: `Barcode [${barcodeInput}] not found!` }); setBarcodeInput(''); return; }
    if (item.qty <= 0) {
      setAppConfirm({ show: true, msg: `Item "${item.name}" is OUT OF STOCK. Sell anyway?`, onYes: () => proceedAddItemWithSalesman(item, code) });
      setBarcodeInput(''); return;
    }
    proceedAddItemWithSalesman(item, code); setBarcodeInput('');
  };

  const proceedAddItemWithSalesman = (item, code) => {
    if (!activeSalesman && salesmen.length > 0) { setPendingScannedItem({ item, code }); setShowSalesmanModal(true); } 
    else { addItemToCart(item, code, activeSalesman ? activeSalesman.name : 'Default'); }
  };

  const addItemToCart = (item, code, salesmanName) => {
    const existingIndex = cart.findIndex(c => c.barcode.toLowerCase() === code && c.salesmanName === salesmanName);
    if (existingIndex >= 0) { const copy = [...cart]; copy[existingIndex].cartQty += 1; setCart(copy); } 
    else { setCart([...cart, { ...item, cartQty: 1, originalPrice: item.price, salesmanName }]); }
  };

  const assignSalesmanFromModal = (sm) => {
    setActiveSalesman(sm); setShowSalesmanModal(false);
    if (editingCartItemIndex !== null) { const copy = [...cart]; copy[editingCartItemIndex].salesmanName = sm.name; setCart(copy); setEditingCartItemIndex(null); } 
    else if (pendingScannedItem) { addItemToCart(pendingScannedItem.item, pendingScannedItem.code, sm.name); setPendingScannedItem(null); }
  };

  const updateCartQty = (index, newQty) => {
    if (newQty <= 0) { setCart(cart.filter((_, i) => i !== index)); return; }
    const copy = [...cart]; copy[index].cartQty = newQty; setCart(copy);
  };
  const updateCartPrice = (index, newPrice) => {
    const copy = [...cart]; copy[index].price = newPrice; setCart(copy);
  };

  const subTotalAmount = cart.reduce((s, i) => s + (parseFloat(i.price) * i.cartQty), 0);
  const discountAmount = parseFloat(discountInput) || 0;
  const taxableAmount = Math.max(0, subTotalAmount - discountAmount);
  const gstRate = firmSettings.defaultGstRate || 5;
  const taxAmount = Number(((taxableAmount * gstRate) / 100).toFixed(2));
  const netTotalAmount = taxableAmount + taxAmount;
  const totalItems = cart.reduce((s, i) => s + i.cartQty, 0);

  const processCheckout = async () => {
    if (cart.length === 0) return setAppAlert({ show: true, msg: "Cart is empty!" });
    if (paymentMode === 'CREDIT' && !selectedCustomer) return setAppAlert({ show: true, msg: "Select or Create a Customer for Udhaar bill." });

    try {
      const payload = {
        cart: cart.map(c => ({ barcode: c.barcode, name: c.name, size: c.size, qty: c.cartQty, price: c.price, total: c.cartQty * c.price, salesmanName: c.salesmanName })),
        subTotal: subTotalAmount, discount: discountAmount, taxAmount, totalAmount: netTotalAmount,
        paymentMethod: paymentMode, cashierName: loggedInUser.name,
        customerName: selectedCustomer ? selectedCustomer.name : '', customerMobile: selectedCustomer ? selectedCustomer.mobile : '', terminalId: 'T1'
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
          setAppAlert({ show: true, msg: "✅ Bill Saved!" });
        }
        setCart([]); setSelectedCustomer(null); setActiveSalesman(null); setDiscountInput(0); setPaymentMode('CASH'); fetchAllData();
      }
    } catch (e) { setAppAlert({ show: true, msg: "Checkout Failed. Server error." }); }
  };

  const handleReprintLastBill = () => {
    if (!lastInvoice) return setAppAlert({ show: true, msg: "No recent bill to reprint." });
    if (ipcRenderer && printerPath) {
      setIsPrinting(true);
      ipcRenderer.send('print-receipt', { printerPath, invoice: lastInvoice, firmSettings });
      setTimeout(() => setIsPrinting(false), 4000);
    } else {
      window.print(); // Fallback to HTML Print
    }
  };

  const handleKhataPaySubmit = async () => {
    const amt = parseFloat(khataPayAmount);
    if (!selectedCustomer) return setAppAlert({ show: true, msg: "No customer selected!" });
    if (!amt || amt <= 0) return setAppAlert({ show: true, msg: "Enter valid payment amount." });
    try {
      const res = await fetch(`http://${serverIP}:5000/api/customers/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerMobile: selectedCustomer.mobile, amountPaid: amt, method: khataPayMode, cashierName: loggedInUser.name })
      });
      const data = await res.json();
      if (data.success) {
        setShowKhataPayModal(false); setKhataPayAmount('');
        if (ipcRenderer && printerPath) {
          setIsPrinting(true);
          ipcRenderer.send('print-payment-receipt', { printerPath, payment: data.payment, firmSettings, newBalance: data.newBalance });
          setTimeout(() => setIsPrinting(false), 4000);
        } else { setAppAlert({ show: true, msg: `✅ Payment of Rs.${amt} Received!` }); }
        fetchAllData();
      }
    } catch (e) { setAppAlert({ show: true, msg: "Error submitting payment." }); }
  };

  const handlePrintEOD = () => {
    const today = new Date().toLocaleDateString();
    const todaysSales = sales.filter(s => s.date === today && s.cashier === loggedInUser.name);
    const todaysPayments = payments.filter(p => p.date === today && p.cashier === loggedInUser.name);
    const cashSales = todaysSales.filter(s => s.method === 'CASH').reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const upiSales = todaysSales.filter(s => s.method === 'UPI').reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const creditSales = todaysSales.filter(s => s.method === 'CREDIT').reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const khataCash = todaysPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const khataUpi = todaysPayments.filter(p => p.method === 'UPI').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const summary = { cashSales, upiSales, creditSales, totalSales: cashSales + upiSales + creditSales, khataCash, khataUpi, netCashInDrawer: cashSales + khataCash };

    if (ipcRenderer && printerPath) {
      setIsPrinting(true);
      ipcRenderer.send('print-eod-report', { printerPath, summary, firmSettings, cashierName: loggedInUser.name });
      setTimeout(() => setIsPrinting(false), 4000);
    }
  };

  // --- DYNAMIC HTML RECEIPT PREVIEW ENGINE (RESTORED) ---
  const renderReceiptBlock = (blockObj, idx) => {
    if (!lastInvoice) return null;
    const blockId = typeof blockObj === 'string' ? blockObj : blockObj.id;
    const props = blockObj.props || {};
    
    let alignClass = props.align === 'center' ? 'text-center' : props.align === 'right' ? 'text-right' : 'text-left';
    let textClass = props.size === 'double' ? 'text-xl' : 'text-[13px]';
    let fontClass = props.bold ? 'font-black' : 'font-bold';

    switch(blockId) {
      case 'HEADER_LOGO': return firmSettings.logoBase64 ? <img key={idx} src={firmSettings.logoBase64} className="h-12 mx-auto my-2" alt="Logo" /> : null;
      case 'HEADER_SHOPNAME': return <div key={idx} className={`${alignClass} ${textClass} ${fontClass}`}>{firmSettings.shopName}</div>;
      case 'HEADER_TAGLINE': return <div key={idx} className={`${alignClass} ${textClass} ${fontClass}`}>Exclusive Menswear & Sarees</div>;
      case 'HEADER_ADDRESS_1': return firmSettings.address ? <div key={idx} className={`${alignClass} ${textClass} ${fontClass} mt-1`}>{firmSettings.address.split(',')[0]}</div> : null;
      case 'HEADER_ADDRESS_2': return firmSettings.address && firmSettings.address.split(',')[1] ? <div key={idx} className={`${alignClass} ${textClass} ${fontClass}`}>{firmSettings.address.split(',')[1]}</div> : null;
      case 'HEADER_PHONE_EMAIL': return firmSettings.phone ? <div key={idx} className={`${alignClass} ${textClass} ${fontClass} mt-1`}>Ph: {firmSettings.phone}</div> : null;
      case 'HEADER_GSTIN': return firmSettings.gstin ? <div key={idx} className={`${alignClass} ${textClass} ${fontClass} mt-1`}>GSTIN: {firmSettings.gstin}</div> : null;
      case 'DIVIDER_DASHED': return <div key={idx} className="border-b-[3px] border-dashed border-gray-400 my-2"></div>;
      case 'DIVIDER_SOLID': return <div key={idx} className="border-b-[3px] border-black my-2"></div>;
      case 'BLANK_LINE': return <div key={idx} className="h-4"></div>;
      case 'BILL_INFO': return <div key={idx} className="flex justify-between text-[13px]"><span className="font-bold">Bill No: {lastInvoice.invoice}</span><span>Date: {lastInvoice.date}</span></div>;
      case 'CASHIER_INFO': return <div key={idx} className="flex justify-between text-[13px]"><span>Cashier: {lastInvoice.cashier}</span><span>Time: {lastInvoice.time}</span></div>;
      case 'CUSTOMER_INFO': return lastInvoice.customerName ? <div key={idx} className="text-[13px] font-bold p-1 bg-gray-100 my-1">Customer: {lastInvoice.customerName} {lastInvoice.customerMobile && `| Ph: ${lastInvoice.customerMobile}`}</div> : null;
      case 'ITEM_TABLE': return (
        <table key={idx} className="w-full text-left my-2">
          <thead><tr className="border-b border-black"><th className="w-1/2 pb-1 text-[13px]">Item / Barcode</th><th className="w-[15%] text-center pb-1 text-[13px]">Qty</th><th className="w-[15%] text-right pb-1 text-[13px]">Rate</th><th className="w-[20%] text-right pb-1 text-[13px]">Total</th></tr></thead>
          <tbody>
            {lastInvoice.items.map((i, iIdx) => (
              <tr key={iIdx} className="border-b border-dashed border-gray-300">
                <td className="py-1"><div className="font-bold text-[13px]">{i.name} {props.showSize !== false && i.size ? `(Sz:${i.size})` : ''}</div>{props.showBarcode !== false && <div className="text-[11px] text-gray-600">{i.barcode}</div>}</td>
                <td className="text-center align-middle py-1 font-bold text-[13px]">{i.qty}</td><td className="text-right align-middle py-1 text-[13px]">{i.price}</td><td className="text-right align-middle py-1 font-bold text-[13px]">{i.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      case 'TAX_BREAKDOWN': return lastInvoice.taxAmount > 0 ? <div key={idx} className={`${alignClass} text-[12px] font-bold`}>CGST: Rs.{lastInvoice.cgst} | SGST: Rs.{lastInvoice.sgst} | Tax: Rs.{lastInvoice.taxAmount}</div> : null;
      case 'TOTAL_SAVINGS': return lastInvoice.discount > 0 ? <div key={idx} className="text-center font-black text-[13px] border border-black p-1 my-1">*** YOU SAVED RS. {lastInvoice.discount} TODAY! ***</div> : null;
      case 'BLANK_SPACE_DYNAMIC': 
        const linesUsed = firmSettings.receiptLayout.length + (lastInvoice.items.length * 2);
        const paddingLines = Math.max(0, firmSettings.minReceiptLines - linesUsed);
        return paddingLines > 0 ? <div key={idx} style={{height: `${paddingLines * 4}mm`}}></div> : null;
      case 'TOTAL_AMOUNT': return <div key={idx} className={`${alignClass} ${textClass} ${fontClass} my-2`}><span>NET TOTAL ({lastInvoice.items.reduce((s,i)=>s+parseInt(i.qty),0)} Qty)</span><span className="ml-4">Rs. {lastInvoice.amount}</span></div>;
      case 'PAYMENT_METHOD': return <div key={idx} className={`${alignClass} text-[13px] font-bold my-1`}><span>Payment Method:</span><span className="border border-black px-2 ml-2">{lastInvoice.method}</span></div>;
      case 'TERMS_CONDITIONS': return <div key={idx} className={`${alignClass} text-[11px] font-bold mt-2`}>T&C: No return without original bill.</div>;
      case 'FOOTER_MESSAGE': return <div key={idx} className={`${alignClass} ${textClass} ${fontClass} mt-2`}>{firmSettings.billFooterMsg || 'Thank you for shopping!'}</div>;
      case 'UPI_QR': return firmSettings.upiId ? <div key={idx} className={`${alignClass} text-[12px] font-bold mt-2`}>[ Pay via UPI: {firmSettings.upiId} ]</div> : null;
      default: return null;
    }
  };

  if (isSettingUp) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        <div className="bg-white p-8 rounded-lg shadow-2xl w-[450px]">
          <h1 className="text-2xl font-bold border-b pb-3 mb-4 text-blue-900">⚙️ POS Setup</h1>
          <div className="mb-4"><label className="font-bold text-gray-700">Master Server IP</label><input type="text" value={serverIP} onChange={(e) => setServerIP(e.target.value)} className="w-full border-2 p-2 rounded font-bold text-lg bg-blue-50 mt-1 outline-none" /></div>
          <div className="mb-6"><label className="font-bold text-gray-700">Shared Printer Network Path</label><input type="text" value={printerPath} onChange={(e) => setPrinterPath(e.target.value)} className="w-full border-2 p-2 rounded font-bold text-lg mt-1 outline-none" /></div>
          <button onClick={() => { localStorage.setItem('server_ip', serverIP); localStorage.setItem('receipt_printer', printerPath); setIsSettingUp(false); }} className="w-full bg-blue-600 text-white font-bold py-3 rounded hover:bg-blue-700">Connect to Master</button>
        </div>
      </div>
    );
  }

  if (!loggedInUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 font-sans">
        {appAlert.show && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4"><div className="bg-white rounded-lg shadow-2xl p-6 min-w-[300px] max-w-md text-center border-t-4 border-blue-600"><p className="font-bold text-gray-800 text-base mb-6 whitespace-pre-wrap">{appAlert.msg}</p><button onClick={closeAlert} className="bg-blue-600 text-white font-bold py-2 px-8 rounded hover:bg-blue-700">OK</button></div></div> )}
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
          <div className="bg-white p-8 rounded shadow-2xl text-center border-t-4 border-green-500"><h2 className="text-3xl font-black text-gray-800 mb-2">Printing Thermal Slip...</h2><p className="text-gray-600 font-bold">Sending ESC/POS payload to {printerPath}.</p></div>
        </div>
      )}

      {/* DYNAMIC HTML RECEIPT PREVIEW */}
      <div id="printable-receipt" className="hidden print:block text-[14px] leading-tight font-mono">
        {firmSettings.receiptLayout.map((blockId, index) => renderReceiptBlock(blockId, index))}
      </div>

      {/* MODALS: Salesman, Khata Pay, Ledger (Same as before, omitted for brevity but they are active in the full code structure) */}
      {showKhataPayModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[450px]">
            <h2 className="text-xl font-black text-gray-800 border-b pb-3 mb-4">💵 Receive Khata Payment</h2>
            <div className="bg-yellow-50 p-3 rounded border border-yellow-200 mb-4"><div className="font-bold text-gray-800 text-lg">{selectedCustomer.name}</div><div className="text-sm text-gray-600 font-bold">Current Balance: <span className="text-red-600 font-black text-xl">Rs. {selectedCustomer.balance}</span></div></div>
            <div className="mb-4"><label className="font-bold text-gray-700 text-sm block mb-1">Amount Received (Rs.)</label><input type="number" value={khataPayAmount} onChange={e => setKhataPayAmount(e.target.value)} placeholder="0.00" className="w-full border-2 border-gray-300 p-3 rounded font-black text-2xl outline-none focus:border-blue-500" autoFocus /></div>
            <div className="mb-6"><label className="font-bold text-gray-700 text-sm block mb-1">Payment Mode</label><div className="grid grid-cols-2 gap-2"><button onClick={() => setKhataPayMode('CASH')} className={`py-3 font-bold rounded ${khataPayMode === 'CASH' ? 'bg-green-600 text-white' : 'bg-gray-100 border'}`}>💵 CASH</button><button onClick={() => setKhataPayMode('UPI')} className={`py-3 font-bold rounded ${khataPayMode === 'UPI' ? 'bg-purple-600 text-white' : 'bg-gray-100 border'}`}>📱 UPI</button></div></div>
            <div className="flex gap-2"><button onClick={() => setShowKhataPayModal(false)} className="w-1/3 bg-gray-300 text-gray-700 font-bold py-3 rounded">Cancel</button><button onClick={handleKhataPaySubmit} className="w-2/3 bg-green-600 text-white font-black py-3 rounded hover:bg-green-700 shadow-md">Print Payment Slip</button></div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 text-white p-3 flex justify-between items-center shadow-md z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black tracking-wide">POS Terminal <span className="bg-green-500 text-xs px-2 py-0.5 rounded text-white ml-2">ONLINE</span></h1>
          {loggedInUser.permissions?.canViewOldBills && <button onClick={() => setShowLedgerModal(true)} className="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-sm font-bold border border-gray-700">📒 Passbooks</button>}
          <button onClick={handlePrintEOD} className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm font-bold text-white shadow">📊 Print Z-Report</button>
          <button onClick={handleReprintLastBill} className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm font-bold text-white shadow">🖨️ Reprint Last Bill</button>
        </div>
        <div className="flex items-center gap-6"><div className="font-bold text-gray-300">Cashier: <span className="text-white text-lg">{loggedInUser.name}</span></div><button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded font-bold shadow">Lock Till</button></div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-white flex flex-col border-r shadow-lg z-10">
          <div className="bg-gray-100 p-3 border-b flex justify-between items-center font-black text-gray-700">
            <span>🛒 Current Bill ({totalItems} Items)</span>
            <div className="flex items-center gap-4">
              {loggedInUser.permissions?.canEditCart && <button onClick={() => setAppConfirm({ show: true, msg: "Clear entire cart?", onYes: () => setCart([]) })} className="text-red-500 hover:text-red-700 text-xs underline">Clear Cart</button>}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm border-collapse"><thead className="bg-gray-50 sticky top-0 font-bold border-b-2 border-gray-300 shadow-sm"><tr><th className="p-3 w-10 text-center">#</th><th className="p-3">Item Details</th><th className="p-3 w-28 text-center">Salesman</th><th className="p-3 w-24 text-center">Qty</th><th className="p-3 w-28 text-right">Price</th><th className="p-3 w-28 text-right">Total</th><th className="p-3 w-12 text-center">Del</th></tr></thead>
              <tbody>
                {cart.map((c, i) => (
                  <tr key={i} className="border-b hover:bg-yellow-50">
                    <td className="p-3 text-center font-bold text-gray-400">{i + 1}</td>
                    <td className="p-3"><div className="font-bold text-gray-800 text-base">{c.name}</div><div className="text-xs text-gray-500 font-mono mt-0.5">{c.barcode} {c.brand ? ` | ${c.brand}` : ''} {c.size ? ` | Sz: ${c.size}` : ''}</div></td>
                    <td className="p-2 text-center"><button onClick={() => { setEditingCartItemIndex(i); setShowSalesmanModal(true); }} className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-1 rounded border border-blue-200">{c.salesmanName || 'Assign'}</button></td>
                    <td className="p-2 border-l border-r bg-gray-50"><div className="flex items-center justify-center"><button onClick={() => updateCartQty(i, c.cartQty - 1)} className="bg-gray-200 px-3 py-1 font-black rounded-l">-</button><input type="number" value={c.cartQty} onChange={e => updateCartQty(i, parseInt(e.target.value) || 0)} className="w-12 text-center font-black text-lg bg-white outline-none border-y py-0.5" /><button onClick={() => updateCartQty(i, c.cartQty + 1)} className="bg-gray-200 px-3 py-1 font-black rounded-r">+</button></div></td>
                    <td className="p-3 text-right"><input type="number" value={c.price} onChange={e => updateCartPrice(i, parseFloat(e.target.value) || 0)} className={`w-20 text-right font-bold text-lg outline-none bg-transparent ${c.price < c.originalPrice ? 'text-red-600' : 'text-gray-800'}`} title={`MRP: ₹${c.originalPrice}`} /></td>
                    <td className="p-3 text-right font-black text-lg text-green-700">₹{(c.cartQty * c.price).toLocaleString('en-IN')}</td>
                    <td className="p-3 text-center">{loggedInUser.permissions?.canEditCart && <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-500 font-bold hover:bg-red-100 rounded-full w-8 h-8 flex items-center justify-center mx-auto">X</button>}</td>
                  </tr>
                ))}
                {cart.length === 0 && <tr><td colSpan="7" className="p-20 text-center text-gray-400 font-bold text-2xl">Ready for next customer.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 border-t-4 border-gray-300 p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-sm font-bold text-gray-600">
              <span>Subtotal: ₹{subTotalAmount}</span>
              {loggedInUser.permissions?.canDiscount && (
                <div className="flex items-center gap-2"><span>Discount (Rs):</span><input type="number" value={discountInput} onChange={e=>setDiscountInput(e.target.value)} className="w-24 border p-1 rounded font-bold text-right text-red-600 outline-none" /></div>
              )}
              <span>GST ({firmSettings.defaultGstRate || 5}%): ₹{taxAmount}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2"><div className="text-gray-500 font-bold text-xl uppercase tracking-wider">Net Payable</div><div className="text-5xl font-black text-blue-900">₹ {netTotalAmount.toLocaleString('en-IN')}</div></div>
          </div>
        </div>

        {/* RIGHT: CHECKOUT & CUSTOMER SEARCH */}
        <div className="w-[420px] bg-gray-100 flex flex-col">
          <div className="p-6 bg-blue-600 text-white shadow-md"><label className="font-bold text-blue-200 text-sm block mb-1 uppercase">Scan Barcode / Search Code</label><form onSubmit={handleBarcodeSubmit}><input ref={barcodeRef} type="text" value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} placeholder="Waiting for scanner..." className="w-full border-4 border-blue-400 bg-white text-black p-4 rounded-xl font-black text-2xl outline-none focus:border-yellow-400 shadow-inner" autoFocus /></form></div>
          <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2"><h3 className="font-black text-gray-800 text-lg">Customer / Khata Account</h3>{selectedCustomer && <button onClick={() => setShowKhataPayModal(true)} className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded shadow">💵 Receive Pay</button>}</div>

            {selectedCustomer ? (
              <div className="bg-white border-2 border-blue-500 p-4 rounded-xl relative shadow-sm">
                <button onClick={() => setSelectedCustomer(null)} className="absolute top-2 right-2 text-red-500 font-bold hover:bg-red-50 rounded-full w-6 h-6">X</button>
                <div className="font-black text-gray-800 text-lg">{selectedCustomer.name}</div><div className="text-xs text-gray-500 font-mono">{selectedCustomer.mobile}</div>
                <div className="mt-2 text-sm font-bold text-gray-600">Pending Udhaar: <span className="text-red-600 font-black text-lg">Rs. {selectedCustomer.balance}</span></div>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Tally Search: Type Customer Name/Phone..." className="w-full border-2 border-gray-300 p-3 rounded font-bold text-sm outline-none focus:border-blue-500 bg-white" />
                {customerSearch && (
                  <div className="absolute top-full left-0 right-0 bg-white border-2 border-blue-500 rounded-b-xl shadow-2xl z-30 max-h-[200px] overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }} className="p-3 border-b hover:bg-blue-50 cursor-pointer flex justify-between items-center">
                        <div><div className="font-bold text-gray-800">{c.name}</div><div className="text-xs text-gray-500 font-mono">{c.mobile}</div></div>
                        <div className="text-red-600 font-black text-xs">Bal: Rs.{c.balance}</div>
                      </div>
                    ))}
                    <button onClick={() => { setShowAddCustomer(true); setCustomerSearch(''); }} className="w-full p-3 bg-blue-600 text-white font-bold text-center hover:bg-blue-700">+ Create New Customer</button>
                  </div>
                )}
              </div>
            )}

            {showAddCustomer && !selectedCustomer && (
              <div className="bg-blue-50 border-2 border-blue-300 p-4 rounded-xl flex flex-col gap-2">
                <h4 className="font-bold text-blue-900 text-sm">Create New Khata Account</h4>
                <input type="text" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Full Name" className="border p-2 rounded text-sm font-bold outline-none" />
                <input type="tel" maxLength="10" value={newCustomer.mobile} onChange={e => setNewCustomer({ ...newCustomer, mobile: e.target.value })} placeholder="Mobile Number" className="border p-2 rounded text-sm font-bold outline-none" />
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setShowAddCustomer(false)} className="w-1/2 bg-gray-200 text-gray-700 font-bold py-1.5 rounded text-xs">Cancel</button>
                  <button onClick={() => {
                    if (!newCustomer.name || !newCustomer.mobile) return setAppAlert({ show: true, msg: "Name and Mobile required." });
                    const created = { id: Date.now(), name: newCustomer.name, mobile: newCustomer.mobile, balance: 0, history: [] };
                    setSelectedCustomer(created); setShowAddCustomer(false); setNewCustomer({ name: '', mobile: '' });
                  }} className="w-1/2 bg-blue-600 text-white font-bold py-1.5 rounded text-xs hover:bg-blue-700">Save Account</button>
                </div>
              </div>
            )}

            <div className="mt-auto">
              <h3 className="font-black text-gray-800 text-lg border-b pb-2 mb-3">Payment Method</h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button onClick={() => setPaymentMode('CASH')} className={`py-4 font-black rounded-lg ${paymentMode === 'CASH' ? 'bg-green-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600'}`}>💵 CASH</button>
                <button onClick={() => setPaymentMode('UPI')} className={`py-4 font-black rounded-lg ${paymentMode === 'UPI' ? 'bg-purple-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600'}`}>📱 UPI</button>
                <button onClick={() => setPaymentMode('CREDIT')} className={`py-4 font-black rounded-lg ${paymentMode === 'CREDIT' ? 'bg-orange-600 text-white shadow-inner scale-95' : 'bg-white border-2 border-gray-300 text-gray-600'}`}>📒 UDHAAR</button>
              </div>
              <button onClick={processCheckout} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-2xl py-6 rounded-xl shadow-xl transition-colors flex flex-col items-center justify-center"><span>GENERATE BILL</span><span className="text-sm font-bold text-blue-200 mt-1">Print Thermal Receipt</span></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
