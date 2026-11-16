import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  ChartAccount,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  InvoiceLine,
  Job,
  PricingMode,
  SupplierInvoice,
  SupplierInvoiceCategory,
  SupplierInvoiceStatus,
  TaxAccessScope,
  UserRole,
  VatTreatment,
} from '../types/erp';
import {
  calculateVatBreakdown,
  calculateWithholdingTax,
  computeSupplierInvoiceVatReportable,
  formatMoney,
  round2,
  summarizeTaxBreakdown,
} from '../utils/vat';
import { StatusText } from './StatusText';

interface SupplierInvoicesViewProps {
  role: UserRole;
  taxScope?: TaxAccessScope;
  settings: CompanySettings;
  chartOfAccounts: ChartAccount[];
  supplierInvoices: SupplierInvoice[];
  jobs: Job[];
  onCreateSupplierInvoice: (
    input: Omit<
      SupplierInvoice,
      'id' | 'ownerUid' | 'viewerUids' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<string | undefined>;
  onUpdateSupplierInvoice?: (
    supplierInvoiceId: string,
    input: {
      recordNumber: string;
      supplierName: string;
      supplierTaxPin?: string;
      supplierTin?: string;
      supplierVatReg?: string;
      isVatRegistered?: boolean;
      supplierInvoiceNo: string;
      category: SupplierInvoiceCategory;
      jobId?: string;
      jobNumber?: string;
      invoiceDate: string;
      dueDate: string;
      pricingMode: PricingMode;
      vatTreatment: VatTreatment;
      isVatClaimable: boolean;
      vatRate: number;
      lines: InvoiceLine[];
      whtApplicable?: boolean;
      whtRate?: number;
      whtAmount?: number;
      whtRemitted?: boolean;
      amountPaid: number;
      status: SupplierInvoiceStatus;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    }
  ) => Promise<void>;
  onRecordSupplierPayment: (
    supplierInvoice: SupplierInvoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string,
    options?: {
      whtDeducted?: number;
      whtRemitted?: boolean;
    }
  ) => Promise<void>;
  onUpdateVatStatus: (
    supplierInvoiceId: string,
    updates: Partial<
      Pick<
        SupplierInvoice,
        | 'status'
        | 'isVatClaimable'
        | 'supplierTaxPin'
        | 'supplierTin'
        | 'supplierVatReg'
        | 'isVatRegistered'
        | 'whtApplicable'
        | 'whtRate'
        | 'whtAmount'
        | 'whtRemitted'
        | 'notes'
      >
    >
  ) => Promise<void>;
  onRemitSupplierWht: (
    supplierInvoice: SupplierInvoice,
    cashBookAccount?: string,
    reference?: string
  ) => Promise<void>;
  onDeleteSupplierInvoice: (supplierInvoiceId: string) => Promise<void>;
}

interface DraftSupplierLine {
  description: string;
  quantity: string;
  unitPrice: string;
  vatTreatment: VatTreatment;
}

const SUPPLIER_CATEGORIES: SupplierInvoiceCategory[] = [
  'Materials & Substrates',
  'Tailoring & Trims',
  'Subcontracting & Finishing',
  'Equipment & Maintenance',
  'Logistics & Delivery',
  'Utilities & Rent',
  'Marketing & Admin',
];

const SUPPLIER_STATUSES: SupplierInvoiceStatus[] = [
  'Unpaid',
  'Part Paid',
  'Paid',
  'Disputed',
];

export const SupplierInvoicesView: React.FC<SupplierInvoicesViewProps> = ({
  role,
  taxScope = 'all',
  settings,
  chartOfAccounts,
  supplierInvoices,
  jobs,
  onCreateSupplierInvoice,
  onUpdateSupplierInvoice,
  onRecordSupplierPayment,
  onUpdateVatStatus,
  onRemitSupplierWht,
  onDeleteSupplierInvoice,
}) => {
  const isVatOnly = role === 'accounts' && taxScope === 'vat_only';
  const isManagement = role === 'management' && !isVatOnly;

  const cashBookAccounts = useMemo(() => {
    const active = chartOfAccounts
      .filter((a) => a.isCashBookAccount && a.isActive)
      .map((a) => a.name);
    return active.length > 0 ? active : [...DEFAULT_ZIM_CASH_ACCOUNTS];
  }, [chartOfAccounts]);

  const [statusFilter, setStatusFilter] = useState<'All' | SupplierInvoiceStatus>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SupplierInvoice | null>(null);
  const [paymentModalInv, setPaymentModalInv] = useState<SupplierInvoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<SupplierInvoice | null>(null);
  const [deleteConfirmInvoice, setDeleteConfirmInvoice] =
    useState<SupplierInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Create form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierTin, setSupplierTin] = useState('');
  const [supplierVatReg, setSupplierVatReg] = useState('');
  const [isVatRegistered, setIsVatRegistered] = useState(true);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [category, setCategory] = useState<SupplierInvoiceCategory>('Materials & Substrates');
  const [jobId, setJobId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>('exclusive');
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate ?? 15));
  const [isVatClaimable, setIsVatClaimable] = useState(true);
  const [whtApplicable, setWhtApplicable] = useState(false);
  const [whtRate, setWhtRate] = useState('30');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftSupplierLine[]>([
    { description: '', quantity: '1', unitPrice: '0', vatTreatment: 'standard' },
  ]);
  const [saving, setSaving] = useState(false);

  // Payment modal state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer / RTGS');
  const [payAccount, setPayAccount] = useState(
    cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [payRef, setPayRef] = useState('');
  const [payWhtDeducted, setPayWhtDeducted] = useState('0');
  const [payWhtRemitted, setPayWhtRemitted] = useState(false);
  const [recordingPay, setRecordingPay] = useState(false);

  // Inspect modal WHT remittance state
  const [remitAccount, setRemitAccount] = useState(
    cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [remitRef, setRemitRef] = useState('');
  const [remittingWht, setRemittingWht] = useState(false);

  // Management Edit modal state
  const [editRecordNumber, setEditRecordNumber] = useState('');
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierTin, setEditSupplierTin] = useState('');
  const [editSupplierVatReg, setEditSupplierVatReg] = useState('');
  const [editIsVatRegistered, setEditIsVatRegistered] = useState(true);
  const [editSupplierInvoiceNo, setEditSupplierInvoiceNo] = useState('');
  const [editCategory, setEditCategory] =
    useState<SupplierInvoiceCategory>('Materials & Substrates');
  const [editJobId, setEditJobId] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPricingMode, setEditPricingMode] = useState<PricingMode>('exclusive');
  const [editVatRate, setEditVatRate] = useState('15');
  const [editIsVatClaimable, setEditIsVatClaimable] = useState(true);
  const [editWhtApplicable, setEditWhtApplicable] = useState(false);
  const [editWhtRate, setEditWhtRate] = useState('30');
  const [editWhtRemitted, setEditWhtRemitted] = useState(false);
  const [editAmountPaid, setEditAmountPaid] = useState('0');
  const [editStatus, setEditStatus] = useState<SupplierInvoiceStatus>('Unpaid');
  const [editPayMethod, setEditPayMethod] = useState('');
  const [editPayRef, setEditPayRef] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLines, setEditLines] = useState<DraftSupplierLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const computedLines: InvoiceLine[] = useMemo(() => {
    const rate = Number(vatRate) || 0;
    return lines.map((line) => {
      const qty = Math.max(1, Number(line.quantity) || 1);
      const uPrice = Math.max(0, Number(line.unitPrice) || 0);
      const vat = calculateVatBreakdown({
        amount: qty * uPrice,
        pricingMode,
        vatTreatment: line.vatTreatment,
        vatRate: rate,
      });
      return {
        description: line.description.trim() || 'Supplier Tax Invoice Line Item',
        quantity: qty,
        unitPrice: uPrice,
        vatTreatment: line.vatTreatment,
        netAmount: vat.netAmount,
        vatAmount: vat.vatAmount,
        grossAmount: vat.grossAmount,
      };
    });
  }, [lines, pricingMode, vatRate]);

  const totals = useMemo(() => summarizeTaxBreakdown(computedLines), [computedLines]);

  const editComputedLines: InvoiceLine[] = useMemo(() => {
    const rate = Number(editVatRate) || 0;
    return editLines.map((line) => {
      const qty = Math.max(1, Number(line.quantity) || 1);
      const uPrice = Math.max(0, Number(line.unitPrice) || 0);
      const vat = calculateVatBreakdown({
        amount: qty * uPrice,
        pricingMode: editPricingMode,
        vatTreatment: line.vatTreatment,
        vatRate: rate,
      });
      return {
        description: line.description.trim() || 'Supplier Tax Invoice Line Item',
        quantity: qty,
        unitPrice: uPrice,
        vatTreatment: line.vatTreatment,
        netAmount: vat.netAmount,
        vatAmount: vat.vatAmount,
        grossAmount: vat.grossAmount,
      };
    });
  }, [editLines, editPricingMode, editVatRate]);

  const editTotals = useMemo(
    () => summarizeTaxBreakdown(editComputedLines),
    [editComputedLines]
  );

  const editWhtAmount = useMemo(
    () =>
      calculateWithholdingTax({
        applicable: editWhtApplicable,
        baseAmount: editTotals.netAmount,
        ratePct: Number(editWhtRate) || 0,
      }),
    [editWhtApplicable, editTotals.netAmount, editWhtRate]
  );

  const createWhtAmount = useMemo(
    () =>
      calculateWithholdingTax({
        applicable: whtApplicable,
        baseAmount: totals.netAmount,
        ratePct: Number(whtRate) || 0,
      }),
    [whtApplicable, totals.netAmount, whtRate]
  );

  const openEditModal = (inv: SupplierInvoice) => {
    setEditingInvoice(inv);
    setEditRecordNumber(inv.recordNumber);
    setEditSupplierName(inv.supplierName);
    setEditSupplierTin(inv.supplierTin || inv.supplierTaxPin || '');
    setEditSupplierVatReg(inv.supplierVatReg || '');
    setEditIsVatRegistered(Boolean(inv.isVatRegistered));
    setEditSupplierInvoiceNo(inv.supplierInvoiceNo);
    setEditCategory(inv.category);
    setEditJobId(inv.jobId || '');
    setEditInvoiceDate(inv.invoiceDate);
    setEditDueDate(inv.dueDate);
    setEditPricingMode(inv.pricingMode || 'exclusive');
    setEditVatRate(String(inv.vatRate ?? settings.defaultVatRate ?? 15));
    setEditIsVatClaimable(Boolean(inv.isVatClaimable));
    setEditWhtApplicable(Boolean(inv.whtApplicable));
    setEditWhtRate(String(inv.whtRate ?? 30));
    setEditWhtRemitted(Boolean(inv.whtRemitted));
    setEditAmountPaid(String(inv.amountPaid ?? 0));
    setEditStatus(inv.status);
    setEditPayMethod(inv.paymentMethod || '');
    setEditPayRef(inv.paymentReference || '');
    setEditNotes(inv.notes || '');
    setEditLines(
      (inv.lines || []).length > 0
        ? inv.lines.map((l) => ({
            description: l.description,
            quantity: String(l.quantity),
            unitPrice: String(l.unitPrice),
            vatTreatment: l.vatTreatment || 'standard',
          }))
        : [{ description: '', quantity: '1', unitPrice: '0', vatTreatment: 'standard' }]
    );
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !editingInvoice ||
      !onUpdateSupplierInvoice ||
      !editSupplierName.trim() ||
      !editSupplierInvoiceNo.trim() ||
      editComputedLines.length === 0
    ) {
      return;
    }
    const chosenJob = jobs.find((j) => j.id === editJobId);
    const primaryTreatment = editComputedLines[0]?.vatTreatment || 'standard';
    const cleanTin = editSupplierTin.trim().toUpperCase();
    const cleanVatReg = editSupplierVatReg.trim().toUpperCase();
    setSavingEdit(true);
    try {
      await onUpdateSupplierInvoice(editingInvoice.id, {
        recordNumber: editRecordNumber.trim() || editingInvoice.recordNumber,
        supplierName: editSupplierName.trim(),
        supplierTaxPin: cleanTin || cleanVatReg,
        supplierTin: cleanTin,
        supplierVatReg: cleanVatReg,
        isVatRegistered: editIsVatRegistered || Boolean(cleanVatReg),
        supplierInvoiceNo: editSupplierInvoiceNo.trim(),
        category: editCategory,
        jobId: chosenJob?.id || editJobId || '',
        jobNumber: chosenJob?.jobNumber || (editJobId ? editingInvoice.jobNumber : ''),
        invoiceDate: editInvoiceDate,
        dueDate: editDueDate,
        pricingMode: editPricingMode,
        vatTreatment: primaryTreatment,
        isVatClaimable: editIsVatClaimable && editTotals.vatAmount > 0,
        vatRate: Number(editVatRate) || 0,
        lines: editComputedLines,
        whtApplicable: editWhtApplicable,
        whtRate: editWhtApplicable ? Number(editWhtRate) || 0 : 0,
        whtAmount: editWhtAmount,
        whtRemitted: editWhtRemitted,
        amountPaid: Number(editAmountPaid) || 0,
        status: editStatus,
        paymentMethod: editPayMethod.trim(),
        paymentReference: editPayRef.trim(),
        notes: editNotes.trim(),
      });
      setEditingInvoice(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmInvoice) return;
    setDeleting(true);
    try {
      await onDeleteSupplierInvoice(deleteConfirmInvoice.id);
      if (selectedInvoice?.id === deleteConfirmInvoice.id) {
        setSelectedInvoice(null);
      }
      setDeleteConfirmInvoice(null);
    } finally {
      setDeleting(false);
    }
  };

  const summary = useMemo(() => {
    const totalPayable = round2(
      supplierInvoices
        .filter((s) => s.status !== 'Paid')
        .reduce((acc, s) => acc + (s.balanceDue || 0), 0)
    );
    const totalClaimableVat = round2(
      supplierInvoices
        .filter((s) => s.isVatClaimable)
        .reduce((acc, s) => acc + (s.vatAmount || 0), 0)
    );
    const missingTaxIdCount = supplierInvoices.filter((s) => {
      const hasTinOrVat = Boolean(
        (s.supplierTin || s.supplierTaxPin || '').trim() ||
          (s.supplierVatReg || '').trim()
      );
      return s.vatAmount > 0 && !hasTinOrVat;
    }).length;
    const unremittedWht = round2(
      supplierInvoices
        .filter((s) => (s.whtAmount || 0) > 0 && !s.whtRemitted)
        .reduce((acc, s) => acc + (s.whtAmount || 0), 0)
    );
    const totalGrossRecorded = round2(
      supplierInvoices.reduce((acc, s) => acc + (s.grossAmount || 0), 0)
    );
    return {
      totalPayable,
      totalClaimableVat,
      missingTaxIdCount,
      unremittedWht,
      totalGrossRecorded,
    };
  }, [supplierInvoices]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return supplierInvoices.filter((inv) => {
      if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.recordNumber.toLowerCase().includes(q) ||
        inv.supplierName.toLowerCase().includes(q) ||
        inv.supplierInvoiceNo.toLowerCase().includes(q) ||
        (inv.supplierTin || '').toLowerCase().includes(q) ||
        (inv.supplierVatReg || '').toLowerCase().includes(q) ||
        (inv.supplierTaxPin || '').toLowerCase().includes(q) ||
        (inv.jobNumber || '').toLowerCase().includes(q)
      );
    });
  }, [supplierInvoices, statusFilter, searchQuery]);

  const resetForm = () => {
    setSupplierName('');
    setSupplierTin('');
    setSupplierVatReg('');
    setIsVatRegistered(true);
    setSupplierInvoiceNo('');
    setCategory('Materials & Substrates');
    setJobId('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setPricingMode('exclusive');
    setVatRate(String(settings.defaultVatRate ?? 15));
    setIsVatClaimable(true);
    setWhtApplicable(false);
    setWhtRate('30');
    setNotes('');
    setLines([{ description: '', quantity: '1', unitPrice: '0', vatTreatment: 'standard' }]);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !supplierInvoiceNo.trim() || computedLines.length === 0) {
      return;
    }
    const chosenJob = jobs.find((j) => j.id === jobId);
    const primaryTreatment = computedLines[0]?.vatTreatment || 'standard';
    const cleanTin = supplierTin.trim().toUpperCase();
    const cleanVatReg = supplierVatReg.trim().toUpperCase();

    setSaving(true);
    try {
      const nextRecNo = `SI-${new Date().getFullYear()}-${String(
        1 + supplierInvoices.length
      ).padStart(3, '0')}`;
      await onCreateSupplierInvoice({
        recordNumber: nextRecNo,
        supplierName: supplierName.trim(),
        supplierTaxPin: cleanTin || cleanVatReg,
        supplierTin: cleanTin,
        supplierVatReg: cleanVatReg,
        isVatRegistered: isVatRegistered || Boolean(cleanVatReg),
        supplierInvoiceNo: supplierInvoiceNo.trim(),
        category,
        jobId: chosenJob?.id || '',
        jobNumber: chosenJob?.jobNumber || '',
        invoiceDate,
        dueDate,
        pricingMode,
        vatTreatment: primaryTreatment,
        isVatClaimable: isVatClaimable && totals.vatAmount > 0,
        vatRate: Number(vatRate) || 0,
        lines: computedLines,
        standardNetAmount: totals.standardNetAmount,
        zeroRatedAmount: totals.zeroRatedAmount,
        exemptAmount: totals.exemptAmount,
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        whtApplicable,
        whtRate: whtApplicable ? Number(whtRate) || 0 : 0,
        whtAmount: createWhtAmount,
        whtRemitted: false,
        amountPaid: 0,
        balanceDue: totals.grossAmount,
        status: 'Unpaid',
        paymentMethod: '',
        paymentReference: '',
        notes: notes.trim(),
      });
      resetForm();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const openPaymentModal = (inv: SupplierInvoice) => {
    setPaymentModalInv(inv);
    setPayAccount(cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]);
    setPayRef('');
    const prefillWht =
      inv.whtApplicable && (inv.whtAmount || 0) > 0 && inv.amountPaid === 0
        ? Math.min(inv.balanceDue, round2(inv.whtAmount || 0))
        : 0;
    setPayWhtDeducted(String(prefillWht));
    setPayWhtRemitted(Boolean(inv.whtRemitted));
    setPayAmount(String(round2(Math.max(0, inv.balanceDue - prefillWht))));
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;
    const cashAmt = Math.max(0, round2(Number(payAmount) || 0));
    const whtDeducted = Math.max(0, round2(Number(payWhtDeducted) || 0));
    if (cashAmt + whtDeducted <= 0.005) return;
    if (cashAmt + whtDeducted > paymentModalInv.balanceDue + 0.02) return;

    setRecordingPay(true);
    try {
      await onRecordSupplierPayment(
        paymentModalInv,
        cashAmt,
        payMethod,
        payRef,
        payAccount,
        whtDeducted > 0
          ? { whtDeducted, whtRemitted: payWhtRemitted }
          : undefined
      );
      setPaymentModalInv(null);
      setPayAmount('');
      setPayRef('');
      setPayWhtDeducted('0');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [
        'Voucher #',
        'Supplier Name',
        'Supplier ZIMRA TIN',
        'Supplier VAT Reg #',
        'Supplier Invoice #',
        'Category',
        'Job #',
        'Invoice Date',
        'Due Date',
        'Status',
        'VAT Claimable',
        'Standard Net',
        'Zero-Rated (0%)',
        'Exempt',
        'Net Amount',
        'Input VAT',
        'Gross Amount',
        'WHT Amount',
        'WHT Remitted',
        'Amount Settled',
        'Balance Due',
      ],
      ...filteredInvoices.map((s) => {
        const taxSum = summarizeTaxBreakdown(s.lines || [], {
          vatTreatment: s.vatTreatment,
          netAmount: s.netAmount,
          vatAmount: s.vatAmount,
          grossAmount: s.grossAmount,
        });
        return [
          s.recordNumber,
          s.supplierName,
          s.supplierTin || s.supplierTaxPin || '',
          s.supplierVatReg || '',
          s.supplierInvoiceNo,
          s.category,
          s.jobNumber || '',
          s.invoiceDate,
          s.dueDate,
          s.status,
          s.isVatClaimable ? 'Yes' : 'No',
          (s.standardNetAmount ?? taxSum.standardNetAmount).toFixed(2),
          (s.zeroRatedAmount ?? taxSum.zeroRatedAmount).toFixed(2),
          (s.exemptAmount ?? taxSum.exemptAmount).toFixed(2),
          s.netAmount.toFixed(2),
          s.vatAmount.toFixed(2),
          s.grossAmount.toFixed(2),
          (s.whtAmount || 0).toFixed(2),
          s.whtRemitted ? 'Yes' : 'No',
          s.amountPaid.toFixed(2),
          s.balanceDue.toFixed(2),
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
    a.download = `megaprint-supplier-tax-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {isVatOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900">
          <strong>ZIMRA / VAT-Only Read-Only View:</strong> Showing only VAT-claimable supplier
          tax invoices with a valid Supplier ZIMRA TIN or VAT Reg #. Non-VAT, zero-VAT, and
          no-TIN supplier bills are hidden from ZIMRA audit access.
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Supplier Invoices Recorded</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {formatMoney(summary.totalGrossRecorded, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-nums">
            {supplierInvoices.length} vendor tax invoices
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Claimable Input VAT</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
            {formatMoney(summary.totalClaimableVat, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Feeds directly into VAT Return Input Schedule
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Accounts Payable Balance</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-amber-700">
            {formatMoney(summary.totalPayable, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-nums">
            {supplierInvoices.filter((s) => s.status !== 'Paid').length} awaiting settlement
            {summary.unremittedWht > 0
              ? ` · WHT due ZIMRA: ${formatMoney(summary.unremittedWht, settings.currency)}`
              : ''}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">ZIMRA TIN / VAT Audit</div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              summary.missingTaxIdCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {summary.missingTaxIdCount === 0
              ? '100% Compliant'
              : `${summary.missingTaxIdCount} Missing TIN/VAT`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Supplier ZIMRA TIN &amp; VAT Reg # required for Input VAT
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {(['All', 'Unpaid', 'Part Paid', 'Paid', 'Disputed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search supplier, TIN, VAT #, invoice #..."
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-900 w-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          {!isVatOnly && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Record Supplier Tax Invoice</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No supplier tax invoices recorded matching your filter. Click &ldquo;Record Supplier
            Tax Invoice&rdquo; to log a vendor tax invoice and claim Input VAT.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">Voucher / Vendor Inv #</th>
                  <th className="py-2.5 px-4">Supplier &amp; ZIMRA Tax #</th>
                  <th className="py-2.5 px-4">Category &amp; Job</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Net</th>
                  <th className="py-2.5 px-4 text-right">Input VAT</th>
                  <th className="py-2.5 px-4 text-right">WHT</th>
                  <th className="py-2.5 px-4 text-right">Gross</th>
                  <th className="py-2.5 px-4 text-right">Balance Due</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInvoices.map((inv) => {
                  const displayTin = inv.supplierTin || inv.supplierTaxPin;
                  const taxSum = summarizeTaxBreakdown(inv.lines || [], {
                    vatTreatment: inv.vatTreatment,
                    netAmount: inv.netAmount,
                    vatAmount: inv.vatAmount,
                    grossAmount: inv.grossAmount,
                  });
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono-nums text-xs font-semibold text-blue-700">
                          {inv.recordNumber}
                        </div>
                        <div className="font-mono-nums text-[11px] text-slate-500">
                          Inv {inv.supplierInvoiceNo}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{inv.supplierName}</div>
                        <div className="text-xs text-slate-500 font-mono-nums">
                          {displayTin ? `TIN: ${displayTin}` : 'No TIN'}
                          {inv.supplierVatReg ? ` · VAT: ${inv.supplierVatReg}` : ''}
                        </div>
                        {!isVatOnly && !computeSupplierInvoiceVatReportable(inv) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Internal only · Hidden from ZIMRA (non-VAT or no TIN)
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs text-slate-800">{inv.category}</div>
                        <div className="text-[11px] text-slate-500 font-mono-nums">
                          {inv.jobNumber ? `Job ${inv.jobNumber}` : 'General Overhead'} · Due{' '}
                          {inv.dueDate}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={inv.status} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-700 whitespace-nowrap">
                        <div>{formatMoney(inv.netAmount, settings.currency)}</div>
                        {(taxSum.zeroRatedAmount > 0 || taxSum.exemptAmount > 0) && (
                          <div className="text-[10px] text-slate-400">
                            {taxSum.zeroRatedAmount > 0 ? 'Zero 0%' : 'Exempt'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs whitespace-nowrap">
                        {inv.isVatClaimable ? (
                          <span className="text-emerald-700 font-medium">
                            {formatMoney(inv.vatAmount, settings.currency)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Non-claimable</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs whitespace-nowrap">
                        {(inv.whtAmount || 0) > 0 ? (
                          <div>
                            <div className="font-medium text-amber-700">
                              {formatMoney(inv.whtAmount || 0, settings.currency)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {inv.whtRemitted ? 'Remitted' : 'Due ZIMRA'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {formatMoney(inv.grossAmount, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-amber-700 whitespace-nowrap">
                        {formatMoney(inv.balanceDue, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRemitAccount(
                                cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
                              );
                              setRemitRef(`WHT-${inv.recordNumber}`);
                              setSelectedInvoice(inv);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="Inspect supplier tax invoice"
                            aria-label="Inspect supplier tax invoice"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                          {!isVatOnly && inv.balanceDue > 0.01 && (
                            <button
                              type="button"
                              onClick={() => openPaymentModal(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              <span>Pay</span>
                            </button>
                          )}
                          {isManagement && onUpdateSupplierInvoice && (
                            <button
                              type="button"
                              onClick={() => openEditModal(inv)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit supplier invoice"
                              aria-label={`Edit ${inv.recordNumber}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {isManagement && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmInvoice(inv)}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Delete supplier invoice"
                              aria-label={`Delete ${inv.recordNumber}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Supplier Tax Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Record Supplier Tax Invoice
                </h2>
                <p className="text-xs text-slate-500">
                  Capture ZIMRA TIN, VAT Reg #, tax class breakdown, and Withholding Tax
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier / Vendor Name
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. David Whitehead Textiles Zimbabwe"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier Tax / FDMS Invoice #
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder="e.g. FDMS-883421"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier ZIMRA TIN
                  </label>
                  <input
                    type="text"
                    value={supplierTin}
                    onChange={(e) => setSupplierTin(e.target.value)}
                    placeholder="e.g. 2000109381"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier VAT Reg Number
                  </label>
                  <input
                    type="text"
                    value={supplierVatReg}
                    onChange={(e) => {
                      setSupplierVatReg(e.target.value);
                      if (e.target.value.trim()) setIsVatRegistered(true);
                    }}
                    placeholder="e.g. 10010938"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVatRegistered}
                      onChange={(e) => setIsVatRegistered(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>VAT Registered Supplier</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expense Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as SupplierInvoiceCategory)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {SUPPLIER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Allocate to Job (Optional)
                  </label>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">General Workshop Stock / Overhead</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} — {j.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Pricing
                    </label>
                    <select
                      value={pricingMode}
                      onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                    >
                      <option value="exclusive">VAT Excl.</option>
                      <option value="inclusive">VAT Incl.</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      VAT %
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2.5 py-2 text-sm font-mono-nums"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Supplier Tax Invoice Line Items
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) =>
                        prev.length < 10
                          ? [
                              ...prev,
                              {
                                description: '',
                                quantity: '1',
                                unitPrice: '0',
                                vatTreatment: 'standard',
                              },
                            ]
                          : prev
                      )
                    }
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    + Add Line Item
                  </button>
                </div>

                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-md p-2.5"
                  >
                    <input
                      type="text"
                      required
                      placeholder="Item description (e.g. 240gsm Cotton Pique Fabric Rolls)"
                      value={line.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, description: val } : l))
                        );
                      }}
                      className="col-span-5 border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 text-xs font-mono-nums bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit Price"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 text-xs font-mono-nums bg-white"
                    />
                    <select
                      value={line.vatTreatment}
                      onChange={(e) => {
                        const val = e.target.value as VatTreatment;
                        setLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, vatTreatment: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
                    >
                      <option value="standard">Std VAT</option>
                      <option value="zero">Zero 0%</option>
                      <option value="exempt">Exempt</option>
                    </select>
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      onClick={() =>
                        setLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-1 flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* VAT Claim, Tax Class Breakdown & WHT Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVatClaimable && totals.vatAmount > 0}
                      disabled={totals.vatAmount === 0}
                      onChange={(e) => setIsVatClaimable(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>Eligible for Input VAT Claim on VAT Return</span>
                  </label>
                  <div className="flex flex-wrap gap-4 font-mono-nums text-xs">
                    {totals.zeroRatedAmount > 0 && (
                      <div>
                        <span className="text-slate-500">Zero 0% </span>
                        <strong>
                          {formatMoney(totals.zeroRatedAmount, settings.currency)}
                        </strong>
                      </div>
                    )}
                    {totals.exemptAmount > 0 && (
                      <div>
                        <span className="text-slate-500">Exempt </span>
                        <strong>
                          {formatMoney(totals.exemptAmount, settings.currency)}
                        </strong>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Net </span>
                      <strong className="text-slate-900">
                        {formatMoney(totals.netAmount, settings.currency)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Input VAT </span>
                      <strong className="text-emerald-700">
                        {formatMoney(totals.vatAmount, settings.currency)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Gross </span>
                      <strong className="text-blue-700">
                        {formatMoney(totals.grossAmount, settings.currency)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={whtApplicable}
                        onChange={(e) => setWhtApplicable(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                      />
                      <span>Apply ZIMRA Withholding Tax (e.g. 30% Non-ITF263)</span>
                    </label>
                    {whtApplicable && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-500">Rate %</span>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          value={whtRate}
                          onChange={(e) => setWhtRate(e.target.value)}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white"
                        />
                      </div>
                    )}
                  </div>
                  {whtApplicable && (
                    <div className="flex flex-wrap gap-4 font-mono-nums text-xs">
                      <div>
                        <span className="text-slate-500">WHT Retained </span>
                        <strong className="text-amber-700">
                          {formatMoney(createWhtAmount, settings.currency)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Net Cash Payable </span>
                        <strong className="text-slate-900">
                          {formatMoney(
                            Math.max(0, totals.grossAmount - createWhtAmount),
                            settings.currency
                          )}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes / Goods Received Reference
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional GRN number, ITF263 clearance note, or payment terms"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Recording...' : 'Save Supplier Tax Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Supplier Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {selectedInvoice.recordNumber} — {selectedInvoice.supplierName}
                </h2>
                <p className="text-xs text-slate-500 font-mono-nums">
                  Tax Invoice #{selectedInvoice.supplierInvoiceNo} · TIN:{' '}
                  {selectedInvoice.supplierTin ||
                    selectedInvoice.supplierTaxPin ||
                    'Not provided'}{' '}
                  · VAT Reg #: {selectedInvoice.supplierVatReg || 'Non-VAT'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">Invoice Date</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedInvoice.invoiceDate}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Due Date</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedInvoice.dueDate}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Category</div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {selectedInvoice.category}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Linked Job</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedInvoice.jobNumber || 'General'}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Tax Code</th>
                      <th className="py-2 px-3 text-right">Qty</th>
                      <th className="py-2 px-3 text-right">Net</th>
                      <th className="py-2 px-3 text-right">VAT</th>
                      <th className="py-2 px-3 text-right">Gross</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedInvoice.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 text-slate-900">{line.description}</td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                          {line.vatTreatment === 'standard'
                            ? `VAT ${selectedInvoice.vatRate}%`
                            : line.vatTreatment === 'zero'
                              ? 'Zero 0%'
                              : 'Exempt'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-nums">
                          {line.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-nums">
                          {formatMoney(line.netAmount, settings.currency)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-nums text-emerald-700">
                          {formatMoney(line.vatAmount, settings.currency)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-nums font-semibold">
                          {formatMoney(line.grossAmount, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 border border-slate-200 rounded-md p-4">
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Status:</span>
                    <StatusText status={selectedInvoice.status} />
                  </div>
                  {(selectedInvoice.whtAmount || 0) > 0 && (
                    <div className="text-amber-800 font-mono-nums">
                      ZIMRA WHT ({selectedInvoice.whtRate || 30}%):{' '}
                      {formatMoney(selectedInvoice.whtAmount || 0, settings.currency)} ·{' '}
                      {selectedInvoice.whtRemitted
                        ? 'Remitted to ZIMRA'
                        : 'Pending Remittance'}
                    </div>
                  )}
                  {selectedInvoice.paymentReference && (
                    <div className="text-slate-600 font-mono-nums">
                      Payment: {selectedInvoice.paymentMethod} · Ref{' '}
                      {selectedInvoice.paymentReference}
                    </div>
                  )}
                  {selectedInvoice.notes && (
                    <div className="text-slate-600">{selectedInvoice.notes}</div>
                  )}
                </div>

                <div className="text-right font-mono-nums text-xs space-y-1">
                  <div>
                    Settled: {formatMoney(selectedInvoice.amountPaid, settings.currency)}
                  </div>
                  <div className="text-sm font-bold text-amber-700">
                    Balance: {formatMoney(selectedInvoice.balanceDue, settings.currency)}
                  </div>
                </div>
              </div>

              {/* WHT Remittance to ZIMRA Action */}
              {!isVatOnly &&
                (selectedInvoice.whtAmount || 0) > 0 &&
                !selectedInvoice.whtRemitted &&
                (role === 'management' || role === 'accounts') && (
                  <div className="border border-amber-200 bg-amber-50/70 rounded-md p-3.5 space-y-2.5">
                    <div className="text-xs font-semibold text-amber-900">
                      Remit Withholding Tax to ZIMRA (
                      {formatMoney(selectedInvoice.whtAmount || 0, settings.currency)})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={remitAccount}
                        onChange={(e) => setRemitAccount(e.target.value)}
                        className="border border-amber-200 rounded px-2.5 py-1.5 text-xs bg-white"
                      >
                        {cashBookAccounts.map((acc) => (
                          <option key={acc} value={acc}>
                            {acc}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={remitRef}
                        onChange={(e) => setRemitRef(e.target.value)}
                        placeholder="ZIMRA WHT receipt / ZIPIT ref"
                        className="border border-amber-200 rounded px-2.5 py-1.5 text-xs font-mono-nums bg-white"
                      />
                      <button
                        type="button"
                        disabled={remittingWht}
                        onClick={async () => {
                          setRemittingWht(true);
                          try {
                            await onRemitSupplierWht(
                              selectedInvoice,
                              remitAccount,
                              remitRef
                            );
                            setSelectedInvoice({
                              ...selectedInvoice,
                              whtRemitted: true,
                            });
                          } finally {
                            setRemittingWht(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 disabled:opacity-50"
                      >
                        {remittingWht ? 'Posting...' : 'Remit WHT to ZIMRA'}
                      </button>
                    </div>
                  </div>
                )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {!isVatOnly ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const nextClaim = !selectedInvoice.isVatClaimable;
                      await onUpdateVatStatus(selectedInvoice.id, {
                        isVatClaimable: nextClaim,
                      });
                      setSelectedInvoice({
                        ...selectedInvoice,
                        isVatClaimable: nextClaim,
                      });
                    }}
                    className="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {selectedInvoice.isVatClaimable
                      ? 'Mark VAT Non-Claimable'
                      : 'Mark VAT Claimable'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">Read-only ZIMRA audit view</span>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="px-4 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record Supplier Payment Modal */}
      {paymentModalInv && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Pay Supplier — {paymentModalInv.recordNumber}
              </h2>
              <button
                type="button"
                onClick={() => setPaymentModalInv(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-5 space-y-4">
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5 flex justify-between">
                <div>
                  Supplier:{' '}
                  <strong className="text-slate-900">
                    {paymentModalInv.supplierName}
                  </strong>
                </div>
                <div>
                  Balance Due:{' '}
                  <strong className="font-mono-nums text-amber-700">
                    {formatMoney(paymentModalInv.balanceDue, settings.currency)}
                  </strong>
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-3 space-y-2.5 bg-amber-50/40">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-800">
                    Withholding Tax Retained ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={paymentModalInv.balanceDue}
                    step="0.01"
                    value={payWhtDeducted}
                    onChange={(e) => {
                      const wht = Math.max(
                        0,
                        Math.min(
                          paymentModalInv.balanceDue,
                          Number(e.target.value) || 0
                        )
                      );
                      setPayWhtDeducted(e.target.value);
                      setPayAmount(
                        String(round2(Math.max(0, paymentModalInv.balanceDue - wht)))
                      );
                    }}
                    className="w-28 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono-nums bg-white text-right"
                  />
                </div>
                {(Number(payWhtDeducted) || 0) > 0 && (
                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={payWhtRemitted}
                      onChange={(e) => setPayWhtRemitted(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600"
                    />
                    <span>Mark WHT already remitted to ZIMRA</span>
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Net Cash Paid to Supplier ({settings.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={paymentModalInv.balanceDue}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
                {(Number(payWhtDeducted) || 0) > 0 && (
                  <div className="mt-1 text-[11px] text-slate-500 font-mono-nums">
                    Invoice Settled:{' '}
                    {formatMoney(
                      (Number(payAmount) || 0) + (Number(payWhtDeducted) || 0),
                      settings.currency
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pay From Bank / Cash Account
                </label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {cashBookAccounts.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="Bank Transfer / RTGS">Bank Transfer / RTGS / ZIPIT</option>
                  <option value="EcoCash / InnBucks">EcoCash / InnBucks</option>
                  <option value="USD Cash">USD Cash Drawer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cash">Petty Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Reference
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="RTGS / EcoCash / remittance ID"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalInv(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPay}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {recordingPay ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Edit Supplier Tax Invoice Modal */}
      {editingInvoice && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Edit Supplier Tax Invoice · {editingInvoice.recordNumber}
                </h2>
                <p className="text-xs text-slate-500">
                  Management transaction edit — updates VAT claimability &amp; ZIMRA access scope.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleEditSubmit}
              className="overflow-y-auto p-6 space-y-5 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Voucher # *
                  </label>
                  <input
                    type="text"
                    required
                    value={editRecordNumber}
                    onChange={(e) => setEditRecordNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplierName}
                    onChange={(e) => setEditSupplierName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier Invoice # *
                  </label>
                  <input
                    type="text"
                    required
                    value={editSupplierInvoiceNo}
                    onChange={(e) => setEditSupplierInvoiceNo(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier ZIMRA TIN
                  </label>
                  <input
                    type="text"
                    value={editSupplierTin}
                    onChange={(e) => setEditSupplierTin(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier VAT Reg #
                  </label>
                  <input
                    type="text"
                    value={editSupplierVatReg}
                    onChange={(e) => setEditSupplierVatReg(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums uppercase"
                  />
                </div>
                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsVatRegistered}
                      onChange={(e) => setEditIsVatRegistered(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>VAT Registered</span>
                  </label>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) =>
                      setEditCategory(e.target.value as SupplierInvoiceCategory)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {SUPPLIER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Allocate to Job
                  </label>
                  <select
                    value={editJobId}
                    onChange={(e) => setEditJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="">General Overhead</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} — {j.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as SupplierInvoiceStatus)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {SUPPLIER_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Invoice Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDate}
                    onChange={(e) => setEditInvoiceDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Pricing
                    </label>
                    <select
                      value={editPricingMode}
                      onChange={(e) =>
                        setEditPricingMode(e.target.value as PricingMode)
                      }
                      className="w-full border border-slate-200 rounded-md px-2 py-2 bg-white"
                    >
                      <option value="exclusive">VAT Excl.</option>
                      <option value="inclusive">VAT Incl.</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">VAT %</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={editVatRate}
                      onChange={(e) => setEditVatRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-2 py-2 font-mono-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">Line Items</span>
                  {editLines.length < 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditLines((prev) => [
                          ...prev,
                          {
                            description: '',
                            quantity: '1',
                            unitPrice: '0',
                            vatTreatment: 'standard',
                          },
                        ])
                      }
                      className="font-medium text-blue-600 hover:text-blue-700"
                    >
                      + Add Line Item
                    </button>
                  )}
                </div>
                {editLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-md p-2"
                  >
                    <input
                      type="text"
                      required
                      value={line.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, description: val } : l))
                        );
                      }}
                      className="col-span-5 border border-slate-200 rounded px-2.5 py-1.5 bg-white"
                    />
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, quantity: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 font-mono-nums bg-white"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 font-mono-nums bg-white"
                    />
                    <select
                      value={line.vatTreatment}
                      onChange={(e) => {
                        const val = e.target.value as VatTreatment;
                        setEditLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, vatTreatment: val } : l))
                        );
                      }}
                      className="col-span-2 border border-slate-200 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="standard">Std VAT</option>
                      <option value="zero">Zero 0%</option>
                      <option value="exempt">Exempt</option>
                    </select>
                    <button
                      type="button"
                      disabled={editLines.length <= 1}
                      onClick={() =>
                        setEditLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-1 flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsVatClaimable && editTotals.vatAmount > 0}
                      disabled={editTotals.vatAmount === 0}
                      onChange={(e) => setEditIsVatClaimable(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Eligible for Input VAT Claim</span>
                  </label>
                  <div className="flex gap-4 font-mono-nums">
                    <span>Net {formatMoney(editTotals.netAmount, settings.currency)}</span>
                    <span className="text-emerald-700 font-semibold">
                      VAT {formatMoney(editTotals.vatAmount, settings.currency)}
                    </span>
                    <span className="font-bold">
                      Gross {formatMoney(editTotals.grossAmount, settings.currency)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200 items-end">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Amount Paid ({settings.currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editAmountPaid}
                      onChange={(e) => setEditAmountPaid(e.target.value)}
                      className="w-full border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1.5">
                    <input
                      type="checkbox"
                      checked={editWhtApplicable}
                      onChange={(e) => setEditWhtApplicable(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600"
                    />
                    <span>WHT %</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      disabled={!editWhtApplicable}
                      value={editWhtRate}
                      onChange={(e) => setEditWhtRate(e.target.value)}
                      className="w-16 border border-slate-200 rounded px-2 py-1 font-mono-nums bg-white disabled:bg-slate-100"
                    />
                  </div>
                  <div className="flex items-center pb-1.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editWhtRemitted}
                        disabled={!editWhtApplicable}
                        onChange={(e) => setEditWhtRemitted(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600"
                      />
                      <span>WHT Remitted</span>
                    </label>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Payment Ref
                    </label>
                    <input
                      type="text"
                      value={editPayRef}
                      onChange={(e) => setEditPayRef(e.target.value)}
                      className="w-full border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  maxLength={1000}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Supplier Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Delete Confirmation Modal */}
      {deleteConfirmInvoice && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Delete Supplier Tax Invoice?
              </h2>
              <button
                type="button"
                onClick={() => setDeleteConfirmInvoice(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs text-slate-600">
              <p>
                Permanently delete supplier voucher{' '}
                <strong className="font-mono-nums text-slate-900">
                  {deleteConfirmInvoice.recordNumber}
                </strong>{' '}
                ({deleteConfirmInvoice.supplierName} ·{' '}
                <strong className="font-mono-nums text-slate-900">
                  {formatMoney(deleteConfirmInvoice.grossAmount, settings.currency)}
                </strong>
                )?
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmInvoice(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete Voucher'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
