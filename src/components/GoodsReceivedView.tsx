import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CompanySettings,
  GoodsReceipt,
  GoodsReceiptCondition,
  GoodsReceiptLine,
  InventoryItem,
  Job,
  SupplierInvoice,
  UserRole,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { StatusText } from './StatusText';

interface GoodsReceivedViewProps {
  role: UserRole;
  userDisplayName: string;
  settings: CompanySettings;
  goodsReceipts: GoodsReceipt[];
  supplierInvoices: SupplierInvoice[];
  inventoryItems: InventoryItem[];
  jobs: Job[];
  onCreateGoodsReceipt: (
    input: Omit<
      GoodsReceipt,
      'id' | 'totalValue' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<string | undefined>;
  onUpdateGoodsReceipt: (
    grnId: string,
    updates: Partial<{
      conditionStatus: GoodsReceiptCondition;
      supplierInvoiceId: string;
      supplierInvoiceNo: string;
      notes: string;
    }>
  ) => Promise<void>;
  onDeleteGoodsReceipt: (grnId: string) => Promise<void>;
}

interface DraftGrnLine {
  inventoryItemId: string;
  sku: string;
  description: string;
  quantityOrdered: string;
  quantityReceived: string;
  unit: string;
  unitCost: string;
}

const CONDITIONS: GoodsReceiptCondition[] = [
  'Accepted',
  'Partial / Short',
  'Damaged / Rejected',
];

export const GoodsReceivedView: React.FC<GoodsReceivedViewProps> = ({
  role,
  userDisplayName,
  settings,
  goodsReceipts,
  supplierInvoices,
  inventoryItems,
  jobs,
  onCreateGoodsReceipt,
  onUpdateGoodsReceipt,
  onDeleteGoodsReceipt,
}) => {
  const [conditionFilter, setConditionFilter] = useState<'All' | GoodsReceiptCondition>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<GoodsReceipt | null>(null);

  // Create form state
  const [supplierName, setSupplierName] = useState('');
  const [deliveryNoteRef, setDeliveryNoteRef] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [jobId, setJobId] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedByName, setReceivedByName] = useState(userDisplayName || 'Stores');
  const [conditionStatus, setConditionStatus] =
    useState<GoodsReceiptCondition>('Accepted');
  const [postToInventory, setPostToInventory] = useState(true);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftGrnLine[]>([
    {
      inventoryItemId: '',
      sku: '',
      description: '',
      quantityOrdered: '1',
      quantityReceived: '1',
      unit: 'Pcs',
      unitCost: '0',
    },
  ]);
  const [saving, setSaving] = useState(false);

  // Inspect modal edit state
  const [editCondition, setEditCondition] = useState<GoodsReceiptCondition>('Accepted');
  const [editSupInvId, setEditSupInvId] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [updatingGrn, setUpdatingGrn] = useState(false);

  const canInspectUpdate =
    role === 'management' || role === 'production' || role === 'accounts';

  const metrics = useMemo(() => {
    const totalCount = goodsReceipts.length;
    const acceptedCount = goodsReceipts.filter(
      (g) => g.conditionStatus === 'Accepted'
    ).length;
    const issueCount = goodsReceipts.filter(
      (g) =>
        g.conditionStatus === 'Partial / Short' ||
        g.conditionStatus === 'Damaged / Rejected'
    ).length;
    const totalValue = round2(
      goodsReceipts
        .filter((g) => g.conditionStatus !== 'Damaged / Rejected')
        .reduce((acc, g) => acc + (g.totalValue || 0), 0)
    );
    return { totalCount, acceptedCount, issueCount, totalValue };
  }, [goodsReceipts]);

  const filteredGrns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return goodsReceipts.filter((g) => {
      if (conditionFilter !== 'All' && g.conditionStatus !== conditionFilter) {
        return false;
      }
      if (!q) return true;
      return (
        g.grnNumber.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q) ||
        (g.deliveryNoteRef || '').toLowerCase().includes(q) ||
        (g.supplierInvoiceNo || '').toLowerCase().includes(q) ||
        (g.jobNumber || '').toLowerCase().includes(q) ||
        g.receivedByName.toLowerCase().includes(q)
      );
    });
  }, [goodsReceipts, conditionFilter, searchQuery]);

  const draftTotalValue = useMemo(() => {
    return round2(
      lines.reduce((acc, line) => {
        const qty = Math.max(0, Number(line.quantityReceived) || 0);
        const cost = Math.max(0, Number(line.unitCost) || 0);
        return acc + qty * cost;
      }, 0)
    );
  }, [lines]);

  const resetCreateForm = () => {
    setSupplierName('');
    setDeliveryNoteRef('');
    setSupplierInvoiceId('');
    setSupplierInvoiceNo('');
    setJobId('');
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setReceivedByName(userDisplayName || 'Stores');
    setConditionStatus('Accepted');
    setPostToInventory(true);
    setNotes('');
    setLines([
      {
        inventoryItemId: '',
        sku: '',
        description: '',
        quantityOrdered: '1',
        quantityReceived: '1',
        unit: 'Pcs',
        unitCost: '0',
      },
    ]);
  };

  const handlePrefillFromSupplierInvoice = (supInvId: string) => {
    setSupplierInvoiceId(supInvId);
    const inv = supplierInvoices.find((s) => s.id === supInvId);
    if (!inv) {
      setSupplierInvoiceNo('');
      return;
    }
    setSupplierName(inv.supplierName);
    setSupplierInvoiceNo(inv.supplierInvoiceNo || inv.recordNumber);
    if (inv.jobId) setJobId(inv.jobId);
    if (
      inv.lines.length > 0 &&
      lines.length === 1 &&
      !lines[0].description.trim()
    ) {
      setLines(
        inv.lines.slice(0, 10).map((l) => ({
          inventoryItemId: '',
          sku: '',
          description: l.description,
          quantityOrdered: String(l.quantity),
          quantityReceived: String(l.quantity),
          unit: 'Pcs',
          unitCost: String(l.unitPrice),
        }))
      );
    }
  };

  const handleLineInventoryPick = (idx: number, itemId: string) => {
    const item = inventoryItems.find((i) => i.id === itemId);
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        if (!item) {
          return { ...row, inventoryItemId: '', sku: '' };
        }
        return {
          ...row,
          inventoryItemId: item.id,
          sku: item.sku,
          description: item.name,
          unit: item.unit,
          unitCost: String(item.unitCost),
        };
      })
    );
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || lines.length === 0) return;
    const chosenJob = jobs.find((j) => j.id === jobId);
    const chosenSupInv = supplierInvoices.find((s) => s.id === supplierInvoiceId);

    const parsedLines: GoodsReceiptLine[] = lines.slice(0, 10).map((l) => ({
      inventoryItemId: l.inventoryItemId,
      sku: l.sku.trim(),
      description: l.description.trim() || 'Delivered Item',
      quantityOrdered: Math.max(0, Number(l.quantityOrdered) || 0),
      quantityReceived: Math.max(0, Number(l.quantityReceived) || 0),
      unit: l.unit.trim() || 'Pcs',
      unitCost: Math.max(0, Number(l.unitCost) || 0),
    }));

    setSaving(true);
    try {
      const nextNo = `GRN-${new Date().getFullYear()}-${String(
        1 + goodsReceipts.length
      ).padStart(3, '0')}`;
      await onCreateGoodsReceipt({
        grnNumber: nextNo,
        supplierName: supplierName.trim(),
        deliveryNoteRef: deliveryNoteRef.trim(),
        supplierInvoiceId: chosenSupInv?.id || '',
        supplierInvoiceNo:
          chosenSupInv?.supplierInvoiceNo ||
          chosenSupInv?.recordNumber ||
          supplierInvoiceNo.trim(),
        jobId: chosenJob?.id || '',
        jobNumber: chosenJob?.jobNumber || '',
        receivedDate,
        receivedByName: receivedByName.trim() || userDisplayName || 'Stores',
        conditionStatus,
        items: parsedLines,
        postToInventory:
          postToInventory && conditionStatus !== 'Damaged / Rejected',
        notes: notes.trim(),
      });
      resetCreateForm();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const openInspectModal = (grn: GoodsReceipt) => {
    setSelectedGrn(grn);
    setEditCondition(grn.conditionStatus);
    setEditSupInvId(grn.supplierInvoiceId || '');
    setEditNotes(grn.notes || '');
  };

  const handleUpdateSelectedGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrn) return;
    const chosenSupInv = supplierInvoices.find((s) => s.id === editSupInvId);
    setUpdatingGrn(true);
    try {
      await onUpdateGoodsReceipt(selectedGrn.id, {
        conditionStatus: editCondition,
        supplierInvoiceId: chosenSupInv?.id || '',
        supplierInvoiceNo:
          chosenSupInv?.supplierInvoiceNo || chosenSupInv?.recordNumber || '',
        notes: editNotes.trim(),
      });
      setSelectedGrn({
        ...selectedGrn,
        conditionStatus: editCondition,
        supplierInvoiceId: chosenSupInv?.id || '',
        supplierInvoiceNo:
          chosenSupInv?.supplierInvoiceNo || chosenSupInv?.recordNumber || '',
        notes: editNotes.trim(),
      });
    } finally {
      setUpdatingGrn(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      [
        'GRN #',
        'Received Date',
        'Supplier Name',
        'Delivery Note #',
        'Supplier Invoice #',
        'Job #',
        'Condition',
        'Received By',
        'Posted to Stock',
        'Total Value',
        'Line Count',
      ],
      ...filteredGrns.map((g) => [
        g.grnNumber,
        g.receivedDate,
        g.supplierName,
        g.deliveryNoteRef || '',
        g.supplierInvoiceNo || '',
        g.jobNumber || '',
        g.conditionStatus,
        g.receivedByName,
        g.postToInventory ? 'Yes' : 'No',
        g.totalValue.toFixed(2),
        String(g.items.length),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `megaprint-goods-received-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Total GRNs Logged</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {metrics.totalCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Supplier delivery &amp; waybill notes
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Accepted Deliveries</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
            {metrics.acceptedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Passed quantity &amp; quality check
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">
            Partial / Rejected Holds
          </div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              metrics.issueCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {metrics.issueCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Shortages or damaged deliveries flagged
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Total Value Received</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {formatMoney(metrics.totalValue, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Excludes damaged / rejected notes
          </div>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', ...CONDITIONS] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setConditionFilter(status)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                conditionFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GRN #, supplier, waybill..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Record Goods Received</span>
          </button>
        </div>
      </div>

      {/* GRN Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                <th className="py-3 px-4">GRN # &amp; Date</th>
                <th className="py-3 px-4">Supplier &amp; Delivery Note</th>
                <th className="py-3 px-4">Linked Job / Tax Inv</th>
                <th className="py-3 px-4">Items &amp; Inspector</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4 text-right">Received Value</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredGrns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No Goods Received Notes match your current filter. Record supplier
                    deliveries to log inspections and update warehouse stock.
                  </td>
                </tr>
              ) : (
                filteredGrns.map((grn) => (
                  <tr key={grn.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono-nums font-semibold text-slate-900">
                        {grn.grnNumber}
                      </div>
                      <div className="font-mono-nums text-[11px] text-slate-500 mt-0.5">
                        {grn.receivedDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="font-medium text-slate-900">{grn.supplierName}</div>
                      <div className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                        {grn.deliveryNoteRef
                          ? `DN / Waybill: ${grn.deliveryNoteRef}`
                          : 'No waybill ref'}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="text-slate-800 font-mono-nums">
                        {grn.jobNumber || 'General Stock'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                        {grn.supplierInvoiceNo
                          ? `Inv: ${grn.supplierInvoiceNo}`
                          : 'Unmatched to Tax Inv'}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="text-slate-800">
                        <span className="font-mono-nums font-semibold">
                          {grn.items.length}
                        </span>{' '}
                        {grn.items.length === 1 ? 'line item' : 'line items'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        By {grn.receivedByName}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <StatusText status={grn.conditionStatus} />
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {grn.postToInventory ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Posted to Stock
                          </span>
                        ) : (
                          <span>Not posted to stock</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top text-right font-mono-nums font-semibold text-slate-900">
                      {formatMoney(grn.totalValue, settings.currency)}
                    </td>
                    <td className="py-3 px-4 align-top text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openInspectModal(grn)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-medium"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Inspect</span>
                        </button>
                        {role === 'management' && (
                          <button
                            type="button"
                            onClick={() => onDeleteGoodsReceipt(grn.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete GRN"
                            aria-label={`Delete ${grn.grnNumber}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create GRN Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-lg max-w-4xl w-full max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Record Goods Received Note (GRN)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify incoming supplier quantities and optionally post accepted stock
                  to Inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              className="p-6 overflow-y-auto space-y-5 text-xs"
            >
              {supplierInvoices.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
                  <label className="block font-medium text-slate-700 mb-1">
                    Prefill from Recorded Supplier Tax Invoice (Optional)
                  </label>
                  <select
                    value={supplierInvoiceId}
                    onChange={(e) => handlePrefillFromSupplierInvoice(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-xs"
                  >
                    <option value="">— Manual entry / No supplier invoice yet —</option>
                    {supplierInvoices.map((si) => (
                      <option key={si.id} value={si.id}>
                        {si.recordNumber} · {si.supplierName} ({si.supplierInvoiceNo}) —{' '}
                        {formatMoney(si.grossAmount, settings.currency)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. David Whitehead Textiles Zimbabwe"
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Delivery Note / Waybill #
                  </label>
                  <input
                    type="text"
                    value={deliveryNoteRef}
                    onChange={(e) => setDeliveryNoteRef(e.target.value)}
                    placeholder="e.g. DN-DW-8812"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Supplier Invoice # (If Known)
                  </label>
                  <input
                    type="text"
                    value={supplierInvoiceNo}
                    onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                    placeholder="e.g. FDMS-DW-44910"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Received Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Inspected / Received By *
                  </label>
                  <input
                    type="text"
                    required
                    value={receivedByName}
                    onChange={(e) => setReceivedByName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Allocate to Job (Optional)
                  </label>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    <option value="">General Warehouse Stock</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} · {j.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Receiving Inspection Condition
                  </label>
                  <select
                    value={conditionStatus}
                    onChange={(e) => {
                      const next = e.target.value as GoodsReceiptCondition;
                      setConditionStatus(next);
                      if (next === 'Damaged / Rejected') {
                        setPostToInventory(false);
                      }
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-start gap-2.5 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      postToInventory && conditionStatus !== 'Damaged / Rejected'
                    }
                    disabled={conditionStatus === 'Damaged / Rejected'}
                    onChange={(e) => setPostToInventory(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>
                    <span className="font-semibold text-slate-800 block">
                      Post accepted quantities to Inventory stock
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Automatically increments matched Inventory SKUs &amp; logs Stock In
                      movements.
                    </span>
                  </span>
                </label>
              </div>

              {/* Line Items */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    Delivered Line Items (Max 10)
                  </span>
                  {lines.length < 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) => [
                          ...prev,
                          {
                            inventoryItemId: '',
                            sku: '',
                            description: '',
                            quantityOrdered: '1',
                            quantityReceived: '1',
                            unit: 'Pcs',
                            unitCost: '0',
                          },
                        ])
                      }
                      className="text-blue-600 hover:text-blue-700 font-semibold"
                    >
                      + Add Line
                    </button>
                  )}
                </div>

                <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
                  {lines.map((line, idx) => (
                    <div key={idx} className="p-3 space-y-2.5 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                        <div className="md:col-span-4">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Link Inventory SKU (Optional)
                          </label>
                          <select
                            value={line.inventoryItemId}
                            onChange={(e) => handleLineInventoryPick(idx, e.target.value)}
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 bg-white"
                          >
                            <option value="">Custom / Non-inventory item</option>
                            {inventoryItems.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.sku} · {item.name} ({item.quantityOnHand} {item.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-8">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Item Description *
                          </label>
                          <input
                            type="text"
                            required
                            value={line.description}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, description: e.target.value } : r
                                )
                              )
                            }
                            placeholder="Material, ink, fabric roll, or sample description"
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Ordered
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantityOrdered}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, quantityOrdered: e.target.value }
                                    : r
                                )
                              )
                            }
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 font-mono-nums"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Received *
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            required
                            value={line.quantityReceived}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx
                                    ? { ...r, quantityReceived: e.target.value }
                                    : r
                                )
                              )
                            }
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 font-mono-nums"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Unit
                          </label>
                          <input
                            type="text"
                            value={line.unit}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, unit: e.target.value } : r
                                )
                              )
                            }
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] text-slate-500 mb-1">
                            Unit Cost ({settings.currency})
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitCost}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((r, i) =>
                                  i === idx ? { ...r, unitCost: e.target.value } : r
                                )
                              )
                            }
                            className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 font-mono-nums"
                          />
                        </div>
                        <div className="sm:col-span-2 text-right pb-1.5 font-mono-nums font-semibold text-slate-800">
                          {formatMoney(
                            (Number(line.quantityReceived) || 0) *
                              (Number(line.unitCost) || 0),
                            settings.currency
                          )}
                        </div>
                        <div className="sm:col-span-1 text-right">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setLines((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 text-slate-400 hover:text-red-600"
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Inspection Notes / Discrepancy Remarks
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condition of packaging, dye lot / shade check, backorder notes..."
                  className="w-full border border-slate-200 rounded-md px-3 py-2"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
                <div className="text-sm font-semibold text-slate-900 font-mono-nums">
                  Total Received Value:{' '}
                  {formatMoney(draftTotalValue, settings.currency)}
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Recording GRN...' : 'Save Goods Received Note'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect / Print GRN Modal */}
      {selectedGrn && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg max-w-3xl w-full max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between no-print">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="font-display text-base font-bold text-slate-900 font-mono-nums">
                    {selectedGrn.grnNumber}
                  </h2>
                  <StatusText status={selectedGrn.conditionStatus} />
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedGrn.supplierName} · Received {selectedGrn.receivedDate}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print GRN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGrn(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5">
                <div>
                  <div className="text-[11px] text-slate-500">Supplier</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {selectedGrn.supplierName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Delivery Note / Waybill</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedGrn.deliveryNoteRef || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Linked Job</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedGrn.jobNumber || 'General Stock'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Linked Tax Invoice</div>
                  <div className="font-mono-nums font-medium text-slate-900 mt-0.5">
                    {selectedGrn.supplierInvoiceNo || 'Unmatched'}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500">
                      <th className="py-2.5 px-3">SKU &amp; Description</th>
                      <th className="py-2.5 px-3 text-right">Ordered</th>
                      <th className="py-2.5 px-3 text-right">Received</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Line Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedGrn.items.map((item, i) => {
                      const diff = round2(item.quantityReceived - item.quantityOrdered);
                      return (
                        <tr key={i}>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-900">
                              {item.description}
                            </div>
                            {item.sku && (
                              <div className="font-mono-nums text-[11px] text-slate-500">
                                SKU: {item.sku}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-nums text-slate-600">
                            {item.quantityOrdered} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-nums font-semibold text-slate-900">
                            {item.quantityReceived} {item.unit}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono-nums font-medium ${
                              diff < 0
                                ? 'text-amber-700'
                                : diff > 0
                                  ? 'text-blue-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {diff === 0 ? 'Match' : diff > 0 ? `+${diff}` : diff}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-nums text-slate-600">
                            {formatMoney(item.unitCost, settings.currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-nums font-semibold text-slate-900">
                            {formatMoney(
                              item.quantityReceived * item.unitCost,
                              settings.currency
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                      <td colSpan={5} className="py-2.5 px-3 text-right text-slate-700">
                        Total GRN Value
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-nums text-slate-900">
                        {formatMoney(selectedGrn.totalValue, settings.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {canInspectUpdate && (
                <form
                  onSubmit={handleUpdateSelectedGrn}
                  className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3 no-print"
                >
                  <div className="font-semibold text-slate-900">
                    Update Inspection Status &amp; Invoice Match
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Condition Status
                      </label>
                      <select
                        value={editCondition}
                        onChange={(e) =>
                          setEditCondition(e.target.value as GoodsReceiptCondition)
                        }
                        className="w-full border border-slate-200 rounded-md px-3 py-1.5 bg-white"
                      >
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Match Supplier Tax Invoice
                      </label>
                      <select
                        value={editSupInvId}
                        onChange={(e) => setEditSupInvId(e.target.value)}
                        className="w-full border border-slate-200 rounded-md px-3 py-1.5 bg-white"
                      >
                        <option value="">Not matched</option>
                        {supplierInvoices.map((si) => (
                          <option key={si.id} value={si.id}>
                            {si.recordNumber} · {si.supplierInvoiceNo} (
                            {si.supplierName})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full border border-slate-200 rounded-md px-3 py-1.5 bg-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={updatingGrn}
                      className="px-3.5 py-1.5 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-800 disabled:opacity-50"
                    >
                      {updatingGrn ? 'Updating...' : 'Save Inspection Update'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
