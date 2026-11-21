import React, { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  CashBookEntry,
  CompanySettings,
  Expense,
  ExpenseCategory,
  GoodsReceipt,
  InventoryItem,
  InventoryMovement,
  Invoice,
  Job,
  OpeningBalanceRecord,
  PayrollRun,
  PricingMode,
  SupplierInvoice,
  TaxAccessScope,
  UserRole,
  VatTreatment,
} from '../types/erp';
import {
  calculateVatBreakdown,
  calculateWithholdingTax,
  computeExpenseVatReportable,
  formatMoney,
  round2,
  summarizeTaxBreakdown,
} from '../utils/vat';
import {
  classifySupplierInvoiceLines,
  COGS_SUPPLIER_CATEGORIES,
  computeAccountingLedger,
} from '../utils/inventoryAccounting';
import { DailyExpenseWorksheet } from './DailyWorksheets';
import { DayViewControls } from './DayViewControls';
import { DateSort, datedRecords } from '../utils/dateViews';
import { DraftControls, useFormDraft } from './FormDraft';
import { StatusText } from './StatusText';

interface AccountingViewProps {
  role?: UserRole;
  taxScope?: TaxAccessScope;
  settings: CompanySettings;
  invoices: Invoice[];
  expenses: Expense[];
  supplierInvoices: SupplierInvoice[];
  goodsReceipts?: GoodsReceipt[];
  inventoryItems?: InventoryItem[];
  inventoryMovements?: InventoryMovement[];
  payrollRuns?: PayrollRun[];
  cashBookEntries?: CashBookEntry[];
  openingBalances?: OpeningBalanceRecord[];
  jobs: Job[];
  onCreateExpense: (
    input: Omit<Expense, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateExpense?: (
    expenseId: string,
    input: {
      expenseNumber: string;
      vendorName: string;
      vendorVatPin?: string;
      vendorTin?: string;
      vendorVatReg?: string;
      vendorInvoiceRef?: string;
      category: ExpenseCategory;
      jobId?: string;
      expenseDate: string;
      vatTreatment: VatTreatment;
      isVatClaimable: boolean;
      vatRate: number;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
      whtApplicable?: boolean;
      whtRate?: number;
      whtAmount?: number;
      paymentStatus: 'Paid' | 'Payable';
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteExpense?: (expenseId: string) => Promise<void>;
  onToggleExpenseStatus: (expense: Expense) => Promise<void>;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Materials & Substrates',
  'Tailoring & Trims',
  'Payroll & Wages',
  'Utilities & Rent',
  'Equipment & Maintenance',
  'Logistics & Delivery',
  'Marketing & Admin',
];

const TREATMENT_LABELS: Record<VatTreatment, string> = {
  standard: 'Standard VAT',
  zero: 'Zero-Rated (0%)',
  exempt: 'Exempt',
};

export const AccountingView: React.FC<AccountingViewProps> = ({
  role = 'management',
  taxScope = 'all',
  settings,
  invoices,
  expenses,
  supplierInvoices,
  goodsReceipts = [],
  inventoryItems = [],
  inventoryMovements = [],
  payrollRuns = [],
  cashBookEntries = [],
  openingBalances = [],
  jobs,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onToggleExpenseStatus,
}) => {
  const isVatOnly = role === 'accounts' && taxScope === 'vat_only';
  const isManagement = role === 'management' && !isVatOnly;

  const [expenseDay, setExpenseDay] = useState('');
  const [dateSort, setDateSort] = useState<DateSort>('newest');
  const visibleExpenses = useMemo(() => datedRecords(expenses, e => e.expenseDate, expenseDay, dateSort), [expenses, expenseDay, dateSort]);
  const [activeTab, setActiveTab] = useState<'vat' | 'pnl' | 'expenses'>('vat');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const effectiveTab = isVatOnly && activeTab === 'pnl' ? 'vat' : activeTab;

  // New expense form
  const [vendorName, setVendorName] = useState('');
  const [vendorTin, setVendorTin] = useState('');
  const [vendorVatReg, setVendorVatReg] = useState('');
  const [vendorInvoiceRef, setVendorInvoiceRef] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Materials & Substrates');
  const [jobId, setJobId] = useState('');
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [vatTreatment, setVatTreatment] = useState<VatTreatment>('standard');
  const [isVatClaimable, setIsVatClaimable] = useState(true);
  const [pricingMode, setPricingMode] = useState<PricingMode>('inclusive');
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate ?? 15));
  const [whtApplicable, setWhtApplicable] = useState(false);
  const [whtRate, setWhtRate] = useState('30');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Payable'>('Paid');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const entryDraft = useFormDraft({ form: 'expense', active: showAddExpense, values: { vendorName, vendorTin, vendorVatReg, vendorInvoiceRef, category, jobId, expenseDate, vatTreatment, isVatClaimable, pricingMode, amount, vatRate, whtApplicable, whtRate, paymentStatus, notes }, restore: d => { setVendorName(d.vendorName); setVendorTin(d.vendorTin); setVendorVatReg(d.vendorVatReg); setVendorInvoiceRef(d.vendorInvoiceRef); setCategory(d.category); setJobId(d.jobId); setExpenseDate(d.expenseDate); setVatTreatment(d.vatTreatment); setIsVatClaimable(d.isVatClaimable); setPricingMode(d.pricingMode); setAmount(d.amount); setVatRate(d.vatRate); setWhtApplicable(d.whtApplicable); setWhtRate(d.whtRate); setPaymentStatus(d.paymentStatus); setNotes(d.notes); } });

  // Edit expense form
  const [editExpNumber, setEditExpNumber] = useState('');
  const [editVendorName, setEditVendorName] = useState('');
  const [editVendorTin, setEditVendorTin] = useState('');
  const [editVendorVatReg, setEditVendorVatReg] = useState('');
  const [editVendorInvoiceRef, setEditVendorInvoiceRef] = useState('');
  const [editCategory, setEditCategory] =
    useState<ExpenseCategory>('Materials & Substrates');
  const [editJobId, setEditJobId] = useState('');
  const [editExpenseDate, setEditExpenseDate] = useState('');
  const [editVatTreatment, setEditVatTreatment] = useState<VatTreatment>('standard');
  const [editIsVatClaimable, setEditIsVatClaimable] = useState(true);
  const [editPricingMode, setEditPricingMode] = useState<PricingMode>('inclusive');
  const [editAmount, setEditAmount] = useState('');
  const [editVatRate, setEditVatRate] = useState('15');
  const [editWhtApplicable, setEditWhtApplicable] = useState(false);
  const [editWhtRate, setEditWhtRate] = useState('30');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'Paid' | 'Payable'>('Paid');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const vatPreview = calculateVatBreakdown({
    amount: Number(amount) || 0,
    pricingMode,
    vatTreatment,
    vatRate: vatTreatment === 'standard' ? Number(vatRate) || 0 : 0,
  });

  const whtPreviewAmount = calculateWithholdingTax({
    applicable: whtApplicable,
    baseAmount: vatPreview.netAmount,
    ratePct: Number(whtRate) || 0,
  });

  const editVatPreview = calculateVatBreakdown({
    amount: Number(editAmount) || 0,
    pricingMode: editPricingMode,
    vatTreatment: editVatTreatment,
    vatRate: editVatTreatment === 'standard' ? Number(editVatRate) || 0 : 0,
  });

  const editWhtPreviewAmount = calculateWithholdingTax({
    applicable: editWhtApplicable,
    baseAmount: editVatPreview.netAmount,
    ratePct: Number(editWhtRate) || 0,
  });

  const ledger = useMemo(() => {
    const validInvoices = invoices.filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft'
    );
    const shared = computeAccountingLedger({
      invoices,
      expenses,
      supplierInvoices,
      goodsReceipts,
      inventoryItems,
      inventoryMovements,
      payrollRuns,
      jobs,
      cashBookEntries,
    });

    let outputStandardNet = 0;
    let outputZeroRated = 0;
    let outputExempt = 0;
    validInvoices.forEach((i) => {
      const sum = summarizeTaxBreakdown(i.lines || [], {
        netAmount: i.netAmount,
        vatAmount: i.vatAmount,
        grossAmount: i.grossAmount,
      });
      outputStandardNet += i.standardNetAmount ?? sum.standardNetAmount;
      outputZeroRated += i.zeroRatedAmount ?? sum.zeroRatedAmount;
      outputExempt += i.exemptAmount ?? sum.exemptAmount;
    });

    let inputStandardNet = 0;
    let inputZeroRated = 0;
    let inputExempt = 0;
    supplierInvoices.forEach((s) => {
      const sum = summarizeTaxBreakdown(s.lines || [], {
        vatTreatment: s.vatTreatment,
        netAmount: s.netAmount,
        vatAmount: s.vatAmount,
        grossAmount: s.grossAmount,
      });
      inputStandardNet += s.standardNetAmount ?? sum.standardNetAmount;
      inputZeroRated += s.zeroRatedAmount ?? sum.zeroRatedAmount;
      inputExempt += s.exemptAmount ?? sum.exemptAmount;
    });
    expenses.forEach((e) => {
      const t = e.vatTreatment ?? (e.vatAmount > 0 ? 'standard' : 'exempt');
      if (t === 'zero') inputZeroRated += e.netAmount;
      else if (t === 'exempt') inputExempt += e.netAmount;
      else inputStandardNet += e.netAmount;
    });

    const claimableExpenses = expenses.filter((e) => e.isVatClaimable);
    const claimableSupplierInvoices = supplierInvoices.filter(
      (s) => s.isVatClaimable
    );
    const inputVat = round2(
      shared.expenseInputVatClaimable + shared.supplierInputVatClaimable
    );
    const supplierWhtTotal = round2(
      shared.supplierWhtHeld +
        expenses.reduce((a, e) => a + (e.whtAmount || 0), 0)
    );
    const supplierWhtRemitted = round2(
      supplierInvoices
        .filter((s) => s.whtRemitted)
        .reduce((a, s) => a + (s.whtAmount || 0), 0)
    );
    const supplierWhtPending = round2(
      Math.max(0, supplierWhtTotal - supplierWhtRemitted)
    );

    // Non-COGS operating expense breakdown by category (excluding capitalized stock lines)
    const opexByCategory = new Map<string, number>();
    for (const e of expenses) {
      if (e.category === 'Materials & Substrates' || e.category === 'Tailoring & Trims') {
        continue;
      }
      const eff = e.isVatClaimable
        ? round2(e.netAmount || 0)
        : round2(e.grossAmount || (e.netAmount || 0) + (e.vatAmount || 0));
      opexByCategory.set(e.category, round2((opexByCategory.get(e.category) || 0) + eff));
    }
    for (const si of supplierInvoices) {
      if (COGS_SUPPLIER_CATEGORIES.includes(si.category)) continue;
      const lines = classifySupplierInvoiceLines(si, goodsReceipts);
      const nonStockSum = lines
        .filter((l) => l.treatment !== 'stock')
        .reduce((a, l) => a + l.effectiveCost, 0);
      if (nonStockSum > 0) {
        opexByCategory.set(
          si.category,
          round2((opexByCategory.get(si.category) || 0) + nonStockSum)
        );
      }
    }

    const openingReceivables = round2(
      openingBalances
        .filter((b) => b.recordType === 'receivable')
        .reduce((a, b) => a + (b.outstandingUSD || 0), 0)
    );
    const openingCredits = round2(
      openingBalances
        .filter((b) => b.recordType === 'customer_credit')
        .reduce((a, b) => a + (b.outstandingUSD || 0), 0)
    );
    const openingPayablesUnmatched = round2(
      openingBalances
        .filter(
          (b) =>
            (b.recordType === 'supplier_payable_invoice' ||
              b.recordType === 'supplier_opening_accrual') &&
            !b.isMatchedExisting
        )
        .reduce((a, b) => a + (b.outstandingUSD || 0), 0)
    );

    return {
      ...shared,
      validInvoices,
      salesNet: shared.invoicedNet,
      outputStandardNet: round2(outputStandardNet),
      outputZeroRated: round2(outputZeroRated),
      outputExempt: round2(outputExempt),
      salesGross: shared.invoicedGross,
      cashCollected: shared.cashCollectedInvoices,
      inputStandardNet: round2(inputStandardNet),
      inputZeroRated: round2(inputZeroRated),
      inputExempt: round2(inputExempt),
      claimableExpenses,
      claimableSupplierInvoices,
      inputVat,
      netOperatingProfit: shared.netProfit,
      opexByCategory,
      supplierWhtTotal,
      supplierWhtRemitted,
      supplierWhtPending,
      clientWhtCertificates: shared.whtCreditsReceivable,
      openingReceivables,
      openingCredits,
      openingPayablesUnmatched,
    };
  }, [
    invoices,
    expenses,
    supplierInvoices,
    goodsReceipts,
    inventoryItems,
    inventoryMovements,
    payrollRuns,
    jobs,
    cashBookEntries,
    openingBalances,
  ]);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName.trim()) return;
    setSaving(true);
    try {
      const nextExpNo = `EXP-${new Date().getFullYear()}-${String(204 + expenses.length).padStart(3, '0')}`;
      const cleanTin = vendorTin.trim().toUpperCase();
      const cleanVatReg = vendorVatReg.trim().toUpperCase();
      await onCreateExpense({
        expenseNumber: nextExpNo,
        vendorName: vendorName.trim(),
        vendorVatPin: cleanTin || cleanVatReg,
        vendorTin: cleanTin,
        vendorVatReg: cleanVatReg,
        vendorInvoiceRef: vendorInvoiceRef.trim(),
        category,
        jobId,
        expenseDate,
        vatTreatment,
        isVatClaimable: vatTreatment === 'standard' && isVatClaimable,
        vatRate: vatTreatment === 'standard' ? Number(vatRate) || 0 : 0,
        netAmount: vatPreview.netAmount,
        vatAmount: vatPreview.vatAmount,
        grossAmount: vatPreview.grossAmount,
        whtApplicable,
        whtRate: whtApplicable ? Number(whtRate) || 0 : 0,
        whtAmount: whtPreviewAmount,
        paymentStatus,
        notes: notes.trim(),
      });
      setVendorName('');
      setVendorTin('');
      setVendorVatReg('');
      setVendorInvoiceRef('');
      setAmount('');
      setWhtApplicable(false);
      setNotes('');
      entryDraft.clear();
      setShowAddExpense(false);
    } finally {
      setSaving(false);
    }
  };

  const openEditExpense = (exp: Expense) => {
    setEditingExpense(exp);
    setEditExpNumber(exp.expenseNumber);
    setEditVendorName(exp.vendorName);
    setEditVendorTin(exp.vendorTin || exp.vendorVatPin || '');
    setEditVendorVatReg(exp.vendorVatReg || '');
    setEditVendorInvoiceRef(exp.vendorInvoiceRef || '');
    setEditCategory(exp.category);
    setEditJobId(exp.jobId || '');
    setEditExpenseDate(exp.expenseDate);
    const t = exp.vatTreatment ?? (exp.vatAmount > 0 ? 'standard' : 'exempt');
    setEditVatTreatment(t);
    setEditIsVatClaimable(Boolean(exp.isVatClaimable));
    setEditPricingMode('inclusive');
    setEditAmount(String(exp.grossAmount));
    setEditVatRate(String(exp.vatRate ?? settings.defaultVatRate ?? 15));
    setEditWhtApplicable(Boolean(exp.whtApplicable));
    setEditWhtRate(String(exp.whtRate ?? 30));
    setEditPaymentStatus(exp.paymentStatus);
    setEditNotes(exp.notes || '');
  };

  const handleSaveEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !onUpdateExpense || !editVendorName.trim()) return;
    setSavingEdit(true);
    try {
      const cleanTin = editVendorTin.trim().toUpperCase();
      const cleanVatReg = editVendorVatReg.trim().toUpperCase();
      await onUpdateExpense(editingExpense.id, {
        expenseNumber: editExpNumber.trim() || editingExpense.expenseNumber,
        vendorName: editVendorName.trim(),
        vendorVatPin: cleanTin || cleanVatReg,
        vendorTin: cleanTin,
        vendorVatReg: cleanVatReg,
        vendorInvoiceRef: editVendorInvoiceRef.trim(),
        category: editCategory,
        jobId: editJobId,
        expenseDate: editExpenseDate,
        vatTreatment: editVatTreatment,
        isVatClaimable: editVatTreatment === 'standard' && editIsVatClaimable,
        vatRate: editVatTreatment === 'standard' ? Number(editVatRate) || 0 : 0,
        netAmount: editVatPreview.netAmount,
        vatAmount: editVatPreview.vatAmount,
        grossAmount: editVatPreview.grossAmount,
        whtApplicable: editWhtApplicable,
        whtRate: editWhtApplicable ? Number(editWhtRate) || 0 : 0,
        whtAmount: editWhtPreviewAmount,
        paymentStatus: editPaymentStatus,
        notes: editNotes.trim(),
      });
      setEditingExpense(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDeleteExpense = async () => {
    if (!deleteConfirmExpense || !onDeleteExpense) return;
    setDeleting(true);
    try {
      await onDeleteExpense(deleteConfirmExpense.id);
      setDeleteConfirmExpense(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExportVatCsv = () => {
    const rows = [
      [
        'Type',
        'Ref Number',
        'Party',
        'ZIMRA TIN',
        'VAT Reg #',
        'Tax Class',
        'Date',
        'Standard Net',
        'Zero-Rated (0%)',
        'Exempt',
        'Total Net',
        'VAT Amount',
        'Gross Amount',
        'WHT Amount',
      ],
      ...ledger.validInvoices.map((i) => {
        const sum = summarizeTaxBreakdown(i.lines || [], {
          netAmount: i.netAmount,
          vatAmount: i.vatAmount,
          grossAmount: i.grossAmount,
        });
        const std = i.standardNetAmount ?? sum.standardNetAmount;
        const zero = i.zeroRatedAmount ?? sum.zeroRatedAmount;
        const exm = i.exemptAmount ?? sum.exemptAmount;
        const cls =
          zero > 0 && std === 0 && exm === 0
            ? 'Zero-Rated 0%'
            : exm > 0 && std === 0 && zero === 0
              ? 'Exempt'
              : zero > 0 || exm > 0
                ? 'Mixed'
                : 'Standard VAT';
        return [
          'Output VAT (Sale)',
          i.invoiceNumber,
          i.clientName,
          i.clientTin || i.clientVatPin || '',
          i.clientVatReg || '',
          cls,
          i.issueDate,
          std.toFixed(2),
          zero.toFixed(2),
          exm.toFixed(2),
          i.netAmount.toFixed(2),
          i.vatAmount.toFixed(2),
          i.grossAmount.toFixed(2),
          (i.whtWithheldAmount || 0).toFixed(2),
        ];
      }),
      ...supplierInvoices.map((s) => {
        const sum = summarizeTaxBreakdown(s.lines || [], {
          vatTreatment: s.vatTreatment,
          netAmount: s.netAmount,
          vatAmount: s.vatAmount,
          grossAmount: s.grossAmount,
        });
        const std = s.standardNetAmount ?? sum.standardNetAmount;
        const zero = s.zeroRatedAmount ?? sum.zeroRatedAmount;
        const exm = s.exemptAmount ?? sum.exemptAmount;
        return [
          s.isVatClaimable
            ? 'Input VAT (Supplier Tax Invoice)'
            : 'Purchase (Non-Claimable / Zero / Exempt)',
          s.supplierInvoiceNo,
          s.supplierName,
          s.supplierTin || s.supplierTaxPin || '',
          s.supplierVatReg || '',
          TREATMENT_LABELS[s.vatTreatment] || 'Standard VAT',
          s.invoiceDate,
          std.toFixed(2),
          zero.toFixed(2),
          exm.toFixed(2),
          s.netAmount.toFixed(2),
          (s.isVatClaimable ? s.vatAmount : 0).toFixed(2),
          s.grossAmount.toFixed(2),
          (s.whtAmount || 0).toFixed(2),
        ];
      }),
      ...expenses.map((e) => {
        const t = e.vatTreatment ?? (e.vatAmount > 0 ? 'standard' : 'exempt');
        return [
          e.isVatClaimable ? 'Input VAT (Expense)' : 'Expense (Non-Claimable / Zero / Exempt)',
          e.expenseNumber,
          e.vendorName,
          e.vendorTin || e.vendorVatPin || '',
          e.vendorVatReg || '',
          TREATMENT_LABELS[t],
          e.expenseDate,
          (t === 'standard' ? e.netAmount : 0).toFixed(2),
          (t === 'zero' ? e.netAmount : 0).toFixed(2),
          (t === 'exempt' ? e.netAmount : 0).toFixed(2),
          e.netAmount.toFixed(2),
          (e.isVatClaimable ? e.vatAmount : 0).toFixed(2),
          e.grossAmount.toFixed(2),
          (e.whtAmount || 0).toFixed(2),
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megaprint-vat-schedule-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {!showAddExpense && <DraftControls draft={entryDraft} label="Expense" active={false} onResume={() => { setShowAddExpense(true); }} />}

      {isVatOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
          <strong>ZIMRA / VAT-Only Read-Only View:</strong> Showing only VAT-reportable
          invoices, claimable input VAT bills with ZIMRA TIN / VAT Reg #. Internal P&amp;L and
          non-VAT / no-TIN transactions are excluded.
        </div>
      )}

      {/* Top Tabs & Action */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab('vat')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              effectiveTab === 'vat'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            VAT Return Worksheet
          </button>
          {!isVatOnly && (
            <button
              type="button"
              onClick={() => setActiveTab('pnl')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                effectiveTab === 'pnl'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Profit &amp; Loss Statement
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              effectiveTab === 'expenses'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {isVatOnly
              ? `VAT Expenses (${expenses.length})`
              : `Supplier Bills & Expenses (${expenses.length})`}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportVatCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export VAT CSV</span>
          </button>
          {!isVatOnly && (
            <button
              type="button"
              onClick={() => setShowAddExpense(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Log Expense / Bill</span>
            </button>
          )}
        </div>
      </div>

      {/* VAT Return Tab */}
      {effectiveTab === 'vat' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Output VAT (Taxable Sales)</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(ledger.outputVat, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>Std Net: {formatMoney(ledger.outputStandardNet, settings.currency)}</div>
                <div>
                  Zero 0%: {formatMoney(ledger.outputZeroRated, settings.currency)} · Exempt:{' '}
                  {formatMoney(ledger.outputExempt, settings.currency)}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">
                Claimable Input VAT (Purchases)
              </div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
                {formatMoney(ledger.inputVat, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>Std Net: {formatMoney(ledger.inputStandardNet, settings.currency)}</div>
                <div>
                  Zero 0%: {formatMoney(ledger.inputZeroRated, settings.currency)} · Exempt:{' '}
                  {formatMoney(ledger.inputExempt, settings.currency)}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">
                {ledger.netVatPayable >= 0
                  ? 'Net VAT Payable to ZIMRA'
                  : 'Net VAT Credit / Refundable'}
              </div>
              <div
                className={`mt-2 font-mono-nums text-2xl font-semibold ${
                  ledger.netVatPayable >= 0 ? 'text-slate-900' : 'text-emerald-700'
                }`}
              >
                {formatMoney(Math.abs(ledger.netVatPayable), settings.currency)}
              </div>
              <div className="mt-2 text-[11px] text-slate-500 font-mono-nums">
                TIN: {settings.zimraTin || settings.taxPin || '—'} · VAT #:{' '}
                {settings.vatRegNumber || '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">
                ZIMRA Withholding Tax (WHT)
              </div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-amber-700">
                {formatMoney(ledger.supplierWhtPending, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>
                  Pending Remittance (Total {formatMoney(ledger.supplierWhtTotal, settings.currency)})
                </div>
                <div>
                  Client WHT Credits: {formatMoney(ledger.clientWhtCertificates, settings.currency)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
                Output VAT Schedule (Sales Invoices)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-4">Invoice</th>
                      <th className="py-2 px-4">Client TIN / VAT #</th>
                      <th className="py-2 px-4 text-right">Taxable / Zero / Exm</th>
                      <th className="py-2 px-4 text-right">Output VAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.validInvoices.map((inv) => {
                      const sum = summarizeTaxBreakdown(inv.lines || [], {
                        netAmount: inv.netAmount,
                        vatAmount: inv.vatAmount,
                        grossAmount: inv.grossAmount,
                      });
                      const std = inv.standardNetAmount ?? sum.standardNetAmount;
                      const zero = inv.zeroRatedAmount ?? sum.zeroRatedAmount;
                      const exm = inv.exemptAmount ?? sum.exemptAmount;
                      return (
                        <tr key={inv.id}>
                          <td className="py-2.5 px-4">
                            <div className="font-mono-nums font-semibold text-slate-900">
                              {inv.invoiceNumber}
                            </div>
                            <div className="text-slate-500">{inv.clientName}</div>
                          </td>
                          <td className="py-2.5 px-4 font-mono-nums text-slate-600">
                            <div>{inv.clientTin || inv.clientVatPin || '—'}</div>
                            {inv.clientVatReg && (
                              <div className="text-[11px] text-slate-400">
                                VAT {inv.clientVatReg}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-nums">
                            <div>{formatMoney(inv.netAmount, settings.currency)}</div>
                            {(zero > 0 || exm > 0) && (
                              <div className="text-[10px] text-slate-400">
                                {std > 0 ? `Std ${formatMoney(std, settings.currency)} · ` : ''}
                                {zero > 0 ? `Zero ${formatMoney(zero, settings.currency)}` : ''}
                                {exm > 0 ? ` Exm ${formatMoney(exm, settings.currency)}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-nums font-semibold text-slate-900">
                            {formatMoney(inv.vatAmount, settings.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
                Input VAT Schedule (Claimable Purchases)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-4">Ref / Vendor</th>
                      <th className="py-2 px-4">Vendor TIN / VAT #</th>
                      <th className="py-2 px-4 text-right">Net</th>
                      <th className="py-2 px-4 text-right">Input VAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.claimableSupplierInvoices.map((si) => (
                      <tr key={`si-${si.id}`}>
                        <td className="py-2.5 px-4">
                          <div className="font-mono-nums font-semibold text-blue-700">
                            {si.supplierInvoiceNo}
                          </div>
                          <div className="text-slate-500">{si.supplierName}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono-nums text-slate-600">
                          <div>{si.supplierTin || si.supplierTaxPin || '—'}</div>
                          {si.supplierVatReg && (
                            <div className="text-[11px] text-slate-400">
                              VAT {si.supplierVatReg}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums">
                          {formatMoney(si.netAmount, settings.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums font-semibold text-emerald-700">
                          {formatMoney(si.vatAmount, settings.currency)}
                        </td>
                      </tr>
                    ))}
                    {ledger.claimableExpenses.map((exp) => (
                      <tr key={exp.id}>
                        <td className="py-2.5 px-4">
                          <div className="font-mono-nums font-semibold text-slate-900">
                            {exp.vendorInvoiceRef || exp.expenseNumber}
                          </div>
                          <div className="text-slate-500">{exp.vendorName}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono-nums text-slate-600">
                          <div>{exp.vendorTin || exp.vendorVatPin || '—'}</div>
                          {exp.vendorVatReg && (
                            <div className="text-[11px] text-slate-400">
                              VAT {exp.vendorVatReg}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums">
                          {formatMoney(exp.netAmount, settings.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums font-semibold text-emerald-700">
                          {formatMoney(exp.vatAmount, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profit & Loss Statement Tab */}
      {effectiveTab === 'pnl' && !isVatOnly && (
        <div className="space-y-5 max-w-3xl">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Statement of Profit &amp; Loss (Excl. Claimable VAT)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Accrual &amp; stock-consumption basis: stock purchases capitalize to Inventory
                Asset and expense to COGS only when issued to jobs (net of returns).
              </p>
            </div>
            <div className="p-6 divide-y divide-slate-100 text-sm">
              <div className="py-3 flex justify-between">
                <span className="font-medium text-slate-900">
                  Revenue (Net Invoiced Sales, Excl. VAT)
                </span>
                <span className="font-mono-nums font-semibold text-slate-900">
                  {formatMoney(ledger.salesNet, settings.currency)}
                </span>
              </div>

              <div className="py-2.5 flex justify-between text-slate-600 text-xs">
                <span>
                  Less: Consumed Inventory Materials COGS (Issued{' '}
                  {formatMoney(ledger.stockIssuedCogsNet, settings.currency)} − Returned{' '}
                  {formatMoney(ledger.stockReturnedCogsCredit, settings.currency)})
                </span>
                <span className="font-mono-nums">
                  ({formatMoney(ledger.stockConsumedCogsNet, settings.currency)})
                </span>
              </div>
              <div className="py-2.5 flex justify-between text-slate-600 text-xs">
                <span>
                  Less: Direct Non-Stock Production Materials &amp; Subcontracting COGS
                </span>
                <span className="font-mono-nums">
                  ({formatMoney(ledger.directExpenseCogsNet, settings.currency)})
                </span>
              </div>
              <div className="py-3 flex justify-between font-semibold text-slate-800">
                <span>Total Cost of Goods Sold (COGS)</span>
                <span className="font-mono-nums">
                  ({formatMoney(ledger.cogsNet, settings.currency)})
                </span>
              </div>

              <div className="py-3 flex justify-between font-semibold bg-slate-50/70 px-2 rounded">
                <span className="text-slate-900">
                  Gross Profit ({ledger.grossMarginPct.toFixed(1)}%)
                </span>
                <span className="font-mono-nums text-slate-900">
                  {formatMoney(ledger.grossProfit, settings.currency)}
                </span>
              </div>

              {EXPENSE_CATEGORIES.filter(
                (c) => c !== 'Materials & Substrates' && c !== 'Tailoring & Trims'
              ).map((cat) => {
                const catSum = ledger.opexByCategory.get(cat) || 0;
                if (catSum === 0) return null;
                return (
                  <div key={cat} className="py-2.5 flex justify-between text-slate-600">
                    <span>{cat}</span>
                    <span className="font-mono-nums">
                      ({formatMoney(catSum, settings.currency)})
                    </span>
                  </div>
                );
              })}

              {ledger.payrollGross > 0 && (
                <div className="py-2.5 flex justify-between text-slate-600">
                  <span>Payroll &amp; Staff Remuneration (Gross)</span>
                  <span className="font-mono-nums">
                    ({formatMoney(ledger.payrollGross, settings.currency)})
                  </span>
                </div>
              )}

              {ledger.salesCommissions > 0 && (
                <div className="py-2.5 flex justify-between text-slate-600">
                  <span>Sales Team Commissions</span>
                  <span className="font-mono-nums">
                    ({formatMoney(ledger.salesCommissions, settings.currency)})
                  </span>
                </div>
              )}

              <div className="py-4 flex justify-between font-bold text-base">
                <span className="text-slate-900">Net Operating Profit / (Loss)</span>
                <span
                  className={`font-mono-nums ${
                    ledger.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {formatMoney(ledger.netOperatingProfit, settings.currency)}
                </span>
              </div>
              <div className="pt-3 flex justify-between text-xs text-slate-500">
                <span>Total Settled on Customer Invoices (Cash + WHT)</span>
                <span className="font-mono-nums font-medium text-slate-700">
                  {formatMoney(ledger.cashCollected, settings.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Inventory Asset & Stock-to-COGS Reconciliation Card */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Inventory Asset &amp; Reconciliation (Balance Sheet vs P&amp;L)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Unconsumed stock stays on Inventory Asset; supplier settlement &amp; AP remain on
                cash and payables schedules without double counting.
              </p>
            </div>
            <div className="p-6 divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="font-medium text-slate-800">
                  On-Hand Inventory Asset ({ledger.inventoryTotalUnits} units across{' '}
                  {inventoryItems.length} SKUs)
                </span>
                <span className="font-mono-nums font-bold text-blue-700">
                  {formatMoney(ledger.inventoryAssetValue, settings.currency)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">
                  Stock Purchases Capitalized on Classified / Linked Supplier Bills
                </span>
                <span className="font-mono-nums font-semibold text-slate-900">
                  {formatMoney(ledger.stockCapitalizedFromBills, settings.currency)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">
                  Accepted GRN Stock Value vs Linked Stock Bills (Variance)
                </span>
                <span className="font-mono-nums font-medium text-slate-800">
                  {formatMoney(ledger.acceptedGrnStockValue, settings.currency)} vs{' '}
                  {formatMoney(ledger.linkedStockBillValue, settings.currency)}{' '}
                  <span
                    className={
                      Math.abs(ledger.grnToBillVariance) > 0.05
                        ? 'text-amber-700 font-semibold'
                        : 'text-emerald-700'
                    }
                  >
                    ({ledger.grnToBillVariance >= 0 ? '+' : ''}
                    {formatMoney(ledger.grnToBillVariance, settings.currency)})
                  </span>
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">
                  Stock Receipts Posted / Stock Consumed to Jobs (Net)
                </span>
                <span className="font-mono-nums text-slate-800">
                  In {formatMoney(ledger.stockReceiptsCost, settings.currency)} · Net COGS{' '}
                  {formatMoney(ledger.stockConsumedCogsNet, settings.currency)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600">
                  Supplier Settlements &amp; Cash Outflow / Open AP Balance
                </span>
                <span className="font-mono-nums text-slate-800">
                  Settled {formatMoney(ledger.supplierPaid, settings.currency)} (Cash Out{' '}
                  {formatMoney(ledger.cashBookSupplierOutflow, settings.currency)}) · AP{' '}
                  <strong className="text-amber-700">
                    {formatMoney(ledger.supplierPayables, settings.currency)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {openingBalances.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Imported Pre-Cutover Opening Balances (Audit Reference)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Balance-sheet cutover items separated from current-period VAT Return &amp; P&amp;L.
                </p>
              </div>
              <div className="p-6 divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-700">Opening Trade Receivables (Gross AR)</span>
                  <span className="font-mono-nums font-semibold text-slate-900">
                    {formatMoney(ledger.openingReceivables, 'USD')}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-700">
                    Unapplied Customer Credits (Tracked Separately)
                  </span>
                  <span className="font-mono-nums font-semibold text-emerald-700">
                    {formatMoney(ledger.openingCredits, 'USD')}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-700">Net Opening Customer Receivables</span>
                  <span className="font-mono-nums font-semibold text-slate-900">
                    {formatMoney(
                      round2(ledger.openingReceivables - ledger.openingCredits),
                      'USD'
                    )}
                  </span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-slate-700">
                    Imported Opening Supplier Payables &amp; Accruals (Excl. Matched Bills)
                  </span>
                  <span className="font-mono-nums font-semibold text-amber-700">
                    {formatMoney(ledger.openingPayablesUnmatched, 'USD')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses Ledger Tab */}
      {effectiveTab === 'expenses' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {!isVatOnly && <DailyExpenseWorksheet expenses={expenses} cashBookEntries={cashBookEntries} jobs={jobs} settings={settings} />}
          <DayViewControls label="Expenses" dates={expenses.map(e => e.expenseDate)} day={expenseDay} onDayChange={setExpenseDay} sort={dateSort} onSortChange={setDateSort} />
          {visibleExpenses.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No expenses match this day. Select All dates to see the full expense ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Exp #</th>
                    <th className="py-2.5 px-4">Vendor &amp; ZIMRA Tax #</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4 text-right">Net</th>
                    <th className="py-2.5 px-4 text-right">Input VAT / Class</th>
                    <th className="py-2.5 px-4 text-right">WHT</th>
                    <th className="py-2.5 px-4 text-right">Gross</th>
                    <th className="py-2.5 px-4">Status</th>
                    {isManagement && <th className="py-2.5 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {visibleExpenses.map((exp) => {
                    const t =
                      exp.vatTreatment ?? (exp.vatAmount > 0 ? 'standard' : 'exempt');
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-nums text-xs font-semibold text-slate-800 whitespace-nowrap">
                          {exp.expenseNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{exp.vendorName}</div>
                          <div className="text-xs text-slate-500 font-mono-nums">
                            {exp.vendorInvoiceRef ? `Ref ${exp.vendorInvoiceRef}` : 'No ref'}
                            {exp.vendorTin || exp.vendorVatPin
                              ? ` · TIN ${exp.vendorTin || exp.vendorVatPin}`
                              : ''}
                            {exp.vendorVatReg ? ` · VAT ${exp.vendorVatReg}` : ''}
                          </div>
                          {!isVatOnly && !computeExpenseVatReportable(exp) && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Internal only · Hidden from ZIMRA (non-VAT or no TIN)
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">{exp.category}</td>
                        <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                          {exp.expenseDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs">
                          {formatMoney(exp.netAmount, settings.currency)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs">
                          {exp.isVatClaimable ? (
                            <span className="text-emerald-700 font-medium">
                              {formatMoney(exp.vatAmount, settings.currency)}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              {TREATMENT_LABELS[t]}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs text-amber-700">
                          {(exp.whtAmount || 0) > 0
                            ? formatMoney(exp.whtAmount || 0, settings.currency)
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900">
                          {formatMoney(exp.grossAmount, settings.currency)}
                        </td>
                        <td className="py-3 px-4">
                          {isVatOnly ? (
                            <StatusText status={exp.paymentStatus} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleExpenseStatus(exp)}
                              className="hover:underline"
                              title="Toggle Paid / Payable"
                            >
                              <StatusText status={exp.paymentStatus} />
                            </button>
                          )}
                        </td>
                        {isManagement && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {onUpdateExpense && (
                                <button
                                  type="button"
                                  onClick={() => openEditExpense(exp)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit expense"
                                  aria-label={`Edit ${exp.expenseNumber}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {onDeleteExpense && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmExpense(exp)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Delete expense"
                                  aria-label={`Delete ${exp.expenseNumber}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Record Supplier Bill / Expense
              </h2>
              <button
                type="button"
                onClick={() => setShowAddExpense(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="overflow-y-auto p-6 space-y-4">
              <DraftControls draft={entryDraft} label="Expense" active onResume={() => {}} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vendor / Supplier Name
                  </label>
                  <input
                    type="text"
                    required
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier ZIMRA TIN
                  </label>
                  <input
                    type="text"
                    value={vendorTin}
                    onChange={(e) => setVendorTin(e.target.value)}
                    placeholder="e.g. 2000109381"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier VAT Reg #
                  </label>
                  <input
                    type="text"
                    value={vendorVatReg}
                    onChange={(e) => setVendorVatReg(e.target.value)}
                    placeholder="e.g. 10010938 (if VAT registered)"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier Invoice / Receipt Ref
                  </label>
                  <input
                    type="text"
                    value={vendorInvoiceRef}
                    onChange={(e) => setVendorInvoiceRef(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Link to Job (Optional)
                  </label>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">General Overhead</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} — {j.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount ({settings.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tax Class
                  </label>
                  <select
                    value={vatTreatment}
                    onChange={(e) => {
                      const next = e.target.value as VatTreatment;
                      setVatTreatment(next);
                      setIsVatClaimable(next === 'standard');
                    }}
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="standard">Standard VAT</option>
                    <option value="zero">Zero-Rated 0%</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Input Pricing
                  </label>
                  <select
                    value={pricingMode}
                    onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="inclusive">VAT Inclusive</option>
                    <option value="exclusive">VAT Exclusive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) =>
                      setPaymentStatus(e.target.value as 'Paid' | 'Payable')
                    }
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Payable">Payable (A/P)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vatTreatment === 'standard' && isVatClaimable}
                        disabled={vatTreatment !== 'standard'}
                        onChange={(e) => setIsVatClaimable(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Claimable Input VAT ({vatRate}%)</span>
                    </label>
                    {vatTreatment === 'standard' && isVatClaimable && (
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white"
                      />
                    )}
                  </div>
                  <div className="text-right text-xs font-mono-nums">
                    Net {formatMoney(vatPreview.netAmount, settings.currency)} · VAT{' '}
                    {formatMoney(vatPreview.vatAmount, settings.currency)}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={whtApplicable}
                        onChange={(e) => setWhtApplicable(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600"
                      />
                      <span>Apply Withholding Tax (WHT %)</span>
                    </label>
                    {whtApplicable && (
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={whtRate}
                        onChange={(e) => setWhtRate(e.target.value)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white"
                      />
                    )}
                  </div>
                  {whtApplicable && (
                    <div className="text-right text-xs font-mono-nums">
                      WHT{' '}
                      <strong className="text-amber-700">
                        {formatMoney(whtPreviewAmount, settings.currency)}
                      </strong>{' '}
                      · Net Cash{' '}
                      <strong>
                        {formatMoney(
                          Math.max(0, vatPreview.grossAmount - whtPreviewAmount),
                          settings.currency
                        )}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  {saving ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Edit Expense Modal */}
      {editingExpense && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Edit Expense · {editingExpense.expenseNumber}
              </h2>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditExpense} className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense #
                  </label>
                  <input
                    type="text"
                    required
                    value={editExpNumber}
                    onChange={(e) => setEditExpNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vendor / Supplier Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editVendorName}
                    onChange={(e) => setEditVendorName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editExpenseDate}
                    onChange={(e) => setEditExpenseDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier ZIMRA TIN
                  </label>
                  <input
                    type="text"
                    value={editVendorTin}
                    onChange={(e) => setEditVendorTin(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier VAT Reg #
                  </label>
                  <input
                    type="text"
                    value={editVendorVatReg}
                    onChange={(e) => setEditVendorVatReg(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier Invoice / Ref
                  </label>
                  <input
                    type="text"
                    value={editVendorInvoiceRef}
                    onChange={(e) => setEditVendorInvoiceRef(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Link to Job
                  </label>
                  <select
                    value={editJobId}
                    onChange={(e) => setEditJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">General Overhead</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} — {j.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount ({settings.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tax Class
                  </label>
                  <select
                    value={editVatTreatment}
                    onChange={(e) => {
                      const next = e.target.value as VatTreatment;
                      setEditVatTreatment(next);
                      setEditIsVatClaimable(next === 'standard');
                    }}
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="standard">Standard VAT</option>
                    <option value="zero">Zero-Rated 0%</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Input Pricing
                  </label>
                  <select
                    value={editPricingMode}
                    onChange={(e) => setEditPricingMode(e.target.value as PricingMode)}
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="inclusive">VAT Inclusive</option>
                    <option value="exclusive">VAT Exclusive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={editPaymentStatus}
                    onChange={(e) =>
                      setEditPaymentStatus(e.target.value as 'Paid' | 'Payable')
                    }
                    className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Payable">Payable (A/P)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editVatTreatment === 'standard' && editIsVatClaimable}
                        disabled={editVatTreatment !== 'standard'}
                        onChange={(e) => setEditIsVatClaimable(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Claimable Input VAT ({editVatRate}%)</span>
                    </label>
                    {editVatTreatment === 'standard' && editIsVatClaimable && (
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={editVatRate}
                        onChange={(e) => setEditVatRate(e.target.value)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white"
                      />
                    )}
                  </div>
                  <div className="text-right text-xs font-mono-nums">
                    Net {formatMoney(editVatPreview.netAmount, settings.currency)} · VAT{' '}
                    {formatMoney(editVatPreview.vatAmount, settings.currency)}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editWhtApplicable}
                        onChange={(e) => setEditWhtApplicable(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600"
                      />
                      <span>Apply Withholding Tax (WHT %)</span>
                    </label>
                    {editWhtApplicable && (
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={editWhtRate}
                        onChange={(e) => setEditWhtRate(e.target.value)}
                        className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white"
                      />
                    )}
                  </div>
                  {editWhtApplicable && (
                    <div className="text-right text-xs font-mono-nums">
                      WHT{' '}
                      <strong className="text-amber-700">
                        {formatMoney(editWhtPreviewAmount, settings.currency)}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Delete Expense Confirmation Modal */}
      {deleteConfirmExpense && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Delete Expense Record?
              </h2>
              <button
                type="button"
                onClick={() => setDeleteConfirmExpense(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-600">
              <p>
                Permanently delete expense{' '}
                <strong className="font-mono-nums text-slate-900">
                  {deleteConfirmExpense.expenseNumber}
                </strong>{' '}
                ({deleteConfirmExpense.vendorName} ·{' '}
                <strong className="font-mono-nums text-slate-900">
                  {formatMoney(deleteConfirmExpense.grossAmount, settings.currency)}
                </strong>
                )?
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmExpense(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDeleteExpense}
                  className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Expense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
