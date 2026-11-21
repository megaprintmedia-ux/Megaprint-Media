import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import {
  ChartAccount,
  Client,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Job,
  PricingMode,
  TaxAccessScope,
  UserRole,
  VatTreatment,
} from '../types/erp';
import {
  calculateVatBreakdown,
  calculateWithholdingTax,
  computeInvoiceVatReportable,
  formatMoney,
  round2,
  summarizeTaxBreakdown,
} from '../utils/vat';
import { BrandLogo } from './BrandLogo';
import { DayViewControls } from './DayViewControls';
import { DateSort, datedRecords } from '../utils/dateViews';
import { StatusText } from './StatusText';

interface InvoicesVatViewProps {
  role: UserRole;
  taxScope?: TaxAccessScope;
  settings: CompanySettings;
  chartOfAccounts: ChartAccount[];
  invoices: Invoice[];
  clients: Client[];
  jobs: Job[];
  prefillJob: Job | null;
  onClearPrefillJob: () => void;
  onCreateInvoice: (
    input: Omit<Invoice, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onUpdateInvoice?: (
    invoiceId: string,
    input: {
      invoiceNumber: string;
      jobId?: string;
      jobNumber?: string;
      clientId: string;
      clientName: string;
      clientVatPin?: string;
      clientTin?: string;
      clientVatReg?: string;
      issueDate: string;
      dueDate: string;
      status: InvoiceStatus;
      pricingMode: PricingMode;
      vatRate: number;
      lines: InvoiceLine[];
      whtRate?: number;
      whtWithheldAmount?: number;
      whtCertificateRef?: string;
      amountPaid: number;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    }
  ) => Promise<void>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  onRecordPayment: (
    invoice: Invoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string,
    options?: {
      whtWithheld?: number;
      whtRate?: number;
      whtCertificateRef?: string;
    }
  ) => Promise<void>;
  onUpdateStatus: (invoiceId: string, status: Invoice['status']) => Promise<void>;
}

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  vatTreatment: VatTreatment;
}

const TAX_CODE_LABEL: Record<VatTreatment, string> = {
  standard: 'Standard VAT',
  zero: 'Zero-Rated (0%)',
  exempt: 'Exempt',
};

const INVOICE_STATUSES: InvoiceStatus[] = [
  'Draft',
  'Issued',
  'Part Paid',
  'Paid',
  'Overdue',
  'Void',
];

export const InvoicesVatView: React.FC<InvoicesVatViewProps> = ({
  role,
  taxScope = 'all',
  settings,
  chartOfAccounts,
  invoices,
  clients,
  jobs,
  prefillJob,
  onClearPrefillJob,
  onCreateInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onRecordPayment,
  onUpdateStatus,
}) => {
  const isVatOnly = role === 'accounts' && taxScope === 'vat_only';
  const isManagement = role === 'management' && !isVatOnly;

  const cashBookAccounts = useMemo(() => {
    const active = chartOfAccounts
      .filter((a) => a.isCashBookAccount && a.isActive)
      .map((a) => a.name);
    return active.length > 0 ? active : [...DEFAULT_ZIM_CASH_ACCOUNTS];
  }, [chartOfAccounts]);

  const [invoiceDay, setInvoiceDay] = useState('');
  const [dateSort, setDateSort] = useState<DateSort>('newest');
  const [statusFilter, setStatusFilter] = useState<'All' | Invoice['status']>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentModalInv, setPaymentModalInv] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteConfirmInvoice, setDeleteConfirmInvoice] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit invoice state
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editClientId, setEditClientId] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientTin, setEditClientTin] = useState('');
  const [editClientVatReg, setEditClientVatReg] = useState('');
  const [editJobId, setEditJobId] = useState('');
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<InvoiceStatus>('Issued');
  const [editPricingMode, setEditPricingMode] = useState<PricingMode>('exclusive');
  const [editVatRate, setEditVatRate] = useState('15');
  const [editAmountPaid, setEditAmountPaid] = useState('0');
  const [editPayMethod, setEditPayMethod] = useState('');
  const [editPayRef, setEditPayRef] = useState('');
  const [editWhtRate, setEditWhtRate] = useState('0');
  const [editWhtAmount, setEditWhtAmount] = useState('0');
  const [editWhtCertRef, setEditWhtCertRef] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLines, setEditLines] = useState<DraftLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Create invoice state
  const [clientId, setClientId] = useState('');
  const [jobId, setJobId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>('exclusive');
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate ?? 15));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { description: '', quantity: '1', unitPrice: '0', vatTreatment: 'standard' },
  ]);
  const [saving, setSaving] = useState(false);

  // Payment modal state (supports Client WHT withholding)
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer / ZIPIT');
  const [payAccount, setPayAccount] = useState(
    cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [payRef, setPayRef] = useState('');
  const [whtApplied, setWhtApplied] = useState(false);
  const [whtRateInput, setWhtRateInput] = useState('30');
  const [whtAmountInput, setWhtAmountInput] = useState('0');
  const [whtCertRef, setWhtCertRef] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  useEffect(() => {
    if (prefillJob) {
      if (
        prefillJob.legacyLinesExtracted === false ||
        prefillJob.vatTreatment === 'unknown'
      ) {
        onClearPrefillJob();
        return;
      }
      setClientId(prefillJob.clientId);
      setJobId(prefillJob.id);
      setPricingMode(prefillJob.pricingMode);
      setVatRate(String(prefillJob.vatRate));
      setLines([
        {
          description: `${prefillJob.title} (${prefillJob.jobNumber})`,
          quantity: String(prefillJob.quantity),
          unitPrice: String(prefillJob.unitPrice),
          vatTreatment: prefillJob.vatTreatment,
        },
      ]);
      setShowCreate(true);
      onClearPrefillJob();
    }
  }, [prefillJob, onClearPrefillJob]);

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
        description: line.description.trim() || 'Print / Tailoring Item',
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
        description: line.description.trim() || 'Print / Tailoring Item',
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

  const filteredInvoices = useMemo(() => {
    return datedRecords(invoices.filter(i => statusFilter === 'All' || i.status === statusFilter), i => i.issueDate, invoiceDay, dateSort);
  }, [invoices, statusFilter, invoiceDay, dateSort]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenClient = clients.find((c) => c.id === clientId) || clients[0];
    if (!chosenClient || computedLines.length === 0) return;
    const chosenJob = jobs.find((j) => j.id === jobId);
    if (
      chosenJob &&
      (chosenJob.legacyLinesExtracted === false || chosenJob.vatTreatment === 'unknown')
    ) {
      return;
    }
    const clientTin = (chosenClient.zimraTin || chosenClient.taxPin || '').trim();
    const clientVatReg = (chosenClient.vatRegNumber || '').trim();

    setSaving(true);
    try {
      const nextInvNo = `INV-${new Date().getFullYear()}-${String(83 + invoices.length).padStart(3, '0')}`;
      await onCreateInvoice({
        invoiceNumber: nextInvNo,
        jobId: chosenJob?.id || '',
        jobNumber: chosenJob?.jobNumber || '',
        clientId: chosenClient.id,
        clientName: chosenClient.companyName,
        clientVatPin: clientTin || clientVatReg,
        clientTin,
        clientVatReg,
        issueDate,
        dueDate,
        status: 'Issued',
        pricingMode,
        vatRate: Number(vatRate) || 0,
        lines: computedLines,
        standardNetAmount: totals.standardNetAmount,
        zeroRatedAmount: totals.zeroRatedAmount,
        exemptAmount: totals.exemptAmount,
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        whtRate: 0,
        whtWithheldAmount: 0,
        whtCertificateRef: '',
        amountPaid: 0,
        balanceDue: totals.grossAmount,
        paymentMethod: '',
        paymentReference: '',
        notes: notes.trim(),
      });
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const openPaymentModal = (inv: Invoice) => {
    setPaymentModalInv(inv);
    setPayAmount(String(inv.balanceDue));
    setPayAccount(cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]);
    setPayRef('');
    setWhtApplied(false);
    setWhtRateInput('30');
    setWhtAmountInput('0');
    setWhtCertRef('');
  };

  const handleToggleClientWht = (checked: boolean) => {
    setWhtApplied(checked);
    if (!paymentModalInv) return;
    if (checked) {
      const rate = Number(whtRateInput) || 30;
      const wht = Math.min(
        paymentModalInv.balanceDue,
        calculateWithholdingTax({
          applicable: true,
          baseAmount: paymentModalInv.netAmount,
          ratePct: rate,
        })
      );
      setWhtAmountInput(String(round2(wht)));
      setPayAmount(String(round2(Math.max(0, paymentModalInv.balanceDue - wht))));
    } else {
      setWhtAmountInput('0');
      setPayAmount(String(paymentModalInv.balanceDue));
    }
  };

  const handleWhtRateChange = (nextRateStr: string) => {
    setWhtRateInput(nextRateStr);
    if (!paymentModalInv || !whtApplied) return;
    const rate = Math.max(0, Math.min(50, Number(nextRateStr) || 0));
    const wht = Math.min(
      paymentModalInv.balanceDue,
      calculateWithholdingTax({
        applicable: true,
        baseAmount: paymentModalInv.netAmount,
        ratePct: rate,
      })
    );
    setWhtAmountInput(String(round2(wht)));
    setPayAmount(String(round2(Math.max(0, paymentModalInv.balanceDue - wht))));
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;
    const cashAmt = Math.max(0, round2(Number(payAmount) || 0));
    const whtAmt = whtApplied ? Math.max(0, round2(Number(whtAmountInput) || 0)) : 0;
    if (cashAmt + whtAmt <= 0.005) return;
    if (cashAmt + whtAmt > paymentModalInv.balanceDue + 0.02) return;

    setRecordingPay(true);
    try {
      await onRecordPayment(paymentModalInv, cashAmt, payMethod, payRef, payAccount, {
        whtWithheld: whtAmt,
        whtRate: whtApplied ? Number(whtRateInput) || 0 : 0,
        whtCertificateRef: whtApplied ? whtCertRef.trim() : '',
      });
      setPaymentModalInv(null);
      setPayAmount('');
      setPayRef('');
      setWhtApplied(false);
    } finally {
      setRecordingPay(false);
    }
  };

  const canManagePayments =
    !isVatOnly && (role === 'management' || role === 'accounts');

  const openEditModal = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditInvoiceNumber(inv.invoiceNumber);
    setEditClientId(inv.clientId || '');
    setEditClientName(inv.clientName || '');
    setEditClientTin(inv.clientTin || inv.clientVatPin || '');
    setEditClientVatReg(inv.clientVatReg || '');
    setEditJobId(inv.jobId || '');
    setEditIssueDate(inv.issueDate);
    setEditDueDate(inv.dueDate);
    setEditStatus(inv.status);
    setEditPricingMode(inv.pricingMode || 'exclusive');
    setEditVatRate(String(inv.vatRate ?? settings.defaultVatRate ?? 15));
    setEditAmountPaid(String(inv.amountPaid ?? 0));
    setEditPayMethod(inv.paymentMethod || '');
    setEditPayRef(inv.paymentReference || '');
    setEditWhtRate(String(inv.whtRate ?? 0));
    setEditWhtAmount(String(inv.whtWithheldAmount ?? 0));
    setEditWhtCertRef(inv.whtCertificateRef || '');
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice || !onUpdateInvoice || editComputedLines.length === 0) return;
    const chosenClient = clients.find((c) => c.id === editClientId);
    const chosenJob = jobs.find((j) => j.id === editJobId);
    if (
      chosenJob &&
      (chosenJob.legacyLinesExtracted === false || chosenJob.vatTreatment === 'unknown')
    ) {
      return;
    }
    const cleanTin = editClientTin.trim().toUpperCase();
    const cleanVatReg = editClientVatReg.trim().toUpperCase();
    setSavingEdit(true);
    try {
      await onUpdateInvoice(editingInvoice.id, {
        invoiceNumber: editInvoiceNumber.trim() || editingInvoice.invoiceNumber,
        jobId: chosenJob?.id || editJobId || '',
        jobNumber: chosenJob?.jobNumber || (editJobId ? editingInvoice.jobNumber : ''),
        clientId: chosenClient?.id || editClientId || editingInvoice.clientId,
        clientName:
          chosenClient?.companyName || editClientName.trim() || editingInvoice.clientName,
        clientVatPin: cleanTin || cleanVatReg,
        clientTin: cleanTin,
        clientVatReg: cleanVatReg,
        issueDate: editIssueDate,
        dueDate: editDueDate,
        status: editStatus,
        pricingMode: editPricingMode,
        vatRate: Number(editVatRate) || 0,
        lines: editComputedLines,
        whtRate: Number(editWhtRate) || 0,
        whtWithheldAmount: Number(editWhtAmount) || 0,
        whtCertificateRef: editWhtCertRef.trim(),
        amountPaid: Number(editAmountPaid) || 0,
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
    if (!deleteConfirmInvoice || !onDeleteInvoice) return;
    setDeleting(true);
    try {
      await onDeleteInvoice(deleteConfirmInvoice.id);
      if (selectedInvoice?.id === deleteConfirmInvoice.id) {
        setSelectedInvoice(null);
      }
      setDeleteConfirmInvoice(null);
    } finally {
      setDeleting(false);
    }
  };

  const selectedSummary = useMemo(() => {
    if (!selectedInvoice) return null;
    return summarizeTaxBreakdown(selectedInvoice.lines || [], {
      netAmount: selectedInvoice.netAmount,
      vatAmount: selectedInvoice.vatAmount,
      grossAmount: selectedInvoice.grossAmount,
    });
  }, [selectedInvoice]);

  return (
    <div className="space-y-5">
      {isVatOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 no-print">
          <strong>ZIMRA / VAT-Only Read-Only View:</strong> Showing only issued VAT-taxable
          invoices with a client ZIMRA TIN or VAT Reg #. Non-VAT, zero-VAT, Draft, Void, and
          no-TIN invoices remain restricted to internal business staff.
        </div>
      )}

      {/* Header Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          {(['All', 'Issued', 'Part Paid', 'Paid', 'Overdue', 'Void'] as const).map(
            (st) => (
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
            )
          )}
        </div>
        {!isVatOnly && (
          <button
            type="button"
            onClick={() => {
              setLines([
                { description: '', quantity: '1', unitPrice: '0', vatTreatment: 'standard' },
              ]);
              setJobId('');
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>New Tax Invoice</span>
          </button>
        )}
      </div>

      <DayViewControls label="Customer invoices" dates={invoices.filter(i => statusFilter === 'All' || i.status === statusFilter).map(i => i.issueDate)} day={invoiceDay} onDayChange={setInvoiceDay} sort={dateSort} onSortChange={setDateSort} />
      {/* Invoices Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
        {filteredInvoices.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No tax invoices yet. Generate an invoice from a Job Card or click &ldquo;New Tax Invoice&rdquo;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Client &amp; ZIMRA Tax #</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Net</th>
                  <th className="py-2.5 px-4 text-right">VAT</th>
                  <th className="py-2.5 px-4 text-right">Gross Total</th>
                  <th className="py-2.5 px-4 text-right">Balance Due</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredInvoices.map((inv) => {
                  const tinDisplay = inv.clientTin || inv.clientVatPin;
                  const taxSummary = summarizeTaxBreakdown(inv.lines || [], {
                    netAmount: inv.netAmount,
                    vatAmount: inv.vatAmount,
                    grossAmount: inv.grossAmount,
                  });
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono-nums text-xs font-semibold text-blue-700">
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-nums">
                          {inv.issueDate}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{inv.clientName}</div>
                        <div className="text-xs text-slate-500 font-mono-nums">
                          {inv.jobNumber ? `Job ${inv.jobNumber}` : 'Direct'}
                          {tinDisplay ? ` · TIN ${tinDisplay}` : ''}
                          {inv.clientVatReg ? ` · VAT ${inv.clientVatReg}` : ''}
                        </div>
                        {!isVatOnly && !computeInvoiceVatReportable(inv) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Internal only · Hidden from ZIMRA (no VAT or TIN)
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={inv.status} />
                        {(inv.whtWithheldAmount || 0) > 0 && (
                          <div className="text-[11px] text-amber-700 font-mono-nums mt-0.5">
                            WHT {formatMoney(inv.whtWithheldAmount || 0, settings.currency)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                        {inv.dueDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800 whitespace-nowrap">
                        <div>{formatMoney(inv.netAmount, settings.currency)}</div>
                        {(taxSummary.zeroRatedAmount > 0 || taxSummary.exemptAmount > 0) && (
                          <div className="text-[10px] text-slate-400">
                            {taxSummary.zeroRatedAmount > 0 ? 'Incl. Zero 0%' : 'Incl. Exempt'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatMoney(inv.vatAmount, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {formatMoney(inv.grossAmount, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {formatMoney(inv.balanceDue, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="px-2.5 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            View / Print
                          </button>
                          {canManagePayments &&
                            inv.status !== 'Paid' &&
                            inv.status !== 'Void' && (
                              <button
                                type="button"
                                onClick={() => openPaymentModal(inv)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                              >
                                <CreditCard className="h-3.5 w-3.5" />
                                <span>Pay</span>
                              </button>
                            )}
                          {isManagement && onUpdateInvoice && (
                            <button
                              type="button"
                              onClick={() => openEditModal(inv)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                              title="Edit invoice"
                              aria-label={`Edit ${inv.invoiceNumber}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {isManagement && onDeleteInvoice && (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmInvoice(inv)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                              title="Delete invoice"
                              aria-label={`Delete ${inv.invoiceNumber}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

      {/* Create Invoice Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl my-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Create VAT Tax Invoice
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {clients.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Please register a client first before creating an invoice.
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Client
                    </label>
                    <select
                      value={clientId || clients[0]?.id || ''}
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      {clients.map((c) => {
                        const tin = c.zimraTin || c.taxPin;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.companyName}{' '}
                            {tin ? `(TIN: ${tin})` : ''}
                            {c.vatRegNumber ? ` · VAT ${c.vatRegNumber}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Issue Date
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Linked Job (Optional)
                    </label>
                    <select
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="">None</option>
                      {jobs.map((j) => {
                        const blocked =
                          j.legacyLinesExtracted === false || j.vatTreatment === 'unknown';
                        return (
                          <option key={j.id} value={j.id} disabled={blocked}>
                            {j.jobNumber} — {j.title}
                            {blocked ? ' (Specs Missing — Cannot Invoice)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      VAT Pricing Mode
                    </label>
                    <select
                      value={pricingMode}
                      onChange={(e) => setPricingMode(e.target.value as PricingMode)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="exclusive">VAT Exclusive (+ VAT)</option>
                      <option value="inclusive">VAT Inclusive (Extract VAT)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Standard VAT Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Invoice Line Items (max 10 · supports Standard VAT, Zero-Rated 0%, and Exempt)
                    </span>
                    {lines.length < 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines([
                            ...lines,
                            {
                              description: '',
                              quantity: '1',
                              unitPrice: '0',
                              vatTreatment: 'standard',
                            },
                          ])
                        }
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        + Add Line
                      </button>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <div
                        key={idx}
                        className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                      >
                        <input
                          type="text"
                          required
                          value={line.description}
                          onChange={(e) => {
                            const copy = [...lines];
                            copy[idx].description = e.target.value;
                            setLines(copy);
                          }}
                          placeholder="Item or service description"
                          className="sm:col-span-5 border border-slate-200 rounded px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="number"
                          min="1"
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const copy = [...lines];
                            copy[idx].quantity = e.target.value;
                            setLines(copy);
                          }}
                          className="sm:col-span-2 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono-nums"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={line.unitPrice}
                          onChange={(e) => {
                            const copy = [...lines];
                            copy[idx].unitPrice = e.target.value;
                            setLines(copy);
                          }}
                          className="sm:col-span-2 border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono-nums"
                        />
                        <select
                          value={line.vatTreatment}
                          onChange={(e) => {
                            const copy = [...lines];
                            copy[idx].vatTreatment = e.target.value as VatTreatment;
                            setLines(copy);
                          }}
                          className="sm:col-span-2 border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="standard">VAT {vatRate}%</option>
                          <option value="zero">Zero-Rated 0%</option>
                          <option value="exempt">Exempt</option>
                        </select>
                        <div className="sm:col-span-1 flex justify-end">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setLines(lines.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="flex flex-col sm:flex-row justify-between gap-4 pt-3 border-t border-slate-200">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Invoice Notes / Bank Details
                    </label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="w-full sm:w-80 bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Standard-Rated Net ({vatRate}%)</span>
                      <span className="font-mono-nums font-medium text-slate-900">
                        {formatMoney(totals.standardNetAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Zero-Rated Supplies (0%)</span>
                      <span className="font-mono-nums font-medium text-slate-900">
                        {formatMoney(totals.zeroRatedAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">VAT-Exempt Supplies</span>
                      <span className="font-mono-nums font-medium text-slate-900">
                        {formatMoney(totals.exemptAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200">
                      <span className="text-slate-700 font-medium">Total Net (Excl. VAT)</span>
                      <span className="font-mono-nums font-semibold text-slate-900">
                        {formatMoney(totals.netAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Output VAT ({vatRate}%)</span>
                      <span className="font-mono-nums font-medium text-slate-900">
                        {formatMoney(totals.vatAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1.5 border-t border-slate-200 font-bold text-sm text-slate-900">
                      <span>Gross Total</span>
                      <span className="font-mono-nums">
                        {formatMoney(totals.grossAmount, settings.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
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
                    className="px-5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    {saving ? 'Issuing Invoice...' : 'Issue Tax Invoice'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Modal (with Client WHT Certificate deduction) */}
      {paymentModalInv && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Record Payment — {paymentModalInv.invoiceNumber}
              </h3>
              <button
                type="button"
                onClick={() => setPaymentModalInv(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-5 space-y-4">
              <div className="text-xs text-slate-600 flex justify-between bg-slate-50 border border-slate-200 rounded p-2.5">
                <span>
                  Invoice Net:{' '}
                  <strong className="font-mono-nums text-slate-900">
                    {formatMoney(paymentModalInv.netAmount, settings.currency)}
                  </strong>
                </span>
                <span>
                  Balance Due:{' '}
                  <strong className="font-mono-nums text-slate-900">
                    {formatMoney(paymentModalInv.balanceDue, settings.currency)}
                  </strong>
                </span>
              </div>

              <div className="border border-slate-200 rounded-md p-3 space-y-3 bg-amber-50/40">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whtApplied}
                    onChange={(e) => handleToggleClientWht(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Client deducted Withholding Tax (WHT)</span>
                </label>

                {whtApplied && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        WHT Rate (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={whtRateInput}
                        onChange={(e) => handleWhtRateChange(e.target.value)}
                        className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono-nums bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        WHT Withheld ({settings.currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={paymentModalInv.balanceDue}
                        step="0.01"
                        value={whtAmountInput}
                        onChange={(e) => {
                          const wht = Math.max(
                            0,
                            Math.min(
                              paymentModalInv.balanceDue,
                              Number(e.target.value) || 0
                            )
                          );
                          setWhtAmountInput(e.target.value);
                          setPayAmount(
                            String(round2(Math.max(0, paymentModalInv.balanceDue - wht)))
                          );
                        }}
                        className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono-nums bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        ZIMRA WHT Certificate #
                      </label>
                      <input
                        type="text"
                        value={whtCertRef}
                        onChange={(e) => setWhtCertRef(e.target.value)}
                        placeholder="e.g. WHT-2026-00412"
                        className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono-nums bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cash / Bank Amount Received ({settings.currency})
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
                {whtApplied && (
                  <div className="mt-1 text-[11px] text-slate-500 font-mono-nums">
                    Total Settled = Cash{' '}
                    {formatMoney(Number(payAmount) || 0, settings.currency)} + WHT{' '}
                    {formatMoney(Number(whtAmountInput) || 0, settings.currency)} ={' '}
                    <strong className="text-slate-900">
                      {formatMoney(
                        (Number(payAmount) || 0) + (Number(whtAmountInput) || 0),
                        settings.currency
                      )}
                    </strong>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Deposit Into Bank / Cash Account
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
                  <option value="Bank Transfer / ZIPIT">Bank Transfer / ZIPIT / RTGS</option>
                  <option value="EcoCash / InnBucks">EcoCash / InnBucks</option>
                  <option value="USD Cash">USD Cash Drawer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  required
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. ZIPIT-884120 or EC2604..."
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
                  className="px-4 py-2 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  {recordingPay ? 'Saving...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Tax Invoice Modal */}
      {selectedInvoice && selectedSummary && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 sm:p-6 print:static print:inset-auto print:bg-transparent print:p-0 print:overflow-visible">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl my-4 overflow-hidden print:border-0 print:max-w-none print:my-0 print:shadow-none">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
              <div className="flex items-center gap-3">
                <span className="font-mono-nums text-sm font-bold text-slate-900">
                  {selectedInvoice.invoiceNumber}
                </span>
                <StatusText status={selectedInvoice.status} />
              </div>
              <div className="flex items-center gap-2">
                {isManagement && selectedInvoice.status !== 'Void' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onUpdateStatus(selectedInvoice.id, 'Void');
                      setSelectedInvoice(null);
                    }}
                    className="px-3 py-1.5 rounded border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Void Invoice
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Tax Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 print:p-0">
              <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-slate-200 pb-6">
                <div className="space-y-1.5">
                  <BrandLogo
                    logoDataUrl={settings.logoDataUrl}
                    companyName={settings.companyName}
                    variant="light"
                  />
                  <div className="text-xs text-slate-600 pt-2 space-y-0.5">
                    <div>{settings.address}</div>
                    <div>
                      {settings.phone} · {settings.email}
                    </div>
                    <div className="font-mono-nums font-medium text-slate-800">
                      ZIMRA TIN: {settings.zimraTin || settings.taxPin || '—'} · VAT Reg #:{' '}
                      {settings.vatRegNumber || '—'}
                    </div>
                  </div>
                </div>
                <div className="sm:text-right space-y-1 text-xs">
                  <div className="font-display text-xl font-bold text-slate-900">
                    FISCAL TAX INVOICE
                  </div>
                  <div className="font-mono-nums font-semibold text-slate-800">
                    {selectedInvoice.invoiceNumber}
                  </div>
                  <div className="text-slate-600">
                    Issue Date:{' '}
                    <span className="font-mono-nums">{selectedInvoice.issueDate}</span>
                  </div>
                  <div className="text-slate-600">
                    Due Date:{' '}
                    <span className="font-mono-nums">{selectedInvoice.dueDate}</span>
                  </div>
                </div>
              </div>

              <div className="text-xs space-y-1">
                <div className="text-slate-500 font-medium">Billed To</div>
                <div className="text-sm font-bold text-slate-900">
                  {selectedInvoice.clientName}
                </div>
                <div className="font-mono-nums text-slate-600">
                  Client ZIMRA TIN:{' '}
                  {selectedInvoice.clientTin ||
                    selectedInvoice.clientVatPin ||
                    'Not provided'}{' '}
                  · VAT Reg #: {selectedInvoice.clientVatReg || 'Non-VAT / Not provided'}
                </div>
                {selectedInvoice.jobNumber && (
                  <div className="font-mono-nums text-slate-600">
                    Job Reference: {selectedInvoice.jobNumber}
                  </div>
                )}
              </div>

              <table className="w-full text-left border-collapse text-xs border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Tax Code</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Net</th>
                    <th className="py-2.5 px-3 text-right">VAT</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoice.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        {line.description}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {line.vatTreatment === 'standard'
                          ? `VAT ${selectedInvoice.vatRate}%`
                          : TAX_CODE_LABEL[line.vatTreatment] || 'VAT'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums">
                        {line.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums">
                        {formatMoney(line.unitPrice, settings.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums">
                        {formatMoney(line.netAmount, settings.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums">
                        {formatMoney(line.vatAmount, settings.currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums font-semibold">
                        {formatMoney(line.grossAmount, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-80 space-y-1.5 text-xs border border-slate-200 rounded-md p-4 bg-slate-50">
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Standard-Rated Net ({selectedInvoice.vatRate}%)
                    </span>
                    <span className="font-mono-nums">
                      {formatMoney(
                        selectedInvoice.standardNetAmount ??
                          selectedSummary.standardNetAmount,
                        settings.currency
                      )}
                    </span>
                  </div>
                  {(selectedInvoice.zeroRatedAmount ?? selectedSummary.zeroRatedAmount) >
                    0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Zero-Rated (0%)</span>
                      <span className="font-mono-nums">
                        {formatMoney(
                          selectedInvoice.zeroRatedAmount ??
                            selectedSummary.zeroRatedAmount,
                          settings.currency
                        )}
                      </span>
                    </div>
                  )}
                  {(selectedInvoice.exemptAmount ?? selectedSummary.exemptAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">VAT-Exempt</span>
                      <span className="font-mono-nums">
                        {formatMoney(
                          selectedInvoice.exemptAmount ?? selectedSummary.exemptAmount,
                          settings.currency
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-600">Net Subtotal</span>
                    <span className="font-mono-nums font-medium">
                      {formatMoney(selectedInvoice.netAmount, settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      VAT ({selectedInvoice.vatRate}%)
                    </span>
                    <span className="font-mono-nums">
                      {formatMoney(selectedInvoice.vatAmount, settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200">
                    <span>Gross Total</span>
                    <span className="font-mono-nums">
                      {formatMoney(selectedInvoice.grossAmount, settings.currency)}
                    </span>
                  </div>
                  {(selectedInvoice.whtWithheldAmount || 0) > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>
                        WHT Certificate Credit
                        {selectedInvoice.whtCertificateRef
                          ? ` (${selectedInvoice.whtCertificateRef})`
                          : ''}
                      </span>
                      <span className="font-mono-nums">
                        {formatMoney(
                          selectedInvoice.whtWithheldAmount || 0,
                          settings.currency
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-700">
                    <span>Total Settled (Cash + WHT)</span>
                    <span className="font-mono-nums">
                      {formatMoney(selectedInvoice.amountPaid, settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                    <span>Balance Due</span>
                    <span className="font-mono-nums">
                      {formatMoney(selectedInvoice.balanceDue, settings.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Management Edit Tax Invoice Modal */}
      {editingInvoice && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl my-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Edit Invoice · {editingInvoice.invoiceNumber}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Management transaction adjustment — recalculates VAT &amp; ZIMRA visibility automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInvoice(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Invoice # *
                  </label>
                  <input
                    type="text"
                    required
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Client</label>
                  <select
                    value={editClientId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setEditClientId(nextId);
                      const c = clients.find((item) => item.id === nextId);
                      if (c) {
                        setEditClientName(c.companyName);
                        setEditClientTin(c.zimraTin || c.taxPin || '');
                        setEditClientVatReg(c.vatRegNumber || '');
                      }
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {!clients.some((c) => c.id === editClientId) && (
                      <option value={editClientId}>{editClientName}</option>
                    )}
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as InvoiceStatus)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {INVOICE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Client ZIMRA TIN
                  </label>
                  <input
                    type="text"
                    value={editClientTin}
                    onChange={(e) => setEditClientTin(e.target.value)}
                    placeholder="TIN (blank hides from ZIMRA)"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Client VAT Reg #
                  </label>
                  <input
                    type="text"
                    value={editClientVatReg}
                    onChange={(e) => setEditClientVatReg(e.target.value)}
                    placeholder="VAT Reg #"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editIssueDate}
                    onChange={(e) => setEditIssueDate(e.target.value)}
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Linked Job
                  </label>
                  <select
                    value={editJobId}
                    onChange={(e) => setEditJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="">Direct / None</option>
                    {jobs.map((j) => {
                      const blocked =
                        j.legacyLinesExtracted === false || j.vatTreatment === 'unknown';
                      return (
                        <option key={j.id} value={j.id} disabled={blocked}>
                          {j.jobNumber} — {j.title}
                          {blocked ? ' (Specs Missing — Cannot Invoice)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    VAT Pricing Mode
                  </label>
                  <select
                    value={editPricingMode}
                    onChange={(e) => setEditPricingMode(e.target.value as PricingMode)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="exclusive">VAT Exclusive (+ VAT)</option>
                    <option value="inclusive">VAT Inclusive (Extract VAT)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Standard VAT Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={editVatRate}
                    onChange={(e) => setEditVatRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    Line Items (Max 10)
                  </span>
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
                      className="font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + Add Line
                    </button>
                  )}
                </div>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {editLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <input
                        type="text"
                        required
                        value={line.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, description: v } : row
                            )
                          );
                        }}
                        placeholder="Item description"
                        className="sm:col-span-5 border border-slate-200 rounded px-2.5 py-1.5"
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        value={line.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, quantity: v } : row
                            )
                          );
                        }}
                        className="sm:col-span-2 border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={line.unitPrice}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitPrice: v } : row
                            )
                          );
                        }}
                        className="sm:col-span-2 border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums"
                      />
                      <select
                        value={line.vatTreatment}
                        onChange={(e) => {
                          const v = e.target.value as VatTreatment;
                          setEditLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, vatTreatment: v } : row
                            )
                          );
                        }}
                        className="sm:col-span-2 border border-slate-200 rounded px-2 py-1.5 bg-white"
                      >
                        <option value="standard">VAT {editVatRate}%</option>
                        <option value="zero">Zero 0%</option>
                        <option value="exempt">Exempt</option>
                      </select>
                      <div className="sm:col-span-1 flex justify-end">
                        {editLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditLines((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Amount Settled ({settings.currency})
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
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    WHT Retained ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editWhtAmount}
                    onChange={(e) => setEditWhtAmount(e.target.value)}
                    className="w-full border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    WHT Certificate #
                  </label>
                  <input
                    type="text"
                    value={editWhtCertRef}
                    onChange={(e) => setEditWhtCertRef(e.target.value)}
                    className="w-full border border-slate-200 rounded px-2.5 py-1.5 font-mono-nums bg-white"
                  />
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

              <div className="flex flex-col sm:flex-row justify-between gap-4 pt-2 border-t border-slate-200">
                <div className="flex-1">
                  <label className="block font-medium text-slate-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div className="flex items-end gap-4 font-mono-nums">
                  <div>
                    <div className="text-[11px] text-slate-500">Net</div>
                    <div className="font-semibold">
                      {formatMoney(editTotals.netAmount, settings.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">VAT</div>
                    <div className="font-semibold">
                      {formatMoney(editTotals.vatAmount, settings.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Gross</div>
                    <div className="font-bold text-slate-900">
                      {formatMoney(editTotals.grossAmount, settings.currency)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
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
                  className="px-5 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save Invoice Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Management Delete Confirmation Modal */}
      {deleteConfirmInvoice && isManagement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Delete Tax Invoice?
              </h3>
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
                Permanently delete invoice{' '}
                <strong className="font-mono-nums text-slate-900">
                  {deleteConfirmInvoice.invoiceNumber}
                </strong>{' '}
                for{' '}
                <strong className="text-slate-900">
                  {deleteConfirmInvoice.clientName}
                </strong>{' '}
                (
                <strong className="font-mono-nums text-slate-900">
                  {formatMoney(deleteConfirmInvoice.grossAmount, settings.currency)}
                </strong>
                )? This removes it from sales and VAT schedules.
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
                  {deleting ? 'Deleting...' : 'Delete Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
