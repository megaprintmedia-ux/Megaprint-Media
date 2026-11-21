import React, { useMemo, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CashBookAccount,
  CashBookCategory,
  CashBookEntry,
  CashBookEntryType,
  ChartAccount,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Invoice,
  SupplierInvoice,
  UserRole,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { DayViewControls } from './DayViewControls';
import { validDay } from '../utils/dateViews';
import { StatusText } from './StatusText';

interface CashBookViewProps {
  role: UserRole;
  settings: CompanySettings;
  chartOfAccounts: ChartAccount[];
  cashBookEntries: CashBookEntry[];
  invoices: Invoice[];
  supplierInvoices: SupplierInvoice[];
  onCreateCashBookEntry: (
    input: Omit<
      CashBookEntry,
      'id' | 'recordedByName' | 'ownerUid' | 'viewerUids' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<string | undefined>;
  onUpdateCashBookEntry?: (
    entryId: string,
    input: {
      entryNumber: string;
      entryDate: string;
      entryType: CashBookEntryType;
      account: CashBookAccount;
      counterparty: string;
      category: CashBookCategory;
      reference: string;
      linkedDocRef: string;
      amount: number;
      reconciled: boolean;
      notes: string;
    }
  ) => Promise<void>;
  onToggleCashBookReconciled: (entry: CashBookEntry) => Promise<void>;
  onDeleteCashBookEntry: (entryId: string) => Promise<void>;
}

const ENTRY_TYPES: CashBookEntryType[] = [
  'Receipt (Inflow)',
  'Payment (Outflow)',
  'Contra / Transfer',
];

const CATEGORIES: CashBookCategory[] = [
  'Customer Receipt',
  'Supplier Payment',
  'Withholding Tax (ZIMRA)',
  'Sales Commission',
  'Wages & Casuals',
  'Transport & Fuel',
  'Workshop Petty Cash',
  'Bank Deposit / Transfer',
  'Other Operating',
];

export const CashBookView: React.FC<CashBookViewProps> = ({
  role,
  settings,
  chartOfAccounts,
  cashBookEntries,
  invoices,
  supplierInvoices,
  onCreateCashBookEntry,
  onUpdateCashBookEntry,
  onToggleCashBookReconciled,
  onDeleteCashBookEntry,
}) => {
  const activeAccounts = useMemo(() => {
    const coaCash = chartOfAccounts.filter((a) => a.isCashBookAccount && a.isActive);
    if (coaCash.length > 0) {
      return coaCash.map((a) => ({
        name: a.name,
        code: a.code,
        currency: a.currency || settings.currency,
        openingBalance: a.openingBalance || 0,
      }));
    }
    return DEFAULT_ZIM_CASH_ACCOUNTS.map((name) => ({
      name,
      code: '',
      currency: settings.currency,
      openingBalance: 0,
    }));
  }, [chartOfAccounts, settings.currency]);

  const accountNames = useMemo(() => {
    const set = new Set(activeAccounts.map((a) => a.name));
    cashBookEntries.forEach((e) => {
      if (e.account) set.add(e.account);
    });
    return Array.from(set);
  }, [activeAccounts, cashBookEntries]);

  const [accountFilter, setAccountFilter] = useState<'All' | CashBookAccount>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | CashBookEntryType>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [entryDay, setEntryDay] = useState('');
  const [sortOrder, setSortOrder] = useState<'chronological' | 'latest'>('latest');
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryType, setEntryType] = useState<CashBookEntryType>('Receipt (Inflow)');
  const [account, setAccount] = useState<CashBookAccount>(
    activeAccounts[0]?.name || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [category, setCategory] = useState<CashBookCategory>('Customer Receipt');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [linkedDocRef, setLinkedDocRef] = useState('');
  const [reconciled, setReconciled] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Management Edit & Delete state
  const [editingEntry, setEditingEntry] = useState<CashBookEntry | null>(null);
  const [editEntryNumber, setEditEntryNumber] = useState('');
  const [editEntryDate, setEditEntryDate] = useState('');
  const [editEntryType, setEditEntryType] =
    useState<CashBookEntryType>('Receipt (Inflow)');
  const [editAccount, setEditAccount] = useState<CashBookAccount>(
    activeAccounts[0]?.name || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [editCategory, setEditCategory] =
    useState<CashBookCategory>('Customer Receipt');
  const [editCounterparty, setEditCounterparty] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editReference, setEditReference] = useState('');
  const [editLinkedDocRef, setEditLinkedDocRef] = useState('');
  const [editReconciled, setEditReconciled] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmEntry, setDeleteConfirmEntry] =
    useState<CashBookEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const accountBalances = useMemo(() => {
    const map: Record<
      string,
      {
        inflows: number;
        outflows: number;
        openingBalance: number;
        balance: number;
        currency: string;
        code: string;
      }
    > = {};

    activeAccounts.forEach((acc) => {
      map[acc.name] = {
        inflows: 0,
        outflows: 0,
        openingBalance: acc.openingBalance,
        balance: acc.openingBalance,
        currency: acc.currency,
        code: acc.code,
      };
    });

    cashBookEntries.forEach((entry) => {
      if (!map[entry.account]) {
        map[entry.account] = {
          inflows: 0,
          outflows: 0,
          openingBalance: 0,
          balance: 0,
          currency: settings.currency,
          code: '',
        };
      }
      const bucket = map[entry.account];
      if (entry.entryType === 'Receipt (Inflow)') {
        bucket.inflows = round2(bucket.inflows + entry.amount);
        bucket.balance = round2(bucket.balance + entry.amount);
      } else if (entry.entryType === 'Payment (Outflow)') {
        bucket.outflows = round2(bucket.outflows + entry.amount);
        bucket.balance = round2(bucket.balance - entry.amount);
      } else {
        bucket.inflows = round2(bucket.inflows + entry.amount);
        bucket.balance = round2(bucket.balance + entry.amount);
      }
    });

    return map;
  }, [activeAccounts, cashBookEntries, settings.currency]);

  const ledgerRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const scoped = cashBookEntries.filter((entry) => {
      if (accountFilter !== 'All' && entry.account !== accountFilter) return false;
      if (typeFilter !== 'All' && entry.entryType !== typeFilter) return false;
      if (!q) return true;
      return (
        entry.entryNumber.toLowerCase().includes(q) ||
        entry.counterparty.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        (entry.reference || '').toLowerCase().includes(q) ||
        (entry.linkedDocRef || '').toLowerCase().includes(q)
      );
    });

    // Sort ascending for accurate running balance calculation
    const chrono = [...scoped].sort((a, b) => {
      const d = (a.entryDate || '').localeCompare(b.entryDate || '');
      if (d !== 0) return d;
      return (a.entryNumber || '').localeCompare(b.entryNumber || '');
    });

    const startingBal =
      typeFilter === 'All' && !searchQuery.trim()
        ? accountFilter === 'All'
          ? activeAccounts.reduce((sum, a) => sum + a.openingBalance, 0)
          : accountBalances[accountFilter]?.openingBalance || 0
        : 0;

    let running = round2(startingBal);
    const withBalance = chrono.map((entry) => {
      const isOutflow = entry.entryType === 'Payment (Outflow)';
      const debit = isOutflow ? 0 : entry.amount;
      const credit = isOutflow ? entry.amount : 0;
      running = round2(running + debit - credit);
      return {
        entry,
        debit,
        credit,
        runningBalance: running,
      };
    });

    // Calculate balances using all earlier rows before selecting a day.
    const visible = withBalance.filter(r => !entryDay || validDay(r.entry.entryDate) === entryDay);
    return sortOrder === 'latest' ? [...visible].reverse() : visible;
  }, [
    cashBookEntries,
    accountFilter,
    typeFilter,
    searchQuery,
    sortOrder,
    entryDay,
    activeAccounts,
    accountBalances,
  ]);

  const metrics = useMemo(() => {
    const totalInflows = round2(ledgerRows.reduce((acc, r) => acc + r.debit, 0));
    const totalOutflows = round2(ledgerRows.reduce((acc, r) => acc + r.credit, 0));
    const openingTotal =
      !entryDay && typeFilter === 'All' && !searchQuery.trim()
        ? accountFilter === 'All'
          ? round2(activeAccounts.reduce((sum, a) => sum + a.openingBalance, 0))
          : round2(accountBalances[accountFilter]?.openingBalance || 0)
        : 0;
    const netBalance = round2(openingTotal + totalInflows - totalOutflows);
    const unreconciledCount = ledgerRows.filter((r) => !r.entry.reconciled).length;
    return { totalInflows, totalOutflows, netBalance, unreconciledCount };
  }, [
    ledgerRows,
    entryDay,
    typeFilter,
    searchQuery,
    accountFilter,
    activeAccounts,
    accountBalances,
  ]);

  const resetForm = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryType('Receipt (Inflow)');
    setAccount(activeAccounts[0]?.name || DEFAULT_ZIM_CASH_ACCOUNTS[0]);
    setCategory('Customer Receipt');
    setCounterparty('');
    setAmount('');
    setReference('');
    setLinkedDocRef('');
    setReconciled(false);
    setNotes('');
  };

  const handleLinkInvoiceQuickPick = (docNum: string) => {
    setLinkedDocRef(docNum);
    const custInv = invoices.find((i) => i.invoiceNumber === docNum);
    if (custInv) {
      setEntryType('Receipt (Inflow)');
      setCategory('Customer Receipt');
      setCounterparty(custInv.clientName);
      if (!amount) setAmount(String(custInv.balanceDue || custInv.grossAmount));
      return;
    }
    const supInv = supplierInvoices.find(
      (s) => s.supplierInvoiceNo === docNum || s.recordNumber === docNum
    );
    if (supInv) {
      setEntryType('Payment (Outflow)');
      setCategory('Supplier Payment');
      setCounterparty(supInv.supplierName);
      if (!amount) setAmount(String(supInv.balanceDue || supInv.grossAmount));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = round2(Number(amount) || 0);
    if (!counterparty.trim() || numericAmount <= 0) return;

    setSaving(true);
    try {
      const nextNo = `CB-${new Date().getFullYear()}-${String(
        1 + cashBookEntries.length
      ).padStart(3, '0')}`;
      await onCreateCashBookEntry({
        entryNumber: nextNo,
        entryDate,
        entryType,
        account,
        counterparty: counterparty.trim(),
        category,
        reference: reference.trim(),
        linkedDocRef: linkedDocRef.trim(),
        amount: numericAmount,
        reconciled,
        notes: notes.trim(),
      });
      resetForm();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (entry: CashBookEntry) => {
    setEditingEntry(entry);
    setEditEntryNumber(entry.entryNumber);
    setEditEntryDate(entry.entryDate);
    setEditEntryType(entry.entryType);
    setEditAccount(entry.account);
    setEditCategory(entry.category);
    setEditCounterparty(entry.counterparty);
    setEditAmount(String(entry.amount));
    setEditReference(entry.reference || '');
    setEditLinkedDocRef(entry.linkedDocRef || '');
    setEditReconciled(Boolean(entry.reconciled));
    setEditNotes(entry.notes || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !onUpdateCashBookEntry) return;
    const numericAmount = round2(Number(editAmount) || 0);
    if (!editCounterparty.trim() || numericAmount <= 0) return;

    setSavingEdit(true);
    try {
      await onUpdateCashBookEntry(editingEntry.id, {
        entryNumber: editEntryNumber.trim() || editingEntry.entryNumber,
        entryDate: editEntryDate,
        entryType: editEntryType,
        account: editAccount,
        counterparty: editCounterparty.trim(),
        category: editCategory,
        reference: editReference.trim(),
        linkedDocRef: editLinkedDocRef.trim(),
        amount: numericAmount,
        reconciled: editReconciled,
        notes: editNotes.trim(),
      });
      setEditingEntry(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmEntry) return;
    setDeleting(true);
    try {
      await onDeleteCashBookEntry(deleteConfirmEntry.id);
      setDeleteConfirmEntry(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [
        'Entry #',
        'Date',
        'Account',
        'Type',
        'Category',
        'Counterparty',
        'Reference',
        'Linked Doc',
        'Debit (Inflow)',
        'Credit (Outflow)',
        'Running Balance',
        'Reconciled',
      ],
      ...ledgerRows.map((r) => [
        r.entry.entryNumber,
        r.entry.entryDate,
        r.entry.account,
        r.entry.entryType,
        r.entry.category,
        r.entry.counterparty,
        r.entry.reference || '',
        r.entry.linkedDocRef || '',
        r.debit ? r.debit.toFixed(2) : '0.00',
        r.credit ? r.credit.toFixed(2) : '0.00',
        r.runningBalance.toFixed(2),
        r.entry.reconciled ? 'Reconciled' : 'Pending',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megaprint-cash-book-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            {entryDay ? 'Net Movement for Selected Day' : 'Net Cash & Bank Position'}
          </div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              metrics.netBalance >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatMoney(metrics.netBalance, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {accountFilter === 'All' ? 'Combined all accounts' : accountFilter}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Total Receipts (Debit / In)
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
            {formatMoney(metrics.totalInflows, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Customer collections &amp; deposits
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Total Payments (Credit / Out)
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {formatMoney(metrics.totalOutflows, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Supplier payouts, wages &amp; petty cash
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Unreconciled Entries
          </div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              metrics.unreconciledCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {metrics.unreconciledCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Pending bank / EcoCash statement match
          </div>
        </div>
      </div>

      {/* Per-Account Balances Strip */}
      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 no-print">
        {accountNames.map((accName) => {
          const stats = accountBalances[accName] || {
            inflows: 0,
            outflows: 0,
            openingBalance: 0,
            balance: 0,
            currency: settings.currency,
            code: '',
          };
          const isSelected = accountFilter === accName;
          return (
            <button
              key={accName}
              type="button"
              onClick={() =>
                setAccountFilter((prev) => (prev === accName ? 'All' : accName))
              }
              className={`p-4 text-left transition-colors ${
                isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between gap-2">
                <span className="truncate">
                  {stats.code ? `${stats.code} · ` : ''}
                  {accName}
                </span>
                {isSelected && (
                  <span className="text-blue-600 font-semibold shrink-0">Filtered</span>
                )}
              </div>
              <div className="mt-1 font-mono-nums text-base font-bold text-slate-900">
                {formatMoney(stats.balance, stats.currency || settings.currency)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono-nums">
                In {formatMoney(stats.inflows, stats.currency || settings.currency)} · Out{' '}
                {formatMoney(stats.outflows, stats.currency || settings.currency)}
              </div>
            </button>
          );
        })}
      </div>

      <DayViewControls label="Cash book" dates={cashBookEntries.map(e => e.entryDate)} day={entryDay} onDayChange={setEntryDay} />
      {/* Filter & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={accountFilter}
            onChange={(e) =>
              setAccountFilter(e.target.value as 'All' | CashBookAccount)
            }
            className="border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white font-medium text-slate-700"
            aria-label="Filter by cash account"
          >
            <option value="All">All Cash &amp; Bank Accounts</option>
            {accountNames.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'All' | CashBookEntryType)
            }
            className="border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white font-medium text-slate-700"
            aria-label="Filter by transaction type"
          >
            <option value="All">All Entry Types</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(e.target.value as 'chronological' | 'latest')
            }
            className="border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white font-medium text-slate-700"
            aria-label="Sort ledger order"
          >
            <option value="chronological">Chronological (Running Bal)</option>
            <option value="latest">Latest First</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ref, party, doc #..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Cash Book Entry</span>
          </button>
        </div>
      </div>

      {/* Cash Book Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-semibold text-slate-900">
            {settings.companyName} Cash Book Ledger{' '}
            {accountFilter !== 'All' ? `· ${accountFilter}` : ''}
          </div>
          <div className="text-slate-500 font-mono-nums">
            {ledgerRows.length} entries
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                <th className="py-3 px-4">Entry # &amp; Date</th>
                <th className="py-3 px-4">Account &amp; Type</th>
                <th className="py-3 px-4">Counterparty &amp; Category</th>
                <th className="py-3 px-4">Reference / Doc</th>
                <th className="py-3 px-4 text-right">Debit (In)</th>
                <th className="py-3 px-4 text-right">Credit (Out)</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Recon</th>
                <th className="py-3 px-4 text-right no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {ledgerRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No Cash Book transactions recorded for this filter. Record USD/ZWG
                    cash, EcoCash, ZIPIT, or bank receipts and payments to maintain a live
                    running balance.
                  </td>
                </tr>
              ) : (
                ledgerRows.map(({ entry, debit, credit, runningBalance }) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono-nums font-semibold text-slate-900">
                        {entry.entryNumber}
                      </div>
                      <div className="font-mono-nums text-[11px] text-slate-500 mt-0.5">
                        {entry.entryDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium text-slate-900">{entry.account}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {entry.entryType}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium text-slate-900">
                        {entry.counterparty}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {entry.category}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top font-mono-nums">
                      <div className="text-slate-800">{entry.reference || '—'}</div>
                      {entry.linkedDocRef && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Doc: {entry.linkedDocRef}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top text-right font-mono-nums font-semibold text-emerald-700">
                      {debit > 0 ? formatMoney(debit, settings.currency) : '—'}
                    </td>
                    <td className="py-3 px-4 align-top text-right font-mono-nums font-semibold text-red-700">
                      {credit > 0 ? formatMoney(credit, settings.currency) : '—'}
                    </td>
                    <td
                      className={`py-3 px-4 align-top text-right font-mono-nums font-bold ${
                        runningBalance >= 0 ? 'text-slate-900' : 'text-red-700'
                      }`}
                    >
                      {formatMoney(runningBalance, settings.currency)}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <button
                        type="button"
                        onClick={() => onToggleCashBookReconciled(entry)}
                        className="inline-flex items-center hover:underline"
                        title="Click to toggle reconciliation status"
                      >
                        <StatusText
                          status={entry.reconciled ? 'Reconciled' : 'Pending'}
                        />
                      </button>
                    </td>
                    <td className="py-3 px-4 align-top text-right no-print">
                      {role === 'management' && (
                        <div className="inline-flex items-center justify-end gap-1">
                          {onUpdateCashBookEntry && (
                            <button
                              type="button"
                              onClick={() => openEditModal(entry)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                              title="Edit entry"
                              aria-label={`Edit ${entry.entryNumber}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmEntry(entry)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete entry"
                            aria-label={`Delete ${entry.entryNumber}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Cash Book Entry Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Record Cash Book Transaction
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Log receipts, supplier payouts, petty cash disbursements, or bank
                  transfers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              className="p-6 overflow-y-auto space-y-4 text-xs"
            >
              {(invoices.length > 0 || supplierInvoices.length > 0) && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                  <label className="block font-medium text-slate-700 mb-1">
                    Quick-Link to Customer or Supplier Invoice (Optional)
                  </label>
                  <select
                    value={linkedDocRef}
                    onChange={(e) => handleLinkInvoiceQuickPick(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-xs"
                  >
                    <option value="">— Standalone / Petty Cash / Other Entry —</option>
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.invoiceNumber}>
                        [Receipt] {inv.invoiceNumber} · {inv.clientName} (Bal:{' '}
                        {formatMoney(inv.balanceDue, settings.currency)})
                      </option>
                    ))}
                    {supplierInvoices.map((si) => (
                      <option
                        key={si.id}
                        value={si.supplierInvoiceNo || si.recordNumber}
                      >
                        [Payout] {si.recordNumber} · {si.supplierName} (Bal:{' '}
                        {formatMoney(si.balanceDue, settings.currency)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Entry Type *
                  </label>
                  <select
                    value={entryType}
                    onChange={(e) =>
                      setEntryType(e.target.value as CashBookEntryType)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {ENTRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Cash / Bank Account *
                  </label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value as CashBookAccount)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {accountNames.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CashBookCategory)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Payee / Payer (Counterparty) *
                  </label>
                  <input
                    type="text"
                    required
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    placeholder="Client, supplier, staff member, or bank"
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    EcoCash / ZIPIT / RTGS / Bank Ref
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. ZIPIT-884120 or EC2604..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Linked Invoice / Voucher #
                  </label>
                  <input
                    type="text"
                    value={linkedDocRef}
                    onChange={(e) => setLinkedDocRef(e.target.value)}
                    placeholder="e.g. INV-2026-082"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Narration / Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Purpose of receipt or disbursement"
                  className="w-full border border-slate-200 rounded-md px-3 py-2"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reconciled}
                  onChange={(e) => setReconciled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="font-medium text-slate-800">
                  Mark as verified &amp; reconciled against bank / EcoCash statement
                </span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Recording...' : 'Save Cash Book Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Edit Cash Book Entry Modal */}
      {editingEntry && role === 'management' && onUpdateCashBookEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-2xl w-full max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Edit Cash Book Entry ·{' '}
                  <span className="font-mono-nums">{editingEntry.entryNumber}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Management correction for posted cash, bank, EcoCash, or ZIPIT
                  transaction.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="p-6 overflow-y-auto space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Entry Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editEntryNumber}
                    onChange={(e) => setEditEntryNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editEntryDate}
                    onChange={(e) => setEditEntryDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Entry Type *
                  </label>
                  <select
                    value={editEntryType}
                    onChange={(e) =>
                      setEditEntryType(e.target.value as CashBookEntryType)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {ENTRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Cash / Bank Account *
                  </label>
                  <select
                    value={editAccount}
                    onChange={(e) => setEditAccount(e.target.value as CashBookAccount)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {accountNames.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(e.target.value as CashBookCategory)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount ({settings.currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Payee / Payer (Counterparty) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCounterparty}
                    onChange={(e) => setEditCounterparty(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    EcoCash / ZIPIT / RTGS / Bank Ref
                  </label>
                  <input
                    type="text"
                    value={editReference}
                    onChange={(e) => setEditReference(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Linked Invoice / Voucher #
                  </label>
                  <input
                    type="text"
                    value={editLinkedDocRef}
                    onChange={(e) => setEditLinkedDocRef(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Narration / Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editReconciled}
                  onChange={(e) => setEditReconciled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="font-medium text-slate-800">
                  Verified &amp; reconciled against bank / EcoCash statement
                </span>
              </label>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Delete Confirmation Modal */}
      {deleteConfirmEntry && role === 'management' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Delete Cash Book Entry?
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  This permanently removes{' '}
                  <strong className="font-mono-nums text-slate-800">
                    {deleteConfirmEntry.entryNumber}
                  </strong>{' '}
                  ({deleteConfirmEntry.counterparty} ·{' '}
                  {formatMoney(deleteConfirmEntry.amount, settings.currency)}) from the{' '}
                  {deleteConfirmEntry.account} ledger and recalculates running balances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmEntry(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmEntry(null)}
                className="px-3.5 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-3.5 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
