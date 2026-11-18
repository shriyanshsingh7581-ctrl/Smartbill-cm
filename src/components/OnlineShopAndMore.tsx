import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Store,
  Phone,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Globe,
  User,
  Users,
  Landmark,
  Barcode,
  Truck,
  PlayCircle,
  FileText,
  TrendingUp,
  CalendarCheck,
  Layers,
  BellRing,
  Puzzle,
  HelpCircle,
  LayoutDashboard,
  Edit3,
  Camera,
  WifiOff,
  Languages,
  RefreshCw,
  Lock,
  LogOut,
  CheckCircle2,
  X,
  Plus,
  Youtube,
  Instagram,
  CloudUpload,
} from 'lucide-react';
import { updatePassword, signOut } from 'firebase/auth';
import {
  auth,
  updateUserProfile,
  saveStaffToDb,
  type UserProfileDoc,
  type ProductDoc,
  type OrderDoc,
  type PurchaseDoc,
  type CustomerDoc,
  type SupplierDoc,
  type StaffDoc,
} from '../firebase';
import { ApkPhotoSheet } from './ApkPhotoSheet';
import { type LanguageCode, TRANSLATIONS } from '../i18n/translations';

interface OnlineShopProps {
  uid: string;
  profile: UserProfileDoc;
}

export const OnlineShopScreen: React.FC<OnlineShopProps> = ({ uid, profile }) => {
  const lang: LanguageCode = profile.language || 'en';
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;

  const onlineCfg = profile.config?.onlineStore;
  const [onlineStore, setOnlineStore] = useState(onlineCfg?.onlineStoreEnabled ?? false);
  const [showOutOfStock, setShowOutOfStock] = useState(onlineCfg?.showOutOfStock ?? false);
  const [codEnabled, setCodEnabled] = useState(onlineCfg?.cashOnDelivery ?? true);
  const [newOrderAlerts, setNewOrderAlerts] = useState(onlineCfg?.newOrderAlerts ?? true);
  const [showLowStockLabel, setShowLowStockLabel] = useState(onlineCfg?.showLowStockLabel ?? false);
  const [advancePayment, setAdvancePayment] = useState(onlineCfg?.advancePayment ?? false);
  const [allowCancellation, setAllowCancellation] = useState(
    onlineCfg?.allowOrderCancellation ?? false
  );
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [maxOrderQty, setMaxOrderQty] = useState('50');
  const [customDomain, setCustomDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleUpdateStore = async () => {
    setSaving(true);
    try {
      await updateUserProfile(uid, {
        config: {
          ...profile.config,
          onlineStore: {
            onlineStoreEnabled: onlineStore,
            showOutOfStock,
            cashOnDelivery: codEnabled,
            newOrderAlerts,
            showLowStockLabel,
            advancePayment,
            allowOrderCancellation: allowCancellation,
          },
        },
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col pb-24">
      {/* Top Bar */}
      <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Store className="w-5 h-5 text-emerald-400" />
          <h1 className="text-base font-bold">{t('onlineStoreSettings')}</h1>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
          LIVE
        </span>
      </div>

      <div className="p-3.5 space-y-3.5">
        {/* Promotional Banner Carousel (Meesho / Dmart Theme) */}
        <div className="bg-linear-to-r from-[#0A2540] via-[#0F385C] to-[#0D6E6E] rounded-2xl p-4 text-white shadow-md relative overflow-hidden">
          <div className="relative z-10 space-y-1.5">
            <span className="inline-block px-2 py-0.5 rounded bg-amber-400 text-[#0A2540] text-[10px] font-extrabold uppercase">
              Professional Themes - Meesho / Dmart
            </span>
            <h2 className="text-lg font-extrabold">Launch Your E-Commerce Store</h2>
            <p className="text-xs text-slate-200">
              Share catalogue link on WhatsApp & get unlimited online orders at{' '}
              <span className="font-bold text-amber-300">₹250 per month</span>
            </p>
            <button
              onClick={handleUpdateStore}
              className="mt-2 inline-flex items-center gap-1.5 bg-white text-[#0A2540] font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs"
            >
              Get yours now →
            </button>
          </div>
        </div>

        {/* Accept Online Payments Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Accept Online Payments</h3>
              <p className="text-xs text-slate-500">
                Receive instant UPI, Credit/Debit Card & NetBanking settlements
              </p>
            </div>
            <ShieldCheck className="w-7 h-7 text-emerald-600 shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <a
              href="tel:+919876543210"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-[#0A2540] font-bold text-xs"
            >
              <Phone className="w-3.5 h-3.5" />
              Call to Setup
            </a>
            <a
              href="https://wa.me/919876543210?text=Hello%20SmartBill%20CM%2C%20I%20want%20to%20setup%20Online%20Payments"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp Us
            </a>
          </div>
        </div>

        {/* Order Quantity Limits (NEW) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">Order Quantity Limits</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-extrabold">
              NEW
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Min Qty per Order
              </label>
              <input
                type="number"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 tabular-nums"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Max Qty per Order
              </label>
              <input
                type="number"
                value={maxOrderQty}
                onChange={(e) => setMaxOrderQty(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Store Toggles List */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs divide-y divide-slate-100">
          {[
            {
              label: t('onlineStore'),
              sub: t('enableOnlineStore'),
              val: onlineStore,
              set: setOnlineStore,
            },
            {
              label: t('showOutOfStock'),
              sub: t('showOutOfStockDesc'),
              val: showOutOfStock,
              set: setShowOutOfStock,
            },
            {
              label: t('cashOnDelivery'),
              sub: t('cashOnDeliveryDesc'),
              val: codEnabled,
              set: setCodEnabled,
            },
            {
              label: t('newOrderAlerts'),
              sub: t('newOrderAlertsDesc'),
              val: newOrderAlerts,
              set: setNewOrderAlerts,
            },
            {
              label: t('showLowStockLabel'),
              sub: t('showLowStockLabelDesc'),
              val: showLowStockLabel,
              set: setShowLowStockLabel,
            },
            {
              label: t('advancePayment'),
              sub: t('advancePaymentDesc'),
              val: advancePayment,
              set: setAdvancePayment,
              badge: 'NEW',
            },
            {
              label: t('allowOrderCancellation'),
              sub: t('allowOrderCancellationDesc'),
              val: allowCancellation,
              set: setAllowCancellation,
              badge: 'NEW',
            },
          ].map((item, idx) => (
            <div key={idx} className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-extrabold">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{item.sub}</p>
              </div>
              <button
                onClick={() => item.set(!item.val)}
                className={`w-12 h-6 rounded-full transition p-0.5 shrink-0 ${
                  item.val ? 'bg-[#0A2540]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition transform ${
                    item.val ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Create Android App (ULTRA) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">Create Android App</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-extrabold">
                  ULTRA
                </span>
              </div>
              <p className="text-xs text-slate-400">Publish your branded APK for Play Store</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </div>

        {/* Domain Integration */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[#0A2540]" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Domain Integration</h3>
              <p className="text-xs text-slate-400">Do you have a custom domain?</p>
            </div>
          </div>
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="e.g. www.myshopname.com"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
          />
        </div>

        {savedToast && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl flex items-center gap-2 shadow-md">
            <CheckCircle2 className="w-4 h-4" />
            Online store settings updated in Firebase!
          </div>
        )}

        {/* Update Button */}
        <button
          onClick={handleUpdateStore}
          disabled={saving}
          className="w-full bg-[#0A2540] text-white font-bold py-3.5 rounded-xl text-sm shadow-md hover:bg-[#0A2540]/95 transition disabled:opacity-50"
        >
          {saving ? 'Updating...' : t('update')}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MORE TAB, DASHBOARD, ACCOUNT SETTINGS & SUB-TOOLS (05:19 - 07:05)
// ============================================================================

interface MoreAndSettingsProps {
  uid: string;
  profile: UserProfileDoc;
  products: ProductDoc[];
  orders: OrderDoc[];
  purchases: PurchaseDoc[];
  customers: CustomerDoc[];
  suppliers: SupplierDoc[];
  staff: StaffDoc[];
  initialView?: 'more' | 'account' | 'dashboard' | 'language';
  onOpenInvoicingSettings?: () => void;
}

export const MoreAndSettingsScreen: React.FC<MoreAndSettingsProps> = ({
  uid,
  profile,
  products,
  orders,
  customers,
  suppliers,
  staff,
  initialView = 'more',
  onOpenInvoicingSettings,
}) => {
  const [subScreen, setSubScreen] = useState<
    | 'more'
    | 'dashboard'
    | 'account'
    | 'shop_details'
    | 'subscription'
    | 'devices'
    | 'offline_mode'
    | 'change_language'
    | 'syncing_language'
    | 'manage_staff'
  >(
    initialView === 'account'
      ? 'account'
      : initialView === 'dashboard'
      ? 'dashboard'
      : initialView === 'language'
      ? 'change_language'
      : 'more'
  );

  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const [showDataRefreshModal, setShowDataRefreshModal] = useState(false);
  const [showPasswordSheet, setShowPasswordSheet] = useState(false);
  const [showOfflineStaffModal, setShowOfflineStaffModal] = useState(false);

  // Shop Details Form State
  const [ownerName, setOwnerName] = useState(profile.ownerName || '');
  const [shopName, setShopName] = useState(profile.shopName || 'Shop Name');
  const [address, setAddress] = useState(profile.address || '');
  const [gstNumber, setGstNumber] = useState(profile.gstNumber || '');
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingShop, setSavingShop] = useState(false);

  // Devices Tab State
  const [deviceTab, setDeviceTab] = useState<'android' | 'ios' | 'desktop'>('android');

  // Language Selector & Sync Progress State (06:15 - 06:58)
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(profile.language || 'en');
  const [syncStep, setSyncStep] = useState(0);

  // Set Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  // Staff Form State
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState('Sales');
  const [staffSalary, setStaffSalary] = useState('');

  const SYNC_MODULES = [
    'Stocks',
    'Customers',
    'Suppliers',
    'Invoices',
    'Expenses',
    'Reports',
    'Categories',
    'Units',
    'Tax Slabs',
    'Staff',
    'Attendance',
    'Quotations',
    'Coupons',
    'Banners',
    'Bank Accounts',
    'Racks',
    'Barcodes',
    'Templates',
    'Settings',
    'Profile',
  ];

  useEffect(() => {
    if (subScreen !== 'syncing_language') return;
    setSyncStep(0);
    const interval = setInterval(() => {
      setSyncStep((prev) => {
        if (prev >= 20) {
          clearInterval(interval);
          return 20;
        }
        return prev + 1;
      });
    }, 105);
    return () => clearInterval(interval);
  }, [subScreen]);

  useEffect(() => {
    if (subScreen === 'syncing_language' && syncStep === 20) {
      const timer = setTimeout(async () => {
        await updateUserProfile(uid, { language: selectedLang });
        setSubScreen('more');
      }, 380);
      return () => clearTimeout(timer);
    }
  }, [subScreen, syncStep, selectedLang, uid]);

  const [logoPhotoSheetOpen, setLogoPhotoSheetOpen] = useState(false);

  const handleUploadedShopLogo = async (url: string) => {
    setUploadingLogo(true);
    try {
      setLogoUrl(url);
      await updateUserProfile(uid, { logoUrl: url });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveShopDetails = async () => {
    setSavingShop(true);
    try {
      await updateUserProfile(uid, {
        ownerName: ownerName.trim(),
        shopName: shopName.trim() || 'Shop Name',
        address: address.trim(),
        gstNumber: gstNumber.trim(),
        logoUrl,
      });
      setSubScreen('account');
    } finally {
      setSavingShop(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      setPasswordMsg('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Passwords do not match');
      return;
    }
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setPasswordMsg('Password updated successfully!');
        setTimeout(() => {
          setShowPasswordSheet(false);
          setPasswordMsg(null);
          setNewPassword('');
          setConfirmPassword('');
        }, 1200);
      }
    } catch (err: any) {
      setPasswordMsg(err?.message || 'Re-login required to change password.');
    }
  };

  const handleAddStaff = async () => {
    if (!staffName.trim()) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    await saveStaffToDb(uid, {
      name: staffName.trim(),
      phone: staffPhone.trim() || '+91',
      role: staffRole,
      salary: Number(staffSalary) || 0,
      commissionPct: 0,
      attendance: [{ dateStr: todayStr, status: 'Present' }],
    });
    setStaffName('');
    setStaffPhone('');
    setStaffSalary('');
  };

  // Live Dashboard Metrics
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => (o.dateStr || '').startsWith(todayIso));
  const todaySales = todayOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const todayProfit = todayOrders.reduce((s, o) => s + (Number(o.totalProfit) || 0), 0);

  const pastCollection = orders.reduce((s, o) => s + (Number(o.paidAmount) || 0), 0);
  const toCollect = customers.reduce((s, c) => s + Math.max(0, Number(c.balance) || 0), 0);
  const cashInHand = orders
    .filter((o) => o.paymentMode === 'Cash')
    .reduce((s, o) => s + (Number(o.paidAmount) || 0), 0);
  const cashInBank = orders
    .filter((o) => o.paymentMode === 'Online' || o.paymentMode === 'Card')
    .reduce((s, o) => s + (Number(o.paidAmount) || 0), 0);

  // --------------------------------------------------------------------------
  // SUB-SCREEN: SmartBill CM Syncing... 0 of 20 (06:18 - 06:58)
  // --------------------------------------------------------------------------
  if (subScreen === 'syncing_language') {
    const pct = Math.round((syncStep / 20) * 100);
    return (
      <div className="min-h-screen bg-[#0A2540] text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src="https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png"
                alt="SmartBill CM"
                className="w-10 h-10 rounded-xl object-cover bg-white"
              />
              <div>
                <h2 className="text-lg font-extrabold">SmartBill CM Syncing...</h2>
                <p className="text-xs text-slate-300">
                  Applying language pack & refreshing local cache
                </p>
              </div>
            </div>
            <span className="text-sm font-extrabold text-emerald-400 tabular-nums">
              {syncStep} of 20
            </span>
          </div>

          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-150 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            {SYNC_MODULES.map((mod, idx) => {
              const done = idx < syncStep;
              return (
                <div
                  key={mod}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between border transition ${
                    done
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                      : 'bg-white/5 border-white/10 text-slate-400'
                  }`}
                >
                  <span>{mod}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Change Language (06:15)
  // --------------------------------------------------------------------------
  if (subScreen === 'change_language') {
    const languages: { code: LanguageCode; label: string; native: string }[] = [
      { code: 'en', label: 'English', native: 'English' },
      { code: 'hi', label: 'Hindi', native: 'हिंदी' },
      { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
      { code: 'mr', label: 'Marathi', native: 'मराठी' },
    ];
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('account')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Change Language</h1>
        </div>

        <div className="p-4 space-y-3 flex-1">
          <p className="text-xs text-slate-500 font-medium">
            Choose your preferred language for SmartBill CM POS & invoices
          </p>
          <div className="grid grid-cols-2 gap-3">
            {languages.map((l) => {
              const active = selectedLang === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => setSelectedLang(l.code)}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between h-28 ${
                    active
                      ? 'bg-[#0A2540] text-white border-[#0A2540] shadow-md'
                      : 'bg-white text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs opacity-75">{l.label}</span>
                    {active && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <span className="text-xl font-extrabold">{l.native}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 bg-white border-t border-slate-200">
          <button
            onClick={() => setSubScreen('syncing_language')}
            className="w-full bg-[#0A2540] text-white font-bold py-3.5 rounded-xl text-sm shadow-md"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Dashboard (05:27)
  // --------------------------------------------------------------------------
  if (subScreen === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('more')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Dashboard</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Today Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5">
                <p className="text-xs text-slate-500">Total Sales</p>
                <p className="text-xl font-extrabold text-[#0A2540] tabular-nums mt-1">
                  ₹{todaySales.toFixed(0)}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3.5">
                <p className="text-xs text-emerald-700">Profit</p>
                <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-1">
                  ₹{todayProfit.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Financial Summary
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500">Past Collection</p>
                <p className="text-base font-bold text-slate-800 tabular-nums mt-0.5">
                  ₹{pastCollection.toFixed(0)}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500">To Collect</p>
                <p className="text-base font-bold text-rose-600 tabular-nums mt-0.5">
                  ₹{toCollect.toFixed(0)}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500">Cash in Hand</p>
                <p className="text-base font-bold text-emerald-600 tabular-nums mt-0.5">
                  ₹{cashInHand.toFixed(0)}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500">Cash in Bank</p>
                <p className="text-base font-bold text-blue-600 tabular-nums mt-0.5">
                  ₹{cashInBank.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Shop Overview
            </h2>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">Total Products (SKUs)</span>
                <span className="font-bold text-slate-800 tabular-nums">{products.length}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">Total Orders Generated</span>
                <span className="font-bold text-slate-800 tabular-nums">{orders.length}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">Registered Customers</span>
                <span className="font-bold text-slate-800 tabular-nums">{customers.length}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">Registered Suppliers</span>
                <span className="font-bold text-slate-800 tabular-nums">{suppliers.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Shop Details (05:45)
  // --------------------------------------------------------------------------
  if (subScreen === 'shop_details') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('account')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Shop details</h1>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Shop Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-extrabold text-[#0A2540]">
                  {(shopName || 'KF').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">Shop Logo</p>
              <p className="text-xs text-slate-400 mb-2">Printed on thermal & A4 tax invoices</p>
              <button
                type="button"
                onClick={() => setLogoPhotoSheetOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A2540] text-white text-xs font-bold cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{uploadingLogo ? 'Uploading...' : 'Upload Logo'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Country & Currency</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">India • Currency: ₹ (INR)</p>
            </div>
            <span className="text-lg">🇮🇳</span>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Basic Information
            </h3>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Owner Name</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Shop Name</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Enter shop / business name"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">GSTIN</label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="Optional 15-digit GSTIN"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Shop Address
              </label>
              <textarea
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete store address for invoices"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <button
            onClick={handleSaveShopDetails}
            disabled={savingShop}
            className="w-full bg-[#0A2540] text-white font-bold py-3.5 rounded-xl text-sm shadow-md"
          >
            {savingShop ? 'Updating...' : 'Update Details'}
          </button>
        </div>

        <ApkPhotoSheet
          isOpen={logoPhotoSheetOpen}
          onClose={() => setLogoPhotoSheetOpen(false)}
          title="Upload Shop Logo"
          onUploaded={handleUploadedShopLogo}
        />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: My Subscription (05:56)
  // --------------------------------------------------------------------------
  if (subScreen === 'subscription') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('account')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">My Subscription</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-linear-to-br from-[#0A2540] to-[#133B63] text-white rounded-2xl p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-full bg-amber-400 text-[#0A2540] text-xs font-extrabold">
                Subscription Type: LITE
              </span>
              <span className="text-xs text-emerald-300 font-semibold">Active</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/15 text-xs">
              <div>
                <p className="text-slate-300">Start Date</p>
                <p className="font-bold text-sm mt-0.5">15 Nov 2026</p>
              </div>
              <div>
                <p className="text-slate-300">End Date</p>
                <p className="font-bold text-sm mt-0.5">19 Nov 2026 (Trial)</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Need Help?</p>
              <p className="text-xs text-slate-500">Talk to our billing specialist for upgrades</p>
            </div>
            <a
              href="tel:+919876543210"
              className="px-4 py-2 rounded-xl bg-[#0A2540] text-white text-xs font-bold"
            >
              Call Now
            </a>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Your Devices (06:00)
  // --------------------------------------------------------------------------
  if (subScreen === 'devices') {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('account')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Your Devices</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">Total Active Devices</span>
            <span className="px-3 py-1 rounded-full bg-[#0A2540] text-white text-xs font-extrabold tabular-nums">
              2
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-slate-200/70 p-1 rounded-xl">
            {(['android', 'ios', 'desktop'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDeviceTab(t)}
                className={`py-2 rounded-lg text-xs font-bold capitalize transition ${
                  deviceTab === t ? 'bg-white text-[#0A2540] shadow-xs' : 'text-slate-600'
                }`}
              >
                {t === 'ios' ? 'iOS' : t}
              </button>
            ))}
          </div>

          {deviceTab === 'android' ? (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">samsung SM-M356B</p>
                  <p className="text-xs text-emerald-600 font-semibold">This Device • Online</p>
                </div>
              </div>
              <span className="text-[11px] text-slate-400">v22.2.1</span>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 border border-slate-100">
              No active {deviceTab.toUpperCase()} devices linked
            </div>
          )}
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Offline Mode Radar Screen (06:06 - 06:12)
  // --------------------------------------------------------------------------
  if (subScreen === 'offline_mode') {
    return (
      <div className="min-h-screen bg-[#071A2E] text-white flex flex-col">
        <div className="px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('account')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Offline Mode</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative w-44 h-44 flex items-center justify-center mb-6">
            <div className="absolute inset-0 rounded-full border border-teal-400/20 animate-ping" />
            <div className="absolute inset-4 rounded-full border border-teal-400/30" />
            <div className="w-20 h-20 rounded-full bg-teal-500/20 border border-teal-400/50 flex items-center justify-center">
              <WifiOff className="w-9 h-9 text-teal-300" />
            </div>
          </div>

          <h2 className="text-xl font-extrabold">Offline mode is off</h2>
          <p className="text-xs text-slate-300 max-w-xs mt-2 leading-relaxed">
            Create bills even without internet connection. Invoices automatically sync when back
            online.
          </p>

          <button
            onClick={() => setShowOfflineStaffModal(true)}
            className="mt-8 w-full max-w-xs bg-teal-500 hover:bg-teal-400 text-[#071A2E] font-extrabold py-3.5 rounded-xl text-sm shadow-lg transition"
          >
            Turn on offline mode
          </button>
        </div>

        {showOfflineStaffModal && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white text-slate-800 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl">
              <h3 className="text-base font-extrabold text-[#0A2540]">
                Set invoicing to &ldquo;By staff&rdquo;
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                To prevent invoice number conflicts in Offline Mode, please enable &ldquo;By
                staff&rdquo; invoice numbering in your invoicing settings.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowOfflineStaffModal(false);
                    if (onOpenInvoicingSettings) {
                      onOpenInvoicingSettings();
                    }
                  }}
                  className="w-full bg-[#0A2540] text-white font-bold py-3 rounded-xl text-xs"
                >
                  Open invoicing settings
                </button>
                <button
                  onClick={() => setShowOfflineStaffModal(false)}
                  className="w-full py-2.5 text-xs font-bold text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Manage Staff & Attendance
  // --------------------------------------------------------------------------
  if (subScreen === 'manage_staff') {
    const todayStr = new Date().toISOString().slice(0, 10);
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => setSubScreen('more')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Manage Staff & Attendance</h1>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-700">Add Staff Member</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Staff Name"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <input
                type="tel"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="Phone Number"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <option value="Sales">Sales Counter</option>
                <option value="Manager">Store Manager</option>
                <option value="Cashier">Cashier</option>
              </select>
              <input
                type="number"
                value={staffSalary}
                onChange={(e) => setStaffSalary(e.target.value)}
                placeholder="Monthly Salary (₹)"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <button
              onClick={handleAddStaff}
              className="w-full bg-[#0A2540] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Staff to Shop
            </button>
          </div>

          <div className="space-y-2.5">
            {staff.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400">
                No staff added yet. Add staff above to track sales & attendance.
              </div>
            ) : (
              staff.map((st) => {
                const todayRec = (st.attendance || []).find((a) => a.dateStr === todayStr);
                const status = todayRec?.status || 'Present';
                return (
                  <div
                    key={st.id}
                    className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800">{st.name}</p>
                      <p className="text-xs text-slate-500">
                        {st.role} • {st.phone} • ₹{st.salary}/mo
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const nextStatus = status === 'Present' ? 'Absent' : 'Present';
                        const filtered = (st.attendance || []).filter(
                          (a) => a.dateStr !== todayStr
                        );
                        saveStaffToDb(uid, {
                          ...st,
                          attendance: [...filtered, { dateStr: todayStr, status: nextStatus }],
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        status === 'Present'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {status}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // SUB-SCREEN: Account Settings Hub (05:40 - 07:05)
  // --------------------------------------------------------------------------
  if (subScreen === 'account') {
    const accountItems = [
      {
        title: 'Shop details',
        sub: 'Logo, business name, GSTIN & address',
        icon: Store,
        action: () => setSubScreen('shop_details'),
      },
      {
        title: 'My Subscription',
        sub: 'Plan details, validity & invoices',
        icon: Sparkles,
        action: () => setSubScreen('subscription'),
      },
      {
        title: 'Your Devices',
        sub: 'Manage logged-in mobile & desktop sessions',
        icon: Smartphone,
        action: () => setSubScreen('devices'),
      },
      {
        title: 'Offline Mode',
        sub: 'Bill seamlessly without internet',
        icon: WifiOff,
        action: () => setSubScreen('offline_mode'),
      },
      {
        title: 'Change Language',
        sub: 'English, हिंदी, ગુજરાતી, मराठी',
        icon: Languages,
        action: () => setSubScreen('change_language'),
      },
      {
        title: 'Refresh Ledgers and Reports',
        sub: 'Recalculate party balances & AI cache',
        icon: RefreshCw,
        action: () => setShowDataRefreshModal(true),
      },
      {
        title: 'Change your password',
        sub: 'Update your account login password',
        icon: Lock,
        action: () => setShowPasswordSheet(true),
      },
      {
        title: 'Logout',
        sub: 'Sign out of this device safely',
        icon: LogOut,
        danger: true,
        action: () => signOut(auth),
      },
    ];

    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setSubScreen('more')} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Account Settings</h1>
        </div>

        <div className="p-4 space-y-2.5">
          {accountItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                onClick={item.action}
                className="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between text-left hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      item.danger ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-[#0A2540]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p
                      className={`text-sm font-bold ${
                        item.danger ? 'text-rose-600' : 'text-slate-800'
                      }`}
                    >
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-400">{item.sub}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            );
          })}
        </div>

        {/* Data Refresh Modal (07:00) */}
        {showDataRefreshModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full space-y-4 text-center shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#0A2540] flex items-center justify-center mx-auto">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <h3 className="text-base font-extrabold text-[#0A2540]">Data Refresh</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Data refresh is in progress, you will be able to see your ledger tally, reports
                data and be able to use AI features in 5 minutes...
              </p>
              <button
                onClick={() => setShowDataRefreshModal(false)}
                className="w-full bg-[#0A2540] text-white font-bold py-3 rounded-xl text-xs"
              >
                OK
              </button>
            </div>
          </div>
        )}

        {/* Set Password Bottom Sheet (07:03) */}
        {showPasswordSheet && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold text-[#0A2540]">Set Password</h3>
                <button
                  onClick={() => setShowPasswordSheet(false)}
                  className="p-1 rounded-full bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Registered Phone / Email
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile.phone || profile.email || auth.currentUser?.email || ''}
                    className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Type a strong password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Confirm password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                {passwordMsg && (
                  <p className="text-xs font-semibold text-amber-700">{passwordMsg}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowPasswordSheet(false)}
                  className="py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordChange}
                  className="py-3 rounded-xl bg-[#0A2540] text-white text-xs font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // DEFAULT MORE TAB SCREEN (05:19 - 05:39)
  // --------------------------------------------------------------------------
  const settingsTools = [
    { label: 'Account', icon: User, action: () => setSubScreen('account') },
    { label: 'Multiple Shops', icon: Store, action: () => setSubScreen('shop_details') },
    { label: 'Manage Staff', icon: Users, action: () => setSubScreen('manage_staff') },
    { label: 'Bank Accounts', icon: Landmark, action: () => setSubScreen('shop_details') },
    { label: 'Barcode', icon: Barcode, action: () => setSubScreen('shop_details') },
    { label: 'Courier &', icon: Truck, action: () => setSubScreen('shop_details') },
    { label: 'Tutorials', icon: PlayCircle, action: () => setShowHelpSheet(true) },
    { label: 'Quotations', icon: FileText, action: () => setSubScreen('dashboard') },
    { label: 'Growth', icon: TrendingUp, action: () => setSubScreen('dashboard') },
    { label: 'Attendance', icon: CalendarCheck, action: () => setSubScreen('manage_staff') },
    { label: 'Rack', icon: Layers, action: () => setSubScreen('shop_details') },
    { label: 'Smart Alerts', icon: BellRing, action: () => setSubScreen('account') },
    { label: 'Plugins', icon: Puzzle, action: () => setSubScreen('account') },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col pb-24">
      <div className="p-3.5 space-y-3.5">
        {/* Top Shop Profile Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-[#0A2540] font-extrabold text-base flex items-center justify-center overflow-hidden">
                <img
                  src={
                    profile.logoUrl ||
                    'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png'
                  }
                  alt="SmartBill CM Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-800">
                  {profile.shopName || 'SmartBill CM'}
                </h2>
                <p className="text-xs text-slate-500 tabular-nums">
                  {profile.phone || auth.currentUser?.email || '+91 9876543210'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSubScreen('shop_details')}
              className="p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">Trail expires in 2 days</span>
            <button
              onClick={() => setSubScreen('subscription')}
              className="px-3 py-1 rounded-lg bg-[#0A2540] text-white text-xs font-bold"
            >
              Buy Now
            </button>
          </div>
        </div>

        {/* Quick Actions (3 Cards: Dashboard, Account, Help) */}
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2 px-1">
            Quick Actions
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={() => setSubScreen('dashboard')}
              className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs flex flex-col items-center gap-2 hover:border-[#0A2540] transition"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A2540] flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800">Dashboard</span>
            </button>

            <button
              onClick={() => setSubScreen('account')}
              className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs flex flex-col items-center gap-2 hover:border-[#0A2540] transition"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800">Account</span>
            </button>

            <button
              onClick={() => setShowHelpSheet(true)}
              className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-xs flex flex-col items-center gap-2 hover:border-[#0A2540] transition"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-800">Help</span>
            </button>
          </div>
        </div>

        {/* Settings & Tools (13 Icons Grid) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Settings & Tools
          </h3>
          <div className="grid grid-cols-4 gap-y-4 gap-x-2">
            {settingsTools.map((tool, i) => {
              const Icon = tool.icon;
              return (
                <button
                  key={i}
                  onClick={tool.action}
                  className="flex flex-col items-center text-center gap-1.5 group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 group-hover:bg-[#0A2540] group-hover:text-white text-[#0A2540] flex items-center justify-center transition">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 leading-tight">
                    {tool.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Need Help? Call Now Card */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Need Help?</p>
            <p className="text-xs text-slate-400">Dedicated support team available 9 AM - 9 PM</p>
          </div>
          <a
            href="tel:+919876543210"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Phone className="w-3.5 h-3.5" />
            Call Now
          </a>
        </div>

        {/* Trust Badges & Version Footer */}
        <div className="pt-2 pb-4 text-center space-y-2">
          <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <CloudUpload className="w-3.5 h-3.5 text-emerald-600" />
              100% Auto Data Backup
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              100% Safe & Secure
            </span>
          </div>
          <p className="text-[10px] text-slate-400">
            Powered by Xero Apps Private Limited version 22.2.1
          </p>
        </div>
      </div>

      {/* Help Bottom Sheet (05:31) */}
      {showHelpSheet && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-[#0A2540]">Help & Support</h3>
              <button
                onClick={() => setShowHelpSheet(false)}
                className="p-1.5 rounded-full bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {[
              {
                label: 'Give us a call',
                sub: 'Speak directly with customer support',
                icon: Phone,
                href: 'tel:+919876543210',
                color: 'bg-blue-50 text-blue-700',
              },
              {
                label: 'Send us a whatsapp message',
                sub: 'Instant chat support on WhatsApp',
                icon: MessageCircle,
                href: 'https://wa.me/919876543210',
                color: 'bg-emerald-50 text-emerald-700',
              },
              {
                label: 'Check tutorials on youtube channel',
                sub: 'Step-by-step video guides in Hindi & English',
                icon: Youtube,
                href: 'https://www.youtube.com',
                color: 'bg-rose-50 text-rose-700',
              },
              {
                label: 'Contact us on instagram',
                sub: 'Follow @billingfast for tips & updates',
                icon: Instagram,
                href: 'https://www.instagram.com',
                color: 'bg-purple-50 text-purple-700',
              },
            ].map((h, i) => {
              const Icon = h.icon;
              return (
                <a
                  key={i}
                  href={h.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.color}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{h.label}</p>
                      <p className="text-[11px] text-slate-400">{h.sub}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
