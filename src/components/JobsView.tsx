import React, { useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Client,
  CommissionBasis,
  CompanySettings,
  Job,
  JobPriority,
  JobStatus,
  PricingMode,
  ServiceCategory,
  SizeBreakdown,
  UserProfile,
  UserRole,
  VatTreatment,
} from '../types/erp';
import {
  calculateJobCommission,
  calculateJobCosting,
  calculateVatBreakdown,
  formatMoney,
} from '../utils/vat';
import { StatusText } from './StatusText';

interface JobsViewProps {
  mode: 'jobs' | 'job-cards';
  role: UserRole;
  profile: UserProfile;
  users: UserProfile[];
  settings: CompanySettings;
  jobs: Job[];
  clients: Client[];
  openCreateModalSignal: number;
  onCreateJob: (
    input: Omit<Job, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onDeleteJob: (jobId: string) => Promise<void>;
  onOpenJobCard: (job: Job) => void;
}

const CATEGORIES: Array<'All' | ServiceCategory> = [
  'All',
  'Printing',
  'Branding',
  'Corporate Wear',
  'Tailoring',
];

const STATUS_FILTERS: Array<'All' | JobStatus> = [
  'All',
  'Quoted',
  'Approved',
  'In Production',
  'Quality Control',
  'Ready for Dispatch',
  'Delivered',
  'Completed',
];

const EMPTY_SIZES: SizeBreakdown = {
  XS: 0,
  S: 0,
  M: 0,
  L: 0,
  XL: 0,
  XXL: 0,
  XXXL: 0,
  Custom: 0,
};

export const JobsView: React.FC<JobsViewProps> = ({
  mode,
  role,
  profile,
  users,
  settings,
  jobs,
  clients,
  openCreateModalSignal,
  onCreateJob,
  onDeleteJob,
  onOpenJobCard,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ServiceCategory>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | JobStatus>('All');
  const [showCreate, setShowCreate] = useState(false);

  // Sync external New Job trigger
  React.useEffect(() => {
    if (openCreateModalSignal > 0) {
      setShowCreate(true);
    }
  }, [openCreateModalSignal]);

  const salesReps = useMemo(() => {
    const active = users.filter(
      (u) => u.status === 'active' && u.role === 'sales'
    );
    if (profile.role === 'sales' && !active.some((u) => u.uid === profile.uid)) {
      active.unshift(profile);
    }
    return active;
  }, [users, profile]);

  // Create form state
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('Printing');
  const [status, setStatus] = useState<JobStatus>('Quoted');
  const [priority, setPriority] = useState<JobPriority>('Standard');
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [printMethod, setPrintMethod] = useState('');
  const [substrateOrFabric, setSubstrateOrFabric] = useState('');
  const [colorSpecs, setColorSpecs] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [unitPrice, setUnitPrice] = useState('15');
  const [pricingMode, setPricingMode] = useState<PricingMode>('exclusive');
  const [vatTreatment, setVatTreatment] = useState<VatTreatment>('standard');
  const [vatRate, setVatRate] = useState(String(settings.defaultVatRate ?? 15));
  const [estMat, setEstMat] = useState('0');
  const [estLab, setEstLab] = useState('0');
  const [estSub, setEstSub] = useState('0');
  const [estOvh, setEstOvh] = useState('0');
  const [assignedSalesUid, setAssignedSalesUid] = useState(
    profile.role === 'sales' ? profile.uid : salesReps[0]?.uid || ''
  );
  const [commissionRatePct, setCommissionRatePct] = useState(
    profile.role === 'sales'
      ? String(profile.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5)
      : salesReps[0]
        ? String(salesReps[0].commissionRatePct ?? settings.defaultCommissionRatePct ?? 5)
        : '0'
  );
  const [commissionBasis, setCommissionBasis] = useState<CommissionBasis>(
    settings.defaultCommissionBasis || 'gross_profit'
  );

  React.useEffect(() => {
    if (!showCreate) {
      setCommissionBasis(settings.defaultCommissionBasis || 'gross_profit');
    }
  }, [settings.defaultCommissionBasis, showCreate]);
  const [sizes, setSizes] = useState<SizeBreakdown>({ ...EMPTY_SIZES });
  const [artworkNotes, setArtworkNotes] = useState('');
  const [tailoringMeasurements, setTailoringMeasurements] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = role === 'management' || role === 'sales';

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (categoryFilter !== 'All' && job.category !== categoryFilter) return false;
      if (statusFilter !== 'All' && job.status !== statusFilter) return false;
      if (
        q &&
        !job.jobNumber.toLowerCase().includes(q) &&
        !job.title.toLowerCase().includes(q) &&
        !job.clientName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [jobs, search, categoryFilter, statusFilter]);

  const numericQty = Math.max(1, Number(quantity) || 1);
  const numericUnitPrice = Math.max(0, Number(unitPrice) || 0);
  const vatPreview = calculateVatBreakdown({
    amount: numericQty * numericUnitPrice,
    pricingMode,
    vatTreatment,
    vatRate: Number(vatRate) || 0,
  });

  const estCostTotal =
    (Number(estMat) || 0) +
    (Number(estLab) || 0) +
    (Number(estSub) || 0) +
    (Number(estOvh) || 0);
  const projectedProfit = vatPreview.netAmount - estCostTotal;
  const projectedMarginPct =
    vatPreview.netAmount > 0 ? (projectedProfit / vatPreview.netAmount) * 100 : 0;

  const chosenSalesRep = salesReps.find((r) => r.uid === assignedSalesUid) || null;
  const numericCommRate = chosenSalesRep
    ? Math.max(0, Math.min(50, Number(commissionRatePct) || 0))
    : 0;
  const projectedCommission = chosenSalesRep
    ? calculateJobCommission({
        netTotal: vatPreview.netAmount,
        grossProfit: projectedProfit,
        commissionRatePct: numericCommRate,
        commissionBasis,
      })
    : 0;

  const handleSubmitJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenClient = clients.find((c) => c.id === clientId) || clients[0];
    if (!chosenClient || !title.trim()) return;
    const chosenRep = salesReps.find((r) => r.uid === assignedSalesUid) || null;

    setSaving(true);
    try {
      const nextNum = `MP-${new Date().getFullYear()}-${String(1045 + jobs.length).padStart(4, '0')}`;
      await onCreateJob({
        jobNumber: nextNum,
        clientId: chosenClient.id,
        clientName: chosenClient.companyName,
        title: title.trim(),
        category,
        status,
        priority,
        dueDate,
        printMethod: printMethod.trim(),
        substrateOrFabric: substrateOrFabric.trim(),
        colorSpecs: colorSpecs.trim(),
        quantity: numericQty,
        sizeBreakdown: sizes,
        artworkNotes: artworkNotes.trim(),
        tailoringMeasurements: tailoringMeasurements.trim(),
        checklist: {
          prePressOrPattern: false,
          materialsIssued: false,
          printingOrTailoring: false,
          qualityControl: false,
          dispatchReady: false,
        },
        pricingMode,
        vatTreatment,
        vatRate: vatTreatment === 'standard' ? Number(vatRate) || 0 : 0,
        unitPrice: numericUnitPrice,
        netTotal: vatPreview.netAmount,
        vatAmount: vatPreview.vatAmount,
        grossTotal: vatPreview.grossAmount,
        estimatedMaterialCost: Number(estMat) || 0,
        estimatedLaborCost: Number(estLab) || 0,
        estimatedSubcontractCost: Number(estSub) || 0,
        estimatedOverheadCost: Number(estOvh) || 0,
        actualCostTotal: 0,
        assignedSalesUid: chosenRep ? chosenRep.uid : '',
        assignedSalesName: chosenRep ? chosenRep.displayName : '',
        assignedProductionName: '',
        commissionRatePct: chosenRep ? numericCommRate : 0,
        commissionBasis,
        commissionAmount: chosenRep ? projectedCommission : 0,
        commissionStatus: 'Pending',
        commissionPaidDate: '',
      });
      setTitle('');
      setPrintMethod('');
      setSubstrateOrFabric('');
      setColorSpecs('');
      setArtworkNotes('');
      setTailoringMeasurements('');
      setSizes({ ...EMPTY_SIZES });
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search job #, client, or title..."
              className="pl-9 pr-3 py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | JobStatus)}
            className="border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-700 bg-white"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((st) => (
              <option key={st} value={st}>
                {st === 'All' ? 'All Stages' : st}
              </option>
            ))}
          </select>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Create Job / Quote</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      {mode === 'job-cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredJobs.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
              No job cards match the current filter.
            </div>
          ) : (
            filteredJobs.map((job) => {
              const costing = calculateJobCosting(job);
              const doneSteps = Object.values(job.checklist || {}).filter(Boolean).length;
              return (
                <div
                  key={job.id}
                  onClick={() => onOpenJobCard(job)}
                  className="bg-white border border-slate-200 rounded-lg p-5 hover:border-blue-400 cursor-pointer transition-colors flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono-nums font-bold text-blue-700">
                        {job.jobNumber}
                      </span>
                      <StatusText status={job.status} />
                    </div>
                    <h3 className="font-display text-sm font-semibold text-slate-900 line-clamp-2">
                      {job.title}
                    </h3>
                    <div className="text-xs text-slate-500">
                      {job.clientName} · {job.category} · Qty {job.quantity}
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Production Steps</span>
                      <span className="font-mono-nums font-semibold text-slate-900">
                        {doneSteps} / 5 complete
                      </span>
                    </div>
                    {role !== 'production' && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div>
                          <div className="text-[11px] text-slate-400">Net Price</div>
                          <div className="font-mono-nums font-semibold text-slate-900">
                            {formatMoney(job.netTotal, settings.currency)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-400">Actual Cost</div>
                          <div
                            className={`font-mono-nums font-semibold ${
                              costing.isOverBudget ? 'text-red-700' : 'text-slate-900'
                            }`}
                          >
                            {formatMoney(costing.actualTotal, settings.currency)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">Margin</div>
                          <div
                            className={`font-mono-nums font-semibold ${
                              costing.grossMarginPct < 15
                                ? 'text-red-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {costing.grossMarginPct.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredJobs.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No jobs found. {canCreate ? 'Click "Create Job / Quote" to start a new job.' : ''}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Job #</th>
                    <th className="py-2.5 px-4">Client &amp; Job Description</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Stage</th>
                    <th className="py-2.5 px-4">Due Date</th>
                    {role !== 'production' && (
                      <>
                        <th className="py-2.5 px-4 text-right">Net (Excl. VAT)</th>
                        <th className="py-2.5 px-4 text-right">VAT</th>
                        <th className="py-2.5 px-4 text-right">Gross Total</th>
                        <th className="py-2.5 px-4 text-right">Est / Actual Cost</th>
                      </>
                    )}
                    <th className="py-2.5 px-4 text-right">Job Card</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredJobs.map((job) => {
                    const costing = calculateJobCosting(job);
                    return (
                      <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono-nums text-xs font-semibold text-blue-700 whitespace-nowrap">
                          {job.jobNumber}
                        </td>
                        <td className="py-3 px-4 min-w-[220px]">
                          <div className="font-medium text-slate-900">{job.title}</div>
                          <div className="text-xs text-slate-500">
                            {job.clientName} · Qty {job.quantity} · {job.priority}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                          {job.category}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText status={job.status} />
                        </td>
                        <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                          {job.dueDate || '—'}
                        </td>
                        {role !== 'production' && (
                          <>
                            <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800 whitespace-nowrap">
                              {formatMoney(job.netTotal, settings.currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                              {formatMoney(job.vatAmount, settings.currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                              {formatMoney(job.grossTotal, settings.currency)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-nums text-xs whitespace-nowrap">
                              <span className="text-slate-500">
                                {formatMoney(costing.estimatedTotal, settings.currency)}
                              </span>
                              {' / '}
                              <span
                                className={
                                  costing.isOverBudget
                                    ? 'text-red-700 font-semibold'
                                    : 'text-slate-900 font-semibold'
                                }
                              >
                                {formatMoney(costing.actualTotal, settings.currency)}
                              </span>
                            </td>
                          </>
                        )}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenJobCard(job)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              <span>Open Card</span>
                            </button>
                            {role === 'management' && (
                              <button
                                type="button"
                                onClick={() => onDeleteJob(job.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                                title="Delete job"
                                aria-label="Delete job"
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
      )}

      {/* Create Job Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl my-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Create Production Job &amp; Cost Estimate
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {clients.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  Add a client first before creating a job.
                </p>
                <p className="text-xs text-slate-500">
                  Go to Clients &amp; Quotes to register a client with their ZIMRA BP / Tax #.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitJob} className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Job Title / Description
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. 200 Embroidered Corporate Polo Shirts"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
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
                          {c.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Service Line
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="Printing">Printing</option>
                      <option value="Branding">Branding</option>
                      <option value="Corporate Wear">Corporate Wear</option>
                      <option value="Tailoring">Tailoring</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Initial Stage
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as JobStatus)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="Quoted">Quoted</option>
                      <option value="Approved">Approved</option>
                      <option value="In Production">In Production</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as JobPriority)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="Standard">Standard</option>
                      <option value="Urgent">Urgent</option>
                      <option value="Express">Express</option>
                    </select>
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

                {/* Production Specifications */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Print / Tailoring Method
                    </label>
                    <input
                      type="text"
                      value={printMethod}
                      onChange={(e) => setPrintMethod(e.target.value)}
                      placeholder="Screen Print / DTF / Bespoke Suit"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Substrate / Fabric
                    </label>
                    <input
                      type="text"
                      value={substrateOrFabric}
                      onChange={(e) => setSubstrateOrFabric(e.target.value)}
                      placeholder="300gsm Art Card / 240gsm Cotton"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Color / Pantone Specs
                    </label>
                    <input
                      type="text"
                      value={colorSpecs}
                      onChange={(e) => setColorSpecs(e.target.value)}
                      placeholder="CMYK + Pantone 286C"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {(category === 'Corporate Wear' || category === 'Tailoring') && (
                  <div>
                    <div className="text-xs font-medium text-slate-700 mb-2">
                      Garment Size Breakdown
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                      {(Object.keys(sizes) as Array<keyof SizeBreakdown>).map((sz) => (
                        <div key={sz}>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            {sz}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={sizes[sz]}
                            onChange={(e) =>
                              setSizes({
                                ...sizes,
                                [sz]: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs font-mono-nums"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Artwork &amp; Finishing Notes
                    </label>
                    <textarea
                      rows={2}
                      value={artworkNotes}
                      onChange={(e) => setArtworkNotes(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tailoring Measurements / Pattern Notes
                    </label>
                    <textarea
                      rows={2}
                      value={tailoringMeasurements}
                      onChange={(e) => setTailoringMeasurements(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Pricing & VAT + Costing */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-900">
                      Pricing &amp; VAT Calculation
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Unit Price ({settings.currency})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={unitPrice}
                          onChange={(e) => setUnitPrice(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Pricing Mode
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
                        <label className="block text-xs text-slate-600 mb-1">
                          VAT Treatment ({vatRate}%)
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={vatTreatment}
                            onChange={(e) =>
                              setVatTreatment(e.target.value as VatTreatment)
                            }
                            className="flex-1 border border-slate-200 rounded-md px-2.5 py-2 text-sm bg-white"
                          >
                            <option value="standard">Standard</option>
                            <option value="zero">Zero-Rated (0%)</option>
                            <option value="exempt">Exempt</option>
                          </select>
                          {vatTreatment === 'standard' && (
                            <input
                              type="number"
                              min="0"
                              max="50"
                              step="0.5"
                              value={vatRate}
                              onChange={(e) => setVatRate(e.target.value)}
                              className="w-16 border border-slate-200 rounded-md px-2 py-2 text-sm font-mono-nums"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Net Subtotal (Excl. VAT)</span>
                        <span className="font-mono-nums font-medium text-slate-900">
                          {formatMoney(vatPreview.netAmount, settings.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">
                          VAT ({vatPreview.effectiveVatRate}%)
                        </span>
                        <span className="font-mono-nums font-medium text-slate-900">
                          {formatMoney(vatPreview.vatAmount, settings.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
                        <span>Gross Quote Total</span>
                        <span className="font-mono-nums">
                          {formatMoney(vatPreview.grossAmount, settings.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-900">
                      Estimated Job Costing &amp; Margin
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Est. Materials
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={estMat}
                          onChange={(e) => setEstMat(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Est. Direct Labor
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={estLab}
                          onChange={(e) => setEstLab(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Est. Subcontracting
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={estSub}
                          onChange={(e) => setEstSub(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">
                          Est. Overhead
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={estOvh}
                          onChange={(e) => setEstOvh(e.target.value)}
                          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Estimated Cost</span>
                        <span className="font-mono-nums font-medium text-slate-900">
                          {formatMoney(estCostTotal, settings.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Projected Gross Profit</span>
                        <span
                          className={`font-mono-nums font-semibold ${
                            projectedProfit < 0 ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatMoney(projectedProfit, settings.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold">
                        <span className="text-slate-700">Projected Margin</span>
                        <span
                          className={`font-mono-nums ${
                            projectedMarginPct < 15 ? 'text-red-700' : 'text-emerald-700'
                          }`}
                        >
                          {projectedMarginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sales Rep & Commission Allocation */}
                <div className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-slate-900">
                        Sales Team Representative &amp; Commission Allocation
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Commission applies exclusively to Sales &amp; Marketing team members.
                      </p>
                    </div>
                    <span className="font-mono-nums text-xs font-bold text-blue-700">
                      Est. Commission:{' '}
                      {formatMoney(projectedCommission, settings.currency)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Assigned Sales Rep
                      </label>
                      <select
                        value={chosenSalesRep ? chosenSalesRep.uid : ''}
                        disabled={profile.role === 'sales' && role !== 'management'}
                        onChange={(e) => {
                          const repUid = e.target.value;
                          setAssignedSalesUid(repUid);
                          if (!repUid) {
                            setCommissionRatePct('0');
                            return;
                          }
                          const rep = salesReps.find((r) => r.uid === repUid);
                          setCommissionRatePct(
                            String(
                              rep?.commissionRatePct ??
                                settings.defaultCommissionRatePct ??
                                5
                            )
                          );
                        }}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100"
                      >
                        <option value="">
                          No Sales Rep / House Job (0% Commission)
                        </option>
                        {salesReps.map((rep) => (
                          <option key={rep.uid} value={rep.uid}>
                            {rep.displayName} (
                            {rep.commissionRatePct ??
                              settings.defaultCommissionRatePct ??
                              5}
                            %)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Commission Rate (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        disabled={!chosenSalesRep}
                        value={chosenSalesRep ? commissionRatePct : '0'}
                        onChange={(e) => setCommissionRatePct(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Calculation Basis
                      </label>
                      <select
                        value={commissionBasis}
                        disabled={!chosenSalesRep}
                        onChange={(e) =>
                          setCommissionBasis(e.target.value as CommissionBasis)
                        }
                        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="gross_profit">% of Net Profit of Job (Sales − Costs)</option>
                        <option value="net_sales">% of Net Sales (Excl. VAT)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving Job...' : 'Save Job & Generate Job Card'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
