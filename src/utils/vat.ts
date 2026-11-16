import { InvoiceLine, Job, PricingMode, VatTreatment } from '../types/erp';

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface VatBreakdown {
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  effectiveVatRate: number;
}

export function calculateVatBreakdown(params: {
  amount: number;
  pricingMode: PricingMode;
  vatTreatment: VatTreatment;
  vatRate: number;
}): VatBreakdown {
  const safeAmount = Math.max(0, Number.isFinite(params.amount) ? params.amount : 0);
  const safeRate =
    params.vatTreatment === 'standard'
      ? Math.max(0, Math.min(50, Number.isFinite(params.vatRate) ? params.vatRate : 0))
      : 0;

  if (safeRate === 0) {
    const rounded = round2(safeAmount);
    return {
      netAmount: rounded,
      vatAmount: 0,
      grossAmount: rounded,
      effectiveVatRate: 0,
    };
  }

  const rateFactor = safeRate / 100;

  if (params.pricingMode === 'inclusive') {
    const net = round2(safeAmount / (1 + rateFactor));
    const gross = round2(safeAmount);
    const vat = round2(gross - net);
    return {
      netAmount: net,
      vatAmount: vat,
      grossAmount: gross,
      effectiveVatRate: safeRate,
    };
  }

  const net = round2(safeAmount);
  const vat = round2(net * rateFactor);
  const gross = round2(net + vat);
  return {
    netAmount: net,
    vatAmount: vat,
    grossAmount: gross,
    effectiveVatRate: safeRate,
  };
}

export interface TaxClassSummary {
  standardNetAmount: number;
  zeroRatedAmount: number;
  exemptAmount: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

export function summarizeTaxBreakdown(
  lines: Pick<InvoiceLine, 'vatTreatment' | 'netAmount' | 'vatAmount' | 'grossAmount'>[],
  fallback?: {
    vatTreatment?: VatTreatment;
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
  }
): TaxClassSummary {
  if (!lines || lines.length === 0) {
    const net = round2(fallback?.netAmount || 0);
    const vat = round2(fallback?.vatAmount || 0);
    const gross = round2(fallback?.grossAmount || 0);
    const t = fallback?.vatTreatment || (vat > 0 ? 'standard' : 'exempt');
    return {
      standardNetAmount: t === 'standard' ? net : 0,
      zeroRatedAmount: t === 'zero' ? net : 0,
      exemptAmount: t === 'exempt' ? net : 0,
      netAmount: net,
      vatAmount: vat,
      grossAmount: gross,
    };
  }

  let standardNetAmount = 0;
  let zeroRatedAmount = 0;
  let exemptAmount = 0;
  let netAmount = 0;
  let vatAmount = 0;
  let grossAmount = 0;

  lines.forEach((l) => {
    const n = Number(l.netAmount) || 0;
    const v = Number(l.vatAmount) || 0;
    const g = Number(l.grossAmount) || 0;
    netAmount += n;
    vatAmount += v;
    grossAmount += g;
    if (l.vatTreatment === 'zero') {
      zeroRatedAmount += n;
    } else if (l.vatTreatment === 'exempt') {
      exemptAmount += n;
    } else {
      standardNetAmount += n;
    }
  });

  return {
    standardNetAmount: round2(standardNetAmount),
    zeroRatedAmount: round2(zeroRatedAmount),
    exemptAmount: round2(exemptAmount),
    netAmount: round2(netAmount),
    vatAmount: round2(vatAmount),
    grossAmount: round2(grossAmount),
  };
}

export function calculateWithholdingTax(params: {
  applicable: boolean;
  baseAmount: number;
  ratePct: number;
}): number {
  if (!params.applicable) return 0;
  const safeBase = Math.max(0, Number.isFinite(params.baseAmount) ? params.baseAmount : 0);
  const safeRate = Math.max(0, Math.min(50, Number.isFinite(params.ratePct) ? params.ratePct : 0));
  return round2((safeBase * safeRate) / 100);
}

export interface JobCostSummary {
  estimatedTotal: number;
  actualTotal: number;
  variance: number;
  grossProfit: number;
  grossMarginPct: number;
  isOverBudget: boolean;
}

export function calculateJobCosting(job: Pick<
  Job,
  | 'netTotal'
  | 'estimatedMaterialCost'
  | 'estimatedLaborCost'
  | 'estimatedSubcontractCost'
  | 'estimatedOverheadCost'
  | 'actualCostTotal'
>): JobCostSummary {
  const estimatedTotal = round2(
    (job.estimatedMaterialCost || 0) +
      (job.estimatedLaborCost || 0) +
      (job.estimatedSubcontractCost || 0) +
      (job.estimatedOverheadCost || 0)
  );
  const actualTotal = round2(job.actualCostTotal || 0);
  const variance = round2(actualTotal - estimatedTotal);
  const activeCostBasis = actualTotal > 0 ? actualTotal : estimatedTotal;
  const grossProfit = round2((job.netTotal || 0) - activeCostBasis);
  const grossMarginPct =
    job.netTotal > 0 ? round2((grossProfit / job.netTotal) * 100) : 0;

  return {
    estimatedTotal,
    actualTotal,
    variance,
    grossProfit,
    grossMarginPct,
    isOverBudget: estimatedTotal > 0 && actualTotal > estimatedTotal,
  };
}

export function calculateJobCommission(params: {
  netTotal: number;
  grossProfit: number;
  commissionRatePct?: number;
  commissionBasis?: 'net_sales' | 'gross_profit';
}): number {
  const rate = Math.max(0, Math.min(50, Number(params.commissionRatePct) || 0));
  if (rate <= 0) return 0;
  const base =
    params.commissionBasis === 'gross_profit'
      ? Math.max(0, params.grossProfit || 0)
      : Math.max(0, params.netTotal || 0);
  return round2((base * rate) / 100);
}

export function formatMoney(amount: number, currency = 'USD'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = (currency || 'USD').toUpperCase();
  if (code === 'ZWG' || code === 'ZIG') {
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
    return `ZiG ${formatted}`;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${code} ${safe.toFixed(2)}`;
  }
}

export function calculateHoursAndLabor(params: {
  clockInIso: string;
  clockOutIso: string;
  breakMinutes: number;
  hourlyRate: number;
}): {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  laborCost: number;
} {
  const start = new Date(params.clockInIso).getTime();
  const end = new Date(params.clockOutIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { totalHours: 0, regularHours: 0, overtimeHours: 0, laborCost: 0 };
  }
  const grossMinutes = (end - start) / (1000 * 60);
  const netMinutes = Math.max(0, grossMinutes - Math.max(0, params.breakMinutes || 0));
  const totalHours = round2(netMinutes / 60);
  const regularHours = round2(Math.min(8, totalHours));
  const overtimeHours = round2(Math.max(0, totalHours - 8));
  const rate = Math.max(0, params.hourlyRate || 0);
  const laborCost = round2(regularHours * rate + overtimeHours * rate * 1.5);
  return { totalHours, regularHours, overtimeHours, laborCost };
}

export function computeInvoiceVatReportable(inv: {
  status?: string;
  vatAmount?: number;
  clientTin?: string;
  clientVatPin?: string;
  clientVatReg?: string;
}): boolean {
  if (inv.status === 'Draft' || inv.status === 'Void') return false;
  if (!(Number(inv.vatAmount) > 0)) return false;
  return Boolean(
    (inv.clientTin || '').trim() ||
      (inv.clientVatPin || '').trim() ||
      (inv.clientVatReg || '').trim()
  );
}

export function computeSupplierInvoiceVatReportable(si: {
  isVatClaimable?: boolean;
  vatAmount?: number;
  supplierTin?: string;
  supplierTaxPin?: string;
  supplierVatReg?: string;
}): boolean {
  if (!si.isVatClaimable) return false;
  if (!(Number(si.vatAmount) > 0)) return false;
  return Boolean(
    (si.supplierTin || '').trim() ||
      (si.supplierTaxPin || '').trim() ||
      (si.supplierVatReg || '').trim()
  );
}

export function computeExpenseVatReportable(exp: {
  isVatClaimable?: boolean;
  vatAmount?: number;
  vendorTin?: string;
  vendorVatPin?: string;
  vendorVatReg?: string;
}): boolean {
  if (!exp.isVatClaimable) return false;
  if (!(Number(exp.vatAmount) > 0)) return false;
  return Boolean(
    (exp.vendorTin || '').trim() ||
      (exp.vendorVatPin || '').trim() ||
      (exp.vendorVatReg || '').trim()
  );
}

