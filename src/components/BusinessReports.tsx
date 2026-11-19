import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  FileSpreadsheet,
  Clock,
  Truck,
  X,
} from 'lucide-react';
import {
  updateOrderProfitInDb,
  type ProductDoc,
  type OrderDoc,
  type PurchaseDoc,
  type SaleReturnDoc,
  type SupplierDoc,
  type CustomerDoc,
  type ExpenseDoc,
  type StaffDoc,
} from '../firebase';
import { exportReportTableToExcel } from '../services/integrations';

interface BusinessReportsProps {
  uid: string;
  products: ProductDoc[];
  orders: OrderDoc[];
  purchases: PurchaseDoc[];
  returns: SaleReturnDoc[];
  suppliers: SupplierDoc[];
  customers: CustomerDoc[];
  expenses: ExpenseDoc[];
  staff: StaffDoc[];
  onBack: () => void;
}

type ReportCategoryKey =
  | 'transaction'
  | 'sales'
  | 'inventory'
  | 'tax'
  | 'customer'
  | 'purchase'
  | 'attendance';

interface ReportDefinition {
  id: string;
  title: string;
  category: ReportCategoryKey;
  specialScreen?: 'select_staff' | 'shop_timeline' | 'select_supplier' | 'stock_balance_summary';
}

const REPORT_CATEGORIES: {
  key: ReportCategoryKey;
  title: string;
  reports: ReportDefinition[];
}[] = [
  {
    key: 'transaction',
    title: 'Transaction Summary (4)',
    reports: [
      { id: 'day_book', title: 'Day Book Summary', category: 'transaction' },
      { id: 'cash_flow', title: 'Cash Flow Summary', category: 'transaction' },
      { id: 'day_book_items', title: 'Day Book Items Summary', category: 'transaction' },
      { id: 'opening_closing', title: 'Opening and Closing Balance', category: 'transaction' },
    ],
  },
  {
    key: 'sales',
    title: 'Sales Reports (7)',
    reports: [
      { id: 'sales_summary', title: 'Sales Summary', category: 'sales' },
      { id: 'returns_exchange', title: 'Returns & Exchange Summary', category: 'sales' },
      { id: 'stock_sales', title: 'Stock Sales Summary', category: 'sales' },
      {
        id: 'sales_by_staff',
        title: 'Sales Summary by Staff',
        category: 'sales',
        specialScreen: 'select_staff',
      },
      {
        id: 'sales_by_timeline',
        title: 'Sales Summary by Timeline',
        category: 'sales',
        specialScreen: 'shop_timeline',
      },
      { id: 'due_summary', title: 'Due Summary', category: 'sales' },
      {
        id: 'stock_sales_by_supplier',
        title: 'Stock Sales Summary by Supplier',
        category: 'sales',
        specialScreen: 'select_supplier',
      },
    ],
  },
  {
    key: 'inventory',
    title: 'Inventory Reports (15)',
    reports: [
      { id: 'inv_stock_sales', title: 'Stock Sales Summary', category: 'inventory' },
      { id: 'stock_summary', title: 'Stock Summary', category: 'inventory' },
      {
        id: 'stock_balance_summary',
        title: 'Stock Balance Summary',
        category: 'inventory',
        specialScreen: 'stock_balance_summary',
      },
      { id: 'stock_balance_category', title: 'Stock Balance by Category', category: 'inventory' },
      { id: 'stock_balance_supplier', title: 'Stock Balance by Supplier', category: 'inventory' },
      { id: 'low_stock', title: 'Low Stock Summary', category: 'inventory' },
      { id: 'out_of_stock', title: 'Out of Stock Summary', category: 'inventory' },
      { id: 'expired_stock', title: 'Expired Stock Summary', category: 'inventory' },
      { id: 'expiring_products', title: 'Expiring Products', category: 'inventory' },
      { id: 'loss_summary', title: 'Loss Summary', category: 'inventory' },
      { id: 'restock_summary', title: 'Restock Summary', category: 'inventory' },
      { id: 'expense_summary', title: 'Expense Summary', category: 'inventory' },
      { id: 'manufacture_summary', title: 'Manufacture Summary', category: 'inventory' },
      { id: 'material_usage', title: 'Material Usage Summary', category: 'inventory' },
      { id: 'stock_transfer', title: 'Stock Transfer Summary', category: 'inventory' },
    ],
  },
  {
    key: 'tax',
    title: 'Tax Reports (3)',
    reports: [
      { id: 'tax_summary', title: 'Tax Summary', category: 'tax' },
      { id: 'detailed_tax', title: 'Detailed Tax Summary', category: 'tax' },
      { id: 'gstr1', title: 'GSTR1 Summary', category: 'tax' },
    ],
  },
  {
    key: 'customer',
    title: 'Customer Reports (4)',
    reports: [
      { id: 'customer_summary', title: 'Customer Summary', category: 'customer' },
      { id: 'customer_ledger_rep', title: 'Customer Ledger Summary', category: 'customer' },
      { id: 'customer_stock_sales', title: 'Customer Stock Sales Summary', category: 'customer' },
      {
        id: 'customer_per_stock',
        title: 'Customer Summary per Stock Sale',
        category: 'customer',
      },
    ],
  },
  {
    key: 'purchase',
    title: 'Purchase Reports (3)',
    reports: [
      { id: 'purchase_summary', title: 'Purchase Summary', category: 'purchase' },
      { id: 'supplier_ledger_rep', title: 'Supplier Ledger Summary', category: 'purchase' },
      { id: 'purchase_by_supplier', title: 'Purchase Summary by Supplier', category: 'purchase' },
    ],
  },
  {
    key: 'attendance',
    title: 'Attendance Reports (2)',
    reports: [
      { id: 'attendance_summary', title: 'Attendance Summary', category: 'attendance' },
      { id: 'salary_summary', title: 'Salary Summary', category: 'attendance' },
    ],
  },
];

export const BusinessReports: React.FC<BusinessReportsProps> = ({
  uid,
  products,
  orders,
  purchases,
  returns,
  suppliers,
  customers,
  expenses,
  staff,
  onBack,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    transaction: true,
    sales: true,
    inventory: true,
    tax: false,
    customer: false,
    purchase: false,
    attendance: false,
  });

  const [chartRange, setChartRange] = useState<'7d' | '30d'>('7d');
  const [preparingReport, setPreparingReport] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<ReportDefinition | null>(null);

  // Filters inside active report
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [colFilter1, setColFilter1] = useState('');
  const [colFilter2, setColFilter2] = useState('');

  // Special intermediate selectors
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  // Shop Timeline State (Sales Summary by Timeline)
  const [openHour, setOpenHour] = useState(9);
  const [openMinute, setOpenMinute] = useState(0);
  const [openPeriod, setOpenPeriod] = useState<'AM' | 'PM'>('AM');
  const [closeHour, setCloseHour] = useState(9);
  const [closeMinute, setCloseMinute] = useState(0);
  const [closePeriod, setClosePeriod] = useState<'AM' | 'PM'>('PM');
  const [closesNextDay, setClosesNextDay] = useState(false);
  const [timelineGenerated, setTimelineGenerated] = useState(false);

  // Analog Clock Modal State
  const [clockTarget, setClockTarget] = useState<'open' | 'close' | null>(null);
  const [clockStep, setClockStep] = useState<'hour' | 'minute'>('hour');

  // Sales Summary Invoice Profit Edit Modal
  const [editingOrder, setEditingOrder] = useState<OrderDoc | null>(null);
  const [editedCostMap, setEditedCostMap] = useState<Record<number, string>>({});
  const [savingOrderCost, setSavingOrderCost] = useState(false);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openReport = (report: ReportDefinition) => {
    setPreparingReport(report.title);
    setSearchQuery('');
    setColFilter1('');
    setColFilter2('');
    setTimelineGenerated(false);
    setSelectedStaffId(null);
    setSelectedSupplierId(null);
    setTimeout(() => {
      setPreparingReport(null);
      setActiveReport(report);
    }, 300);
  };

  // Compute last 7 or 30 days Sales Performance chart points
  const chartData = useMemo(() => {
    const daysCount = chartRange === '30d' ? 30 : 7;
    const points: { label: string; dateStr: string; amount: number }[] = [];
    const now = new Date();
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const isoPrefix = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const daySales = orders
        .filter((o) => (o.dateStr || '').startsWith(isoPrefix))
        .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
      points.push({ label, dateStr: isoPrefix, amount: daySales });
    }
    return points;
  }, [orders, chartRange]);

  const maxChartVal = Math.max(...chartData.map((p) => p.amount), 100);

  // Operating duration calculation for Shop Timeline
  const to24Hour = (h: number, m: number, period: 'AM' | 'PM') => {
    let hr = h % 12;
    if (period === 'PM') hr += 12;
    return hr * 60 + m;
  };

  const operatingDurationText = useMemo(() => {
    const startMins = to24Hour(openHour, openMinute, openPeriod);
    let endMins = to24Hour(closeHour, closeMinute, closePeriod);
    if (closesNextDay || endMins <= startMins) {
      endMins += 24 * 60;
    }
    const diff = Math.max(0, endMins - startMins);
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hrs} hours ${mins > 0 ? `${mins} mins` : ''}`.trim();
  }, [openHour, openMinute, openPeriod, closeHour, closeMinute, closePeriod, closesNextDay]);

  // Open Invoice # bottom sheet in Sales Summary
  const handleSelectOrderForProfit = (order: OrderDoc) => {
    const map: Record<number, string> = {};
    (order.items || []).forEach((item, idx) => {
      map[idx] = String(item.purchasePrice || 0);
    });
    setEditedCostMap(map);
    setEditingOrder(order);
  };

  const handleSaveOrderProfit = async () => {
    if (!editingOrder || !editingOrder.id) return;
    setSavingOrderCost(true);
    try {
      const updatedItems = (editingOrder.items || []).map((it, idx) => ({
        ...it,
        purchasePrice: Number(editedCostMap[idx] ?? it.purchasePrice ?? 0),
      }));
      const totalCost = updatedItems.reduce(
        (sum, it) => sum + (Number(it.purchasePrice) || 0) * (Number(it.qty) || 1),
        0
      );
      const newProfit = (Number(editingOrder.totalAmount) || 0) - totalCost;
      await updateOrderProfitInDb(uid, editingOrder.id, updatedItems, newProfit);
      setEditingOrder(null);
    } catch (err) {
      console.error('Failed to update order profit:', err);
    } finally {
      setSavingOrderCost(false);
    }
  };

  // Build dynamic table rows and columns for any active report
  const { columns, rows, summaryBadges } = useMemo<{
    columns: string[];
    rows: Record<string, any>[];
    summaryBadges: { label: string; value: string }[];
  }>(() => {
    if (!activeReport) {
      return { columns: [], rows: [], summaryBadges: [] };
    }

    const parseFlexibleDate = (dateStr?: string): Date | null => {
      if (!dateStr) return null;
      const trimmed = dateStr.trim();
      const dmy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})/);
      if (dmy) {
        return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}T00:00:00`);
      }
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const filterByDate = (dateStr?: string) => {
      if (dateFilter === 'all' || !dateStr) return true;
      const itemDate = parseFlexibleDate(dateStr);
      if (!itemDate) return true;
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const itemIso = itemDate.toISOString().slice(0, 10);
      if (dateFilter === 'today') {
        return itemIso === todayIso;
      }
      const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
      if (dateFilter === '7d') return diffDays >= -1 && diffDays <= 7;
      if (dateFilter === '30d') return diffDays >= -1 && diffDays <= 30;
      return true;
    };

    const id = activeReport.id;

    if (id === 'sales_summary' || id === 'sales_by_staff' || id === 'sales_by_timeline') {
      let filteredOrders = orders.filter((o) => filterByDate(o.dateStr));
      if (id === 'sales_by_staff' && selectedStaffId) {
        if (selectedStaffId === 'OWNER') {
          filteredOrders = filteredOrders.filter((o) => {
            const staffLabel = (o as OrderDoc & { staffName?: string }).staffName;
            return !staffLabel || staffLabel.toLowerCase() === 'owner';
          });
        } else {
          filteredOrders = filteredOrders.filter((o) => {
            const staffLabel = (o as OrderDoc & { staffName?: string }).staffName || '';
            return staffLabel.toLowerCase() === selectedStaffId.toLowerCase();
          });
        }
      }
      if (id === 'sales_by_timeline' && timelineGenerated) {
        const startMins = to24Hour(openHour, openMinute, openPeriod);
        const endMins = to24Hour(closeHour, closeMinute, closePeriod);
        filteredOrders = filteredOrders.filter((o) => {
          let mins: number | null = null;
          if (o.createdAt && typeof o.createdAt.toDate === 'function') {
            const d = o.createdAt.toDate();
            mins = d.getHours() * 60 + d.getMinutes();
          } else if (o.timeStr) {
            const m = o.timeStr.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
            if (m) {
              let hr = Number(m[1]);
              const mn = Number(m[2]);
              const mer = m[3]?.toUpperCase();
              if (mer === 'PM' && hr < 12) hr += 12;
              if (mer === 'AM' && hr === 12) hr = 0;
              mins = hr * 60 + mn;
            }
          }
          if (mins === null) return true;
          if (closesNextDay || endMins <= startMins) {
            return mins >= startMins || mins <= endMins;
          }
          return mins >= startMins && mins <= endMins;
        });
      }
      const cols = ['Invoice', 'Date', 'Customer', 'Mode', 'Amount', 'Profit'];
      const r = filteredOrders.map((o) => ({
        _rawOrder: o,
        Invoice: o.invoiceNumber,
        Date: o.dateStr,
        Customer: o.customerName || 'Walk-in',
        Mode: o.paymentMode,
        Amount: `₹${Number(o.totalAmount || 0).toFixed(2)}`,
        Profit: `₹${Number(o.totalProfit || 0).toFixed(2)}`,
      }));
      const totalSales = filteredOrders.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
      const totalProfit = filteredOrders.reduce((s, o) => s + (Number(o.totalProfit) || 0), 0);
      return {
        columns: cols,
        rows: r,
        summaryBadges: [
          { label: 'Total Bills', value: String(filteredOrders.length) },
          { label: 'Total Sales', value: `₹${totalSales.toFixed(0)}` },
          { label: 'Total Profit', value: `₹${totalProfit.toFixed(0)}` },
        ],
      };
    }

    if (id === 'day_book' || id === 'cash_flow' || id === 'opening_closing') {
      const cols = ['Date', 'Particulars', 'Type', 'Mode', 'In (₹)', 'Out (₹)'];
      const combined: Record<string, any>[] = [];
      orders
        .filter((o) => filterByDate(o.dateStr))
        .forEach((o) => {
          combined.push({
            Date: o.dateStr,
            Particulars: `Sale #${o.invoiceNumber}`,
            Type: 'Sale',
            Mode: o.paymentMode,
            'In (₹)': Number(o.paidAmount || o.totalAmount || 0).toFixed(2),
            'Out (₹)': '0.00',
          });
        });
      purchases
        .filter((p) => filterByDate(p.dateStr))
        .forEach((p) => {
          combined.push({
            Date: p.dateStr,
            Particulars: `Purchase (${p.supplierName || 'Supplier'})`,
            Type: 'Purchase',
            Mode: p.paymentMode,
            'In (₹)': '0.00',
            'Out (₹)': Number(p.totalAmount || 0).toFixed(2),
          });
        });
      expenses
        .filter((e) => filterByDate(e.dateStr))
        .forEach((e) => {
          combined.push({
            Date: e.dateStr,
            Particulars: e.title,
            Type: 'Expense',
            Mode: e.paymentMethod,
            'In (₹)': '0.00',
            'Out (₹)': Number(e.totalAmount || 0).toFixed(2),
          });
        });
      const totalIn = combined.reduce((s, x) => s + Number(x['In (₹)'] || 0), 0);
      const totalOut = combined.reduce((s, x) => s + Number(x['Out (₹)'] || 0), 0);
      return {
        columns: cols,
        rows: combined,
        summaryBadges: [
          { label: 'Total In', value: `₹${totalIn.toFixed(0)}` },
          { label: 'Total Out', value: `₹${totalOut.toFixed(0)}` },
          { label: 'Net Balance', value: `₹${(totalIn - totalOut).toFixed(0)}` },
        ],
      };
    }

    if (
      id === 'day_book_items' ||
      id === 'stock_sales' ||
      id === 'inv_stock_sales' ||
      id === 'stock_sales_by_supplier'
    ) {
      const cols = ['Item Name', 'Qty Sold', 'Selling Price', 'Total Sales', 'Profit'];
      const map: Record<
        string,
        { name: string; qty: number; price: number; sales: number; profit: number }
      > = {};
      const supplierItemKeys =
        id === 'stock_sales_by_supplier' && selectedSupplierId
          ? new Set(
              purchases
                .filter(
                  (p) =>
                    p.supplierId === selectedSupplierId ||
                    (p.supplierName || '').toLowerCase() === selectedSupplierId.toLowerCase()
                )
                .flatMap((p) => (p.items || []).map((it) => (it.productId || it.name).toLowerCase()))
            )
          : null;

      orders
        .filter((o) => filterByDate(o.dateStr))
        .forEach((o) => {
          (o.items || []).forEach((it) => {
            const key = it.productId || it.name;
            if (
              supplierItemKeys &&
              !supplierItemKeys.has((it.productId || '').toLowerCase()) &&
              !supplierItemKeys.has((it.name || '').toLowerCase())
            ) {
              return;
            }
            if (!map[key]) {
              map[key] = { name: it.name, qty: 0, price: it.retailPrice, sales: 0, profit: 0 };
            }
            const q = Number(it.qty || 0);
            const sp = Number(it.retailPrice || 0);
            const cp = Number(it.purchasePrice || 0);
            map[key].qty += q;
            map[key].sales += q * sp;
            map[key].profit += (sp - cp) * q;
          });
        });
      const r = Object.values(map).map((m) => ({
        'Item Name': m.name,
        'Qty Sold': m.qty,
        'Selling Price': `₹${m.price.toFixed(2)}`,
        'Total Sales': `₹${m.sales.toFixed(2)}`,
        Profit: `₹${m.profit.toFixed(2)}`,
      }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Unique Items Sold', value: String(r.length) }],
      };
    }

    if (id === 'returns_exchange') {
      const cols = ['Return #', 'Date', 'Customer', 'Items', 'Mode', 'Refund Amount'];
      const r = returns
        .filter((ret) => filterByDate(ret.dateStr))
        .map((ret) => ({
          'Return #': ret.returnNumber,
          Date: ret.dateStr,
          Customer: ret.customerName || 'Walk-in',
          Items: (ret.items || []).length,
          Mode: ret.paymentMode,
          'Refund Amount': `₹${Number(ret.totalAmount || 0).toFixed(2)}`,
        }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Total Returns', value: String(r.length) }],
      };
    }

    if (id === 'due_summary') {
      const dueOrders = orders.filter(
        (o) => Number(o.totalAmount || 0) - Number(o.paidAmount || 0) > 0
      );
      const cols = ['Invoice', 'Customer', 'Phone', 'Bill Amount', 'Paid', 'Due Amount'];
      const r = dueOrders.map((o) => {
        const due = Math.max(0, Number(o.totalAmount || 0) - Number(o.paidAmount || 0));
        return {
          Invoice: o.invoiceNumber,
          Customer: o.customerName || 'Walk-in Customer',
          Phone: o.customerPhone || '-',
          'Bill Amount': `₹${Number(o.totalAmount || 0).toFixed(2)}`,
          Paid: `₹${Number(o.paidAmount || 0).toFixed(2)}`,
          'Due Amount': `₹${due.toFixed(2)}`,
        };
      });
      const totalDue = dueOrders.reduce(
        (s, o) => s + Math.max(0, Number(o.totalAmount || 0) - Number(o.paidAmount || 0)),
        0
      );
      return {
        columns: cols,
        rows: r,
        summaryBadges: [
          { label: 'Due Bills', value: String(dueOrders.length) },
          { label: 'Total Due', value: `₹${totalDue.toFixed(0)}` },
        ],
      };
    }

    if (
      id === 'stock_summary' ||
      id === 'stock_balance_summary' ||
      id === 'stock_balance_category' ||
      id === 'stock_balance_supplier' ||
      id === 'low_stock' ||
      id === 'out_of_stock' ||
      id === 'expired_stock' ||
      id === 'expiring_products' ||
      id === 'restock_summary'
    ) {
      let list = [...products];
      if (id === 'low_stock' || id === 'restock_summary') {
        list = list.filter((p) => p.quantity <= (p.lowStockAlert || 5));
      } else if (id === 'out_of_stock') {
        list = list.filter((p) => p.quantity <= 0);
      } else if (id === 'expired_stock') {
        const nowStr = new Date().toISOString().slice(0, 10);
        list = list.filter((p) => p.expiryDate && p.expiryDate < nowStr);
      } else if (id === 'expiring_products') {
        const now = new Date();
        const nowStr = now.toISOString().slice(0, 10);
        const soon = new Date(now);
        soon.setDate(now.getDate() + 30);
        const soonStr = soon.toISOString().slice(0, 10);
        list = list.filter((p) => p.expiryDate && p.expiryDate >= nowStr && p.expiryDate <= soonStr);
      }
      const cols = [
        'Product Name',
        'Category',
        'Qty',
        'Purchase Price',
        'Selling Price',
        'Stock Value',
      ];
      const r = list.map((p) => ({
        'Product Name': p.name,
        Category: p.category || 'General',
        Qty: `${p.quantity} ${p.unit || 'Piece'}`,
        'Purchase Price': `₹${Number(p.purchasePrice || 0).toFixed(2)}`,
        'Selling Price': `₹${Number(p.retailPrice || 0).toFixed(2)}`,
        'Stock Value': `₹${(Number(p.quantity || 0) * Number(p.retailPrice || 0)).toFixed(2)}`,
      }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Products Count', value: String(r.length) }],
      };
    }

    if (id === 'expense_summary') {
      const cols = ['Date', 'Expense Title', 'Category', 'Payment Mode', 'Amount'];
      const filteredExpenses = expenses.filter((e) => filterByDate(e.dateStr));
      const r = filteredExpenses.map((e) => ({
        Date: e.dateStr,
        'Expense Title': e.title,
        Category: e.category,
        'Payment Mode': e.paymentMethod,
        Amount: `₹${Number(e.totalAmount || 0).toFixed(2)}`,
      }));
      const totalExp = filteredExpenses.reduce((s, e) => s + (Number(e.totalAmount) || 0), 0);
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Total Expenses', value: `₹${totalExp.toFixed(0)}` }],
      };
    }

    if (id === 'tax_summary' || id === 'detailed_tax' || id === 'gstr1') {
      const cols = ['Invoice #', 'Date', 'Customer', 'Taxable Value', 'Tax Amount', 'Total'];
      const r = orders
        .filter((o) => filterByDate(o.dateStr))
        .map((o) => {
          const tax = (o.items || []).reduce(
            (s, it) =>
              s + ((Number(it.retailPrice) * Number(it.qty)) * Number(it.gst || 0)) / 100,
            0
          );
          const total = Number(o.totalAmount || 0);
          const taxable = Math.max(0, total - tax);
          return {
            'Invoice #': o.invoiceNumber,
            Date: o.dateStr,
            Customer: o.customerName || 'Walk-in',
            'Taxable Value': `₹${taxable.toFixed(2)}`,
            'Tax Amount': `₹${tax.toFixed(2)}`,
            Total: `₹${total.toFixed(2)}`,
          };
        });
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Tax Invoices', value: String(r.length) }],
      };
    }

    if (
      id === 'customer_summary' ||
      id === 'customer_ledger_rep' ||
      id === 'customer_stock_sales' ||
      id === 'customer_per_stock'
    ) {
      const cols = ['Customer Name', 'Phone', 'Address', 'Balance Due'];
      const r = customers.map((c) => ({
        'Customer Name': c.name,
        Phone: c.phone,
        Address: c.address || '-',
        'Balance Due': `₹${Number(c.balance || 0).toFixed(2)}`,
      }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Total Customers', value: String(customers.length) }],
      };
    }

    if (
      id === 'purchase_summary' ||
      id === 'supplier_ledger_rep' ||
      id === 'purchase_by_supplier'
    ) {
      if (id === 'supplier_ledger_rep') {
        const cols = ['Supplier Name', 'Phone', 'GSTIN', 'Balance Payable'];
        const r = suppliers.map((s) => ({
          'Supplier Name': s.name,
          Phone: s.phone,
          GSTIN: s.gstNumber || '-',
          'Balance Payable': `₹${Number(s.balance || 0).toFixed(2)}`,
        }));
        return {
          columns: cols,
          rows: r,
          summaryBadges: [{ label: 'Total Suppliers', value: String(suppliers.length) }],
        };
      }
      const cols = ['Date', 'Supplier', 'Items', 'Mode', 'Total Amount'];
      const r = purchases
        .filter((p) => filterByDate(p.dateStr))
        .map((p) => ({
          Date: p.dateStr,
          Supplier: p.supplierName,
          Items: (p.items || []).length,
          Mode: p.paymentMode,
          'Total Amount': `₹${Number(p.totalAmount || 0).toFixed(2)}`,
        }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Total Purchases', value: String(r.length) }],
      };
    }

    if (id === 'attendance_summary' || id === 'salary_summary') {
      const cols = ['Staff Name', 'Role', 'Phone', 'Attendance Days', 'Salary / Commission'];
      const r = staff.map((st) => ({
        'Staff Name': st.name,
        Role: st.role,
        Phone: st.phone,
        'Attendance Days': (st.attendance || []).filter((a) => a.status === 'Present').length,
        'Salary / Commission': `₹${Number(st.salary || 0).toFixed(0)} (${st.commissionPct || 0}%)`,
      }));
      return {
        columns: cols,
        rows: r,
        summaryBadges: [{ label: 'Total Staff', value: String(staff.length) }],
      };
    }

    // Fallback for Manufacture / Material Usage / Stock Transfer / Loss Summary
    const cols = ['Product', 'Category', 'Stock Qty', 'Cost Value'];
    const r = products
      .filter((p) => (id === 'manufacture_summary' ? (p.bomItems?.length || 0) > 0 : false))
      .map((p) => ({
        Product: p.name,
        Category: p.category,
        'Stock Qty': p.quantity,
        'Cost Value': `₹${(p.quantity * p.purchasePrice).toFixed(2)}`,
      }));
    return {
      columns: cols,
      rows: r,
      summaryBadges: [{ label: 'Total Records', value: String(r.length) }],
    };
  }, [
    activeReport,
    orders,
    purchases,
    returns,
    products,
    suppliers,
    customers,
    expenses,
    staff,
    dateFilter,
    selectedStaffId,
    selectedSupplierId,
    timelineGenerated,
    openHour,
    openMinute,
    openPeriod,
    closeHour,
    closeMinute,
    closePeriod,
    closesNextDay,
  ]);

  // Apply search and column Contains filters
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const values = Object.entries(row)
        .filter(([k]) => !k.startsWith('_'))
        .map(([, v]) => String(v).toLowerCase());
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!values.some((v) => v.includes(q))) return false;
      }
      if (colFilter1.trim() && columns[0]) {
        const c1 = String(row[columns[0]] || '').toLowerCase();
        if (!c1.includes(colFilter1.toLowerCase())) return false;
      }
      if (colFilter2.trim() && columns[1]) {
        const c2 = String(row[columns[1]] || '').toLowerCase();
        if (!c2.includes(colFilter2.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, searchQuery, colFilter1, colFilter2, columns]);

  // Stock Balance Summary 5 KPI metrics (matching 03:36)
  const stockBalanceMetrics = useMemo(() => {
    const totalSku = products.length;
    const totalVariants = products.reduce(
      (sum, p) => sum + Math.max(1, (p.variants || []).length),
      0
    );
    const totalRetail = products.reduce(
      (sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.retailPrice) || 0),
      0
    );
    const totalPurchase = products.reduce(
      (sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.purchasePrice) || 0),
      0
    );
    const totalQty = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
    return { totalSku, totalVariants, totalRetail, totalPurchase, totalQty };
  }, [products]);

  // Render Preparing Report Transition Overlay
  if (preparingReport) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center max-w-xs w-full text-center">
          <div className="w-12 h-12 rounded-full border-4 border-[#0A2540]/20 border-t-[#0A2540] animate-spin mb-4" />
          <p className="text-sm font-bold text-[#0A2540]">Preparing {preparingReport}...</p>
          <p className="text-xs text-slate-400 mt-1">Syncing live ledger & inventory records</p>
        </div>
      </div>
    );
  }

  // SPECIAL SCREEN 1: Select Staff (for Sales Summary by Staff - 03:20)
  if (activeReport?.specialScreen === 'select_staff' && !selectedStaffId) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setActiveReport(null)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Select Staff</h1>
        </div>
        <div className="p-4 space-y-3">
          {/* Default Owner / Shop Card */}
          <button
            onClick={() => setSelectedStaffId('OWNER')}
            className="w-full bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between text-left hover:border-[#0A2540] transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm">
                OW
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Shop Owner (Primary)</p>
                <p className="text-xs text-slate-500">All Direct Counter Bills</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold uppercase">
              OWNER
            </span>
          </button>

          {staff.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStaffId(st.name)}
              className="w-full bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex items-center justify-between text-left hover:border-[#0A2540] transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-blue-50 text-[#0A2540] font-bold flex items-center justify-center text-sm">
                  {st.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{st.name}</p>
                  <p className="text-xs text-slate-500">{st.phone}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                {st.role}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // SPECIAL SCREEN 2: Select Supplier (for Stock Sales Summary by Supplier - 03:32)
  if (activeReport?.specialScreen === 'select_supplier' && !selectedSupplierId) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setActiveReport(null)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Select Supplier</h1>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          {suppliers.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 rounded-full bg-slate-200/70 flex items-center justify-center mb-3 text-slate-400">
                <Truck className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-slate-700">No Suppliers Found</p>
              <p className="text-xs text-slate-400 mt-1">
                Add suppliers in My Suppliers to filter stock sales by supplier.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {suppliers.map((sup) => (
                <button
                  key={sup.id}
                  onClick={() => setSelectedSupplierId(sup.id || sup.name)}
                  className="w-full bg-white rounded-xl p-4 shadow-xs border border-slate-100 flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-800">{sup.name}</p>
                    <p className="text-xs text-slate-500">{sup.phone}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // SPECIAL SCREEN 3: Shop Timeline (Sales Summary by Timeline with Analog Clock Picker - 03:22-03:31)
  if (activeReport?.specialScreen === 'shop_timeline' && !timelineGenerated) {
    const activeHour = clockTarget === 'open' ? openHour : closeHour;
    const activeMinute = clockTarget === 'open' ? openMinute : closeMinute;
    const activePeriod = clockTarget === 'open' ? openPeriod : closePeriod;

    const setClockHour = (h: number) => {
      if (clockTarget === 'open') setOpenHour(h);
      else setCloseHour(h);
      setClockStep('minute');
    };

    const setClockMinute = (m: number) => {
      if (clockTarget === 'open') setOpenMinute(m);
      else setCloseMinute(m);
    };

    const setClockPeriod = (p: 'AM' | 'PM') => {
      if (clockTarget === 'open') setOpenPeriod(p);
      else setClosePeriod(p);
    };

    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setActiveReport(null)} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Shop Timeline</h1>
        </div>

        <div className="p-4 space-y-4 max-w-md mx-auto w-full">
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0A2540] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Set Daily Operating Hours</h2>
                <p className="text-xs text-slate-500">
                  Analyze sales across custom shop opening & closing shifts
                </p>
              </div>
            </div>

            {/* Shop Opening Time */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Shop Opening Time
              </label>
              <button
                onClick={() => {
                  setClockTarget('open');
                  setClockStep('hour');
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 flex items-center justify-between"
              >
                <span className="text-base font-bold text-[#0A2540] tabular-nums">
                  {String(openHour).padStart(2, '0')}:{String(openMinute).padStart(2, '0')}{' '}
                  {openPeriod}
                </span>
                <Clock className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Shop Closing Time */}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                Shop Closing Time
              </label>
              <button
                onClick={() => {
                  setClockTarget('close');
                  setClockStep('hour');
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 flex items-center justify-between"
              >
                <span className="text-base font-bold text-[#0A2540] tabular-nums">
                  {String(closeHour).padStart(2, '0')}:{String(closeMinute).padStart(2, '0')}{' '}
                  {closePeriod}
                </span>
                <Clock className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Closes Next Day Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">Closes Next Day</p>
                <p className="text-xs text-slate-400">Enable for late-night / overnight shops</p>
              </div>
              <button
                onClick={() => setClosesNextDay(!closesNextDay)}
                className={`w-12 h-6 rounded-full transition p-0.5 ${
                  closesNextDay ? 'bg-[#0A2540]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition transform ${
                    closesNextDay ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Operating Duration */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Operating Duration</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">
                {operatingDurationText}
              </span>
            </div>

            <button
              onClick={() => setTimelineGenerated(true)}
              className="w-full bg-[#0A2540] text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-[#0A2540]/90 transition text-sm"
            >
              Generate Report
            </button>
          </div>
        </div>

        {/* Interactive Material Analog Clock Time Picker Modal (03:24-03:30) */}
        {clockTarget && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl">
              <div className="bg-[#0A2540] text-white p-5">
                <p className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold mb-2">
                  Select {clockTarget === 'open' ? 'Opening' : 'Closing'} Time
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1 text-4xl font-bold tabular-nums">
                    <button
                      onClick={() => setClockStep('hour')}
                      className={clockStep === 'hour' ? 'text-white' : 'text-white/50'}
                    >
                      {String(activeHour).padStart(2, '0')}
                    </button>
                    <span>:</span>
                    <button
                      onClick={() => setClockStep('minute')}
                      className={clockStep === 'minute' ? 'text-white' : 'text-white/50'}
                    >
                      {String(activeMinute).padStart(2, '0')}
                    </button>
                  </div>
                  <div className="flex flex-col bg-white/10 rounded-lg overflow-hidden border border-white/20">
                    <button
                      onClick={() => setClockPeriod('AM')}
                      className={`px-3 py-1 text-xs font-bold ${
                        activePeriod === 'AM' ? 'bg-white text-[#0A2540]' : 'text-white/80'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      onClick={() => setClockPeriod('PM')}
                      className={`px-3 py-1 text-xs font-bold ${
                        activePeriod === 'PM' ? 'bg-white text-[#0A2540]' : 'text-white/80'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Circular Analog Dial */}
              <div className="p-6 flex flex-col items-center">
                <div className="relative w-56 h-56 rounded-full bg-slate-100 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0A2540] z-10" />
                  {clockStep === 'hour'
                    ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h, i) => {
                        const angle = (i * 30 - 90) * (Math.PI / 180);
                        const radius = 86;
                        const x = Math.cos(angle) * radius;
                        const y = Math.sin(angle) * radius;
                        const isSelected = activeHour === h;
                        return (
                          <button
                            key={h}
                            onClick={() => setClockHour(h)}
                            style={{ transform: `translate(${x}px, ${y}px)` }}
                            className={`absolute w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center transition ${
                              isSelected
                                ? 'bg-[#0A2540] text-white shadow-md scale-110'
                                : 'text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {h}
                          </button>
                        );
                      })
                    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m, i) => {
                        const angle = (i * 30 - 90) * (Math.PI / 180);
                        const radius = 86;
                        const x = Math.cos(angle) * radius;
                        const y = Math.sin(angle) * radius;
                        const isSelected = activeMinute === m;
                        return (
                          <button
                            key={m}
                            onClick={() => setClockMinute(m)}
                            style={{ transform: `translate(${x}px, ${y}px)` }}
                            className={`absolute w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center transition ${
                              isSelected
                                ? 'bg-[#0A2540] text-white shadow-md scale-110'
                                : 'text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {String(m).padStart(2, '0')}
                          </button>
                        );
                      })}
                </div>

                <div className="flex items-center justify-end gap-4 w-full mt-5">
                  <button
                    onClick={() => setClockTarget(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => setClockTarget(null)}
                    className="px-5 py-2 bg-[#0A2540] text-white rounded-lg text-xs font-bold"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ACTIVE REPORT VIEW
  if (activeReport) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex flex-col">
        {/* Top Bar */}
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setActiveReport(null)} className="p-1">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-sm font-bold leading-tight">{activeReport.title}</h1>
              <p className="text-[11px] text-slate-300">Live Firebase Report</p>
            </div>
          </div>
          <button
            onClick={() =>
              exportReportTableToExcel(
                activeReport.title,
                columns,
                filteredRows.map((r) => {
                  const clean: Record<string, string | number> = {};
                  columns.forEach((c) => {
                    clean[c] = r[c] ?? '-';
                  });
                  return clean;
                })
              )
            }
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
        </div>

        <div className="p-3.5 space-y-3 flex-1">
          {/* Special Stock Balance Summary 5 KPI Cards (03:36) */}
          {activeReport.specialScreen === 'stock_balance_summary' && (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
                <p className="text-[11px] text-slate-500 font-medium">Total Products (SKU)</p>
                <p className="text-lg font-extrabold text-[#0A2540] tabular-nums mt-0.5">
                  {stockBalanceMetrics.totalSku}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
                <p className="text-[11px] text-slate-500 font-medium">Total Products (All)</p>
                <p className="text-lg font-extrabold text-[#0A2540] tabular-nums mt-0.5">
                  {stockBalanceMetrics.totalVariants}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
                <p className="text-[11px] text-slate-500 font-medium">Total Retail (SKU)</p>
                <p className="text-lg font-extrabold text-emerald-600 tabular-nums mt-0.5">
                  ₹{stockBalanceMetrics.totalRetail.toFixed(0)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs">
                <p className="text-[11px] text-slate-500 font-medium">Total Purchase (SKU)</p>
                <p className="text-lg font-extrabold text-blue-600 tabular-nums mt-0.5">
                  ₹{stockBalanceMetrics.totalPurchase.toFixed(0)}
                </p>
              </div>
              <div className="col-span-2 bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs flex items-center justify-between">
                <p className="text-xs text-slate-600 font-semibold">Total Quantity (SKU)</p>
                <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">
                  {stockBalanceMetrics.totalQty} Units
                </p>
              </div>
            </div>
          )}

          {/* Summary Badges */}
          {summaryBadges.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {summaryBadges.map((b, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl p-3 border border-slate-100 shadow-xs text-center"
                >
                  <p className="text-[10px] text-slate-500 font-medium">{b.label}</p>
                  <p className="text-sm font-extrabold text-[#0A2540] tabular-nums mt-0.5">
                    {b.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Date Filter & Search Bar */}
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-xs space-y-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All Dates' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
              ].map((df) => (
                <button
                  key={df.id}
                  onClick={() => setDateFilter(df.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    dateFilter === df.id
                      ? 'bg-[#0A2540] text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {df.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search in ${activeReport.title}...`}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0A2540]"
              />
            </div>
          </div>

          {activeReport.id === 'sales_summary' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2.5 text-xs text-blue-900">
              Tap any invoice row to update Purchase Price & recalculate Profit
            </div>
          )}

          {/* Report Data Table with "Contains" Column Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2.5 text-[11px] font-bold text-slate-700 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                  {columns.length >= 2 && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-2 py-1.5">
                        <input
                          type="text"
                          value={colFilter1}
                          onChange={(e) => setColFilter1(e.target.value)}
                          placeholder="Contains..."
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-normal"
                        />
                      </th>
                      <th className="px-2 py-1.5">
                        <input
                          type="text"
                          value={colFilter2}
                          onChange={(e) => setColFilter2(e.target.value)}
                          placeholder="Contains..."
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-normal"
                        />
                      </th>
                      {columns.slice(2).map((c) => (
                        <th key={c} className="px-2 py-1.5 text-[10px] text-slate-300 font-normal">
                          —
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(1, columns.length)}
                        className="px-4 py-12 text-center text-xs text-slate-400"
                      >
                        No records found for this report
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        onClick={() => {
                          if (activeReport.id === 'sales_summary' && row._rawOrder) {
                            handleSelectOrderForProfit(row._rawOrder);
                          }
                        }}
                        className={`hover:bg-slate-50 transition ${
                          activeReport.id === 'sales_summary' ? 'cursor-pointer' : ''
                        }`}
                      >
                        {columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap tabular-nums"
                          >
                            {row[col]}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Invoice # Bottom Sheet for editing Purchase Price & recalculating Profit (03:16) */}
        {editingOrder && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#0A2540]">
                    Invoice #{editingOrder.invoiceNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Update item Purchase Price to calculate exact Profit
                  </p>
                </div>
                <button
                  onClick={() => setEditingOrder(null)}
                  className="p-1.5 rounded-full bg-slate-100 text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                {(editingOrder.items || []).map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[11px] text-slate-500 tabular-nums">
                        Sold: {item.qty} × ₹{item.retailPrice} = ₹
                        {(item.qty * item.retailPrice).toFixed(2)}
                      </p>
                    </div>
                    <div className="w-28">
                      <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                        Cost Price (₹)
                      </label>
                      <input
                        type="number"
                        value={editedCostMap[idx] ?? ''}
                        onChange={(e) =>
                          setEditedCostMap((prev) => ({ ...prev, [idx]: e.target.value }))
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-[#0A2540] tabular-nums"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveOrderProfit}
                disabled={savingOrderCost}
                className="w-full bg-[#0A2540] text-white font-bold py-3.5 rounded-xl text-sm shadow-md disabled:opacity-50"
              >
                {savingOrderCost ? 'Updating Profit...' : 'Update Purchase Price & Profit'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // MAIN BUSINESS REPORTS HUB SCREEN (03:11 - 03:45)
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex flex-col pb-12">
      {/* Header */}
      <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-bold">Business Reports</h1>
        </div>
      </div>

      <div className="p-3.5 space-y-3.5">
        {/* Top Sales Performance Card with Live 7-Day Line Chart */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Sales Performance</h2>
              <p className="text-[11px] text-slate-400">Live revenue trend</p>
            </div>
            <select
              value={chartRange}
              onChange={(e) => setChartRange(e.target.value as any)}
              className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* SVG Line Chart */}
          <div className="h-36 w-full pt-2">
            <svg viewBox="0 0 320 110" className="w-full h-full overflow-visible">
              {[0, 0.5, 1].map((t, idx) => (
                <line
                  key={idx}
                  x1="28"
                  y1={10 + t * 75}
                  x2="310"
                  y2={10 + t * 75}
                  stroke="#E2E8F0"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
              ))}

              <text x="2" y="14" className="fill-slate-400 text-[8px] font-mono">
                ₹{Math.round(maxChartVal)}
              </text>
              <text x="2" y="50" className="fill-slate-400 text-[8px] font-mono">
                ₹{Math.round(maxChartVal / 2)}
              </text>
              <text x="2" y="86" className="fill-slate-400 text-[8px] font-mono">
                ₹0
              </text>

              {(() => {
                const coords = chartData.map((pt, i) => {
                  const x = 38 + (i * (305 - 38)) / Math.max(1, chartData.length - 1);
                  const y = 85 - (pt.amount / maxChartVal) * 75;
                  return { x, y, ...pt };
                });
                const pointsAttr = coords.map((c) => `${c.x},${c.y}`).join(' ');
                return (
                  <>
                    <polyline
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="2.5"
                      points={pointsAttr}
                    />
                    {coords.map((c, idx) => {
                      const showLabel =
                        coords.length <= 7 || idx === 0 || idx === coords.length - 1 || idx % 5 === 0;
                      return (
                        <g key={idx}>
                          <circle
                            cx={c.x}
                            cy={c.y}
                            r={coords.length > 10 ? '2.2' : '3.5'}
                            fill="#10B981"
                            stroke="#ffffff"
                            strokeWidth="1.2"
                          />
                          {showLabel && (
                            <text
                              x={c.x}
                              y="102"
                              textAnchor="middle"
                              className="fill-slate-400 text-[7px]"
                            >
                              {c.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* 7 Expandable Report Accordions */}
        <div className="space-y-2.5">
          {REPORT_CATEGORIES.map((cat) => {
            const isExpanded = !!expandedCategories[cat.key];
            return (
              <div
                key={cat.key}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
              >
                <button
                  onClick={() => toggleCategory(cat.key)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left bg-white hover:bg-slate-50 transition"
                >
                  <span className="text-sm font-bold text-[#0A2540]">{cat.title}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                </button>

                {isExpanded && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {cat.reports.map((rep) => (
                      <button
                        key={rep.id}
                        onClick={() => openReport(rep)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 active:bg-slate-100 transition"
                      >
                        <span className="text-xs font-semibold text-slate-700">{rep.title}</span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
