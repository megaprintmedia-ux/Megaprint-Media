import React, { useEffect, useState } from 'react';
import { CheckSquare, Plus, Printer, Square, X } from 'lucide-react';
import {
  CommissionBasis,
  CommissionStatus,
  CompanySettings,
  CostType,
  Job,
  JobCostEntry,
  JobStatus,
  ProductionChecklist,
  UserProfile,
  UserRole,
} from '../types/erp';
import {
  calculateJobCommission,
  calculateJobCosting,
  formatMoney,
} from '../utils/vat';
import { BrandLogo } from './BrandLogo';
import { StatusText } from './StatusText';

interface JobCardModalProps {
  job: Job;
  settings: CompanySettings;
  role: UserRole;
  users?: UserProfile[];
  onClose: () => void;
  onUpdateJob: (
    jobId: string,
    updates: Partial<Omit<Job, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
  onUpdateJobCommission?: (
    jobId: string,
    updates: {
      assignedSalesUid?: string;
      assignedSalesName?: string;
      commissionRatePct?: number;
      commissionBasis?: CommissionBasis;
      commissionAmount?: number;
      commissionStatus?: CommissionStatus;
      commissionPaidDate?: string;
    }
  ) => Promise<void>;
  onAddCostEntry: (params: {
    jobId: string;
    currentActualCostTotal: number;
    costType: CostType;
    description: string;
    quantity: number;
    unitCost: number;
  }) => Promise<void>;
  subscribeJobCosts: (
    jobId: string,
    cb: (entries: JobCostEntry[]) => void
  ) => () => void;
  onCreateInvoiceFromJob?: (job: Job) => void;
}

const JOB_STATUSES: JobStatus[] = [
  'Quoted',
  'Approved',
  'In Production',
  'Quality Control',
  'Ready for Dispatch',
  'Delivered',
  'Completed',
  'Cancelled',
];

const CHECKLIST_ITEMS: Array<{ key: keyof ProductionChecklist; label: string }> = [
  { key: 'prePressOrPattern', label: '1. Pre-Press / Pattern & Artwork Sign-Off' },
  { key: 'materialsIssued', label: '2. Substrates / Fabrics & Inks Issued' },
  { key: 'printingOrTailoring', label: '3. Printing / Branding / Tailoring Execution' },
  { key: 'qualityControl', label: '4. Quality Control & Measurement Audit' },
  { key: 'dispatchReady', label: '5. Packaging & Dispatch Ready' },
];

export const JobCardModal: React.FC<JobCardModalProps> = ({
  job,
  settings,
  role,
  users = [],
  onClose,
  onUpdateJob,
  onUpdateJobCommission,
  onAddCostEntry,
  subscribeJobCosts,
  onCreateInvoiceFromJob,
}) => {
  const [costs, setCosts] = useState<JobCostEntry[]>([]);
  const [costType, setCostType] = useState<CostType>('Material');
  const [costDesc, setCostDesc] = useState('');
  const [costQty, setCostQty] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [submittingCost, setSubmittingCost] = useState(false);

  const [artworkNotes, setArtworkNotes] = useState(job.artworkNotes || '');
  const [tailoringMeasurements, setTailoringMeasurements] = useState(
    job.tailoringMeasurements || ''
  );
  const [assignedProd, setAssignedProd] = useState(
    job.assignedProductionName || ''
  );
  const [savingNotes, setSavingNotes] = useState(false);

  const defaultBasis: CommissionBasis =
    job.commissionBasis || settings.defaultCommissionBasis || 'gross_profit';
  const defaultRate =
    job.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5;

  const [commRateInput, setCommRateInput] = useState(String(defaultRate));
  const [commBasisInput, setCommBasisInput] =
    useState<CommissionBasis>(defaultBasis);
  const [commAmountInput, setCommAmountInput] = useState(
    String(job.commissionAmount ?? 0)
  );
  const [savingComm, setSavingComm] = useState(false);

  useEffect(() => {
    setArtworkNotes(job.artworkNotes || '');
    setTailoringMeasurements(job.tailoringMeasurements || '');
    setAssignedProd(job.assignedProductionName || '');
    setCommRateInput(
      String(job.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5)
    );
    setCommBasisInput(
      job.commissionBasis || settings.defaultCommissionBasis || 'gross_profit'
    );
    setCommAmountInput(String(job.commissionAmount ?? 0));
  }, [
    job.id,
    job.artworkNotes,
    job.tailoringMeasurements,
    job.assignedProductionName,
    job.commissionRatePct,
    job.commissionBasis,
    job.commissionAmount,
    settings.defaultCommissionRatePct,
    settings.defaultCommissionBasis,
  ]);

  useEffect(() => {
    const unsub = subscribeJobCosts(job.id, setCosts);
    return () => unsub();
  }, [job.id, subscribeJobCosts]);

  const costing = calculateJobCosting(job);
  const canEditProduction =
    role === 'management' || role === 'production';
  const canLogCosts =
    role === 'management' || role === 'production' || role === 'accounts';
  const isTerminal =
    (job.status === 'Completed' || job.status === 'Cancelled') &&
    role !== 'management';

  const handleToggleChecklist = async (key: keyof ProductionChecklist) => {
    if (!canEditProduction || isTerminal) return;
    const nextChecklist: ProductionChecklist = {
      ...job.checklist,
      [key]: !job.checklist?.[key],
    };
    await onUpdateJob(job.id, { checklist: nextChecklist });
  };

  const handleStatusChange = async (nextStatus: JobStatus) => {
    if (isTerminal) return;
    await onUpdateJob(job.id, { status: nextStatus });
  };

  const handleSaveNotes = async () => {
    if (!canEditProduction || isTerminal) return;
    setSavingNotes(true);
    try {
      await onUpdateJob(job.id, {
        artworkNotes,
        tailoringMeasurements,
        assignedProductionName: assignedProd,
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLogCosts || !costDesc.trim()) return;
    const qty = Math.max(0.01, Number(costQty) || 1);
    const uCost = Math.max(0, Number(unitCost) || 0);
    setSubmittingCost(true);
    try {
      await onAddCostEntry({
        jobId: job.id,
        currentActualCostTotal: job.actualCostTotal || 0,
        costType,
        description: costDesc.trim(),
        quantity: qty,
        unitCost: uCost,
      });
      setCostDesc('');
      setCostQty('1');
      setUnitCost('');
    } finally {
      setSubmittingCost(false);
    }
  };

  const handleSaveCommission = async () => {
    if (!onUpdateJobCommission) return;
    const rate = Math.max(0, Math.min(50, Number(commRateInput) || 0));
    const parsedAmt = Math.max(0, Number(commAmountInput) || 0);
    setSavingComm(true);
    try {
      await onUpdateJobCommission(job.id, {
        commissionRatePct: rate,
        commissionBasis: commBasisInput,
        commissionAmount: parsedAmt,
      });
    } finally {
      setSavingComm(false);
    }
  };

  const sizeEntries = Object.entries(job.sizeBreakdown || {}).filter(
    ([, count]) => Number(count) > 0
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-5xl my-4 overflow-hidden">
        {/* Top Action Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50 no-print">
          <div className="flex items-center gap-3">
            <span className="font-mono-nums text-sm font-bold text-blue-700">
              {job.jobNumber}
            </span>
            <span className="text-slate-300">·</span>
            <StatusText status={job.status} />
            <span className="text-slate-300">·</span>
            <span className="text-xs font-medium text-slate-600">
              {job.category} ({job.priority})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onCreateInvoiceFromJob &&
              (role === 'management' || role === 'accounts' || role === 'sales') && (
                <button
                  type="button"
                  onClick={() => onCreateInvoiceFromJob(job)}
                  className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                >
                  Create Tax Invoice
                </button>
              )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Job Card</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/60"
              aria-label="Close job card"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Job Card Body */}
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-2">
              <BrandLogo
                logoDataUrl={settings.logoDataUrl}
                companyName={settings.companyName}
                variant="light"
              />
              <h2 className="font-display text-xl font-bold text-slate-900 pt-1">
                {job.title}
              </h2>
              <div className="text-sm text-slate-600">
                Client: <span className="font-semibold text-slate-900">{job.clientName}</span>{' '}
                · Sales Rep: <span className="font-medium">{job.assignedSalesName || '—'}</span>
              </div>
            </div>
            <div className="sm:text-right space-y-1.5 text-xs">
              <div className="font-mono-nums text-sm font-bold text-slate-900">
                JOB CARD {job.jobNumber}
              </div>
              <div className="text-slate-600">
                Due Date:{' '}
                <span className="font-mono-nums font-semibold text-slate-900">
                  {job.dueDate || 'Not set'}
                </span>
              </div>
              <div className="text-slate-600">
                Total Units:{' '}
                <span className="font-mono-nums font-semibold text-slate-900">
                  {job.quantity}
                </span>
              </div>
              {!isTerminal && (
                <div className="pt-1 no-print">
                  <select
                    value={job.status}
                    onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
                    className="border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-900 bg-white"
                    aria-label="Update job status"
                  >
                    {JOB_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        Stage: {st}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Production Specifications & Checklist */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Technical &amp; Production Specifications
              </h3>
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100 text-sm">
                <div className="px-4 py-2.5 flex justify-between gap-4">
                  <span className="text-slate-500">Method / Process</span>
                  <span className="font-medium text-slate-900 text-right">
                    {job.printMethod || '—'}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between gap-4">
                  <span className="text-slate-500">Substrate / Fabric</span>
                  <span className="font-medium text-slate-900 text-right">
                    {job.substrateOrFabric || '—'}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between gap-4">
                  <span className="text-slate-500">Color / Pantone</span>
                  <span className="font-medium text-slate-900 text-right">
                    {job.colorSpecs || '—'}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between gap-4">
                  <span className="text-slate-500">Production Lead</span>
                  <span className="font-medium text-slate-900 text-right">
                    {job.assignedProductionName || 'Unassigned'}
                  </span>
                </div>
              </div>

              {sizeEntries.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-2">
                    Size &amp; Quantity Matrix
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 border border-slate-200 rounded-md divide-x divide-y sm:divide-y-0 divide-slate-200 text-center">
                    {sizeEntries.map(([size, count]) => (
                      <div key={size} className="py-2 px-1">
                        <div className="text-[11px] font-medium text-slate-500">{size}</div>
                        <div className="font-mono-nums text-sm font-semibold text-slate-900">
                          {count}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Production Lead
                  </label>
                  <input
                    type="text"
                    value={assignedProd}
                    disabled={!canEditProduction || isTerminal}
                    onChange={(e) => setAssignedProd(e.target.value)}
                    placeholder="e.g. Farai Mutasa / Chipo Nyathi"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Artwork, Branding &amp; Finishing Notes
                  </label>
                  <textarea
                    rows={2}
                    value={artworkNotes}
                    disabled={!canEditProduction || isTerminal}
                    onChange={(e) => setArtworkNotes(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Tailoring Measurements &amp; Pattern Specs
                  </label>
                  <textarea
                    rows={2}
                    value={tailoringMeasurements}
                    disabled={!canEditProduction || isTerminal}
                    onChange={(e) => setTailoringMeasurements(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
                {canEditProduction && !isTerminal && (
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-3.5 py-2 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 no-print"
                  >
                    {savingNotes ? 'Saving...' : 'Save Production Specs'}
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Checklist & Costing */}
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                  Production Stage Sign-Off
                </h3>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {CHECKLIST_ITEMS.map((item) => {
                    const checked = Boolean(job.checklist?.[item.key]);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={!canEditProduction || isTerminal}
                        onClick={() => handleToggleChecklist(item.key)}
                        className="w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm hover:bg-slate-50 disabled:cursor-default"
                      >
                        {checked ? (
                          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                        <span
                          className={
                            checked ? 'text-slate-900 font-medium' : 'text-slate-600'
                          }
                        >
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Financial & Job Costing Summary */}
              {role !== 'production' ? (
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                    Job Costing, VAT &amp; Profitability
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    <div className="border border-slate-200 rounded-md p-3">
                      <div className="text-[11px] text-slate-500">Quoted Net</div>
                      <div className="font-mono-nums text-sm font-semibold text-slate-900 mt-0.5">
                        {formatMoney(job.netTotal, settings.currency)}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-md p-3">
                      <div className="text-[11px] text-slate-500">Est. Cost</div>
                      <div className="font-mono-nums text-sm font-semibold text-slate-900 mt-0.5">
                        {formatMoney(costing.estimatedTotal, settings.currency)}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-md p-3">
                      <div className="text-[11px] text-slate-500">Actual Cost</div>
                      <div
                        className={`font-mono-nums text-sm font-semibold mt-0.5 ${
                          costing.isOverBudget ? 'text-red-700' : 'text-slate-900'
                        }`}
                      >
                        {formatMoney(costing.actualTotal, settings.currency)}
                      </div>
                    </div>
                    <div className="border border-slate-200 rounded-md p-3">
                      <div className="text-[11px] text-slate-500">Gross Margin</div>
                      <div
                        className={`font-mono-nums text-sm font-semibold mt-0.5 ${
                          costing.grossMarginPct < 15
                            ? 'text-red-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {costing.grossMarginPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-md px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50">
                    <span>
                      VAT ({job.vatTreatment === 'standard' ? `${job.vatRate}%` : job.vatTreatment}):{' '}
                      <strong className="font-mono-nums text-slate-900">
                        {formatMoney(job.vatAmount, settings.currency)}
                      </strong>
                    </span>
                    <span>
                      Gross Invoice Value:{' '}
                      <strong className="font-mono-nums text-slate-900">
                        {formatMoney(job.grossTotal, settings.currency)}
                      </strong>
                    </span>
                  </div>

                  {/* Sales Rep & Commission Trace */}
                  {(() => {
                    const assignedRepUser = job.assignedSalesUid
                      ? users.find((u) => u.uid === job.assignedSalesUid)
                      : undefined;
                    const isSalesRepEligible = Boolean(
                      job.assignedSalesUid &&
                        (!assignedRepUser || assignedRepUser.role === 'sales')
                    );

                    return (
                      <div className="mt-3 border border-slate-200 rounded-md p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-900">
                            Sales Commission Trace ·{' '}
                            {isSalesRepEligible
                              ? job.assignedSalesName || 'Sales Rep'
                              : 'No Sales Rep Assigned (Sales Team Only)'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono-nums font-bold text-blue-700">
                              {formatMoney(
                                isSalesRepEligible ? job.commissionAmount || 0 : 0,
                                settings.currency
                              )}
                            </span>
                            {isSalesRepEligible && (
                              <StatusText status={job.commissionStatus || 'Pending'} />
                            )}
                          </div>
                        </div>
                        {!isSalesRepEligible && (
                          <p className="text-[11px] text-slate-500">
                            Commissions apply exclusively to Sales &amp; Marketing team
                            members. Assign a Sales rep under Team &amp; Settings →
                            Commissions &amp; Rules to enable commission on this job.
                          </p>
                        )}
                        {isSalesRepEligible &&
                          (role === 'management' || role === 'accounts') &&
                          onUpdateJobCommission &&
                          !isTerminal && (
                            <div className="flex flex-wrap items-center gap-2 pt-1 no-print">
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-slate-500">Rate %</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  step="0.5"
                                  value={commRateInput}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCommRateInput(val);
                                    const nextAmt = calculateJobCommission({
                                      netTotal: job.netTotal,
                                      grossProfit: costing.grossProfit,
                                      commissionRatePct: Number(val) || 0,
                                      commissionBasis: commBasisInput,
                                    });
                                    setCommAmountInput(String(nextAmt));
                                  }}
                                  className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums"
                                />
                              </div>
                              <select
                                value={commBasisInput}
                                onChange={(e) => {
                                  const nextBasis = e.target.value as CommissionBasis;
                                  setCommBasisInput(nextBasis);
                                  const nextAmt = calculateJobCommission({
                                    netTotal: job.netTotal,
                                    grossProfit: costing.grossProfit,
                                    commissionRatePct: Number(commRateInput) || 0,
                                    commissionBasis: nextBasis,
                                  });
                                  setCommAmountInput(String(nextAmt));
                                }}
                                className="border border-slate-200 rounded px-2 py-1 text-xs bg-white"
                              >
                                <option value="gross_profit">% of Job Net Profit</option>
                                <option value="net_sales">% of Net Sales</option>
                              </select>
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-slate-500">Amount</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={commAmountInput}
                                  onChange={(e) => setCommAmountInput(e.target.value)}
                                  className="w-24 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={handleSaveCommission}
                                disabled={savingComm}
                                className="px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50"
                              >
                                {savingComm ? 'Updating...' : 'Update Commission'}
                              </button>
                            </div>
                          )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md p-4 bg-slate-50 text-xs text-slate-600">
                  Log actual materials, labor hours, and finishing costs below so Accounts
                  can track real-time job card costing.
                </div>
              )}

              {/* Log Actual Cost Entry */}
              {canLogCosts && !isTerminal && (
                <form
                  onSubmit={handleAddCost}
                  className="border border-slate-200 rounded-md p-4 space-y-3 no-print"
                >
                  <div className="text-xs font-semibold text-slate-900">
                    Log Actual Job Cost
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <select
                      value={costType}
                      onChange={(e) => setCostType(e.target.value as CostType)}
                      className="border border-slate-200 rounded-md px-2.5 py-2 text-xs bg-white"
                    >
                      <option value="Material">Material</option>
                      <option value="Labor">Direct Labor</option>
                      <option value="Subcontract">Subcontract</option>
                      <option value="Overhead">Overhead</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={costDesc}
                      onChange={(e) => setCostDesc(e.target.value)}
                      placeholder="Item or labor description"
                      className="sm:col-span-3 border border-slate-200 rounded-md px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={costQty}
                      onChange={(e) => setCostQty(e.target.value)}
                      placeholder="Qty / Hrs"
                      className="border border-slate-200 rounded-md px-3 py-2 text-xs font-mono-nums"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      placeholder="Unit cost"
                      className="border border-slate-200 rounded-md px-3 py-2 text-xs font-mono-nums"
                    />
                    <button
                      type="submit"
                      disabled={submittingCost}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{submittingCost ? 'Logging...' : 'Add Cost'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Logged Cost Ledger */}
              <div>
                <div className="text-xs font-semibold text-slate-900 mb-2">
                  Actual Cost Ledger ({costs.length} entries)
                </div>
                {costs.length === 0 ? (
                  <div className="border border-slate-200 rounded-md p-4 text-xs text-slate-500">
                    No actual cost entries recorded yet for this job card.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Description</th>
                          <th className="py-2 px-3 text-right">Qty</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {costs.map((c) => (
                          <tr key={c.id}>
                            <td className="py-2 px-3 font-medium text-slate-700">
                              {c.costType}
                            </td>
                            <td className="py-2 px-3 text-slate-800">
                              <div>{c.description}</div>
                              <div className="text-[11px] text-slate-400">
                                Logged by {c.loggedByName}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono-nums text-slate-600">
                              {c.quantity}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-nums font-semibold text-slate-900">
                              {formatMoney(c.totalCost, settings.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
