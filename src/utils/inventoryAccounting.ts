import {
  CashBookEntry,
  Expense,
  GoodsReceipt,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  Invoice,
  InvoiceLine,
  Job,
  JobCostEntry,
  PayrollRun,
  SupplierInvoice,
  SupplierInvoiceCategory,
} from '../types/erp';
import { round2 } from './vat';

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round((Math.abs(value) + Number.EPSILON) * 10000)) / 10000;
  return rounded === 0 ? 0 : rounded;
}

export const COGS_SUPPLIER_CATEGORIES: ReadonlyArray<SupplierInvoiceCategory> = [
  'Materials & Substrates',
  'Tailoring & Trims',
  'Subcontracting & Finishing',
];

export const COGS_EXPENSE_CATEGORIES: ReadonlyArray<Expense['category']> = [
  'Materials & Substrates',
  'Tailoring & Trims',
];

export interface SupplierLineClassification {
  lineIndex: number;
  treatment: 'stock' | 'expense';
  reason: 'explicit_line' | 'sku_linked' | 'accepted_grn_link' | 'default_expense';
  effectiveCost: number;
  capitalizedCost: number;
  claimableVat: number;
  inventoryItemId?: string;
  sku?: string;
}

/**
 * Effective cost of a supplier bill line for either inventory capitalization or P&L expense:
 * - If VAT is standard AND invoice isVatClaimable is true, cost is netAmount (VAT goes to Claimable Input VAT).
 * - If VAT is NOT claimable (non-recoverable VAT), VAT is capitalized into stock or expensed into P&L (grossAmount).
 * - Zero-rated and exempt lines have 0 VAT so cost == netAmount.
 */
export function computeSupplierLineEffectiveCost(params: {
  line: Pick<InvoiceLine, 'vatTreatment' | 'netAmount' | 'vatAmount' | 'grossAmount'>;
  isVatClaimable: boolean;
}): { effectiveCost: number; claimableVat: number } {
  const net = round2(Math.max(0, Number(params.line.netAmount) || 0));
  const vat = round2(Math.max(0, Number(params.line.vatAmount) || 0));
  const gross = round2(Math.max(0, Number(params.line.grossAmount) || net + vat));

  if (params.line.vatTreatment === 'standard' && params.isVatClaimable) {
    return {
      effectiveCost: net,
      claimableVat: vat,
    };
  }

  // Non-claimable VAT is part of actual acquisition cost (capitalized into stock or expensed)
  const effective = vat > 0 ? round2(net + vat) : gross > 0 ? gross : net;
  return {
    effectiveCost: effective,
    claimableVat: 0,
  };
}

/**
 * Resolve each supplier invoice line explicitly as 'stock' or 'expense'.
 * IMPORTANT: Never blindly classifies by invoice category or free-text similarity.
 * Precedence per line:
 * 1) Explicit line.costTreatment ('stock' | 'expense')
 * 2) Explicit line.inventoryItemId
 * 3) Accepted postToInventory GRN explicitly linked to this bill + line index (or single-line bill <-> single-line GRN)
 * 4) Default to 'expense' so ordinary bills still hit P&L normally
 */
export function classifySupplierInvoiceLines(
  si: SupplierInvoice,
  goodsReceipts: GoodsReceipt[] = []
): SupplierLineClassification[] {
  const lines = si.lines && si.lines.length > 0
    ? si.lines
    : [
        {
          description: si.supplierInvoiceNo || si.recordNumber,
          quantity: 1,
          unitPrice: si.netAmount,
          vatTreatment: si.vatTreatment,
          netAmount: si.netAmount,
          vatAmount: si.vatAmount,
          grossAmount: si.grossAmount,
        },
      ];

  const acceptedLinkedGrns = goodsReceipts.filter(
    (g) =>
      g.supplierInvoiceId === si.id &&
      g.postToInventory &&
      g.conditionStatus !== 'Damaged / Rejected'
  );

  return lines.map((line, lineIndex) => {
    const { effectiveCost, claimableVat } = computeSupplierLineEffectiveCost({
      line,
      isVatClaimable: si.isVatClaimable,
    });

    if (line.costTreatment === 'stock') {
      return {
        lineIndex,
        treatment: 'stock',
        reason: 'explicit_line',
        effectiveCost,
        capitalizedCost: effectiveCost,
        claimableVat,
        inventoryItemId: line.inventoryItemId,
        sku: line.sku,
      };
    }

    if (line.costTreatment === 'expense') {
      return {
        lineIndex,
        treatment: 'expense',
        reason: 'explicit_line',
        effectiveCost,
        capitalizedCost: 0,
        claimableVat,
        inventoryItemId: line.inventoryItemId,
        sku: line.sku,
      };
    }

    if (line.inventoryItemId) {
      return {
        lineIndex,
        treatment: 'stock',
        reason: 'sku_linked',
        effectiveCost,
        capitalizedCost: effectiveCost,
        claimableVat,
        inventoryItemId: line.inventoryItemId,
        sku: line.sku,
      };
    }

    // Check explicit GRN line-index link (never fuzzy description matching)
    let matchedGrnLine: GoodsReceipt['items'][number] | undefined;
    for (const grn of acceptedLinkedGrns) {
      const explicitLine = grn.items.find(
        (item) => item.supplierInvoiceLineIndex === lineIndex && item.quantityReceived > 0
      );
      if (explicitLine) {
        matchedGrnLine = explicitLine;
        break;
      }
      // Unambiguous 1-to-1 single-line bill and single-SKU GRN fallback when no lineIndex exists yet
      if (
        lines.length === 1 &&
        grn.items.length === 1 &&
        grn.items[0].quantityReceived > 0 &&
        grn.items[0].inventoryItemId
      ) {
        matchedGrnLine = grn.items[0];
        break;
      }
    }

    if (matchedGrnLine) {
      return {
        lineIndex,
        treatment: 'stock',
        reason: 'accepted_grn_link',
        effectiveCost,
        capitalizedCost: effectiveCost,
        claimableVat,
        inventoryItemId: matchedGrnLine.inventoryItemId,
        sku: matchedGrnLine.sku,
      };
    }

    return {
      lineIndex,
      treatment: 'expense',
      reason: 'default_expense',
      effectiveCost,
      capitalizedCost: 0,
      claimableVat,
    };
  });
}

/**
 * Moving Weighted-Average Inventory Valuation on Stock Receipt.
 * Preserves 4-decimal precision for fractional units (e.g. meters) so 40m of $70/50m = $56.00 exactly.
 */
export function computeWeightedAverageReceipt(params: {
  existingQty: number;
  existingUnitCost: number;
  incomingQty: number;
  incomingUnitCost: number;
}): { newQty: number; newUnitCost: number; incomingTotalCost: number; newTotalValue: number } {
  const existingQty = Math.max(0, Number(params.existingQty) || 0);
  const existingUnitCost = Math.max(0, Number(params.existingUnitCost) || 0);
  const incomingQty = Number(params.incomingQty);
  const incomingUnitCost = Number(params.incomingUnitCost);

  if (!Number.isFinite(incomingQty) || incomingQty <= 0) {
    throw new Error('Receipt quantity must be greater than zero.');
  }
  if (!Number.isFinite(incomingUnitCost) || incomingUnitCost < 0) {
    throw new Error('Receipt unit cost cannot be negative or invalid.');
  }

  const existingValue = existingQty * existingUnitCost;
  const incomingTotalCost = round2(incomingQty * incomingUnitCost);
  const newQty = round4(existingQty + incomingQty);
  const newUnitCost =
    newQty > 0 ? round4((existingValue + incomingQty * incomingUnitCost) / newQty) : 0;

  return {
    newQty,
    newUnitCost,
    incomingTotalCost,
    newTotalValue: round2(newQty * newUnitCost),
  };
}

/**
 * Net quantity issued to a specific job for a specific inventory item (issues minus returns).
 */
export function getNetIssuedQuantityForJob(params: {
  itemId: string;
  jobId: string;
  movements: InventoryMovement[];
}): { issuedQty: number; returnedQty: number; netIssuedQty: number; weightedReturnUnitCost: number } {
  const relevant = params.movements.filter(
    (m) => m.itemId === params.itemId && m.jobId === params.jobId
  );

  let issuedQty = 0;
  let issuedValue = 0;
  let returnedQty = 0;
  let returnedValue = 0;

  for (const m of relevant) {
    if (m.movementType === 'Issue to Job') {
      const q = Math.abs(Number(m.movedQuantity ?? m.quantityDelta) || 0);
      const val =
        Number.isFinite(Number(m.totalCost))
          ? Number(m.totalCost)
          : round2(q * (Number(m.unitCost) || 0));
      issuedQty = round4(issuedQty + q);
      issuedValue = round2(issuedValue + val);
    } else if (m.movementType === 'Material Return') {
      const q = Math.abs(Number(m.movedQuantity ?? m.quantityDelta) || 0);
      const val =
        Number.isFinite(Number(m.totalCost))
          ? Number(m.totalCost)
          : round2(q * (Number(m.unitCost) || 0));
      returnedQty = round4(returnedQty + q);
      returnedValue = round2(returnedValue + val);
    }
  }

  const netIssuedQty = round4(Math.max(0, issuedQty - returnedQty));
  const netIssuedValue = Math.max(0, round2(issuedValue - returnedValue));
  const weightedReturnUnitCost =
    netIssuedQty > 0
      ? round4(netIssuedValue / netIssuedQty)
      : issuedQty > 0
        ? round4(issuedValue / issuedQty)
        : 0;

  return { issuedQty, returnedQty, netIssuedQty, weightedReturnUnitCost };
}

export interface StockMovementComputation {
  movementType: InventoryMovementType;
  quantityDelta: number;
  movedQuantity: number;
  resultingQty: number;
  unitCost: number;
  totalCost: number;
  newItemUnitCost: number;
  newLocation: string;
  shouldPostJobCost: boolean;
  jobCostSourceType?: 'stock_issue' | 'stock_return';
  jobCostDelta: number;
}

/**
 * Pure validator & cost calculator for all inventory stock movements:
 * - Stock In / Sample Return / Adjustment (+): weighted-avg updates if positive cost provided on Stock In
 * - Issue to Job: rejects qty <= 0 or qty > onHand; freezes unitCost = item.unitCost; posts job cost
 * - Material Return: rejects qty <= 0 or qty > netIssuedForJob; restores at issue cost; reverses job cost
 * - Sample Out / Adjustment (-): rejects over-draw below 0
 * - Location Transfer: quantityDelta = 0, totalCost = 0, updates location only, NEVER creates COGS
 */
export function validateAndComputeStockMovement(params: {
  item: Pick<InventoryItem, 'id' | 'sku' | 'name' | 'quantityOnHand' | 'unitCost' | 'location'>;
  movementType: InventoryMovementType;
  quantity: number;
  unitCostOverride?: number;
  jobId?: string;
  targetLocation?: string;
  existingMovements?: InventoryMovement[];
  reversedMovement?: InventoryMovement;
}): StockMovementComputation {
  const { item, movementType } = params;
  const qty = Number(params.quantity);
  const onHand = round4(Math.max(0, Number(item.quantityOnHand) || 0));
  const currentUnitCost = round4(Math.max(0, Number(item.unitCost) || 0));

  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Movement quantity must be a finite number greater than zero.');
  }
  if (
    params.unitCostOverride !== undefined &&
    (!Number.isFinite(params.unitCostOverride) || params.unitCostOverride < 0)
  ) {
    throw new Error('Unit cost cannot be negative or invalid.');
  }

  if (movementType === 'Location Transfer') {
    const dest = (params.targetLocation || '').trim();
    if (!dest) {
      throw new Error('Destination location is required for a Location Transfer.');
    }
    if (qty > onHand + 0.0001) {
      throw new Error(
        `Cannot transfer ${qty} of ${item.sku}: only ${onHand} available at ${item.location || 'current location'}.`
      );
    }
    return {
      movementType,
      quantityDelta: 0,
      movedQuantity: round4(qty),
      resultingQty: onHand,
      unitCost: currentUnitCost,
      totalCost: 0, // Pure location transfer must NEVER become COGS
      newItemUnitCost: currentUnitCost,
      newLocation: dest,
      shouldPostJobCost: false,
      jobCostDelta: 0,
    };
  }

  if (movementType === 'Issue to Job') {
    if (qty > onHand + 0.0001) {
      throw new Error(
        `Insufficient stock for ${item.sku} (${item.name}): requested ${qty}, available ${onHand}. Negative stock is blocked.`
      );
    }
    const frozenUnitCost = currentUnitCost;
    const totalCost = round2(qty * frozenUnitCost);
    const resultingQty = round4(Math.max(0, onHand - qty));
    return {
      movementType,
      quantityDelta: round4(-qty),
      movedQuantity: round4(qty),
      resultingQty,
      unitCost: frozenUnitCost,
      totalCost,
      newItemUnitCost: currentUnitCost,
      newLocation: item.location || '',
      shouldPostJobCost: Boolean(params.jobId),
      jobCostSourceType: 'stock_issue',
      jobCostDelta: totalCost,
    };
  }

  if (movementType === 'Material Return') {
    let returnUnitCost = currentUnitCost;
    if (params.reversedMovement && Number.isFinite(Number(params.reversedMovement.unitCost))) {
      returnUnitCost = round4(Math.max(0, Number(params.reversedMovement.unitCost)));
    }
    if (params.jobId && params.existingMovements) {
      const issuedStats = getNetIssuedQuantityForJob({
        itemId: item.id,
        jobId: params.jobId,
        movements: params.existingMovements,
      });
      if (issuedStats.issuedQty > 0 && qty > issuedStats.netIssuedQty + 0.0001) {
        throw new Error(
          `Cannot return ${qty} from job: only ${issuedStats.netIssuedQty} net issued remains returnable for ${item.sku}.`
        );
      }
      if (!params.reversedMovement && issuedStats.weightedReturnUnitCost > 0) {
        returnUnitCost = issuedStats.weightedReturnUnitCost;
      }
    }
    const weighted = computeWeightedAverageReceipt({
      existingQty: onHand,
      existingUnitCost: currentUnitCost,
      incomingQty: qty,
      incomingUnitCost: returnUnitCost,
    });
    const totalCost = round2(qty * returnUnitCost);
    return {
      movementType,
      quantityDelta: round4(qty),
      movedQuantity: round4(qty),
      resultingQty: weighted.newQty,
      unitCost: returnUnitCost,
      totalCost,
      newItemUnitCost: weighted.newUnitCost,
      newLocation: item.location || '',
      shouldPostJobCost: Boolean(params.jobId),
      jobCostSourceType: 'stock_return',
      jobCostDelta: -totalCost,
    };
  }

  if (movementType === 'Stock In') {
    const incomingUnitCost =
      params.unitCostOverride !== undefined ? round4(params.unitCostOverride) : currentUnitCost;
    const weighted = computeWeightedAverageReceipt({
      existingQty: onHand,
      existingUnitCost: currentUnitCost,
      incomingQty: qty,
      incomingUnitCost,
    });
    return {
      movementType,
      quantityDelta: round4(qty),
      movedQuantity: round4(qty),
      resultingQty: weighted.newQty,
      unitCost: incomingUnitCost,
      totalCost: weighted.incomingTotalCost,
      newItemUnitCost: weighted.newUnitCost,
      newLocation: item.location || '',
      shouldPostJobCost: false,
      jobCostDelta: 0,
    };
  }

  if (movementType === 'Sample Out') {
    if (qty > onHand + 0.0001) {
      throw new Error(
        `Insufficient stock for sample checkout (${item.sku}): requested ${qty}, available ${onHand}.`
      );
    }
    const resultingQty = round4(Math.max(0, onHand - qty));
    return {
      movementType,
      quantityDelta: round4(-qty),
      movedQuantity: round4(qty),
      resultingQty,
      unitCost: currentUnitCost,
      totalCost: round2(qty * currentUnitCost),
      newItemUnitCost: currentUnitCost,
      newLocation: item.location || '',
      shouldPostJobCost: false,
      jobCostDelta: 0,
    };
  }

  if (movementType === 'Sample Return') {
    return {
      movementType,
      quantityDelta: round4(qty),
      movedQuantity: round4(qty),
      resultingQty: round4(onHand + qty),
      unitCost: currentUnitCost,
      totalCost: round2(qty * currentUnitCost),
      newItemUnitCost: currentUnitCost,
      newLocation: item.location || '',
      shouldPostJobCost: false,
      jobCostDelta: 0,
    };
  }

  // 'Adjustment' can be negative or positive when called from stocktake helpers
  throw new Error(`Unsupported movement type: ${movementType}`);
}

/**
 * Safely aggregate job actual cost from job cost entries while honoring 'stock_return' reversals
 * and preventing negative totals.
 */
export function computeJobActualCostFromEntries(entries: Pick<JobCostEntry, 'totalCost' | 'sourceType'>[]): number {
  let total = 0;
  for (const e of entries) {
    const c = Math.max(0, Number(e.totalCost) || 0);
    if (e.sourceType === 'stock_return') {
      total -= c;
    } else {
      total += c;
    }
  }
  return round2(Math.max(0, total));
}

export interface AccountingLedgerSummary {
  // Revenue & Output VAT
  invoicedNet: number;
  outputVat: number;
  invoicedGross: number;
  cashCollectedInvoices: number;
  receivablesOpen: number;
  whtCreditsReceivable: number;
  // Supplier Bills Breakdown (Stock vs Expense)
  stockCapitalizedFromBills: number;
  directCogsFromBills: number;
  opexFromBills: number;
  supplierNetTotal: number;
  supplierInputVatClaimable: number;
  supplierInputVatNonClaimable: number;
  supplierGrossTotal: number;
  supplierPaid: number;
  supplierPayables: number;
  supplierWhtHeld: number;
  supplierWhtPending: number;
  // Direct Expenses Breakdown
  directExpenseCogs: number;
  directExpenseOpex: number;
  expenseInputVatClaimable: number;
  expenseGrossTotal: number;
  expensePaid: number;
  expensePayables: number;
  // Stock & Inventory COGS Bridge
  stockIssuedCogsNet: number;
  stockReturnedCogsCredit: number;
  stockConsumedCogsNet: number;
  stockReceiptsCost: number;
  inventoryAssetValue: number;
  inventoryTotalUnits: number;
  acceptedGrnStockValue: number;
  linkedStockBillValue: number;
  grnToBillVariance: number;
  // Shared P&L Totals (used identically by AccountingView, ReportsView, DashboardView)
  directExpenseCogsNet: number;
  cogsNet: number;
  opexNet: number;
  payrollGross: number;
  payrollNet: number;
  salesCommissions: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  netProfit: number;
  netVatPayable: number;
  // Cash Flow
  cashBookInflow: number;
  cashBookOutflow: number;
  cashBookSupplierOutflow: number;
  cashBookNet: number;
  cashAvailable: number;
  operatingOutflow: number;
  netCashPosition: number;
}

function isInDateRange(dateStr: string | undefined, fromDate?: string, toDate?: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!dateStr) return false;
  if (fromDate && dateStr < fromDate) return false;
  if (toDate && dateStr > toDate) return false;
  return true;
}

/**
 * Single authoritative calculation engine for P&L, Inventory Asset, Consumption COGS,
 * VAT, Payables, and Cash Outflow across AccountingView, ReportsView, and DashboardView.
 */
export function computeAccountingLedger(params: {
  invoices: Invoice[];
  expenses: Expense[];
  supplierInvoices: SupplierInvoice[];
  goodsReceipts: GoodsReceipt[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  payrollRuns: PayrollRun[];
  jobs: Job[];
  cashBookEntries: CashBookEntry[];
  fromDate?: string;
  toDate?: string;
}): AccountingLedgerSummary {
  const {
    invoices,
    expenses,
    supplierInvoices,
    goodsReceipts,
    inventoryItems,
    inventoryMovements,
    payrollRuns,
    jobs,
    cashBookEntries,
    fromDate,
    toDate,
  } = params;

  const activeInvoices = invoices.filter(
    (inv) =>
      inv.status !== 'Void' &&
      inv.status !== 'Draft' &&
      isInDateRange(inv.issueDate, fromDate, toDate)
  );
  const invoicedNet = round2(activeInvoices.reduce((s, i) => s + (i.netAmount || 0), 0));
  const outputVat = round2(activeInvoices.reduce((s, i) => s + (i.vatAmount || 0), 0));
  const invoicedGross = round2(activeInvoices.reduce((s, i) => s + (i.grossAmount || 0), 0));
  const cashCollectedInvoices = round2(
    activeInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0)
  );
  const receivablesOpen = round2(
    activeInvoices.reduce((s, i) => s + (i.balanceDue || 0), 0)
  );
  const whtCreditsReceivable = round2(
    activeInvoices.reduce((s, i) => s + (i.whtWithheldAmount || 0), 0)
  );

  // Direct Expense entries
  const filteredExpenses = expenses.filter((e) => isInDateRange(e.expenseDate, fromDate, toDate));
  let directExpenseCogs = 0;
  let directExpenseOpex = 0;
  let expenseInputVatClaimable = 0;
  let expenseGrossTotal = 0;
  let expensePaid = 0;
  let expensePayables = 0;

  for (const e of filteredExpenses) {
    const claimableVat = e.isVatClaimable ? round2(e.vatAmount || 0) : 0;
    const effectiveExpenseCost = e.isVatClaimable
      ? round2(e.netAmount || 0)
      : round2(e.grossAmount || (e.netAmount || 0) + (e.vatAmount || 0));

    if (COGS_EXPENSE_CATEGORIES.includes(e.category)) {
      directExpenseCogs += effectiveExpenseCost;
    } else {
      directExpenseOpex += effectiveExpenseCost;
    }
    expenseInputVatClaimable += claimableVat;
    expenseGrossTotal += round2(e.grossAmount || 0);
    if (e.paymentStatus === 'Paid') {
      expensePaid += round2(e.grossAmount || 0);
    } else {
      expensePayables += round2(e.grossAmount || 0);
    }
  }

  // Supplier Tax Invoices — strictly split line-by-line into:
  // (a) Stock Capitalized (excluded from P&L COGS; enters Inventory Asset)
  // (b) Direct Expense in COGS categories (enters Direct COGS)
  // (c) Operating Expenses (enters OPEX)
  const filteredSupplierInvoices = supplierInvoices.filter((si) =>
    isInDateRange(si.invoiceDate, fromDate, toDate)
  );
  let stockCapitalizedFromBills = 0;
  let directCogsFromBills = 0;
  let opexFromBills = 0;
  let supplierNetTotal = 0;
  let supplierInputVatClaimable = 0;
  let supplierInputVatNonClaimable = 0;
  let supplierGrossTotal = 0;
  let supplierPaid = 0;
  let supplierPayables = 0;
  let supplierWhtHeld = 0;
  let supplierWhtPending = 0;

  for (const si of filteredSupplierInvoices) {
    const lineClassifications = classifySupplierInvoiceLines(si, goodsReceipts);
    const isCogsCat = COGS_SUPPLIER_CATEGORIES.includes(si.category);

    for (const lc of lineClassifications) {
      if (lc.treatment === 'stock') {
        stockCapitalizedFromBills += lc.capitalizedCost;
      } else if (isCogsCat) {
        directCogsFromBills += lc.effectiveCost;
      } else {
        opexFromBills += lc.effectiveCost;
      }
    }

    supplierNetTotal += round2(si.netAmount || 0);
    if (si.isVatClaimable) {
      supplierInputVatClaimable += round2(si.vatAmount || 0);
    } else {
      supplierInputVatNonClaimable += round2(si.vatAmount || 0);
    }
    supplierGrossTotal += round2(si.grossAmount || 0);
    supplierPaid += round2(si.amountPaid || 0);
    supplierPayables += round2(si.balanceDue || 0);
    if (si.whtApplicable) {
      supplierWhtHeld += round2(si.whtAmount || 0);
      if (!si.whtRemitted) {
        supplierWhtPending += round2(si.whtAmount || 0);
      }
    }
  }

  // Stock consumption COGS comes strictly from Inventory Movements (Issue to Job minus Material Return)
  const itemCostLookup = new Map<string, number>(
    inventoryItems.map((it) => [it.id, Number(it.unitCost) || 0])
  );

  const filteredMovements = inventoryMovements.filter((m) => {
    if (!fromDate && !toDate) return true;
    const mDate = m.movementDate;
    if (mDate) return isInDateRange(mDate, fromDate, toDate);
    return true;
  });

  let stockIssuedCogsNet = 0;
  let stockReturnedCogsCredit = 0;
  let stockReceiptsCost = 0;

  for (const m of filteredMovements) {
    // Pure location transfers must never hit P&L or receipts
    if (m.movementType === 'Location Transfer') continue;

    const absQty = Math.abs(Number(m.movedQuantity ?? m.quantityDelta) || 0);
    const unitCost =
      Number.isFinite(Number(m.unitCost))
        ? Number(m.unitCost)
        : itemCostLookup.get(m.itemId) || 0;
    const cost =
      Number.isFinite(Number(m.totalCost))
        ? round2(Number(m.totalCost))
        : round2(absQty * unitCost);

    if (m.movementType === 'Issue to Job') {
      stockIssuedCogsNet += cost;
    } else if (m.movementType === 'Material Return') {
      stockReturnedCogsCredit += cost;
    } else if (m.movementType === 'Stock In') {
      stockReceiptsCost += cost;
    }
  }

  stockIssuedCogsNet = round2(stockIssuedCogsNet);
  stockReturnedCogsCredit = round2(stockReturnedCogsCredit);
  stockReceiptsCost = round2(stockReceiptsCost);
  const stockConsumedCogsNet = round2(
    Math.max(0, stockIssuedCogsNet - stockReturnedCogsCredit)
  );

  // Inventory Asset on Balance Sheet (live inventoryItems valuation)
  const inventoryAssetValue = round2(
    inventoryItems.reduce(
      (s, it) => s + Math.max(0, Number(it.quantityOnHand) || 0) * Math.max(0, Number(it.unitCost) || 0),
      0
    )
  );
  const inventoryTotalUnits = round4(
    inventoryItems.reduce((s, it) => s + Math.max(0, Number(it.quantityOnHand) || 0), 0)
  );

  // GRN to Bill reconciliation
  const acceptedGrns = goodsReceipts.filter(
    (g) =>
      g.postToInventory &&
      g.conditionStatus !== 'Damaged / Rejected' &&
      isInDateRange(g.receivedDate, fromDate, toDate)
  );
  const acceptedGrnStockValue = round2(
    acceptedGrns.reduce((s, g) => s + (g.totalValue || 0), 0)
  );
  const linkedStockBillValue = round2(stockCapitalizedFromBills);
  const grnToBillVariance = round2(acceptedGrnStockValue - linkedStockBillValue);

  // Shared P&L totals
  const directExpenseCogsNet = round2(directCogsFromBills + directExpenseCogs);
  const cogsNet = round2(directExpenseCogsNet + stockConsumedCogsNet);
  const opexNet = round2(opexFromBills + directExpenseOpex);

  const paidPayroll = payrollRuns.filter(
    (p) => p.status !== 'Draft' && isInDateRange(p.payDate, fromDate, toDate)
  );
  const payrollGross = round2(paidPayroll.reduce((s, p) => s + (p.totalGrossPay || 0), 0));
  const payrollNet = round2(paidPayroll.reduce((s, p) => s + (p.totalNetPay || 0), 0));

  const salesCommissions = round2(
    jobs
      .filter((j) => j.status !== 'Cancelled' && Boolean(j.assignedSalesUid))
      .reduce((s, j) => s + (j.commissionAmount || 0), 0)
  );

  const grossProfit = round2(invoicedNet - cogsNet);
  const grossMarginPct = invoicedNet > 0 ? round2((grossProfit / invoicedNet) * 100) : 0;
  const totalExpenses = round2(cogsNet + opexNet + payrollGross + salesCommissions);
  const netProfit = round2(invoicedNet - totalExpenses);
  const netVatPayable = round2(
    outputVat - (expenseInputVatClaimable + supplierInputVatClaimable)
  );

  // Cash Book flows (separated from P&L)
  const filteredCashEntries = cashBookEntries.filter((c) =>
    isInDateRange(c.entryDate, fromDate, toDate)
  );
  const cashBookInflow = round2(
    filteredCashEntries
      .filter((c) => c.entryType === 'Receipt (Inflow)')
      .reduce((s, c) => s + (c.amount || 0), 0)
  );
  const cashBookOutflow = round2(
    filteredCashEntries
      .filter((c) => c.entryType === 'Payment (Outflow)')
      .reduce((s, c) => s + (c.amount || 0), 0)
  );
  const cashBookSupplierOutflow = round2(
    filteredCashEntries
      .filter((c) => c.entryType === 'Payment (Outflow)' && c.category === 'Supplier Payment')
      .reduce((s, c) => s + (c.amount || 0), 0)
  );
  const cashBookNet = round2(cashBookInflow - cashBookOutflow);
  const cashAvailable = round2(cashCollectedInvoices + cashBookInflow);
  const operatingOutflow = round2(expensePaid + supplierPaid + payrollNet + cashBookOutflow);
  const netCashPosition = round2(cashAvailable - operatingOutflow);

  return {
    invoicedNet,
    outputVat,
    invoicedGross,
    cashCollectedInvoices,
    receivablesOpen,
    whtCreditsReceivable,
    stockCapitalizedFromBills: round2(stockCapitalizedFromBills),
    directCogsFromBills: round2(directCogsFromBills),
    opexFromBills: round2(opexFromBills),
    supplierNetTotal: round2(supplierNetTotal),
    supplierInputVatClaimable: round2(supplierInputVatClaimable),
    supplierInputVatNonClaimable: round2(supplierInputVatNonClaimable),
    supplierGrossTotal: round2(supplierGrossTotal),
    supplierPaid: round2(supplierPaid),
    supplierPayables: round2(supplierPayables),
    supplierWhtHeld: round2(supplierWhtHeld),
    supplierWhtPending: round2(supplierWhtPending),
    directExpenseCogs: round2(directExpenseCogs),
    directExpenseOpex: round2(directExpenseOpex),
    expenseInputVatClaimable: round2(expenseInputVatClaimable),
    expenseGrossTotal: round2(expenseGrossTotal),
    expensePaid: round2(expensePaid),
    expensePayables: round2(expensePayables),
    stockIssuedCogsNet,
    stockReturnedCogsCredit,
    stockConsumedCogsNet,
    stockReceiptsCost,
    inventoryAssetValue,
    inventoryTotalUnits,
    acceptedGrnStockValue,
    linkedStockBillValue,
    grnToBillVariance,
    directExpenseCogsNet,
    cogsNet,
    opexNet,
    payrollGross,
    payrollNet,
    salesCommissions,
    grossProfit,
    grossMarginPct,
    totalExpenses,
    netProfit,
    netVatPayable,
    cashBookInflow,
    cashBookOutflow,
    cashBookSupplierOutflow,
    cashBookNet,
    cashAvailable,
    operatingOutflow,
    netCashPosition,
  };
}

export interface LineClassificationEdit {
  lineIndex: number;
  costTreatment: 'stock' | 'expense';
  inventoryItemId?: string;
  sku?: string;
}

export interface GrnLinkAssignment {
  grnId: string;
  lineMappings: Array<{
    grnItemIndex: number;
    supplierInvoiceLineIndex: number;
  }>;
}

export interface StockClassificationLinkPlan {
  valid: boolean;
  hasChanges: boolean;
  isPartialReceiptLink: boolean;
  errors: string[];
  warnings: string[];
  updatedLines: InvoiceLine[];
  linkedGrnIds: string[];
  grnUpdates: Array<{
    grnId: string;
    grnNumber: string;
    items: GoodsReceipt['items'];
    supplierInvoiceId: string;
    supplierInvoiceNo: string;
  }>;
  stockCapitalizedTotal: number;
  directExpenseTotal: number;
  lineReceiptSummaries: Array<{
    lineIndex: number;
    description: string;
    billQuantity: number;
    linkedReceivedQuantity: number;
    treatment: 'stock' | 'expense';
    effectiveCost: number;
  }>;
}

/**
 * Pure planner & validator for the Management-only "Classify / Link GRN" flow on an existing supplier bill.
 * Guarantees:
 * - Never changes invoice amounts (net, VAT, gross, amountPaid, balanceDue), VAT claimability, dates, or cash payments
 * - Never creates duplicate GRNs, duplicate payments, or extra stock quantities
 * - Bounds linked GRN received quantities strictly to bill line quantity (across one or multiple partial GRNs)
 * - Detects ambiguous multi-line matches & reports exact idempotency (`hasChanges === false` on repeat saves)
 */
export function buildStockClassificationLinkPlan(params: {
  supplierInvoice: SupplierInvoice;
  lineEdits: LineClassificationEdit[];
  selectedGrnIds: string[];
  grnAssignments?: GrnLinkAssignment[];
  allGrns: GoodsReceipt[];
  inventoryItems: InventoryItem[];
}): StockClassificationLinkPlan {
  const { supplierInvoice, lineEdits, selectedGrnIds, allGrns, inventoryItems } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  const invById = new Map(inventoryItems.map((i) => [i.id, i]));
  const baseLines =
    supplierInvoice.lines && supplierInvoice.lines.length > 0
      ? supplierInvoice.lines
      : [
          {
            description: supplierInvoice.supplierInvoiceNo || supplierInvoice.recordNumber,
            quantity: 1,
            unitPrice: supplierInvoice.netAmount,
            vatTreatment: supplierInvoice.vatTreatment,
            netAmount: supplierInvoice.netAmount,
            vatAmount: supplierInvoice.vatAmount,
            grossAmount: supplierInvoice.grossAmount,
          },
        ];

  const editMap = new Map(lineEdits.map((e) => [e.lineIndex, e]));

  // Build updated lines preserving monetary values completely
  const updatedLines: InvoiceLine[] = baseLines.map((orig, idx) => {
    const edit = editMap.get(idx);
    const treatment: 'stock' | 'expense' =
      edit?.costTreatment || orig.costTreatment || (orig.inventoryItemId ? 'stock' : 'expense');

    const pickedItemId =
      treatment === 'stock' ? (edit?.inventoryItemId ?? orig.inventoryItemId ?? '') : '';
    const skuItem = pickedItemId ? invById.get(pickedItemId) : undefined;

    if (treatment === 'stock' && pickedItemId && !skuItem) {
      errors.push(`Line ${idx + 1}: Selected inventory SKU (${pickedItemId}) does not exist.`);
    }

    const { effectiveCost } = computeSupplierLineEffectiveCost({
      line: orig,
      isVatClaimable: supplierInvoice.isVatClaimable,
    });

    const nextLine: InvoiceLine = {
      ...orig,
      costTreatment: treatment,
    };

    if (treatment === 'stock') {
      if (pickedItemId) {
        nextLine.inventoryItemId = pickedItemId;
        nextLine.sku = skuItem?.sku || edit?.sku || orig.sku || '';
        nextLine.unit = skuItem?.unit || orig.unit || '';
      } else {
        delete nextLine.inventoryItemId;
        delete nextLine.sku;
      }
      nextLine.capitalizedCost = effectiveCost;
    } else {
      delete nextLine.inventoryItemId;
      delete nextLine.sku;
      delete nextLine.grnLineRef;
      nextLine.capitalizedCost = 0;
    }

    return nextLine;
  });

  // Validate selected GRNs and link bounds
  const uniqueSelectedGrnIds = Array.from(new Set(selectedGrnIds.filter(Boolean)));
  const assignmentMap = new Map(
    (params.grnAssignments || []).map((a) => [a.grnId, a.lineMappings])
  );

  // Track cumulative linked qty across selected GRNs + already-linked OTHER GRNs not explicitly deselected
  const receivedQtyPerBillLine = new Map<number, number>();
  const grnUpdates: StockClassificationLinkPlan['grnUpdates'] = [];

  // Also check any OTHER GRN linked to the same bill outside selectedGrnIds that might conflict
  for (const grnId of uniqueSelectedGrnIds) {
    const grn = allGrns.find((g) => g.id === grnId);
    if (!grn) {
      errors.push(`Selected GRN (${grnId}) was not found.`);
      continue;
    }
    if (grn.supplierInvoiceId && grn.supplierInvoiceId !== supplierInvoice.id) {
      errors.push(
        `${grn.grnNumber} is already linked to a different supplier bill (${grn.supplierInvoiceNo || grn.supplierInvoiceId}). Unlink it there first.`
      );
      continue;
    }
    if (!grn.postToInventory || grn.conditionStatus === 'Damaged / Rejected') {
      warnings.push(
        `${grn.grnNumber} has status "${grn.conditionStatus}" / postToInventory=${grn.postToInventory} and did not add stock to Inventory.`
      );
    }

    const explicitMappings = assignmentMap.get(grn.id) || [];
    const nextGrnItems = grn.items.map((gItem, gIdx) => {
      const explicitMap = explicitMappings.find((m) => m.grnItemIndex === gIdx);
      let targetBillLineIndex: number | undefined =
        explicitMap !== undefined
          ? explicitMap.supplierInvoiceLineIndex
          : gItem.supplierInvoiceLineIndex;

      // Auto-resolve ONLY when unambiguous: single-line bill OR unique matching inventoryItemId on stock lines
      if (targetBillLineIndex === undefined) {
        const stockLineIndices = updatedLines
          .map((l, i) => ({ l, i }))
          .filter((x) => x.l.costTreatment === 'stock');
        const skuMatches = stockLineIndices.filter(
          (x) => x.l.inventoryItemId && x.l.inventoryItemId === gItem.inventoryItemId
        );
        if (skuMatches.length === 1) {
          targetBillLineIndex = skuMatches[0].i;
        } else if (skuMatches.length > 1) {
          errors.push(
            `${grn.grnNumber} line ${gIdx + 1} (${gItem.sku}): matches multiple bill lines with the same SKU. Assign an explicit bill line index.`
          );
        } else if (updatedLines.length === 1 && updatedLines[0].costTreatment === 'stock') {
          targetBillLineIndex = 0;
        } else if (stockLineIndices.length > 1) {
          errors.push(
            `${grn.grnNumber} line ${gIdx + 1} (${gItem.sku}): ambiguous mapping across ${stockLineIndices.length} stock bill lines. Select the exact bill line.`
          );
        }
      }

      if (targetBillLineIndex !== undefined) {
        if (targetBillLineIndex < 0 || targetBillLineIndex >= updatedLines.length) {
          errors.push(
            `${grn.grnNumber} line ${gIdx + 1}: invalid bill line index ${targetBillLineIndex + 1}.`
          );
        } else if (updatedLines[targetBillLineIndex].costTreatment !== 'stock') {
          errors.push(
            `${grn.grnNumber} line ${gIdx + 1} (${gItem.sku}) is mapped to Bill Line ${targetBillLineIndex + 1}, which is marked as Direct Expense instead of Stock.`
          );
        } else {
          const prev = receivedQtyPerBillLine.get(targetBillLineIndex) || 0;
          receivedQtyPerBillLine.set(
            targetBillLineIndex,
            round4(prev + (Number(gItem.quantityReceived) || 0))
          );
        }
      }

      return targetBillLineIndex !== undefined
        ? { ...gItem, supplierInvoiceLineIndex: targetBillLineIndex }
        : { ...gItem };
    });

    // Enforce bounded SKU consistency & line quantity
    const grnChanged =
      grn.supplierInvoiceId !== supplierInvoice.id ||
      JSON.stringify(grn.items) !== JSON.stringify(nextGrnItems);

    if (grnChanged) {
      grnUpdates.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        items: nextGrnItems,
        supplierInvoiceId: supplierInvoice.id,
        supplierInvoiceNo: supplierInvoice.supplierInvoiceNo,
      });
    }
  }

  let isPartialReceiptLink = false;
  let stockCapitalizedTotal = 0;
  let directExpenseTotal = 0;

  const lineReceiptSummaries = updatedLines.map((l, idx) => {
    const treatment = l.costTreatment || 'expense';
    const { effectiveCost } = computeSupplierLineEffectiveCost({
      line: l,
      isVatClaimable: supplierInvoice.isVatClaimable,
    });
    if (treatment === 'stock') {
      stockCapitalizedTotal = round2(stockCapitalizedTotal + effectiveCost);
    } else {
      directExpenseTotal = round2(directExpenseTotal + effectiveCost);
    }

    const billQuantity = round4(Number(l.quantity) || 0);
    const linkedReceivedQuantity = round4(receivedQtyPerBillLine.get(idx) || 0);

    if (treatment === 'stock') {
      if (linkedReceivedQuantity > billQuantity + 0.0001) {
        errors.push(
          `Bill Line ${idx + 1} (${l.description}): linked GRN quantity (${linkedReceivedQuantity}) exceeds billed quantity (${billQuantity}).`
        );
      } else if (
        uniqueSelectedGrnIds.length > 0 &&
        linkedReceivedQuantity > 0 &&
        linkedReceivedQuantity + 0.0001 < billQuantity
      ) {
        isPartialReceiptLink = true;
        warnings.push(
          `Bill Line ${idx + 1} (${l.description}): partial receipt linked (${linkedReceivedQuantity} of ${billQuantity} received).`
        );
      } else if (uniqueSelectedGrnIds.length === 0 && !l.inventoryItemId) {
        warnings.push(
          `Bill Line ${idx + 1} (${l.description}) is marked Stock Purchase without a linked SKU or GRN.`
        );
      }
    }

    return {
      lineIndex: idx,
      description: l.description,
      billQuantity,
      linkedReceivedQuantity,
      treatment,
      effectiveCost,
    };
  });

  // Idempotency check
  const existingLinkedGrns = supplierInvoice.linkedGrnIds || [];
  const linesChanged =
    JSON.stringify(
      baseLines.map((l) => ({
        costTreatment: l.costTreatment,
        inventoryItemId: l.inventoryItemId || '',
        sku: l.sku || '',
        capitalizedCost: l.capitalizedCost ?? 0,
      }))
    ) !==
    JSON.stringify(
      updatedLines.map((l) => ({
        costTreatment: l.costTreatment,
        inventoryItemId: l.inventoryItemId || '',
        sku: l.sku || '',
        capitalizedCost: l.capitalizedCost ?? 0,
      }))
    );
  const grnIdsChanged =
    JSON.stringify([...existingLinkedGrns].sort()) !==
    JSON.stringify([...uniqueSelectedGrnIds].sort());
  const hasChanges = linesChanged || grnIdsChanged || grnUpdates.length > 0;

  return {
    valid: errors.length === 0,
    hasChanges,
    isPartialReceiptLink,
    errors,
    warnings,
    updatedLines,
    linkedGrnIds: uniqueSelectedGrnIds,
    grnUpdates,
    stockCapitalizedTotal,
    directExpenseTotal,
    lineReceiptSummaries,
  };
}
