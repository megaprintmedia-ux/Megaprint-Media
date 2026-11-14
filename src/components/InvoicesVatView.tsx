import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, Printer, Trash2, X } from 'lucide-react';
import {
  ChartAccount,
  Client,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Invoice,
  InvoiceLine,
  Job,
  PricingMode,
  UserRole,
  VatTreatment,
} from '../types/erp';
import { calculateVatBreakdown, formatMoney, round2 } from '../utils/vat';
import { BrandLogo } from './BrandLogo';
import { StatusText } from './StatusText';

interface InvoicesVatViewProps {
  role: UserRole;
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
  onRecordPayment: (
    invoice: Invoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string
  ) => Promise<void>;
  onUpdateStatus: (invoiceId: string, status: Invoice['status']) => Promise<void>;
}

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  vatTreatment: VatTreatment;
}

export const InvoicesVatView: React.FC<InvoicesVatViewProps> = ({
  role,
  settings,
  chartOfAccounts,
  invoices,
  clients,
  jobs,
  prefillJob,
  onClearPrefillJob,
  onCreateInvoice,
  onRecordPayment,
  onUpdateStatus,
}) => {
  const cashBookAccounts = useMemo(() => {
    const active = chartOfAccounts
      .filter((a) => a.isCashBookAccount && a.isActive)
      .map((a) => a.name);
    return active.length > 0 ? active : [...DEFAULT_ZIM_CASH_ACCOUNTS];
  }, [chartOfAccounts]);

  const [statusFilter, setStatusFilter] = useState<'All' | Invoice['status']>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentModalInv, setPaymentModalInv] = useState<Invoice | null>(null);

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

  // Payment modal state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer / ZIPIT');
  const [payAccount, setPayAccount] = useState(
    cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
  );
  const [payRef, setPayRef] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  useEffect(() => {
    if (prefillJob) {
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

  const totals = useMemo(() => {
    const netAmount = round2(computedLines.reduce((a, l) => a + l.netAmount, 0));
    const vatAmount = round2(computedLines.reduce((a, l) => a + l.vatAmount, 0));
    const grossAmount = round2(computedLines.reduce((a, l) => a + l.grossAmount, 0));
    return { netAmount, vatAmount, grossAmount };
  }, [computedLines]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'All') return invoices;
    return invoices.filter((i) => i.status === statusFilter);
  }, [invoices, statusFilter]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenClient = clients.find((c) => c.id === clientId) || clients[0];
    if (!chosenClient || computedLines.length === 0) return;
    const chosenJob = jobs.find((j) => j.id === jobId);

    setSaving(true);
    try {
      const nextInvNo = `INV-${new Date().getFullYear()}-${String(83 + invoices.length).padStart(3, '0')}`;
      await onCreateInvoice({
        invoiceNumber: nextInvNo,
        jobId: chosenJob?.id || '',
        jobNumber: chosenJob?.jobNumber || '',
        clientId: chosenClient.id,
        clientName: chosenClient.companyName,
        clientVatPin: chosenClient.taxPin || '',
        issueDate,
        dueDate,
        status: 'Issued',
        pricingMode,
        vatRate: Number(vatRate) || 0,
        lines: computedLines,
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInv) return;
    const amt = Math.max(0.01, Number(payAmount) || 0);
    setRecordingPay(true);
    try {
      await onRecordPayment(paymentModalInv, amt, payMethod, payRef, payAccount);
      setPaymentModalInv(null);
      setPayAmount('');
      setPayRef('');
    } finally {
      setRecordingPay(false);
    }
  };

  const canManagePayments = role === 'management' || role === 'accounts';

  return (
    <div className="space-y-5">
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
      </div>

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
                  <th className="py-2.5 px-4">Client &amp; Job Ref</th>
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
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-nums text-xs font-semibold text-blue-700 whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{inv.clientName}</div>
                      <div className="text-xs text-slate-500 font-mono-nums">
                        {inv.jobNumber ? `Job ${inv.jobNumber}` : 'Direct Invoice'}
                        {inv.clientVatPin ? ` · ${inv.clientVatPin}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText status={inv.status} />
                    </td>
                    <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                      {inv.dueDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800 whitespace-nowrap">
                      {formatMoney(inv.netAmount, settings.currency)}
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
                              onClick={() => {
                                setPaymentModalInv(inv);
                                setPayAmount(String(inv.balanceDue));
                                setPayAccount(
                                  cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                            >
                              <CreditCard className="h-3.5 w-3.5" />
                              <span>Pay</span>
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
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.companyName} {c.taxPin ? `(${c.taxPin})` : ''}
                        </option>
                      ))}
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
                      {jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.jobNumber} — {j.title}
                        </option>
                      ))}
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
                      Invoice Line Items (max 10)
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
                          <option value="zero">Zero 0%</option>
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
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Net Amount (Excl. VAT)</span>
                      <span className="font-mono-nums font-medium text-slate-900">
                        {formatMoney(totals.netAmount, settings.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total VAT</span>
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

      {/* Record Payment Modal */}
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
              <div className="text-xs text-slate-600">
                Balance Due:{' '}
                <strong className="font-mono-nums text-slate-900">
                  {formatMoney(paymentModalInv.balanceDue, settings.currency)}
                </strong>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Amount Received ({settings.currency})
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
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl my-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
              <div className="flex items-center gap-3">
                <span className="font-mono-nums text-sm font-bold text-slate-900">
                  {selectedInvoice.invoiceNumber}
                </span>
                <StatusText status={selectedInvoice.status} />
              </div>
              <div className="flex items-center gap-2">
                {role === 'management' && selectedInvoice.status !== 'Void' && (
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

            <div className="p-8 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between gap-4 border-b border-slate-200 pb-6">
                <div className="space-y-1.5">
                  <BrandLogo
                    logoDataUrl={settings.logoDataUrl}
                    companyName={settings.companyName}
                    variant="light"
                  />
                  <div className="text-xs text-slate-600 pt-2">
                    <div>{settings.address}</div>
                    <div>
                      {settings.phone} · {settings.email}
                    </div>
                    <div className="font-mono-nums font-medium text-slate-800">
                      ZIMRA BP / VAT Reg #: {settings.taxPin || '—'}
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
                  Client ZIMRA BP / Tax #: {selectedInvoice.clientVatPin || 'Not provided'}
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
                <div className="w-72 space-y-1.5 text-xs border border-slate-200 rounded-md p-4 bg-slate-50">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Net Subtotal</span>
                    <span className="font-mono-nums">
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
                  <div className="flex justify-between text-emerald-700">
                    <span>Amount Paid</span>
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
    </div>
  );
};
