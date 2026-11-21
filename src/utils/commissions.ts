import type { CommissionRecord, CommissionSheetInput, Job, UserProfile } from '../types/erp';
import { calculateJobCommission, calculateJobCosting, round2 } from './vat';

export const normalizeMarketerName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function parseCommissionSheet(input: unknown): CommissionSheetInput {
  if (!input || typeof input !== 'object') throw new Error('Provide a reviewed job sheet.');
  const v = input as CommissionSheetInput;
  for (const [key, limit] of [['sourceKey', 128], ['sourceName', 200], ['marketerName', 120]] as const) {
    if (typeof v[key] !== 'string' || !v[key].trim() || v[key].length > limit) throw new Error(`Invalid ${key}.`);
  }
  if (!Number.isFinite(v.commissionRatePct) || v.commissionRatePct < 0 || v.commissionRatePct > 50) throw new Error('Commission rate must be between 0 and 50%.');
  if (!Array.isArray(v.rows) || !v.rows.length || v.rows.length > 200) throw new Error('Provide 1–200 job rows.');
  const refs = new Set<string>();
  for (const r of v.rows) {
    if (!r || typeof r.jobReference !== 'string' || !r.jobReference.trim() || r.jobReference.length > 40) throw new Error('Every row needs its original job reference.');
    const key = r.jobReference.trim().toUpperCase();
    if (refs.has(key)) throw new Error(`Duplicate source job reference: ${key}.`);
    refs.add(key);
    if (!Number.isInteger(r.sourceRow) || r.sourceRow < 1 || r.sourceRow > 1048576) throw new Error(`Invalid source row for ${key}.`);
    if (typeof r.customerName !== 'string' || !r.customerName.trim() || r.customerName.length > 160) throw new Error(`Invalid customer for ${key}.`);
    if (typeof r.dateText !== 'string' || r.dateText.length > 40) throw new Error(`Invalid source date for ${key}.`);
    for (const n of [r.salesAmount, r.productionCost]) if (!Number.isFinite(n) || n < 0 || n > 1e12) throw new Error(`Invalid sales or production cost for ${key}.`);
    if (r.linkedJobReference !== undefined && (typeof r.linkedJobReference !== 'string' || r.linkedJobReference.length > 120)) throw new Error(`Invalid linked job reference for ${key}.`);
  }
  return {
    ...v, sourceKey: v.sourceKey.trim(), sourceName: v.sourceName.trim(), marketerName: v.marketerName.trim(),
    rows: v.rows.map(r => ({ ...r, jobReference: r.jobReference.trim().toUpperCase(), salesAmount: round2(r.salesAmount), productionCost: round2(r.productionCost) })),
  };
}

export function buildCommissionSheet(input: CommissionSheetInput, jobs: Job[], users: UserProfile[]) {
  const sheet = parseCommissionSheet(input);
  const reps = users.filter(u => normalizeMarketerName(u.displayName) === normalizeMarketerName(sheet.marketerName) && u.role === 'sales');
  if (reps.length > 1) throw new Error('More than one sales account has this name. Resolve the account first.');
  const marketerUid = reps[0]?.uid || `marketer_${normalizeMarketerName(sheet.marketerName).replace(/[^a-z0-9]+/g, '_')}`.slice(0, 128);
  const linked = new Set<string>();
  const rows = sheet.rows.map(r => {
    const target = (r.linkedJobReference || r.jobReference).trim().toUpperCase();
    const matches = jobs.filter(j => [j.jobNumber, j.legacySourceReference].some(ref => (ref || '').toUpperCase() === target));
    if (matches.length > 1 || (r.linkedJobReference && matches.length !== 1)) throw new Error(`Linked job is missing or ambiguous: ${target}.`);
    const job = matches[0];
    if (job && (job.status === 'Cancelled' || job.commissionStatus === 'Paid')) throw new Error(`Reconcile the cancelled or commission-paid job ${target} before importing.`);
    if (job && linked.has(job.id)) throw new Error(`Two source rows link to ${target}. Reconcile them before importing.`);
    if (job) linked.add(job.id);
    const grossProfitBeforeCommission = round2(r.salesAmount - r.productionCost);
    const commissionAmount = calculateJobCommission({ netTotal: r.salesAmount, grossProfit: grossProfitBeforeCommission, commissionRatePct: sheet.commissionRatePct, commissionBasis: 'gross_profit' });
    return { ...r, job, grossProfitBeforeCommission, commissionAmount };
  });
  return {
    sheet, marketerUid, rows,
    totalSales: round2(rows.reduce((s, r) => s + r.salesAmount, 0)),
    totalProduction: round2(rows.reduce((s, r) => s + r.productionCost, 0)),
    totalGrossProfit: round2(rows.reduce((s, r) => s + r.grossProfitBeforeCommission, 0)),
    totalCommission: round2(rows.reduce((s, r) => s + r.commissionAmount, 0)),
    linkedCount: rows.filter(r => r.job).length,
  };
}

export function commissionCosting(job: Job, records: CommissionRecord[] = []) {
  const source = records.filter(r => r.linkedJobId === job.id);
  if (source.length) return {
    salesAmount: round2(source.reduce((s, r) => s + r.salesAmount, 0)),
    productionCost: round2(source.reduce((s, r) => s + r.productionCost, 0)),
    grossProfit: round2(source.reduce((s, r) => s + r.grossProfitBeforeCommission, 0)),
    reviewRequired: source.some(r => r.reviewRequired),
  };
  const costing = calculateJobCosting(job);
  return { salesAmount: job.netTotal, productionCost: job.actualCostTotal > 0 ? costing.actualTotal : costing.estimatedTotal, grossProfit: costing.grossProfit, reviewRequired: job.vatTreatment === 'unknown' };
}

export function formulaCommission(job: Job, records: CommissionRecord[] = []) {
  const costing = commissionCosting(job, records);
  return calculateJobCommission({ netTotal: costing.salesAmount, grossProfit: costing.grossProfit, commissionRatePct: job.commissionRatePct, commissionBasis: 'gross_profit' });
}
