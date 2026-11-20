import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  History,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CompanySettings,
  InventoryItem,
  InventoryItemType,
  InventoryMovement,
  InventoryMovementType,
  Job,
  UserRole,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { getNetIssuedQuantityForJob } from '../utils/inventoryAccounting';
import { StatusText } from './StatusText';

interface InventoryViewProps {
  role: UserRole;
  settings: CompanySettings;
  inventoryItems: InventoryItem[];
  inventoryMovements?: InventoryMovement[];
  jobs: Job[];
  onCreateInventoryItem: (
    input: Omit<
      InventoryItem,
      'id' | 'status' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<string | undefined>;
  onAdjustInventoryStock: (params: {
    item: InventoryItem;
    movementType: InventoryMovementType;
    quantityChange: number;
    unitCostOverride?: number;
    movementDate?: string;
    jobId?: string;
    jobNumber?: string;
    targetLocation?: string;
    recipientOrReason: string;
    sampleClientOrSpec?: string;
  }) => Promise<void>;
  onDeleteInventoryItem: (itemId: string) => Promise<void>;
  subscribeInventoryMovements: (
    itemId: string,
    cb: (entries: InventoryMovement[]) => void
  ) => () => void;
}

const ITEM_TYPES: InventoryItemType[] = [
  'Consumable',
  'Substrate & Fabric',
  'Sample',
  'Packaging & Trims',
  'Finished Stock',
];

const MOVEMENT_TYPES: InventoryMovementType[] = [
  'Stock In',
  'Issue to Job',
  'Material Return',
  'Location Transfer',
  'Sample Out',
  'Sample Return',
  'Adjustment',
];

export const InventoryView: React.FC<InventoryViewProps> = ({
  role,
  settings,
  inventoryItems,
  inventoryMovements = [],
  jobs,
  onCreateInventoryItem,
  onAdjustInventoryStock,
  onDeleteInventoryItem,
  subscribeInventoryMovements,
}) => {
  const [typeFilter, setTypeFilter] = useState<'All' | InventoryItemType | 'Low Stock'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  // Create item form state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [itemType, setItemType] = useState<InventoryItemType>('Consumable');
  const [unit, setUnit] = useState('Litres');
  const [quantityOnHand, setQuantityOnHand] = useState('0');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [unitCost, setUnitCost] = useState('0');
  const [location, setLocation] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [sampleClientOrSpec, setSampleClientOrSpec] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Stock adjustment modal state
  const [movementType, setMovementType] = useState<InventoryMovementType>('Issue to Job');
  const [quantityChange, setQuantityChange] = useState('1');
  const [movementDate, setMovementDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [movUnitCost, setMovUnitCost] = useState('');
  const [targetLocation, setTargetLocation] = useState('');
  const [movJobId, setMovJobId] = useState('');
  const [recipientOrReason, setRecipientOrReason] = useState('');
  const [movSampleSpec, setMovSampleSpec] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (!historyTarget) {
      setMovements([]);
      return;
    }
    const unsub = subscribeInventoryMovements(historyTarget.id, setMovements);
    return () => unsub();
  }, [historyTarget, subscribeInventoryMovements]);

  const metrics = useMemo(() => {
    const totalSkus = inventoryItems.length;
    const alertsCount = inventoryItems.filter(
      (i) => i.status === 'Low Stock' || i.status === 'Out of Stock'
    ).length;
    const samplesCount = inventoryItems
      .filter((i) => i.itemType === 'Sample')
      .reduce((acc, i) => acc + (i.quantityOnHand || 0), 0);
    const totalValuation = round2(
      inventoryItems.reduce(
        (acc, i) => acc + (i.quantityOnHand || 0) * (i.unitCost || 0),
        0
      )
    );
    return {
      totalSkus,
      alertsCount,
      samplesCount,
      totalValuation,
    };
  }, [inventoryItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (typeFilter === 'Low Stock') {
        if (item.status !== 'Low Stock' && item.status !== 'Out of Stock') return false;
      } else if (typeFilter !== 'All' && item.itemType !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.sku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.supplierName || '').toLowerCase().includes(q) ||
        (item.sampleClientOrSpec || '').toLowerCase().includes(q)
      );
    });
  }, [inventoryItems, typeFilter, searchQuery]);

  const resetCreateForm = () => {
    setSku('');
    setName('');
    setItemType('Consumable');
    setUnit('Pcs');
    setQuantityOnHand('0');
    setReorderLevel('5');
    setUnitCost('0');
    setLocation('');
    setSupplierName('');
    setSampleClientOrSpec('');
    setNotes('');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) return;
    setSaving(true);
    try {
      await onCreateInventoryItem({
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        itemType,
        unit: unit.trim() || 'Pcs',
        quantityOnHand: Math.max(0, Number(quantityOnHand) || 0),
        reorderLevel: Math.max(0, Number(reorderLevel) || 0),
        unitCost: Math.max(0, Number(unitCost) || 0),
        location: location.trim(),
        supplierName: supplierName.trim(),
        sampleClientOrSpec: sampleClientOrSpec.trim(),
        notes: notes.trim(),
      });
      resetCreateForm();
      setShowCreate(false);
    } finally {
      setSaving(false);
    }
  };

  const selectedReturnJobStats = useMemo(() => {
    if (!adjustTarget || !movJobId || movementType !== 'Material Return') return null;
    return getNetIssuedQuantityForJob({
      itemId: adjustTarget.id,
      jobId: movJobId,
      movements: inventoryMovements,
    });
  }, [adjustTarget, movJobId, movementType, inventoryMovements]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setAdjustError(null);
    const delta = Number(quantityChange);
    if (!delta || Number.isNaN(delta)) {
      setAdjustError('Please enter a valid non-zero quantity.');
      return;
    }
    const chosenJob = jobs.find((j) => j.id === movJobId);
    const parsedOverride =
      movementType === 'Stock In' && movUnitCost.trim() !== ''
        ? Number(movUnitCost)
        : undefined;
    if (
      movementType === 'Stock In' &&
      parsedOverride !== undefined &&
      (!Number.isFinite(parsedOverride) || parsedOverride < 0)
    ) {
      setAdjustError('Receipt unit cost cannot be negative or invalid.');
      return;
    }
    setAdjusting(true);
    try {
      await onAdjustInventoryStock({
        item: adjustTarget,
        movementType,
        quantityChange: delta,
        unitCostOverride: parsedOverride,
        movementDate,
        jobId: chosenJob?.id || '',
        jobNumber: chosenJob?.jobNumber || '',
        targetLocation:
          movementType === 'Location Transfer' ? targetLocation.trim() : undefined,
        recipientOrReason: recipientOrReason.trim() || movementType,
        sampleClientOrSpec:
          adjustTarget.itemType === 'Sample' ? movSampleSpec.trim() : undefined,
      });
      setAdjustTarget(null);
      setQuantityChange('1');
      setMovUnitCost('');
      setTargetLocation('');
      setMovJobId('');
      setRecipientOrReason('');
      setMovSampleSpec('');
      setAdjustError(null);
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : 'Unable to record stock movement.'
      );
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Tracked SKUs</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {metrics.totalSkus}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Consumables, fabrics, trims &amp; samples
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Reorder &amp; Stock Alerts</div>
          <div
            className={`mt-2 font-mono-nums text-2xl font-semibold ${
              metrics.alertsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {metrics.alertsCount} items
          </div>
          <div className="mt-1 text-xs text-slate-500">
            At or below reorder threshold
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Showroom &amp; Client Samples</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {metrics.samplesCount.toLocaleString()} units
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {inventoryItems.filter((i) => i.itemType === 'Sample').length} sample kits &amp;
            swatches
          </div>
        </div>

        {role !== 'production' ? (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">Stock Valuation (Cost)</div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {formatMoney(metrics.totalValuation, settings.currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              On-hand inventory asset value
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">Healthy Stock SKUs</div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
              {inventoryItems.filter((i) => i.status === 'In Stock').length}
            </div>
            <div className="mt-1 text-xs text-slate-500">Ready for workshop issue</div>
          </div>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {(['All', ...ITEM_TYPES, 'Low Stock'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTypeFilter(tab)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'Low Stock' ? 'Low / Out of Stock' : tab}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SKU, item, bin location..."
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-md text-xs text-slate-900 w-56 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            resetCreateForm();
            setShowCreate(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Stock / Sample Item</span>
        </button>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            No inventory consumables or samples match this view. Click &ldquo;Add Stock /
            Sample Item&rdquo; to register inks, substrates, fabrics, trims, or showroom
            samples.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Item &amp; Details</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">On Hand</th>
                  <th className="py-2.5 px-4 text-right">Reorder At</th>
                  {role !== 'production' && (
                    <th className="py-2.5 px-4 text-right">Stock Value</th>
                  )}
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => {
                  const val = round2(item.quantityOnHand * item.unitCost);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-nums text-xs font-semibold text-blue-700 whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-3 px-4 min-w-[220px]">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500">
                          {item.sampleClientOrSpec || item.supplierName || item.notes || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {item.itemType}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {item.location || 'Main Store'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={item.status} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {item.quantityOnHand} {item.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-500 whitespace-nowrap">
                        {item.reorderLevel} {item.unit}
                      </td>
                      {role !== 'production' && (
                        <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-800 whitespace-nowrap">
                          {formatMoney(val, settings.currency)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustTarget(item);
                              setMovementType(
                                item.itemType === 'Sample'
                                  ? 'Sample Out'
                                  : 'Issue to Job'
                              );
                              setQuantityChange('1');
                              setMovementDate(new Date().toISOString().slice(0, 10));
                              setMovUnitCost(String(item.unitCost || 0));
                              setTargetLocation(item.location || '');
                              setMovJobId('');
                              setRecipientOrReason('');
                              setAdjustError(null);
                              setMovSampleSpec(item.sampleClientOrSpec || '');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            <span>Move Stock</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="View movement history"
                            aria-label="View movement history"
                          >
                            <History className="h-4 w-4" />
                          </button>
                          {role === 'management' && (
                            <button
                              type="button"
                              onClick={() => onDeleteInventoryItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Delete inventory item"
                              aria-label="Delete inventory item"
                            >
                              <Trash2 className="h-4 w-4" />
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

      {/* Add Inventory / Sample Item Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Register Inventory Consumable or Sample
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    SKU / Item Code
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. INK-UV-WHT"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Item Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. UV White Ink 1L / Embroidered Polo Sample Kit"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Item Category
                  </label>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value as InventoryItemType)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit of Measure
                  </label>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Litres, Meters, Rolls, Kits, Pcs"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Storage / Bin Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Print Bay Shelf A1"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Opening Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={quantityOnHand}
                    onChange={(e) => setQuantityOnHand(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reorder Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Unit Cost ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Preferred Supplier
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. ProPaper & Ink Distributors"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sample Spec / Assigned Client (For Samples)
                  </label>
                  <input
                    type="text"
                    value={sampleClientOrSpec}
                    onChange={(e) => setSampleClientOrSpec(e.target.value)}
                    placeholder="e.g. Checked out to Savannah Logistics for sizing"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Compatibility, GSM weight, thread colors, or handling notes"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement / Sample Checkout Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Move Stock — {adjustTarget.sku}
                </h2>
                <p className="text-xs text-slate-500">
                  {adjustTarget.name} · Current: {adjustTarget.quantityOnHand}{' '}
                  {adjustTarget.unit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-4">
              {adjustError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {adjustError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Movement Type
                  </label>
                  <select
                    value={movementType}
                    onChange={(e) => {
                      setMovementType(e.target.value as InventoryMovementType);
                      setAdjustError(null);
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {MOVEMENT_TYPES.map((mt) => (
                      <option key={mt} value={mt}>
                        {mt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Movement Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={movementDate}
                    onChange={(e) => setMovementDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={movementType === 'Stock In' ? '' : 'sm:col-span-2'}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Quantity ({adjustTarget.unit})
                    {movementType === 'Adjustment' && ' (use negative to reduce)'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={quantityChange}
                    onChange={(e) => {
                      setQuantityChange(e.target.value);
                      setAdjustError(null);
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>

                {movementType === 'Stock In' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Receipt Unit Cost ({settings.currency})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={movUnitCost}
                      onChange={(e) => {
                        setMovUnitCost(e.target.value);
                        setAdjustError(null);
                      }}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                    />
                  </div>
                )}
              </div>

              {movementType === 'Location Transfer' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Destination Bin / Warehouse Location *
                  </label>
                  <input
                    type="text"
                    required
                    value={targetLocation}
                    onChange={(e) => setTargetLocation(e.target.value)}
                    placeholder="e.g. Print Bay B2 or Finishing Store"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    Internal transfers relocate stock between bins without affecting
                    total quantity on hand or Cost of Goods Sold (COGS).
                  </p>
                </div>
              )}

              {(movementType === 'Issue to Job' ||
                movementType === 'Material Return' ||
                movementType === 'Sample Out') && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Job Reference{' '}
                    {movementType === 'Material Return' ? '(Recommended)' : '(Optional)'}
                  </label>
                  <select
                    value={movJobId}
                    onChange={(e) => {
                      setMovJobId(e.target.value);
                      setAdjustError(null);
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">No specific job</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.jobNumber} — {j.title}
                      </option>
                    ))}
                  </select>
                  {movementType === 'Material Return' && selectedReturnJobStats && (
                    <div className="text-[11px] text-slate-600 font-mono-nums">
                      Issued to job: {selectedReturnJobStats.issuedQty} {adjustTarget.unit} ·
                      Returned: {selectedReturnJobStats.returnedQty} {adjustTarget.unit} ·
                      Max returnable: <strong>{selectedReturnJobStats.netIssuedQty} {adjustTarget.unit}</strong>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Recipient / Reason
                </label>
                <input
                  type="text"
                  required
                  value={recipientOrReason}
                  onChange={(e) => setRecipientOrReason(e.target.value)}
                  placeholder="e.g. Issued to Embroidery Bay / Unused material returned from job"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>

              {adjustTarget.itemType === 'Sample' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Update Sample Holder / Client Status
                  </label>
                  <input
                    type="text"
                    value={movSampleSpec}
                    onChange={(e) => setMovSampleSpec(e.target.value)}
                    placeholder="e.g. Returned to showroom / With client for sizing"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {adjusting ? 'Updating...' : 'Record Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Stock Ledger — {historyTarget.sku}
                </h2>
                <p className="text-xs text-slate-500">
                  {historyTarget.name} · Current Balance: {historyTarget.quantityOnHand}{' '}
                  {historyTarget.unit}
                  {role !== 'production' && (
                    <>
                      {' '}
                      · Avg Cost:{' '}
                      <span className="font-mono-nums font-medium text-slate-700">
                        {formatMoney(historyTarget.unitCost, settings.currency)}/{historyTarget.unit}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {movements.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  No stock movements logged for this item yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3">Date &amp; Movement</th>
                        <th className="py-2 px-3">Recipient / Reason</th>
                        <th className="py-2 px-3">By</th>
                        <th className="py-2 px-3 text-right">Delta</th>
                        {role !== 'production' && (
                          <th className="py-2 px-3 text-right">Cost</th>
                        )}
                        <th className="py-2 px-3 text-right">Resulting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movements.map((mov) => (
                        <tr key={mov.id}>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            <div>{mov.movementType}</div>
                            {mov.movementDate && (
                              <div className="text-[11px] font-mono-nums text-slate-400">
                                {mov.movementDate}
                              </div>
                            )}
                            {mov.jobNumber && (
                              <div className="text-[11px] font-mono-nums text-blue-700">
                                Job {mov.jobNumber}
                              </div>
                            )}
                            {mov.movementType === 'Location Transfer' &&
                              mov.locationTo && (
                                <div className="text-[11px] text-slate-500">
                                  {mov.locationFrom || 'Store'} → {mov.locationTo}
                                </div>
                              )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {mov.recipientOrReason}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {mov.loggedByName}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono-nums font-semibold ${
                              mov.quantityDelta > 0
                                ? 'text-emerald-700'
                                : mov.quantityDelta < 0
                                  ? 'text-red-700'
                                  : 'text-slate-600'
                            }`}
                          >
                            {mov.movementType === 'Location Transfer'
                              ? `${mov.movedQuantity ?? 0} ${historyTarget.unit} (Transfer)`
                              : `${mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta} ${historyTarget.unit}`}
                          </td>
                          {role !== 'production' && (
                            <td className="py-2.5 px-3 text-right font-mono-nums text-slate-700">
                              {mov.movementType === 'Location Transfer' ? (
                                <span className="text-slate-400">No COGS</span>
                              ) : (
                                <>
                                  <div>
                                    {formatMoney(mov.totalCost ?? 0, settings.currency)}
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    @{formatMoney(mov.unitCost ?? 0, settings.currency)}
                                  </div>
                                </>
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-right font-mono-nums text-slate-900">
                            {mov.resultingQty} {historyTarget.unit}
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
      )}
    </div>
  );
};
