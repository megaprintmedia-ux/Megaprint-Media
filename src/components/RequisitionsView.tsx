import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  ChartAccount,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Department,
  InventoryItem,
  Job,
  Requisition,
  RequisitionLine,
  RequisitionPriority,
  RequisitionStatus,
  RequisitionType,
  UserProfile,
  UserRole,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { StatusText } from './StatusText';

interface RequisitionsViewProps {
  role: UserRole;
  profile: UserProfile;
  settings: CompanySettings;
  requisitions: Requisition[];
  inventoryItems: InventoryItem[];
  jobs: Job[];
  chartOfAccounts: ChartAccount[];
  onCreateRequisition: (input: {
    requisitionNumber: string;
    requisitionDate: string;
    neededByDate: string;
    requisitionType: RequisitionType;
    department: Department;
    priority: RequisitionPriority;
    jobId: string;
    jobNumber: string;
    preferredSupplier: string;
    lines: RequisitionLine[];
    justification: string;
    status: 'Draft' | 'Submitted';
  }) => Promise<string | undefined>;
  onUpdateRequisition: (
    reqId: string,
    updates: Partial<{
      requisitionDate: string;
      neededByDate: string;
      requisitionType: RequisitionType;
      department: Department;
      priority: RequisitionPriority;
      jobId: string;
      jobNumber: string;
      preferredSupplier: string;
      lines: RequisitionLine[];
      justification: string;
      status: Extract<RequisitionStatus, 'Draft' | 'Submitted'>;
    }>
  ) => Promise<void>;
  onReviewRequisition: (
    req: Requisition,
    decision: 'Approved' | 'Rejected',
    notes?: string
  ) => Promise<void>;
  onFulfillRequisition: (
    req: Requisition,
    options?: {
      linkedRef?: string;
      fulfillmentNotes?: string;
      issueFromInventory?: boolean;
      postToCashBook?: boolean;
      cashBookAccount?: string;
      cashDisbursedAmount?: number;
    }
  ) => Promise<void>;
  onDeleteRequisition: (reqId: string) => Promise<void>;
}

interface DraftLine {
  inventoryItemId: string;
  sku: string;
  description: string;
  quantity: string;
  unit: string;
  estimatedUnitCost: string;
}

const REQUISITION_TYPES: RequisitionType[] = [
  'Purchase Requisition',
  'Stock / Material Issue',
  'Petty Cash / Expense',
];

const DEPARTMENTS: Department[] = [
  'Production',
  'Sales & Marketing',
  'Accounts',
  'Management',
];

const PRIORITIES: RequisitionPriority[] = ['Normal', 'Urgent', 'Critical'];

const EMPTY_LINE: DraftLine = {
  inventoryItemId: '',
  sku: '',
  description: '',
  quantity: '1',
  unit: 'Pcs',
  estimatedUnitCost: '0',
};

export const RequisitionsView: React.FC<RequisitionsViewProps> = ({
  role,
  profile,
  settings,
  requisitions,
  inventoryItems,
  jobs,
  chartOfAccounts,
  onCreateRequisition,
  onUpdateRequisition,
  onReviewRequisition,
  onFulfillRequisition,
  onDeleteRequisition,
}) => {
  const [statusFilter, setStatusFilter] = useState<'All' | RequisitionStatus>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | RequisitionType>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Create / Edit modal state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingReq, setEditingReq] = useState<Requisition | null>(null);
  const [reqDate, setReqDate] = useState(new Date().toISOString().slice(0, 10));
  const [neededByDate, setNeededByDate] = useState('');
  const [reqType, setReqType] = useState<RequisitionType>('Purchase Requisition');
  const [department, setDepartment] = useState<Department>(profile.department);
  const [priority, setPriority] = useState<RequisitionPriority>('Normal');
  const [jobId, setJobId] = useState('');
  const [preferredSupplier, setPreferredSupplier] = useState('');
  const [justification, setJustification] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [savingForm, setSavingForm] = useState(false);

  // Inspect / Approval / Fulfillment modal state
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [linkedRef, setLinkedRef] = useState('');
  const [fulfillNotes, setFulfillNotes] = useState('');
  const [issueFromInventory, setIssueFromInventory] = useState(true);
  const [postToCashBook, setPostToCashBook] = useState(true);
  const [cashBookAccount, setCashBookAccount] = useState('Petty Cash Float');
  const [cashDisbursedAmount, setCashDisbursedAmount] = useState('0');
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const canApproveOrReject = role === 'management' || role === 'accounts';

  const cashAccountOptions = useMemo(() => {
    const activeCoa = chartOfAccounts
      .filter((a) => a.isActive && a.isCashBookAccount)
      .map((a) => a.name);
    if (activeCoa.length > 0) return activeCoa;
    return Array.from(DEFAULT_ZIM_CASH_ACCOUNTS);
  }, [chartOfAccounts]);

  const metrics = useMemo(() => {
    const submitted = requisitions.filter((r) => r.status === 'Submitted');
    const approved = requisitions.filter((r) => r.status === 'Approved');
    const fulfilled = requisitions.filter((r) => r.status === 'Fulfilled');
    return {
      totalCount: requisitions.length,
      totalValue: round2(
        requisitions
          .filter((r) => r.status !== 'Rejected')
          .reduce((acc, r) => acc + (r.totalEstimatedCost || 0), 0)
      ),
      submittedCount: submitted.length,
      submittedValue: round2(
        submitted.reduce((acc, r) => acc + (r.totalEstimatedCost || 0), 0)
      ),
      approvedCount: approved.length,
      approvedValue: round2(
        approved.reduce((acc, r) => acc + (r.totalEstimatedCost || 0), 0)
      ),
      fulfilledCount: fulfilled.length,
      fulfilledValue: round2(
        fulfilled.reduce((acc, r) => acc + (r.totalEstimatedCost || 0), 0)
      ),
    };
  }, [requisitions]);

  const filteredRequisitions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requisitions.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (typeFilter !== 'All' && r.requisitionType !== typeFilter) return false;
      if (!q) return true;
      return (
        r.requisitionNumber.toLowerCase().includes(q) ||
        r.requestedByName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        (r.jobNumber || '').toLowerCase().includes(q) ||
        (r.preferredSupplier || '').toLowerCase().includes(q) ||
        r.lines.some((l) => l.description.toLowerCase().includes(q))
      );
    });
  }, [requisitions, statusFilter, typeFilter, searchQuery]);

  const draftTotal = useMemo(() => {
    return round2(
      lines.reduce((acc, l) => {
        const qty = Math.max(0, Number(l.quantity) || 0);
        const unit = Math.max(0, Number(l.estimatedUnitCost) || 0);
        return acc + qty * unit;
      }, 0)
    );
  }, [lines]);

  const nextReqNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const maxSeq = requisitions.reduce((max, r) => {
      const m = r.requisitionNumber.match(/(\d+)$/);
      const num = m ? Number(m[1]) : 0;
      return Math.max(max, num);
    }, 0);
    return `REQ-${year}-${String(Math.max(maxSeq + 1, requisitions.length + 1)).padStart(
      3,
      '0'
    )}`;
  }, [requisitions]);

  const openCreateModal = () => {
    setEditingReq(null);
    setReqDate(new Date().toISOString().slice(0, 10));
    setNeededByDate('');
    setReqType('Purchase Requisition');
    setDepartment(profile.department);
    setPriority('Normal');
    setJobId('');
    setPreferredSupplier('');
    setJustification('');
    setLines([{ ...EMPTY_LINE }]);
    setShowFormModal(true);
  };

  const openEditModal = (req: Requisition) => {
    setEditingReq(req);
    setReqDate(req.requisitionDate);
    setNeededByDate(req.neededByDate || '');
    setReqType(req.requisitionType);
    setDepartment(req.department);
    setPriority(req.priority);
    setJobId(req.jobId || '');
    setPreferredSupplier(req.preferredSupplier || '');
    setJustification(req.justification || '');
    setLines(
      req.lines.length > 0
        ? req.lines.map((l) => ({
            inventoryItemId: l.inventoryItemId || '',
            sku: l.sku || '',
            description: l.description || '',
            quantity: String(l.quantity),
            unit: l.unit || 'Pcs',
            estimatedUnitCost: String(l.estimatedUnitCost),
          }))
        : [{ ...EMPTY_LINE }]
    );
    setShowFormModal(true);
  };

  const openInspectModal = (req: Requisition) => {
    setSelectedReq(req);
    setActionError(null);
    setReviewNote(req.fulfillmentNotes || '');
    setLinkedRef(req.linkedRef || '');
    setFulfillNotes(req.fulfillmentNotes || '');
    setIssueFromInventory(req.lines.some((l) => Boolean(l.inventoryItemId)));
    setPostToCashBook(true);
    setCashBookAccount(
      cashAccountOptions.find((a) => a.toLowerCase().includes('petty')) ||
        cashAccountOptions[0] ||
        'Petty Cash Float'
    );
    setCashDisbursedAmount(String(req.totalEstimatedCost || 0));
  };

  const handleInventoryPick = (idx: number, invId: string) => {
    const item = inventoryItems.find((i) => i.id === invId);
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        if (!item) {
          return { ...l, inventoryItemId: '', sku: '' };
        }
        return {
          ...l,
          inventoryItemId: item.id,
          sku: item.sku,
          description: item.name,
          unit: item.unit || 'Pcs',
          estimatedUnitCost: String(item.unitCost || 0),
        };
      })
    );
  };

  const handleSaveRequisition = async (targetStatus: 'Draft' | 'Submitted') => {
    const validLines: RequisitionLine[] = lines
      .filter((l) => l.description.trim().length > 0)
      .slice(0, 10)
      .map((l) => {
        const qty = Math.max(0.01, round2(Number(l.quantity) || 1));
        const cost = Math.max(0, round2(Number(l.estimatedUnitCost) || 0));
        return {
          inventoryItemId: l.inventoryItemId,
          sku: l.sku,
          description: l.description.trim(),
          quantity: qty,
          unit: l.unit.trim() || 'Pcs',
          estimatedUnitCost: cost,
          estimatedTotal: round2(qty * cost),
        };
      });

    if (validLines.length === 0) return;
    const selectedJob = jobs.find((j) => j.id === jobId);

    setSavingForm(true);
    try {
      if (editingReq) {
        await onUpdateRequisition(editingReq.id, {
          requisitionDate: reqDate,
          neededByDate,
          requisitionType: reqType,
          department,
          priority,
          jobId: selectedJob?.id || '',
          jobNumber: selectedJob?.jobNumber || '',
          preferredSupplier,
          lines: validLines,
          justification,
          status: targetStatus,
        });
      } else {
        await onCreateRequisition({
          requisitionNumber: nextReqNumber,
          requisitionDate: reqDate,
          neededByDate,
          requisitionType: reqType,
          department,
          priority,
          jobId: selectedJob?.id || '',
          jobNumber: selectedJob?.jobNumber || '',
          preferredSupplier,
          lines: validLines,
          justification,
          status: targetStatus,
        });
      }
      setShowFormModal(false);
    } finally {
      setSavingForm(false);
    }
  };

  const handleReview = async (decision: 'Approved' | 'Rejected') => {
    if (!selectedReq) return;
    setActionError(null);
    setProcessingAction(true);
    try {
      await onReviewRequisition(selectedReq, decision, reviewNote);
      setSelectedReq(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to review requisition.'
      );
    } finally {
      setProcessingAction(false);
    }
  };

  const handleFulfill = async () => {
    if (!selectedReq) return;
    setActionError(null);
    setProcessingAction(true);
    try {
      await onFulfillRequisition(selectedReq, {
        linkedRef,
        fulfillmentNotes: fulfillNotes,
        issueFromInventory,
        postToCashBook,
        cashBookAccount,
        cashDisbursedAmount: Number(cashDisbursedAmount) || selectedReq.totalEstimatedCost,
      });
      setSelectedReq(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to fulfill requisition.'
      );
    } finally {
      setProcessingAction(false);
    }
  };

  const liveSelectedReq = selectedReq
    ? requisitions.find((r) => r.id === selectedReq.id) || selectedReq
    : null;

  return (
    <div className="space-y-5">
      {/* Header & KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Total Requisitions</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 font-mono-nums">
              {metrics.totalCount}
            </span>
            <span className="text-xs text-slate-500 font-mono-nums">
              {formatMoney(metrics.totalValue, settings.currency)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-amber-700">Awaiting Approval</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 font-mono-nums">
              {metrics.submittedCount}
            </span>
            <span className="text-xs text-amber-700 font-medium font-mono-nums">
              {formatMoney(metrics.submittedValue, settings.currency)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-blue-700">Approved (Pending Issue)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 font-mono-nums">
              {metrics.approvedCount}
            </span>
            <span className="text-xs text-blue-700 font-medium font-mono-nums">
              {formatMoney(metrics.approvedValue, settings.currency)}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-emerald-700">Fulfilled / Issued</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 font-mono-nums">
              {metrics.fulfilledCount}
            </span>
            <span className="text-xs text-emerald-700 font-medium font-mono-nums">
              {formatMoney(metrics.fulfilledValue, settings.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Controls & Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 no-print">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              ['All', 'Draft', 'Submitted', 'Approved', 'Fulfilled', 'Rejected'] as const
            ).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search REQ#, job, item..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'All' | RequisitionType)
              }
              className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label="Filter by requisition type"
            >
              <option value="All">All Types</option>
              {REQUISITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Raise Requisition</span>
            </button>
          </div>
        </div>
      </div>

      {/* Requisitions Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">Requisition #</th>
                <th className="py-3 px-4">Type &amp; Dept</th>
                <th className="py-3 px-4">Items / Purpose</th>
                <th className="py-3 px-4">Job / Supplier</th>
                <th className="py-3 px-4">Requester</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4 text-right">Est. Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRequisitions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center text-slate-500">
                    No requisitions match your filters yet. Click{' '}
                    <strong className="text-slate-700">Raise Requisition</strong> to
                    request stock, materials, purchases, or petty cash.
                  </td>
                </tr>
              ) : (
                filteredRequisitions.map((req) => {
                  const isOwner = req.requestedByUid === profile.uid;
                  const canEdit =
                    (role === 'management' || isOwner) &&
                    (req.status === 'Draft' || req.status === 'Submitted');
                  const canDelete =
                    role === 'management' ||
                    (isOwner && req.status === 'Draft');
                  const firstDesc = req.lines[0]?.description || 'Items';
                  const extraCount = req.lines.length - 1;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 align-top">
                        <div className="font-semibold text-slate-900 font-mono-nums">
                          {req.requisitionNumber}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-nums">
                          {req.requisitionDate}
                          {req.neededByDate ? ` · Due ${req.neededByDate}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-800">
                          {req.requisitionType}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {req.department}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top max-w-[240px]">
                        <div className="font-medium text-slate-800 truncate">
                          {firstDesc}
                          {extraCount > 0 ? ` (+${extraCount} more)` : ''}
                        </div>
                        {req.justification && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {req.justification}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        {req.jobNumber ? (
                          <div className="font-medium text-blue-700 font-mono-nums">
                            {req.jobNumber}
                          </div>
                        ) : (
                          <div className="text-slate-400">General</div>
                        )}
                        {req.preferredSupplier && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                            {req.preferredSupplier}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top text-slate-700">
                        {req.requestedByName}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StatusText status={req.priority} />
                      </td>
                      <td className="py-3 px-4 align-top text-right font-semibold text-slate-900 font-mono-nums">
                        {formatMoney(req.totalEstimatedCost || 0, settings.currency)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StatusText status={req.status} />
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openInspectModal(req)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                            title="View, Approve or Print"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(req)}
                              className="p-1.5 rounded hover:bg-slate-100 text-slate-600 hover:text-blue-700"
                              title="Edit Requisition"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDeleteRequisition(req.id)}
                              className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-700"
                              title="Delete Requisition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Requisition Modal */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus2 className="h-4 w-4 text-blue-600" />
                <h2 className="font-display font-bold text-slate-900 text-base">
                  {editingReq
                    ? `Edit Requisition ${editingReq.requisitionNumber}`
                    : `Raise Requisition (${nextReqNumber})`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Requisition Type
                  </label>
                  <select
                    value={reqType}
                    onChange={(e) => setReqType(e.target.value as RequisitionType)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {REQUISITION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Urgency / Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) =>
                      setPriority(e.target.value as RequisitionPriority)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Requisition Date
                  </label>
                  <input
                    type="date"
                    value={reqDate}
                    onChange={(e) => setReqDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Needed By Date
                  </label>
                  <input
                    type="date"
                    value={neededByDate}
                    onChange={(e) => setNeededByDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Link to Production Job (Optional)
                  </label>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">General Overhead / Non-Job</option>
                    {jobs
                      .filter((j) => j.status !== 'Cancelled')
                      .map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.jobNumber} — {j.clientName} ({j.title})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Preferred Supplier / Payee (Optional)
                </label>
                <input
                  type="text"
                  value={preferredSupplier}
                  onChange={(e) => setPreferredSupplier(e.target.value)}
                  placeholder="e.g. Harare Print & Substrate Supplies, David Whitehead, Courier..."
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    Requested Items / Expenses ({lines.length}/10)
                  </span>
                  {lines.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Line
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {lines.map((line, idx) => {
                    const lineTotal = round2(
                      (Math.max(0, Number(line.quantity) || 0) *
                        Math.max(0, Number(line.estimatedUnitCost) || 0))
                    );
                    return (
                      <div
                        key={idx}
                        className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Inventory Stock Item (Optional)
                            </label>
                            <select
                              value={line.inventoryItemId}
                              onChange={(e) =>
                                handleInventoryPick(idx, e.target.value)
                              }
                              className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
                            >
                              <option value="">Custom / Non-Stock Item</option>
                              {inventoryItems.map((inv) => (
                                <option key={inv.id} value={inv.id}>
                                  {inv.sku} — {inv.name} ({inv.quantityOnHand}{' '}
                                  {inv.unit})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Item / Expense Description *
                            </label>
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, description: e.target.value }
                                      : l
                                  )
                                )
                              }
                              placeholder="Describe material, spare part, or expense"
                              className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs bg-white"
                            />
                          </div>

                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Qty
                            </label>
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={line.quantity}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, quantity: e.target.value }
                                      : l
                                  )
                                )
                              }
                              className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white font-mono-nums"
                            />
                          </div>

                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={line.unit}
                              onChange={(e) =>
                                setLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, unit: e.target.value } : l
                                  )
                                )
                              }
                              className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white"
                            />
                          </div>

                          <div className="md:col-span-2 flex items-end gap-1.5">
                            <div className="flex-1">
                              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                                Est. Unit ({settings.currency})
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.estimatedUnitCost}
                                onChange={(e) =>
                                  setLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx
                                        ? { ...l, estimatedUnitCost: e.target.value }
                                        : l
                                    )
                                  )
                                }
                                className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white font-mono-nums"
                              />
                            </div>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLines((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600"
                                title="Remove line"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-mono-nums">
                          Line Est.:{' '}
                          <strong className="text-slate-800">
                            {formatMoney(lineTotal, settings.currency)}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Reason / Justification
                </label>
                <textarea
                  rows={2}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Why is this needed and which client order or workshop bay does it support?"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                Total Estimated Cost:{' '}
                <strong className="text-sm text-slate-900 font-mono-nums">
                  {formatMoney(draftTotal, settings.currency)}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-3.5 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    savingForm ||
                    lines.every((l) => l.description.trim().length === 0)
                  }
                  onClick={() => handleSaveRequisition('Draft')}
                  className="px-3.5 py-2 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  disabled={
                    savingForm ||
                    lines.every((l) => l.description.trim().length === 0)
                  }
                  onClick={() => handleSaveRequisition('Submitted')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{savingForm ? 'Saving...' : 'Submit for Approval'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inspect / Approve / Fulfill / Print Voucher Modal */}
      {liveSelectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between no-print">
              <div className="flex items-center gap-3">
                <h2 className="font-display font-bold text-slate-900 text-base">
                  Requisition {liveSelectedReq.requisitionNumber}
                </h2>
                <StatusText status={liveSelectedReq.status} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Voucher</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReq(null)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Printable Requisition Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="font-display text-base font-bold text-slate-900">
                    {settings.companyName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {settings.address}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ZIMRA TIN: {settings.zimraTin || settings.taxPin} ·{' '}
                    {settings.phone}
                  </div>
                </div>
                <div className="sm:text-right space-y-0.5">
                  <div className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                    {liveSelectedReq.requisitionType}
                  </div>
                  <div className="font-mono-nums font-semibold text-slate-800">
                    {liveSelectedReq.requisitionNumber}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-nums">
                    Raised: {liveSelectedReq.requisitionDate}
                    {liveSelectedReq.neededByDate
                      ? ` · Needed By: ${liveSelectedReq.neededByDate}`
                      : ''}
                  </div>
                </div>
              </div>

              {/* Meta Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">
                    Requested By
                  </div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {liveSelectedReq.requestedByName}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">
                    Department
                  </div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {liveSelectedReq.department}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">
                    Linked Job
                  </div>
                  <div className="font-medium text-slate-900 mt-0.5 font-mono-nums">
                    {liveSelectedReq.jobNumber || 'General Overhead'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-500 font-semibold">
                    Supplier / Payee
                  </div>
                  <div className="font-medium text-slate-900 mt-0.5">
                    {liveSelectedReq.preferredSupplier || '—'}
                  </div>
                </div>
              </div>

              {/* Lines Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3 text-right">Est. Unit</th>
                      <th className="py-2.5 px-3 text-right">Est. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liveSelectedReq.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono-nums text-slate-500">
                          {line.sku || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {line.description}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-nums">
                          {line.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{line.unit}</td>
                        <td className="py-2.5 px-3 text-right font-mono-nums">
                          {formatMoney(line.estimatedUnitCost, settings.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold font-mono-nums text-slate-900">
                          {formatMoney(line.estimatedTotal, settings.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                      <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700">
                        Total Estimated Value
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums text-slate-900">
                        {formatMoney(
                          liveSelectedReq.totalEstimatedCost,
                          settings.currency
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {liveSelectedReq.justification && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] uppercase text-slate-500 font-semibold mb-1">
                    Justification / Purpose
                  </div>
                  <p className="text-slate-700 whitespace-pre-line">
                    {liveSelectedReq.justification}
                  </p>
                </div>
              )}

              {(liveSelectedReq.approvedByName ||
                liveSelectedReq.fulfillmentNotes ||
                liveSelectedReq.linkedRef) && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/70 space-y-1">
                  {liveSelectedReq.approvedByName && (
                    <div>
                      <span className="text-slate-500">Reviewed By:</span>{' '}
                      <strong className="text-slate-900">
                        {liveSelectedReq.approvedByName}
                      </strong>{' '}
                      {liveSelectedReq.approvedDate
                        ? `on ${liveSelectedReq.approvedDate}`
                        : ''}
                    </div>
                  )}
                  {liveSelectedReq.linkedRef && (
                    <div>
                      <span className="text-slate-500">PO / Issue / Voucher Ref:</span>{' '}
                      <strong className="font-mono-nums text-slate-900">
                        {liveSelectedReq.linkedRef}
                      </strong>
                    </div>
                  )}
                  {liveSelectedReq.fulfillmentNotes && (
                    <div>
                      <span className="text-slate-500">Notes:</span>{' '}
                      <span className="text-slate-800">
                        {liveSelectedReq.fulfillmentNotes}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Print Signature Strip */}
              <div className="hidden print:grid grid-cols-3 gap-6 pt-8 text-[11px] text-slate-600">
                <div className="border-t border-slate-400 pt-1.5">
                  Requested By: {liveSelectedReq.requestedByName}
                </div>
                <div className="border-t border-slate-400 pt-1.5">
                  Approved By: {liveSelectedReq.approvedByName || '________________'}
                </div>
                <div className="border-t border-slate-400 pt-1.5">
                  Issued / Received By: ________________
                </div>
              </div>

              {/* Workflow Action Controls */}
              {liveSelectedReq.status === 'Draft' &&
                (liveSelectedReq.requestedByUid === profile.uid ||
                  role === 'management') && (
                  <div className="border border-blue-200 bg-blue-50/60 rounded-lg p-4 flex items-center justify-between gap-3 no-print">
                    <div className="text-slate-700">
                      This requisition is currently a <strong>Draft</strong>. Submit
                      it so Management or Accounts can approve it.
                    </div>
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={async () => {
                        setProcessingAction(true);
                        try {
                          await onUpdateRequisition(liveSelectedReq.id, {
                            status: 'Submitted',
                          });
                        } finally {
                          setProcessingAction(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Submit Now</span>
                    </button>
                  </div>
                )}

              {liveSelectedReq.status === 'Submitted' && canApproveOrReject && (
                <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-4 space-y-3 no-print">
                  <div className="font-semibold text-slate-900">
                    Management / Accounts Review
                  </div>
                  <input
                    type="text"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Optional approval instructions or rejection reason..."
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-xs bg-white"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleReview('Rejected')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 font-semibold"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={processingAction}
                      onClick={() => handleReview('Approved')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Approve Requisition</span>
                    </button>
                  </div>
                </div>
              )}

              {liveSelectedReq.status === 'Approved' &&
                (canApproveOrReject ||
                  (role === 'production' &&
                    liveSelectedReq.requisitionType ===
                      'Stock / Material Issue')) && (
                  <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-4 space-y-3 no-print">
                    <div className="font-semibold text-slate-900">
                      Fulfill Approved Requisition
                    </div>
                    {actionError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        {actionError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          PO / Issue Slip / Voucher Reference
                        </label>
                        <input
                          type="text"
                          value={linkedRef}
                          onChange={(e) => setLinkedRef(e.target.value)}
                          placeholder="e.g. PO-2026-044 or SLIP-19"
                          className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 mb-1">
                          Fulfillment Notes
                        </label>
                        <input
                          type="text"
                          value={fulfillNotes}
                          onChange={(e) => setFulfillNotes(e.target.value)}
                          placeholder="Issued to bay, PO emailed, or cash handed over"
                          className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>

                    {liveSelectedReq.requisitionType ===
                      'Stock / Material Issue' &&
                      liveSelectedReq.lines.some((l) =>
                        Boolean(l.inventoryItemId)
                      ) && (
                        <label className="flex items-center gap-2 text-xs text-slate-800">
                          <input
                            type="checkbox"
                            checked={issueFromInventory}
                            onChange={(e) =>
                              setIssueFromInventory(e.target.checked)
                            }
                            className="rounded border-slate-300"
                          />
                          <span>
                            Automatically deduct linked stock items from Inventory
                            &amp; record &ldquo;Issue to Job&rdquo; movement
                          </span>
                        </label>
                      )}

                    {liveSelectedReq.requisitionType === 'Petty Cash / Expense' &&
                      canApproveOrReject && (
                        <div className="space-y-2.5 pt-1 border-t border-emerald-200/70">
                          <label className="flex items-center gap-2 text-xs text-slate-800">
                            <input
                              type="checkbox"
                              checked={postToCashBook}
                              onChange={(e) =>
                                setPostToCashBook(e.target.checked)
                              }
                              className="rounded border-slate-300"
                            />
                            <span>
                              Record Cash Book outflow payment upon disbursement
                            </span>
                          </label>
                          {postToCashBook && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                  Pay From Cash / Bank Account
                                </label>
                                <select
                                  value={cashBookAccount}
                                  onChange={(e) =>
                                    setCashBookAccount(e.target.value)
                                  }
                                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white"
                                >
                                  {cashAccountOptions.map((acc) => (
                                    <option key={acc} value={acc}>
                                      {acc}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                                  Disbursed Amount ({settings.currency})
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={cashDisbursedAmount}
                                  onChange={(e) =>
                                    setCashDisbursedAmount(e.target.value)
                                  }
                                  className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-xs bg-white font-mono-nums"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={processingAction}
                        onClick={handleFulfill}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>
                          {processingAction ? 'Processing...' : 'Mark as Fulfilled'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
