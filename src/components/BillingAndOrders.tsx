import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Search,
  ChevronDown,
  ChevronUp,
  Truck,
  ArrowLeft,
  ShoppingCart,
  ScanLine,
  Sparkles,
  AlertCircle,
  Printer,
  CheckCircle2,
  Trash2,
  UserPlus,
  Mic,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  createOrderInDb,
  createSaleReturnInDb,
  saveProductToDb,
  type ProductDoc,
  type OrderDoc,
  type SaleReturnDoc,
  type CustomerDoc,
  type UserProfileDoc,
  type OrderLineItem,
} from '../firebase';
import {
  downloadElementAsPdf,
  type ScannedVisionResult,
  type ParsedVoiceResult,
} from '../services/integrations';
import { SmartVoiceModal } from './SmartVoiceModal';

export type BillingSubScreen =
  | 'new_bill'
  | 'calculator'
  | 'past_orders'
  | 'eway_bills'
  | 'sale_returns_list'
  | 'create_return_pos';

interface BillingAndOrdersProps {
  uid: string;
  mode: BillingSubScreen;
  setMode: (m: BillingSubScreen) => void;
  onBackToHome: () => void;
  products: ProductDoc[];
  orders: OrderDoc[];
  returns: SaleReturnDoc[];
  customers: CustomerDoc[];
  profile: UserProfileDoc;
  onOpenScanner: (
    cb: (code: string, visionResult?: ScannedVisionResult) => void,
    opts?: { scanMode?: 'barcode_or_imei' | 'bill_items'; title?: string }
  ) => void;
  onOpenAddCustomer: () => void;
}

const ALL_PAYMENT_MODES = [
  'Cash',
  'Card',
  'UPI',
  'Delivery',
  'Pickup',
  'Delivered',
  'Rejected',
  'Wallet',
  'UPI + Cash',
  'Card + Cash',
  'UPI + Card + Cash',
  'UPI + Cash + Credit',
  'Complementary',
];

const ORDER_FILTER_CHIPS = [
  'All',
  'Delivery',
  'Pickup',
  'Not Paid',
  'Cash',
  'Card',
  'UPI',
  'Delivered',
  'Rejected',
  'UPI + Cash',
  'Card + Cash',
  'Complementary',
  'Past Collection',
];

export const BillingAndOrders: React.FC<BillingAndOrdersProps> = ({
  uid,
  mode,
  setMode,
  onBackToHome,
  products,
  orders,
  returns,
  customers,
  profile,
  onOpenScanner,
  onOpenAddCustomer,
}) => {
  // Shared POS / Return state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentMode, setPaymentMode] = useState(
    profile.config.billing.defaultPaymentMode || 'Cash'
  );
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [priceMode, setPriceMode] = useState<'Retail' | 'Wholesale'>('Retail');
  const [cartItems, setCartItems] = useState<OrderLineItem[]>([]);
  const [posSearch, setPosSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [includeBfInventory, setIncludeBfInventory] = useState(false);
  const [emptyCartToast, setEmptyCartToast] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [createdOrderModal, setCreatedOrderModal] = useState<OrderDoc | null>(null);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  // Quick Add modal inside POS
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaAddToInv, setQaAddToInv] = useState(true);
  const [qaBarcode, setQaBarcode] = useState('');
  const [qaName, setQaName] = useState('');
  const [qaVariant, setQaVariant] = useState('');
  const [qaMrp, setQaMrp] = useState('0.00');
  const [qaRetail, setQaRetail] = useState('0.00');
  const [qaQty, setQaQty] = useState('1');
  const [qaUnit, setQaUnit] = useState('Piece');

  // Smart Calculator state
  const [calcItems, setCalcItems] = useState<OrderLineItem[]>([]);
  const [calcItemName, setCalcItemName] = useState('');
  const [calcQtyStr, setCalcQtyStr] = useState('');
  const [calcPriceStr, setCalcPriceStr] = useState('');
  const [calcActiveField, setCalcActiveField] = useState<'price' | 'qty' | 'item'>('price');
  const [calcDiscount, setCalcDiscount] = useState(0);
  const [calcDiscountModal, setCalcDiscountModal] = useState(false);
  const [calcStockSearchModal, setCalcStockSearchModal] = useState(false);

  // Past Orders state
  const [orderDateFilter, setOrderDateFilter] = useState(new Date().toISOString().slice(0, 10));
  const [orderSearch, setOrderSearch] = useState('');
  const [activeOrderChip, setActiveOrderChip] = useState('All');
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // Sale Returns state
  const [returnSearch, setReturnSearch] = useState('');
  const [createReturnSheet, setCreateReturnSheet] = useState(false);
  const [returnFromInvoiceModal, setReturnFromInvoiceModal] = useState(false);
  const [returnFromPhoneModal, setReturnFromPhoneModal] = useState(false);
  const [returnInvoiceInput, setReturnInvoiceInput] = useState('');
  const [returnPhoneInput, setReturnPhoneInput] = useState('+91');

  // Past Orders date toggle & Toast state
  const [filterByDate, setFilterByDate] = useState(false);
  const [savingQuickAddPos, setSavingQuickAddPos] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3200);
  };

  const triggerEmptyCartToast = () => {
    setEmptyCartToast(true);
    setTimeout(() => setEmptyCartToast(false), 2600);
  };

  const addProductToCart = (p: ProductDoc) => {
    const unitPrice =
      priceMode === 'Wholesale' && p.wholesalePrice > 0 ? p.wholesalePrice : p.retailPrice;
    setCartItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === p.id);
      if (existingIdx > -1) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          variantName: p.variantName,
          barcode: p.barcode,
          unit: p.unit || 'Piece',
          qty: 1,
          mrp: p.mrp || unitPrice,
          retailPrice: unitPrice,
          purchasePrice: p.purchasePrice || 0,
          gst: p.gst || 0,
          cess: p.cess || 0,
          hsn: p.hsn || '',
          discount: Math.max(0, (p.mrp || unitPrice) - unitPrice),
        },
      ];
    });
  };

  const handleSaveQuickAddPos = async () => {
    if (!qaName.trim()) {
      showToast('error', 'Please enter Product Name / प्रोडक्ट का नाम भरें');
      return;
    }
    const mrpVal = Number(qaMrp) || 0;
    const retailVal = Number(qaRetail) || mrpVal;
    const qtyVal = Number(qaQty) || 1;
    setSavingQuickAddPos(true);
    try {
      let prodId = `quick_${Date.now()}`;
      if (qaAddToInv) {
        prodId = await saveProductToDb(uid, {
          name: qaName.trim(),
          variantName: qaVariant.trim(),
          barcode: qaBarcode.trim(),
          unit: qaUnit,
          mrp: mrpVal,
          retailPrice: retailVal,
          quantity: qtyVal,
          archived: false,
        });
      }
      setCartItems((prev) => [
        ...prev,
        {
          productId: prodId,
          name: qaName.trim(),
          variantName: qaVariant.trim(),
          barcode: qaBarcode.trim(),
          unit: qaUnit,
          qty: qtyVal,
          mrp: mrpVal,
          retailPrice: retailVal,
          purchasePrice: 0,
          gst: 0,
          cess: 0,
          discount: Math.max(0, mrpVal - retailVal),
        },
      ]);
      setQaName('');
      setQaBarcode('');
      setQaVariant('');
      setQaMrp('0.00');
      setQaRetail('0.00');
      setQaQty('1');
      setQuickAddOpen(false);
      showToast('success', 'Product added to bill!');
    } catch (err) {
      console.error('POS Quick Add error:', err);
      showToast('error', 'Failed to save product. Please try again.');
    } finally {
      setSavingQuickAddPos(false);
    }
  };

  const handleCompletePosOrReturn = async () => {
    if (cartItems.length === 0) {
      triggerEmptyCartToast();
      return;
    }
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (
      mode !== 'create_return_pos' &&
      profile.config?.billing?.customerNumberRequired &&
      !cust?.phone
    ) {
      showToast('error', 'Customer number is required. Tap +Add Customer to select a customer.');
      return;
    }
    setSavingBill(true);
    try {
      const totalMrp = cartItems.reduce((acc, i) => acc + i.qty * (i.mrp || i.retailPrice), 0);
      const totalAmount = cartItems.reduce((acc, i) => acc + i.qty * i.retailPrice, 0);
      const discountAmount = Math.max(0, totalMrp - totalAmount);
      const totalProfit = cartItems.reduce(
        (acc, i) => acc + i.qty * (i.retailPrice - (i.purchasePrice || 0)),
        0
      );
      const todayStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (mode === 'create_return_pos') {
        await createSaleReturnInDb(
          uid,
          {
            returnNumber: String(returns.length + 1),
            invoiceNumber: returnInvoiceInput || String(orders.length || 1),
            customerName: cust?.name || 'Walk-in Customer',
            paymentMode,
            dateStr: todayStr,
            totalAmount,
            items: cartItems,
          },
          products
        );
        setCartItems([]);
        setMode('sale_returns_list');
        showToast('success', 'Sale return recorded & stock updated!');
      } else {
        const nextInvNo = String(orders.length + 1);
        const orderPayload = {
          invoiceNumber: nextInvNo,
          dateStr: todayStr,
          timeStr,
          customerName: cust?.name || 'Walk-in Customer',
          customerPhone: cust?.phone || '',
          customerId: selectedCustomerId,
          paymentMode,
          priceMode,
          totalMrp,
          totalAmount,
          paidAmount: paymentMode === 'Not Paid' ? 0 : totalAmount,
          discountAmount,
          totalProfit,
          itemCount: cartItems.reduce((acc, i) => acc + i.qty, 0),
          items: cartItems,
        };
        const newId = await createOrderInDb(uid, orderPayload, products);
        setCreatedOrderModal({ id: newId, ownerId: uid, ...orderPayload });
        setCartItems([]);
        showToast('success', `Invoice #${nextInvNo} saved!`);
      }
    } catch (err) {
      console.error('Complete order/return error:', err);
      showToast('error', 'Failed to save transaction. Please try again.');
    } finally {
      setSavingBill(false);
    }
  };

  let screenContent: React.ReactNode = null;

  // ============================================================================
  // 1. SMART CALCULATOR TAB (Matches 06:16 - 06:20)
  // ============================================================================
  if (mode === 'calculator') {
    const rawCalcTotal = calcItems.reduce((acc, it) => acc + it.qty * it.retailPrice, 0);
    const currentInputVal = (Number(calcQtyStr || 1) || 1) * (Number(calcPriceStr) || 0);
    const displayTotal = Math.max(0, rawCalcTotal + currentInputVal - calcDiscount);

    const handleKeypadPress = (key: string) => {
      if (key === 'AC') {
        setCalcItemName('');
        setCalcQtyStr('');
        setCalcPriceStr('');
        setCalcItems([]);
        return;
      }
      if (key === 'Del') {
        if (calcActiveField === 'price') setCalcPriceStr((p) => p.slice(0, -1));
        else if (calcActiveField === 'qty') setCalcQtyStr((q) => q.slice(0, -1));
        else setCalcItemName((n) => n.slice(0, -1));
        return;
      }
      if (key === 'A' || key === 'B' || key === 'C' || key === 'D-Z') {
        const label =
          key === 'D-Z'
            ? `Item ${String.fromCharCode(68 + (calcItems.length % 20))}`
            : `Item ${key}`;
        setCalcItemName(label);
        setCalcActiveField('price');
        return;
      }
      if (key === 'Enter' || key === '+') {
        const priceNum = Number(calcPriceStr) || 0;
        if (priceNum <= 0) return;
        const qtyNum = Number(calcQtyStr) || 1;
        setCalcItems((prev) => [
          ...prev,
          {
            productId: '',
            name: calcItemName.trim() || `Item ${prev.length + 1}`,
            unit: 'Piece',
            qty: qtyNum,
            mrp: priceNum,
            retailPrice: priceNum,
            purchasePrice: 0,
            gst: 0,
            cess: 0,
            discount: 0,
          },
        ]);
        setCalcItemName('');
        setCalcQtyStr('');
        setCalcPriceStr('');
        setCalcActiveField('price');
        return;
      }
      if (key === '×') {
        setCalcActiveField(calcActiveField === 'price' ? 'qty' : 'price');
        return;
      }
      if (key === '-' || key === '÷' || key === '%') {
        return;
      }
      // Digits & decimal
      if (calcActiveField === 'qty') {
        setCalcQtyStr((prev) => prev + key);
      } else {
        setCalcPriceStr((prev) => prev + key);
      }
    };

    const handleCreateCalculatorBill = async () => {
      const finalItems = [...calcItems];
      if (Number(calcPriceStr) > 0) {
        const p = Number(calcPriceStr) || 0;
        const q = Number(calcQtyStr) || 1;
        finalItems.push({
          productId: '',
          name: calcItemName.trim() || `Sample Product`,
          unit: 'Piece',
          qty: q,
          mrp: p,
          retailPrice: p,
          purchasePrice: 0,
          gst: 0,
          cess: 0,
          discount: 0,
        });
      }
      if (finalItems.length === 0) {
        triggerEmptyCartToast();
        return;
      }
      setSavingBill(true);
      try {
        const cust = customers.find((c) => c.id === selectedCustomerId);
        const subTotal = finalItems.reduce((acc, i) => acc + i.qty * i.retailPrice, 0);
        const netTotal = Math.max(0, subTotal - calcDiscount);
        const todayStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const nextInvNo = String(orders.length + 1);

        const orderPayload = {
          invoiceNumber: nextInvNo,
          dateStr: todayStr,
          timeStr,
          customerName: cust?.name || '',
          customerPhone: cust?.phone || '',
          customerId: selectedCustomerId,
          paymentMode,
          priceMode,
          totalMrp: subTotal,
          totalAmount: netTotal,
          paidAmount: netTotal,
          discountAmount: calcDiscount,
          totalProfit: finalItems.reduce(
            (acc, i) => acc + i.qty * (i.retailPrice - (i.purchasePrice || 0)),
            0
          ),
          itemCount: finalItems.reduce((acc, i) => acc + i.qty, 0),
          items: finalItems,
        };
        const id = await createOrderInDb(uid, orderPayload, products);
        setCreatedOrderModal({ id, ownerId: uid, ...orderPayload });
        setCalcItems([]);
        setCalcItemName('');
        setCalcQtyStr('');
        setCalcPriceStr('');
        setCalcDiscount(0);
        showToast('success', `Invoice #${nextInvNo} created!`);
      } catch (err) {
        console.error('Calculator bill error:', err);
        showToast('error', 'Could not create bill. Please try again.');
      } finally {
        setSavingBill(false);
      }
    };

    screenContent = (
      <div className="flex flex-col h-[calc(100vh-64px)] bg-[#FAF9F5] justify-between overflow-hidden">
        {/* Top Header */}
        <div className="p-3 bg-white border-b border-slate-200 flex items-stretch justify-between gap-2.5 max-w-md mx-auto w-full">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={onBackToHome} className="text-slate-700 p-1">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onOpenAddCustomer}
                className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {selectedCustomerId
                    ? customers.find((c) => c.id === selectedCustomerId)?.name || '+ Add Customer'
                    : '+ Add Customer'}
                </span>
              </button>
            </div>

            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 bg-white outline-none"
            >
              {ALL_PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <div className="inline-flex bg-slate-100 border border-slate-300 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setPriceMode('Retail')}
                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-colors ${
                  priceMode === 'Retail' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setPriceMode('Wholesale')}
                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-colors ${
                  priceMode === 'Wholesale' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
                }`}
              >
                Wholesale
              </button>
            </div>
          </div>

          <div
            onClick={() => setCalcDiscountModal(true)}
            className="w-40 bg-gradient-to-br from-[#0A2540] to-[#134e6f] text-white rounded-2xl p-3 flex flex-col justify-between cursor-pointer shadow-sm"
          >
            <p className="text-[11px] text-slate-200 text-center">
              {calcDiscount > 0 ? `Discount: ₹${calcDiscount}` : 'Tap to add discount'}
            </p>
            <div className="text-center">
              <p className="text-xs text-slate-300">Total</p>
              <p className="text-xl font-extrabold tabular-nums">₹{displayTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Itemized Table Header & Rows */}
        <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full bg-white border-b border-slate-200">
          <div className="grid grid-cols-12 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 sticky top-0">
            <div className="col-span-2 px-2.5 py-2 border-r border-slate-200 flex items-center justify-between">
              <span>Sr</span>
              <span className="text-[10px] text-slate-400">☰</span>
            </div>
            <div className="col-span-5 px-2.5 py-2 border-r border-slate-200 flex items-center justify-between">
              <span>Item</span>
              <span className="text-[10px] text-slate-400">☰</span>
            </div>
            <div className="col-span-2 px-2.5 py-2 border-r border-slate-200 flex items-center justify-between">
              <span>Qty</span>
              <span className="text-[10px] text-slate-400">☰</span>
            </div>
            <div className="col-span-3 px-2.5 py-2 flex items-center justify-between">
              <span>Sp.</span>
              <span className="text-[10px] text-slate-400">☰</span>
            </div>
          </div>

          {calcItems.map((it, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 border-b border-slate-100 text-xs text-slate-800 items-center"
            >
              <div className="col-span-2 px-2.5 py-2 font-mono">{idx + 1}</div>
              <div className="col-span-5 px-2.5 py-2 font-semibold truncate">{it.name}</div>
              <div className="col-span-2 px-2.5 py-2 tabular-nums">{it.qty}</div>
              <div className="col-span-3 px-2.5 py-2 font-bold tabular-nums flex items-center justify-between">
                <span>₹{(it.qty * it.retailPrice).toFixed(0)}</span>
                <button
                  type="button"
                  onClick={() => setCalcItems((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-red-500"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Input Row + Custom Keypad (Matches 06:16) */}
        <div className="max-w-md mx-auto w-full bg-[#0A2540]">
          {/* Navy Input Labels */}
          <div className="grid grid-cols-12 px-4 pt-2 pb-1 text-white text-xs font-extrabold">
            <div className="col-span-5">Item</div>
            <div className="col-span-3 text-center">QTY</div>
            <div className="col-span-4 text-right">Price (₹)</div>
          </div>

          {/* Rounded Input Pill Bar */}
          <div className="px-2 pb-2">
            <div className="bg-white rounded-full px-4 py-2 grid grid-cols-12 items-center gap-2">
              <input
                type="text"
                value={calcItemName}
                onFocus={() => setCalcActiveField('item')}
                onChange={(e) => setCalcItemName(e.target.value)}
                placeholder="Calculate"
                className="col-span-5 text-xs font-semibold text-slate-700 outline-none"
              />
              <input
                type="text"
                value={calcQtyStr}
                onFocus={() => setCalcActiveField('qty')}
                onChange={(e) => setCalcQtyStr(e.target.value)}
                placeholder="e.g: 2"
                className={`col-span-3 text-xs font-bold text-center outline-none rounded px-1 py-0.5 ${
                  calcActiveField === 'qty' ? 'bg-blue-50 text-[#0A2540]' : 'text-slate-700'
                }`}
              />
              <input
                type="text"
                value={calcPriceStr}
                onFocus={() => setCalcActiveField('price')}
                onChange={(e) => setCalcPriceStr(e.target.value)}
                placeholder="e.g: 100"
                className={`col-span-4 text-xs font-bold text-right outline-none rounded px-1 py-0.5 ${
                  calcActiveField === 'price' ? 'bg-blue-50 text-[#0A2540]' : 'text-slate-700'
                }`}
              />
            </div>
          </div>

          {/* Interactive Keypad Grid */}
          <div className="bg-[#0e486e] p-2.5 grid grid-cols-4 gap-2">
            {['A', 'B', 'C', 'D-Z'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleKeypadPress(k)}
                className="bg-white text-slate-900 font-bold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
              >
                {k}
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleKeypadPress('Del')}
              className="bg-[#f8bbd0] text-slate-900 font-bold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              Del
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('AC')}
              className="bg-[#f8bbd0] text-slate-900 font-bold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              AC
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('%')}
              className="bg-[#d1e9ff] text-slate-900 font-bold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('÷')}
              className="bg-[#d1e9ff] text-slate-900 font-bold text-base py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              ÷
            </button>

            {['7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleKeypadPress(d)}
                className="bg-[#faf0f2] text-slate-900 font-bold text-base py-2.5 rounded-xl shadow-xs active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleKeypadPress('×')}
              className="bg-[#d1e9ff] text-slate-900 font-bold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              x
            </button>

            {['4', '5', '6'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleKeypadPress(d)}
                className="bg-[#faf0f2] text-slate-900 font-bold text-base py-2.5 rounded-xl shadow-xs active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleKeypadPress('-')}
              className="bg-[#d1e9ff] text-slate-900 font-bold text-lg py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              -
            </button>

            {['1', '2', '3'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleKeypadPress(d)}
                className="bg-[#faf0f2] text-slate-900 font-bold text-base py-2.5 rounded-xl shadow-xs active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleKeypadPress('+')}
              className="bg-[#d1e9ff] text-slate-900 font-bold text-lg py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress('.')}
              className="bg-[#faf0f2] text-slate-900 font-bold text-lg py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              .
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="bg-[#faf0f2] text-slate-900 font-bold text-base py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress('Enter')}
              className="col-span-2 bg-[#d1e9ff] text-slate-900 font-extrabold text-sm py-2.5 rounded-xl shadow-xs active:scale-95"
            >
              Enter
            </button>

            <button
              type="button"
              onClick={() => setCalcStockSearchModal(true)}
              className="bg-[#c2e4ff] text-slate-900 font-bold py-2.5 rounded-xl flex items-center justify-center shadow-xs active:scale-95"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={savingBill}
              onClick={handleCreateCalculatorBill}
              className="col-span-3 bg-[#1ebbd7] hover:bg-[#17a2b8] text-white font-extrabold text-sm py-2.5 rounded-xl shadow-sm active:scale-98"
            >
              {savingBill ? 'Creating Bill...' : 'Create Bill'}
            </button>
          </div>
        </div>

        {/* Stock Item Picker Modal for Calculator */}
        {calcStockSearchModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-96 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-[#0A2540]">Select Product</h3>
                <button
                  type="button"
                  onClick={() => setCalcStockSearchModal(false)}
                  className="text-xs text-slate-500"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5">
                {products.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">
                    No stock items yet. Type price directly on keypad!
                  </p>
                ) : (
                  products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setCalcItems((prev) => [
                          ...prev,
                          {
                            productId: p.id,
                            name: p.name,
                            unit: p.unit,
                            qty: 1,
                            mrp: p.mrp,
                            retailPrice: p.retailPrice,
                            purchasePrice: p.purchasePrice,
                            gst: p.gst,
                            cess: p.cess,
                            discount: 0,
                          },
                        ]);
                        setCalcStockSearchModal(false);
                      }}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 flex justify-between text-xs"
                    >
                      <span className="font-bold text-[#0A2540]">{p.name}</span>
                      <span className="font-extrabold text-emerald-700">₹{p.retailPrice}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discount Modal */}
        {calcDiscountModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-3">
              <h3 className="text-sm font-bold text-[#0A2540]">Bill Discount (₹)</h3>
              <input
                type="number"
                value={calcDiscount}
                onChange={(e) => setCalcDiscount(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setCalcDiscountModal(false)}
                  className="bg-[#0A2540] text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  } else if (mode === 'eway_bills') {
    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMode('past_orders')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">E-Way Bills</h1>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <Truck className="w-16 h-16 text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-600">No E-Way Bills Yet</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            E-way bills you generate from orders will appear here.
          </p>
        </div>
      </div>
    );
  } else if (mode === 'sale_returns_list') {
    const filteredReturns = returns.filter((r) => {
      if (!returnSearch.trim()) return true;
      const q = returnSearch.toLowerCase();
      return (
        r.returnNumber.toLowerCase().includes(q) ||
        (r.customerName || '').toLowerCase().includes(q) ||
        String(r.totalAmount).includes(q)
      );
    });
    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-24">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Sale Returns</h1>
        </header>

        <div className="p-4 space-y-3.5 max-w-md mx-auto w-full flex-1 flex flex-col">
          {/* Date Selector Card */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-600">📅</span>
              <div>
                <p className="text-xs font-extrabold text-[#0A2540]">All Returns</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{orderDateFilter}</p>
              </div>
            </div>
            <SlidersHorizontal className="w-4 h-4 text-slate-600" />
          </div>

          {/* Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={returnSearch}
              onChange={(e) => setReturnSearch(e.target.value)}
              placeholder="Search by ID, customer, or amount"
              className="flex-1 text-xs text-slate-800 outline-none"
            />
          </div>

          {filteredReturns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <p className="text-xs font-semibold text-slate-700">No returns found.</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Click the + button to create a new return.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredReturns.map((r) => (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <h4 className="text-sm font-extrabold text-[#0A2540]">
                      Return #{r.returnNumber}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {r.dateStr} · {r.customerName || 'Walk-in'} ({r.paymentMode})
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-red-600 tabular-nums">
                    ₹{r.totalAmount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating + New Return Button */}
        <button
          type="button"
          onClick={() => setCreateReturnSheet(true)}
          className="fixed bottom-6 right-5 z-30 bg-[#1a3b70] text-white font-bold text-xs px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-2"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>New Return</span>
        </button>

        {/* Create Return Bottom Sheet (Matches 10:29) */}
        {createReturnSheet && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3">
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1" />
              <div className="flex items-center gap-2.5 pb-1">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                </div>
                <h3 className="text-base font-extrabold text-[#0A2540]">Create Return</h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCreateReturnSheet(false);
                  setReturnFromInvoiceModal(true);
                }}
                className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                    #
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-[#0A2540]">From Invoice Number</p>
                    <p className="text-[11px] text-slate-400">
                      Create return using existing invoice ID
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreateReturnSheet(false);
                  setReturnFromPhoneModal(true);
                }}
                className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-[#0A2540]">From Customer Order</p>
                    <p className="text-[11px] text-slate-400">
                      Create return from customer's phone number
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreateReturnSheet(false);
                  setCartItems([]);
                  setMode('create_return_pos');
                }}
                className="w-full bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    📦
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-[#0A2540]">Create New Return</p>
                    <p className="text-[11px] text-slate-400">
                      Start fresh with a new return entry
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setCreateReturnSheet(false)}
                className="w-full py-2.5 text-xs font-bold text-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* From Invoice Number Modal (Matches 10:32) */}
        {returnFromInvoiceModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-[#0A2540]">Enter the invoice number</h3>
              <div className="relative">
                <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-slate-500">
                  Invoice
                </span>
                <input
                  type="text"
                  value={returnInvoiceInput}
                  onChange={(e) => setReturnInvoiceInput(e.target.value)}
                  placeholder="# Ex: 21"
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-3 text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReturnFromInvoiceModal(false)}
                  className="bg-[#0A2540] text-white font-bold text-xs py-3.5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const matchedOrder = orders.find(
                      (o) => o.invoiceNumber === returnInvoiceInput.replace('#', '').trim()
                    );
                    if (matchedOrder) {
                      setCartItems(matchedOrder.items);
                    }
                    setReturnFromInvoiceModal(false);
                    setMode('create_return_pos');
                  }}
                  className="bg-[#0A2540] text-white font-bold text-xs py-3.5 rounded-xl"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* From Customer Order Phone Modal (Matches 10:36) */}
        {returnFromPhoneModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-[#0A2540]">Enter phone or Search by name</h3>
              <div className="relative">
                <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-slate-500">
                  Phone
                </span>
                <input
                  type="text"
                  value={returnPhoneInput}
                  onChange={(e) => setReturnPhoneInput(e.target.value)}
                  placeholder="+91 Ex: 9876543210"
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-3 text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReturnFromPhoneModal(false)}
                  className="bg-[#0A2540] text-white font-bold text-xs py-3.5 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const clean = returnPhoneInput.trim().toLowerCase();
                    const matchedCust = customers.find(
                      (c) =>
                        c.phone.toLowerCase().includes(clean) ||
                        c.name.toLowerCase().includes(clean)
                    );
                    if (matchedCust) setSelectedCustomerId(matchedCust.id);
                    const matchedOrder = orders.find(
                      (o) =>
                        (o.customerPhone && o.customerPhone.toLowerCase().includes(clean)) ||
                        (o.customerName && o.customerName.toLowerCase().includes(clean))
                    );
                    if (matchedOrder) setCartItems(matchedOrder.items);
                    setReturnFromPhoneModal(false);
                    setMode('create_return_pos');
                  }}
                  className="bg-[#0A2540] text-white font-bold text-xs py-3.5 rounded-xl"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  } else if (mode === 'past_orders') {
    const filteredOrders = orders.filter((o) => {
      if (filterByDate && orderDateFilter && o.dateStr !== orderDateFilter) {
        return false;
      }
      if (activeOrderChip !== 'All') {
        if (activeOrderChip === 'Not Paid' && o.paidAmount >= o.totalAmount) return false;
        if (
          activeOrderChip !== 'Not Paid' &&
          activeOrderChip !== 'Past Collection' &&
          o.paymentMode.toLowerCase() !== activeOrderChip.toLowerCase()
        ) {
          return false;
        }
      }
      if (!orderSearch.trim()) return true;
      const q = orderSearch.toLowerCase();
      return (
        o.invoiceNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        String(o.totalAmount).includes(q)
      );
    });

    const totalSalesVal = filteredOrders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
    const toCollectVal = filteredOrders.reduce(
      (acc, o) => acc + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.paidAmount) || 0)),
      0
    );
    const pastCollectionVal = filteredOrders.reduce(
      (acc, o) => acc + (Number(o.paidAmount) || 0),
      0
    );

    const sumByMode = (m: string) =>
      filteredOrders
        .filter((o) => o.paymentMode.toLowerCase() === m.toLowerCase())
        .reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);

    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-28">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Past Orders</h1>
        </header>

        <div className="p-4 space-y-3.5 max-w-md mx-auto w-full">
          {/* Date Picker Row */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-600">📅</span>
              <div>
                <p className="text-xs font-extrabold text-[#0A2540]">
                  {filterByDate ? 'Selected Date' : 'All Dates'}
                </p>
                <input
                  type="date"
                  value={orderDateFilter}
                  onChange={(e) => {
                    setOrderDateFilter(e.target.value);
                    setFilterByDate(true);
                  }}
                  className="text-[11px] text-slate-500 outline-none bg-transparent tabular-nums"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFilterByDate((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-bold text-[#0A2540]"
            >
              {filterByDate ? 'Show All' : 'Filter Date'}
            </button>
          </div>

          {/* Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by amount, items, customer, or #"
              className="flex-1 text-xs text-slate-800 outline-none"
            />
          </div>

          {/* Horizontal Filter Chips (Matches 10:01 - 10:19) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {ORDER_FILTER_CHIPS.map((chip) => {
              const active = activeOrderChip === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveOrderChip(chip)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors ${
                    active
                      ? 'bg-[#0A2540] text-white border-[#0A2540]'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Dark Navy Today Summary Card (Matches 10:01 & 10:22) */}
          <div className="bg-gradient-to-br from-[#0A2540] to-[#134e6f] text-white rounded-2xl p-4 shadow-md space-y-3">
            <div
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs">
                  💳
                </span>
                <h3 className="text-sm font-extrabold">
                  {filterByDate ? 'Date Summary' : 'Orders Summary'}
                </h3>
              </div>
              <div className="bg-white/15 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1.5">
                <span>{filteredOrders.length} orders</span>
                {summaryExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/10 border border-white/10 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-slate-200">Total Sales</p>
                <p className="text-sm font-extrabold mt-0.5 tabular-nums">₹{totalSalesVal}</p>
              </div>
              <div className="bg-white/10 border border-white/10 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-slate-200">To Collect</p>
                <p className="text-sm font-extrabold mt-0.5 tabular-nums">₹{toCollectVal}</p>
              </div>
              <div className="bg-white/10 border border-white/10 rounded-xl p-2.5 text-center">
                <p className="text-[10px] text-slate-200">Collection</p>
                <p className="text-sm font-extrabold mt-0.5 tabular-nums">₹{pastCollectionVal}</p>
              </div>
            </div>

            {summaryExpanded && (
              <div className="pt-2 border-t border-white/15 space-y-2">
                <p className="text-xs font-bold text-slate-200">Payment Methods</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'UPI', val: sumByMode('UPI') },
                    { label: 'Cash', val: sumByMode('Cash') },
                    { label: 'Card', val: sumByMode('Card') },
                    { label: 'Delivery', val: sumByMode('Delivery') },
                    { label: 'Pickup', val: sumByMode('Pickup') },
                    { label: 'Wallet', val: sumByMode('Wallet') },
                  ].map((pm) => (
                    <span
                      key={pm.label}
                      className="bg-white/15 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums"
                    >
                      {pm.label}: ₹{pm.val}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Orders List Cards (Matches 10:01) */}
          <div className="space-y-3">
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
                No orders found for the current filter.
              </div>
            ) : (
              filteredOrders.map((o) => (
                <div
                  key={o.id}
                  onClick={() => setCreatedOrderModal(o)}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5 cursor-pointer hover:border-[#0A2540]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-extrabold text-[#0A2540]">
                        #{o.invoiceNumber}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {o.dateStr} • {o.timeStr} {o.customerName ? `• ${o.customerName}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block border border-slate-300 rounded px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                        {o.paymentMode}
                      </span>
                      <p className="text-[10px] text-[#1565c0] font-bold mt-1">
                        Tap for Receipt / PDF
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-600">{o.itemCount} items</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        MRP: ₹{o.totalMrp} •{' '}
                        <span className="text-red-500 font-semibold">
                          Discount: ₹{o.discountAmount}
                        </span>
                      </p>
                    </div>
                    <span className="text-base font-extrabold text-emerald-600 tabular-nums">
                      ₹{o.totalAmount}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Floating Buttons: E-Way Bills & Returns & Exchange (Matches 10:01) */}
        <div className="fixed bottom-5 right-4 z-30 flex flex-col items-end gap-2.5">
          <button
            type="button"
            onClick={() => setMode('eway_bills')}
            className="bg-[#008952] text-white font-bold text-xs px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2 active:scale-95"
          >
            <Truck className="w-4 h-4" />
            <span>E-Way Bills</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('sale_returns_list')}
            className="bg-[#1a3b70] text-white font-bold text-xs px-4 py-3.5 rounded-2xl shadow-lg flex items-center gap-2 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Returns & Exchange</span>
          </button>
        </div>
      </div>
    );
  } else {
    const totalBillAmt = cartItems.reduce((acc, i) => acc + i.qty * i.retailPrice, 0);
    const totalCartQty = cartItems.reduce((acc, i) => acc + i.qty, 0);

    screenContent = (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-20">
        <div className="max-w-md mx-auto flex items-stretch justify-between gap-3">
          <div className="flex-1 space-y-2 relative">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  mode === 'create_return_pos' ? setMode('sale_returns_list') : onBackToHome()
                }
                className="text-slate-800 p-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onOpenAddCustomer}
                className="text-xs font-extrabold text-emerald-700"
              >
                {selectedCustomerId
                  ? customers.find((c) => c.id === selectedCustomerId)?.name || '+Add Customer'
                  : '+Add Customer'}
              </button>
              {customers.length > 0 && (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5"
                >
                  <option value="">Walk-in</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Payment Mode Dropdown Trigger (Matches 11:06) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPaymentMenuOpen(!paymentMenuOpen)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 bg-white flex items-center justify-between"
              >
                <span>{paymentMode}</span>
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </button>

              {paymentMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-2xl z-40 max-h-80 overflow-y-auto py-1">
                  {ALL_PAYMENT_MODES.map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => {
                        setPaymentMode(pm);
                        setPaymentMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold ${
                        paymentMode === pm
                          ? 'bg-slate-200/80 text-[#0A2540] font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Retail / Wholesale Toggle */}
            <div className="inline-flex bg-white border border-slate-300 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => setPriceMode('Retail')}
                className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${
                  priceMode === 'Retail' ? 'bg-[#0A2540] text-white' : 'text-slate-700'
                }`}
              >
                Retail
              </button>
              <button
                type="button"
                onClick={() => setPriceMode('Wholesale')}
                className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${
                  priceMode === 'Wholesale' ? 'bg-[#0A2540] text-white' : 'text-slate-700'
                }`}
              >
                Wholesale
              </button>
            </div>
          </div>

          {/* Right Total Box */}
          <div className="w-36 bg-gradient-to-br from-[#0A2540] to-[#134e6f] text-white rounded-xl p-3 flex flex-col items-center justify-center shadow-sm">
            <p className="text-xs font-bold text-slate-200">Total (₹)</p>
            <p className="text-2xl font-extrabold mt-1 tabular-nums">₹ {totalBillAmt}</p>
          </div>
        </div>
      </div>

      {/* Center Cart Items */}
      <div className="flex-1 max-w-md mx-auto w-full p-4 space-y-2.5">
        {cartItems.map((it, idx) => (
          <div
            key={`${it.productId}_${idx}`}
            className="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between shadow-xs"
          >
            <div>
              <h4 className="text-sm font-extrabold text-[#0A2540]">{it.name}</h4>
              <p className="text-xs text-slate-500">
                ₹{it.retailPrice} × {it.qty} {it.unit}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCartItems((prev) =>
                    prev
                      .map((item, i) => (i === idx ? { ...item, qty: item.qty - 1 } : item))
                      .filter((item) => item.qty > 0)
                  )
                }
                className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-sm"
              >
                -
              </button>
              <span className="text-xs font-extrabold w-5 text-center tabular-nums">{it.qty}</span>
              <button
                type="button"
                onClick={() =>
                  setCartItems((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, qty: item.qty + 1 } : item))
                  )
                }
                className="w-7 h-7 rounded-lg bg-slate-100 font-bold text-sm"
              >
                +
              </button>
              <span className="text-sm font-extrabold text-[#0A2540] ml-2 tabular-nums">
                ₹{it.qty * it.retailPrice}
              </span>
              <button
                type="button"
                onClick={() => setCartItems((prev) => prev.filter((_, i) => i !== idx))}
                className="text-red-500 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty Cart Toast (Matches 10:45) */}
      {emptyCartToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm bg-[#b94a48] text-white rounded-2xl p-3.5 shadow-xl flex items-center gap-3 animate-in fade-in duration-150">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-xs font-extrabold">Cart is empty</p>
            <p className="text-[11px] text-red-100">Add items to the cart first</p>
          </div>
        </div>
      )}

      {/* Bottom POS Controls (Matches 10:41) */}
      <div className="sticky bottom-0 z-20 bg-[#FAF9F5] pt-2 pb-4 px-4 max-w-md mx-auto w-full space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setVoiceModalOpen(true)}
            className="bg-purple-100 border border-purple-300 text-purple-800 rounded-xl px-3.5 py-2 text-xs font-extrabold flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <Mic className="w-4 h-4" />
            <span>AI Voice Bill</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchFocused(true)}
            className="bg-[#0e5a7a] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-2 shadow-sm"
          >
            <div className="text-left">
              <p className="text-[10px] opacity-85">({cartItems.length}) items</p>
              <p className="text-xs font-extrabold">Find</p>
            </div>
            <Search className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="bg-[#94775c] text-white rounded-xl py-3.5 px-4 font-bold text-sm shadow-sm active:scale-98"
          >
            Quick add
          </button>

          <button
            type="button"
            disabled={savingBill}
            onClick={handleCompletePosOrReturn}
            className="bg-[#4CAF50] text-white rounded-xl py-2.5 px-4 flex items-center justify-between shadow-sm active:scale-98"
          >
            <div className="text-left">
              <p className="text-[10px] opacity-90">Total ({totalCartQty})</p>
              <p className="text-xs font-extrabold">
                {mode === 'create_return_pos' ? 'Return/Exchange' : 'Create Bill'}
              </p>
            </div>
            <span className="text-base font-bold">→</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-xs">
            <input
              type="text"
              value={posSearch}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Search by name or barcode"
              className="w-full text-xs text-slate-800 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenScanner(
                (code, visionResult) => {
                  const matched = products.find((p) => p.barcode === code);
                  if (matched) {
                    addProductToCart(matched);
                  } else if (visionResult?.items && visionResult.items.length > 0) {
                    const newCartItems: OrderLineItem[] = visionResult.items.map((it, idx) => {
                      const found = products.find(
                        (p) =>
                          (it.barcode && p.barcode === it.barcode) ||
                          (it.name && p.name.toLowerCase() === it.name.toLowerCase())
                      );
                      return {
                        productId: found?.id || `scan_pos_${Date.now()}_${idx}`,
                        name: found?.name || it.name || `Item ${code}`,
                        variantName: found?.variantName || '',
                        barcode: found?.barcode || it.barcode || it.imei || code,
                        unit: found?.unit || it.unit || 'Piece',
                        qty: it.qty || 1,
                        mrp: it.mrp || it.price || found?.mrp || 0,
                        retailPrice: it.price || found?.retailPrice || 0,
                        purchasePrice: found?.purchasePrice || 0,
                        gst: found?.gst || 0,
                        cess: found?.cess || 0,
                        hsn: found?.hsn || '',
                        discount: 0,
                      };
                    });
                    setCartItems((prev) => [...prev, ...newCartItems]);
                  } else {
                    setQaBarcode(code);
                    if (visionResult?.productName) setQaName(visionResult.productName);
                    if (visionResult?.mrp || visionResult?.price) {
                      const p = String(visionResult.mrp || visionResult.price);
                      setQaMrp(p);
                      setQaRetail(String(visionResult.price || visionResult.mrp));
                    }
                    if (visionResult?.qty) setQaQty(String(visionResult.qty));
                    setQuickAddOpen(true);
                  }
                },
                { scanMode: 'barcode_or_imei', title: 'Scan Product Barcode / IMEI' }
              )
            }
            className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-xs"
          >
            <span>Scan</span>
            <ScanLine className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Full-Screen Product Search Drawer (Matches 10:54) */}
      {searchFocused && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col max-w-md mx-auto">
          <div className="p-3 border-b border-slate-200 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchFocused(false)}
              className="p-2 text-slate-700"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <input
              type="text"
              autoFocus
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Search by name or barcode"
              className="flex-1 text-sm outline-none"
            />
          </div>
          <label className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBfInventory}
              onChange={(e) => setIncludeBfInventory(e.target.checked)}
              className="w-4 h-4 accent-[#0A2540]"
            />
            <span>Include Products from BF Inventory</span>
          </label>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {products
              .filter(
                (p) =>
                  !posSearch.trim() ||
                  p.name.toLowerCase().includes(posSearch.toLowerCase()) ||
                  (p.barcode && p.barcode.includes(posSearch))
              )
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    addProductToCart(p);
                    setSearchFocused(false);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">{p.name}</p>
                    <p className="text-[11px] text-slate-400">Stock: {p.quantity} {p.unit}</p>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-700">₹{p.retailPrice}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Quick Add Bottom Sheet inside POS (Matches 10:57) */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold">
                  +
                </div>
                <h3 className="text-base font-extrabold text-[#0A2540]">Quick add</h3>
              </div>
              <button
                type="button"
                onClick={() => setQaVariant((v) => v || 'Standard')}
                className="bg-[#0e5a7a] text-white text-xs font-bold px-3.5 py-2 rounded-xl"
              >
                Variant of?
              </button>
            </div>

            <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={qaAddToInv}
                onChange={(e) => setQaAddToInv(e.target.checked)}
                className="w-4 h-4 accent-[#0A2540]"
              />
              <span className="text-xs font-bold text-[#0A2540]">Add to Inventory</span>
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Barcode</label>
              <div className="flex items-center border border-slate-300 rounded-xl px-3 py-2 gap-2">
                <input
                  type="text"
                  value={qaBarcode}
                  onChange={(e) => setQaBarcode(e.target.value)}
                  placeholder="Enter or scan barcode"
                  className="flex-1 text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => onOpenScanner((c) => setQaBarcode(c))}
                  className="text-slate-600 p-1"
                >
                  <ScanLine className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setQaBarcode(String(Math.floor(100000000000 + Math.random() * 900000000000)))
                  }
                  className="text-slate-600 p-1"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Enter Product Name"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Variant Name (optional)
              </label>
              <input
                type="text"
                value={qaVariant}
                onChange={(e) => setQaVariant(e.target.value)}
                placeholder="e.g. 500ml, Red, Large"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">MRP *</label>
                <input
                  type="number"
                  value={qaMrp}
                  onChange={(e) => {
                    setQaMrp(e.target.value);
                    if (qaRetail === '0.00' || !qaRetail) setQaRetail(e.target.value);
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Retail Price *
                </label>
                <input
                  type="number"
                  value={qaRetail}
                  onChange={(e) => setQaRetail(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  value={qaQty}
                  onChange={(e) => setQaQty(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              </div>
              <select
                value={qaUnit}
                onChange={(e) => setQaUnit(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold"
              >
                <option value="Piece">Piece</option>
                <option value="Kilogram">Kilogram</option>
                <option value="Gram">Gram</option>
                <option value="Litre">Litre</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                className="py-3 rounded-xl border border-slate-300 font-bold text-sm text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingQuickAddPos}
                onClick={handleSaveQuickAddPos}
                className="py-3 rounded-xl bg-[#0A2540] text-white font-bold text-sm disabled:opacity-60"
              >
                {savingQuickAddPos ? 'Saving...' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SmartVoiceModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        context="billing"
        title="🎙️ AI Voice Billing"
        onVoiceApplied={(result: ParsedVoiceResult) => {
          const items = result.items || [];
          if (items.length === 0 && result.transcript) {
            setQaName(result.transcript);
            setQuickAddOpen(true);
            return;
          }
          if (items.length === 1 && (!items[0].price || items[0].price <= 0)) {
            const matched = products.find(
              (p) => p.name.toLowerCase() === items[0].name.toLowerCase()
            );
            if (matched) {
              addProductToCart(matched);
              return;
            }
            setQaName(items[0].name);
            setQaQty(String(items[0].qty || 1));
            setQaUnit(items[0].unit || 'Piece');
            setQuickAddOpen(true);
            return;
          }
          const voiceCartItems: OrderLineItem[] = items.map((it, idx) => {
            const matched = products.find(
              (p) =>
                p.name.toLowerCase() === it.name.toLowerCase() ||
                (it.barcode && p.barcode === it.barcode)
            );
            const price = it.price || matched?.retailPrice || 0;
            return {
              productId: matched?.id || `voice_pos_${Date.now()}_${idx}`,
              name: matched?.name || it.name,
              variantName: matched?.variantName || '',
              barcode: matched?.barcode || it.barcode || '',
              unit: matched?.unit || it.unit || 'Piece',
              qty: it.qty || 1,
              mrp: it.mrp || price || matched?.mrp || 0,
              retailPrice: price,
              purchasePrice: matched?.purchasePrice || 0,
              gst: matched?.gst || 0,
              cess: matched?.cess || 0,
              hsn: matched?.hsn || '',
              discount: 0,
            };
          });
          setCartItems((prev) => [...prev, ...voiceCartItems]);
        }}
      />
    </div>
    );
  }

  return (
    <>
      {screenContent}

      {/* Global Toast */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-sm rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2.5 text-xs font-bold text-white ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Created / Past Invoice Receipt Preview Modal */}
      {createdOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span>Invoice #{createdOrderModal.invoiceNumber}</span>
              </div>
              <button
                type="button"
                onClick={() => setCreatedOrderModal(null)}
                className="text-xs font-bold text-slate-400"
              >
                Close
              </button>
            </div>

            <div
              id="pos-receipt-card"
              className="border border-slate-300 rounded-xl p-4 bg-white text-slate-900 font-mono text-xs space-y-2"
            >
              <div className="text-center border-b border-dashed border-slate-400 pb-2">
                <p className="font-bold text-sm">{profile.shopName}</p>
                <p className="text-[10px]">{profile.phone}</p>
                {createdOrderModal.customerName && (
                  <p className="text-[10px]">Customer: {createdOrderModal.customerName}</p>
                )}
                <p className="text-[10px]">
                  {createdOrderModal.dateStr} {createdOrderModal.timeStr} · INV #
                  {createdOrderModal.invoiceNumber}
                </p>
              </div>
              <div className="space-y-1 border-b border-dashed border-slate-400 pb-2">
                {createdOrderModal.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      ({idx + 1}) {it.name} × {it.qty}
                    </span>
                    <span>₹{(it.qty * it.retailPrice).toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>Total ({createdOrderModal.paymentMode})</span>
                <span>₹{createdOrderModal.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex flex-col items-center pt-2">
                <span className="text-[10px] mb-1">Scan QR to Pay Bill</span>
                <QRCodeSVG
                  value={`upi://pay?pa=${(profile.phone || '0000000000').replace(/[^0-9]/g, '')}@upi&pn=${encodeURIComponent(profile.shopName || 'SmartBill CM')}&am=${createdOrderModal.totalAmount}`}
                  size={96}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  downloadElementAsPdf(
                    'pos-receipt-card',
                    `Invoice_${createdOrderModal.invoiceNumber}`
                  )
                }
                className="bg-slate-100 text-[#0A2540] font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedOrderModal(null)}
                className="bg-[#0A2540] text-white font-bold text-xs py-3 rounded-xl"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
