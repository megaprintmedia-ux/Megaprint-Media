import React, { useMemo, useState } from 'react';
import type { CommissionSheetInput, Job, UserProfile } from '../types/erp';
import { buildCommissionSheet, parseCommissionSheet } from '../utils/commissions';
import { formatMoney } from '../utils/vat';

export function CommissionSheetImport({ jobs, users, onImport }: {
  jobs: Job[]; users: UserProfile[];
  onImport: (sheet: CommissionSheetInput) => Promise<{ saved: number; linked: number }>;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const preview = useMemo(() => {
    if (!text.trim()) return { plan: null, error: '' };
    try { return { plan: buildCommissionSheet(parseCommissionSheet(JSON.parse(text)), jobs, users), error: '' }; }
    catch (e) { return { plan: null, error: e instanceof Error ? e.message : 'Invalid sheet.' }; }
  }, [text, jobs, users]);
  return <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
    <h3 className="text-base font-semibold">Import marketer job cost sheet</h3>
    <p className="text-sm text-slate-600">Paste reviewed job rows with the marketer, rate, original job references, sales and production costs. Commission is the positive gross profit before commission multiplied by the rate, rounded on each job.</p>
    <label className="block text-sm font-medium">Reviewed commission sheet JSON
      <textarea aria-label="Reviewed commission sheet JSON" value={text} onChange={e => { setText(e.target.value); setNotice(''); }} rows={5} className="mt-1 w-full border rounded-md p-3 font-mono text-sm" />
    </label>
    {preview.error && <p role="alert" className="text-sm text-red-700">{preview.error}</p>}
    {preview.plan && <>
      <p className="text-sm font-semibold">{preview.plan.sheet.marketerName} · {preview.plan.rows.length} jobs · {preview.plan.sheet.commissionRatePct}% of gross profit before commission</p>
      <p className="text-sm">Sales {formatMoney(preview.plan.totalSales)} · Production {formatMoney(preview.plan.totalProduction)} · Gross profit {formatMoney(preview.plan.totalGrossProfit)} · Commission {formatMoney(preview.plan.totalCommission)}</p>
      <p className="text-sm text-amber-800">{preview.plan.linkedCount} existing jobs linked. Other rows remain separate historical commission records. All are Pending review because the sheet does not establish VAT treatment, customer settlement or prior commission payment. No invoices, cash payments or production jobs are created.</p>
      <div className="max-h-80 overflow-auto border rounded-md"><table className="w-full text-left text-sm"><thead className="bg-slate-50 sticky top-0"><tr>{['Source job', 'Customer', 'Current job', 'Sales', 'Production', 'Gross profit before commission', 'Commission'].map(t => <th className="p-2" key={t}>{t}</th>)}</tr></thead><tbody>
        {preview.plan.rows.map(r => <tr className="border-t" key={r.jobReference}><td className="p-2">{r.jobReference}</td><td className="p-2">{r.customerName}</td><td className="p-2">{r.job?.jobNumber || 'Unlinked source job'}</td><td className="p-2">{formatMoney(r.salesAmount)}</td><td className="p-2">{formatMoney(r.productionCost)}</td><td className="p-2">{formatMoney(r.grossProfitBeforeCommission)}</td><td className="p-2">{formatMoney(r.commissionAmount)}</td></tr>)}
      </tbody></table></div>
      <button disabled={saving} className="bg-blue-700 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50" onClick={async () => {
        setSaving(true); setNotice('');
        try { const result = await onImport(preview.plan!.sheet); setNotice(`Saved ${result.saved} commission records for ${preview.plan!.sheet.marketerName}. Linked ${result.linked} existing jobs. No commission was paid.`); }
        catch (e) { setNotice(e instanceof Error ? e.message : 'Import failed.'); }
        finally { setSaving(false); }
      }}>{saving ? 'Saving commission records…' : 'Save Marketer Commissions'}</button>
    </>}
    {notice && <p role="status" className="text-sm font-medium">{notice}</p>}
  </section>;
}
