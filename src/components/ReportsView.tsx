import React, { useMemo, useState } from 'react';
import { Calendar, Download, Printer } from 'lucide-react';
import {
  Client,
  CompanySettings,
  Expense,
  InventoryItem,
  Invoice,
  Job,
  ServiceCategory,
  SupplierInvoice,
  TaxAccessScope,
  TimeEntry,
  UserRole,
} from '../types/erp';
import {
  calculateJobCosting,
  formatMoney,
  round2,
  summarizeTaxBreakdown,
} from '../utils/vat';
import { BrandLogo } from './BrandLogo';
import { StatusText } from './StatusText';

interface ReportsViewProps {
  role: UserRole;
  taxScope?: TaxAccessScope;
  settings: CompanySettings;
  jobs: Job[];
  clients: Client[];
  invoices: Invoice[];
  supplierInvoices: SupplierInvoice[];
  expenses: Expense[];
  inventoryItems: InventoryItem[];
  timeEntries: TimeEntry[];
}

type ReportTab = 'financial' | 'job-costing' | 'vat-audit' | 'operations';

const SERVICE_CATEGORIES: ServiceCategory[] = [
  'Printing',
  'Branding',
  'Corporate Wear',
  'Tailoring',
];

function extractIsoDate(timestampVal: unknown, fallback?: string): string {
  if (fallback && /^\d{4}-\d{2}-\d{2}/.test(fallback)) {
    return fallback.slice(0, 10);
  }
  if (timestampVal && typeof timestampVal === 'object' && 'toDate' in timestampVal) {
    const dt = (timestampVal as { toDate: () => Date }).toDate();
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  }
  if (typeof timestampVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(timestampVal)) {
    return timestampVal.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  role,
  taxScope = 'all',
  settings,
  jobs,
  clients,
  invoices,
  supplierInvoices,
  expenses,
  inventoryItems,
  timeEntries,
}) => {
  const isVatOnly = role === 'accounts' && taxScope === 'vat_only';
  const canViewFinance = role === 'management' || role === 'accounts';
  const [activeTab, setActiveTab] = useState<ReportTab>(
    isVatOnly ? 'vat-audit' : canViewFinance ? 'financial' : 'operations'
  );
  const effectiveTab: ReportTab = isVatOnly ? 'vat-audit' : activeTab;
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryFilter, setCategoryFilter] = useState<'All' | ServiceCategory>('All');
  const [useAllDates, setUseAllDates] = useState(true);

  const inRange = (dateStr: string) => {
    if (useAllDates) return true;
    if (!dateStr) return true;
    return dateStr >= fromDate && dateStr <= toDate;
  };

  const reportData = useMemo(() => {
    const scopedJobs = jobs.filter((j) => {
      if (categoryFilter !== 'All' && j.category !== categoryFilter) return false;
      const d = extractIsoDate(j.createdAt, j.dueDate);
      return inRange(d);
    });

    const scopedInvoices = invoices.filter(
      (i) => i.status !== 'Void' && i.status !== 'Draft' && inRange(i.issueDate)
    );
    const scopedSupplierInvoices = supplierInvoices.filter((s) =>
      inRange(s.invoiceDate)
    );
    const scopedExpenses = expenses.filter((e) => inRange(e.expenseDate));
    const scopedTime = timeEntries.filter((t) => inRange(t.date));

    const salesNet = round2(scopedInvoices.reduce((a, i) => a + i.netAmount, 0));
    const outputVat = round2(scopedInvoices.reduce((a, i) => a + i.vatAmount, 0));
    const receivables = round2(scopedInvoices.reduce((a, i) => a + i.balanceDue, 0));
    const collectedCash = round2(scopedInvoices.reduce((a, i) => a + i.amountPaid, 0));

    let outputStandardNet = 0;
    let outputZeroRated = 0;
    let outputExempt = 0;
    scopedInvoices.forEach((i) => {
      const sum = summarizeTaxBreakdown(i.lines || [], {
        netAmount: i.netAmount,
        vatAmount: i.vatAmount,
        grossAmount: i.grossAmount,
      });
      outputStandardNet += i.standardNetAmount ?? sum.standardNetAmount;
      outputZeroRated += i.zeroRatedAmount ?? sum.zeroRatedAmount;
      outputExempt += i.exemptAmount ?? sum.exemptAmount;
    });

    let inputStandardNet = 0;
    let inputZeroRated = 0;
    let inputExempt = 0;
    scopedSupplierInvoices.forEach((s) => {
      const sum = summarizeTaxBreakdown(s.lines || [], {
        vatTreatment: s.vatTreatment,
        netAmount: s.netAmount,
        vatAmount: s.vatAmount,
        grossAmount: s.grossAmount,
      });
      inputStandardNet += s.standardNetAmount ?? sum.standardNetAmount;
      inputZeroRated += s.zeroRatedAmount ?? sum.zeroRatedAmount;
      inputExempt += s.exemptAmount ?? sum.exemptAmount;
    });
    scopedExpenses.forEach((e) => {
      const t = e.vatTreatment ?? (e.vatAmount > 0 ? 'standard' : 'exempt');
      if (t === 'zero') inputZeroRated += e.netAmount;
      else if (t === 'exempt') inputExempt += e.netAmount;
      else inputStandardNet += e.netAmount;
    });

    const supplierNet = round2(
      scopedSupplierInvoices.reduce((a, s) => a + s.netAmount, 0)
    );
    const supplierInputVat = round2(
      scopedSupplierInvoices
        .filter((s) => s.isVatClaimable)
        .reduce((a, s) => a + s.vatAmount, 0)
    );
    const payables = round2(
      scopedSupplierInvoices.reduce((a, s) => a + s.balanceDue, 0)
    );

    const expenseNet = round2(scopedExpenses.reduce((a, e) => a + e.netAmount, 0));
    const expenseInputVat = round2(
      scopedExpenses
        .filter((e) => e.isVatClaimable)
        .reduce((a, e) => a + e.vatAmount, 0)
    );

    const supplierWhtTotal = round2(
      scopedSupplierInvoices.reduce((a, s) => a + (s.whtAmount || 0), 0) +
        scopedExpenses.reduce((a, e) => a + (e.whtAmount || 0), 0)
    );
    const supplierWhtRemitted = round2(
      scopedSupplierInvoices
        .filter((s) => s.whtRemitted)
        .reduce((a, s) => a + (s.whtAmount || 0), 0)
    );
    const supplierWhtPending = round2(
      Math.max(0, supplierWhtTotal - supplierWhtRemitted)
    );
    const clientWhtTotal = round2(
      scopedInvoices.reduce((a, i) => a + (i.whtWithheldAmount || 0), 0)
    );

    const totalInputVat = round2(supplierInputVat + expenseInputVat);
    const netVatPayable = round2(outputVat - totalInputVat);
    const totalOutflowNet = round2(supplierNet + expenseNet);
    const operatingMargin = round2(salesNet - totalOutflowNet);

    // Job profitability breakdown
    const jobCostRows = scopedJobs
      .filter((j) => j.status !== 'Cancelled')
      .map((j) => ({
        job: j,
        costing: calculateJobCosting(j),
      }));

    // Client revenue ranking
    const clientSummary = clients
      .map((c) => {
        const cInvs = scopedInvoices.filter((i) => i.clientId === c.id);
        const net = round2(cInvs.reduce((a, i) => a + i.netAmount, 0));
        const balance = round2(cInvs.reduce((a, i) => a + i.balanceDue, 0));
        const jobCount = scopedJobs.filter((j) => j.clientId === c.id).length;
        return { client: c, invoiceCount: cInvs.length, net, balance, jobCount };
      })
      .filter((row) => row.jobCount > 0 || row.invoiceCount > 0)
      .sort((a, b) => b.net - a.net);

    // Service category split
    const categorySplit = SERVICE_CATEGORIES.map((cat) => {
      const catJobs = scopedJobs.filter(
        (j) => j.category === cat && j.status !== 'Cancelled'
      );
      const revenue = round2(catJobs.reduce((a, j) => a + j.netTotal, 0));
      const actualCost = round2(catJobs.reduce((a, j) => a + j.actualCostTotal, 0));
      return {
        category: cat,
        count: catJobs.length,
        active: catJobs.filter((j) => j.status !== 'Completed').length,
        revenue,
        actualCost,
      };
    });

    // Time & labor by department
    const deptHours = (
      ['Production', 'Sales & Marketing', 'Accounts', 'Management'] as const
    ).map((dept) => {
      const entries = scopedTime.filter((t) => t.department === dept);
      return {
        department: dept,
        hours: round2(entries.reduce((a, t) => a + (t.totalHours || 0), 0)),
        overtime: round2(entries.reduce((a, t) => a + (t.overtimeHours || 0), 0)),
        laborCost: round2(entries.reduce((a, t) => a + (t.laborCost || 0), 0)),
      };
    });

    const lowStockItems = inventoryItems.filter(
      (i) => i.status === 'Low Stock' || i.status === 'Out of Stock'
    );
    const inventoryValuation = round2(
      inventoryItems.reduce((a, i) => a + i.quantityOnHand * i.unitCost, 0)
    );

    return {
      scopedJobs,
      scopedInvoices,
      scopedSupplierInvoices,
      scopedExpenses,
      salesNet,
      outputStandardNet: round2(outputStandardNet),
      outputZeroRated: round2(outputZeroRated),
      outputExempt: round2(outputExempt),
      outputVat,
      receivables,
      collectedCash,
      inputStandardNet: round2(inputStandardNet),
      inputZeroRated: round2(inputZeroRated),
      inputExempt: round2(inputExempt),
      supplierNet,
      supplierInputVat,
      payables,
      expenseNet,
      expenseInputVat,
      totalInputVat,
      netVatPayable,
      supplierWhtTotal,
      supplierWhtRemitted,
      supplierWhtPending,
      clientWhtTotal,
      totalOutflowNet,
      operatingMargin,
      jobCostRows,
      clientSummary,
      categorySplit,
      deptHours,
      lowStockItems,
      inventoryValuation,
    };
  }, [
    jobs,
    invoices,
    supplierInvoices,
    expenses,
    inventoryItems,
    timeEntries,
    clients,
    categoryFilter,
    fromDate,
    toDate,
    useAllDates,
  ]);

  const handleExportReportCsv = () => {
    let rows: string[][] = [];
    const filename = `megaprint-report-${effectiveTab}-${new Date().toISOString().slice(0, 10)}.csv`;

    if (effectiveTab === 'financial') {
      rows = [
        ['Client', 'Jobs Count', 'Invoices Count', 'Net Revenue', 'Outstanding Balance'],
        ...reportData.clientSummary.map((r) => [
          r.client.companyName,
          String(r.jobCount),
          String(r.invoiceCount),
          r.net.toFixed(2),
          r.balance.toFixed(2),
        ]),
      ];
    } else if (effectiveTab === 'job-costing') {
      rows = [
        [
          'Job #',
          'Client',
          'Category',
          'Status',
          'Quoted Net',
          'Estimated Cost',
          'Actual Cost',
          'Variance',
          'Margin %',
        ],
        ...reportData.jobCostRows.map(({ job, costing }) => {
          const unextracted =
            job.legacyLinesExtracted === false || job.vatTreatment === 'unknown';
          return [
            job.jobNumber,
            job.clientName,
            job.category,
            job.status,
            unextracted
              ? `Legacy ${(job.legacyValueUSD ?? 0).toFixed(2)} (Specs Missing)`
              : job.netTotal.toFixed(2),
            costing.estimatedTotal.toFixed(2),
            job.actualCostTotal.toFixed(2),
            costing.variance.toFixed(2),
            unextracted ? 'Specs Missing' : costing.grossMarginPct.toFixed(1),
          ];
        }),
      ];
    } else if (effectiveTab === 'vat-audit') {
      rows = [
        [
          'Direction',
          'Document #',
          'Counterparty',
          'ZIMRA TIN',
          'VAT Reg #',
          'Tax Class',
          'Date',
          'Standard Net',
          'Zero-Rated (0%)',
          'Exempt',
          'Total Net',
          'VAT',
          'Gross',
          'WHT',
        ],
        ...reportData.scopedInvoices.map((i) => {
          const sum = summarizeTaxBreakdown(i.lines || [], {
            netAmount: i.netAmount,
            vatAmount: i.vatAmount,
            grossAmount: i.grossAmount,
          });
          const std = i.standardNetAmount ?? sum.standardNetAmount;
          const zero = i.zeroRatedAmount ?? sum.zeroRatedAmount;
          const exm = i.exemptAmount ?? sum.exemptAmount;
          const cls =
            zero > 0 && std === 0 && exm === 0
              ? 'Zero-Rated 0%'
              : exm > 0 && std === 0 && zero === 0
                ? 'Exempt'
                : zero > 0 || exm > 0
                  ? 'Mixed'
                  : 'Standard VAT';
          return [
            'Output VAT',
            i.invoiceNumber,
            i.clientName,
            i.clientTin || i.clientVatPin || '',
            i.clientVatReg || '',
            cls,
            i.issueDate,
            std.toFixed(2),
            zero.toFixed(2),
            exm.toFixed(2),
            i.netAmount.toFixed(2),
            i.vatAmount.toFixed(2),
            i.grossAmount.toFixed(2),
            (i.whtWithheldAmount || 0).toFixed(2),
          ];
        }),
        ...reportData.scopedSupplierInvoices.map((s) => {
          const sum = summarizeTaxBreakdown(s.lines || [], {
            vatTreatment: s.vatTreatment,
            netAmount: s.netAmount,
            vatAmount: s.vatAmount,
            grossAmount: s.grossAmount,
          });
          const std = s.standardNetAmount ?? sum.standardNetAmount;
          const zero = s.zeroRatedAmount ?? sum.zeroRatedAmount;
          const exm = s.exemptAmount ?? sum.exemptAmount;
          return [
            s.isVatClaimable
              ? 'Input VAT (Supplier Invoice)'
              : 'Purchase (Non-Claimable / Zero / Exempt)',
            s.supplierInvoiceNo,
            s.supplierName,
            s.supplierTin || s.supplierTaxPin || '',
            s.supplierVatReg || '',
            s.vatTreatment === 'zero'
              ? 'Zero-Rated 0%'
              : s.vatTreatment === 'exempt'
                ? 'Exempt'
                : 'Standard VAT',
            s.invoiceDate,
            std.toFixed(2),
            zero.toFixed(2),
            exm.toFixed(2),
            s.netAmount.toFixed(2),
            (s.isVatClaimable ? s.vatAmount : 0).toFixed(2),
            s.grossAmount.toFixed(2),
            (s.whtAmount || 0).toFixed(2),
          ];
        }),
        ...reportData.scopedExpenses.map((e) => {
          const t = e.vatTreatment ?? (e.vatAmount > 0 ? 'standard' : 'exempt');
          return [
            e.isVatClaimable
              ? 'Input VAT (Expense)'
              : 'Expense (Non-Claimable / Zero / Exempt)',
            e.vendorInvoiceRef || e.expenseNumber,
            e.vendorName,
            e.vendorTin || e.vendorVatPin || '',
            e.vendorVatReg || '',
            t === 'zero'
              ? 'Zero-Rated 0%'
              : t === 'exempt'
                ? 'Exempt'
                : 'Standard VAT',
            e.expenseDate,
            (t === 'standard' ? e.netAmount : 0).toFixed(2),
            (t === 'zero' ? e.netAmount : 0).toFixed(2),
            (t === 'exempt' ? e.netAmount : 0).toFixed(2),
            e.netAmount.toFixed(2),
            (e.isVatClaimable ? e.vatAmount : 0).toFixed(2),
            e.grossAmount.toFixed(2),
            (e.whtAmount || 0).toFixed(2),
          ];
        }),
      ];
    } else {
      rows = [
        ['SKU', 'Item', 'Category', 'Location', 'Status', 'On Hand', 'Unit', 'Reorder At'],
        ...inventoryItems.map((item) => [
          item.sku,
          item.name,
          item.itemType,
          item.location || '',
          item.status,
          String(item.quantityOnHand),
          item.unit,
          String(item.reorderLevel),
        ]),
      ];
    }

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Print Header */}
      <div className="hidden print-only border-b border-slate-300 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <BrandLogo
            logoDataUrl={settings.logoDataUrl}
            companyName={settings.companyName}
            variant="light"
          />
          <div className="text-right text-xs text-slate-600">
            <div className="font-bold text-slate-900 text-sm">
              Management &amp; Operational Report
            </div>
            <div className="font-mono-nums">
              ZIMRA TIN: {settings.zimraTin || settings.taxPin || '—'} · VAT Reg #:{' '}
              {settings.vatRegNumber || '—'}
            </div>
            <div>
              Period: {useAllDates ? 'All Recorded Dates' : `${fromDate} to ${toDate}`}
            </div>
            <div>Generated {new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      {/* ZIMRA VAT-Only Notice */}
      {isVatOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 no-print">
          <div>
            <strong>ZIMRA / VAT-Only Auditor Mode (Read-Only):</strong> Only VAT
            &amp; WHT schedules for fiscalized transactions with VAT and a valid ZIMRA
            TIN / VAT Reg # are shown. Internal non-VAT sales, bills, and operational
            margins are hidden.
          </div>
          <span className="font-mono-nums font-semibold">ZIMRA Compliance View</span>
        </div>
      )}

      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {canViewFinance && !isVatOnly && (
              <button
                type="button"
                onClick={() => setActiveTab('financial')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  effectiveTab === 'financial'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Executive &amp; Financial
              </button>
            )}
            {!isVatOnly && (
              <button
                type="button"
                onClick={() => setActiveTab('job-costing')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  effectiveTab === 'job-costing'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Job Costing &amp; Margin
              </button>
            )}
            {canViewFinance && (
              <button
                type="button"
                onClick={() => setActiveTab('vat-audit')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  effectiveTab === 'vat-audit'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                VAT &amp; WHT Audit Schedule
              </button>
            )}
            {!isVatOnly && (
              <button
                type="button"
                onClick={() => setActiveTab('operations')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  effectiveTab === 'operations'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Production, Stock &amp; Hours
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportReportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / PDF Report</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useAllDates}
              onChange={(e) => setUseAllDates(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>All-time cumulative</span>
          </label>

          {!useAllDates && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 font-mono-nums text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border border-slate-200 rounded px-2 py-1 font-mono-nums text-xs"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Service Line:</span>
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as 'All' | ServiceCategory)
              }
              className="border border-slate-200 rounded px-2.5 py-1 text-xs bg-white"
            >
              <option value="All">All Departments</option>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tab 1: Executive & Financial */}
      {effectiveTab === 'financial' && canViewFinance && !isVatOnly && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Net Invoiced Revenue</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(reportData.salesNet, settings.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono-nums">
                Settled {formatMoney(reportData.collectedCash, settings.currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Supplier Bills &amp; Expenses (Net)</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(reportData.totalOutflowNet, settings.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono-nums">
                Payables due {formatMoney(reportData.payables, settings.currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Operating Surplus / (Deficit)</div>
              <div
                className={`mt-2 font-mono-nums text-2xl font-semibold ${
                  reportData.operatingMargin >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {formatMoney(reportData.operatingMargin, settings.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono-nums">
                Receivables {formatMoney(reportData.receivables, settings.currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Net VAT Liability</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(reportData.netVatPayable, settings.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono-nums">
                Out {formatMoney(reportData.outputVat, settings.currency)} · In{' '}
                {formatMoney(reportData.totalInputVat, settings.currency)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Client Revenue &amp; Receivables Ranking
            </div>
            {reportData.clientSummary.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No client revenue recorded for the selected period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-4">Client</th>
                      <th className="py-2.5 px-4 text-right">Jobs</th>
                      <th className="py-2.5 px-4 text-right">Invoices</th>
                      <th className="py-2.5 px-4 text-right">Net Sales</th>
                      <th className="py-2.5 px-4 text-right">Balance Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.clientSummary.map((row) => (
                      <tr key={row.client.id}>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {row.client.companyName}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums">
                          {row.jobCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums">
                          {row.invoiceCount}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums font-semibold">
                          {formatMoney(row.net, settings.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums text-amber-700">
                          {formatMoney(row.balance, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Job Costing & Margin */}
      {effectiveTab === 'job-costing' && !isVatOnly && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
            Job Cost Variance &amp; Profitability Report ({reportData.jobCostRows.length}{' '}
            jobs)
          </div>
          {reportData.jobCostRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No active or completed jobs found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4">Job #</th>
                    <th className="py-2.5 px-4">Title &amp; Client</th>
                    <th className="py-2.5 px-4">Service</th>
                    <th className="py-2.5 px-4">Status</th>
                    {role !== 'production' && (
                      <th className="py-2.5 px-4 text-right">Quoted Net</th>
                    )}
                    <th className="py-2.5 px-4 text-right">Est. Cost</th>
                    <th className="py-2.5 px-4 text-right">Actual Cost</th>
                    <th className="py-2.5 px-4 text-right">Variance</th>
                    {role !== 'production' && (
                      <th className="py-2.5 px-4 text-right">Margin %</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.jobCostRows.map(({ job, costing }) => {
                    const unextracted =
                      job.legacyLinesExtracted === false || job.vatTreatment === 'unknown';
                    return (
                      <tr key={job.id}>
                        <td className="py-2.5 px-4 font-mono-nums font-semibold text-blue-700 whitespace-nowrap">
                          {job.jobNumber}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{job.title}</div>
                          <div className="text-slate-500">{job.clientName}</div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{job.category}</td>
                        <td className="py-2.5 px-4">
                          <StatusText status={job.status} />
                        </td>
                        {role !== 'production' && (
                          <td className="py-2.5 px-4 text-right font-mono-nums">
                            {unextracted ? (
                              <div>
                                <div className="text-slate-700">
                                  {formatMoney(job.legacyValueUSD ?? 0, 'USD')}
                                </div>
                                <div className="text-[10px] text-amber-700">
                                  Legacy (Specs Missing)
                                </div>
                              </div>
                            ) : (
                              formatMoney(job.netTotal, settings.currency)
                            )}
                          </td>
                        )}
                        <td className="py-2.5 px-4 text-right font-mono-nums text-slate-600">
                          {formatMoney(costing.estimatedTotal, settings.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums font-medium">
                          {formatMoney(job.actualCostTotal, settings.currency)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono-nums font-semibold ${
                            costing.isOverBudget ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatMoney(costing.variance, settings.currency)}
                        </td>
                        {role !== 'production' && (
                          <td
                            className={`py-2.5 px-4 text-right font-mono-nums font-semibold ${
                              unextracted
                                ? 'text-slate-400'
                                : costing.grossMarginPct < 15
                                  ? 'text-red-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {unextracted ? '—' : `${costing.grossMarginPct.toFixed(1)}%`}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: VAT & WHT Audit Schedule */}
      {effectiveTab === 'vat-audit' && canViewFinance && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Output VAT (Sales)</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(reportData.outputVat, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>
                  Std Net {formatMoney(reportData.outputStandardNet, settings.currency)} (
                  {reportData.scopedInvoices.length} inv)
                </div>
                <div>
                  Zero 0%: {formatMoney(reportData.outputZeroRated, settings.currency)} · Exm:{' '}
                  {formatMoney(reportData.outputExempt, settings.currency)}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Input VAT (Supplier Inv + Bills)</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
                {formatMoney(reportData.totalInputVat, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>
                  Std Net {formatMoney(reportData.inputStandardNet, settings.currency)}
                </div>
                <div>
                  Zero 0%: {formatMoney(reportData.inputZeroRated, settings.currency)} · Exm:{' '}
                  {formatMoney(reportData.inputExempt, settings.currency)}
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Net VAT Position</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(reportData.netVatPayable, settings.currency)}
              </div>
              <div className="mt-2 text-[11px] text-slate-500 font-mono-nums">
                TIN: {settings.zimraTin || settings.taxPin || '—'} · VAT #:{' '}
                {settings.vatRegNumber || '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs text-slate-500">Withholding Tax (WHT) Audit</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-amber-700">
                {formatMoney(reportData.supplierWhtPending, settings.currency)}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500 font-mono-nums">
                <div>
                  Supplier WHT: {formatMoney(reportData.supplierWhtTotal, settings.currency)} (
                  {formatMoney(reportData.supplierWhtRemitted, settings.currency)} remitted)
                </div>
                <div>
                  Client WHT Credits: {formatMoney(reportData.clientWhtTotal, settings.currency)}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
              Supplier Tax Invoices VAT &amp; WHT Compliance Audit
            </div>
            {reportData.scopedSupplierInvoices.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No supplier tax invoices recorded in this range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-4">Voucher / Tax Inv #</th>
                      <th className="py-2.5 px-4">Supplier</th>
                      <th className="py-2.5 px-4">ZIMRA TIN / VAT Reg #</th>
                      <th className="py-2.5 px-4">Tax Class</th>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4 text-right">Net</th>
                      <th className="py-2.5 px-4 text-right">Input VAT</th>
                      <th className="py-2.5 px-4 text-right">WHT</th>
                      <th className="py-2.5 px-4">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.scopedSupplierInvoices.map((si) => {
                      const tinVal = (si.supplierTin || si.supplierTaxPin || '').trim();
                      const vatVal = (si.supplierVatReg || '').trim();
                      const missingTax = si.vatAmount > 0 && !tinVal && !vatVal;
                      return (
                        <tr key={si.id}>
                          <td className="py-2.5 px-4 font-mono-nums">
                            <span className="font-semibold text-slate-900">
                              {si.recordNumber}
                            </span>{' '}
                            / {si.supplierInvoiceNo}
                          </td>
                          <td className="py-2.5 px-4 text-slate-800">{si.supplierName}</td>
                          <td className="py-2.5 px-4 font-mono-nums text-slate-600">
                            <div>{tinVal ? `TIN: ${tinVal}` : '—'}</div>
                            {vatVal && (
                              <div className="text-[11px] text-slate-400">
                                VAT: {vatVal}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                            {si.vatTreatment === 'zero'
                              ? 'Zero 0%'
                              : si.vatTreatment === 'exempt'
                                ? 'Exempt'
                                : `VAT ${si.vatRate}%`}
                          </td>
                          <td className="py-2.5 px-4 font-mono-nums text-slate-600">
                            {si.invoiceDate}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-nums">
                            {formatMoney(si.netAmount, settings.currency)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-nums font-semibold text-emerald-700">
                            {si.isVatClaimable
                              ? formatMoney(si.vatAmount, settings.currency)
                              : 'Non-claimable'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-nums text-amber-700">
                            {(si.whtAmount || 0) > 0
                              ? `${formatMoney(si.whtAmount || 0, settings.currency)}${
                                  si.whtRemitted ? ' (Paid)' : ''
                                }`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-4">
                            <StatusText
                              status={
                                missingTax
                                  ? 'Overdue'
                                  : si.isVatClaimable || si.vatAmount === 0
                                    ? 'Approved'
                                    : 'Pending'
                              }
                            />
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
      )}

      {/* Tab 4: Production, Stock & Hours */}
      {effectiveTab === 'operations' && !isVatOnly && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
                Service Line Output &amp; Costing
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4 text-right">Jobs</th>
                    <th className="py-2.5 px-4 text-right">Active</th>
                    {role !== 'production' && (
                      <th className="py-2.5 px-4 text-right">Quoted Net</th>
                    )}
                    <th className="py-2.5 px-4 text-right">Actual Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.categorySplit.map((row) => (
                    <tr key={row.category}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {row.category}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {row.count}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {row.active}
                      </td>
                      {role !== 'production' && (
                        <td className="py-2.5 px-4 text-right font-mono-nums">
                          {formatMoney(row.revenue, settings.currency)}
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right font-mono-nums font-medium">
                        {formatMoney(row.actualCost, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-semibold text-slate-900">
                Workforce Hours &amp; Labor Cost by Department
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4 text-right">Total Hours</th>
                    <th className="py-2.5 px-4 text-right">Overtime</th>
                    {role !== 'production' && (
                      <th className="py-2.5 px-4 text-right">Labor Cost</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.deptHours.map((row) => (
                    <tr key={row.department}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {row.department}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {row.hours.toFixed(1)}h
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-amber-700">
                        {row.overtime.toFixed(1)}h
                      </td>
                      {role !== 'production' && (
                        <td className="py-2.5 px-4 text-right font-mono-nums font-medium">
                          {formatMoney(row.laborCost, settings.currency)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inventory Replenishment Alert Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-slate-900">
                Inventory Replenishment &amp; Sample Summary
              </span>
              {role !== 'production' && (
                <span className="text-xs font-mono-nums text-slate-600">
                  Total On-Hand Value:{' '}
                  {formatMoney(reportData.inventoryValuation, settings.currency)}
                </span>
              )}
            </div>
            {reportData.lowStockItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                All consumables, substrates, and sample kits are above reorder thresholds.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-4">SKU</th>
                      <th className="py-2.5 px-4">Item</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Supplier</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">On Hand</th>
                      <th className="py-2.5 px-4 text-right">Reorder Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportData.lowStockItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-4 font-mono-nums font-semibold text-blue-700">
                          {item.sku}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{item.itemType}</td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {item.supplierName || '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={item.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums font-semibold">
                          {item.quantityOnHand} {item.unit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums text-slate-500">
                          {item.reorderLevel} {item.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
