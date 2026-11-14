import { Job, PricingMode, VatTreatment } from '../types/erp';

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
