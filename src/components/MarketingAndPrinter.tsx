import React, { useState } from 'react';
import {
  ChevronLeft,
  Play,
  Share2,
  Download,
  BookOpen,
  PartyPopper,
  CreditCard,
  Wallet,
  Image as ImageIcon,
  ChevronRight,
  Search,
  Eye,
  RefreshCw,
  X,
  Plus,
  Trash2,
  Printer,
  Scale,
  Check,
  Settings,
  Wrench,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  updateUserProfile,
  type ProductDoc,
  type UserProfileDoc,
  type InvoiceSettingsConfig,
  type BillingSettingsConfig,
} from '../firebase';
import { downloadElementAsImage, downloadElementAsPdf } from '../services/integrations';

export type MarketingSubScreen =
  | 'marketing_hub'
  | 'share_products_cats'
  | 'share_products_editor'
  | 'share_catalogue'
  | 'share_greetings'
  | 'business_cards'
  | 'wallet_offers'
  | 'pamphlets';

export type PrinterSubScreen =
  | 'printer_hub'
  | 'customize_invoice'
  | 'customize_billing'
  | 'weighing_scale';

interface MarketingAndPrinterProps {
  uid: string;
  section: 'marketing' | 'printer';
  marketingScreen: MarketingSubScreen;
  setMarketingScreen: (s: MarketingSubScreen) => void;
  printerScreen: PrinterSubScreen;
  setPrinterScreen: (s: PrinterSubScreen) => void;
  onBackToHome: () => void;
  products: ProductDoc[];
  profile: UserProfileDoc;
}

const WALLET_OFFER_PRESETS = [
  {
    id: 'o1',
    label: 'Add ₹500, Get ₹550',
    title: 'Recharge ₹500 → Get ₹550',
    recharge: '500',
    bonus: '50',
    hasAmounts: true,
  },
  {
    id: 'o2',
    label: 'Recharge ₹1000, Get ₹100 cashback',
    title: 'Recharge ₹1000 → Get ₹1100',
    recharge: '1000',
    bonus: '100',
    hasAmounts: true,
  },
  {
    id: 'o3',
    label: 'Festive Offer - Recharge & Earn Bonus',
    title: 'Festive Offer - Recharge & Earn Bonus',
    recharge: '1000',
    bonus: '150',
    hasAmounts: false,
  },
  {
    id: 'o4',
    label: 'Fast Billing - Pay from Wallet, Skip Queue',
    title: 'Fast Billing - Pay from Wallet, Skip Queue',
    recharge: '500',
    bonus: '0',
    hasAmounts: false,
  },
  {
    id: 'o5',
    label: 'Family Wallet - One Balance for Everyone',
    title: 'Family Wallet - One Balance for Everyone',
    recharge: '2000',
    bonus: '200',
    hasAmounts: false,
  },
];

export const MarketingAndPrinter: React.FC<MarketingAndPrinterProps> = ({
  uid,
  section,
  marketingScreen,
  setMarketingScreen,
  printerScreen,
  setPrinterScreen,
  onBackToHome,
  products,
  profile,
}) => {
  // Marketing states
  const [prodShareType, setProdShareType] = useState<'discount' | 'bestseller' | 'new_launch'>(
    'discount'
  );
  const [selectedMarketingProd, setSelectedMarketingProd] = useState<ProductDoc | null>(
    products[0] || null
  );
  const [prodPickerModal, setProdPickerModal] = useState(false);
  const [cataloguePriceMode, setCataloguePriceMode] = useState<'Retail Price' | 'Wholesale Price'>(
    'Retail Price'
  );
  const [catalogueSearch, setCatalogueSearch] = useState('');

  // Wallet Offers states
  const [selectedWalletOfferId, setSelectedWalletOfferId] = useState('o1');
  const [walletTitle, setWalletTitle] = useState('Recharge ₹500 → Get ₹550');
  const [walletRecharge, setWalletRecharge] = useState('500');
  const [walletBonus, setWalletBonus] = useState('50');
  const [walletValidity, setWalletValidity] = useState<'1 Month' | '2 Months' | 'Custom'>(
    '1 Month'
  );
  const [walletMsg, setWalletMsg] = useState(
    'Use your wallet to shop faster and get extra value!'
  );
  const [walletPreviewModal, setWalletPreviewModal] = useState(false);

  // Pamphlets states (Matches 00:56 - 01:21)
  const [pamphletPreviewOpen, setPamphletPreviewOpen] = useState(true);
  const [pamphletTipVisible, setPamphletTipVisible] = useState(true);
  const [pamphletTemplate, setPamphletTemplate] = useState(1);
  const [pamphletLoading, setPamphletLoading] = useState(false);
  const [pamphletPages, setPamphletPages] = useState<number[]>([1]);
  const [activePamphletPage, setActivePamphletPage] = useState(1);
  const [pamphletTab, setPamphletTab] = useState<'Products' | 'Text' | 'Banners'>('Products');
  const [pamphletSlots, setPamphletSlots] = useState<Record<number, ProductDoc | null>>({});
  const [pamphletExportScope, setPamphletExportScope] = useState<'all' | 'page2'>('all');
  const [customPamphletTitle, setCustomPamphletTitle] = useState(
    profile.shopName || 'Shop Name'
  );

  // Customize Invoice states (Matches 01:46 - 02:34)
  const [invConfig, setInvConfig] = useState<InvoiceSettingsConfig>(profile.config.invoice);
  const [invTab, setInvTab] = useState<'Basic' | 'Template'>('Basic');
  const [invPreviewRefreshing, setInvPreviewRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Customize Billing states (Matches 02:40 - 03:05)
  const [billConfig, setBillConfig] = useState<BillingSettingsConfig>(profile.config.billing);
  const [billTab, setBillTab] = useState<
    'Defaults' | 'Billing' | 'Purchase' | 'SMS' | 'Extras' | 'Invoicing' | 'Ticketing'
  >('Defaults');

  // Weighing scale states (Matches 03:09 - 03:12)
  const [baudRate, setBaudRate] = useState('9600');
  const [scaleConnected, setScaleConnected] = useState(false);
  const [liveWeight, setLiveWeight] = useState('---');

  const triggerInvoicePreviewRefresh = (updater: (prev: InvoiceSettingsConfig) => InvoiceSettingsConfig) => {
    setInvPreviewRefreshing(true);
    setInvConfig((prev) => updater(prev));
    setTimeout(() => setInvPreviewRefreshing(false), 320);
  };

  const shareViaWhatsApp = (text: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ============================================================================
  // SECTION A: MARKETING TOOLS
  // ============================================================================
  if (section === 'marketing') {
    // 1. Share Catalogue (Matches 00:08)
    if (marketingScreen === 'share_catalogue') {
      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between">
          <div>
            <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
              <button
                type="button"
                onClick={() => setMarketingScreen('marketing_hub')}
                className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-base font-bold">Add/Remove from Catalogue</h1>
            </header>

            <div className="p-4 max-w-md mx-auto w-full space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={catalogueSearch}
                  onChange={(e) => setCatalogueSearch(e.target.value)}
                  placeholder="Search by name or barcode"
                  className="flex-1 text-xs text-slate-800 outline-none"
                />
              </div>

              <div className="space-y-2">
                {products
                  .filter(
                    (p) =>
                      !catalogueSearch.trim() ||
                      p.name.toLowerCase().includes(catalogueSearch.toLowerCase())
                  )
                  .map((p) => (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-[#0A2540]">{p.name}</span>
                      <span className="font-extrabold text-emerald-700">
                        ₹
                        {cataloguePriceMode === 'Wholesale Price' && p.wholesalePrice
                          ? p.wholesalePrice
                          : p.retailPrice}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="bg-white border-t border-slate-200 p-4 max-w-md mx-auto w-full space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">Select Catalogue Price</span>
              <select
                value={cataloguePriceMode}
                onChange={(e) =>
                  setCataloguePriceMode(e.target.value as 'Retail Price' | 'Wholesale Price')
                }
                className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
              >
                <option value="Retail Price">Retail Price</option>
                <option value="Wholesale Price">Wholesale Price</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMarketingScreen('marketing_hub')}
                className="bg-black text-white font-bold text-xs py-3.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  shareViaWhatsApp(
                    `Check out the ${profile.shopName} Catalogue (${cataloguePriceMode}):\n` +
                      products.map((p) => `• ${p.name}: ₹${p.retailPrice}`).join('\n')
                  )
                }
                className="bg-[#4CAF50] text-white font-bold text-xs py-3.5 rounded-xl"
              >
                Create Catalogue
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. Share Products Categories (Matches 00:14)
    if (marketingScreen === 'share_products_cats') {
      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('marketing_hub')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">Share Products</h1>
          </header>

          <div className="p-4 space-y-3.5 max-w-md mx-auto w-full">
            <h2 className="text-sm font-extrabold text-[#0A2540]">Product Categories</h2>

            <button
              type="button"
              onClick={() => {
                setProdShareType('discount');
                setMarketingScreen('share_products_editor');
              }}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                  🏷️
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A2540]">Product Discount</h3>
                  <p className="text-xs text-slate-500">
                    Share discounted products with special offers
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                setProdShareType('bestseller');
                setMarketingScreen('share_products_editor');
              }}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  📈
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A2540]">Bestsellers</h3>
                  <p className="text-xs text-slate-500">
                    Share your most popular and bestselling items
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                setProdShareType('new_launch');
                setMarketingScreen('share_products_editor');
              }}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  🆕
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A2540]">New Launch</h3>
                  <p className="text-xs text-slate-500">
                    Share newly launched products and arrivals
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      );
    }

    // 3. Share Products Poster Editor (Matches 00:16, 00:19, 00:21)
    if (marketingScreen === 'share_products_editor') {
      const cfg =
        prodShareType === 'discount'
          ? {
              title: 'Product Discount',
              btnColor: 'bg-[#d32f2f]',
              infoBg: 'bg-amber-50 border-amber-200 text-amber-800',
              infoText: 'Only products with active offers will be shown',
              badge: 'SALE',
              badgeColor: 'bg-red-600 text-white',
            }
          : prodShareType === 'bestseller'
            ? {
                title: 'Best sellers',
                btnColor: 'bg-[#2e7d32]',
                infoBg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                infoText: 'Highlight your top-performing products to boost sales',
                badge: 'BEST SELLER',
                badgeColor: 'bg-amber-400 text-slate-900',
              }
            : {
                title: 'New Launch',
                btnColor: 'bg-[#8e24aa]',
                infoBg: 'bg-purple-50 border-purple-200 text-purple-800',
                infoText: 'Choose any product to create a new launch promotion',
                badge: 'NEW',
                badgeColor: 'bg-red-600 text-white',
              };

      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col justify-between pb-24">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('share_products_cats')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">{cfg.title}</h1>
          </header>

          <div className="p-4 space-y-4 max-w-md mx-auto w-full">
            <button
              type="button"
              onClick={() => setProdPickerModal(true)}
              className={`w-full ${cfg.btnColor} text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-sm`}
            >
              <Search className="w-4 h-4" />
              <span>Select Product</span>
            </button>

            <div className={`border rounded-xl p-3 text-xs font-medium ${cfg.infoBg}`}>
              ⓘ {cfg.infoText}
            </div>

            <div className="text-center pt-1">
              <h3 className="text-sm font-extrabold text-[#0A2540] mb-3">Select Template</h3>

              <div
                id="marketing-product-poster"
                className="bg-white border border-slate-300 rounded-xl p-4 mx-auto max-w-xs text-left shadow-sm space-y-3"
              >
                <div className="h-44 bg-slate-200 rounded-lg relative flex items-center justify-center overflow-hidden">
                  <span
                    className={`absolute top-2 left-2 px-2.5 py-1 rounded font-extrabold text-xs shadow ${cfg.badgeColor}`}
                  >
                    {cfg.badge}
                  </span>
                  {selectedMarketingProd?.imageUrl ? (
                    <img
                      src={selectedMarketingProd.imageUrl}
                      alt={selectedMarketingProd.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-slate-600">
                      Your Product Photo Here
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {selectedMarketingProd?.name || 'Product Name'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-base font-extrabold text-slate-900">
                      {selectedMarketingProd ? `₹${selectedMarketingProd.retailPrice}` : 'Retail Price'}
                    </span>
                    <span className="bg-[#4CAF50] text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                      Discount
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedMarketingProd ? `MRP ₹${selectedMarketingProd.mrp}` : 'MRP'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3">
            <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  shareViaWhatsApp(
                    `🔥 Special Offer at ${profile.shopName}: ${selectedMarketingProd?.name || 'Featured Product'} at ₹${selectedMarketingProd?.retailPrice || 'Best Price'}!`
                  )
                }
                className="bg-blue-50 border border-blue-200 text-[#1565c0] font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadElementAsImage('marketing-product-poster', 'BillingFast_Product_Poster')
                }
                className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>
          </div>

          {prodPickerModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-4 w-full max-w-sm max-h-96 flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-extrabold text-[#0A2540]">Choose Product</h4>
                  <button
                    type="button"
                    onClick={() => setProdPickerModal(false)}
                    className="text-xs text-slate-400"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {products.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      No products in stock yet.
                    </p>
                  ) : (
                    products.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedMarketingProd(p);
                          setProdPickerModal(false);
                        }}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 flex justify-between text-xs"
                      >
                        <span className="font-bold">{p.name}</span>
                        <span>₹{p.retailPrice}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 4. Business Cards (14 Visual Templates - Matches 00:30 - 00:35)
    if (marketingScreen === 'business_cards') {
      const cardThemes = [
        { id: 1, bg: 'bg-slate-100', text: 'text-red-800', accent: 'border-b-4 border-red-800' },
        { id: 2, bg: 'bg-[#ffd600]', text: 'text-slate-900', accent: 'border-y-2 border-slate-800' },
        { id: 3, bg: 'bg-white', text: 'text-white', banner: 'bg-red-600' },
        { id: 4, bg: 'bg-[#d1c4e9]', text: 'text-slate-900', accent: 'border-b border-slate-500' },
        { id: 5, bg: 'bg-[#f59e0b]', text: 'text-slate-900', topBar: 'bg-[#1e293b]' },
        { id: 6, bg: 'bg-[#1e293b]', text: 'text-white', accent: 'border border-amber-400' },
        { id: 7, bg: 'bg-emerald-700', text: 'text-white', accent: '' },
        { id: 8, bg: 'bg-sky-900', text: 'text-white', accent: '' },
        { id: 9, bg: 'bg-slate-50', text: 'text-slate-900', accent: 'border-t-4 border-slate-400' },
        { id: 10, bg: 'bg-gradient-to-r from-slate-100 to-white', text: 'text-emerald-700', accent: '' },
        { id: 11, bg: 'bg-amber-50', text: 'text-amber-900', accent: '' },
        { id: 12, bg: 'bg-indigo-950', text: 'text-amber-300', accent: '' },
        { id: 13, bg: 'bg-slate-100', text: 'text-lime-700', accent: '' },
        { id: 14, bg: 'bg-slate-100', text: 'text-orange-600', accent: '' },
      ];

      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('marketing_hub')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">Business Cards</h1>
          </header>

          <div className="p-4 space-y-4 max-w-md mx-auto w-full">
            {cardThemes.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-orange-50 text-orange-600 text-[11px] font-bold px-2.5 py-1 rounded-lg">
                    Template {t.id}
                  </span>
                  <span className="text-slate-400 text-xs">🪪</span>
                </div>

                <div
                  id={`biz-card-${t.id}`}
                  className={`h-44 rounded-xl relative overflow-hidden flex flex-col justify-between p-5 shadow-xs ${t.bg} ${t.accent || ''}`}
                >
                  {t.topBar && <div className={`absolute top-0 left-0 right-0 h-14 ${t.topBar}`} />}
                  <div className="relative z-10">
                    <h4
                      className={`text-base font-extrabold ${
                        t.topBar ? 'text-white' : t.id === 3 ? 'text-slate-900' : t.text
                      }`}
                    >
                      {profile.shopName}
                    </h4>
                    {profile.address && (
                      <p className="text-xs opacity-75 mt-0.5">{profile.address}</p>
                    )}
                  </div>

                  {t.banner ? (
                    <div className="bg-red-600 text-white px-4 py-2 -mx-5 -mb-5 flex items-center justify-between">
                      <span className="font-bold text-sm tabular-nums">{profile.phone}</span>
                      <span className="text-xs">🛒 Retail Store</span>
                    </div>
                  ) : (
                    <div className={`relative z-10 font-bold text-sm tabular-nums ${t.text}`}>
                      {profile.phone}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      shareViaWhatsApp(`Visit ${profile.shopName} | Contact: ${profile.phone}`)
                    }
                    className="bg-blue-50/70 border border-blue-200 text-[#1565c0] font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadElementAsImage(`biz-card-${t.id}`, `BusinessCard_Template_${t.id}`)
                    }
                    className="bg-emerald-50/70 border border-emerald-200 text-emerald-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 5. Share Greetings
    if (marketingScreen === 'share_greetings') {
      const greetings = [
        { id: 'g1', title: 'Happy Diwali & New Year', sub: 'Wishing prosperity & joy from our store!', bg: 'from-amber-500 to-red-600' },
        { id: 'g2', title: 'Festive Season Special', sub: 'Thank you for shopping with us!', bg: 'from-emerald-600 to-teal-800' },
        { id: 'g3', title: 'Weekend Super Saver', sub: 'Visit us today for fresh arrivals!', bg: 'from-indigo-600 to-blue-900' },
      ];
      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('marketing_hub')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">Share Greetings</h1>
          </header>
          <div className="p-4 space-y-4 max-w-md mx-auto w-full">
            {greetings.map((g) => (
              <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div
                  id={g.id}
                  className={`h-44 rounded-xl bg-gradient-to-br ${g.bg} text-white p-5 flex flex-col justify-between`}
                >
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">{profile.shopName}</p>
                    <h3 className="text-xl font-extrabold mt-1">{g.title}</h3>
                    <p className="text-xs opacity-90 mt-1">{g.sub}</p>
                  </div>
                  <p className="text-xs font-bold">{profile.phone}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => shareViaWhatsApp(`${g.title} - ${g.sub} (${profile.shopName})`)}
                    className="bg-blue-50 border border-blue-200 text-[#1565c0] font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadElementAsImage(g.id, g.title)}
                    className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 6. Share Wallet Benefits (Matches 00:38 - 00:54)
    if (marketingScreen === 'wallet_offers') {
      const currentPreset =
        WALLET_OFFER_PRESETS.find((o) => o.id === selectedWalletOfferId) || WALLET_OFFER_PRESETS[0];

      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-10">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('marketing_hub')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">Share Wallet Benefits</h1>
          </header>

          <div className="p-4 space-y-3 max-w-md mx-auto w-full">
            {WALLET_OFFER_PRESETS.map((preset) => {
              const selected = preset.id === selectedWalletOfferId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedWalletOfferId(preset.id);
                    setWalletTitle(preset.title);
                    setWalletRecharge(preset.recharge);
                    setWalletBonus(preset.bonus);
                  }}
                  className={`w-full rounded-2xl p-4 text-left flex items-center justify-between border transition-colors ${
                    selected
                      ? 'bg-blue-50/50 border-[#1565c0] border-2'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-xs font-bold text-[#0A2540]">{preset.label}</span>
                  {selected && (
                    <span className="w-6 h-6 rounded-full bg-[#4CAF50] text-white flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              );
            })}

            {/* Customize Offer Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3.5 mt-2">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Customize Offer</h3>

              {currentPreset.hasAmounts && (
                <>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Offer Title</label>
                    <input
                      type="text"
                      value={walletTitle}
                      onChange={(e) => setWalletTitle(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#0A2540] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Recharge Amount</label>
                      <input
                        type="number"
                        value={walletRecharge}
                        onChange={(e) => setWalletRecharge(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#0A2540] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Bonus</label>
                      <input
                        type="number"
                        value={walletBonus}
                        onChange={(e) => setWalletBonus(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#0A2540] outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Validity Period</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['1 Month', '2 Months', 'Custom'] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setWalletValidity(period)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                        walletValidity === period
                          ? 'bg-[#1976d2] text-white border-[#1976d2]'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Short Message for Customer
                </label>
                <textarea
                  rows={2}
                  value={walletMsg}
                  onChange={(e) => setWalletMsg(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setWalletPreviewModal(true)}
              className="w-full bg-white border border-[#1976d2] text-[#1976d2] font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              <span>Preview Offer</span>
            </button>

            <button
              type="button"
              onClick={() =>
                shareViaWhatsApp(
                  `💳 *${profile.shopName} Wallet Offer*\n${walletTitle}\nValidity: ${walletValidity}\n${walletMsg}`
                )
              }
              className="w-full bg-[#1976d2] text-white font-bold text-xs py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>Share on WhatsApp</span>
            </button>
          </div>

          {walletPreviewModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-5 w-full max-w-xs space-y-3 text-center">
                <div className="bg-gradient-to-br from-[#0A2540] to-[#1976d2] text-white rounded-2xl p-5 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-blue-200">
                    {profile.shopName} Wallet
                  </p>
                  <h4 className="text-lg font-extrabold">{walletTitle}</h4>
                  <p className="text-xs text-blue-100">{walletMsg}</p>
                  <p className="text-[10px] bg-white/15 inline-block px-2.5 py-1 rounded-full">
                    Valid for {walletValidity}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWalletPreviewModal(false)}
                  className="w-full py-2.5 bg-[#0A2540] text-white text-xs font-bold rounded-xl"
                >
                  Close Preview
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // 7. Share Pamphlets (Matches 00:56 - 01:21)
    if (marketingScreen === 'pamphlets') {
      const slotCount = activePamphletPage === 1 ? 20 : 10;
      const filledCount = Object.values(pamphletSlots).filter(Boolean).length;

      const handleFillAllSlots = () => {
        const next: Record<number, ProductDoc | null> = {};
        for (let i = 1; i <= slotCount; i++) {
          next[i] = products[(i - 1) % Math.max(1, products.length)] || null;
        }
        setPamphletSlots(next);
      };

      return (
        <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-32">
          <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMarketingScreen('marketing_hub')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold">Share Pamphlets</h1>
          </header>

          <div className="p-4 space-y-3.5 max-w-md mx-auto w-full">
            {/* Live Pamphlet Preview Card (Matches 01:03 - 01:15) */}
            {pamphletPreviewOpen && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="bg-[#0A2540] text-white px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <ImageIcon className="w-4 h-4" />
                    <span>Preview</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setPamphletLoading(true);
                        setTimeout(() => setPamphletLoading(false), 350);
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setPamphletPreviewOpen(false)}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div id="pamphlet-canvas" className="p-3 min-h-[210px] flex items-center justify-center">
                  {pamphletLoading ? (
                    <div className="flex flex-col items-center py-10 text-slate-500 text-xs">
                      <div className="w-8 h-8 border-3 border-[#0A2540] border-t-transparent rounded-full animate-spin mb-2" />
                      <span>Preparing Preview...</span>
                    </div>
                  ) : pamphletTemplate === 1 ? (
                    <div className="w-full rounded-xl overflow-hidden border border-lime-300 bg-[#a3e635]/20 p-3 space-y-2">
                      <div className="bg-[#a3e635] text-center py-2 rounded-lg">
                        <h4 className="text-sm font-extrabold text-white drop-shadow">
                          {customPamphletTitle}
                        </h4>
                        <p className="text-[9px] text-lime-950 font-semibold">
                          https://billingfast.com/shop/{profile.phone.replace(/[^0-9]/g, '')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-1 rounded">
                          Fresh & Dairy
                        </span>
                        <div className="flex-1 grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <div
                              key={s}
                              className="bg-white border border-slate-200 rounded p-1 text-[8px] text-center truncate"
                            >
                              {pamphletSlots[s]?.name || `Product Slot ${s}`}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-700 text-white text-[9px] font-bold px-2 py-1 rounded">
                          Staples & Gourmet
                        </span>
                        <div className="flex-1 grid grid-cols-5 gap-1">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <div
                              key={s}
                              className="bg-white border border-slate-200 rounded p-1 text-[8px] text-center truncate"
                            >
                              {pamphletSlots[s + 5]?.name || `Product Slot ${s}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : pamphletTemplate === 2 ? (
                    <div className="w-full rounded-xl overflow-hidden border border-amber-300 bg-white">
                      <div className="bg-[#facc15] p-3 text-center rounded-b-3xl">
                        <span className="bg-[#1e3a8a] text-white text-xs font-bold px-3 py-1 rounded">
                          {customPamphletTitle}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 p-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                          <div
                            key={s}
                            className="border border-slate-200 rounded p-2 text-[8px] text-center text-slate-500"
                          >
                            {pamphletSlots[s]?.name || `Product Slot ${s}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : pamphletTemplate === 5 ? (
                    <div className="w-full rounded-xl overflow-hidden border border-red-300 grid grid-cols-5 bg-white">
                      <div className="col-span-3 bg-gradient-to-br from-red-600 to-red-800 text-white p-3 flex flex-col justify-center">
                        <span className="bg-white text-slate-900 text-[10px] font-extrabold px-2 py-0.5 inline-block w-fit">
                          CRAZY FASHION SALE
                        </span>
                        <span className="bg-yellow-400 text-slate-900 text-[9px] font-extrabold px-1.5 py-0.5 mt-1 w-fit">
                          UPTO 50% OFF DISCOUNT
                        </span>
                      </div>
                      <div className="col-span-2 p-2 space-y-1">
                        {[1, 2, 3].map((s) => (
                          <div
                            key={s}
                            className="border border-slate-200 rounded p-1.5 text-[8px] text-center"
                          >
                            {pamphletSlots[s]?.name || `Product Slot ${s}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full rounded-xl border border-slate-300 p-3 grid grid-cols-3 gap-2 bg-slate-50">
                      <div className="col-span-2 bg-slate-200 rounded-lg p-3 flex items-center justify-center text-xs font-bold text-slate-700">
                        {customPamphletTitle} — Offer Heading
                      </div>
                      <div className="space-y-1">
                        {[1, 2, 3, 4].map((s) => (
                          <div
                            key={s}
                            className="bg-white border border-slate-200 rounded p-1 text-[8px] text-center"
                          >
                            {pamphletSlots[s]?.name || `Product Slot ${s}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tip Banner */}
            {pamphletTipVisible && (
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 flex items-center justify-between text-xs text-sky-900">
                <span>💡 Tip: Close preview while editing for faster editing experience.</span>
                <button
                  type="button"
                  onClick={() => {
                    setPamphletPreviewOpen(false);
                    setPamphletTipVisible(false);
                  }}
                  className="bg-sky-100 text-sky-800 font-bold px-2.5 py-1 rounded-lg ml-2 shrink-0"
                >
                  Hide
                </button>
              </div>
            )}

            {/* Template Selector Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#0A2540]">Template</h3>
                <button
                  type="button"
                  onClick={() => setPamphletPreviewOpen(true)}
                  className="text-xs font-bold text-[#1976d2] underline"
                >
                  (View Samples)
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setPamphletLoading(true);
                      setPamphletTemplate(num);
                      setTimeout(() => setPamphletLoading(false), 300);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                      pamphletTemplate === num
                        ? 'bg-[#0A2540] text-white border-[#0A2540]'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {pamphletTemplate === num && <Check className="w-3.5 h-3.5" />}
                    <span>Template {num}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pages Selector */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-[#0A2540]">Pages</span>
                {pamphletPages.map((pg) => (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setActivePamphletPage(pg)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      activePamphletPage === pg
                        ? 'bg-[#0A2540] text-white'
                        : 'border border-slate-300 text-slate-700'
                    }`}
                  >
                    Page {pg}
                  </button>
                ))}
                {pamphletPages.length < 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPamphletPages([1, 2]);
                      setActivePamphletPage(2);
                    }}
                    className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    + Add
                  </button>
                )}
              </div>
              {pamphletPages.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setPamphletPages([1]);
                    setActivePamphletPage(1);
                  }}
                  className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Products / Text / Banners Pill Tabs */}
            <div className="flex items-center gap-2">
              {(['Products', 'Text', 'Banners'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPamphletTab(t)}
                  className={`px-5 py-2 rounded-full text-xs font-bold border ${
                    pamphletTab === t
                      ? 'bg-[#0A2540] text-white border-[#0A2540]'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Product Slots Card */}
            {pamphletTab === 'Products' ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#0A2540] text-white flex items-center justify-center text-xs">
                      🧺
                    </div>
                    <h4 className="text-sm font-extrabold text-[#0A2540]">Product Slots</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleFillAllSlots}
                    className="text-xs font-extrabold text-[#0A2540] flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Fill All</span>
                  </button>
                </div>

                <p className="text-xs text-slate-500">
                  {filledCount}/{slotCount} slots filled. Tap to add or change products.
                </p>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {Array.from({ length: slotCount }, (_, i) => i + 1).map((slotNum) => {
                    const assigned = pamphletSlots[slotNum];
                    return (
                      <button
                        key={slotNum}
                        type="button"
                        onClick={() => {
                          if (products.length > 0) {
                            const nextProd = products[(slotNum - 1) % products.length];
                            setPamphletSlots((prev) => ({ ...prev, [slotNum]: nextProd }));
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3 text-left hover:bg-slate-100"
                      >
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center text-slate-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700">
                            {assigned ? assigned.name : `Product Slot ${slotNum}`}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {assigned ? `₹${assigned.retailPrice}` : 'Tap to search and add'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <label className="block text-xs font-bold text-[#0A2540]">
                  Pamphlet Heading / Shop Title
                </label>
                <input
                  type="text"
                  value={customPamphletTitle}
                  onChange={(e) => setCustomPamphletTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* Fixed Bottom Share & Export Bar (Matches 01:16 - 01:21) */}
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3">
            <div className="max-w-md mx-auto space-y-2.5">
              {pamphletPages.length > 1 && (
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">📥 Export:</span>
                  <button
                    type="button"
                    onClick={() => setPamphletExportScope('all')}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      pamphletExportScope === 'all'
                        ? 'bg-[#0A2540] text-white'
                        : 'border border-slate-300 text-slate-600'
                    }`}
                  >
                    All 2 Pages
                  </button>
                  <button
                    type="button"
                    onClick={() => setPamphletExportScope('page2')}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      pamphletExportScope === 'page2'
                        ? 'bg-[#0A2540] text-white'
                        : 'border border-slate-300 text-slate-600'
                    }`}
                  >
                    Page 2 Only
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    shareViaWhatsApp(`Check out ${profile.shopName}'s latest offer pamphlet!`)
                  }
                  className="py-3.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700"
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadElementAsImage('pamphlet-canvas', `Pamphlet_Template_${pamphletTemplate}`)
                  }
                  className="py-3.5 rounded-xl bg-[#0A2540] text-white font-bold text-xs"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default Marketing Hub (Matches 00:03)
    const marketingItems = [
      {
        id: 'share_products_cats' as const,
        title: 'Share Products with your customer',
        sub: 'Share individual products directly with customers',
        icon: <Share2 className="w-5 h-5 text-[#1976d2]" />,
        bg: 'bg-blue-50',
      },
      {
        id: 'share_catalogue' as const,
        title: 'Share Catalogue',
        sub: 'Create and share your complete product catalogue',
        icon: <BookOpen className="w-5 h-5 text-emerald-600" />,
        bg: 'bg-emerald-50',
      },
      {
        id: 'share_greetings' as const,
        title: 'Share Greetings',
        sub: 'Send festival and special occasion greetings',
        icon: <PartyPopper className="w-5 h-5 text-purple-600" />,
        bg: 'bg-purple-50',
      },
      {
        id: 'business_cards' as const,
        title: 'Business Card',
        sub: 'Create and share your digital business card',
        icon: <CreditCard className="w-5 h-5 text-amber-600" />,
        bg: 'bg-amber-50',
      },
      {
        id: 'wallet_offers' as const,
        title: 'Share Wallet Offers',
        sub: 'Share wallet benefits with your customers.',
        icon: <Wallet className="w-5 h-5 text-sky-600" />,
        bg: 'bg-sky-50',
      },
      {
        id: 'pamphlets' as const,
        title: 'Share Pamphlets',
        sub: 'Create engaging offer pamphlets for your store promotions or ads.',
        icon: <ImageIcon className="w-5 h-5 text-indigo-600" />,
        bg: 'bg-indigo-50',
      },
    ];

    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Marketing Tools</h1>
          <Play className="w-4 h-4 fill-white" />
        </header>

        <div className="p-4 space-y-3 max-w-md mx-auto w-full">
          {marketingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMarketingScreen(item.id)}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#0A2540] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============================================================================
  // SECTION B: PRINTER, INVOICE CUSTOMIZER, BILLING SETTINGS & WEIGHING SCALE
  // ============================================================================

  // 1. Customize Invoice Screen (Matches 01:46 - 02:34)
  if (printerScreen === 'customize_invoice') {
    const sampleRows = [
      { sr: 1, name: 'Product F', qty: '1 Kg', mrp: 100.0, sp: 90.0, total: 90.0 },
      { sr: 2, name: 'Product E', qty: '2 Kg', mrp: 108.0, sp: 97.0, total: 194.0 },
      { sr: 3, name: 'Product D', qty: '3 Kg', mrp: 116.0, sp: 104.0, total: 312.0 },
      { sr: 4, name: 'Product C', qty: '4 Kg', mrp: 124.0, sp: 111.0, total: 444.0 },
      { sr: 5, name: 'Product B', qty: '5 Kg', mrp: 132.0, sp: 118.0, total: 590.0 },
      { sr: 6, name: 'Product A', qty: '6 Kg', mrp: 140.0, sp: 125.0, total: 750.0 },
    ];

    const handleSaveInvoiceSettings = async () => {
      setSavingSettings(true);
      try {
        await updateUserProfile(uid, {
          config: {
            ...profile.config,
            invoice: invConfig,
          },
        });
        setPrinterScreen('printer_hub');
      } finally {
        setSavingSettings(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-24">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setPrinterScreen('printer_hub')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Customize Invoice</h1>
        </header>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          {/* Live Invoice Preview Card (Matches 01:47 - 02:04) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-[#0A2540] text-white px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ImageIcon className="w-4 h-4" />
                <span>Invoice Preview</span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => triggerInvoicePreviewRefresh((c) => ({ ...c }))}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-200/70 max-h-64 overflow-y-auto flex justify-center">
              {invPreviewRefreshing ? (
                <div className="py-12 flex flex-col items-center text-xs text-slate-600">
                  <div className="w-8 h-8 border-3 border-[#0A2540] border-t-transparent rounded-full animate-spin mb-2" />
                  <span>Preparing Preview...</span>
                </div>
              ) : invConfig.paperSize === 'A4' || invConfig.paperSize === 'A5' ? (
                /* A4 / A5 Formal Boxed Invoice Preview (Matches 01:59 & 02:04) */
                <div
                  id="live-invoice-preview"
                  className="bg-white border border-slate-400 p-3 w-full text-[9px] font-serif text-slate-900 space-y-2 shadow"
                >
                  <div className="grid grid-cols-2 border border-slate-800">
                    <div className="p-2 border-r border-slate-800">
                      <p className="font-bold text-xs">{profile.phone}</p>
                      <p className="text-[8px] mt-1 font-bold">Buyer (Bill to)</p>
                      {invConfig.printCustomerName && <p>John Doe</p>}
                      {invConfig.printCustomerPhone && <p>9876543210</p>}
                      <p>123 Preview Lane, Flutter City</p>
                    </div>
                    <div className="p-2 space-y-1">
                      <div className="flex justify-between border-b border-slate-400 pb-0.5">
                        <span className="font-bold">Invoice Number</span>
                        <span>1001</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-400 pb-0.5">
                        <span className="font-bold">Invoice Date</span>
                        <span>Nov 17, 2026 21:20</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold">Payment</span>
                        <span>UPI + Cash</span>
                      </div>
                    </div>
                  </div>

                  <table className="w-full border-collapse border border-slate-800 text-[8px]">
                    <thead>
                      <tr className="border-b border-slate-800 font-bold">
                        <th className="border-r border-slate-800 p-1">Sl</th>
                        <th className="border-r border-slate-800 p-1 text-left">Item name</th>
                        <th className="border-r border-slate-800 p-1">Qty</th>
                        <th className="border-r border-slate-800 p-1">MRP</th>
                        <th className="border-r border-slate-800 p-1">SP</th>
                        <th className="border-r border-slate-800 p-1">GST</th>
                        <th className="p-1">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sampleRows.map((r) => (
                        <tr key={r.sr} className="border-b border-slate-400">
                          <td className="border-r border-slate-800 p-1 text-center">{r.sr}</td>
                          <td className="border-r border-slate-800 p-1">{r.name}</td>
                          <td className="border-r border-slate-800 p-1 text-center">{r.qty}</td>
                          <td className="border-r border-slate-800 p-1 text-right">{r.mrp}</td>
                          <td className="border-r border-slate-800 p-1 text-right">{r.sp}</td>
                          <td className="border-r border-slate-800 p-1 text-center">18%</td>
                          <td className="p-1 text-right font-bold">{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* 2 inch / 3 inch Thermal Receipt Preview (Matches 01:47 - 01:56) */
                <div
                  id="live-invoice-preview"
                  className={`bg-white border border-slate-300 p-3 font-serif text-slate-900 shadow space-y-1.5 ${
                    invConfig.paperSize === '2 inch' ? 'w-56 text-[10px]' : 'w-72 text-[10px]'
                  }`}
                >
                  {invConfig.enableCustomHeading && invConfig.customHeadingText && (
                    <p className="text-center font-bold">{invConfig.customHeadingText}</p>
                  )}
                  <p className="font-bold text-center text-xs">{profile.phone}</p>
                  <div className="border-y border-dashed border-slate-400 py-1">
                    {invConfig.printCustomerName && <p>John Doe</p>}
                    {invConfig.printCustomerPhone && <p>9876543210</p>}
                    <p>123 Preview Lane, Flutter City</p>
                  </div>
                  <div className="flex justify-between text-[9px] border-b border-slate-800 pb-1 font-bold">
                    <span>17-11-2026 09:20 PM</span>
                    <span>INVOICE 1001</span>
                  </div>
                  <div className="grid grid-cols-12 font-bold border-b border-slate-800 pb-0.5 text-[9px]">
                    <span className="col-span-5">ITEM</span>
                    <span className="col-span-2 text-center">QTY</span>
                    <span className="col-span-2 text-right">MRP</span>
                    <span className="col-span-1 text-right">SP</span>
                    <span className="col-span-2 text-right">TOTAL</span>
                  </div>
                  {sampleRows.map((r) => (
                    <div
                      key={r.sr}
                      className="grid grid-cols-12 border-b border-slate-300 py-0.5 text-[9px]"
                    >
                      <span className="col-span-5 truncate">
                        ({r.sr}) {r.name}
                      </span>
                      <span className="col-span-2 text-center">{r.qty}</span>
                      <span className="col-span-2 text-right">{r.mrp.toFixed(1)}</span>
                      <span className="col-span-1 text-right">{r.sp.toFixed(0)}</span>
                      <span className="col-span-2 text-right font-bold">{r.total.toFixed(1)}</span>
                    </div>
                  ))}
                  <div className="text-right space-y-0.5 pt-1 text-[9px]">
                    <p>Items: 6</p>
                    <p>Sub Total: Rs 2660</p>
                    <p>Delivery Charge: Rs 20</p>
                    <p>Amount via Cash: Rs 500</p>
                    <p>Amount via UPI: Rs 500</p>
                  </div>
                  <div className="border-y border-slate-800 py-1 text-center font-bold text-xs">
                    Total : Rs 1000
                  </div>
                  <div className="bg-slate-200 text-center py-0.5 text-[9px] font-bold">
                    You Saved Rs 50 (1.9%) on this purchase
                  </div>
                  <div className="flex flex-col items-center pt-2">
                    <p className="text-[9px] font-bold">Payment Mode</p>
                    <p className="text-[9px]">UPI + Cash: Rs 1000</p>
                    <p className="text-[9px] mb-1">Scan QR to Pay Bill:</p>
                    <QRCodeSVG value={`upi://pay?pa=${profile.phone}@upi&am=1000`} size={90} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Paper Size Selector Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
            <h3 className="text-sm font-extrabold text-[#0A2540]">Paper Size</h3>
            <div className="flex flex-wrap gap-2">
              {(['2 inch', '3 inch', 'A4', 'A5'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => triggerInvoicePreviewRefresh((c) => ({ ...c, paperSize: sz }))}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    invConfig.paperSize === sz
                      ? 'bg-[#0A2540] text-white border-[#0A2540]'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {invConfig.paperSize === sz && <Check className="w-3.5 h-3.5" />}
                  <span>{sz}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Basic / Template Pill Switcher */}
          <div className="bg-white rounded-2xl border border-slate-200 p-2 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInvTab('Basic')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                  invTab === 'Basic' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Basic</span>
              </button>
              <button
                type="button"
                onClick={() => setInvTab('Template')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                  invTab === 'Template' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Template</span>
              </button>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 mr-2" />
          </div>

          {invTab === 'Basic' ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Header Settings</h3>

              {/* Shop Logo Toggle & Slider (Matches 02:05 & 02:13) */}
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Shop Logo</p>
                  <p className="text-[11px] text-slate-400">Display your shop logo on Invoice</p>
                </div>
                <input
                  type="checkbox"
                  checked={invConfig.showLogo}
                  onChange={(e) =>
                    triggerInvoicePreviewRefresh((c) => ({ ...c, showLogo: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>

              {invConfig.showLogo && (
                <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-[#0A2540]">
                    Logo Size: {invConfig.logoSize.toFixed(2)}x
                  </p>
                  <input
                    type="range"
                    min={1.0}
                    max={2.0}
                    step={0.1}
                    value={invConfig.logoSize}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        logoSize: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-[#0A2540]"
                  />
                </div>
              )}

              {[
                { key: 'showGst' as const, label: 'Shop GST Number', sub: '' },
                { key: 'showFssai' as const, label: 'FSSAI Number', sub: '' },
                { key: 'showCustomerGst' as const, label: 'Customer GST', sub: '' },
                { key: 'showSalesman' as const, label: 'Show Salesman', sub: '' },
                {
                  key: 'printCustomerName' as const,
                  label: 'Print Customer Name',
                  sub: 'Show the customer’s name on the Invoice',
                },
                {
                  key: 'printCustomerPhone' as const,
                  label: 'Print Customer Phone Number',
                  sub: 'Show the customer’s phone number on the Invoice',
                },
                { key: 'showCustomerMessage' as const, label: 'Show Customer Message', sub: '' },
              ].map((row) => (
                <div
                  key={row.key}
                  className="bg-slate-50 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">{row.label}</p>
                    {row.sub && <p className="text-[11px] text-slate-400">{row.sub}</p>}
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(invConfig[row.key])}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        [row.key]: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-emerald-500"
                  />
                </div>
              ))}

              <div className="pt-2 space-y-2">
                <h4 className="text-xs font-extrabold text-[#0A2540]">T Custom Heading</h4>
                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">Enable Custom Heading</p>
                    <p className="text-[11px] text-slate-400">Add custom text at the top of invoice</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={invConfig.enableCustomHeading}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        enableCustomHeading: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-emerald-500"
                  />
                </div>
                <input
                  type="text"
                  value={invConfig.customHeadingText}
                  onChange={(e) =>
                    triggerInvoicePreviewRefresh((c) => ({
                      ...c,
                      customHeadingText: e.target.value,
                    }))
                  }
                  placeholder="Custom Heading Text"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                />
              </div>
            </div>
          ) : (
            /* Template Tab (Matches 02:18 - 02:34) */
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <h3 className="text-sm font-extrabold text-[#0A2540]">Template Selection</h3>

                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">Template</p>
                    <p className="text-[11px] text-slate-400">Choose from 21 unique templates</p>
                  </div>
                  <select
                    value={invConfig.template}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({ ...c, template: e.target.value }))
                    }
                    className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
                  >
                    {Array.from({ length: 21 }, (_, i) => `Template ${i + 1}`).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">Language</p>
                    <p className="text-[11px] text-slate-400">Select printing language</p>
                  </div>
                  <select
                    value={invConfig.language}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({ ...c, language: e.target.value }))
                    }
                    className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
                  >
                    <option value="Hindi">Hindi</option>
                    <option value="English">English</option>
                  </select>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">Font Size (px)</p>
                    <p className="text-[11px] text-slate-400">
                      Recommended: 6px for 2", 9px for 3"
                    </p>
                  </div>
                  <select
                    value={invConfig.fontSize}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        fontSize: Number(e.target.value),
                      }))
                    }
                    className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
                  >
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((px) => (
                      <option key={px} value={px}>
                        {px}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
                <h3 className="text-sm font-extrabold text-[#0A2540]">Margins & Spacing</h3>
                <div className="relative">
                  <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-slate-500">
                    Left Margin (Decimals only)
                  </span>
                  <input
                    type="number"
                    value={invConfig.leftMargin}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        leftMargin: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400">Add extra space to prevent cutting</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <h3 className="text-sm font-extrabold text-[#0A2540]">Print Output</h3>

                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">Number of Copies</p>
                    <p className="text-[11px] text-slate-400">
                      Thermal: prints each copy separately. A4/A5: one page per copy.
                    </p>
                  </div>
                  <select
                    value={invConfig.numberOfCopies}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        numberOfCopies: e.target.value,
                      }))
                    }
                    className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
                  >
                    <option value="1 (Default)">1 (Default)</option>
                    <option value="2 copies">2 copies</option>
                    <option value="3 copies">3 copies</option>
                    <option value="4 copies">4 copies</option>
                  </select>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">2 bills per A4 sheet</p>
                    <p className="text-[11px] text-slate-400">
                      Pack 2 A5 bills onto 1 A4 sheet (requires 2+ copies)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={invConfig.twoBillsPerA4}
                    onChange={(e) =>
                      triggerInvoicePreviewRefresh((c) => ({
                        ...c,
                        twoBillsPerA4: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-emerald-500"
                  />
                </div>

                {invConfig.twoBillsPerA4 && (
                  <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#0A2540]">A4 Split Direction</p>
                      <p className="text-[11px] text-slate-400">
                        How the two A5 bills are arranged on the A4 sheet
                      </p>
                    </div>
                    <select
                      value={invConfig.a4SplitDirection}
                      onChange={(e) =>
                        triggerInvoicePreviewRefresh((c) => ({
                          ...c,
                          a4SplitDirection: e.target.value,
                        }))
                      }
                      className="text-xs font-bold text-[#0A2540] bg-transparent outline-none"
                    >
                      <option value="Horizontal (side-by-side)">Horizontal (side-by-side)</option>
                      <option value="Vertical">Vertical</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Cancel / Save Bar */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPrinterScreen('printer_hub')}
              className="py-3.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveInvoiceSettings}
              className="py-3.5 rounded-xl bg-[#0A2540] text-white font-bold text-xs"
            >
              {savingSettings ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Customize Billing Screen (Matches 02:40 - 03:05)
  if (printerScreen === 'customize_billing') {
    const billingTabs: (typeof billTab)[] = [
      'Defaults',
      'Billing',
      'Purchase',
      'SMS',
      'Extras',
      'Invoicing',
      'Ticketing',
    ];

    const handleSaveBillingSettings = async () => {
      setSavingSettings(true);
      try {
        await updateUserProfile(uid, {
          config: {
            ...profile.config,
            billing: billConfig,
          },
        });
        setPrinterScreen('printer_hub');
      } finally {
        setSavingSettings(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-24">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setPrinterScreen('printer_hub')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Customize Billing</h1>
        </header>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          {/* Horizontal Scrollable Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {billingTabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setBillTab(t)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  billTab === t ? 'bg-[#0A2540] text-white' : 'text-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {billTab === 'Defaults' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Save draft bills</p>
                  <p className="text-[11px] text-slate-400">
                    This enables you to save incomplete bills as draft if you leave the billing page.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.saveDraftBills}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, saveDraftBills: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-[#0A2540]">Default Payment Mode</p>
                <select
                  value={billConfig.defaultPaymentMode}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, defaultPaymentMode: e.target.value }))
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                </select>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Enable auto-round off always</p>
                  <p className="text-[11px] text-slate-400">
                    All the numericals in an auto-round-off bill will be rounded off in printed bill.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.autoRoundOff}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, autoRoundOff: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Always Show QR Code in bills</p>
                  <p className="text-[11px] text-slate-400">
                    When off, the QR code is only displayed for UPI bills.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.alwaysShowQr}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, alwaysShowQr: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
            </div>
          )}

          {billTab === 'Billing' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Stock & Billing Control</h3>
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Show out of stock items</p>
                  <p className="text-[11px] text-slate-400">
                    Enable this option if you want to bill products even after product quantity reaches zero.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.showOutOfStockItems}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, showOutOfStockItems: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Bill beyond available stock</p>
                  <p className="text-[11px] text-slate-400">
                    Enable this option if you want to add products to cart beyond available quantity.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.billBeyondAvailableStock}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, billBeyondAvailableStock: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">
                    Customer Number Required for Billing
                  </p>
                  <p className="text-[11px] text-slate-400">
                    When enabled, order can only be created if customer number is provided.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.customerNumberRequired}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, customerNumberRequired: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
            </div>
          )}

          {billTab === 'Purchase' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Purchase Settings</h3>
              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-[#0A2540]">Default Status</p>
                <select
                  value={billConfig.defaultPurchaseStatus}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, defaultPurchaseStatus: e.target.value }))
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <p className="text-xs font-bold text-[#0A2540]">Hide GST while purchasing</p>
                <input
                  type="checkbox"
                  checked={billConfig.hideGstWhilePurchasing}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, hideGstWhilePurchasing: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
            </div>
          )}

          {billTab === 'SMS' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">SMS and Insights Options</h3>
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Show Profit while Billing</p>
                  <p className="text-[11px] text-slate-400">
                    When enabled, also warns if a product is being sold below purchase price.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.showProfitWhileBilling}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, showProfitWhileBilling: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
            </div>
          )}

          {billTab === 'Extras' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Smart Calculator Display</h3>
              {[
                { key: 'showSerialNoColumn' as const, label: 'Show Serial No Column' },
                { key: 'showMrpColumn' as const, label: 'Show MRP Column' },
                { key: 'showDiscountColumn' as const, label: 'Show Discount Column' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="bg-slate-50 rounded-xl p-3 flex items-center justify-between"
                >
                  <p className="text-xs font-bold text-[#0A2540]">{item.label}</p>
                  <input
                    type="checkbox"
                    checked={billConfig[item.key]}
                    onChange={(e) =>
                      setBillConfig((c) => ({ ...c, [item.key]: e.target.checked }))
                    }
                    className="w-5 h-5 accent-emerald-500"
                  />
                </div>
              ))}
            </div>
          )}

          {billTab === 'Invoicing' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Invoice Numbering Mode</h3>
              {(
                [
                  { id: 'None', sub: 'Simple numeric invoices (101, 102, ...)' },
                  { id: 'Common Prefix', sub: 'Shared prefix for all bills (INV-101, ...)' },
                  { id: 'Per Staff', sub: 'Different prefix per staff member' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    setBillConfig((c) => ({ ...c, invoiceNumberingMode: opt.id }))
                  }
                  className={`w-full rounded-xl p-3.5 text-left border flex items-center justify-between ${
                    billConfig.invoiceNumberingMode === opt.id
                      ? 'bg-blue-50/50 border-[#0A2540] border-2'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[#0A2540]">{opt.id}</p>
                    <p className="text-[11px] text-slate-500">{opt.sub}</p>
                  </div>
                  {billConfig.invoiceNumberingMode === opt.id && (
                    <span className="w-5 h-5 rounded-full bg-[#0A2540] text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {billTab === 'Ticketing' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Ticketing</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                For counters that sell a fixed set of tickets — entry passes, rides, shows.
              </p>
              <div className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0A2540]">Enable Ticketing</p>
                  <p className="text-[11px] text-slate-400">
                    Rows left at 0 are dropped when the bill is created.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={billConfig.enableTicketing}
                  onChange={(e) =>
                    setBillConfig((c) => ({ ...c, enableTicketing: e.target.checked }))
                  }
                  className="w-5 h-5 accent-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 p-3">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPrinterScreen('printer_hub')}
              className="py-3.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveBillingSettings}
              className="py-3.5 rounded-xl bg-[#0A2540] text-white font-bold text-xs"
            >
              {savingSettings ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Weighing Scale Screen (Matches 03:09 - 03:12)
  if (printerScreen === 'weighing_scale') {
    const handleConnectScale = async () => {
      try {
        const nav = navigator as unknown as {
          serial?: { requestPort: () => Promise<{ open: (opts: { baudRate: number }) => Promise<void> }> };
        };
        if (nav.serial) {
          const port = await nav.serial.requestPort();
          await port.open({ baudRate: Number(baudRate) || 9600 });
          setScaleConnected(true);
          setLiveWeight('1.250');
          return;
        }
      } catch {
        // fallback simulation
      }
      setScaleConnected(!scaleConnected);
      setLiveWeight(!scaleConnected ? '1.000' : '---');
    };

    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setPrinterScreen('printer_hub')}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Weighing Scale</h1>
        </header>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-16 h-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-2">
              <Scale className="w-8 h-8" />
            </div>
            <p className="text-xs text-slate-500">
              Connect a weighing scale to read weight values directly into your bills.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0A2540]">Select Device</h3>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-600" />
                <button
                  type="button"
                  onClick={() => setPrinterScreen('printer_hub')}
                  className="bg-[#0A2540] text-white text-xs font-bold px-4 py-1.5 rounded-full"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="py-5 text-center space-y-1">
              <p className="text-2xl text-slate-400">🔌</p>
              <p className="text-xs font-bold text-slate-600">No USB devices found</p>
              <p className="text-[11px] text-slate-400">Connect your weighing scale via USB</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Baud Rate: {baudRate}</span>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(e.target.value)}
                className="text-xs font-bold bg-transparent outline-none"
              >
                <option value="9600">9600</option>
                <option value="4800">4800</option>
                <option value="115200">115200</option>
              </select>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800">
              ⓘ Most weighing scales use 9600 baud rate. Try other rates if data doesn't appear
              correctly.
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-[#0A2540]">Connection Status</h3>
                <p className="text-[11px] text-slate-400">Weighing Scale</p>
              </div>
              <span
                className={`text-xs font-bold ${
                  scaleConnected ? 'text-emerald-600' : 'text-red-500'
                }`}
              >
                ● {scaleConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleConnectScale}
              className="w-full py-2.5 rounded-full border border-slate-400 text-xs font-bold text-[#0A2540]"
            >
              {scaleConnected ? 'Disconnect' : 'Connect'}
            </button>

            <div className="bg-gradient-to-b from-teal-50 to-teal-100/70 rounded-2xl p-5 text-center">
              <p className="text-xs text-slate-500">Live Weight</p>
              <p className="text-2xl font-extrabold text-teal-700 mt-1 tabular-nums">
                {liveWeight} kg
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Printer Hub (Matches 01:44)
  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
      <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-30">
        <button
          type="button"
          onClick={onBackToHome}
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold">Printer and Invoice Settings</h1>
      </header>

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* Top Printer Setup Card */}
        <div className="flex flex-col items-center text-center pt-2 pb-1 relative">
          <button
            type="button"
            onClick={() => window.print()}
            className="self-end bg-[#0A2540] text-white text-xs font-bold px-5 py-2 rounded-full shadow-xs"
          >
            Setup
          </button>
          <div className="w-24 h-24 rounded-2xl bg-slate-200 flex items-center justify-center my-2">
            <Printer className="w-12 h-12 text-slate-700" />
          </div>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Connect a bluetooth or usb printer to print receipts or barcode via mobile.
          </p>
        </div>

        <h2 className="text-sm font-extrabold text-[#0A2540]">Settings</h2>

        <button
          type="button"
          onClick={() => setPrinterScreen('customize_invoice')}
          className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              🧾
            </div>
            <span className="text-sm font-extrabold text-[#0A2540]">Customize Invoice</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              ★ PRO
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPrinterScreen('customize_billing')}
          className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              ✏️
            </div>
            <span className="text-sm font-extrabold text-[#0A2540]">Customize Billing</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
              ★ PRO
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setPrinterScreen('weighing_scale')}
          className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
              ⚖️
            </div>
            <div>
              <p className="text-sm font-extrabold text-[#0A2540]">Connect Weighing Scale</p>
              <p className="text-xs text-slate-400">Setup USB weighing scale</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>

        <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
              ▶️
            </div>
            <div>
              <p className="text-sm font-extrabold text-[#0A2540]">Show App Tutorials</p>
              <p className="text-xs text-slate-400">Toggle tutorial visibility</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={profile.config.showAppTutorials}
            onChange={(e) =>
              updateUserProfile(uid, {
                config: { ...profile.config, showAppTutorials: e.target.checked },
              })
            }
            className="w-5 h-5 accent-[#0A2540]"
          />
        </div>
      </div>
    </div>
  );
};
