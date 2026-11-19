import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { LanguageCode } from './i18n/translations';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  signOut,
  onAuthStateChanged,
  serverTimestamp,
  type User,
};

// Startup Firestore Connection Validation (Required by Firebase Skill)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Sanitization helpers to enforce constraints from firebase-blueprint.json
function cleanStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const trimmed = (val ?? '').trim();
  const str = trimmed.length > 0 ? trimmed : fallback;
  return str.slice(0, maxLen);
}

function cleanUrl(val: string | undefined | null, fallback = ''): string {
  const trimmed = (val ?? '').trim();
  if (!trimmed) return fallback;
  // Never persist truncated base64 data URIs that exceed the 500-char Firestore rule limit
  if (trimmed.startsWith('data:') && trimmed.length > 500) {
    return fallback;
  }
  return trimmed.slice(0, 500);
}

function cleanId(id?: string): string {
  const raw = id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

function isPersistedDocId(id?: string): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  return !/^(temp|voice|aiscan|quick|scan_pos|voice_pos)_/.test(trimmed);
}

const verifiedUserDocs = new Set<string>();

export interface InvoiceSettingsConfig {
  paperSize: '2 inch' | '3 inch' | 'A4' | 'A5';
  showLogo: boolean;
  logoSize: number;
  showGst: boolean;
  showFssai: boolean;
  showCustomerGst: boolean;
  showSalesman: boolean;
  printCustomerName: boolean;
  printCustomerPhone: boolean;
  showCustomerMessage: boolean;
  enableCustomHeading: boolean;
  customHeadingText: string;
  template: string;
  language: string;
  fontSize: number;
  leftMargin: number;
  numberOfCopies: string;
  twoBillsPerA4: boolean;
  a4SplitDirection: string;
}

export interface BillingSettingsConfig {
  saveDraftBills: boolean;
  defaultPaymentMode: string;
  autoRoundOff: boolean;
  alwaysShowQr: boolean;
  showPartialPayment: boolean;
  paymentModes: Record<string, boolean>;
  offlineDeliveryCharge: number;
  showExpiredProducts: boolean;
  warnBeforeBillingExpired: boolean;
  autoSwitchPrinterModes: boolean;
  enableSerialNumber: boolean;
  showOutOfStockItems: boolean;
  billBeyondAvailableStock: boolean;
  customerNumberRequired: boolean;
  weightDivisor: number;
  enableCustomerDisplay: boolean;
  defaultPurchaseStatus: string;
  hideGstWhilePurchasing: boolean;
  sendOrderSms: string;
  showProfitWhileBilling: boolean;
  showSerialNoColumn: boolean;
  showMrpColumn: boolean;
  showDiscountColumn: boolean;
  invoiceNumberingMode: 'None' | 'Common Prefix' | 'Per Staff';
  enableTicketing: boolean;
}

export interface OnlineStoreConfig {
  onlineStoreEnabled: boolean;
  showOutOfStock: boolean;
  cashOnDelivery: boolean;
  newOrderAlerts: boolean;
  showLowStockLabel: boolean;
  advancePayment: boolean;
  allowOrderCancellation: boolean;
}

export interface AppConfigPayload {
  invoice: InvoiceSettingsConfig;
  billing: BillingSettingsConfig;
  onlineStore: OnlineStoreConfig;
  showAppTutorials: boolean;
  offlineMode: boolean;
  tourCompleted: boolean;
  aiRequestsToday: number;
  aiRequestDate: string;
}

export const DEFAULT_APP_CONFIG: AppConfigPayload = {
  invoice: {
    paperSize: '3 inch',
    showLogo: true,
    logoSize: 1.0,
    showGst: true,
    showFssai: true,
    showCustomerGst: false,
    showSalesman: false,
    printCustomerName: true,
    printCustomerPhone: true,
    showCustomerMessage: false,
    enableCustomHeading: true,
    customHeadingText: '',
    template: 'Template 1',
    language: 'Hindi',
    fontSize: 7,
    leftMargin: 0,
    numberOfCopies: '1 (Default)',
    twoBillsPerA4: false,
    a4SplitDirection: 'Horizontal (side-by-side)',
  },
  billing: {
    saveDraftBills: true,
    defaultPaymentMode: 'Cash',
    autoRoundOff: false,
    alwaysShowQr: false,
    showPartialPayment: false,
    paymentModes: {
      Cash: true,
      Card: true,
      'Not Paid': true,
      UPI: true,
      Delivery: true,
      Pickup: true,
      Delivered: true,
      Rejected: true,
      Wallet: true,
      'UPI + Cash': true,
      'Card + Cash': true,
      'UPI + Card + Cash': true,
      'UPI + Cash + Credit': true,
      Complementary: true,
    },
    offlineDeliveryCharge: 0,
    showExpiredProducts: true,
    warnBeforeBillingExpired: false,
    autoSwitchPrinterModes: false,
    enableSerialNumber: false,
    showOutOfStockItems: true,
    billBeyondAvailableStock: true,
    customerNumberRequired: false,
    weightDivisor: 1000,
    enableCustomerDisplay: false,
    defaultPurchaseStatus: 'Cash',
    hideGstWhilePurchasing: false,
    sendOrderSms: 'Only Not Paid Orders',
    showProfitWhileBilling: true,
    showSerialNoColumn: true,
    showMrpColumn: false,
    showDiscountColumn: false,
    invoiceNumberingMode: 'None',
    enableTicketing: false,
  },
  onlineStore: {
    onlineStoreEnabled: false,
    showOutOfStock: false,
    cashOnDelivery: true,
    newOrderAlerts: true,
    showLowStockLabel: false,
    advancePayment: false,
    allowOrderCancellation: false,
  },
  showAppTutorials: true,
  offlineMode: false,
  tourCompleted: false,
  aiRequestsToday: 5,
  aiRequestDate: new Date().toISOString().slice(0, 10),
};

export interface UserProfileDoc {
  ownerId: string;
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  fssaiNumber: string;
  logoUrl: string;
  language: LanguageCode;
  config: AppConfigPayload;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StockAdjustmentLog {
  id: string;
  dateStr: string;
  qtyRemoved: number;
  reason: string;
  removedImeis?: string[];
}

export interface ProductVariantItem {
  variantName: string;
  quantity: number;
  barcode: string;
  imeis?: string[];
  mrp: number;
  retailPrice: number;
  wholesalePrice: number;
  purchasePrice: number;
  setAsDefault: boolean;
  includingGst: boolean;
  discountValue: number;
  discountType: '%' | '₹';
  batch: string;
  packOf: number;
  hsn: string;
  gst: number;
  cess: number;
  expiryDate: string;
  lowStockAlert: number;
  rack: string;
}

export interface ProductDoc {
  id: string;
  ownerId: string;
  name: string;
  variantName: string;
  barcode: string;
  unit: string;
  mrp: number;
  retailPrice: number;
  wholesalePrice: number;
  purchasePrice: number;
  quantity: number;
  lowStockAlert: number;
  gst: number;
  cess: number;
  hsn: string;
  rack: string;
  category: string;
  supplierName: string;
  expiryDate: string;
  imageUrl: string;
  archived: boolean;
  variants: ProductVariantItem[];
  bomItems?: { rawMaterialName: string; qtyRequired: number; unit: string }[];
  imeis?: string[];
  imeiPhotoUrls?: string[];
  stockAdjustments?: StockAdjustmentLog[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface OrderLineItem {
  productId: string;
  name: string;
  variantName?: string;
  barcode?: string;
  soldImeis?: string[];
  unit: string;
  qty: number;
  mrp: number;
  retailPrice: number;
  purchasePrice: number;
  gst: number;
  cess: number;
  hsn?: string;
  discount: number;
}

export interface OrderDoc {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  dateStr: string;
  timeStr: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  paymentMode: string;
  priceMode: 'Retail' | 'Wholesale';
  totalMrp: number;
  totalAmount: number;
  paidAmount: number;
  discountAmount: number;
  totalProfit: number;
  itemCount: number;
  items: OrderLineItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PurchaseDoc {
  id: string;
  ownerId: string;
  supplierName: string;
  supplierId: string;
  paymentMode: string;
  dateStr: string;
  totalAmount: number;
  discountAmount: number;
  billImageUrl: string;
  items: OrderLineItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SaleReturnDoc {
  id: string;
  ownerId: string;
  returnNumber: string;
  invoiceNumber: string;
  customerName: string;
  paymentMode: string;
  dateStr: string;
  totalAmount: number;
  items: OrderLineItem[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LedgerEntry {
  id: string;
  dateStr: string;
  timeStr: string;
  type: 'PAYMENT' | 'PURCHASE' | 'SALE' | 'RECEIPT';
  amount: number;
  mode: string;
  notes: string;
}

export interface SupplierDoc {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  gstNumber: string;
  avatarUrl: string;
  balance: number; // Positive = You Will Get, Negative = You Will Give
  ledger: LedgerEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CustomerDoc {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  gstNumber: string;
  avatarUrl: string;
  balance: number; // Positive = You Will Get, Negative = You Will Give
  ledger: LedgerEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ExpenseDoc {
  id: string;
  ownerId: string;
  title: string;
  dateStr: string;
  category: string;
  paymentMethod: string;
  notes: string;
  totalAmount: number;
  items: { name: string; amount: number }[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StaffDoc {
  id: string;
  ownerId: string;
  name: string;
  phone: string;
  role: string;
  salary: number;
  commissionPct: number;
  attendance: { dateStr: string; status: 'Present' | 'Absent' | 'Half Day' }[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Ensure root UserProfile document exists upon login
export async function ensureUserProfile(user: User, customPhone?: string, customShopName?: string): Promise<UserProfileDoc> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      verifiedUserDocs.add(user.uid);
      const data = snap.data();
      let parsedConfig = DEFAULT_APP_CONFIG;
      try {
        if (data.configPayload) {
          parsedConfig = { ...DEFAULT_APP_CONFIG, ...JSON.parse(data.configPayload) };
        }
      } catch {
        parsedConfig = DEFAULT_APP_CONFIG;
      }
      return {
        ownerId: data.ownerId,
        shopName:
          !data.shopName || data.shopName === 'BillingFast'
            ? 'SmartBill CM'
            : data.shopName,
        ownerName: data.ownerName || '',
        phone: data.phone || '+917581030272',
        email: data.email || user.email || '',
        address: data.address || '',
        gstNumber: data.gstNumber || '',
        fssaiNumber: data.fssaiNumber || '',
        logoUrl:
          data.logoUrl ||
          'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png',
        language: (data.language as LanguageCode) || 'en',
        config: parsedConfig,
      };
    } else {
      const defaultLogo =
        'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png';
      const initialProfile = {
        ownerId: user.uid,
        shopName: cleanStr(customShopName || 'SmartBill CM', 120, 'SmartBill CM'),
        ownerName: cleanStr(user.displayName || 'Admin', 120, 'Admin'),
        phone: cleanStr(customPhone || user.phoneNumber || '+917581030272', 30, '+917581030272'),
        email: cleanStr(user.email || '', 150, ''),
        address: '',
        gstNumber: '',
        fssaiNumber: '',
        logoUrl: defaultLogo,
        language: 'en',
        configPayload: JSON.stringify(DEFAULT_APP_CONFIG).slice(0, 15000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(ref, initialProfile);
      verifiedUserDocs.add(user.uid);
      return {
        ownerId: user.uid,
        shopName: initialProfile.shopName,
        ownerName: initialProfile.ownerName,
        phone: initialProfile.phone,
        email: initialProfile.email,
        address: '',
        gstNumber: '',
        fssaiNumber: '',
        logoUrl: defaultLogo,
        language: 'en',
        config: DEFAULT_APP_CONFIG,
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function ensureParentUserDoc(uid: string): Promise<void> {
  if (verifiedUserDocs.has(uid)) return;
  if (auth.currentUser && auth.currentUser.uid === uid) {
    await ensureUserProfile(auth.currentUser);
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfileDoc>): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    let snap = await getDoc(ref);
    if (!snap.exists() && auth.currentUser && auth.currentUser.uid === uid) {
      await ensureUserProfile(auth.currentUser, updates.phone, updates.shopName);
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return;
    const current = snap.data();
    let mergedConfig = DEFAULT_APP_CONFIG;
    try {
      mergedConfig = {
        ...DEFAULT_APP_CONFIG,
        ...(current.configPayload ? JSON.parse(current.configPayload) : {}),
        ...(updates.config || {}),
      };
    } catch {
      mergedConfig = updates.config || DEFAULT_APP_CONFIG;
    }

    const payload = {
      shopName: cleanStr(updates.shopName ?? current.shopName, 120, 'SmartBill CM'),
      ownerName: cleanStr(updates.ownerName ?? current.ownerName, 120, ''),
      phone: cleanStr(updates.phone ?? current.phone, 30, ''),
      email: cleanStr(updates.email ?? current.email, 150, ''),
      address: cleanStr(updates.address ?? current.address, 300, ''),
      gstNumber: cleanStr(updates.gstNumber ?? current.gstNumber, 30, ''),
      fssaiNumber: cleanStr(updates.fssaiNumber ?? current.fssaiNumber, 30, ''),
      logoUrl: cleanUrl(updates.logoUrl ?? current.logoUrl, ''),
      language: updates.language ?? current.language ?? 'en',
      configPayload: JSON.stringify(mergedConfig).slice(0, 15000),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Save or Update Product
export async function saveProductToDb(uid: string, product: Partial<ProductDoc> & { name: string }): Promise<string> {
  const existingRecord = isPersistedDocId(product.id);
  const id = cleanId(existingRecord ? product.id : undefined);
  const path = `users/${uid}/products/${id}`;
  const ref = doc(db, 'users', uid, 'products', id);
  const normalizedVariants = (product.variants || []).map((v) => {
    const cleanVarImeis = Array.from(
      new Set(
        (v.imeis || [])
          .map((c) => String(c || '').trim())
          .filter((c) => c.length > 0)
          .map((c) => c.slice(0, 40))
      )
    );
    return {
      ...v,
      imeis: cleanVarImeis,
    };
  });

  const allVariantImeis = normalizedVariants.flatMap((v) => v.imeis || []);
  const cleanImeis = Array.from(
    new Set(
      [...(product.imeis || []), ...allVariantImeis]
        .map((c) => String(c || '').trim())
        .filter((c) => c.length > 0)
        .map((c) => c.slice(0, 40))
    )
  ).slice(0, 350);

  const cleanImeiPhotos = Array.from(
    new Set(
      (product.imeiPhotoUrls || [])
        .map((u) => cleanUrl(u, ''))
        .filter((u) => u.length > 0)
    )
  ).slice(0, 8);

  const cleanAdjustments = (product.stockAdjustments || []).slice(0, 20);

  // Avoid duplicating large IMEI arrays in both variants[0].imeis and top-level imeis if payload approaches 9800 chars
  let detailsPayload = JSON.stringify({
    variants: normalizedVariants,
    bomItems: product.bomItems || [],
    imeis: cleanImeis,
    imeiPhotoUrls: cleanImeiPhotos,
    stockAdjustments: cleanAdjustments,
  });
  if (detailsPayload.length > 9800) {
    const compactVariants = normalizedVariants.map((v) => ({ ...v, imeis: undefined }));
    detailsPayload = JSON.stringify({
      variants: compactVariants,
      bomItems: product.bomItems || [],
      imeis: cleanImeis,
      imeiPhotoUrls: cleanImeiPhotos,
      stockAdjustments: cleanAdjustments.slice(0, 10),
    });
  }
  if (detailsPayload.length > 9800) {
    const compactVariants = normalizedVariants.map((v) => ({ ...v, imeis: undefined }));
    let maxImeis = cleanImeis.length;
    while (detailsPayload.length > 9800 && maxImeis > 0) {
      maxImeis = Math.max(0, maxImeis - 25);
      detailsPayload = JSON.stringify({
        variants: compactVariants.slice(0, 3),
        bomItems: [],
        imeis: cleanImeis.slice(0, maxImeis),
        imeiPhotoUrls: cleanImeiPhotos.slice(0, 2),
        stockAdjustments: cleanAdjustments.slice(0, 5),
      });
    }
  }

  const primaryBarcode = cleanStr(product.barcode || cleanImeis[0] || '', 64, '');

  const baseFields = {
    name: cleanStr(product.name, 200, 'Unnamed Product'),
    variantName: cleanStr(product.variantName, 120, ''),
    barcode: primaryBarcode,
    unit: cleanStr(product.unit, 32, 'Piece'),
    mrp: Math.max(0, Number(product.mrp) || 0),
    retailPrice: Math.max(0, Number(product.retailPrice) || 0),
    wholesalePrice: Math.max(0, Number(product.wholesalePrice) || 0),
    purchasePrice: Math.max(0, Number(product.purchasePrice) || 0),
    quantity: Number(product.quantity) || 0,
    lowStockAlert: Math.max(0, Number(product.lowStockAlert ?? 5)),
    gst: Math.min(100, Math.max(0, Number(product.gst) || 0)),
    cess: Math.min(100, Math.max(0, Number(product.cess) || 0)),
    hsn: cleanStr(product.hsn, 32, ''),
    rack: cleanStr(product.rack, 64, ''),
    category: cleanStr(product.category, 100, 'General'),
    supplierName: cleanStr(product.supplierName, 120, ''),
    expiryDate: cleanStr(product.expiryDate, 32, ''),
    imageUrl: cleanUrl(product.imageUrl, ''),
    archived: Boolean(product.archived),
    detailsPayload,
    updatedAt: serverTimestamp(),
  };

  try {
    await ensureParentUserDoc(uid);
    if (existingRecord) {
      await updateDoc(ref, baseFields);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingRecord ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteProductFromDb(uid: string, productId: string): Promise<void> {
  const path = `users/${uid}/products/${productId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Create POS Order & Deduct Stock
export async function createOrderInDb(
  uid: string,
  order: Omit<OrderDoc, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  currentProducts: ProductDoc[]
): Promise<string> {
  const id = cleanId();
  const path = `users/${uid}/orders/${id}`;
  const ref = doc(db, 'users', uid, 'orders', id);
  try {
    await ensureParentUserDoc(uid);
    await setDoc(ref, {
      ownerId: uid,
      invoiceNumber: cleanStr(order.invoiceNumber, 64, '1'),
      dateStr: cleanStr(order.dateStr, 32, new Date().toISOString().slice(0, 10)),
      timeStr: cleanStr(order.timeStr, 32, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      customerName: cleanStr(order.customerName, 120, ''),
      customerPhone: cleanStr(order.customerPhone, 30, ''),
      customerId: cleanStr(order.customerId, 128, ''),
      paymentMode: cleanStr(order.paymentMode, 64, 'Cash'),
      priceMode: order.priceMode === 'Wholesale' ? 'Wholesale' : 'Retail',
      totalMrp: Number(order.totalMrp) || 0,
      totalAmount: Number(order.totalAmount) || 0,
      paidAmount: Number(order.paidAmount) || 0,
      discountAmount: Number(order.discountAmount) || 0,
      totalProfit: Number(order.totalProfit) || 0,
      itemCount: Number(order.itemCount) || order.items.length,
      itemsPayload: JSON.stringify(order.items).slice(0, 50000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Deduct sold quantities AND exact sold IMEI(s) from Firebase stock
    // Track per-product mutations locally in case two line items reference the same product
    const workingProducts = new Map<string, ProductDoc>(
      currentProducts.map((p) => [p.id, { ...p }])
    );

    for (const item of order.items) {
      const soldList = (item.soldImeis || [])
        .map((c) => String(c || '').trim())
        .filter(Boolean);
      const soldSetLower = new Set(soldList.map((c) => c.toLowerCase()));

      const allVals = Array.from(workingProducts.values());
      const matched =
        allVals.find((p) => item.productId && p.id === item.productId) ||
        allVals.find(
          (p) =>
            soldList.length > 0 &&
            (p.imeis?.some((im) => soldSetLower.has(im.toLowerCase())) ||
              (p.barcode && soldSetLower.has(p.barcode.toLowerCase())))
        ) ||
        allVals.find(
          (p) =>
            item.barcode &&
            (p.barcode === item.barcode ||
              p.imeis?.some((im) => im.toLowerCase() === item.barcode!.toLowerCase()))
        ) ||
        allVals.find((p) => item.name && p.name.toLowerCase() === item.name.toLowerCase());

      if (matched) {
        const deductQty = Math.max(0, Number(item.qty || 0));
        const remainingImeis = (matched.imeis || []).filter(
          (im) => !soldSetLower.has(im.trim().toLowerCase())
        );

        const updatedVariants = (matched.variants || []).map((v, idx) => {
          const hadVarImeis = Array.isArray(v.imeis) && v.imeis.length > 0;
          const nextVarImeis = hadVarImeis
            ? v.imeis!.filter((im) => !soldSetLower.has(im.trim().toLowerCase()))
            : v.imeis;
          const nextVarBarcode =
            v.barcode && soldSetLower.has(v.barcode.trim().toLowerCase())
              ? (nextVarImeis && nextVarImeis[0]) || remainingImeis[0] || ''
              : v.barcode;
          const nextVarQty =
            hadVarImeis && soldSetLower.size > 0
              ? nextVarImeis!.length
              : idx === 0
                ? Math.max(0, Number(v.quantity || 0) - deductQty)
                : v.quantity;
          return {
            ...v,
            barcode: nextVarBarcode,
            imeis: nextVarImeis,
            quantity: nextVarQty,
          };
        });

        const nextBarcode =
          matched.barcode && soldSetLower.has(matched.barcode.trim().toLowerCase())
            ? remainingImeis[0] || ''
            : matched.barcode || remainingImeis[0] || '';

        const nextQty = Math.max(0, Number(matched.quantity || 0) - deductQty);

        const updatedProduct: ProductDoc = {
          ...matched,
          barcode: nextBarcode,
          quantity: nextQty,
          imeis: remainingImeis,
          variants: updatedVariants,
        };
        workingProducts.set(matched.id, updatedProduct);
        await saveProductToDb(uid, updatedProduct);
      }
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOrderProfitInDb(
  uid: string,
  orderId: string,
  updatedItems: OrderLineItem[],
  newTotalProfit: number
): Promise<void> {
  const path = `users/${uid}/orders/${orderId}`;
  const ref = doc(db, 'users', uid, 'orders', orderId);
  try {
    await updateDoc(ref, {
      itemsPayload: JSON.stringify(updatedItems).slice(0, 50000),
      totalProfit: Number(newTotalProfit) || 0,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Create Purchase & Increment Stock
export async function createPurchaseInDb(
  uid: string,
  purchase: Omit<PurchaseDoc, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  currentProducts: ProductDoc[]
): Promise<string> {
  const id = cleanId();
  const path = `users/${uid}/purchases/${id}`;
  const ref = doc(db, 'users', uid, 'purchases', id);
  try {
    await ensureParentUserDoc(uid);
    await setDoc(ref, {
      ownerId: uid,
      supplierName: cleanStr(purchase.supplierName, 120, ''),
      supplierId: cleanStr(purchase.supplierId, 128, ''),
      paymentMode: cleanStr(purchase.paymentMode, 64, 'Cash'),
      dateStr: cleanStr(purchase.dateStr, 32, new Date().toISOString().slice(0, 10)),
      totalAmount: Number(purchase.totalAmount) || 0,
      discountAmount: Number(purchase.discountAmount) || 0,
      billImageUrl: cleanUrl(purchase.billImageUrl, ''),
      itemsPayload: JSON.stringify(purchase.items).slice(0, 50000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Increment purchased quantities in Firebase stock (or create if scanned/voice item is new)
    for (const item of purchase.items) {
      const matched =
        currentProducts.find((p) => item.productId && p.id === item.productId) ||
        currentProducts.find((p) => item.barcode && p.barcode === item.barcode) ||
        currentProducts.find((p) => item.name && p.name.toLowerCase() === item.name.toLowerCase());
      if (matched) {
        await saveProductToDb(uid, {
          ...matched,
          quantity: Number(matched.quantity || 0) + Number(item.qty || 0),
          purchasePrice: item.purchasePrice || matched.purchasePrice,
        });
      } else if (item.name && (!item.productId || /^(voice|aiscan)_/.test(item.productId))) {
        await saveProductToDb(uid, {
          name: item.name,
          variantName: item.variantName || '',
          barcode: item.barcode || '',
          unit: item.unit || 'Piece',
          mrp: item.mrp || item.retailPrice || item.purchasePrice || 0,
          retailPrice: item.retailPrice || item.mrp || item.purchasePrice || 0,
          purchasePrice: item.purchasePrice || item.retailPrice || 0,
          quantity: Number(item.qty) || 1,
          gst: item.gst || 0,
          cess: item.cess || 0,
          hsn: item.hsn || '',
          archived: false,
        });
      }
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Create Sale Return & Increment Stock
export async function createSaleReturnInDb(
  uid: string,
  ret: Omit<SaleReturnDoc, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
  currentProducts: ProductDoc[]
): Promise<string> {
  const id = cleanId();
  const path = `users/${uid}/returns/${id}`;
  const ref = doc(db, 'users', uid, 'returns', id);
  try {
    await ensureParentUserDoc(uid);
    await setDoc(ref, {
      ownerId: uid,
      returnNumber: cleanStr(ret.returnNumber, 64, 'RET-1'),
      invoiceNumber: cleanStr(ret.invoiceNumber, 64, ''),
      customerName: cleanStr(ret.customerName, 120, ''),
      paymentMode: cleanStr(ret.paymentMode, 64, 'Cash'),
      dateStr: cleanStr(ret.dateStr, 32, new Date().toISOString().slice(0, 10)),
      totalAmount: Number(ret.totalAmount) || 0,
      itemsPayload: JSON.stringify(ret.items).slice(0, 50000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const item of ret.items) {
      const matched =
        currentProducts.find((p) => item.productId && p.id === item.productId) ||
        currentProducts.find((p) => item.barcode && p.barcode === item.barcode) ||
        currentProducts.find((p) => item.name && p.name.toLowerCase() === item.name.toLowerCase());
      if (matched) {
        await saveProductToDb(uid, {
          ...matched,
          quantity: Number(matched.quantity || 0) + Number(item.qty || 0),
        });
      }
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Suppliers CRUD
export async function saveSupplierToDb(
  uid: string,
  supplier: Partial<SupplierDoc> & { name: string; phone: string }
): Promise<string> {
  const existingRecord = isPersistedDocId(supplier.id);
  const id = cleanId(existingRecord ? supplier.id : undefined);
  const path = `users/${uid}/suppliers/${id}`;
  const ref = doc(db, 'users', uid, 'suppliers', id);
  const fields = {
    name: cleanStr(supplier.name, 120, 'Supplier'),
    phone: cleanStr(supplier.phone, 30, '+91'),
    address: cleanStr(supplier.address, 300, ''),
    notes: cleanStr(supplier.notes, 500, ''),
    gstNumber: cleanStr(supplier.gstNumber, 30, ''),
    avatarUrl: cleanUrl(supplier.avatarUrl, ''),
    balance: Number(supplier.balance) || 0,
    ledgerPayload: JSON.stringify(supplier.ledger || []).slice(0, 50000),
    updatedAt: serverTimestamp(),
  };
  try {
    await ensureParentUserDoc(uid);
    if (existingRecord) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...fields,
        createdAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingRecord ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

// Customers CRUD
export async function saveCustomerToDb(
  uid: string,
  customer: Partial<CustomerDoc> & { name: string; phone: string }
): Promise<string> {
  const existingRecord = isPersistedDocId(customer.id);
  const id = cleanId(existingRecord ? customer.id : undefined);
  const path = `users/${uid}/customers/${id}`;
  const ref = doc(db, 'users', uid, 'customers', id);
  const fields = {
    name: cleanStr(customer.name, 120, 'Customer'),
    phone: cleanStr(customer.phone, 30, '+91'),
    address: cleanStr(customer.address, 300, ''),
    notes: cleanStr(customer.notes, 500, ''),
    gstNumber: cleanStr(customer.gstNumber, 30, ''),
    avatarUrl: cleanUrl(customer.avatarUrl, ''),
    balance: Number(customer.balance) || 0,
    ledgerPayload: JSON.stringify(customer.ledger || []).slice(0, 50000),
    updatedAt: serverTimestamp(),
  };
  try {
    await ensureParentUserDoc(uid);
    if (existingRecord) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...fields,
        createdAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingRecord ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

// Expenses CRUD
export async function saveExpenseToDb(
  uid: string,
  expense: Omit<ExpenseDoc, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = cleanId();
  const path = `users/${uid}/expenses/${id}`;
  const ref = doc(db, 'users', uid, 'expenses', id);
  try {
    await ensureParentUserDoc(uid);
    await setDoc(ref, {
      ownerId: uid,
      title: cleanStr(expense.title, 150, 'Expense'),
      dateStr: cleanStr(expense.dateStr, 32, new Date().toISOString().slice(0, 10)),
      category: cleanStr(expense.category, 64, 'Food'),
      paymentMethod: cleanStr(expense.paymentMethod, 32, 'Cash'),
      notes: cleanStr(expense.notes, 500, ''),
      totalAmount: Math.max(0, Number(expense.totalAmount) || 0),
      itemsPayload: JSON.stringify(expense.items || []).slice(0, 20000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// Staff CRUD
export async function saveStaffToDb(
  uid: string,
  staff: Partial<StaffDoc> & { name: string; phone: string }
): Promise<string> {
  const existingRecord = isPersistedDocId(staff.id);
  const id = cleanId(existingRecord ? staff.id : undefined);
  const path = `users/${uid}/staff/${id}`;
  const ref = doc(db, 'users', uid, 'staff', id);
  const fields = {
    name: cleanStr(staff.name, 120, 'Staff'),
    phone: cleanStr(staff.phone, 30, '+91'),
    role: cleanStr(staff.role, 64, 'Salesman'),
    salary: Math.max(0, Number(staff.salary) || 0),
    commissionPct: Math.min(100, Math.max(0, Number(staff.commissionPct) || 0)),
    attendancePayload: JSON.stringify(staff.attendance || []).slice(0, 20000),
    updatedAt: serverTimestamp(),
  };
  try {
    await ensureParentUserDoc(uid);
    if (existingRecord) {
      await updateDoc(ref, fields);
    } else {
      await setDoc(ref, {
        ownerId: uid,
        ...fields,
        createdAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingRecord ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

// Real-time listeners scoped strictly to /users/{uid}/...
export function subscribeToUserData(
  uid: string,
  callbacks: {
    onProfile: (p: UserProfileDoc) => void;
    onProducts: (list: ProductDoc[]) => void;
    onOrders: (list: OrderDoc[]) => void;
    onPurchases: (list: PurchaseDoc[]) => void;
    onReturns: (list: SaleReturnDoc[]) => void;
    onSuppliers: (list: SupplierDoc[]) => void;
    onCustomers: (list: CustomerDoc[]) => void;
    onExpenses: (list: ExpenseDoc[]) => void;
    onStaff: (list: StaffDoc[]) => void;
  }
): () => void {
  const unsubs: (() => void)[] = [];

  const profilePath = `users/${uid}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          let config = DEFAULT_APP_CONFIG;
          try {
            if (d.configPayload) config = { ...DEFAULT_APP_CONFIG, ...JSON.parse(d.configPayload) };
          } catch {
            config = DEFAULT_APP_CONFIG;
          }
          callbacks.onProfile({
            ownerId: d.ownerId,
            shopName:
              !d.shopName || d.shopName === 'BillingFast'
                ? 'SmartBill CM'
                : d.shopName,
            ownerName: d.ownerName || 'Admin',
            phone: d.phone || '+917581030272',
            email: d.email || '',
            address: d.address || '',
            gstNumber: d.gstNumber || '',
            fssaiNumber: d.fssaiNumber || '',
            logoUrl:
              d.logoUrl ||
              'https://res.cloudinary.com/dxeuzdwkz/image/upload/v1794940475/rg7exhm8tuedasgi2ldj.png',
            language: (d.language as LanguageCode) || 'en',
            config,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, profilePath)
    )
  );

  const productsPath = `users/${uid}/products`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'products'), where('ownerId', '==', uid)),
      (snap) => {
        const list: ProductDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let parsedDetails: {
            variants?: ProductVariantItem[];
            bomItems?: ProductDoc['bomItems'];
            imeis?: string[];
            imeiPhotoUrls?: string[];
            stockAdjustments?: StockAdjustmentLog[];
          } = {};
          try {
            if (d.detailsPayload) parsedDetails = JSON.parse(d.detailsPayload);
          } catch {
            parsedDetails = {};
          }
          const topImeis = Array.isArray(parsedDetails.imeis) ? parsedDetails.imeis : [];
          const hydratedVariants = (parsedDetails.variants || []).map((v, idx) => ({
            ...v,
            imeis:
              Array.isArray(v.imeis) && v.imeis.length > 0
                ? v.imeis
                : idx === 0 && topImeis.length > 0
                  ? topImeis
                  : v.barcode
                    ? [v.barcode]
                    : [],
          }));
          const mergedImeis = Array.from(
            new Set([
              ...topImeis,
              ...hydratedVariants.flatMap((v) => v.imeis || []),
            ].filter(Boolean))
          );
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            name: d.name || '',
            variantName: d.variantName || '',
            barcode: d.barcode || '',
            unit: d.unit || 'Piece',
            mrp: Number(d.mrp) || 0,
            retailPrice: Number(d.retailPrice) || 0,
            wholesalePrice: Number(d.wholesalePrice) || 0,
            purchasePrice: Number(d.purchasePrice) || 0,
            quantity: Number(d.quantity) || 0,
            lowStockAlert: Number(d.lowStockAlert ?? 5),
            gst: Number(d.gst) || 0,
            cess: Number(d.cess) || 0,
            hsn: d.hsn || '',
            rack: d.rack || '',
            category: d.category || 'General',
            supplierName: d.supplierName || '',
            expiryDate: d.expiryDate || '',
            imageUrl: d.imageUrl || '',
            archived: Boolean(d.archived),
            variants: hydratedVariants,
            bomItems: parsedDetails.bomItems || [],
            imeis: mergedImeis,
            imeiPhotoUrls: Array.isArray(parsedDetails.imeiPhotoUrls)
              ? parsedDetails.imeiPhotoUrls
              : [],
            stockAdjustments: Array.isArray(parsedDetails.stockAdjustments)
              ? parsedDetails.stockAdjustments
              : [],
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onProducts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, productsPath)
    )
  );

  const ordersPath = `users/${uid}/orders`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'orders'), where('ownerId', '==', uid)),
      (snap) => {
        const list: OrderDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let items: OrderLineItem[] = [];
          try {
            if (d.itemsPayload) items = JSON.parse(d.itemsPayload);
          } catch {
            items = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            invoiceNumber: d.invoiceNumber || '1',
            dateStr: d.dateStr || '',
            timeStr: d.timeStr || '',
            customerName: d.customerName || '',
            customerPhone: d.customerPhone || '',
            customerId: d.customerId || '',
            paymentMode: d.paymentMode || 'Cash',
            priceMode: d.priceMode === 'Wholesale' ? 'Wholesale' : 'Retail',
            totalMrp: Number(d.totalMrp) || 0,
            totalAmount: Number(d.totalAmount) || 0,
            paidAmount: Number(d.paidAmount) || 0,
            discountAmount: Number(d.discountAmount) || 0,
            totalProfit: Number(d.totalProfit) || 0,
            itemCount: Number(d.itemCount) || items.length,
            items,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, ordersPath)
    )
  );

  const purchasesPath = `users/${uid}/purchases`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'purchases'), where('ownerId', '==', uid)),
      (snap) => {
        const list: PurchaseDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let items: OrderLineItem[] = [];
          try {
            if (d.itemsPayload) items = JSON.parse(d.itemsPayload);
          } catch {
            items = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            supplierName: d.supplierName || '',
            supplierId: d.supplierId || '',
            paymentMode: d.paymentMode || 'Cash',
            dateStr: d.dateStr || '',
            totalAmount: Number(d.totalAmount) || 0,
            discountAmount: Number(d.discountAmount) || 0,
            billImageUrl: d.billImageUrl || '',
            items,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onPurchases(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, purchasesPath)
    )
  );

  const returnsPath = `users/${uid}/returns`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'returns'), where('ownerId', '==', uid)),
      (snap) => {
        const list: SaleReturnDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let items: OrderLineItem[] = [];
          try {
            if (d.itemsPayload) items = JSON.parse(d.itemsPayload);
          } catch {
            items = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            returnNumber: d.returnNumber || '1',
            invoiceNumber: d.invoiceNumber || '',
            customerName: d.customerName || '',
            paymentMode: d.paymentMode || 'Cash',
            dateStr: d.dateStr || '',
            totalAmount: Number(d.totalAmount) || 0,
            items,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onReturns(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, returnsPath)
    )
  );

  const suppliersPath = `users/${uid}/suppliers`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'suppliers'), where('ownerId', '==', uid)),
      (snap) => {
        const list: SupplierDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let ledger: LedgerEntry[] = [];
          try {
            if (d.ledgerPayload) ledger = JSON.parse(d.ledgerPayload);
          } catch {
            ledger = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            name: d.name || '',
            phone: d.phone || '',
            address: d.address || '',
            notes: d.notes || '',
            gstNumber: d.gstNumber || '',
            avatarUrl: d.avatarUrl || '',
            balance: Number(d.balance) || 0,
            ledger,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onSuppliers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, suppliersPath)
    )
  );

  const customersPath = `users/${uid}/customers`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'customers'), where('ownerId', '==', uid)),
      (snap) => {
        const list: CustomerDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let ledger: LedgerEntry[] = [];
          try {
            if (d.ledgerPayload) ledger = JSON.parse(d.ledgerPayload);
          } catch {
            ledger = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            name: d.name || '',
            phone: d.phone || '',
            address: d.address || '',
            notes: d.notes || '',
            gstNumber: d.gstNumber || '',
            avatarUrl: d.avatarUrl || '',
            balance: Number(d.balance) || 0,
            ledger,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onCustomers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, customersPath)
    )
  );

  const expensesPath = `users/${uid}/expenses`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'expenses'), where('ownerId', '==', uid)),
      (snap) => {
        const list: ExpenseDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let items: { name: string; amount: number }[] = [];
          try {
            if (d.itemsPayload) items = JSON.parse(d.itemsPayload);
          } catch {
            items = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            title: d.title || '',
            dateStr: d.dateStr || '',
            category: d.category || 'Food',
            paymentMethod: d.paymentMethod || 'Cash',
            notes: d.notes || '',
            totalAmount: Number(d.totalAmount) || 0,
            items,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onExpenses(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, expensesPath)
    )
  );

  const staffPath = `users/${uid}/staff`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'users', uid, 'staff'), where('ownerId', '==', uid)),
      (snap) => {
        const list: StaffDoc[] = snap.docs.map((docSnap) => {
          const d = docSnap.data();
          let attendance: StaffDoc['attendance'] = [];
          try {
            if (d.attendancePayload) attendance = JSON.parse(d.attendancePayload);
          } catch {
            attendance = [];
          }
          return {
            id: docSnap.id,
            ownerId: d.ownerId,
            name: d.name || '',
            phone: d.phone || '',
            role: d.role || 'Salesman',
            salary: Number(d.salary) || 0,
            commissionPct: Number(d.commissionPct) || 0,
            attendance,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          };
        });
        callbacks.onStaff(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, staffPath)
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}
