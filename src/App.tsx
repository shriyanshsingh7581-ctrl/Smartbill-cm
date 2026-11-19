/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  QrCode,
  RefreshCw,
  Bell,
  Languages,
  ShoppingCart,
  ArrowRight,
  PackagePlus,
  RotateCcw,
  Boxes,
  Truck,
  Users,
  ClipboardList,
  Megaphone,
  Receipt,
  Printer,
  BarChart3,
  Bot,
  Home,
  Calculator,
  Store,
  MoreHorizontal,
  Send,
  X,
  Sparkles,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  auth,
  ensureUserProfile,
  subscribeToUserData,
  updateUserProfile,
  DEFAULT_APP_CONFIG,
  type UserProfileDoc,
  type ProductDoc,
  type OrderDoc,
  type PurchaseDoc,
  type SaleReturnDoc,
  type SupplierDoc,
  type CustomerDoc,
  type ExpenseDoc,
  type StaffDoc,
} from './firebase';
import {
  askGroqInventoryAssistant,
  createSafeNativeBarcodeDetector,
  warmupZxingWasm,
  type ScannedVisionResult,
} from './services/integrations';
import { TRANSLATIONS, type LanguageCode } from './i18n/translations';
import { AuthScreen } from './components/AuthScreen';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { StockAndInventory, type InventorySubScreen } from './components/StockAndInventory';
import { BillingAndOrders, type BillingSubScreen } from './components/BillingAndOrders';
import { LedgersAndExpenses, type LedgerSubScreen } from './components/LedgersAndExpenses';
import {
  MarketingAndPrinter,
  type MarketingSubScreen,
  type PrinterSubScreen,
} from './components/MarketingAndPrinter';
import { BusinessReports } from './components/BusinessReports';
import { OnlineShopScreen, MoreAndSettingsScreen } from './components/OnlineShopAndMore';

type ActiveModule =
  | 'home'
  | 'calculator'
  | 'online_shop'
  | 'more'
  | 'stock'
  | 'billing'
  | 'ledgers'
  | 'marketing'
  | 'printer'
  | 'reports';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected application error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-200 space-y-3 w-full">
            <h2 className="text-base font-extrabold text-[#0A2540]">Something went wrong</h2>
            <p className="text-xs text-slate-500">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="w-full py-3 rounded-xl bg-[#0A2540] text-white text-xs font-bold"
            >
              Recover &amp; Continue
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const pendingAuthMetaRef = useRef<{ phone?: string; shopName?: string } | null>(null);

  // Per-User Multi-Tenant Live Firebase State
  const [profile, setProfile] = useState<UserProfileDoc>({
    ownerId: '',
    shopName: 'SmartBill CM',
    ownerName: 'Admin',
    phone: '+917581030272',
    email: '',
    address: '',
    gstNumber: '',
    fssaiNumber: '',
    logoUrl: 'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png',
    language: 'en',
    config: DEFAULT_APP_CONFIG,
  });
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [purchases, setPurchases] = useState<PurchaseDoc[]>([]);
  const [returns, setReturns] = useState<SaleReturnDoc[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDoc[]>([]);
  const [staff, setStaff] = useState<StaffDoc[]>([]);

  // Navigation State
  const [activeModule, setActiveModule] = useState<ActiveModule>('home');
  const [inventorySub, setInventorySub] = useState<InventorySubScreen>('my_stock');
  const [billingSub, setBillingSub] = useState<BillingSubScreen>('new_bill');
  const [ledgerSub, setLedgerSub] = useState<LedgerSubScreen>('suppliers');
  const [ledgerInitialAdd, setLedgerInitialAdd] = useState(false);
  const [marketingSub, setMarketingSub] = useState<MarketingSubScreen>('marketing_hub');
  const [printerSub, setPrinterSub] = useState<PrinterSubScreen>('printer_hub');
  const [moreInitialView, setMoreInitialView] = useState<'more' | 'account' | 'dashboard' | 'language'>('more');

  // Global Camera Barcode Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState<'barcode_or_imei' | 'bill_items'>('barcode_or_imei');
  const [scannerTitle, setScannerTitle] = useState<string | undefined>(undefined);
  const [scannerCallback, setScannerCallback] = useState<
    ((code: string, visionResult?: ScannedVisionResult) => void) | null
  >(null);

  // Home Modals (QR Code, Notifications, Floating Groq AI Assistant, Purchase/Returns Chooser)
  const [showStoreQrModal, setShowStoreQrModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showPurchaseReturnSheet, setShowPurchaseReturnSheet] = useState(false);
  const [syncingHeader, setSyncingHeader] = useState(false);

  // Floating AI Assistant Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Namaste! I am your SmartBill CM AI Business Assistant. Ask me about your live stock, top selling products, restock alerts, or today’s profit!',
    },
  ]);

  // Interactive Spotlight Onboarding Tour (07:08 - 07:14)
  const [tourStep, setTourStep] = useState<number | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          let initialProf = await ensureUserProfile(user);
          const pending = pendingAuthMetaRef.current;
          if (pending && (pending.shopName?.trim() || pending.phone?.trim())) {
            const updates: Partial<UserProfileDoc> = {};
            if (pending.shopName?.trim()) updates.shopName = pending.shopName.trim();
            if (pending.phone?.trim()) updates.phone = pending.phone.trim();
            await updateUserProfile(user.uid, updates);
            initialProf = { ...initialProf, ...updates };
            pendingAuthMetaRef.current = null;
          }
          setProfile(initialProf);
        } catch (err) {
          console.error('Profile initialization error:', err);
        }
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  // Pre-warm local C++ ZXing-WASM & native hardware BarcodeDetector on idle so scanner locks instantly with 0ms cold start
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void warmupZxingWasm();
      void createSafeNativeBarcodeDetector();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsubData = subscribeToUserData(currentUser.uid, {
      onProfile: (p) => {
        setProfile(p);
      },
      onProducts: setProducts,
      onOrders: setOrders,
      onPurchases: setPurchases,
      onReturns: setReturns,
      onSuppliers: setSuppliers,
      onCustomers: setCustomers,
      onExpenses: setExpenses,
      onStaff: setStaff,
    });
    return () => unsubData();
  }, [currentUser]);

  const lang: LanguageCode = profile.language || 'en';
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  const handleOpenScanner = (
    cb: (code: string, visionResult?: ScannedVisionResult) => void,
    opts?: { scanMode?: 'barcode_or_imei' | 'bill_items'; title?: string }
  ) => {
    setScannerCallback(() => cb);
    setScannerMode(opts?.scanMode || 'barcode_or_imei');
    setScannerTitle(opts?.title);
    setScannerOpen(true);
  };

  const handleSendAiMessage = async (presetPrompt?: 'top_selling' | 'restock') => {
    const question =
      presetPrompt === 'top_selling'
        ? 'Show my Top Selling Products'
        : presetPrompt === 'restock'
        ? 'Give me Restock Suggestions'
        : aiInput.trim();
    if (!question) return;

    setAiMessages((prev) => [...prev, { role: 'user', text: question }]);
    if (!presetPrompt) setAiInput('');
    setAiLoading(true);
    try {
      const reply = await askGroqInventoryAssistant(
        presetPrompt || 'custom',
        question,
        products,
        orders,
        expenses
      );
      setAiMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Could not reach AI assistant right now. Your store data is safe — please try again shortly.',
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCompleteTour = async () => {
    setTourStep(null);
    if (currentUser) {
      try {
        await updateUserProfile(currentUser.uid, {
          config: {
            ...profile.config,
            tourCompleted: true,
          },
        });
      } catch (err) {
        console.error('Could not save tour completion:', err);
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0A2540] flex flex-col items-center justify-center text-white p-6">
        <img
          src="https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png"
          alt="SmartBill CM Logo"
          className="w-16 h-16 rounded-2xl object-cover shadow-xl border border-white/20 mb-3 bg-white"
        />
        <p className="text-base font-extrabold tracking-wide">SmartBill CM</p>
        <p className="text-xs text-slate-300 mt-1">Connecting to real-time database...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onAuthSuccess={(phone, shopName) => {
          pendingAuthMetaRef.current = { phone, shopName };
        }}
      />
    );
  }

  const uid = currentUser.uid;
  const lowStockCount = products.filter((p) => p.quantity <= (p.lowStockAlert || 5)).length;

  const TOUR_STEPS = [
    {
      target: 'Add Products To Shop',
      title: 'Step 1 of 4: Add Products To Shop',
      desc: t('tourStockDesc'),
    },
    {
      target: 'Stock',
      title: 'Step 2 of 4: Stock & Inventory',
      desc: t('tourManageStockDesc'),
    },
    {
      target: 'Orders',
      title: 'Step 3 of 4: Past Orders & Summaries',
      desc: t('tourOrdersDesc'),
    },
    {
      target: 'Reports',
      title: 'Step 4 of 4: 38+ Live Business Reports',
      desc: t('tourReportsDesc'),
    },
  ];

  // Render full-screen sub-modules
  const renderActiveModule = () => {
    if (activeModule === 'stock') {
      return (
        <StockAndInventory
          uid={uid}
          subScreen={inventorySub}
          setSubScreen={setInventorySub}
          onBackToHome={() => setActiveModule('home')}
          products={products}
          orders={orders}
          expenses={expenses}
          suppliers={suppliers}
          profile={profile}
          onOpenScanner={handleOpenScanner}
          onOpenAddSupplier={() => {
            setLedgerSub('suppliers');
            setLedgerInitialAdd(true);
            setActiveModule('ledgers');
          }}
        />
      );
    }

    if (activeModule === 'billing' || activeModule === 'calculator') {
      return (
        <BillingAndOrders
          uid={uid}
          mode={activeModule === 'calculator' ? 'calculator' : billingSub}
          setMode={(m) => {
            if (activeModule === 'calculator' && m !== 'calculator') {
              setActiveModule('billing');
            }
            setBillingSub(m);
          }}
          onBackToHome={() => setActiveModule('home')}
          products={products}
          orders={orders}
          returns={returns}
          customers={customers}
          profile={profile}
          onOpenScanner={handleOpenScanner}
          onOpenAddCustomer={() => {
            setLedgerSub('customers');
            setLedgerInitialAdd(true);
            setActiveModule('ledgers');
          }}
        />
      );
    }

    if (activeModule === 'ledgers') {
      return (
        <LedgersAndExpenses
          uid={uid}
          screen={ledgerSub}
          setScreen={setLedgerSub}
          onBackToHome={() => setActiveModule('home')}
          suppliers={suppliers}
          customers={customers}
          expenses={expenses}
          initialOpenAddModal={ledgerInitialAdd}
          onClearInitialModal={() => setLedgerInitialAdd(false)}
        />
      );
    }

    if (activeModule === 'marketing' || activeModule === 'printer') {
      return (
        <MarketingAndPrinter
          uid={uid}
          section={activeModule === 'marketing' ? 'marketing' : 'printer'}
          marketingScreen={marketingSub}
          setMarketingScreen={setMarketingSub}
          printerScreen={printerSub}
          setPrinterScreen={setPrinterSub}
          onBackToHome={() => setActiveModule('home')}
          products={products}
          profile={profile}
        />
      );
    }

    if (activeModule === 'reports') {
      return (
        <BusinessReports
          uid={uid}
          products={products}
          orders={orders}
          purchases={purchases}
          returns={returns}
          suppliers={suppliers}
          customers={customers}
          expenses={expenses}
          staff={staff}
          onBack={() => setActiveModule('home')}
        />
      );
    }

    if (activeModule === 'online_shop') {
      return <OnlineShopScreen uid={uid} profile={profile} />;
    }

    if (activeModule === 'more') {
      return (
        <MoreAndSettingsScreen
          uid={uid}
          profile={profile}
          products={products}
          orders={orders}
          purchases={purchases}
          customers={customers}
          suppliers={suppliers}
          staff={staff}
          initialView={moreInitialView}
          onOpenInvoicingSettings={() => {
            setPrinterSub('customize_billing');
            setActiveModule('printer');
          }}
        />
      );
    }

    // DEFAULT: HOME DASHBOARD (Refined Native Mobile App UI)
    const activeTourTarget = tourStep !== null ? TOUR_STEPS[tourStep]?.target : null;
    const todayIsoPrefix = new Date().toISOString().slice(0, 10);
    const todaySalesTotal = orders
      .filter((o) => (o.dateStr || '').startsWith(todayIsoPrefix))
      .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
    const purchaseReturnsLabel = t('purchaseReturns').replace('/', ' / ');

    return (
      <div className="min-h-screen bg-[#F3F5F8] flex flex-col pb-24">
        {/* Top Native App Header */}
        <header className="bg-white/95 backdrop-blur-md px-4 h-14 flex items-center justify-between sticky top-0 z-20 border-b border-slate-200/75">
          {/* Left: Brand Logo + Shop Name + QR Trigger */}
          <button
            type="button"
            onClick={() => setShowStoreQrModal(true)}
            className="flex items-center gap-2.5 min-w-0 py-1 pr-2 rounded-xl active:opacity-75 transition-opacity"
          >
            <img
              src={
                profile.logoUrl ||
                'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png'
              }
              alt="SmartBill CM"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-xl object-cover bg-white border border-slate-200/90 shadow-2xs shrink-0"
            />
            <div className="flex flex-col items-start min-w-0">
              <div className="flex items-center gap-1.5 max-w-[165px]">
                <span className="text-[15px] font-bold tracking-[-0.015em] text-[#0A2540] truncate leading-tight">
                  {profile.shopName || 'SmartBill CM'}
                </span>
                <QrCode className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
              <span className="text-[11px] font-medium text-slate-400 leading-tight">
                {lang === 'hi' ? 'स्टोर QR देखें' : 'Tap for Store QR'}
              </span>
            </div>
          </button>

          {/* Right: Native Icon Actions (Sync, Alerts, Language) */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSyncingHeader(true);
                setTimeout(() => setSyncingHeader(false), 700);
              }}
              title="Sync Database"
              className="w-9 h-9 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition flex items-center justify-center"
            >
              <RefreshCw
                className={`w-[18px] h-[18px] ${syncingHeader ? 'animate-spin text-emerald-600' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={() => setShowNotificationsModal(true)}
              title="Alerts"
              className="w-9 h-9 rounded-xl text-slate-600 hover:bg-slate-100 active:scale-95 transition flex items-center justify-center relative"
            >
              <Bell className="w-[18px] h-[18px]" />
              {lowStockCount > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center absolute top-1 right-1 leading-none">
                  {lowStockCount > 9 ? '9+' : lowStockCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMoreInitialView('language');
                setActiveModule('more');
              }}
              title="Change Language"
              className="h-9 px-2.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 text-[#0A2540] active:scale-95 transition flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide"
            >
              <Languages className="w-3.5 h-3.5 text-slate-600" />
              <span>{lang}</span>
            </button>
          </div>
        </header>

        {/* Main Home Content */}
        <main className="px-4 pt-4 pb-6 space-y-4 flex-1">
          {/* 1. Hero Primary Action Card: New Bill */}
          <button
            type="button"
            onClick={() => {
              setBillingSub('new_bill');
              setActiveModule('billing');
            }}
            className="w-full bg-gradient-to-br from-[#0F766E] via-[#0B526B] to-[#0A2540] text-white rounded-[22px] px-5 py-5 shadow-[0_10px_24px_-10px_rgba(10,37,64,0.45)] flex items-center justify-between gap-4 text-left active:scale-[0.985] transition-transform duration-150 relative overflow-hidden"
          >
            {/* Subtle ambient light sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-10 w-36 h-36 rounded-full bg-teal-300/15 blur-2xl"
            />
            <div className="min-w-0 z-10 space-y-1.5">
              <h2 className="text-[23px] font-extrabold tracking-[-0.02em] leading-tight text-white">
                {t('newBill')}
              </h2>
              <p className="text-[13px] text-teal-100/90 font-medium leading-snug">
                {t('clickToCreateBill')}
              </p>
              <div className="pt-1.5 inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-300">
                <span>{lang === 'hi' ? 'बिल बनाना शुरू करें' : 'Start Billing'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-white/12 border border-white/15 flex items-center justify-center shrink-0 z-10 shadow-inner">
              <ShoppingCart className="w-7 h-7 text-amber-300" />
            </div>
          </button>

          {/* 2. Two Primary Quick Actions: Purchase / Returns & Add Products */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowPurchaseReturnSheet(true)}
              className="bg-white rounded-[20px] p-4 border border-slate-200/70 shadow-[0_1px_3px_rgba(10,37,64,0.04)] flex flex-col justify-between gap-3 text-left hover:border-slate-300 active:scale-[0.98] transition-all duration-150"
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-[#0A2540] leading-[1.3] tracking-[-0.01em]">
                  {purchaseReturnsLabel}
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                  {lang === 'hi' ? 'खरीद बिल व वापसी' : 'Inward bills & returns'}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setInventorySub('add_hub');
                setActiveModule('stock');
              }}
              className={`bg-white rounded-[20px] p-4 border shadow-[0_1px_3px_rgba(10,37,64,0.04)] flex flex-col justify-between gap-3 text-left active:scale-[0.98] transition-all duration-150 relative ${
                activeTourTarget === 'Add Products To Shop'
                  ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/20 z-40'
                  : 'border-slate-200/70 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-[#0A2540] leading-[1.3] tracking-[-0.01em]">
                  {t('addProductsToShop')}
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                  {lang === 'hi' ? 'नया स्टॉक जोड़ें' : 'Add items to inventory'}
                </p>
              </div>
            </button>
          </div>

          {/* 3. 4x2 Quick Modules Surface Card (Crisp Single-Line Labels) */}
          <section className="bg-white rounded-[22px] px-3 py-4 border border-slate-200/70 shadow-[0_1px_3px_rgba(10,37,64,0.04)]">
            <div className="flex items-center justify-between px-1.5 mb-3">
              <h3 className="text-[13px] font-bold text-[#0A2540] tracking-[-0.01em]">
                {lang === 'hi' ? 'शॉप मैनेजमेंट' : 'Manage Shop'}
              </h3>
              <span className="text-[11px] font-medium text-slate-400">
                {lang === 'hi' ? '8 टूल्स' : '8 tools'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-y-4 gap-x-1">
              {[
                {
                  id: 'Stock',
                  label: t('stock'),
                  icon: Boxes,
                  color: 'bg-blue-50 text-blue-600',
                  badge: products.length > 0 ? String(products.length) : undefined,
                  onClick: () => {
                    setInventorySub('my_stock');
                    setActiveModule('stock');
                  },
                },
                {
                  id: 'Suppliers',
                  label: t('suppliers'),
                  icon: Truck,
                  color: 'bg-indigo-50 text-indigo-600',
                  onClick: () => {
                    setLedgerSub('suppliers');
                    setActiveModule('ledgers');
                  },
                },
                {
                  id: 'Customers',
                  label: t('customers'),
                  icon: Users,
                  color: 'bg-emerald-50 text-emerald-600',
                  onClick: () => {
                    setLedgerSub('customers');
                    setActiveModule('ledgers');
                  },
                },
                {
                  id: 'Orders',
                  label: t('orders'),
                  icon: ClipboardList,
                  color: 'bg-amber-50 text-amber-600',
                  badge: orders.length > 0 ? String(orders.length) : undefined,
                  onClick: () => {
                    setBillingSub('past_orders');
                    setActiveModule('billing');
                  },
                },
                {
                  id: 'Marketing',
                  label: t('marketing'),
                  icon: Megaphone,
                  color: 'bg-pink-50 text-pink-600',
                  onClick: () => {
                    setMarketingSub('marketing_hub');
                    setActiveModule('marketing');
                  },
                },
                {
                  id: 'Expenses',
                  label: t('expenses'),
                  icon: Receipt,
                  color: 'bg-rose-50 text-rose-600',
                  onClick: () => {
                    setLedgerSub('expenses');
                    setActiveModule('ledgers');
                  },
                },
                {
                  id: 'Printer',
                  label: t('printer'),
                  icon: Printer,
                  color: 'bg-cyan-50 text-cyan-600',
                  onClick: () => {
                    setPrinterSub('printer_hub');
                    setActiveModule('printer');
                  },
                },
                {
                  id: 'Reports',
                  label: t('reports'),
                  icon: BarChart3,
                  color: 'bg-violet-50 text-violet-600',
                  onClick: () => setActiveModule('reports'),
                },
              ].map((card) => {
                const Icon = card.icon;
                const isTourHighlight = activeTourTarget === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={card.onClick}
                    className={`flex flex-col items-center justify-start gap-2 py-1.5 px-1 rounded-2xl text-center active:scale-95 transition-transform duration-150 relative ${
                      isTourHighlight
                        ? 'bg-emerald-50/70 ring-2 ring-emerald-500 z-40'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`w-12 h-12 rounded-[16px] flex items-center justify-center ${card.color}`}
                      >
                        <Icon className="w-[21px] h-[21px]" />
                      </div>
                      {card.badge && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#0A2540] text-white text-[9px] font-bold tabular-nums flex items-center justify-center ring-2 ring-white">
                          {card.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11.5px] font-semibold text-[#0A2540] leading-tight tracking-[-0.01em] whitespace-nowrap truncate max-w-full">
                      {card.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 4. Today's Store Overview Card */}
          <section className="bg-white rounded-[22px] p-4 border border-slate-200/70 shadow-[0_1px_3px_rgba(10,37,64,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-slate-500">
                  {lang === 'hi' ? 'आज की बिक्री' : "Today's Sales"}
                </p>
                <p className="text-[24px] font-extrabold text-[#0A2540] tabular-nums tracking-tight leading-tight mt-0.5">
                  ₹{todaySalesTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTourStep(0)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-[#0A2540] text-[11.5px] font-semibold active:scale-95 transition whitespace-nowrap shrink-0"
              >
                {lang === 'hi' ? 'ऐप गाइड' : 'App Tour'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 mt-3.5 pt-3">
              <button
                type="button"
                onClick={() => {
                  setInventorySub('my_stock');
                  setActiveModule('stock');
                }}
                className="text-left rounded-xl py-1 px-1.5 hover:bg-slate-50 transition"
              >
                <p className="text-[11px] font-medium text-slate-400">
                  {lang === 'hi' ? 'कुल स्टॉक' : 'All Stocks'}
                </p>
                <p className="text-[15px] font-bold text-[#0A2540] tabular-nums mt-0.5">
                  {products.length}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBillingSub('past_orders');
                  setActiveModule('billing');
                }}
                className="text-left rounded-xl py-1 px-1.5 hover:bg-slate-50 transition border-x border-slate-100 pl-3"
              >
                <p className="text-[11px] font-medium text-slate-400">
                  {lang === 'hi' ? 'ऑर्डर्स' : 'Orders'}
                </p>
                <p className="text-[15px] font-bold text-[#0A2540] tabular-nums mt-0.5">
                  {orders.length}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLedgerSub('customers');
                  setActiveModule('ledgers');
                }}
                className="text-left rounded-xl py-1 px-1.5 hover:bg-slate-50 transition pl-3"
              >
                <p className="text-[11px] font-medium text-slate-400">
                  {lang === 'hi' ? 'ग्राहक' : 'Customers'}
                </p>
                <p className="text-[15px] font-bold text-[#0A2540] tabular-nums mt-0.5">
                  {customers.length}
                </p>
              </button>
            </div>
          </section>
        </main>

        {/* Floating AI Assistant FAB (Anchored cleanly inside mobile frame) */}
        <button
          type="button"
          onClick={() => setAiModalOpen(true)}
          aria-label="Open AI Assistant"
          className="fixed bottom-[78px] right-[max(1rem,calc(50%-208px))] z-30 w-13 h-13 rounded-2xl bg-[#0A2540] text-white shadow-[0_8px_20px_rgba(10,37,64,0.35)] border border-emerald-400/60 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Bot className="w-6 h-6 text-emerald-300" />
          <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-md bg-emerald-400 text-[#0A2540] text-[9px] font-extrabold leading-none shadow-xs">
            AI
          </span>
        </button>

        {/* Interactive Spotlight Onboarding Tour Overlay (07:08 - 07:14) */}
        {tourStep !== null && TOUR_STEPS[tourStep] && (
          <div className="fixed inset-0 bg-black/60 z-30 flex flex-col justify-end p-5 pb-28">
            <div className="bg-[#0A2540] text-white rounded-3xl p-5 shadow-2xl border border-white/15 space-y-3 max-w-sm mx-auto w-full">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-300 tracking-wide">
                  {TOUR_STEPS[tourStep].title}
                </span>
                <button
                  type="button"
                  onClick={handleCompleteTour}
                  className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('skipTour')}
                </button>
              </div>
              <p className="text-sm font-semibold leading-relaxed">{TOUR_STEPS[tourStep].desc}</p>
              <div className="flex items-center justify-between pt-2">
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 rounded-full transition-all ${
                        idx === tourStep ? 'w-6 bg-emerald-400' : 'w-1.5 bg-white/30'
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (tourStep + 1 < TOUR_STEPS.length) {
                      setTourStep(tourStep + 1);
                    } else {
                      handleCompleteTour();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-500 text-[#0A2540] font-bold text-xs"
                >
                  {tourStep + 1 < TOUR_STEPS.length ? t('next') : 'Finish'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Determine if Bottom Navigation Bar should be visible
  const showBottomNav =
    activeModule === 'home' ||
    activeModule === 'calculator' ||
    activeModule === 'online_shop' ||
    activeModule === 'more';

  return (
    <AppErrorBoundary>
      <div className="max-w-md mx-auto min-h-screen bg-[#F3F5F8] shadow-2xl relative overflow-x-hidden">
        {renderActiveModule()}

      {/* 4-Tab Native Bottom Navigation Bar (Home, Calculator, Online shop, More) */}
      {showBottomNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-16 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(10,37,64,0.04)] px-1 grid grid-cols-4 items-center z-30">
          <button
            type="button"
            onClick={() => setActiveModule('home')}
            className={`flex flex-col items-center justify-center gap-1 h-full px-1 transition-colors ${
              activeModule === 'home' ? 'text-[#0A2540]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`px-3.5 py-1 rounded-full transition-colors ${
                activeModule === 'home' ? 'bg-[#0A2540]/10' : ''
              }`}
            >
              <Home className="w-[19px] h-[19px]" />
            </div>
            <span
              className={`text-[10.5px] leading-none tracking-[-0.01em] whitespace-nowrap truncate max-w-full ${
                activeModule === 'home' ? 'font-bold' : 'font-medium'
              }`}
            >
              {t('home')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setBillingSub('calculator');
              setActiveModule('calculator');
            }}
            className={`flex flex-col items-center justify-center gap-1 h-full px-1 transition-colors ${
              activeModule === 'calculator'
                ? 'text-[#0A2540]'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`px-3.5 py-1 rounded-full transition-colors ${
                activeModule === 'calculator' ? 'bg-[#0A2540]/10' : ''
              }`}
            >
              <Calculator className="w-[19px] h-[19px]" />
            </div>
            <span
              className={`text-[10.5px] leading-none tracking-[-0.01em] whitespace-nowrap truncate max-w-full ${
                activeModule === 'calculator' ? 'font-bold' : 'font-medium'
              }`}
            >
              {t('calculator')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModule('online_shop')}
            className={`flex flex-col items-center justify-center gap-1 h-full px-1 transition-colors relative ${
              activeModule === 'online_shop'
                ? 'text-[#0A2540]'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`px-3.5 py-1 rounded-full transition-colors relative ${
                activeModule === 'online_shop' ? 'bg-[#0A2540]/10' : ''
              }`}
            >
              <Store className="w-[19px] h-[19px]" />
              <span className="absolute -top-1 -right-1 px-1 py-[1px] rounded bg-amber-400 text-[#0A2540] text-[7.5px] font-extrabold leading-none tracking-tight">
                NEW
              </span>
            </div>
            <span
              className={`text-[10.5px] leading-none tracking-[-0.01em] whitespace-nowrap truncate max-w-full ${
                activeModule === 'online_shop' ? 'font-bold' : 'font-medium'
              }`}
            >
              {t('onlineShop')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMoreInitialView('more');
              setActiveModule('more');
            }}
            className={`flex flex-col items-center justify-center gap-1 h-full px-1 transition-colors ${
              activeModule === 'more' ? 'text-[#0A2540]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div
              className={`px-3.5 py-1 rounded-full transition-colors ${
                activeModule === 'more' ? 'bg-[#0A2540]/10' : ''
              }`}
            >
              <MoreHorizontal className="w-[19px] h-[19px]" />
            </div>
            <span
              className={`text-[10.5px] leading-none tracking-[-0.01em] whitespace-nowrap truncate max-w-full ${
                activeModule === 'more' ? 'font-bold' : 'font-medium'
              }`}
            >
              {t('more')}
            </span>
          </button>
        </nav>
      )}

      {/* Global Dual-Mode Camera & AI Vision Barcode/IMEI Scanner Modal */}
      {scannerOpen && (
        <BarcodeScannerModal
          isOpen={scannerOpen}
          scanMode={scannerMode}
          title={scannerTitle}
          onClose={() => setScannerOpen(false)}
          onScanSuccess={(code: string, visionResult?: ScannedVisionResult) => {
            setScannerOpen(false);
            if (scannerCallback) scannerCallback(code, visionResult);
          }}
        />
      )}

      {/* Purchase / Sale Returns Chooser Bottom Sheet */}
      {showPurchaseReturnSheet && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-[#0A2540]">Purchase & Sale Returns</h3>
              <button
                onClick={() => setShowPurchaseReturnSheet(false)}
                className="p-1.5 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                setShowPurchaseReturnSheet(false);
                setInventorySub('purchase_entry');
                setActiveModule('stock');
              }}
              className="w-full p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-left hover:border-[#0A2540]"
            >
              <div>
                <p className="text-sm font-extrabold text-slate-800">Purchase Entry (Inward Bill)</p>
                <p className="text-xs text-slate-500">
                  Record supplier purchase bill & increment product stock
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => {
                setShowPurchaseReturnSheet(false);
                setBillingSub('sale_returns_list');
                setActiveModule('billing');
              }}
              className="w-full p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-left hover:border-[#0A2540]"
            >
              <div>
                <p className="text-sm font-extrabold text-slate-800">Sale Returns / Exchange</p>
                <p className="text-xs text-slate-500">
                  Process customer returns & restock returned items
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      )}

      {/* Store QR Code Modal */}
      {showStoreQrModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Store Digital QR
              </span>
              <button
                onClick={() => setShowStoreQrModal(false)}
                className="p-1 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-2">
              <img
                src={
                  profile.logoUrl ||
                  'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png'
                }
                alt="SmartBill CM"
                className="w-8 h-8 rounded-lg object-cover bg-white border border-slate-200"
              />
              <h3 className="text-base font-extrabold text-[#0A2540]">
                {profile.shopName || 'SmartBill CM'}
              </h3>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl inline-block border border-slate-200">
              <QRCodeSVG
                value={`https://smartbillcm.shop/${uid}`}
                size={168}
                bgColor="#F8FAFC"
                fgColor="#0A2540"
              />
            </div>
            <p className="text-xs text-slate-500">
              Customers can scan this QR to browse your Online Catalogue
            </p>
          </div>
        </div>
      )}

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-[#0A2540]">Smart Alerts</h3>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="p-1.5 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {lowStockCount === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-slate-700">All Stock Levels Healthy</p>
                <p className="text-[11px] text-slate-400">No low stock or expiring product alerts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {products
                  .filter((p) => p.quantity <= (p.lowStockAlert || 5))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-amber-900">{p.name}</p>
                        <p className="text-[11px] text-amber-700">
                          Remaining Qty: {p.quantity} {p.unit} (Alert at {p.lowStockAlert})
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowNotificationsModal(false);
                          setInventorySub('my_stock');
                          setActiveModule('stock');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#0A2540] text-white text-[10px] font-bold"
                      >
                        Restock
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Groq AI Chatbot Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl flex flex-col h-[80vh] overflow-hidden shadow-2xl">
            <div className="bg-[#0A2540] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src="https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png"
                  alt="SmartBill CM"
                  className="w-9 h-9 rounded-xl object-cover bg-white border border-emerald-400/40"
                />
                <div>
                  <h3 className="text-sm font-extrabold">SmartBill CM AI Assistant</h3>
                  <p className="text-[10px] text-emerald-300">
                    Live Store Insights • Real-Time Stock Context
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="p-1.5 rounded-full bg-white/10 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Pills */}
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => handleSendAiMessage('top_selling')}
                className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#0A2540] whitespace-nowrap shadow-2xs"
              >
                🔥 Top Selling Products
              </button>
              <button
                onClick={() => handleSendAiMessage('restock')}
                className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#0A2540] whitespace-nowrap shadow-2xs"
              >
                🛒 Restock Suggestions
              </button>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F4F6F9]">
              {aiMessages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#0A2540] text-white rounded-br-xs'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-2xs'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-500">
                    Analyzing live Firebase inventory & sales...
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendAiMessage();
                }}
                placeholder="Ask about stock, profit, or GST bills..."
                className="flex-1 px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs focus:outline-none"
              />
              <button
                onClick={() => handleSendAiMessage()}
                disabled={aiLoading}
                className="p-2.5 rounded-xl bg-[#0A2540] text-white disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppErrorBoundary>
  );
}
