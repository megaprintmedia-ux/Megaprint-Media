import React, { useMemo, useState } from 'react';
import {
  CreditCard,
  Download,
  FileText,
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
  UserRole,
  VatTreatment,
} from '../types/erp';
import { calculateVatBreakdown, formatMoney, round2 } from '../utils/vat';
import { StatusText } from './StatusText';

interface SupplierInvoicesViewProps {
  role: UserRole;
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
  onRecordSupplierPayment: (
    supplierInvoice: SupplierInvoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string
  ) => Promise<void>;
  onUpdateVatStatus: (
    supplierInvoiceId: string,
    updates: Partial<
      Pick<SupplierInvoice, 'status' | 'isVatClaimable' | 'supplierTaxPin' | 'notes'>
    >
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

export const SupplierInvoicesView: React.FC<SupplierInvoicesViewProps> = ({
  role,
  settings,
  chartOfAccounts,
  supplierInvoices,
  jobs,
  onCreateSupplierInvoice,
  onRecordSupplierPayment,
  onUpdateVatStatus,
  onDeleteSupplierInvoice,
}) => {
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

  // Create form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierTaxPin, setSupplierTaxPin] = useState('');
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
  const [recordingPay, setRecordingPay] = useState(false);

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

  const totals = useMemo(() => {
    const netAmount = round2(computedLines.reduce((a, l) => a + l.netAmount, 0));
    const vatAmount = round2(computedLines.reduce((a, l) => a + l.vatAmount, 0));
    const grossAmount = round2(computedLines.reduce((a, l) => a + l.grossAmount, 0));
    return { netAmount, vatAmount, grossAmount };
  }, [computedLines]);

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
    const missingPinCount = supplierInvoices.filter(
      (s) => s.vatAmount > 0 && !s.supplierTaxPin.trim()
    ).length;
    const totalGrossRecorded = round2(
      supplierInvoices.reduce((acc, s) => acc + (s.grossAmount || 0), 0)
    );
    return {
      totalPayable,
      totalClaimableVat,
      missingPinCount,
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
        (inv.supplierTaxPin || '').toLowerCase().includes(q) ||
        (inv.jobNumber || '').toLowerCase().includes(q)
      );
    });
  }, [supplierInvoices, statusFilter, searchQuery]);

  const resetForm = () => {
    setSupplierName('');
    setSupplierTaxPin('');
    setSupplierInvoiceNo('');
    setCategory('Materials & Substrates');
    setJobId('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setPricingMode('exclusive');
    setVatRate(String(settings.defaultVatRate ?? 15));
    setIsVatClaimable(true);
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

    setSaving(true);
    try {
      const nextRecNo = `SI-${new Date().getFullYear()}-${String(
        1 + supplierInvoices.length
      ).padStart(3, '0')}`;
      await onCreateSupplierInvoice({
        recordNumber: nextRecNo,
        supplierName: supplierName.trim(),
        supplierTaxPin: supplierTaxPin.trim().toUpperCase(),
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
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;
    const amt = Math.max(0.01, Number(payAmount) || 0);
    setRecordingPay(true);
    try {
      await onRecordSupplierPayment(
        paymentModalInv,
        amt,
        payMethod,
        payRef,
        payAccount
      );
      setPaymentModalInv(null);
      setPayAmount('');
      setPayRef('');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [
        'Voucher #',
        'Supplier Name',
        'Supplier ZIMRA BP #',
        'Supplier Invoice #',
        'Category',
        'Job #',
        'Invoice Date',
        'Due Date',
        'Status',
        'VAT Claimable',
        'Net Amount',
        'Input VAT',
        'Gross Amount',
        'Amount Paid',
        'Balance Due',
      ],
      ...filteredInvoices.map((s) => [
        s.recordNumber,
        s.supplierName,
        s.supplierTaxPin || '',
        s.supplierInvoiceNo,
        s.category,
        s.jobNumber || '',
        s.invoiceDate,
        s.dueDate,
        s.status,
        s.isVatClaimable ? 'Yes' : 'No',
        s.netAmount.toFixed(2),
        s.vatAmount.toFixed(2),
        s.grossAmount.toFixed(2),
        s.amountPaid.toFixed(2),
        s.balanceDue.toFixed(2),
      ]),
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
          <div className="mt-1 text-xs text-slate-500">
            {supplierInvoices.filter((s) => s.status !== 'Paid').length} invoices awaiting
            settlement
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">ZIMRA BP Audit Status</div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              summary.missingPinCount > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {summary.missingPinCount === 0
              ? '100% Compliant'
              : `${summary.missingPinCount} Missing BP #`}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Supplier ZIMRA BP # required to claim Input VAT
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
              placeholder="Search supplier, BP #, invoice #..."
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-900 w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                  <th className="py-2.5 px-4">Supplier &amp; ZIMRA BP #</th>
                  <th className="py-2.5 px-4">Category &amp; Job</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Net</th>
                  <th className="py-2.5 px-4 text-right">Input VAT</th>
                  <th className="py-2.5 px-4 text-right">Gross</th>
                  <th className="py-2.5 px-4 text-right">Balance Due</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInvoices.map((inv) => (
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
                        {inv.supplierTaxPin ? inv.supplierTaxPin : 'No ZIMRA BP #'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs text-slate-800">{inv.category}</div>
                      <div className="text-[11px] text-slate-500 font-mono-nums">
                        {inv.jobNumber ? `Job ${inv.jobNumber}` : 'General Overhead'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={inv.status} />
                    </td>
                    <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {inv.dueDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-700 whitespace-nowrap">
                      {formatMoney(inv.netAmount, settings.currency)}
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
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                          title="Inspect supplier tax invoice"
                          aria-label="Inspect supplier tax invoice"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {inv.balanceDue > 0.01 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentModalInv(inv);
                              setPayAmount(String(inv.balanceDue));
                              setPayAccount(
                                cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
                              );
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            <span>Pay</span>
                          </button>
                        )}
                        {role === 'management' && (
                          <button
                            type="button"
                            onClick={() => onDeleteSupplierInvoice(inv.id)}
                            className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                            title="Delete supplier invoice"
                            aria-label="Delete supplier invoice"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
                  Capture vendor tax details, line items, and Input VAT credit eligibility
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
                    Supplier ZIMRA BP / VAT #
                  </label>
                  <input
                    type="text"
                    value={supplierTaxPin}
                    onChange={(e) => setSupplierTaxPin(e.target.value)}
                    placeholder="e.g. BP 0200109381"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
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

              {/* VAT Claim & Totals Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVatClaimable}
                    onChange={(e) => setIsVatClaimable(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Eligible for Input VAT Claim on VAT Return</span>
                </label>
                <div className="flex flex-wrap gap-6 font-mono-nums text-xs">
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

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes / Goods Received Reference
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional GRN number, delivery note reference, or payment terms"
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
                  Tax Invoice #{selectedInvoice.supplierInvoiceNo} ·{' '}
                  {selectedInvoice.supplierTaxPin || 'No ZIMRA BP #'}
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
                    Paid: {formatMoney(selectedInvoice.amountPaid, settings.currency)}
                  </div>
                  <div className="text-sm font-bold text-amber-700">
                    Balance: {formatMoney(selectedInvoice.balanceDue, settings.currency)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
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
              <div className="text-xs text-slate-600">
                Supplier: <strong className="text-slate-900">{paymentModalInv.supplierName}</strong>
                <br />
                Balance Due:{' '}
                <strong className="font-mono-nums text-amber-700">
                  {formatMoney(paymentModalInv.balanceDue, settings.currency)}
                </strong>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Amount ({settings.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentModalInv.balanceDue}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
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
    </div>
  );
};
