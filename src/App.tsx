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
import { askGroqInventoryAssistant, type ScannedVisionResult } from './services/integrations';
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
      text: 'Namaste! I am your SmartBill CM AI Business Assistant powered by Llama-3.3-70B. Ask me about your live stock, top selling products, restock alerts, or today’s profit!',
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

    // DEFAULT: HOME DASHBOARD (1:1 Video Reference Match)
    const activeTourTarget = tourStep !== null ? TOUR_STEPS[tourStep]?.target : null;

    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col pb-24">
        {/* Top App Bar */}
        <header className="bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 border-b border-slate-100 shadow-2xs">
          {/* Left Store Pill Badge with Logo, Green Online Dot & QR Icon */}
          <button
            onClick={() => setShowStoreQrModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/80 pl-1.5 pr-3 py-1 rounded-full transition"
          >
            <img
              src={
                profile.logoUrl ||
                'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png'
              }
              alt="SmartBill CM"
              className="w-6 h-6 rounded-full object-cover bg-white border border-slate-200"
            />
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-extrabold text-[#0A2540] max-w-[130px] truncate">
              {profile.shopName || 'SmartBill CM'}
            </span>
            <QrCode className="w-3.5 h-3.5 text-slate-600" />
          </button>

          {/* Right Action Icons: Sync (↻), Notification Bell (🔔), Quick Language/Tour */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSyncingHeader(true);
                setTimeout(() => setSyncingHeader(false), 700);
              }}
              title="Sync Database"
              className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              <RefreshCw className={`w-4 h-4 ${syncingHeader ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            <button
              onClick={() => setShowNotificationsModal(true)}
              title="Alerts"
              className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition relative"
            >
              <Bell className="w-4 h-4" />
              {lowStockCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5" />
              )}
            </button>

            <button
              onClick={() => {
                setMoreInitialView('language');
                setActiveModule('more');
              }}
              title="Change Language"
              className="p-2 rounded-xl bg-slate-100 text-[#0A2540] hover:bg-slate-200 transition flex items-center gap-1 text-xs font-extrabold uppercase"
            >
              <Languages className="w-4 h-4" />
              <span>{lang}</span>
            </button>
          </div>
        </header>

        {/* Main Content Container */}
        <main className="p-3.5 space-y-3.5 flex-1">
          {/* 1. Hero Action Card: Dark Teal-to-Navy Gradient Banner titled "New bill" */}
          <button
            onClick={() => {
              setBillingSub('new_bill');
              setActiveModule('billing');
            }}
            className="w-full bg-linear-to-r from-[#0D6E6E] via-[#0B4F6C] to-[#0A2540] text-white rounded-2xl p-5 shadow-md flex items-center justify-between text-left hover:opacity-95 active:scale-[0.99] transition relative overflow-hidden"
          >
            <div className="space-y-1.5 z-10">
              <span className="inline-block px-2 py-0.5 rounded bg-emerald-400/20 border border-emerald-300/30 text-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                POS Counter
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight">{t('newBill')}</h2>
              <p className="text-xs text-emerald-100 font-semibold flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                {t('clickToCreateBill')}
              </p>
            </div>

            {/* 3D Shopping Cart Graphic */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 flex items-center justify-center shrink-0 z-10 shadow-inner">
              <ShoppingCart className="w-9 h-9 text-amber-300" />
            </div>
          </button>

          {/* 2. Two Primary Action Cards: Purchase/Returns & Add Products To Shop */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowPurchaseReturnSheet(true)}
              className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center gap-3 text-left hover:border-[#0A2540] transition"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-800 leading-snug">
                  {t('purchaseReturns')}
                </p>
                <p className="text-[10px] text-slate-400 truncate">Bills & Returns</p>
              </div>
            </button>

            <button
              onClick={() => {
                setInventorySub('add_hub');
                setActiveModule('stock');
              }}
              className={`bg-white rounded-2xl p-4 border shadow-xs flex items-center gap-3 text-left transition relative ${
                activeTourTarget === 'Add Products To Shop'
                  ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/20 z-40'
                  : 'border-slate-100 hover:border-[#0A2540]'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <PackagePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-800 leading-snug">
                  {t('addProductsToShop')}
                </p>
                <p className="text-[10px] text-slate-400 truncate">स्टॉक जोड़ें</p>
              </div>
            </button>
          </div>

          {/* 3. 4x2 Feature Grid (8 White Rounded Cards with Icons) */}
          <div className="grid grid-cols-4 gap-2.5">
            {[
              {
                id: 'Stock',
                label: t('stock'),
                icon: Boxes,
                color: 'bg-blue-50 text-blue-700',
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
                color: 'bg-indigo-50 text-indigo-700',
                onClick: () => {
                  setLedgerSub('suppliers');
                  setActiveModule('ledgers');
                },
              },
              {
                id: 'Customers',
                label: t('customers'),
                icon: Users,
                color: 'bg-emerald-50 text-emerald-700',
                onClick: () => {
                  setLedgerSub('customers');
                  setActiveModule('ledgers');
                },
              },
              {
                id: 'Orders',
                label: t('orders'),
                icon: ClipboardList,
                color: 'bg-amber-50 text-amber-700',
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
                color: 'bg-pink-50 text-pink-700',
                onClick: () => {
                  setMarketingSub('marketing_hub');
                  setActiveModule('marketing');
                },
              },
              {
                id: 'Expenses',
                label: t('expenses'),
                icon: Receipt,
                color: 'bg-rose-50 text-rose-700',
                onClick: () => {
                  setLedgerSub('expenses');
                  setActiveModule('ledgers');
                },
              },
              {
                id: 'Printer',
                label: t('printer'),
                icon: Printer,
                color: 'bg-cyan-50 text-cyan-700',
                onClick: () => {
                  setPrinterSub('printer_hub');
                  setActiveModule('printer');
                },
              },
              {
                id: 'Reports',
                label: t('reports'),
                icon: BarChart3,
                color: 'bg-purple-50 text-purple-700',
                onClick: () => setActiveModule('reports'),
              },
            ].map((card) => {
              const Icon = card.icon;
              const isTourHighlight = activeTourTarget === card.id;
              return (
                <button
                  key={card.id}
                  onClick={card.onClick}
                  className={`bg-white rounded-2xl p-3 border shadow-xs flex flex-col items-center justify-center gap-2 text-center transition relative ${
                    isTourHighlight
                      ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/20 z-40'
                      : 'border-slate-100 hover:border-[#0A2540]'
                  }`}
                >
                  {card.badge && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-full bg-[#0A2540] text-white text-[9px] font-bold tabular-nums">
                      {card.badge}
                    </span>
                  )}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${card.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-800 leading-tight">
                    {card.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live Quick Store Snapshot Banner + Tour Launcher */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-extrabold text-[#0A2540]">
                Today’s Sales: ₹
                {orders
                  .filter((o) =>
                    (o.dateStr || '').startsWith(new Date().toISOString().slice(0, 10))
                  )
                  .reduce((s, o) => s + (Number(o.totalAmount) || 0), 0)
                  .toFixed(0)}
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                All Stocks: {products.length} • Orders: {orders.length} • Customers:{' '}
                {customers.length}
              </p>
            </div>
            <button
              onClick={() => setTourStep(0)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0A2540] text-[11px] font-bold transition"
            >
              App Tour
            </button>
          </div>
        </main>

        {/* Floating AI Assistant FAB (Bottom-Right Circular Robot Icon with "AI" Badge) */}
        <button
          onClick={() => setAiModalOpen(true)}
          className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-[#0A2540] text-white shadow-xl border-2 border-emerald-400 flex items-center justify-center hover:scale-105 active:scale-95 transition"
        >
          <Bot className="w-7 h-7 text-emerald-300" />
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-[#0A2540] text-[9px] font-extrabold">
            AI
          </span>
        </button>

        {/* Interactive Spotlight Onboarding Tour Overlay (07:08 - 07:14) */}
        {tourStep !== null && TOUR_STEPS[tourStep] && (
          <div className="fixed inset-0 bg-black/60 z-30 flex flex-col justify-end p-5 pb-28">
            <div className="bg-[#0A2540] text-white rounded-3xl p-5 shadow-2xl border border-white/15 space-y-3 max-w-sm mx-auto w-full">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                  {TOUR_STEPS[tourStep].title}
                </span>
                <button
                  onClick={handleCompleteTour}
                  className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  {t('skipTour')}
                </button>
              </div>
              <p className="text-sm font-bold leading-snug">{TOUR_STEPS[tourStep].desc}</p>
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
                  onClick={() => {
                    if (tourStep + 1 < TOUR_STEPS.length) {
                      setTourStep(tourStep + 1);
                    } else {
                      handleCompleteTour();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-emerald-500 text-[#0A2540] font-extrabold text-xs"
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
      <div className="max-w-md mx-auto min-h-screen bg-[#F4F6F9] shadow-2xl relative overflow-x-hidden">
        {renderActiveModule()}

      {/* 4-Tab Bottom Navigation Bar (Home, Calculator, Online shop [NEW], More) */}
      {showBottomNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 px-2 py-2 flex items-center justify-around z-30">
          <button
            onClick={() => setActiveModule('home')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeModule === 'home' ? 'text-[#0A2540] font-extrabold' : 'text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[11px]">{t('home')}</span>
          </button>

          <button
            onClick={() => {
              setBillingSub('calculator');
              setActiveModule('calculator');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeModule === 'calculator' ? 'text-[#0A2540] font-extrabold' : 'text-slate-400'
            }`}
          >
            <Calculator className="w-5 h-5" />
            <span className="text-[11px]">{t('calculator')}</span>
          </button>

          <button
            onClick={() => setActiveModule('online_shop')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition relative ${
              activeModule === 'online_shop' ? 'text-[#0A2540] font-extrabold' : 'text-slate-400'
            }`}
          >
            <span className="absolute -top-1 right-1 px-1.5 py-0.2 rounded bg-amber-400 text-[#0A2540] text-[8px] font-extrabold uppercase">
              NEW
            </span>
            <Store className="w-5 h-5" />
            <span className="text-[11px]">{t('onlineShop')}</span>
          </button>

          <button
            onClick={() => {
              setMoreInitialView('more');
              setActiveModule('more');
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
              activeModule === 'more' ? 'text-[#0A2540] font-extrabold' : 'text-slate-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[11px]">{t('more')}</span>
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
                    Powered by Groq Llama-3.3-70B • Live Store Context
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
