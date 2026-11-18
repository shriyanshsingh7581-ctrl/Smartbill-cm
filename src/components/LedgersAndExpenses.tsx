import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Search,
  ChevronRight,
  Plus,
  Building2,
  Users,
  Camera,
  SlidersHorizontal,
  Receipt,
  Calendar,
  Save,
  MoreVertical,
  History,
  Pencil,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  saveSupplierToDb,
  saveCustomerToDb,
  saveExpenseToDb,
  type SupplierDoc,
  type CustomerDoc,
  type ExpenseDoc,
  type LedgerEntry,
} from '../firebase';
import { ApkPhotoSheet } from './ApkPhotoSheet';

export type LedgerSubScreen =
  | 'suppliers'
  | 'supplier_ledger_summary'
  | 'customers'
  | 'customer_ledger_summary'
  | 'expenses';

interface LedgersAndExpensesProps {
  uid: string;
  screen: LedgerSubScreen;
  setScreen: (s: LedgerSubScreen) => void;
  onBackToHome: () => void;
  suppliers: SupplierDoc[];
  customers: CustomerDoc[];
  expenses: ExpenseDoc[];
  initialOpenAddModal?: boolean;
  onClearInitialModal?: () => void;
}

export const LedgersAndExpenses: React.FC<LedgersAndExpensesProps> = ({
  uid,
  screen,
  setScreen,
  onBackToHome,
  suppliers,
  customers,
  expenses,
  initialOpenAddModal,
  onClearInitialModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'give' | 'get'>('all');
  const [avatarPhotoSheetOpen, setAvatarPhotoSheetOpen] = useState(false);
  const [preparingLedger, setPreparingLedger] = useState(false);

  // Add Supplier / Customer Bottom Sheet state
  const [addPartyOpen, setAddPartyOpen] = useState(Boolean(initialOpenAddModal));
  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [partyNotes, setPartyNotes] = useState('');
  const [partyGst, setPartyGst] = useState('');
  const [partyAvatar, setPartyAvatar] = useState('');
  const [partyOpeningBal, setPartyOpeningBal] = useState('');
  const [partyOpeningType, setPartyOpeningType] = useState<'PAYMENT' | 'PURCHASE'>('PAYMENT');
  const [savingParty, setSavingParty] = useState(false);

  // Selected Supplier/Customer Ledger Entry Modal
  const [selectedParty, setSelectedParty] = useState<SupplierDoc | CustomerDoc | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'PAYMENT' | 'PURCHASE'>('PAYMENT');
  const [txNotes, setTxNotes] = useState('');

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const todayDdMmYyyy = `${String(now.getDate()).padStart(2, '0')}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-${now.getFullYear()}`;

  // Column filters for Ledger Summary table
  const [colFilterDate, setColFilterDate] = useState('');
  const [colFilterName, setColFilterName] = useState('');
  const [colFilterPhone, setColFilterPhone] = useState('');
  const [colFilterAmount, setColFilterAmount] = useState('');

  // Add Expense Modal & Dynamic Calendar Modal
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expDate, setExpDate] = useState('');
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [selectedDayNum, setSelectedDayNum] = useState(now.getDate());
  const [expCategory, setExpCategory] = useState('Food');
  const [expItems, setExpItems] = useState<{ name: string; amount: number }[]>([]);
  const [expPaymentMethod, setExpPaymentMethod] = useState('Cash');
  const [expPaymentMenuOpen, setExpPaymentMenuOpen] = useState(false);
  const [expNotes, setExpNotes] = useState('');
  const [expTotalAmount, setExpTotalAmount] = useState('0.00');
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const partySearchRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  };

  useEffect(() => {
    if (initialOpenAddModal) {
      setAddPartyOpen(true);
    }
  }, [initialOpenAddModal]);

  const openLedgerSummaryWithLoader = (target: 'supplier_ledger_summary' | 'customer_ledger_summary') => {
    setPreparingLedger(true);
    setTimeout(() => {
      setPreparingLedger(false);
      setScreen(target);
    }, 350);
  };

  let screenContent: React.ReactNode = null;

  if (preparingLedger) {
    screenContent = (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <p className="text-sm font-semibold text-slate-800 mb-2">
          {screen === 'suppliers'
            ? 'Preparing Supplier Ledger Summary'
            : 'Preparing Customer Ledger Summary'}
        </p>
        <div className="w-40 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="w-1/2 h-full bg-[#0A2540] animate-pulse" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // 1. SUPPLIER / CUSTOMER LEDGER SUMMARY TABLE (Matches 09:23 & 09:51)
  // ============================================================================
  else if (screen === 'supplier_ledger_summary' || screen === 'customer_ledger_summary') {
    const isSupplier = screen === 'supplier_ledger_summary';
    const list = isSupplier ? suppliers : customers;

    const allLedgerRows = list.flatMap((party) =>
      (party.ledger || []).map((entry) => ({
        date: entry.dateStr,
        name: party.name,
        phone: party.phone,
        type: entry.type,
        amount: entry.amount,
        notes: entry.notes,
      }))
    );

    const filteredRows = allLedgerRows.filter((r) => {
      if (colFilterDate && !r.date.toLowerCase().includes(colFilterDate.toLowerCase())) return false;
      if (colFilterName && !r.name.toLowerCase().includes(colFilterName.toLowerCase())) return false;
      if (colFilterPhone && !r.phone.toLowerCase().includes(colFilterPhone.toLowerCase()))
        return false;
      if (colFilterAmount && !String(r.amount).includes(colFilterAmount.trim())) return false;
      if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col">
        <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setScreen(isSupplier ? 'suppliers' : 'customers')}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold truncate">
              {isSupplier ? 'Supplier Ledger Summ...' : 'Customer Ledger Sum...'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setColFilterDate('');
              setColFilterName('');
              setColFilterPhone('');
              setColFilterAmount('');
              setSearchQuery('');
              showToast('Table filters cleared');
            }}
            title="Clear Filters"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </header>

        <div className="p-4 space-y-3 max-w-md mx-auto w-full flex-1 flex flex-col">
          {/* Date Picker Row */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-600">📅</span>
              <div>
                <p className="text-xs font-extrabold text-[#0A2540]">Today</p>
                <p className="text-[11px] text-slate-400 tabular-nums">
                  {new Date().toISOString().slice(0, 10)}
                </p>
              </div>
            </div>
            <SlidersHorizontal className="w-4 h-4 text-slate-600" />
          </div>

          {/* Search Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name"
              className="flex-1 text-xs text-slate-800 outline-none"
            />
          </div>

          {/* Data Table with "Contains" Column Filters */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[460px]">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-700">
                  <th className="p-2.5 border-r border-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Date</span>
                      <span className="text-slate-400 text-[10px]">☰</span>
                    </div>
                  </th>
                  <th className="p-2.5 border-r border-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Name</span>
                      <span className="text-slate-400 text-[10px]">☰</span>
                    </div>
                  </th>
                  <th className="p-2.5 border-r border-slate-200">
                    <div className="flex items-center justify-between">
                      <span>Phone</span>
                      <span className="text-slate-400 text-[10px]">☰</span>
                    </div>
                  </th>
                  <th className="p-2.5">
                    <div className="flex items-center justify-between">
                      <span>Amount</span>
                      <span className="text-slate-400 text-[10px]">☰</span>
                    </div>
                  </th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-xs">
                  <th className="p-2 border-r border-slate-200">
                    <input
                      type="text"
                      value={colFilterDate}
                      onChange={(e) => setColFilterDate(e.target.value)}
                      placeholder="Contains"
                      className="w-full bg-transparent text-xs font-normal outline-none"
                    />
                  </th>
                  <th className="p-2 border-r border-slate-200">
                    <input
                      type="text"
                      value={colFilterName}
                      onChange={(e) => setColFilterName(e.target.value)}
                      placeholder="Contains"
                      className="w-full bg-transparent text-xs font-normal outline-none"
                    />
                  </th>
                  <th className="p-2 border-r border-slate-200">
                    <input
                      type="text"
                      value={colFilterPhone}
                      onChange={(e) => setColFilterPhone(e.target.value)}
                      placeholder="Contains"
                      className="w-full bg-transparent text-xs font-normal outline-none"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      value={colFilterAmount}
                      onChange={(e) => setColFilterAmount(e.target.value)}
                      placeholder="Contains"
                      className="w-full bg-transparent text-xs font-normal outline-none"
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-xs text-slate-400">
                      No ledger transactions recorded yet
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 text-xs text-slate-800">
                      <td className="p-2.5 border-r border-slate-100 tabular-nums">{row.date}</td>
                      <td className="p-2.5 border-r border-slate-100 font-semibold">{row.name}</td>
                      <td className="p-2.5 border-r border-slate-100 tabular-nums">{row.phone}</td>
                      <td className="p-2.5 font-bold tabular-nums">₹{row.amount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. EXPENSES MODULE (Matches 01:27 - 01:40)
  // ============================================================================
  else if (screen === 'expenses') {
    const filteredExpenses = expenses.filter(
      (e) => !searchQuery.trim() || e.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSaveExpense = async () => {
      if (!expTitle.trim()) {
        showToast('Please enter Expense Title', 'error');
        return;
      }
      setSavingExpense(true);
      try {
        await saveExpenseToDb(uid, {
          title: expTitle.trim(),
          dateStr: expDate || todayDdMmYyyy,
          category: expCategory,
          paymentMethod: expPaymentMethod,
          notes: expNotes.trim(),
          totalAmount: Number(expTotalAmount) || 0,
          items: expItems,
        });
        setExpTitle('');
        setExpDate('');
        setExpNotes('');
        setExpTotalAmount('0.00');
        setExpItems([]);
        setAddExpenseOpen(false);
        showToast('Expense saved successfully!');
      } catch (err: any) {
        showToast(err?.message || 'Could not save expense. Please try again.', 'error');
      } finally {
        setSavingExpense(false);
      }
    };

    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstWeekday = new Date(calYear, calMonth, 1).getDay();
    const clampedDay = Math.min(selectedDayNum, daysInMonth);
    const selectedCalDate = new Date(calYear, calMonth, clampedDay);
    const monthLabel = selectedCalDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const selectedCalTitle = selectedCalDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    screenContent = (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-24">
        {/* Top Navy Header */}
        <header className="bg-[#0A2540] text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold leading-tight">Expenses</h1>
            <p className="text-[11px] text-slate-300">Track your business expenses</p>
          </div>
        </header>

        <div className="p-4 space-y-3.5 max-w-md mx-auto w-full flex-1 flex flex-col">
          {/* Today Date Card */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-600" />
              <div>
                <p className="text-xs font-extrabold text-[#0A2540]">Today</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{todayIso}</p>
              </div>
            </div>
            <SlidersHorizontal className="w-4 h-4 text-slate-600" />
          </div>

          {/* Search Expenses Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses by name..."
              className="flex-1 text-xs text-slate-800 outline-none"
            />
          </div>

          {/* Empty State or Expenses List */}
          {filteredExpenses.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
              <div className="w-24 h-24 rounded-full bg-slate-200/70 flex items-center justify-center text-slate-400 mb-4">
                <Receipt className="w-10 h-10" />
              </div>
              <h3 className="text-base font-extrabold text-slate-700">No Expenses Yet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Start tracking your business expenses by adding your first expense entry.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredExpenses.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-xs"
                >
                  <div>
                    <h4 className="text-sm font-extrabold text-[#0A2540]">{ex.title}</h4>
                    <p className="text-xs text-slate-500">
                      {ex.category} · {ex.paymentMethod} · {ex.dateStr}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-red-600 tabular-nums">
                    ₹{ex.totalAmount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating + Add Expense Button */}
        <button
          type="button"
          onClick={() => setAddExpenseOpen(true)}
          className="fixed bottom-6 right-5 z-30 bg-[#0A2540] text-white font-bold text-xs px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-2 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Expense</span>
        </button>

        {/* Add Expense Bottom Sheet (Matches 01:30 - 01:39) */}
        {addExpenseOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
            <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3.5 max-h-[92vh] overflow-y-auto">
              <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1" />
              <h3 className="text-base font-extrabold text-[#0A2540]">Add Expense</h3>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expense Title *
                </label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Enter expense title"
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date *</label>
                <button
                  type="button"
                  onClick={() => setCalendarModalOpen(true)}
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between"
                >
                  <span className={expDate ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                    {expDate || 'Select date'}
                  </span>
                  <Calendar className="w-4 h-4 text-slate-600" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category *
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm bg-white outline-none"
                >
                  <option value="Food">Food</option>
                  <option value="Rent">Rent</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Salary">Salary</option>
                  <option value="Transport">Transport</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Items <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                {expItems.map((it, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Item name"
                      value={it.name}
                      onChange={(e) =>
                        setExpItems((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, name: e.target.value } : row
                          )
                        )
                      }
                      className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="₹"
                      value={it.amount}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const next = expItems.map((row, idx) =>
                          idx === i ? { ...row, amount: val } : row
                        );
                        setExpItems(next);
                        setExpTotalAmount(
                          String(next.reduce((acc, r) => acc + r.amount, 0).toFixed(2))
                        );
                      }}
                      className="w-24 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setExpItems((prev) => [...prev, { name: '', amount: 0 }])}
                  className="w-full border border-slate-300 rounded-xl py-2.5 text-xs font-bold text-[#0A2540]"
                >
                  + Add Item
                </button>
              </div>

              {/* Payment Method Dropdown (Matches 01:32) */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Method *
                </label>
                <button
                  type="button"
                  onClick={() => setExpPaymentMenuOpen(!expPaymentMenuOpen)}
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm text-left flex items-center justify-between bg-white"
                >
                  <span>{expPaymentMethod}</span>
                  <span>▾</span>
                </button>
                {expPaymentMenuOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1">
                    {['Cash', 'UPI', 'Card', 'Cheque'].map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => {
                          setExpPaymentMethod(pm);
                          setExpPaymentMenuOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold ${
                          expPaymentMethod === pm ? 'bg-slate-200 text-slate-900' : 'text-slate-700'
                        }`}
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Add notes (optional)"
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Total Amount *
                </label>
                <input
                  type="number"
                  value={expTotalAmount}
                  onChange={(e) => setExpTotalAmount(e.target.value)}
                  className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddExpenseOpen(false)}
                  className="py-3.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingExpense}
                  onClick={handleSaveExpense}
                  className="col-span-2 py-3.5 rounded-xl bg-[#0A2540] text-white font-bold text-xs flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingExpense ? 'Saving...' : 'Save Expense'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Material Calendar Modal */}
        {calendarModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 w-full max-w-xs shadow-2xl space-y-4">
              <p className="text-xs text-slate-500">Select date</p>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-2xl font-bold text-slate-900">{selectedCalTitle}</h3>
                <Pencil className="w-4 h-4 text-slate-600" />
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>{monthLabel}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear((y) => y - 1);
                      } else {
                        setCalMonth((m) => m - 1);
                      }
                    }}
                    className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-base"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear((y) => y + 1);
                      } else {
                        setCalMonth((m) => m + 1);
                      }
                    }}
                    className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-base"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="font-bold text-slate-500 py-1">
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstWeekday }, (_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDayNum(day)}
                    className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs font-medium ${
                      clampedDay === day
                        ? 'bg-[#0A2540] text-white font-bold'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-5 pt-2 text-xs font-bold text-[#0A2540]">
                <button type="button" onClick={() => setCalendarModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dd = String(clampedDay).padStart(2, '0');
                    const mm = String(calMonth + 1).padStart(2, '0');
                    setExpDate(`${dd}-${mm}-${calYear}`);
                    setCalendarModalOpen(false);
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 3. MY SUPPLIERS & MY CUSTOMERS SCREENS (Matches 09:19 - 09:55)
  // ============================================================================
  else {
  const isSupplierScreen = screen === 'suppliers';
  const partyList = isSupplierScreen ? suppliers : customers;

  const totalYouWillGive = partyList
    .filter((p) => p.balance < 0)
    .reduce((acc, p) => acc + Math.abs(p.balance), 0);
  const totalYouWillGet = partyList
    .filter((p) => p.balance > 0)
    .reduce((acc, p) => acc + p.balance, 0);

  const visibleParties = partyList
    .filter((p) => {
      if (balanceFilter === 'give') return p.balance < 0;
      if (balanceFilter === 'get') return p.balance > 0;
      return true;
    })
    .filter(
      (p) =>
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone.includes(searchQuery)
    );

  const handleSaveParty = async () => {
    if (!partyName.trim()) {
      showToast(
        isSupplierScreen ? 'Please enter Supplier Name' : 'Please enter Customer Name',
        'error'
      );
      return;
    }
    if (!partyPhone.trim()) {
      showToast('Please enter Phone Number', 'error');
      return;
    }
    setSavingParty(true);
    try {
      const openAmt = Number(partyOpeningBal) || 0;
      // PAYMENT = You Gave / Positive balance; PURCHASE = You Will Give / Negative balance
      const signedBal = partyOpeningType === 'PAYMENT' ? openAmt : -openAmt;
      const initialLedger: LedgerEntry[] =
        openAmt > 0
          ? [
              {
                id: `init_${Date.now()}`,
                dateStr: new Date().toISOString().slice(0, 10),
                timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                type: partyOpeningType,
                amount: openAmt,
                mode: 'Cash',
                notes: 'Opening Balance',
              },
            ]
          : [];

      const payload = {
        name: partyName.trim(),
        phone: partyPhone.startsWith('+91') ? partyPhone.trim() : `+91${partyPhone.trim()}`,
        address: partyAddress.trim(),
        notes: partyNotes.trim(),
        gstNumber: partyGst.trim(),
        avatarUrl: partyAvatar,
        balance: signedBal,
        ledger: initialLedger,
      };

      if (isSupplierScreen) {
        await saveSupplierToDb(uid, payload);
      } else {
        await saveCustomerToDb(uid, payload);
      }

      setPartyName('');
      setPartyPhone('');
      setPartyAddress('');
      setPartyNotes('');
      setPartyGst('');
      setPartyAvatar('');
      setPartyOpeningBal('');
      setAddPartyOpen(false);
      onClearInitialModal?.();
      showToast(isSupplierScreen ? 'Supplier saved!' : 'Customer saved!');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save record. Please try again.', 'error');
    } finally {
      setSavingParty(false);
    }
  };

  const handleAddLedgerTransaction = async () => {
    if (!selectedParty) return;
    const amt = Number(txAmount) || 0;
    if (amt <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    setSavingTx(true);
    try {
      const delta = txType === 'PAYMENT' ? amt : -amt;
      const newEntry: LedgerEntry = {
        id: `tx_${Date.now()}`,
        dateStr: new Date().toISOString().slice(0, 10),
        timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: txType,
        amount: amt,
        mode: 'Cash',
        notes: txNotes.trim() || txType,
      };
      const updatedParty = {
        ...selectedParty,
        balance: (selectedParty.balance || 0) + delta,
        ledger: [newEntry, ...(selectedParty.ledger || [])],
      };
      if (isSupplierScreen) {
        await saveSupplierToDb(uid, updatedParty);
      } else {
        await saveCustomerToDb(uid, updatedParty);
      }
      setSelectedParty(updatedParty);
      setTxAmount('');
      setTxNotes('');
      showToast('Ledger entry added!');
    } catch (err: any) {
      showToast(err?.message || 'Could not update ledger.', 'error');
    } finally {
      setSavingTx(false);
    }
  };

  screenContent = (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col pb-24">
      {/* Top Navy Header */}
      <header className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">
            {isSupplierScreen ? 'My Suppliers' : 'My Customers'}
          </h1>
        </div>

        {isSupplierScreen ? (
          <div className="flex items-center gap-3 text-sm font-bold">
            <button
              type="button"
              onClick={() => partySearchRef.current?.focus()}
              className="p-1"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openLedgerSummaryWithLoader('supplier_ledger_summary')}
              className="p-1"
              title="Supplier Ledger Summary"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openLedgerSummaryWithLoader('customer_ledger_summary')}
            className="p-1"
            title="Customer Ledger Summary"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        )}
      </header>

      <div className="p-4 space-y-3.5 max-w-md mx-auto w-full flex-1 flex flex-col">
        {/* Search Input */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 shadow-xs">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            ref={partySearchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isSupplierScreen ? 'Search suppliers by name or phone...' : 'Search customers by name or phone...'
            }
            className="flex-1 text-xs text-slate-800 outline-none"
          />
        </div>

        {/* Summary Cards: You Will Give / You Will Get + > Button (Matches 09:20 & 09:53) */}
        <div className="flex items-stretch gap-2.5">
          <button
            type="button"
            onClick={() => setBalanceFilter(balanceFilter === 'give' ? 'all' : 'give')}
            className={`flex-1 rounded-2xl p-3 text-left transition-colors border ${
              balanceFilter === 'give'
                ? 'bg-red-50 border-red-300'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <p className="text-[11px] font-bold text-[#0A2540]">You Will Give</p>
            <p className="text-sm font-extrabold text-red-600 mt-1 tabular-nums">
              ₹ {totalYouWillGive}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setBalanceFilter(balanceFilter === 'get' ? 'all' : 'get')}
            className={`flex-1 rounded-2xl p-3 text-left transition-colors border ${
              balanceFilter === 'get'
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <p className="text-[11px] font-bold text-[#0A2540]">You Will Get</p>
            <p className="text-sm font-extrabold text-emerald-600 mt-1 tabular-nums">
              ₹ {totalYouWillGet}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              openLedgerSummaryWithLoader(
                isSupplierScreen ? 'supplier_ledger_summary' : 'customer_ledger_summary'
              )
            }
            className="w-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-xs active:scale-95"
          >
            <ChevronRight className="w-5 h-5 text-slate-700" />
          </button>
        </div>

        {/* Empty State or Party List */}
        {visibleParties.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
            <div className="w-24 h-24 rounded-full bg-slate-200/70 flex items-center justify-center text-slate-400 mb-4">
              {isSupplierScreen ? (
                <Building2 className="w-10 h-10" />
              ) : (
                <Users className="w-10 h-10" />
              )}
            </div>
            <h3 className="text-base font-extrabold text-slate-600">
              {isSupplierScreen ? 'No Suppliers Found' : 'No Customers Found'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isSupplierScreen
                ? 'Add your first supplier to get started'
                : 'Add your first customer to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleParties.map((party) => (
              <div
                key={party.id}
                onClick={() => setSelectedParty(party)}
                className="bg-white rounded-2xl border border-slate-200 p-3.5 flex items-center justify-between shadow-xs cursor-pointer hover:border-slate-300"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 overflow-hidden">
                    {party.avatarUrl ? (
                      <img
                        src={party.avatarUrl}
                        alt={party.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      party.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-[#0A2540]">{party.name}</h4>
                    <p className="text-xs text-slate-400 tabular-nums">{party.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-extrabold tabular-nums ${
                      party.balance < 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    ₹{Math.abs(party.balance)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {party.balance < 0 ? 'You Will Give' : 'You Will Get'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating + Navy Square Button (Matches 09:20 & 09:53) */}
      <button
        type="button"
        onClick={() => setAddPartyOpen(true)}
        className="fixed bottom-6 right-5 z-30 w-14 h-14 rounded-2xl bg-[#0A2540] text-white flex items-center justify-center shadow-lg active:scale-95"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Supplier / Add Customer Bottom Sheet (Matches 09:36 - 09:44) */}
      {addPartyOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-3.5 max-h-[92vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-1" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
                🏪
              </div>
              <h3 className="text-base font-extrabold text-[#0A2540]">
                {isSupplierScreen ? 'Add Supplier' : 'Add Customer'}
              </h3>
            </div>

            {/* Avatar Upload Circle */}
            <div className="flex justify-center py-1">
              <button
                type="button"
                onClick={() => setAvatarPhotoSheetOpen(true)}
                className="w-24 h-24 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center relative cursor-pointer"
              >
                {partyAvatar ? (
                  <img
                    src={partyAvatar}
                    alt="Avatar"
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-extrabold text-slate-700">?</span>
                )}
                <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#0A2540] text-white flex items-center justify-center shadow">
                  <Camera className="w-4 h-4" />
                </span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isSupplierScreen ? 'Supplier Name *' : 'Customer Name *'}
              </label>
              <input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder={isSupplierScreen ? 'Enter supplier name' : 'Enter customer name'}
                className="w-full border border-slate-400 rounded-xl px-3.5 py-2.5 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number *
              </label>
              <div className="flex items-center border border-slate-400 rounded-xl px-2.5 py-2 gap-2">
                <span className="bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800">
                  +91
                </span>
                <input
                  type="tel"
                  value={partyPhone}
                  onChange={(e) => setPartyPhone(e.target.value)}
                  placeholder="Enter phone number"
                  className="flex-1 text-sm outline-none"
                />
                <span className="text-slate-600 text-sm">📓</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={partyAddress}
                onChange={(e) => setPartyAddress(e.target.value)}
                placeholder={
                  isSupplierScreen ? 'Enter supplier address' : 'Enter customer address'
                }
                className="w-full border border-slate-400 rounded-xl px-3.5 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={partyNotes}
                onChange={(e) => setPartyNotes(e.target.value)}
                placeholder="Enter notes or remarks"
                className="w-full border border-slate-400 rounded-xl px-3.5 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                GST Number <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="flex items-center border border-slate-400 rounded-xl px-3.5 py-2.5">
                <input
                  type="text"
                  value={partyGst}
                  onChange={(e) => setPartyGst(e.target.value)}
                  placeholder="Enter GST number"
                  className="flex-1 text-sm outline-none"
                />
                <Search className="w-4 h-4 text-slate-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Opening Balance <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="flex items-center border border-slate-400 rounded-xl px-3.5 py-2 gap-2">
                <input
                  type="number"
                  value={partyOpeningBal}
                  onChange={(e) => setPartyOpeningBal(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 text-sm outline-none"
                />
                <select
                  value={partyOpeningType}
                  onChange={(e) =>
                    setPartyOpeningType(e.target.value as 'PAYMENT' | 'PURCHASE')
                  }
                  className="text-xs font-extrabold text-[#0A2540] bg-transparent outline-none"
                >
                  <option value="PAYMENT">PAYMENT</option>
                  <option value="PURCHASE">PURCHASE</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAddPartyOpen(false);
                  onClearInitialModal?.();
                }}
                className="py-3.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingParty}
                onClick={handleSaveParty}
                className="py-3.5 rounded-xl bg-[#0A2540] text-white font-bold text-xs"
              >
                {savingParty
                  ? 'Saving...'
                  : isSupplierScreen
                    ? 'Add Supplier'
                    : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Party Ledger Transaction History & Entry Modal */}
      {selectedParty && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#0A2540]">
                  {selectedParty.name}
                </h3>
                <p className="text-xs text-slate-500">{selectedParty.phone}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParty(null)}
                className="text-xs font-bold text-slate-400"
              >
                Close
              </button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="Amount ₹"
                  className="border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as 'PAYMENT' | 'PURCHASE')}
                  className="border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold"
                >
                  <option value="PAYMENT">You Gave (+)</option>
                  <option value="PURCHASE">You Got (-)</option>
                </select>
                <button
                  type="button"
                  disabled={savingTx}
                  onClick={handleAddLedgerTransaction}
                  className="bg-[#0A2540] text-white text-xs font-bold rounded-xl py-2 disabled:opacity-50"
                >
                  {savingTx ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
              <input
                type="text"
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
                placeholder="Notes (optional, e.g. UPI settlement)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {(selectedParty.ledger || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No transactions yet</p>
              ) : (
                (selectedParty.ledger || []).map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-slate-50 rounded-xl p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-800">{entry.notes || entry.type}</p>
                      <p className="text-[10px] text-slate-400">
                        {entry.dateStr} {entry.timeStr}
                      </p>
                    </div>
                    <span
                      className={`font-extrabold tabular-nums ${
                        entry.type === 'PAYMENT' ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      ₹{entry.amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ApkPhotoSheet
        isOpen={avatarPhotoSheetOpen}
        onClose={() => setAvatarPhotoSheetOpen(false)}
        title={isSupplierScreen ? 'Supplier Photo' : 'Customer Photo'}
        onUploaded={(url) => setPartyAvatar(url)}
      />
    </div>
  );
  }

  return (
    <>
      {screenContent}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold max-w-xs w-[90%] ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-[#0A2540] text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)}>
            <X className="w-3.5 h-3.5 opacity-80" />
          </button>
        </div>
      )}
    </>
  );
};
