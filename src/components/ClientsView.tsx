import React, { useMemo, useState } from 'react';
import { FileText, Pencil, Plus, Printer, Search, X } from 'lucide-react';
import {
  CashBookEntry,
  Client,
  CompanySettings,
  Invoice,
  Job,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { BrandLogo } from './BrandLogo';

interface ClientsViewProps {
  settings: CompanySettings;
  clients: Client[];
  jobs: Job[];
  invoices: Invoice[];
  cashBookEntries: CashBookEntry[];
  onCreateClient: (
    input: Omit<Client, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onUpdateClient: (
    clientId: string,
    input: Partial<Omit<Client, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
}

interface StatementRow {
  id: string;
  date: string;
  sortOrder: number;
  docRef: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  settings,
  clients,
  jobs,
  invoices,
  cashBookEntries,
  onCreateClient,
  onUpdateClient,
}) => {
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  // Client form state
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [zimraTin, setZimraTin] = useState('');
  const [vatRegNumber, setVatRegNumber] = useState('');
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [address, setAddress] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Client Statement Modal state
  const [statementClientId, setStatementClientId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [useAllDates, setUseAllDates] = useState(false);

  const statementClient = useMemo(
    () =>
      statementClientId
        ? clients.find((c) => c.id === statementClientId) || null
        : null,
    [clients, statementClientId]
  );

  const openNew = () => {
    setEditing(null);
    setCompanyName('');
    setContactName('');
    setEmail('');
    setPhone('');
    setZimraTin('');
    setVatRegNumber('');
    setIsVatRegistered(false);
    setAddress('');
    setPaymentTermsDays('30');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setCompanyName(client.companyName);
    setContactName(client.contactName);
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setZimraTin(client.zimraTin || client.taxPin || '');
    setVatRegNumber(client.vatRegNumber || '');
    setIsVatRegistered(Boolean(client.isVatRegistered ?? client.vatRegNumber));
    setAddress(client.address || '');
    setPaymentTermsDays(String(client.paymentTermsDays ?? 30));
    setNotes(client.notes || '');
    setModalOpen(true);
  };

  const openStatementForClient = (client: Client) => {
    setStatementClientId(client.id);
    const d = new Date();
    setFromDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    setToDate(new Date().toISOString().slice(0, 10));
    setUseAllDates(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !contactName.trim()) return;
    setSaving(true);
    try {
      const cleanTin = zimraTin.trim().toUpperCase();
      const cleanVatReg = vatRegNumber.trim().toUpperCase();
      const payload = {
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        taxPin: cleanTin || cleanVatReg,
        zimraTin: cleanTin,
        vatRegNumber: cleanVatReg,
        isVatRegistered: isVatRegistered || Boolean(cleanVatReg),
        address: address.trim(),
        paymentTermsDays: Number(paymentTermsDays) || 30,
        notes: notes.trim(),
      };
      if (editing) {
        await onUpdateClient(editing.id, payload);
      } else {
        await onCreateClient(payload);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        (c.zimraTin || '').toLowerCase().includes(q) ||
        (c.vatRegNumber || '').toLowerCase().includes(q) ||
        (c.taxPin || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const statementData = useMemo(() => {
    if (!statementClient) return null;

    const clientInvoices = invoices.filter(
      (i) =>
        i.clientId === statementClient.id &&
        i.status !== 'Void' &&
        i.status !== 'Draft'
    );

    const rawEvents: Omit<StatementRow, 'runningBalance'>[] = [];

    clientInvoices.forEach((inv) => {
      rawEvents.push({
        id: `inv-${inv.id}`,
        date: inv.issueDate || '',
        sortOrder: 1,
        docRef: inv.invoiceNumber,
        description: inv.jobNumber
          ? `Tax Invoice (Job ${inv.jobNumber})`
          : 'Tax Invoice',
        debit: round2(inv.grossAmount || 0),
        credit: 0,
      });

      const whtAmt = round2(inv.whtWithheldAmount || 0);
      const actualCashPaid = Math.max(0, round2((inv.amountPaid || 0) - whtAmt));

      const matchedReceipts = cashBookEntries.filter(
        (cb) =>
          cb.entryType === 'Receipt (Inflow)' &&
          cb.linkedDocRef === inv.invoiceNumber
      );

      let matchedCashTotal = 0;
      matchedReceipts.forEach((cb) => {
        const amt = round2(cb.amount || 0);
        if (amt <= 0) return;
        matchedCashTotal = round2(matchedCashTotal + amt);
        rawEvents.push({
          id: `cb-${cb.id}`,
          date: cb.entryDate || inv.issueDate || '',
          sortOrder: 2,
          docRef: cb.reference || cb.entryNumber,
          description: `Payment Received — ${cb.account} (${inv.invoiceNumber})`,
          debit: 0,
          credit: amt,
        });
      });

      const unlinkedCashDiff = round2(actualCashPaid - matchedCashTotal);
      if (unlinkedCashDiff > 0.01) {
        rawEvents.push({
          id: `pay-${inv.id}`,
          date: inv.issueDate || '',
          sortOrder: 2,
          docRef: inv.paymentReference || 'RECEIPT',
          description: `Payment Received${
            inv.paymentMethod ? ` (${inv.paymentMethod})` : ''
          } — ${inv.invoiceNumber}`,
          debit: 0,
          credit: unlinkedCashDiff,
        });
      }

      if (whtAmt > 0.005) {
        rawEvents.push({
          id: `wht-${inv.id}`,
          date: inv.issueDate || '',
          sortOrder: 3,
          docRef: inv.whtCertificateRef || 'WHT-CERT',
          description: `Withholding Tax Certificate Credit (${inv.invoiceNumber})`,
          debit: 0,
          credit: whtAmt,
        });
      }
    });

    rawEvents.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.docRef.localeCompare(b.docRef);
    });

    let openingBalance = 0;
    const periodEvents: Omit<StatementRow, 'runningBalance'>[] = [];

    rawEvents.forEach((ev) => {
      if (!useAllDates && fromDate && ev.date < fromDate) {
        openingBalance = round2(openingBalance + ev.debit - ev.credit);
      } else if (useAllDates || !toDate || ev.date <= toDate) {
        periodEvents.push(ev);
      }
    });

    let running = openingBalance;
    const rows: StatementRow[] = periodEvents.map((ev) => {
      running = round2(running + ev.debit - ev.credit);
      return {
        ...ev,
        runningBalance: running,
      };
    });

    const periodDebits = round2(rows.reduce((acc, r) => acc + r.debit, 0));
    const periodCredits = round2(rows.reduce((acc, r) => acc + r.credit, 0));
    const closingBalance = running;
    const currentAccountBalance = round2(
      clientInvoices.reduce((acc, i) => acc + (i.balanceDue || 0), 0)
    );

    // 5-bucket ageing analysis as of statement cutoff date
    const refDateStr = useAllDates ? new Date().toISOString().slice(0, 10) : toDate;
    const refTime = new Date(`${refDateStr}T00:00:00Z`).getTime();

    const ageing = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90Plus: 0,
      total: 0,
    };

    clientInvoices.forEach((inv) => {
      const bal = round2(inv.balanceDue || 0);
      if (bal <= 0.01) return;
      if (!useAllDates && toDate && inv.issueDate > toDate) return;
      const dueStr = inv.dueDate || inv.issueDate;
      const dueTime = new Date(`${dueStr}T00:00:00Z`).getTime();
      const daysOverdue = Number.isFinite(refTime) && Number.isFinite(dueTime)
        ? Math.floor((refTime - dueTime) / 86400000)
        : 0;

      if (daysOverdue <= 0) {
        ageing.current = round2(ageing.current + bal);
      } else if (daysOverdue <= 30) {
        ageing.days1to30 = round2(ageing.days1to30 + bal);
      } else if (daysOverdue <= 60) {
        ageing.days31to60 = round2(ageing.days31to60 + bal);
      } else if (daysOverdue <= 90) {
        ageing.days61to90 = round2(ageing.days61to90 + bal);
      } else {
        ageing.days90Plus = round2(ageing.days90Plus + bal);
      }
      ageing.total = round2(ageing.total + bal);
    });

    return {
      openingBalance,
      periodDebits,
      periodCredits,
      closingBalance,
      currentAccountBalance,
      rows,
      ageing,
    };
  }, [statementClient, invoices, cashBookEntries, fromDate, toDate, useAllDates]);

  const applyRangePreset = (preset: 'month' | 'quarter' | 'ytd' | 'all') => {
    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);
    if (preset === 'all') {
      setUseAllDates(true);
      return;
    }
    setUseAllDates(false);
    setToDate(todayIso);
    if (preset === 'month') {
      setFromDate(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      );
    } else if (preset === 'quarter') {
      const d = new Date(now.getTime() - 90 * 86400000);
      setFromDate(d.toISOString().slice(0, 10));
    } else {
      setFromDate(`${now.getFullYear()}-01-01`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Main Clients Listing (hidden when printing a client statement) */}
      <div className={statementClient ? 'space-y-5 no-print' : 'space-y-5'}>
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, ZIMRA TIN, or VAT Reg #..."
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {clients.length > 0 && (
              <button
                type="button"
                onClick={() => openStatementForClient(filtered[0] || clients[0])}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                <span>Client Statement</span>
              </button>
            )}
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Client</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No clients registered yet. Add your first corporate or retail customer.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Company &amp; Contact</th>
                    <th className="py-2.5 px-4">Phone / Email</th>
                    <th className="py-2.5 px-4">ZIMRA TIN / VAT Reg #</th>
                    <th className="py-2.5 px-4 text-right">Terms</th>
                    <th className="py-2.5 px-4 text-right">Jobs</th>
                    <th className="py-2.5 px-4 text-right">Total Billed</th>
                    <th className="py-2.5 px-4 text-right">Balance Due</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((client) => {
                    const clientJobs = jobs.filter((j) => j.clientId === client.id);
                    const clientInvs = invoices.filter(
                      (i) =>
                        i.clientId === client.id &&
                        i.status !== 'Void' &&
                        i.status !== 'Draft'
                    );
                    const totalBilled = clientInvs.reduce(
                      (acc, i) => acc + (i.grossAmount || 0),
                      0
                    );
                    const balanceDue = clientInvs.reduce(
                      (acc, i) => acc + (i.balanceDue || 0),
                      0
                    );
                    const displayTin = client.zimraTin || client.taxPin;
                    return (
                      <tr key={client.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {client.companyName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {client.contactName}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          <div>{client.phone || '—'}</div>
                          <div className="text-slate-400">{client.email || '—'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono-nums text-xs text-slate-700">
                          <div>{displayTin ? `TIN: ${displayTin}` : 'TIN: —'}</div>
                          {client.vatRegNumber ? (
                            <div className="text-[11px] text-emerald-700">
                              VAT: {client.vatRegNumber}
                            </div>
                          ) : client.isVatRegistered ? (
                            <div className="text-[11px] text-amber-700">
                              VAT Reg: Pending
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">Non-VAT</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600">
                          Net {client.paymentTermsDays}d
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800">
                          {clientJobs.length}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900">
                          {formatMoney(totalBilled, settings.currency)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono-nums text-xs font-semibold ${
                            balanceDue > 0.01 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatMoney(balanceDue, settings.currency)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openStatementForClient(client)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-600" />
                              <span>Statement</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(client)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                              aria-label={`Edit ${client.companyName}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
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
      </div>

      {/* Add / Edit Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                {editing ? 'Update Client' : 'Register New Client'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Company / Client Name
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Primary Contact Person
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ZIMRA TIN Number
                  </label>
                  <input
                    type="text"
                    value={zimraTin}
                    onChange={(e) => setZimraTin(e.target.value)}
                    placeholder="e.g. 2000881920"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ZIMRA VAT Reg Number
                  </label>
                  <input
                    type="text"
                    value={vatRegNumber}
                    onChange={(e) => {
                      setVatRegNumber(e.target.value);
                      if (e.target.value.trim()) setIsVatRegistered(true);
                    }}
                    placeholder="e.g. 10088192 (if VAT registered)"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div className="flex items-center pt-4">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isVatRegistered}
                      onChange={(e) => setIsVatRegistered(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span>VAT Registered Customer</span>
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Terms (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Billing / Delivery Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Account Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  {saving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Statement (Printable / PDF) Modal */}
      {statementClient && statementData && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 sm:p-6 print:static print:inset-auto print:bg-transparent print:p-0 print:overflow-visible">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl my-4 overflow-hidden print:border-0 print:max-w-none print:my-0 print:shadow-none">
            {/* Screen Controls Bar */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 space-y-3 no-print">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Client Account Statement
                  </h2>
                  <p className="text-xs text-slate-500">
                    Select customer and date range, then print or save as PDF
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print / Save PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementClientId(null)}
                    className="p-1.5 text-slate-500 hover:text-slate-900"
                    aria-label="Close client statement"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Client:</span>
                  <select
                    value={statementClient.id}
                    onChange={(e) => setStatementClientId(e.target.value)}
                    className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white font-medium text-slate-900"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyRangePreset('month')}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={() => applyRangePreset('quarter')}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  >
                    Last 90d
                  </button>
                  <button
                    type="button"
                    onClick={() => applyRangePreset('ytd')}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  >
                    YTD
                  </button>
                  <button
                    type="button"
                    onClick={() => applyRangePreset('all')}
                    className={`px-2.5 py-1 rounded border ${
                      useAllDates
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    All Dates
                  </button>
                </div>

                {!useAllDates && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 font-mono-nums text-xs bg-white"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-slate-200 rounded px-2 py-1 font-mono-nums text-xs bg-white"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Printable A4 Statement Content */}
            <div className="p-8 space-y-6 print:p-0">
              {/* Company & Statement Header */}
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
                    STATEMENT OF ACCOUNT
                  </div>
                  <div className="text-slate-600">
                    Statement Date:{' '}
                    <span className="font-mono-nums font-medium text-slate-900">
                      {new Date().toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Period:{' '}
                    <span className="font-mono-nums font-medium text-slate-900">
                      {useAllDates ? 'All Recorded Dates' : `${fromDate} to ${toDate}`}
                    </span>
                  </div>
                  <div className="text-slate-600">
                    Terms:{' '}
                    <span className="font-mono-nums font-medium text-slate-900">
                      Net {statementClient.paymentTermsDays} Days
                    </span>
                  </div>
                </div>
              </div>

              {/* Client Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="text-slate-500 font-medium">Account Holder</div>
                  <div className="text-sm font-bold text-slate-900">
                    {statementClient.companyName}
                  </div>
                  <div className="text-slate-600">
                    Attn: {statementClient.contactName}
                  </div>
                  {statementClient.address && (
                    <div className="text-slate-600">{statementClient.address}</div>
                  )}
                  <div className="text-slate-600">
                    {statementClient.phone || '—'} · {statementClient.email || '—'}
                  </div>
                </div>
                <div className="sm:text-right space-y-1 font-mono-nums">
                  <div className="text-slate-500 font-sans font-medium">
                    Tax Registration Details
                  </div>
                  <div className="text-slate-700">
                    ZIMRA TIN:{' '}
                    <strong className="text-slate-900">
                      {statementClient.zimraTin ||
                        statementClient.taxPin ||
                        'Not provided'}
                    </strong>
                  </div>
                  <div className="text-slate-700">
                    VAT Reg #:{' '}
                    <strong className="text-slate-900">
                      {statementClient.vatRegNumber ||
                        (statementClient.isVatRegistered ? 'Pending' : 'Non-VAT')}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Statement KPI Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Opening Balance</div>
                  <div className="mt-1 font-mono-nums text-sm font-semibold text-slate-900">
                    {formatMoney(statementData.openingBalance, settings.currency)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">Period Invoiced</div>
                  <div className="mt-1 font-mono-nums text-sm font-semibold text-slate-900">
                    {formatMoney(statementData.periodDebits, settings.currency)}
                  </div>
                </div>
                <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div className="text-[11px] text-slate-500">
                    Payments &amp; WHT Credits
                  </div>
                  <div className="mt-1 font-mono-nums text-sm font-semibold text-emerald-700">
                    {formatMoney(statementData.periodCredits, settings.currency)}
                  </div>
                </div>
                <div className="border border-slate-300 rounded-md p-3 bg-slate-900 text-white">
                  <div className="text-[11px] text-slate-300">Closing Balance Due</div>
                  <div className="mt-1 font-mono-nums text-sm font-bold">
                    {formatMoney(statementData.closingBalance, settings.currency)}
                  </div>
                </div>
              </div>

              {/* Chronological Transaction Ledger */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Document / Ref</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Debit</th>
                      <th className="py-2.5 px-3 text-right">Credit</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!useAllDates && (
                      <tr className="bg-slate-50/70 font-medium text-slate-700">
                        <td className="py-2 px-3 font-mono-nums">{fromDate}</td>
                        <td className="py-2 px-3 font-mono-nums">OPENING</td>
                        <td className="py-2 px-3">Balance Brought Forward</td>
                        <td className="py-2 px-3 text-right font-mono-nums">—</td>
                        <td className="py-2 px-3 text-right font-mono-nums">—</td>
                        <td className="py-2 px-3 text-right font-mono-nums font-semibold">
                          {formatMoney(
                            statementData.openingBalance,
                            settings.currency
                          )}
                        </td>
                      </tr>
                    )}
                    {statementData.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-8 text-center text-slate-500"
                        >
                          No invoices or payment receipts recorded in this date range.
                        </td>
                      </tr>
                    ) : (
                      statementData.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 px-3 font-mono-nums text-slate-600 whitespace-nowrap">
                            {row.date}
                          </td>
                          <td className="py-2 px-3 font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                            {row.docRef}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {row.description}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums text-slate-900 whitespace-nowrap">
                            {row.debit > 0
                              ? formatMoney(row.debit, settings.currency)
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums text-emerald-700 whitespace-nowrap">
                            {row.credit > 0
                              ? formatMoney(row.credit, settings.currency)
                              : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatMoney(row.runningBalance, settings.currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 5-Bucket Ageing Analysis */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-800">
                  Ageing Analysis (Unpaid Invoices as of{' '}
                  <span className="font-mono-nums">
                    {useAllDates ? new Date().toISOString().slice(0, 10) : toDate}
                  </span>
                  )
                </div>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-right border-collapse text-xs font-mono-nums">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-sans">
                        <th className="py-2 px-3">Current</th>
                        <th className="py-2 px-3">1–30 Days</th>
                        <th className="py-2 px-3">31–60 Days</th>
                        <th className="py-2 px-3">61–90 Days</th>
                        <th className="py-2 px-3">90+ Days</th>
                        <th className="py-2 px-3">Total Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-semibold text-slate-900">
                        <td className="py-2.5 px-3">
                          {formatMoney(statementData.ageing.current, settings.currency)}
                        </td>
                        <td className="py-2.5 px-3">
                          {formatMoney(
                            statementData.ageing.days1to30,
                            settings.currency
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {formatMoney(
                            statementData.ageing.days31to60,
                            settings.currency
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {formatMoney(
                            statementData.ageing.days61to90,
                            settings.currency
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-3 ${
                            statementData.ageing.days90Plus > 0
                              ? 'text-red-700'
                              : 'text-slate-900'
                          }`}
                        >
                          {formatMoney(
                            statementData.ageing.days90Plus,
                            settings.currency
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-950 font-bold">
                          {formatMoney(statementData.ageing.total, settings.currency)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-2 text-[11px] text-slate-500">
                <div>
                  Please quote invoice numbers on all ZIPIT / RTGS / EcoCash remittances.
                </div>
                <div className="font-mono-nums">
                  Current Live Balance: {formatMoney(statementData.currentAccountBalance, settings.currency)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
