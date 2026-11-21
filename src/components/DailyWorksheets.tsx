import React, { useState } from 'react';
import type { CashBookEntry, CompanySettings, Expense, Invoice, Job } from '../types/erp';
import { calculateJobCosting, formatMoney, round2 } from '../utils/vat';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const missingDocument = (ref: string) => !ref.trim() || /no[\s_-]*(receipt|document)|not\s*(supplied|provided)|^n\/?a$/i.test(ref);
const approvals = '<div class="approvals">' + ['Preparer', 'Manager', 'Director'].map(role => `<section><b>${role}</b><p>Name: _______________________</p><p>Signature: ____________________</p><p>Date: ________________________</p></section>`).join('') + '</div>';
function printReport(title: string, company: string, date: string, headers: string[], rows: string[][], note: string) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('Allow the report window to open, then select Print / Save PDF again.'); return; }
  win.opener = null;
  win.document.write(`<!doctype html><html><head><title>${esc(title)} ${esc(date)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:10pt Arial,sans-serif;color:#111;margin:20px}h1{font-size:17pt;margin:0 0 6px}h2{font-size:13pt;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{padding:8px 6px;border:1px solid #aaa;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}.approvals{display:flex;gap:28px;break-inside:avoid;margin-top:30px}.approvals section{flex:1}.note{font-size:9pt;margin:14px 0}.tools{margin:0 0 18px}button{padding:8px 14px}@media print{body{margin:0}.tools{display:none}}</style></head><body><div class="tools"><button onclick="window.print()">Print / Save PDF</button></div><h1>${esc(company)}</h1><h2>${esc(title)} — ${esc(date)}</h2><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => `<td>${esc(c).replaceAll('\n', '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="note">${esc(note)}</p>${approvals}</body></html>`);
  win.document.close();
  win.focus();
}

export function DailyExpenseWorksheet({ expenses, cashBookEntries, jobs, settings }: { expenses: Expense[]; cashBookEntries: CashBookEntry[]; jobs: Job[]; settings: CompanySettings }) {
  const [date, setDate] = useState(today);
  const selected = expenses.filter(e => e.expenseDate === date).sort((a, b) => a.expenseNumber.localeCompare(b.expenseNumber));
  const total = round2(selected.reduce((sum, e) => sum + e.grossAmount, 0));
  const rows = selected.map(e => {
    const settlements = cashBookEntries.filter(c => c.entryType === 'Payment (Outflow)' && [e.id, e.expenseNumber].includes(c.linkedDocRef));
    const noDoc = missingDocument(e.vendorInvoiceRef || '');
    return [e.expenseNumber, e.vendorName, e.notes || e.vendorInvoiceRef || e.category, jobs.find(j => j.id === e.jobId)?.jobNumber || 'Office / General overhead', formatMoney(e.grossAmount, settings.currency), `${e.paymentStatus}\n${settlements.map(c => `${c.account}: ${c.entryNumber}`).join('\n') || 'Payment method not linked'}`, noDoc ? 'No source document supplied' : e.vendorInvoiceRef, 'Name: __________________\nSignature: _______________\nDate: ___________________'];
  });
  const headers = ['Expense #', 'Supplier / Payee', 'Description', 'Job / Purpose', 'Gross amount', 'Payment status / Cash book', 'Source document', 'Transaction acknowledgement'];
  return <section className="p-5 border-b border-slate-200 space-y-3">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">Daily Expense Worksheet</h3><label className="text-xs">Expense date <input aria-label="Daily expense report date" type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded px-2 py-1 ml-2" /></label><button className="bg-slate-900 text-white rounded px-3 py-2 text-xs" onClick={() => printReport('Daily Expense Worksheet', settings.companyName, date, headers, [...rows, ['TOTAL', '', '', '', formatMoney(total, settings.currency), '', '', '']], 'Expense date determines inclusion. Linked cash settlements are shown as references and are not added again. Missing-document signatures acknowledge the transaction and do not establish a VAT claim. Confirm supporting documents before approval.')}>Print / Save PDF — Expenses</button></div>
    <p className="text-xs text-slate-600">{selected.length} expenses · {formatMoney(total, settings.currency)} · Includes missing-document acknowledgement and Preparer, Manager and Director signatures.</p>
  </section>;
}

function jobDate(job: Job): string {
  const match = job.jobNumber.match(/^MPM-JC-(\d{4})-(\d{2})(\d{2})-/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  if (job.legacySourceReference) return '';
  const timestamp = job.createdAt as { toDate?: () => Date } | undefined;
  return timestamp?.toDate ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(timestamp.toDate()) : '';
}
export function DailyJobWorksheet({ jobs, invoices, settings }: { jobs: Job[]; invoices: Invoice[]; settings: CompanySettings }) {
  const [date, setDate] = useState(today);
  const [allDates, setAllDates] = useState(false);
  const selected = jobs.filter(j => allDates || jobDate(j) === date);
  const rows = selected.map(j => {
    const linked = invoices.filter(i => i.jobId === j.id && i.status !== 'Void');
    const paid = linked.length ? round2(linked.reduce((sum, i) => sum + (i.amountPaid || 0), 0)) : null;
    const value = j.legacyLinesExtracted === false ? j.legacyValueUSD || 0 : j.grossTotal;
    const c = calculateJobCosting(j);
    return [jobDate(j) || 'Date not established', j.jobNumber, j.status, j.clientName, j.title, formatMoney(value, settings.currency), paid === null ? 'Not recorded' : formatMoney(paid, settings.currency), paid === null ? 'Not established' : formatMoney(round2(value - paid), settings.currency), formatMoney(c.estimatedTotal, settings.currency), formatMoney(c.actualTotal, settings.currency), j.vatTreatment === 'unknown' ? 'Tax / cost review required' : formatMoney(c.grossProfit, settings.currency)];
  });
  return <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold text-sm">Incoming Jobs Register & Daily Cost Report</h3><label className="text-xs">Job date <input aria-label="Daily jobs report date" type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded px-2 py-1 ml-2" /></label><label className="text-xs flex gap-2"><input type="checkbox" checked={allDates} onChange={e => setAllDates(e.target.checked)} />All jobs</label><button className="bg-slate-900 text-white rounded px-3 py-2 text-xs" onClick={() => printReport('Incoming Jobs & Costs to Date', settings.companyName, allDates ? 'All dates' : date, ['Job date', 'Job #', 'Status', 'Client', 'Description', 'Job value (gross)', 'Amount paid', 'Balance', 'Estimated cost', 'Actual cost', 'Gross profit before commission'], rows, 'Costs are cumulative live amounts at the time this report is generated. Amount paid comes from linked non-void customer invoices; missing payment records are left unestablished. Historical dates are derived from job references and may need confirmation; imported jobs without an established date appear under All jobs. Unknown tax treatment is flagged for review.')}>Print / Save PDF — Jobs</button></div>
    <p className="text-xs text-slate-500">{selected.length} jobs. Use Create Job for incoming work. Includes client payments, balances, estimated and actual job costs.</p>
  </section>;
}
