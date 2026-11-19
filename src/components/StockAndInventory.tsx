import React, { useState } from 'react';
import {
  ChevronLeft,
  Play,
  MoreVertical,
  ArrowUpDown,
  FileSpreadsheet,
  ScanLine,
  SlidersHorizontal,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Flame,
  ShoppingCart,
  AlertTriangle,
  Archive,
  Clock,
  Search,
  Plus,
  ChevronRight,
  Mic,
  Camera,
  Download,
  Upload,
  CheckCircle2,
  Copy,
  Trash2,
  Lock,
  Edit3,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  saveProductToDb,
  deleteProductFromDb,
  createPurchaseInDb,
  updateUserProfile,
  type ProductDoc,
  type OrderDoc,
  type ExpenseDoc,
  type SupplierDoc,
  type UserProfileDoc,
  type ProductVariantItem,
  type OrderLineItem,
} from '../firebase';
import {
  askGroqInventoryAssistant,
  downloadInventoryTemplate,
  exportStockToExcel,
  parseExcelInventoryFile,
  type ScannedVisionResult,
  type ParsedVoiceResult,
} from '../services/integrations';
import { SmartVoiceModal } from './SmartVoiceModal';
import { ApkPhotoSheet } from './ApkPhotoSheet';

export type InventorySubScreen =
  | 'my_stock'
  | 'add_hub'
  | 'purchase_entry'
  | 'excel_import'
  | 'manual_add';

interface StockAndInventoryProps {
  uid: string;
  subScreen: InventorySubScreen;
  setSubScreen: (s: InventorySubScreen) => void;
  onBackToHome: () => void;
  products: ProductDoc[];
  orders: OrderDoc[];
  expenses: ExpenseDoc[];
  suppliers: SupplierDoc[];
  profile: UserProfileDoc;
  onOpenScanner: (
    cb: (code: string, visionResult?: ScannedVisionResult) => void,
    opts?: { scanMode?: 'barcode_or_imei' | 'bill_items'; title?: string }
  ) => void;
  onOpenAddSupplier: () => void;
}

const UNITS_LIST = [
  'Bag',
  'Gram',
  'Kilogram',
  'Litre',
  'Metre',
  'Millilitre',
  'Piece',
];

export const StockAndInventory: React.FC<StockAndInventoryProps> = ({
  uid,
  subScreen,
  setSubScreen,
  onBackToHome,
  products,
  orders,
  expenses,
  suppliers,
  profile,
  onOpenScanner,
  onOpenAddSupplier,
}) => {
  // My Stock states
  const [stockTab, setStockTab] = useState<'all' | 'low' | 'archived' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [aiExpanded, setAiExpanded] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [customAiPrompt, setCustomAiPrompt] = useState('');

  // Quick Add Bottom Sheet (used in Purchase Entry & My Stock)
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaAddToInventory, setQaAddToInventory] = useState(true);
  const [qaBarcode, setQaBarcode] = useState('');
  const [qaName, setQaName] = useState('');
  const [qaVariant, setQaVariant] = useState('');
  const [qaMrp, setQaMrp] = useState('0.00');
  const [qaRetail, setQaRetail] = useState('0.00');
  const [qaQty, setQaQty] = useState('1');
  const [qaUnit, setQaUnit] = useState('Piece');
  const [qaAdditionalOpen, setQaAdditionalOpen] = useState(false);
  const [qaWholesale, setQaWholesale] = useState('');
  const [qaCess, setQaCess] = useState('');
  const [qaGst, setQaGst] = useState('');
  const [qaHsn, setQaHsn] = useState('');
  const [qaPurchasePrice, setQaPurchasePrice] = useState('');
  const [qaRack, setQaRack] = useState('');

  // Purchase Entry states
  const [purSupplierId, setPurSupplierId] = useState('');
  const [purPaymentMode, setPurPaymentMode] = useState('Cash');
  const [purDate, setPurDate] = useState(new Date().toISOString().slice(0, 10));
  const [purBillUrl, setPurBillUrl] = useState('');
  const [purDiscount, setPurDiscount] = useState(0);
  const [purDiscountModal, setPurDiscountModal] = useState(false);
  const [purItems, setPurItems] = useState<OrderLineItem[]>([]);
  const [purSearch, setPurSearch] = useState('');
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceContext, setVoiceContext] = useState<'purchase' | 'search'>('purchase');
  const [photoSheetTarget, setPhotoSheetTarget] = useState<'purchase_bill' | 'manual_product' | null>(null);
  const [savingPurchase, setSavingPurchase] = useState(false);

  // Excel Import states
  const [parsedExcelItems, setParsedExcelItems] = useState<Partial<ProductDoc>[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelImportSuccess, setExcelImportSuccess] = useState<string | null>(null);

  // Manual Add states
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('0');
  const [manualUnit, setManualUnit] = useState('Piece');
  const [manualUnitMenuOpen, setManualUnitMenuOpen] = useState(false);
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const [bomItems, setBomItems] = useState<{ rawMaterialName: string; qtyRequired: number; unit: string }[]>([]);
  const [variants, setVariants] = useState<ProductVariantItem[]>([
    {
      variantName: '',
      quantity: 0,
      barcode: '',
      mrp: 0,
      retailPrice: 0,
      wholesalePrice: 0,
      purchasePrice: 0,
      setAsDefault: true,
      includingGst: true,
      discountValue: 0,
      discountType: '%',
      batch: '',
      packOf: 1,
      hsn: '',
      gst: 0,
      cess: 0,
      expiryDate: '',
      lowStockAlert: 5,
      rack: '',
    },
  ]);
  const [expandedVariantIdx, setExpandedVariantIdx] = useState<number>(0);
  const [additionalDetailsOpenIdx, setAdditionalDetailsOpenIdx] = useState<number | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [tutorialModalOpen, setTutorialModalOpen] = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3200);
  };

  const resetManualForm = (prefillBarcode = '') => {
    setEditingProductId(null);
    setManualName('');
    setManualQty('0');
    setManualUnit('Piece');
    setManualImageUrl('');
    setBomItems([]);
    setExpandedVariantIdx(0);
    setAdditionalDetailsOpenIdx(null);
    setVariants([
      {
        variantName: '',
        quantity: 0,
        barcode: prefillBarcode,
        mrp: 0,
        retailPrice: 0,
        wholesalePrice: 0,
        purchasePrice: 0,
        setAsDefault: true,
        includingGst: true,
        discountValue: 0,
        discountType: '%',
        batch: '',
        packOf: 1,
        hsn: '',
        gst: 0,
        cess: 0,
        expiryDate: '',
        lowStockAlert: 5,
        rack: '',
      },
    ]);
  };

  const openEditProduct = (p: ProductDoc) => {
    setEditingProductId(p.id);
    setManualName(p.name || '');
    setManualQty(String(p.quantity ?? 0));
    setManualUnit(p.unit || 'Piece');
    setManualImageUrl(p.imageUrl || '');
    setBomItems(p.bomItems || []);
    setExpandedVariantIdx(0);
    setAdditionalDetailsOpenIdx(null);
    if (p.variants && p.variants.length > 0) {
      setVariants(p.variants);
    } else {
      setVariants([
        {
          variantName: p.variantName || '',
          quantity: p.quantity ?? 0,
          barcode: p.barcode || '',
          mrp: p.mrp ?? 0,
          retailPrice: p.retailPrice ?? 0,
          wholesalePrice: p.wholesalePrice ?? 0,
          purchasePrice: p.purchasePrice ?? 0,
          setAsDefault: true,
          includingGst: true,
          discountValue: 0,
          discountType: '%',
          batch: '',
          packOf: 1,
          hsn: p.hsn || '',
          gst: p.gst ?? 0,
          cess: p.cess ?? 0,
          expiryDate: p.expiryDate || '',
          lowStockAlert: p.lowStockAlert ?? 5,
          rack: p.rack || '',
        },
      ]);
    }
    setSubScreen('manual_add');
  };

  // AI Requests counter
  const todayIso = new Date().toISOString().slice(0, 10);
  const aiRequestsLeft =
    profile.config.aiRequestDate === todayIso ? (profile.config.aiRequestsToday ?? 5) : 5;

  const handleRunAiQuery = async (type: 'top_selling' | 'restock' | 'custom') => {
    if (aiRequestsLeft <= 0) {
      setAiResponse('Daily AI request limit (5/5) reached. Resets tomorrow.');
      return;
    }
    setAiLoading(true);
    try {
      const answer = await askGroqInventoryAssistant(
        type,
        customAiPrompt,
        products,
        orders,
        expenses
      );
      setAiResponse(answer);
      const nextCount = Math.max(0, aiRequestsLeft - 1);
      await updateUserProfile(uid, {
        config: {
          ...profile.config,
          aiRequestsToday: nextCount,
          aiRequestDate: todayIso,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get AI insights';
      setAiResponse(`Error: ${message}`);
      showToast('error', 'AI assistant error. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const matchesProductCode = (p: ProductDoc, rawCode: string) => {
    const clean = rawCode.trim().toLowerCase();
    if (!clean) return false;
    if (p.barcode && p.barcode.trim().toLowerCase() === clean) return true;
    if (p.variants?.some((v) => v.barcode && v.barcode.trim().toLowerCase() === clean)) {
      return true;
    }
    return false;
  };

  // Filtered products for My Stock
  const filteredProducts = products
    .filter((p) => {
      if (stockTab === 'archived') return p.archived;
      if (p.archived) return false;
      if (stockTab === 'low') return p.quantity <= (p.lowStockAlert || 5);
      if (stockTab === 'expired') {
        if (!p.expiryDate) return false;
        return p.expiryDate < todayIso;
      }
      return true;
    })
    .filter((p) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.variantName && p.variantName.toLowerCase().includes(q)) ||
        Boolean(p.variants?.some((v) => v.barcode && v.barcode.toLowerCase().includes(q)))
      );
    })
    .sort((a, b) => (sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));

  // Universal APK Voice Entry (Groq Whisper + Gboard + Native Audio Fallback)
  const handleStartVoiceEntry = (ctx: 'purchase' | 'search' = 'purchase') => {
    setVoiceContext(ctx);
    setVoiceModalOpen(true);
  };

  const handleVoiceResultApplied = (result: ParsedVoiceResult) => {
    if (voiceContext === 'search') {
      setSearchQuery(result.searchQuery || result.transcript || '');
      return;
    }

    const items = result.items || [];
    if (items.length === 0 && result.transcript) {
      setQaName(result.transcript);
      setQuickAddOpen(true);
      return;
    }

    if (items.length === 1 && (!items[0].price || items[0].price <= 0)) {
      const it = items[0];
      setQaName(it.name);
      setQaQty(String(it.qty || 1));
      setQaUnit(it.unit || 'Piece');
      if (it.barcode) setQaBarcode(it.barcode);
      setQuickAddOpen(true);
      return;
    }

    // Auto-add structured voice items directly into Purchase Entry list
    const newPurItems: OrderLineItem[] = items.map((it, idx) => {
      const matched = products.find(
        (p) =>
          p.name.toLowerCase() === it.name.toLowerCase() ||
          (it.barcode && p.barcode === it.barcode)
      );
      return {
        productId: matched?.id || `voice_${Date.now()}_${idx}`,
        name: matched?.name || it.name,
        variantName: matched?.variantName || '',
        barcode: matched?.barcode || it.barcode || '',
        unit: matched?.unit || it.unit || 'Piece',
        qty: it.qty || 1,
        mrp: it.mrp || it.price || matched?.mrp || 0,
        retailPrice: it.price || matched?.retailPrice || 0,
        purchasePrice: it.price || matched?.purchasePrice || matched?.retailPrice || 0,
        gst: matched?.gst || 0,
        cess: matched?.cess || 0,
        hsn: matched?.hsn || '',
        discount: 0,
      };
    });
    setPurItems((prev) => [...prev, ...newPurItems]);
  };

  // Save Quick Add Product
  const handleSaveQuickAdd = async () => {
    if (!qaName.trim()) {
      showToast('error', 'Please enter Product Name / प्रोडक्ट का नाम भरें');
      return;
    }
    const mrpVal = Number(qaMrp) || 0;
    const retailVal = Number(qaRetail) || mrpVal;
    const qtyVal = Number(qaQty) || 1;
    const purchaseVal = Number(qaPurchasePrice) || retailVal;

    setSavingQuickAdd(true);
    try {
      let savedId = `temp_${Date.now()}`;
      const shouldSaveToInv = qaAddToInventory || subScreen !== 'purchase_entry';
      if (shouldSaveToInv) {
        savedId = await saveProductToDb(uid, {
          name: qaName.trim(),
          variantName: qaVariant.trim(),
          barcode: qaBarcode.trim(),
          unit: qaUnit,
          mrp: mrpVal,
          retailPrice: retailVal,
          wholesalePrice: Number(qaWholesale) || 0,
          purchasePrice: purchaseVal,
          quantity: subScreen === 'purchase_entry' ? 0 : qtyVal,
          gst: Number(qaGst) || 0,
          cess: Number(qaCess) || 0,
          hsn: qaHsn.trim(),
          rack: qaRack.trim(),
          archived: false,
        });
      }

      if (subScreen === 'purchase_entry') {
        setPurItems((prev) => [
          ...prev,
          {
            productId: savedId,
            name: qaName.trim(),
            variantName: qaVariant.trim(),
            barcode: qaBarcode.trim(),
            unit: qaUnit,
            qty: qtyVal,
            mrp: mrpVal,
            retailPrice: retailVal,
            purchasePrice: purchaseVal,
            gst: Number(qaGst) || 0,
            cess: Number(qaCess) || 0,
            hsn: qaHsn.trim(),
            discount: 0,
          },
        ]);
      }

      setQaName('');
      setQaBarcode('');
      setQaVariant('');
      setQaMrp('0.00');
      setQaRetail('0.00');
      setQaQty('1');
      setQaWholesale('');
      setQaCess('');
      setQaGst('');
      setQaHsn('');
      setQaPurchasePrice('');
      setQaRack('');
      setQuickAddOpen(false);
      showToast('success', 'Product saved to stock!');
    } catch (err) {
      console.error('Quick Add error:', err);
      showToast('error', 'Failed to save product. Check connection & try again.');
    } finally {
      setSavingQuickAdd(false);
    }
  };

  const handleCompletePurchase = async () => {
    if (purItems.length === 0) {
      showToast('error', 'Add at least 1 product to complete purchase.');
      return;
    }
    setSavingPurchase(true);
    try {
      const selectedSup = suppliers.find((s) => s.id === purSupplierId);
      const rawTotal = purItems.reduce((acc, it) => acc + it.qty * (it.purchasePrice || it.retailPrice), 0);
      const finalTotal = Math.max(0, rawTotal - purDiscount);
      await createPurchaseInDb(
        uid,
        {
          supplierId: purSupplierId,
          supplierName: selectedSup?.name || 'Cash Supplier',
          paymentMode: purPaymentMode,
          dateStr: purDate,
          totalAmount: finalTotal,
          discountAmount: purDiscount,
          billImageUrl: purBillUrl,
          items: purItems,
        },
        products
      );
      setPurItems([]);
      setPurDiscount(0);
      setPurBillUrl('');
      setSubScreen('my_stock');
      showToast('success', 'Purchase saved & stock updated!');
    } catch (err) {
      console.error('Purchase save error:', err);
      showToast('error', 'Failed to save purchase. Please try again.');
    } finally {
      setSavingPurchase(false);
    }
  };

  // Save Manual Product
  const handleSaveManualProduct = async () => {
    if (!manualName.trim()) {
      showToast('error', 'Please enter Product Name / प्रोडक्ट का नाम भरें');
      return;
    }
    setSavingManual(true);
    try {
      const primary = variants[0];
      const variantSum = variants.reduce((acc, v) => acc + (Number(v.quantity) || 0), 0);
      const totalQty =
        variants.length > 1
          ? variantSum
          : Number(manualQty) || Number(primary.quantity) || 0;

      const syncedVariants = variants.map((v, i) =>
        i === 0 && variants.length === 1 ? { ...v, quantity: totalQty } : v
      );

      await saveProductToDb(uid, {
        ...(editingProductId ? { id: editingProductId } : {}),
        name: manualName.trim(),
        variantName: primary.variantName,
        barcode: primary.barcode,
        unit: manualUnit,
        mrp: Number(primary.mrp) || 0,
        retailPrice: Number(primary.retailPrice) || Number(primary.mrp) || 0,
        wholesalePrice: Number(primary.wholesalePrice) || 0,
        purchasePrice: Number(primary.purchasePrice) || 0,
        quantity: totalQty,
        lowStockAlert: Number(primary.lowStockAlert) || 5,
        gst: Number(primary.gst) || 0,
        cess: Number(primary.cess) || 0,
        hsn: primary.hsn || '',
        rack: primary.rack || '',
        expiryDate: primary.expiryDate || '',
        imageUrl: manualImageUrl,
        archived: false,
        variants: syncedVariants,
        bomItems: bomItems.filter((b) => b.rawMaterialName.trim()),
      });

      resetManualForm();
      setSubScreen('my_stock');
      showToast('success', editingProductId ? 'Product updated!' : 'Product saved to stock!');
    } catch (err) {
      console.error('Manual product save error:', err);
      showToast('error', 'Could not save product. Please check fields & try again.');
    } finally {
      setSavingManual(false);
    }
  };

  // ============================================================================
  // RENDER ACTIVE SUBSCREEN INTO `screenContent` SO SHARED MODALS ALWAYS WORK
  // ============================================================================
  let screenContent: React.ReactNode = null;

  if (subScreen === 'add_hub') {
    screenContent = (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        {/* Top Navy Header */}
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setSubScreen('my_stock')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Add Inventory/ स्टॉक जोड़ें</h1>
        </header>

        <div className="p-4 space-y-5 max-w-md mx-auto w-full">
          {/* Top Barcode / Product Search Input */}
          <div className="bg-white rounded-2xl border border-slate-200 px-3.5 py-2.5 flex items-center gap-3 shadow-xs">
            <button
              type="button"
              onClick={() =>
                onOpenScanner((code, visionResult) => {
                  const found = products.find((p) => matchesProductCode(p, code));
                  if (found) {
                    setSearchQuery(code);
                    setSubScreen('my_stock');
                    showToast('success', `Found: ${found.name}`);
                  } else {
                    setQaBarcode(code);
                    if (visionResult?.productName) setQaName(visionResult.productName);
                    if (visionResult?.mrp || visionResult?.price) {
                      const p = String(visionResult.mrp || visionResult.price);
                      setQaMrp(p);
                      setQaRetail(String(visionResult.price || visionResult.mrp));
                    }
                    setQaAddToInventory(true);
                    setQuickAddOpen(true);
                  }
                })
              }
              className="text-slate-600 hover:text-slate-900"
            >
              <ScanLine className="w-5 h-5" />
            </button>
            <input
              type="text"
              placeholder="Enter barcode or prod..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSubScreen('my_stock');
              }}
              className="flex-1 text-sm text-slate-800 outline-none bg-transparent"
            />
            <button type="button" onClick={() => setSubScreen('my_stock')}>
              <Search className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {/* 3 Square Action Cards: Purchase, Excel Import, Manual Add */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSubScreen('purchase_entry')}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-xs active:scale-95 transition-transform aspect-square"
            >
              <ShoppingCart className="w-6 h-6 text-[#0A2540]" />
              <span className="text-xs font-bold text-[#0A2540]">Purchase</span>
            </button>

            <button
              type="button"
              onClick={() => setSubScreen('excel_import')}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-xs active:scale-95 transition-transform aspect-square"
            >
              <FileSpreadsheet className="w-6 h-6 text-[#0A2540]" />
              <span className="text-xs font-bold text-[#0A2540] leading-tight text-center">
                Excel
                <br />
                Import
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetManualForm();
                setSubScreen('manual_add');
              }}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-xs active:scale-95 transition-transform aspect-square"
            >
              <Plus className="w-6 h-6 text-[#0A2540]" />
              <span className="text-xs font-bold text-[#0A2540] leading-tight text-center">
                Manual
                <br />
                Add
              </span>
            </button>
          </div>

          {/* 3 Full-width Rows: Quick Add, Search by name & Scan barcode */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setQaAddToInventory(true);
                setQuickAddOpen(true);
              }}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0A2540]">Quick Add Product</h3>
                  <p className="text-xs text-slate-400">
                    Fast 1-step form to add product & stock
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => setSubScreen('my_stock')}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Search className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0A2540]">Search by name</h3>
                  <p className="text-xs text-slate-400">
                    Search products by name or category
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenScanner((code, visionResult) => {
                  const found = products.find((p) => matchesProductCode(p, code));
                  if (found) {
                    setSearchQuery(code);
                    setSubScreen('my_stock');
                    showToast('success', `Found: ${found.name}`);
                  } else {
                    resetManualForm(code);
                    if (visionResult?.productName) setManualName(visionResult.productName);
                    if (visionResult?.mrp || visionResult?.price) {
                      const mrpVal = Number(visionResult.mrp || visionResult.price) || 0;
                      const retailVal = Number(visionResult.price || visionResult.mrp) || 0;
                      setVariants((prev) =>
                        prev.map((v, i) =>
                          i === 0 ? { ...v, barcode: code, mrp: mrpVal, retailPrice: retailVal } : v
                        )
                      );
                    }
                    setSubScreen('manual_add');
                    showToast('success', `Scanned: ${code}`);
                  }
                })
              }
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
                  <ScanLine className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0A2540]">Scan barcode</h3>
                  <p className="text-xs text-slate-400">
                    Scan product barcodes with your camera
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      </div>
    );
  } else if (subScreen === 'purchase_entry') {
    const rawTotal = purItems.reduce(
      (acc, it) => acc + it.qty * (it.purchasePrice || it.retailPrice),
      0
    );
    const netPurchaseTotal = Math.max(0, rawTotal - purDiscount);
    const totalQty = purItems.reduce((acc, it) => acc + it.qty, 0);

    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between">
        {/* Top Bar with Supplier, Payment Mode, Date, Attach Bills, Discount & Total */}
        <div className="bg-white border-b border-slate-200 p-3 sticky top-0 z-20">
          <div className="max-w-md mx-auto flex items-stretch justify-between gap-2">
            {/* Left controls */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSubScreen('add_hub')}
                  className="p-1.5 text-slate-700"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenAddSupplier}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#1565c0]"
                >
                  <span>🏪</span>
                  <span>
                    {purSupplierId
                      ? suppliers.find((s) => s.id === purSupplierId)?.name || '+Add Supplier'
                      : '+Add Supplier'}
                  </span>
                </button>
                {suppliers.length > 0 && (
                  <select
                    value={purSupplierId}
                    onChange={(e) => setPurSupplierId(e.target.value)}
                    className="text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
                  >
                    <option value="">Select</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600">
                  ✉️
                </div>
                <select
                  value={purPaymentMode}
                  onChange={(e) => setPurPaymentMode(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 bg-white outline-none"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700">
                <span>📅</span>
                <input
                  type="date"
                  value={purDate}
                  onChange={(e) => setPurDate(e.target.value)}
                  className="bg-transparent outline-none text-xs font-semibold"
                />
              </div>
            </div>

            {/* Right Navy Total Box */}
            <div className="w-36 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setPhotoSheetTarget('purchase_bill')}
                className="bg-[#0A2540] text-white text-xs font-bold py-2 px-3 rounded-lg text-center cursor-pointer hover:bg-[#12365c] transition-colors"
              >
                {purBillUrl ? '✓ Bill Attached' : '+Attach Bills'}
              </button>

              <div
                onClick={() => setPurDiscountModal(true)}
                className="flex-1 bg-gradient-to-br from-[#0A2540] to-[#134e6f] text-white rounded-xl p-2.5 flex flex-col justify-between cursor-pointer"
              >
                <p className="text-[10px] text-slate-200 text-center">
                  {purDiscount > 0 ? `Discount: ₹${purDiscount}` : 'Tap to add discount'}
                </p>
                <div className="text-center mt-1">
                  <p className="text-[10px] text-slate-300">Total</p>
                  <p className="text-lg font-extrabold tabular-nums">₹{netPurchaseTotal}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center Purchase Items or Empty State */}
        <div className="flex-1 max-w-md mx-auto w-full p-4">
          {purItems.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-200/70 flex items-center justify-center text-slate-400 mb-3">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-600">No items added yet</h3>
              <p className="text-xs text-slate-400 mt-1">
                Search and add products to start your purchase entry
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {purItems.map((it, idx) => (
                <div
                  key={`${it.productId}_${idx}`}
                  className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <h4 className="text-sm font-bold text-[#0A2540]">{it.name}</h4>
                    <p className="text-xs text-slate-500">
                      Purchase: ₹{it.purchasePrice || it.retailPrice} × {it.qty} {it.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-[#0A2540] tabular-nums">
                      ₹{(it.qty * (it.purchasePrice || it.retailPrice)).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPurItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Floating Purchase Controls (Matches 08:35) */}
        <div className="sticky bottom-0 z-20 bg-[#FAF9F5] pt-2 pb-4 px-4 max-w-md mx-auto w-full space-y-2.5">
          {/* AI SCAN & AI VOICE Pills */}
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={() =>
                onOpenScanner(
                  (code, visionResult) => {
                    if (visionResult?.items && visionResult.items.length > 0) {
                      const scannedItems: OrderLineItem[] = visionResult.items.map((it, idx) => {
                        const itemCode = it.imei || it.barcode || '';
                        const matched = products.find(
                          (p) =>
                            (itemCode && matchesProductCode(p, itemCode)) ||
                            (it.name && p.name.toLowerCase() === it.name.toLowerCase())
                        );
                        return {
                          productId: matched?.id || `aiscan_${Date.now()}_${idx}`,
                          name: matched?.name || it.name || `Scanned Item ${itemCode}`,
                          variantName: matched?.variantName || '',
                          barcode: matched?.barcode || itemCode,
                          unit: matched?.unit || it.unit || 'Piece',
                          qty: it.qty || 1,
                          mrp: it.mrp || it.price || matched?.mrp || 0,
                          retailPrice: it.price || matched?.retailPrice || 0,
                          purchasePrice: it.price || matched?.purchasePrice || matched?.retailPrice || 0,
                          gst: matched?.gst || 0,
                          cess: matched?.cess || 0,
                          hsn: matched?.hsn || '',
                          discount: 0,
                        };
                      });
                      setPurItems((prev) => [...prev, ...scannedItems]);
                      showToast('success', `Added ${scannedItems.length} scanned item(s)`);
                      return;
                    }

                    const found = products.find((p) => matchesProductCode(p, code));
                    if (found) {
                      setPurItems((prev) => [
                        ...prev,
                        {
                          productId: found.id,
                          name: found.name,
                          variantName: found.variantName,
                          barcode: found.barcode,
                          unit: found.unit,
                          qty: visionResult?.qty || 1,
                          mrp: found.mrp,
                          retailPrice: found.retailPrice,
                          purchasePrice: found.purchasePrice || found.retailPrice,
                          gst: found.gst,
                          cess: found.cess,
                          hsn: found.hsn,
                          discount: 0,
                        },
                      ]);
                    } else {
                      setQaBarcode(code);
                      if (visionResult?.productName) setQaName(visionResult.productName);
                      if (visionResult?.mrp || visionResult?.price) {
                        const p = String(visionResult.mrp || visionResult.price);
                        setQaMrp(p);
                        setQaRetail(String(visionResult.price || visionResult.mrp));
                        setQaPurchasePrice(String(visionResult.price || visionResult.mrp));
                      }
                      if (visionResult?.qty) setQaQty(String(visionResult.qty));
                      setQuickAddOpen(true);
                    }
                  },
                  { scanMode: 'bill_items', title: 'AI Bill, Barcode & IMEI Scan' }
                )
              }
              className="relative bg-gradient-to-r from-purple-600 to-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-md"
            >
              <span className="absolute -top-2 -left-1 bg-amber-300 text-slate-900 text-[8px] font-extrabold px-1.5 py-0.2 rounded">
                New
              </span>
              <ScanLine className="w-3.5 h-3.5" />
              <span>AI SCAN</span>
            </button>

            <button
              type="button"
              onClick={() => handleStartVoiceEntry('purchase')}
              className="bg-purple-100 border border-purple-300 text-purple-800 text-xs font-bold px-3.5 py-2 rounded-full flex items-center gap-1.5 shadow-xs"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>AI VOICE</span>
            </button>
          </div>

          {/* Quick add + and Total Purchase -> buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="bg-[#94775c] text-white rounded-xl py-3 px-4 flex items-center justify-between font-bold text-sm shadow-sm active:scale-98"
            >
              <span>Quick add</span>
              <span className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
            </button>

            <button
              type="button"
              disabled={savingPurchase || purItems.length === 0}
              onClick={handleCompletePurchase}
              className="bg-[#4CAF50] text-white rounded-xl py-2.5 px-4 flex items-center justify-between shadow-sm disabled:opacity-60 active:scale-98"
            >
              <div className="text-left">
                <p className="text-[10px] font-medium opacity-90">Total ({totalQty})</p>
                <p className="text-sm font-extrabold leading-tight">Purchase</p>
              </div>
              <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                →
              </span>
            </button>
          </div>

          {/* Bottom Search & Scan Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-xs relative">
              <input
                type="text"
                value={purSearch}
                onChange={(e) => setPurSearch(e.target.value)}
                placeholder="Search by name or barcode"
                className="w-full text-xs text-slate-800 outline-none"
              />
              {purSearch.trim() && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto z-30">
                  {products
                    .filter((p) => {
                      const q = purSearch.trim().toLowerCase();
                      return (
                        p.name.toLowerCase().includes(q) ||
                        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                        Boolean(p.variants?.some((v) => v.barcode && v.barcode.toLowerCase().includes(q)))
                      );
                    })
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPurItems((prev) => [
                            ...prev,
                            {
                              productId: p.id,
                              name: p.name,
                              variantName: p.variantName,
                              barcode: p.barcode,
                              unit: p.unit,
                              qty: 1,
                              mrp: p.mrp,
                              retailPrice: p.retailPrice,
                              purchasePrice: p.purchasePrice || p.retailPrice,
                              gst: p.gst,
                              cess: p.cess,
                              hsn: p.hsn,
                              discount: 0,
                            },
                          ]);
                          setPurSearch('');
                        }}
                        className="w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 flex justify-between"
                      >
                        <span className="font-bold text-slate-800">{p.name}</span>
                        <span className="text-slate-500">₹{p.purchasePrice || p.retailPrice}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenScanner((code, visionResult) => {
                  const found = products.find((p) => matchesProductCode(p, code));
                  if (found) {
                    setPurItems((prev) => [
                      ...prev,
                      {
                        productId: found.id,
                        name: found.name,
                        variantName: found.variantName,
                        barcode: found.barcode || code,
                        unit: found.unit,
                        qty: visionResult?.qty || 1,
                        mrp: found.mrp,
                        retailPrice: found.retailPrice,
                        purchasePrice: found.purchasePrice || found.retailPrice,
                        gst: found.gst,
                        cess: found.cess,
                        hsn: found.hsn,
                        discount: 0,
                      },
                    ]);
                    showToast('success', `Added ${found.name} to purchase`);
                  } else {
                    setQaBarcode(code);
                    if (visionResult?.productName) setQaName(visionResult.productName);
                    if (visionResult?.mrp || visionResult?.price) {
                      const p = String(visionResult.mrp || visionResult.price);
                      setQaMrp(p);
                      setQaRetail(String(visionResult.price || visionResult.mrp));
                      setQaPurchasePrice(String(visionResult.price || visionResult.mrp));
                    }
                    setQuickAddOpen(true);
                  }
                })
              }
              className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-xs"
            >
              <span>Scan</span>
              <ScanLine className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Discount Modal */}
        {purDiscountModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-xs space-y-3">
              <h3 className="text-sm font-bold text-[#0A2540]">Add Purchase Discount (₹)</h3>
              <input
                type="number"
                value={purDiscount}
                onChange={(e) => setPurDiscount(Number(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPurDiscountModal(false)}
                  className="px-4 py-2 bg-[#0A2540] text-white text-xs font-bold rounded-xl"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  } else if (subScreen === 'excel_import') {
    const handleBulkImport = async () => {
      if (parsedExcelItems.length === 0) {
        showToast('error', 'Select an Excel/CSV file first.');
        return;
      }
      setImportingExcel(true);
      try {
        let importedCount = 0;
        for (const item of parsedExcelItems) {
          if (item.name && item.name.trim()) {
            await saveProductToDb(uid, item as Partial<ProductDoc> & { name: string });
            importedCount++;
          }
        }
        setExcelImportSuccess(`Successfully imported ${importedCount} products!`);
        setParsedExcelItems([]);
        setExcelFileName('');
        showToast('success', `Imported ${importedCount} products!`);
      } catch (err) {
        console.error('Excel import error:', err);
        showToast('error', 'Failed to import some products. Please try again.');
      } finally {
        setImportingExcel(false);
      }
    };

    screenContent = (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setSubScreen('add_hub')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Import Inventory</h1>
        </header>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          {excelImportSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 text-xs font-bold flex items-center justify-between">
              <span>{excelImportSuccess}</span>
              <button
                type="button"
                onClick={() => setSubScreen('my_stock')}
                className="underline text-emerald-900"
              >
                View Stock
              </button>
            </div>
          )}

          {/* Step 1: Download Template */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1976d2] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                1
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#1976d2] flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0A2540]">Download Template</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Get the Excel template with the correct format for your inventory data.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadInventoryTemplate}
              className="w-full bg-[#1976d2] hover:bg-[#1565c0] text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-xs active:scale-99"
            >
              <Download className="w-4 h-4" />
              <span>Download Template</span>
            </button>
          </div>

          {/* Step 2: Upload Your File */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#f57c00] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                2
              </div>
              <div className="w-11 h-11 rounded-xl bg-orange-50 text-[#f57c00] flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0A2540]">Upload Your File</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Select and upload your completed Excel file with product data.
                </p>
              </div>
            </div>
            <label className="w-full border border-[#f57c00] text-[#f57c00] font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-orange-50 transition-colors">
              <Upload className="w-4 h-4" />
              <span>{excelFileName ? `${excelFileName} (${parsedExcelItems.length} rows)` : 'Select Excel File'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setExcelFileName(file.name);
                    try {
                      const rows = await parseExcelInventoryFile(file);
                      setParsedExcelItems(rows);
                      if (rows.length === 0) {
                        showToast('error', 'No valid product rows found in file.');
                      } else {
                        showToast('success', `Loaded ${rows.length} rows from ${file.name}`);
                      }
                    } catch {
                      showToast('error', 'Could not read Excel/CSV file.');
                    }
                  }
                }}
              />
            </label>
          </div>

          {/* Step 3: Import Products */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#388e3c] text-white font-bold text-xs flex items-center justify-center shrink-0 mt-1">
                3
              </div>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-[#388e3c] flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0A2540]">Import Products</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Review any errors and confirm to import your products into the inventory.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={parsedExcelItems.length === 0 || importingExcel}
              onClick={handleBulkImport}
              className={`w-full font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                parsedExcelItems.length > 0
                  ? 'bg-[#388e3c] text-white shadow-sm'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {importingExcel
                  ? 'Importing...'
                  : parsedExcelItems.length > 0
                    ? `Import ${parsedExcelItems.length} Products`
                    : 'Import Products'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  } else if (subScreen === 'manual_add') {
    const updateVariantField = <K extends keyof ProductVariantItem>(
      idx: number,
      key: K,
      val: ProductVariantItem[K]
    ) => {
      setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, [key]: val } : v)));
    };

    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between pb-24">
        {/* Top Navy Header with BOM Button */}
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                resetManualForm();
                setSubScreen(editingProductId ? 'my_stock' : 'add_hub');
              }}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold truncate max-w-[200px]">
              {editingProductId ? 'Edit product' : 'Add products manually'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setBomModalOpen(true)}
            className="border border-white/60 rounded-full px-4 py-1 text-xs font-bold hover:bg-white/10"
          >
            BOM
          </button>
        </header>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          {/* Top Product Card: Image + Product Name + Quantity + Unit */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setPhotoSheetTarget('manual_product')}
              className="w-24 h-24 rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-xs shrink-0 relative"
            >
              {manualImageUrl ? (
                <img
                  src={manualImageUrl}
                  alt="Product"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center text-center p-2">
                  <Camera className="w-6 h-6 text-[#0A2540]" />
                  <span className="text-[10px] text-slate-500 font-bold mt-1">
                    {uploadingImage ? 'Uploading...' : 'Tap Photo'}
                  </span>
                </div>
              )}
            </button>

            <div className="flex-1 space-y-2.5">
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Product Name"
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#0A2540]"
              />

              <div className="flex items-center justify-end gap-2 relative">
                <span className="text-xs text-slate-500 font-medium">Qty:</span>
                <input
                  type="number"
                  value={manualQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualQty(val);
                    const num = Number(val) || 0;
                    setVariants((prev) =>
                      prev.map((v, i) => (i === 0 ? { ...v, quantity: num } : v))
                    );
                  }}
                  className="w-16 bg-white border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-800 text-center outline-none focus:border-[#0A2540]"
                />
                <button
                  type="button"
                  onClick={() => setManualUnitMenuOpen(!manualUnitMenuOpen)}
                  className="bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 flex items-center gap-2 shadow-xs"
                >
                  <span>{manualUnit}</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {manualUnitMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1">
                    {UNITS_LIST.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setManualUnit(u);
                          setManualUnitMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold ${
                          manualUnit === u ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dynamic Variant Cards */}
          {variants.map((v, idx) => {
            const isExpanded = expandedVariantIdx === idx;
            const isAddOpen = additionalDetailsOpenIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3.5"
              >
                {/* Variant Header */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setExpandedVariantIdx(isExpanded ? -1 : idx)}
                    className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    <span>Variant #{idx + 1}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVariants((prev) => [...prev, { ...v }])}
                      className="p-1.5 text-slate-600 hover:text-slate-900"
                      title="Duplicate Variant"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setVariants((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Variant Name
                        </label>
                        <input
                          type="text"
                          value={v.variantName}
                          onChange={(e) => updateVariantField(idx, 'variantName', e.target.value)}
                          placeholder="ex: 1 Pc, S, XL ,etc"
                          className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={v.quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setVariants((prev) => {
                              const next = prev.map((row, i) =>
                                i === idx ? { ...row, quantity: val } : row
                              );
                              const sum = next.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
                              setManualQty(String(sum));
                              return next;
                            });
                          }}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Enter Barcode Number */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Enter Barcode Number
                      </label>
                      <div className="border border-slate-300 rounded-xl p-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenScanner((code, visionResult) => {
                              updateVariantField(idx, 'barcode', code);
                              if (!manualName.trim() && visionResult?.productName) {
                                setManualName(visionResult.productName);
                              }
                              if (visionResult?.mrp || visionResult?.price) {
                                const mrpVal = Number(visionResult.mrp || visionResult.price) || 0;
                                const retVal = Number(visionResult.price || visionResult.mrp) || 0;
                                if (!v.mrp && mrpVal) updateVariantField(idx, 'mrp', mrpVal);
                                if (!v.retailPrice && retVal) updateVariantField(idx, 'retailPrice', retVal);
                              }
                              showToast('success', `Code scanned: ${code}`);
                            })
                          }
                          className="text-slate-700 p-1"
                        >
                          <ScanLine className="w-5 h-5" />
                        </button>
                        <input
                          type="text"
                          value={v.barcode}
                          onChange={(e) => updateVariantField(idx, 'barcode', e.target.value)}
                          placeholder="Scan or type barcode"
                          className="flex-1 border-b border-slate-400 text-xs py-1 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextCode =
                              v.barcode.trim() ||
                              String(Math.floor(100000000000 + Math.random() * 900000000000));
                            updateVariantField(idx, 'barcode', nextCode);
                            showToast('success', `Barcode ${nextCode} applied`);
                          }}
                          className="bg-[#0A2540] text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                        >
                          Add
                        </button>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateVariantField(
                              idx,
                              'barcode',
                              String(Math.floor(100000000000 + Math.random() * 900000000000))
                            )
                          }
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        >
                          Auto Generate Barcode
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateVariantField(
                              idx,
                              'barcode',
                              String(Math.floor(1000 + Math.random() * 9000))
                            )
                          }
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                        >
                          Auto Generate 4 Digit Code
                        </button>
                      </div>
                    </div>

                    {/* MRP & Retail */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          MRP
                        </label>
                        <div className="flex items-center border border-slate-300 rounded-xl px-3 py-2.5">
                          <span className="text-xs text-slate-500 mr-1.5">₹</span>
                          <input
                            type="number"
                            value={v.mrp}
                            onChange={(e) => {
                              const n = Number(e.target.value) || 0;
                              setVariants((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? {
                                        ...row,
                                        mrp: n,
                                        retailPrice: row.retailPrice ? row.retailPrice : n,
                                      }
                                    : row
                                )
                              );
                            }}
                            className="w-full text-xs outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Retail
                        </label>
                        <div className="flex items-center border border-slate-300 rounded-xl px-3 py-2.5">
                          <span className="text-xs text-slate-500 mr-1.5">₹</span>
                          <input
                            type="number"
                            value={v.retailPrice}
                            onChange={(e) =>
                              updateVariantField(idx, 'retailPrice', Number(e.target.value) || 0)
                            }
                            className="w-full text-xs outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Checkboxes */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={v.setAsDefault}
                          onChange={(e) =>
                            updateVariantField(idx, 'setAsDefault', e.target.checked)
                          }
                          className="w-4 h-4 accent-[#0A2540]"
                        />
                        <span>Set as default price</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={v.includingGst}
                          onChange={(e) =>
                            updateVariantField(idx, 'includingGst', e.target.checked)
                          }
                          className="w-4 h-4 accent-[#0A2540]"
                        />
                        <span>Including GST</span>
                      </label>
                    </div>

                    {/* Discount */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Discount
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={v.discountValue}
                          onChange={(e) =>
                            updateVariantField(idx, 'discountValue', Number(e.target.value) || 0)
                          }
                          className="flex-1 border border-slate-300 rounded-xl px-3 py-2.5 text-xs outline-none"
                        />
                        <select
                          value={v.discountType}
                          onChange={(e) =>
                            updateVariantField(idx, 'discountType', e.target.value as '%' | '₹')
                          }
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold bg-white"
                        >
                          <option value="%">%</option>
                          <option value="₹">₹</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAdditionalDetailsOpenIdx(isAddOpen ? null : idx)}
                      className="text-xs font-bold text-emerald-600"
                    >
                      + Add multiple price
                    </button>

                    {/* Batch & Pack of */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Batch
                        </label>
                        <input
                          type="text"
                          value={v.batch}
                          onChange={(e) => updateVariantField(idx, 'batch', e.target.value)}
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Pack of
                        </label>
                        <input
                          type="number"
                          value={v.packOf}
                          onChange={(e) =>
                            updateVariantField(idx, 'packOf', Number(e.target.value) || 1)
                          }
                          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Additional Details Accordion */}
                    <div className="border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => setAdditionalDetailsOpenIdx(isAddOpen ? null : idx)}
                        className="w-full flex items-center justify-between py-2 text-xs font-bold text-slate-800"
                      >
                        <span>Additional Details</span>
                        {isAddOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {isAddOpen && (
                        <div className="grid grid-cols-2 gap-2.5 pt-2">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              Wholesale Price (₹)
                            </label>
                            <input
                              type="number"
                              value={v.wholesalePrice}
                              onChange={(e) =>
                                updateVariantField(
                                  idx,
                                  'wholesalePrice',
                                  Number(e.target.value) || 0
                                )
                              }
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              Purchase Price (₹)
                            </label>
                            <input
                              type="number"
                              value={v.purchasePrice}
                              onChange={(e) =>
                                updateVariantField(
                                  idx,
                                  'purchasePrice',
                                  Number(e.target.value) || 0
                                )
                              }
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">GST %</label>
                            <input
                              type="number"
                              value={v.gst}
                              onChange={(e) =>
                                updateVariantField(idx, 'gst', Number(e.target.value) || 0)
                              }
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">HSN</label>
                            <input
                              type="text"
                              value={v.hsn}
                              onChange={(e) => updateVariantField(idx, 'hsn', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">
                              Expiry Date
                            </label>
                            <input
                              type="date"
                              value={v.expiryDate}
                              onChange={(e) =>
                                updateVariantField(idx, 'expiryDate', e.target.value)
                              }
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Rack</label>
                            <input
                              type="text"
                              value={v.rack}
                              onChange={(e) => updateVariantField(idx, 'rack', e.target.value)}
                              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              setVariants((prev) => [
                ...prev,
                {
                  ...prev[0],
                  variantName: '',
                  barcode: '',
                  quantity: 0,
                },
              ])
            }
            className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs py-3.5 rounded-2xl transition-colors"
          >
            Add Variant
          </button>
        </div>

        {/* Fixed Bottom Cancel / Save Bar (Matches 09:02) */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                resetManualForm();
                setSubScreen(editingProductId ? 'my_stock' : 'add_hub');
              }}
              className="bg-black text-white font-bold text-sm py-3.5 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingManual}
              onClick={handleSaveManualProduct}
              className="bg-[#4CAF50] text-white font-bold text-sm py-3.5 rounded-xl disabled:opacity-60 active:scale-[0.99]"
            >
              {savingManual ? 'Saving...' : editingProductId ? 'Update Product' : 'Save'}
            </button>
          </div>
        </div>

        {/* BOM Modal */}
        {bomModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">
                Bill of Materials (BOM)
              </h3>
              <p className="text-xs text-slate-500">
                Link raw materials consumed when manufacturing 1 unit of this product.
              </p>
              {bomItems.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <input
                    type="text"
                    placeholder="Material name"
                    value={b.rawMaterialName}
                    onChange={(e) =>
                      setBomItems((prev) =>
                        prev.map((item, idx) =>
                          idx === i ? { ...item, rawMaterialName: e.target.value } : item
                        )
                      )
                    }
                    className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5"
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={b.qtyRequired}
                    onChange={(e) =>
                      setBomItems((prev) =>
                        prev.map((item, idx) =>
                          idx === i ? { ...item, qtyRequired: Number(e.target.value) || 1 } : item
                        )
                      )
                    }
                    className="w-16 border border-slate-300 rounded-lg px-2 py-1.5"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setBomItems((prev) => [
                    ...prev,
                    { rawMaterialName: '', qtyRequired: 1, unit: 'Piece' },
                  ])
                }
                className="text-xs font-bold text-[#1565c0]"
              >
                + Add Raw Material
              </button>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setBomModalOpen(false)}
                  className="bg-[#0A2540] text-white text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  } else {
    screenContent = (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col pb-24">
      {/* Top Navy Header */}
      <header className="bg-[#0A2540] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 relative">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">My Stock</h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setTutorialModalOpen(true)}
            className="p-1.5 hover:opacity-80"
            title="Watch Tutorial"
          >
            <Play className="w-4 h-4 fill-white" />
          </button>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className="p-1.5 hover:opacity-80"
            title="More Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="p-1.5 hover:opacity-80"
            title="Sort Stock"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              exportStockToExcel(products);
              showToast('success', 'Stock exported to Excel!');
            }}
            className="p-1.5 hover:opacity-80"
            title="Export to Excel"
          >
            <FileSpreadsheet className="w-5 h-5" />
          </button>
        </div>

        {moreMenuOpen && (
          <div className="absolute right-4 top-13 w-48 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 py-1.5 z-40 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                setQaAddToInventory(true);
                setQuickAddOpen(true);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50"
            >
              + Quick Add Product
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                resetManualForm();
                setSubScreen('manual_add');
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50"
            >
              + Manual Add Product
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                setSubScreen('purchase_entry');
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50"
            >
              Purchase Entry
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                setSubScreen('excel_import');
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50"
            >
              Excel Import
            </button>
          </div>
        )}
      </header>

      <div className="p-4 space-y-3.5 max-w-md mx-auto w-full">
        {/* Horizontal Filter Tabs (All Stocks 0, Low Stock, Archived, Expired) */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setStockTab('all')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              stockTab === 'all' ? 'bg-slate-200/80 text-[#0A2540]' : 'text-slate-600'
            }`}
          >
            <span>All Stocks</span>
            <span className="bg-slate-400/70 text-white text-[10px] px-1.5 py-0.2 rounded-full tabular-nums">
              {products.filter((p) => !p.archived).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStockTab('low')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              stockTab === 'low' ? 'bg-slate-200/80 text-[#0A2540]' : 'text-slate-600'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Low Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setStockTab('archived')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              stockTab === 'archived' ? 'bg-slate-200/80 text-[#0A2540]' : 'text-slate-600'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-slate-500" />
            <span>Archived</span>
          </button>

          <button
            type="button"
            onClick={() => setStockTab('expired')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              stockTab === 'expired' ? 'bg-slate-200/80 text-[#0A2540]' : 'text-slate-600'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-red-500" />
            <span>Expired</span>
          </button>
        </div>

        {/* Search Bar with Inline Barcode Scanner, Voice Search & Filter */}
        <div className="bg-white rounded-2xl border border-slate-200 p-2 flex items-center gap-2 shadow-xs">
          <button
            type="button"
            onClick={() => onOpenScanner((code) => setSearchQuery(code))}
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 active:scale-95"
            title="Scan Barcode / IMEI"
          >
            <ScanLine className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or barcode"
            className="flex-1 text-sm text-slate-800 outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={() => handleStartVoiceEntry('search')}
            className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-700 shrink-0 active:scale-95"
            title="Voice Search Stock"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* AI Inventory Assistant Card (Matches 08:13 - 08:23 on All Stocks tab) */}
        {stockTab === 'all' && (
          <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-xs space-y-3">
            <div
              onClick={() => setAiExpanded(!aiExpanded)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#1565c0] text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A2540] leading-tight">
                    AI Inventory
                    <br />
                    Assistant
                  </h3>
                  {aiExpanded && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Get smart insights about ...
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {aiExpanded && (
                  <div className="text-right">
                    <p className="text-base font-extrabold text-[#1565c0] tabular-nums">
                      {aiRequestsLeft} / 5
                    </p>
                    <p className="text-[10px] text-slate-400">AI requests left today ⓘ</p>
                  </div>
                )}
                {aiExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>

            {aiExpanded && (
              <>
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => handleRunAiQuery('top_selling')}
                    className="border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 text-left hover:bg-slate-50 active:scale-98 transition-transform"
                  >
                    <Flame className="w-5 h-5 text-orange-500 shrink-0" />
                    <span className="text-xs font-bold text-[#0A2540] leading-tight">
                      Top Selling
                      <br />
                      Products
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => handleRunAiQuery('restock')}
                    className="border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 text-left hover:bg-slate-50 active:scale-98 transition-transform"
                  >
                    <ShoppingCart className="w-5 h-5 text-[#1565c0] shrink-0" />
                    <span className="text-xs font-bold text-[#0A2540] leading-tight">
                      Restock
                      <br />
                      Suggestions
                    </span>
                  </button>
                </div>

                {/* Custom AI question input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customAiPrompt}
                    onChange={(e) => setCustomAiPrompt(e.target.value)}
                    placeholder="Ask a question about your stock..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                  />
                  {customAiPrompt.trim() && (
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => handleRunAiQuery('custom')}
                      className="bg-[#1565c0] text-white text-xs font-bold px-3 py-2 rounded-xl"
                    >
                      Ask
                    </button>
                  )}
                </div>

                {aiLoading && (
                  <div className="text-xs text-[#1565c0] font-semibold py-2 animate-pulse">
                    Analyzing live Firebase inventory with Groq AI...
                  </div>
                )}

                {aiResponse && !aiLoading && (
                  <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                    {aiResponse}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    No AI request will be used until you choose an option or ask a question.
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Product List */}
        <div className="space-y-2.5 pt-1">
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0A2540]">
                  {stockTab === 'all' ? 'All Stocks 0' : `No ${stockTab} stock found`}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Tap &ldquo;Add Product&rdquo; or &ldquo;Quick Add&rdquo; to add your inventory.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setQaAddToInventory(true);
                    setQuickAddOpen(true);
                  }}
                  className="bg-[#0A2540] text-white text-xs font-bold px-4 py-2.5 rounded-xl"
                >
                  + Quick Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetManualForm();
                    setSubScreen('manual_add');
                  }}
                  className="bg-slate-100 text-[#0A2540] text-xs font-bold px-4 py-2.5 rounded-xl"
                >
                  Manual Add
                </button>
              </div>
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between shadow-xs gap-2"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg">📦</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-[#0A2540] truncate">{p.name}</h4>
                    <p className="text-xs text-slate-500">
                      Retail: <span className="font-bold text-slate-800">₹{p.retailPrice}</span> ·
                      MRP: ₹{p.mrp}
                    </p>
                    {p.barcode && (
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                        #{p.barcode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await saveProductToDb(uid, {
                            ...p,
                            quantity: Math.max(0, (Number(p.quantity) || 0) - 1),
                          });
                        } catch {
                          showToast('error', 'Failed to update stock');
                        }
                      }}
                      className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center"
                      title="Decrease Qty"
                    >
                      -
                    </button>
                    <span
                      className={`text-xs font-extrabold px-2 py-1 rounded-lg tabular-nums ${
                        p.quantity <= p.lowStockAlert
                          ? 'bg-red-50 text-red-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {p.quantity} {p.unit}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await saveProductToDb(uid, {
                            ...p,
                            quantity: (Number(p.quantity) || 0) + 1,
                          });
                        } catch {
                          showToast('error', 'Failed to update stock');
                        }
                      }}
                      className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center"
                      title="Increase Qty"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openEditProduct(p)}
                      className="text-[11px] font-bold text-[#1565c0] flex items-center gap-0.5"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await saveProductToDb(uid, { ...p, archived: !p.archived });
                          showToast('success', p.archived ? 'Product restored' : 'Product archived');
                        } catch {
                          showToast('error', 'Failed to update product');
                        }
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-700"
                    >
                      {p.archived ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteProductFromDb(uid, p.id);
                          showToast('success', 'Product deleted');
                        } catch {
                          showToast('error', 'Failed to delete product');
                        }
                      }}
                      className="text-[11px] text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Floating + Add Product Navy Button (Matches 08:08) */}
      <button
        type="button"
        onClick={() => setSubScreen('add_hub')}
        className="fixed bottom-6 right-5 z-30 bg-[#1a3b70] hover:bg-[#0A2540] text-white font-bold text-xs px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
      >
        <ShoppingCart className="w-4 h-4" />
        <span>Add Product</span>
      </button>
    </div>
    );
  }

  return (
    <>
      {screenContent}

      {/* Global Toast Notification */}
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

      {/* Global Quick Add Bottom Sheet (Works across add_hub, my_stock, purchase_entry) */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[90vh] overflow-y-auto space-y-3.5">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-800">
                  +
                </div>
                <h3 className="text-base font-extrabold text-[#0A2540]">Quick add</h3>
              </div>
              <button
                type="button"
                onClick={() => setQaVariant(qaVariant || 'Standard')}
                className="bg-[#0e5a7a] text-white text-xs font-bold px-3.5 py-2 rounded-xl"
              >
                Variant of?
              </button>
            </div>

            <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={qaAddToInventory}
                onChange={(e) => setQaAddToInventory(e.target.checked)}
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
                  onClick={() =>
                    onOpenScanner((c, visionResult) => {
                      setQaBarcode(c);
                      if (!qaName.trim() && visionResult?.productName) setQaName(visionResult.productName);
                      if (!qaMrp && (visionResult?.mrp || visionResult?.price)) {
                        const p = String(visionResult.mrp || visionResult.price);
                        setQaMrp(p);
                        if (!qaRetail) setQaRetail(String(visionResult.price || visionResult.mrp));
                      }
                      showToast('success', `Scanned: ${c}`);
                    })
                  }
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
                  title="Auto-generate barcode"
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
                Variant Name <span className="text-slate-400 font-normal">(optional)</span>
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
              <div>
                <select
                  value={qaUnit}
                  onChange={(e) => setQaUnit(e.target.value)}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none"
                >
                  {UNITS_LIST.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setQaAdditionalOpen(!qaAdditionalOpen)}
                className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-[#0A2540] bg-slate-50"
              >
                <span>Additional Details (Optional)</span>
                {qaAdditionalOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {qaAdditionalOpen && (
                <div className="p-3.5 space-y-3 bg-white">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Wholesale price
                      </label>
                      <input
                        type="number"
                        placeholder="₹"
                        value={qaWholesale}
                        onChange={(e) => setQaWholesale(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Cess</label>
                      <input
                        type="number"
                        value={qaCess}
                        onChange={(e) => setQaCess(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">GST</label>
                      <input
                        type="number"
                        value={qaGst}
                        onChange={(e) => setQaGst(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Hsn</label>
                      <input
                        type="text"
                        value={qaHsn}
                        onChange={(e) => setQaHsn(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Purchase price
                    </label>
                    <input
                      type="number"
                      value={qaPurchasePrice}
                      onChange={(e) => setQaPurchasePrice(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Rack (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A1, D6"
                      value={qaRack}
                      onChange={(e) => setQaRack(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                </div>
              )}
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
                disabled={savingQuickAdd}
                onClick={handleSaveQuickAdd}
                className="py-3 rounded-xl bg-[#0A2540] text-white font-bold text-sm disabled:opacity-60"
              >
                {savingQuickAdd ? 'Saving...' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Quick Tutorial Modal */}
      {tutorialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-xs space-y-3 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#0A2540]">Inventory Quick Guide</h3>
            <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
              <li>Use <strong>Quick Add</strong> or <strong>Manual Add</strong> to save products with barcodes & variants.</li>
              <li>Tap <strong>Edit</strong> or <strong>+/-</strong> on any stock card to update prices or quantities anytime.</li>
              <li>Use <strong>Purchase Entry</strong> to record supplier bills & increment stock automatically.</li>
            </ul>
            <button
              type="button"
              onClick={() => setTutorialModalOpen(false)}
              className="w-full bg-[#0A2540] text-white text-xs font-bold py-3 rounded-xl"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      <SmartVoiceModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        context={voiceContext}
        onVoiceApplied={handleVoiceResultApplied}
        title={voiceContext === 'search' ? '🎙️ Voice Search Stock' : '🎙️ AI Voice Purchase Entry'}
      />

      <ApkPhotoSheet
        isOpen={photoSheetTarget !== null}
        onClose={() => setPhotoSheetTarget(null)}
        title={
          photoSheetTarget === 'purchase_bill'
            ? 'Attach Supplier Bill Photo'
            : 'Product Photo (Camera / Gallery)'
        }
        onUploaded={(url) => {
          if (photoSheetTarget === 'purchase_bill') {
            setPurBillUrl(url);
            showToast('success', 'Bill photo attached!');
          } else {
            setUploadingImage(false);
            setManualImageUrl(url);
            showToast('success', 'Product photo uploaded!');
          }
        }}
      />
    </>
  );
};
