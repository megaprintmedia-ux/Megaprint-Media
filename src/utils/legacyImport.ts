import {
  ChartAccount,
  ChartAccountSubType,
  ChartAccountType,
  Client,
  Invoice,
  Job,
  JobStatus,
  MigrationRecordCategory,
  MigrationRecordOutcome,
  MigrationReferenceTableRow,
  MigrationSystemUserReference,
  OpeningBalanceRecord,
  OpeningBalanceRecordType,
  ServiceCategory,
  Supplier,
  SupplierInvoice,
} from '../types/erp';

export interface LegacyInputCustomer {
  sourceId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  vatRegistrationNumber?: string | null;
  address?: string | null;
  primaryContact?: string | null;
  legacyPricingMode?: string | null;
  creditApproved?: boolean;
  creditLimitUSD?: number;
  paymentTermsDays?: number | null;
}

export interface LegacyInputSupplier {
  sourceKey: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface LegacyInputAccount {
  sourceCode: string;
  name: string;
  type: string;
  parentCode?: string | null;
  currency?: string | null;
  active?: boolean;
  normalSideBalanceUSD?: number;
  trialDebitUSD?: number;
  trialCreditUSD?: number;
}

export interface LegacyInputPendingJob {
  sourceReference: string;
  customerSourceId: string;
  customerName: string;
  division?: string | null;
  valueUSD: number;
  dueDate?: string | null;
  sourceStatus: string;
  preparedBy?: string | null;
  salesOwner?: string | null;
  lineSpecifications?: unknown[] | null;
}

export interface LegacyInputReceivable {
  sourceInvoiceReference: string;
  customerSourceId: string;
  customerName: string;
  dueDate?: string | null;
  outstandingUSD: number;
  originalNetAndVATSplit?: unknown | null;
  migrationTreatment?: string | null;
}

export interface LegacyInputCustomerCredit {
  customerSourceId: string;
  customerName: string;
  unappliedCreditUSD: number;
}

export interface LegacyInputSupplierPayable {
  sourceReference?: string | null;
  supplierName?: string | null;
  supplier?: string | null;
  recordedDate?: string | null;
  dueDate?: string | null;
  outstandingUSD: number;
  recordType?: string | null;
  kind?: string | null;
  targetDuplicate?: unknown;
  status?: string | null;
  notes?: string | null;
  memo?: string | null;
  [extraKey: string]: unknown;
}

export interface LegacyImportControls {
  receivablesUSD: number;
  unappliedCustomerCreditsUSD: number;
  supplierPayablesUSD: number;
  trialBalanceDebitUSD: number;
  trialBalanceCreditUSD: number;
  [k: string]: unknown;
}

export interface LegacyImportRootPayload {
  version: number;
  asOfDate: string;
  sourceSystem: string;
  targetSystem: string;
  counts?: Record<string, number>;
  controls: LegacyImportControls;
  alreadyCreatedInTarget?: Array<{ name: string; status: string }>;
  constraints?: string[];
  data: {
    customers: LegacyInputCustomer[];
    suppliers: LegacyInputSupplier[];
    accounts: LegacyInputAccount[];
    pendingJobs: LegacyInputPendingJob[];
    receivables: LegacyInputReceivable[];
    customerCredits: LegacyInputCustomerCredit[];
    supplierPayables: LegacyInputSupplierPayable[];
    systemUserReferences?: Array<Record<string, unknown>>;
    liabilityBalances?: unknown[][];
    payableLedger?: unknown[][];
  };
}

export interface ExistingErpSnapshot {
  clients: Client[];
  suppliers: Supplier[];
  chartOfAccounts: ChartAccount[];
  jobs: Job[];
  invoices?: Invoice[];
  supplierInvoices: SupplierInvoice[];
  openingBalances: OpeningBalanceRecord[];
}

export type PlannedWriteAction =
  | 'create'
  | 'match_update'
  | 'skip_existing'
  | 'blocked';

export interface PlannedCustomerItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  matchReason: string;
  matchedClientId?: string;
  source: LegacyInputCustomer;
  resolvedCompanyName: string;
  resolvedContactName: string;
  resolvedEmail: string;
  resolvedPhone: string;
  resolvedVatReg: string;
  resolvedAddress: string;
  resolvedPaymentTermsDays: number;
  resolvedNotes: string;
  legacyPricingMode: string;
  creditApproved: boolean;
  creditLimitUSD: number;
  error?: string;
}

export interface PlannedSupplierItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  matchReason: string;
  matchedSupplierId?: string;
  source: LegacyInputSupplier;
  resolvedName: string;
  resolvedPhone: string;
  resolvedEmail: string;
  resolvedAddress: string;
  error?: string;
}

export type CoaMappingKind =
  | 'create_direct'
  | 'create_collision_remapped'
  | 'map_native_control'
  | 'skip_existing_legacy'
  | 'blocked';

export interface PlannedAccountItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  mappingKind: CoaMappingKind;
  mappingReason: string;
  source: LegacyInputAccount;
  assignedCode: string;
  collidedWithNativeCode?: string;
  matchedNativeAccountId?: string;
  matchedNativeAccountName?: string;
  mappedAccountType: ChartAccountType;
  mappedSubType: ChartAccountSubType;
  nativeCurrency: string;
  legacyCurrencyLabel: string;
  normalSideBalanceUSD: number;
  trialDebitUSD: number;
  trialCreditUSD: number;
  error?: string;
}

export interface PlannedJobItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  reason: string;
  source: LegacyInputPendingJob;
  resolvedClientId: string;
  resolvedClientName: string;
  mappedStatus: JobStatus;
  mappedCategory: ServiceCategory;
  legacyLinesExtracted: boolean;
  lineSpecsCount: number;
  valueUSD: number;
  error?: string;
}

export interface PlannedReceivableItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  reason: string;
  source: LegacyInputReceivable;
  resolvedClientId: string;
  resolvedClientName: string;
  outstandingUSD: number;
  dueDate: string;
  migrationTreatment: string;
  error?: string;
}

export interface PlannedCustomerCreditItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  reason: string;
  source: LegacyInputCustomerCredit;
  resolvedClientId: string;
  resolvedClientName: string;
  unappliedCreditUSD: number;
  error?: string;
}

export interface PlannedSupplierPayableItem {
  sourceKey: string;
  docId: string;
  action: PlannedWriteAction;
  reason: string;
  recordType: 'supplier_payable_invoice' | 'supplier_opening_accrual';
  source: LegacyInputSupplierPayable;
  sourceReference: string;
  supplierName: string;
  counterpartyId: string;
  recordedDate: string;
  dueDate: string;
  outstandingUSD: number;
  sourceStatus: string;
  notes: string;
  isMatchedExisting: boolean;
  matchedSupplierInvoiceId: string;
  matchedSupplierInvoiceNo: string;
  preservedMetadata: Record<string, string>;
  error?: string;
}

export interface ControlCheckResult {
  key:
    | 'receivablesUSD'
    | 'unappliedCustomerCreditsUSD'
    | 'supplierPayablesUSD'
    | 'trialBalanceDebitUSD'
    | 'trialBalanceCreditUSD'
    | 'trialBalanceInBalance';
  label: string;
  expectedUSD: number;
  actualUSD: number;
  diffUSD: number;
  passed: boolean;
}

export interface NormalizedReferenceTable {
  tableName: 'liabilityBalances' | 'payableLedger';
  headers: string[];
  rows: MigrationReferenceTableRow[];
  rowCount: number;
}

export interface LegacyImportReconciliation {
  grossReceivablesUSD: number;
  unappliedCreditsUSD: number;
  netReceivablesUSD: number;
  importedPayablesUSD: number;
  accrualPayablesUSD: number;
  matchedExistingPayablesUSD: number;
  totalSourcePayablesUSD: number;
  nativeUnmatchedPayablesUSD: number;
  combinedOutstandingPayablesUSD: number;
  trialBalanceDebitUSD: number;
  trialBalanceCreditUSD: number;
}

export interface LegacyImportPlan {
  validStructure: boolean;
  canImport: boolean;
  runId: string;
  payloadFingerprint: string;
  asOfDate: string;
  sourceSystem: string;
  targetSystem: string;
  alreadyCreatedInTarget: Array<{ name: string; status: string }>;
  constraints: string[];
  blockingErrors: string[];
  warnings: string[];
  controlChecks: ControlCheckResult[];
  controlsVerified: boolean;
  reconciliation: LegacyImportReconciliation;
  customers: PlannedCustomerItem[];
  suppliers: PlannedSupplierItem[];
  accounts: PlannedAccountItem[];
  pendingJobs: PlannedJobItem[];
  receivables: PlannedReceivableItem[];
  customerCredits: PlannedCustomerCreditItem[];
  supplierPayables: PlannedSupplierPayableItem[];
  systemUserReferences: MigrationSystemUserReference[];
  liabilityBalancesTable: NormalizedReferenceTable;
  payableLedgerTable: NormalizedReferenceTable;
  summaryCounts: {
    totalPlanned: number;
    toCreate: number;
    toMatchUpdate: number;
    toSkipExisting: number;
    blockedCount: number;
  };
}

const KNOWN_SUPPLIER_PAYABLE_KEYS = new Set([
  'sourceReference',
  'supplierName',
  'supplier',
  'recordedDate',
  'dueDate',
  'outstandingUSD',
  'recordType',
  'status',
  'notes',
  'memo',
]);

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const sign = val < 0 ? -1 : 1;
  const rounded = (sign * Math.round((Math.abs(val) + Number.EPSILON) * 100)) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function normalizeText(val: string | null | undefined): string {
  return (val || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizePhone(val: string | null | undefined): string {
  const digits = (val || '').replace(/[^0-9+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+263')) return '263' + digits.slice(4);
  if (digits.startsWith('0') && digits.length >= 9) return '263' + digits.slice(1);
  return digits.replace(/^\+/, '');
}

export function normalizeRef(val: string | null | undefined): string {
  return (val || '').trim().toUpperCase().replace(/[\s/]+/g, '-');
}

export function extractOldCustomerIdFromNotes(
  notes: string | null | undefined
): string | null {
  if (!notes) return null;
  const match = notes.match(/old\s+customer\s+id\s*:\s*([a-zA-Z0-9_-]+)/i);
  return match && match[1] ? match[1].trim() : null;
}

export function normalizePaymentTermsDays(
  val: unknown,
  fallback = 30
): number {
  if (val === undefined || val === null || val === '') {
    return fallback;
  }
  const num = typeof val === 'number' ? val : Number(String(val).trim());
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(365, Math.round(num)));
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeDeterministicId(prefix: string, rawKey: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'id';
  const slug = rawKey
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const hash = fnv1aHex(`${cleanPrefix}:${rawKey}`);
  const id = slug ? `${cleanPrefix}_${slug}_${hash}` : `${cleanPrefix}_${hash}`;
  return id.slice(0, 120);
}

export function computePayloadFingerprint(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  const a = fnv1aHex(json);
  const b = fnv1aHex(json.split('').reverse().join(''));
  return `${a}${b}_${json.length}`;
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

export function mapLegacyJobStatus(sourceStatus: string): {
  status: JobStatus;
  recognized: boolean;
} {
  const norm = normalizeText(sourceStatus).replace(/[_-]+/g, ' ');
  if (norm === 'in production' || norm === 'partially completed') {
    return { status: 'In Production', recognized: true };
  }
  if (norm === 'completed') {
    return { status: 'Ready for Dispatch', recognized: true };
  }
  if (norm === 'awaiting deposit') {
    return { status: 'Approved', recognized: true };
  }
  if (norm === 'new' || norm === 'awaiting approval') {
    return { status: 'Quoted', recognized: true };
  }
  if (norm.includes('production') || norm.includes('partial')) {
    return { status: 'In Production', recognized: true };
  }
  if (norm.includes('completed') || norm.includes('dispatch')) {
    return { status: 'Ready for Dispatch', recognized: true };
  }
  if (norm.includes('deposit') || norm.includes('approved')) {
    return { status: 'Approved', recognized: true };
  }
  return { status: 'Quoted', recognized: false };
}

export function mapLegacyDivisionToCategory(
  division: string | null | undefined
): ServiceCategory {
  const d = normalizeText(division);
  if (d.includes('tailor') || d.includes('alteration') || d.includes('cmt')) {
    return 'Tailoring';
  }
  if (
    d.includes('wear') ||
    d.includes('apparel') ||
    d.includes('uniform') ||
    d.includes('garment') ||
    d.includes('embroidery') ||
    d.includes('promo')
  ) {
    return 'Corporate Wear';
  }
  if (
    d.includes('brand') ||
    d.includes('sign') ||
    d.includes('display') ||
    d.includes('vehicle') ||
    d.includes('engraving')
  ) {
    return 'Branding';
  }
  return 'Printing';
}

export function mapLegacyAccountTypeAndSubType(
  rawType: string,
  sourceCode: string,
  name: string
): { accountType: ChartAccountType; subType: ChartAccountSubType } {
  const t = normalizeText(rawType);
  const n = normalizeText(name);
  const code = (sourceCode || '').trim();

  if (
    t.includes('cost of sales') ||
    t.includes('cost of goods') ||
    t.includes('cogs') ||
    t === 'cos'
  ) {
    return { accountType: 'Expense', subType: 'COGS' };
  }

  let accountType: ChartAccountType = 'Asset';
  if (t.includes('liab') || t.includes('payable') || t.includes('credit card')) {
    accountType = 'Liability';
  } else if (t.includes('equity') || t.includes('capital') || t.includes('retained')) {
    accountType = 'Equity';
  } else if (t.includes('rev') || t.includes('income') || t.includes('sales')) {
    accountType = 'Revenue';
  } else if (t.includes('exp') || t.includes('cost') || t.includes('admin')) {
    accountType = 'Expense';
  } else if (t.includes('asset') || t.includes('bank') || t.includes('cash') || t.includes('receiv')) {
    accountType = 'Asset';
  } else if (code.startsWith('2')) {
    accountType = 'Liability';
  } else if (code.startsWith('3')) {
    accountType = 'Equity';
  } else if (code.startsWith('4')) {
    accountType = 'Revenue';
  } else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7')) {
    accountType = 'Expense';
  }

  let subType: ChartAccountSubType = 'Operating';
  if (code === '1200' || t.includes('receiv') || n.includes('accounts receivable') || n.includes('trade debtors')) {
    accountType = 'Asset';
    subType = 'Receivable';
  } else if (code === '2100' || t.includes('payable') || n.includes('accounts payable') || n.includes('trade creditors')) {
    accountType = 'Liability';
    subType = 'Payable';
  } else if (n.includes('ecocash') || n.includes('mobile') || n.includes('innbucks')) {
    subType = 'Mobile Money';
  } else if (t.includes('bank') || n.includes('bank')) {
    subType = 'Bank';
  } else if (t.includes('cash') || n.includes('petty cash') || n.includes('cash drawer')) {
    subType = 'Cash';
  } else if (n.includes('vat') || n.includes('tax') || n.includes('zimra') || n.includes('wht') || n.includes('paye')) {
    subType = 'Tax / VAT';
  } else if (n.includes('payroll') || n.includes('salary') || n.includes('salaries') || n.includes('wages')) {
    subType = 'Payroll';
  } else if (n.includes('cost of sales') || n.includes('cogs') || n.includes('direct material')) {
    accountType = 'Expense';
    subType = 'COGS';
  }

  return { accountType, subType };
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function parseFiniteNonNeg(v: unknown): number | null {
  if (v === undefined || v === null || typeof v === 'boolean') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

function parseFiniteSigned(v: unknown): number | null {
  if (v === undefined || v === null || typeof v === 'boolean') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

function normalizeTable(
  tableName: 'liabilityBalances' | 'payableLedger',
  rawTable: unknown
): { table: NormalizedReferenceTable; error?: string } {
  if (!Array.isArray(rawTable)) {
    return {
      table: { tableName, headers: [], rows: [], rowCount: 0 },
      error: `data.${tableName} must be a 2D array (header row + data rows).`,
    };
  }
  if (rawTable.length === 0) {
    return {
      table: { tableName, headers: [], rows: [], rowCount: 0 },
    };
  }
  const first = rawTable[0];
  if (!Array.isArray(first)) {
    return {
      table: { tableName, headers: [], rows: [], rowCount: 0 },
      error: `data.${tableName}[0] must be a header row array.`,
    };
  }
  const headers = first.slice(0, 40).map((cell) =>
    cell === null || cell === undefined ? '' : String(cell).slice(0, 120)
  );
  const rows: MigrationReferenceTableRow[] = rawTable.slice(1, 501).map((r) => ({
    cells: Array.isArray(r)
      ? r.slice(0, 40).map((c) => (c === null || c === undefined ? '' : String(c).slice(0, 240)))
      : [String(r ?? '').slice(0, 240)],
  }));
  return {
    table: {
      tableName,
      headers,
      rows,
      rowCount: rows.length,
    },
  };
}

export function planCoaEntries(
  rawAccounts: LegacyInputAccount[],
  existingChartAccounts: ChartAccount[]
): PlannedAccountItem[] {
  const nativeByCode = new Map<string, ChartAccount[]>();
  const existingByLegacySource = new Map<string, ChartAccount>();
  const usedCodes = new Set<string>();

  existingChartAccounts.forEach((acc) => {
    const codeKey = acc.code.trim().toUpperCase();
    if (codeKey) {
      usedCodes.add(codeKey);
      const list = nativeByCode.get(codeKey) || [];
      list.push(acc);
      nativeByCode.set(codeKey, list);
    }
    if (acc.legacySourceCode) {
      existingByLegacySource.set(acc.legacySourceCode.trim().toUpperCase(), acc);
    }
  });

  const arNative = existingChartAccounts.find(
    (a) => !a.legacyImported && a.subType === 'Receivable'
  );
  const apNative = existingChartAccounts.find(
    (a) => !a.legacyImported && a.subType === 'Payable'
  );

  const seenSourceCodes = new Set<string>();

  return rawAccounts.map((acc, index) => {
    const sourceCode = (acc.sourceCode || '').trim();
    const sourceName = (acc.name || '').trim();
    const sourceKey = sourceCode || `ACC_ROW_${index}`;
    const docId = makeDeterministicId('coa', sourceKey);
    const { accountType, subType } = mapLegacyAccountTypeAndSubType(
      acc.type || '',
      sourceCode,
      sourceName
    );
    const normalSideBalanceUSD = parseFiniteSigned(acc.normalSideBalanceUSD ?? 0);
    const trialDebitUSD = parseFiniteNonNeg(acc.trialDebitUSD ?? 0);
    const trialCreditUSD = parseFiniteNonNeg(acc.trialCreditUSD ?? 0);
    const legacyCurrencyLabel = ((acc.currency || 'USD').trim() || 'USD').slice(0, 40);
    const nativeCurrency =
      legacyCurrencyLabel.toUpperCase() === 'MULTIPLE' ||
      legacyCurrencyLabel.length > 6
        ? 'USD'
        : legacyCurrencyLabel.toUpperCase();

    if (!sourceCode || !sourceName) {
      return {
        sourceKey,
        docId,
        action: 'blocked',
        mappingKind: 'blocked',
        mappingReason: 'Missing sourceCode or account name.',
        source: acc,
        assignedCode: sourceCode || 'ERR',
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD: normalSideBalanceUSD ?? 0,
        trialDebitUSD: trialDebitUSD ?? 0,
        trialCreditUSD: trialCreditUSD ?? 0,
        error: `Account row ${index + 1} is missing required sourceCode or name.`,
      };
    }

    if (
      normalSideBalanceUSD === null ||
      trialDebitUSD === null ||
      trialCreditUSD === null
    ) {
      return {
        sourceKey,
        docId,
        action: 'blocked',
        mappingKind: 'blocked',
        mappingReason: 'Invalid normalSideBalanceUSD or invalid/negative trial debit/credit on account.',
        source: acc,
        assignedCode: sourceCode,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD: 0,
        trialDebitUSD: 0,
        trialCreditUSD: 0,
        error: `Account ${sourceCode} (${sourceName}) has invalid normalSideBalanceUSD or invalid/negative trial USD balance.`,
      };
    }

    const upperCode = sourceCode.toUpperCase();
    if (seenSourceCodes.has(upperCode)) {
      return {
        sourceKey,
        docId,
        action: 'blocked',
        mappingKind: 'blocked',
        mappingReason: 'Duplicate sourceCode in import payload.',
        source: acc,
        assignedCode: sourceCode,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD,
        trialDebitUSD,
        trialCreditUSD,
        error: `Duplicate legacy account sourceCode "${sourceCode}" in payload.`,
      };
    }
    seenSourceCodes.add(upperCode);

    // 1. Previously imported legacy entry with this exact legacySourceCode
    const alreadyImported = existingByLegacySource.get(upperCode);
    if (alreadyImported) {
      return {
        sourceKey,
        docId: alreadyImported.id,
        action: 'skip_existing',
        mappingKind: 'skip_existing_legacy',
        mappingReason: `Already imported as ${alreadyImported.code} (${alreadyImported.name}).`,
        source: acc,
        assignedCode: alreadyImported.code,
        matchedNativeAccountId: alreadyImported.id,
        matchedNativeAccountName: alreadyImported.name,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD,
        trialDebitUSD,
        trialCreditUSD,
      };
    }

    // 2. AR 1200 and AP 2100 control account mapping (Rule 4)
    if (sourceCode === '1200' && subType === 'Receivable' && arNative) {
      return {
        sourceKey,
        docId: arNative.id,
        action: 'match_update',
        mappingKind: 'map_native_control',
        mappingReason: `Mapped AR 1200 to native control account ${arNative.code} — ${arNative.name} (opening float untouched).`,
        source: acc,
        assignedCode: arNative.code,
        matchedNativeAccountId: arNative.id,
        matchedNativeAccountName: arNative.name,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD,
        trialDebitUSD,
        trialCreditUSD,
      };
    }

    if (sourceCode === '2100' && subType === 'Payable' && apNative) {
      return {
        sourceKey,
        docId: apNative.id,
        action: 'match_update',
        mappingKind: 'map_native_control',
        mappingReason: `Mapped AP 2100 to native control account ${apNative.code} — ${apNative.name} (opening float untouched).`,
        source: acc,
        assignedCode: apNative.code,
        matchedNativeAccountId: apNative.id,
        matchedNativeAccountName: apNative.name,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD,
        trialDebitUSD,
        trialCreditUSD,
      };
    }

    // 3. Check collision against existing target Chart of Accounts
    const existingWithSameCode = nativeByCode.get(upperCode);
    if (existingWithSameCode && existingWithSameCode.length > 0) {
      // Deterministic non-colliding code LEG-<code>, LEG-<code>-2, ...
      const baseLeg = `LEG-${sourceCode}`.slice(0, 20);
      let candidate = baseLeg;
      let suffix = 2;
      while (usedCodes.has(candidate.toUpperCase())) {
        candidate = `${baseLeg.slice(0, 17)}-${suffix}`;
        suffix += 1;
      }
      usedCodes.add(candidate.toUpperCase());

      return {
        sourceKey,
        docId,
        action: 'create',
        mappingKind: 'create_collision_remapped',
        mappingReason: `Target code ${sourceCode} (${existingWithSameCode[0].name}) differs in meaning/protected; preserved sourceCode ${sourceCode} and assigned non-colliding code ${candidate}.`,
        source: acc,
        assignedCode: candidate,
        collidedWithNativeCode: existingWithSameCode[0].code,
        matchedNativeAccountId: existingWithSameCode[0].id,
        matchedNativeAccountName: existingWithSameCode[0].name,
        mappedAccountType: accountType,
        mappedSubType: subType,
        nativeCurrency,
        legacyCurrencyLabel,
        normalSideBalanceUSD,
        trialDebitUSD,
        trialCreditUSD,
      };
    }

    // 4. Direct creation with original code (non-colliding)
    let assignedCode = sourceCode.slice(0, 24);
    if (usedCodes.has(assignedCode.toUpperCase())) {
      const baseLeg = `LEG-${sourceCode}`.slice(0, 20);
      let candidate = baseLeg;
      let suffix = 2;
      while (usedCodes.has(candidate.toUpperCase())) {
        candidate = `${baseLeg.slice(0, 17)}-${suffix}`;
        suffix += 1;
      }
      assignedCode = candidate;
    }
    usedCodes.add(assignedCode.toUpperCase());

    return {
      sourceKey,
      docId,
      action: 'create',
      mappingKind: 'create_direct',
      mappingReason:
        legacyCurrencyLabel.toUpperCase() === 'MULTIPLE'
          ? `New account ${assignedCode}; preserved legacy currency "Multiple" with USD reference balance.`
          : `New account ${assignedCode} (${accountType} / ${subType}).`,
      source: acc,
      assignedCode,
      mappedAccountType: accountType,
      mappedSubType: subType,
      nativeCurrency,
      legacyCurrencyLabel,
      normalSideBalanceUSD,
      trialDebitUSD,
      trialCreditUSD,
    };
  });
}

function contactsCompatible(
  payloadCust: LegacyInputCustomer,
  nativeClient: Client
): boolean {
  const pEmail = normalizeText(payloadCust.email);
  const cEmail = normalizeText(nativeClient.email);
  if (pEmail && cEmail && pEmail !== cEmail) return false;

  const pPhone = normalizePhone(payloadCust.phone);
  const cPhone = normalizePhone(nativeClient.phone);
  if (pPhone && cPhone && pPhone !== cPhone) return false;

  const pVat = normalizeRef(payloadCust.vatRegistrationNumber);
  const cVat = normalizeRef(nativeClient.vatRegNumber || nativeClient.taxPin);
  if (pVat && cVat && pVat !== cVat) return false;

  return true;
}

export function parseAndPlanLegacyImport(
  rawInput: string | unknown,
  existing: ExistingErpSnapshot
): LegacyImportPlan {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  const emptyPlan = (errMsg: string): LegacyImportPlan => ({
    validStructure: false,
    canImport: false,
    runId: makeDeterministicId('mig', 'invalid'),
    payloadFingerprint: 'invalid',
    asOfDate: '',
    sourceSystem: '',
    targetSystem: '',
    alreadyCreatedInTarget: [],
    constraints: [],
    blockingErrors: [errMsg],
    warnings: [],
    controlChecks: [],
    controlsVerified: false,
    reconciliation: {
      grossReceivablesUSD: 0,
      unappliedCreditsUSD: 0,
      netReceivablesUSD: 0,
      importedPayablesUSD: 0,
      accrualPayablesUSD: 0,
      matchedExistingPayablesUSD: 0,
      totalSourcePayablesUSD: 0,
      nativeUnmatchedPayablesUSD: 0,
      combinedOutstandingPayablesUSD: 0,
      trialBalanceDebitUSD: 0,
      trialBalanceCreditUSD: 0,
    },
    customers: [],
    suppliers: [],
    accounts: [],
    pendingJobs: [],
    receivables: [],
    customerCredits: [],
    supplierPayables: [],
    systemUserReferences: [],
    liabilityBalancesTable: { tableName: 'liabilityBalances', headers: [], rows: [], rowCount: 0 },
    payableLedgerTable: { tableName: 'payableLedger', headers: [], rows: [], rowCount: 0 },
    summaryCounts: {
      totalPlanned: 0,
      toCreate: 0,
      toMatchUpdate: 0,
      toSkipExisting: 0,
      blockedCount: 0,
    },
  });

  let parsed: unknown;
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return emptyPlan('Provide a JSON file or paste legacy migration JSON first.');
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return emptyPlan(
        `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse failed'}`
      );
    }
  } else {
    parsed = rawInput;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyPlan('Root JSON payload must be an object.');
  }

  const root = parsed as Partial<LegacyImportRootPayload>;
  if (root.version !== 1) {
    blockingErrors.push(`Unsupported or missing root.version (expected 1, received ${String(root.version)}).`);
  }
  if (!isNonEmptyStr(root.asOfDate) || !/^\d{4}-\d{2}-\d{2}$/.test(root.asOfDate.trim())) {
    blockingErrors.push('root.asOfDate is required in YYYY-MM-DD format.');
  }
  if (!isNonEmptyStr(root.sourceSystem)) {
    blockingErrors.push('root.sourceSystem is required.');
  }
  if (!isNonEmptyStr(root.targetSystem)) {
    blockingErrors.push('root.targetSystem is required.');
  }
  if (!root.controls || typeof root.controls !== 'object') {
    blockingErrors.push('root.controls object is required.');
  }
  if (!root.data || typeof root.data !== 'object') {
    return emptyPlan('root.data object is required.');
  }

  const data = root.data as Partial<LegacyImportRootPayload['data']>;
  const rawCustomers = Array.isArray(data.customers) ? data.customers : null;
  const rawSuppliers = Array.isArray(data.suppliers) ? data.suppliers : null;
  const rawAccounts = Array.isArray(data.accounts) ? data.accounts : null;
  const rawPendingJobs = Array.isArray(data.pendingJobs) ? data.pendingJobs : null;
  const rawReceivables = Array.isArray(data.receivables) ? data.receivables : null;
  const rawCustomerCredits = Array.isArray(data.customerCredits) ? data.customerCredits : null;
  const rawSupplierPayables = Array.isArray(data.supplierPayables) ? data.supplierPayables : null;

  if (!rawCustomers) blockingErrors.push('data.customers array is required.');
  if (!rawSuppliers) blockingErrors.push('data.suppliers array is required.');
  if (!rawAccounts) blockingErrors.push('data.accounts array is required.');
  if (!rawPendingJobs) blockingErrors.push('data.pendingJobs array is required.');
  if (!rawReceivables) blockingErrors.push('data.receivables array is required.');
  if (!rawCustomerCredits) blockingErrors.push('data.customerCredits array is required.');
  if (!rawSupplierPayables) blockingErrors.push('data.supplierPayables array is required.');

  const safeCustomers = rawCustomers || [];
  const safeSuppliers = rawSuppliers || [];
  const safeAccounts = rawAccounts || [];
  const safePendingJobs = rawPendingJobs || [];
  const safeReceivables = rawReceivables || [];
  const safeCustomerCredits = rawCustomerCredits || [];
  const safeSupplierPayables = rawSupplierPayables || [];

  // System user references (tolerate both {text, value} and {displayName, sourceId})
  const rawUserRefs = Array.isArray(data.systemUserReferences)
    ? data.systemUserReferences
    : [];
  const systemUserReferences: MigrationSystemUserReference[] = [];
  rawUserRefs.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      blockingErrors.push(`data.systemUserReferences[${idx}] must be an object.`);
      return;
    }
    const obj = entry as Record<string, unknown>;
    const text =
      typeof obj.text === 'string' && obj.text.trim()
        ? obj.text.trim()
        : typeof obj.displayName === 'string' && obj.displayName.trim()
          ? obj.displayName.trim()
          : '';
    const value =
      typeof obj.value === 'string' && obj.value.trim()
        ? obj.value.trim()
        : typeof obj.sourceId === 'string' && obj.sourceId.trim()
          ? obj.sourceId.trim()
          : typeof obj.sourceUserId === 'string' && obj.sourceUserId.trim()
            ? obj.sourceUserId.trim()
            : '';
    if (!text || !value) {
      blockingErrors.push(
        `data.systemUserReferences[${idx}] is missing text/displayName or value/sourceId/sourceUserId.`
      );
      return;
    }
    const refEntry: MigrationSystemUserReference = {
      text: text.slice(0, 120),
      value: value.slice(0, 128),
    };
    if (typeof obj.recordType === 'string' && obj.recordType.trim()) {
      refEntry.recordType = obj.recordType.trim().slice(0, 64);
    }
    if (typeof obj.employeeRecordAvailable === 'boolean') {
      refEntry.employeeRecordAvailable = obj.employeeRecordAvailable;
    }
    if (typeof obj.createLoginOrInvite === 'boolean') {
      refEntry.createLoginOrInvite = obj.createLoginOrInvite;
    }
    systemUserReferences.push(refEntry);
  });

  // Validate counts if provided
  if (root.counts && typeof root.counts === 'object') {
    const countMap: Array<[string, number]> = [
      ['customers', safeCustomers.length],
      ['suppliers', safeSuppliers.length],
      ['accounts', safeAccounts.length],
      ['pendingJobs', safePendingJobs.length],
      ['receivables', safeReceivables.length],
      ['receivableInvoices', safeReceivables.length],
      ['customerCredits', safeCustomerCredits.length],
      ['supplierPayables', safeSupplierPayables.length],
      ['systemUserReferences', rawUserRefs.length],
    ];
    countMap.forEach(([key, actualLen]) => {
      if (root.counts && key in root.counts && root.counts[key] !== undefined) {
        const expected = Number(root.counts[key]);
        if (!Number.isFinite(expected) || expected !== actualLen) {
          blockingErrors.push(
            `root.counts.${key} (${root.counts[key]}) does not match detail array length (${actualLen}).`
          );
        }
      }
    });
  }

  // 2D Reference Tables
  const lbResult = normalizeTable('liabilityBalances', data.liabilityBalances ?? []);
  if (lbResult.error) blockingErrors.push(lbResult.error);
  const plResult = normalizeTable('payableLedger', data.payableLedger ?? []);
  if (plResult.error) blockingErrors.push(plResult.error);

  // ---------------------------------------------------------------------------
  // 1. Customers Planning (Rule 1 & Rule 2)
  // ---------------------------------------------------------------------------
  const seenCustomerSourceIds = new Set<string>();
  const resolvedCustomerBySourceId = new Map<
    string,
    { clientId: string; companyName: string; blocked: boolean }
  >();

  // Pre-seed map from existing clients that already have a legacySourceId or Account Notes tag
  existing.clients.forEach((c) => {
    const sid = (c.legacySourceId || extractOldCustomerIdFromNotes(c.notes) || '').trim();
    if (sid) {
      resolvedCustomerBySourceId.set(sid.toLowerCase(), {
        clientId: c.id,
        companyName: c.companyName,
        blocked: false,
      });
    }
  });

  const plannedCustomers: PlannedCustomerItem[] = safeCustomers.map((cust, index) => {
    const sourceId = (cust.sourceId || '').trim();
    const rawName = (cust.name || '').trim();
    const sourceKey = sourceId || `CUST_ROW_${index}`;
    const docId = makeDeterministicId('cli', sourceKey);
    const contactName = (cust.primaryContact || '').trim();
    const email = (cust.email || '').trim();
    const phone = (cust.phone || '').trim();
    const vatReg = (cust.vatRegistrationNumber || '').trim();
    const address = (cust.address || '').trim();
    const paymentTermsDays = normalizePaymentTermsDays(cust.paymentTermsDays, 30);
    const legacyPricingMode = (cust.legacyPricingMode || '').trim().slice(0, 64);
    const creditApproved = Boolean(cust.creditApproved);
    const creditLimitParsed = parseFiniteNonNeg(cust.creditLimitUSD ?? 0);

    if (!sourceId || !rawName) {
      const err = `Customer row ${index + 1} is missing required sourceId or name.`;
      blockingErrors.push(err);
      if (sourceId) {
        resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
          clientId: docId,
          companyName: rawName,
          blocked: true,
        });
      }
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Validation failed',
        source: cust,
        resolvedCompanyName: rawName,
        resolvedContactName: contactName,
        resolvedEmail: email,
        resolvedPhone: phone,
        resolvedVatReg: vatReg,
        resolvedAddress: address,
        resolvedPaymentTermsDays: paymentTermsDays,
        resolvedNotes: '',
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: 0,
        error: err,
      };
    }

    if (creditLimitParsed === null) {
      const err = `Customer "${rawName}" (${sourceId}) has invalid/negative creditLimitUSD.`;
      blockingErrors.push(err);
      resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
        clientId: docId,
        companyName: rawName,
        blocked: true,
      });
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Invalid credit limit',
        source: cust,
        resolvedCompanyName: rawName,
        resolvedContactName: contactName,
        resolvedEmail: email,
        resolvedPhone: phone,
        resolvedVatReg: vatReg,
        resolvedAddress: address,
        resolvedPaymentTermsDays: paymentTermsDays,
        resolvedNotes: '',
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: 0,
        error: err,
      };
    }

    if (seenCustomerSourceIds.has(sourceId.toLowerCase())) {
      const err = `Duplicate customer sourceId "${sourceId}" in payload.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Duplicate sourceId',
        source: cust,
        resolvedCompanyName: rawName,
        resolvedContactName: contactName,
        resolvedEmail: email,
        resolvedPhone: phone,
        resolvedVatReg: vatReg,
        resolvedAddress: address,
        resolvedPaymentTermsDays: paymentTermsDays,
        resolvedNotes: '',
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: creditLimitParsed,
        error: err,
      };
    }
    seenCustomerSourceIds.add(sourceId.toLowerCase());

    // Priority 1: Match by legacySourceId or Account Notes "Old customer ID: <uuid>"
    const directMatches = existing.clients.filter((c) => {
      const cid = (c.legacySourceId || extractOldCustomerIdFromNotes(c.notes) || '').trim();
      return cid && cid.toLowerCase() === sourceId.toLowerCase();
    });

    if (directMatches.length > 1) {
      const err = `Ambiguous existing client match: ${directMatches.length} clients contain Old customer ID ${sourceId}.`;
      blockingErrors.push(err);
      resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
        clientId: directMatches[0].id,
        companyName: directMatches[0].companyName,
        blocked: true,
      });
      return {
        sourceKey,
        docId: directMatches[0].id,
        action: 'blocked',
        matchReason: 'Ambiguous Old customer ID match',
        source: cust,
        resolvedCompanyName: rawName,
        resolvedContactName: contactName,
        resolvedEmail: email,
        resolvedPhone: phone,
        resolvedVatReg: vatReg,
        resolvedAddress: address,
        resolvedPaymentTermsDays: paymentTermsDays,
        resolvedNotes: '',
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: creditLimitParsed,
        error: err,
      };
    }

    if (directMatches.length === 1) {
      const matched = directMatches[0];
      resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
        clientId: matched.id,
        companyName: matched.companyName,
        blocked: false,
      });
      const alreadyLinkedAll =
        matched.legacySourceId === sourceId &&
        matched.legacyPricingMode === (legacyPricingMode || undefined) &&
        Boolean(matched.creditApproved) === creditApproved &&
        round2(matched.creditLimitUSD || 0) === creditLimitParsed;
      return {
        sourceKey,
        docId: matched.id,
        action: alreadyLinkedAll ? 'skip_existing' : 'match_update',
        matchReason: matched.legacySourceId
          ? `Matched existing client "${matched.companyName}" by legacySourceId`
          : `Matched pre-entered client "${matched.companyName}" via Account Notes "Old customer ID: ${sourceId}"`,
        matchedClientId: matched.id,
        source: cust,
        resolvedCompanyName: matched.companyName,
        resolvedContactName: matched.contactName || contactName,
        resolvedEmail: matched.email || email,
        resolvedPhone: matched.phone || phone,
        resolvedVatReg: matched.vatRegNumber || vatReg,
        resolvedAddress: matched.address || address,
        resolvedPaymentTermsDays:
          matched.paymentTermsDays !== undefined && matched.paymentTermsDays !== null
            ? matched.paymentTermsDays
            : paymentTermsDays,
        resolvedNotes: matched.notes || `Old customer ID: ${sourceId}`,
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: creditLimitParsed,
      };
    }

    // Priority 2: Exact normalized name + compatible contacts (when unambiguous)
    const normName = normalizeText(rawName);
    const nameMatches = existing.clients.filter((c) => {
      const cid = (c.legacySourceId || extractOldCustomerIdFromNotes(c.notes) || '').trim();
      if (cid && cid.toLowerCase() !== sourceId.toLowerCase()) return false;
      return normalizeText(c.companyName) === normName && contactsCompatible(cust, c);
    });

    if (nameMatches.length > 1) {
      const err = `Ambiguous client match for "${rawName}" (${nameMatches.length} matching records in register).`;
      blockingErrors.push(err);
      resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
        clientId: docId,
        companyName: rawName,
        blocked: true,
      });
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Ambiguous normalized name match',
        source: cust,
        resolvedCompanyName: rawName,
        resolvedContactName: contactName,
        resolvedEmail: email,
        resolvedPhone: phone,
        resolvedVatReg: vatReg,
        resolvedAddress: address,
        resolvedPaymentTermsDays: paymentTermsDays,
        resolvedNotes: '',
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: creditLimitParsed,
        error: err,
      };
    }

    if (nameMatches.length === 1) {
      const matched = nameMatches[0];
      resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
        clientId: matched.id,
        companyName: matched.companyName,
        blocked: false,
      });
      return {
        sourceKey,
        docId: matched.id,
        action: 'match_update',
        matchReason: `Matched existing client "${matched.companyName}" by exact normalized name + compatible contacts`,
        matchedClientId: matched.id,
        source: cust,
        resolvedCompanyName: matched.companyName,
        resolvedContactName: matched.contactName || contactName,
        resolvedEmail: matched.email || email,
        resolvedPhone: matched.phone || phone,
        resolvedVatReg: matched.vatRegNumber || vatReg,
        resolvedAddress: matched.address || address,
        resolvedPaymentTermsDays:
          matched.paymentTermsDays !== undefined && matched.paymentTermsDays !== null
            ? matched.paymentTermsDays
            : paymentTermsDays,
        resolvedNotes: matched.notes || `Old customer ID: ${sourceId}`,
        legacyPricingMode,
        creditApproved,
        creditLimitUSD: creditLimitParsed,
      };
    }

    // Create new client (no synthetic contactName!)
    resolvedCustomerBySourceId.set(sourceId.toLowerCase(), {
      clientId: docId,
      companyName: rawName,
      blocked: false,
    });
    const noteParts = [`Old customer ID: ${sourceId}`];
    if (legacyPricingMode) noteParts.push(`Legacy pricing: ${legacyPricingMode}`);
    if (creditApproved) noteParts.push(`Credit approved limit $${creditLimitParsed.toFixed(2)}`);

    return {
      sourceKey,
      docId,
      action: 'create',
      matchReason: 'New client in register (blank contacts preserved)',
      source: cust,
      resolvedCompanyName: rawName,
      resolvedContactName: contactName,
      resolvedEmail: email,
      resolvedPhone: phone,
      resolvedVatReg: vatReg,
      resolvedAddress: address,
      resolvedPaymentTermsDays: paymentTermsDays,
      resolvedNotes: noteParts.join(' · ').slice(0, 1000),
      legacyPricingMode,
      creditApproved,
      creditLimitUSD: creditLimitParsed,
    };
  });

  // ---------------------------------------------------------------------------
  // 2. Suppliers Planning (Rule 3)
  // ---------------------------------------------------------------------------
  const seenSupplierKeys = new Set<string>();
  const resolvedSupplierByNormName = new Map<string, { id: string; name: string }>();

  existing.suppliers.forEach((s) => {
    resolvedSupplierByNormName.set(normalizeText(s.name), { id: s.id, name: s.name });
  });

  const plannedSuppliers: PlannedSupplierItem[] = safeSuppliers.map((sup, index) => {
    const rawKey = (sup.sourceKey || '').trim();
    const rawName = (sup.name || '').trim();
    const sourceKey = rawKey || `SUP_ROW_${index}`;
    const docId = makeDeterministicId('sup', sourceKey);
    const phone = (sup.phone || '').trim();
    const email = (sup.email || '').trim();
    const address = (sup.address || '').trim();

    if (!rawKey || !rawName) {
      const err = `Supplier row ${index + 1} is missing required sourceKey or name.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Validation failed',
        source: sup,
        resolvedName: rawName,
        resolvedPhone: phone,
        resolvedEmail: email,
        resolvedAddress: address,
        error: err,
      };
    }

    if (seenSupplierKeys.has(rawKey.toLowerCase())) {
      const err = `Duplicate supplier sourceKey "${rawKey}" in payload.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Duplicate sourceKey',
        source: sup,
        resolvedName: rawName,
        resolvedPhone: phone,
        resolvedEmail: email,
        resolvedAddress: address,
        error: err,
      };
    }
    seenSupplierKeys.add(rawKey.toLowerCase());

    const byKey = existing.suppliers.filter(
      (s) => s.legacySourceKey && s.legacySourceKey.trim().toLowerCase() === rawKey.toLowerCase()
    );
    if (byKey.length === 1) {
      resolvedSupplierByNormName.set(normalizeText(rawName), {
        id: byKey[0].id,
        name: byKey[0].name,
      });
      return {
        sourceKey,
        docId: byKey[0].id,
        action: 'skip_existing',
        matchReason: `Already in supplier register (${byKey[0].name})`,
        matchedSupplierId: byKey[0].id,
        source: sup,
        resolvedName: byKey[0].name,
        resolvedPhone: byKey[0].phone || phone,
        resolvedEmail: byKey[0].email || email,
        resolvedAddress: byKey[0].address || address,
      };
    }

    const normName = normalizeText(rawName);
    const byName = existing.suppliers.filter((s) => normalizeText(s.name) === normName);
    if (byName.length > 1) {
      const err = `Ambiguous supplier match for "${rawName}" (${byName.length} records).`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        matchReason: 'Ambiguous supplier name match',
        source: sup,
        resolvedName: rawName,
        resolvedPhone: phone,
        resolvedEmail: email,
        resolvedAddress: address,
        error: err,
      };
    }

    if (byName.length === 1) {
      resolvedSupplierByNormName.set(normName, {
        id: byName[0].id,
        name: byName[0].name,
      });
      return {
        sourceKey,
        docId: byName[0].id,
        action: 'match_update',
        matchReason: `Matched existing supplier "${byName[0].name}" by normalized name`,
        matchedSupplierId: byName[0].id,
        source: sup,
        resolvedName: byName[0].name,
        resolvedPhone: byName[0].phone || phone,
        resolvedEmail: byName[0].email || email,
        resolvedAddress: byName[0].address || address,
      };
    }

    resolvedSupplierByNormName.set(normName, { id: docId, name: rawName });
    return {
      sourceKey,
      docId,
      action: 'create',
      matchReason: 'New master supplier contact record (no invoice/expense created)',
      source: sup,
      resolvedName: rawName,
      resolvedPhone: phone,
      resolvedEmail: email,
      resolvedAddress: address,
    };
  });

  // ---------------------------------------------------------------------------
  // 3. Chart of Accounts Planning (Rule 4)
  // ---------------------------------------------------------------------------
  const plannedAccounts = planCoaEntries(safeAccounts, existing.chartOfAccounts);
  plannedAccounts.forEach((acc) => {
    if (acc.action === 'blocked' && acc.error) {
      blockingErrors.push(acc.error);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Pending Jobs Planning (Rule 5)
  // ---------------------------------------------------------------------------
  const existingJobsByLegacyRef = new Map<string, Job>();
  existing.jobs.forEach((j) => {
    if (j.legacySourceReference) {
      existingJobsByLegacyRef.set(j.legacySourceReference.trim().toUpperCase(), j);
    }
  });
  const seenJobRefs = new Set<string>();

  const plannedJobs: PlannedJobItem[] = safePendingJobs.map((job, index) => {
    const srcRef = (job.sourceReference || '').trim();
    const custSrcId = (job.customerSourceId || '').trim();
    const custName = (job.customerName || '').trim();
    const sourceKey = srcRef || `JOB_ROW_${index}`;
    const docId = makeDeterministicId('job', sourceKey);
    const val = parseFiniteNonNeg(job.valueUSD);
    const mappedStatusInfo = mapLegacyJobStatus(job.sourceStatus || '');
    const mappedCategory = mapLegacyDivisionToCategory(job.division);
    const specs = Array.isArray(job.lineSpecifications) ? job.lineSpecifications : [];
    const legacyLinesExtracted = specs.length > 0;

    if (!srcRef || !custSrcId || val === null) {
      const err = `Pending job row ${index + 1} (${srcRef || 'no ref'}) is missing sourceReference, customerSourceId, or valid non-negative valueUSD.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Missing reference or invalid valueUSD',
        source: job,
        resolvedClientId: '',
        resolvedClientName: custName,
        mappedStatus: mappedStatusInfo.status,
        mappedCategory,
        legacyLinesExtracted,
        lineSpecsCount: specs.length,
        valueUSD: val ?? 0,
        error: err,
      };
    }

    if (seenJobRefs.has(srcRef.toUpperCase())) {
      const err = `Duplicate pending job sourceReference "${srcRef}" in payload.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Duplicate job reference',
        source: job,
        resolvedClientId: '',
        resolvedClientName: custName,
        mappedStatus: mappedStatusInfo.status,
        mappedCategory,
        legacyLinesExtracted,
        lineSpecsCount: specs.length,
        valueUSD: val,
        error: err,
      };
    }
    seenJobRefs.add(srcRef.toUpperCase());

    const resolvedCust = resolvedCustomerBySourceId.get(custSrcId.toLowerCase());
    if (!resolvedCust || resolvedCust.blocked) {
      const err = `Pending job "${srcRef}" references unresolved or blocked customerSourceId "${custSrcId}" (${custName}).`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Unresolved customer reference',
        source: job,
        resolvedClientId: '',
        resolvedClientName: custName,
        mappedStatus: mappedStatusInfo.status,
        mappedCategory,
        legacyLinesExtracted,
        lineSpecsCount: specs.length,
        valueUSD: val,
        error: err,
      };
    }

    if (!mappedStatusInfo.recognized) {
      warnings.push(
        `Pending job "${srcRef}" has unrecognized sourceStatus "${job.sourceStatus}"; mapped safely to "${mappedStatusInfo.status}" while preserving original status.`
      );
    }

    const existingJob = existingJobsByLegacyRef.get(srcRef.toUpperCase());
    if (existingJob) {
      return {
        sourceKey,
        docId: existingJob.id,
        action: 'skip_existing',
        reason: `Already imported as ${existingJob.jobNumber}`,
        source: job,
        resolvedClientId: resolvedCust.clientId,
        resolvedClientName: resolvedCust.companyName,
        mappedStatus: mappedStatusInfo.status,
        mappedCategory,
        legacyLinesExtracted,
        lineSpecsCount: specs.length,
        valueUSD: val,
      };
    }

    return {
      sourceKey,
      docId,
      action: 'create',
      reason: legacyLinesExtracted
        ? `Create job under ${resolvedCust.companyName}`
        : `Create job under ${resolvedCust.companyName} (line specs not extracted; $${val.toFixed(2)} legacy value preserved)`,
      source: job,
      resolvedClientId: resolvedCust.clientId,
      resolvedClientName: resolvedCust.companyName,
      mappedStatus: mappedStatusInfo.status,
      mappedCategory,
      legacyLinesExtracted,
      lineSpecsCount: specs.length,
      valueUSD: val,
    };
  });

  // ---------------------------------------------------------------------------
  // 5. Receivables & Customer Credits Planning (Rule 6)
  // ---------------------------------------------------------------------------
  const existingObByKey = new Map<string, OpeningBalanceRecord>();
  existing.openingBalances.forEach((ob) => {
    existingObByKey.set(`${ob.recordType}:${ob.sourceKey}`.toLowerCase(), ob);
  });

  const seenReceivableKeys = new Set<string>();
  const plannedReceivables: PlannedReceivableItem[] = safeReceivables.map((rec, index) => {
    const invRef = (rec.sourceInvoiceReference || '').trim();
    const custSrcId = (rec.customerSourceId || '').trim();
    const custName = (rec.customerName || '').trim();
    const outstanding = parseFiniteNonNeg(rec.outstandingUSD);
    const sourceKey = `rec:${invRef || index}:${custSrcId}`;
    const docId = makeDeterministicId('ob_rec', sourceKey);
    const dueDate = (rec.dueDate || '').trim();
    const treatment = (rec.migrationTreatment || 'Opening receivable (non-VAT historical)').trim();

    if (!invRef || !custSrcId || outstanding === null) {
      const err = `Receivable row ${index + 1} (${invRef || 'no ref'}) is missing invoice reference, customerSourceId, or valid non-negative outstandingUSD.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Missing ref or invalid outstandingUSD',
        source: rec,
        resolvedClientId: '',
        resolvedClientName: custName,
        outstandingUSD: outstanding ?? 0,
        dueDate,
        migrationTreatment: treatment,
        error: err,
      };
    }

    if (seenReceivableKeys.has(sourceKey.toLowerCase())) {
      const err = `Duplicate receivable reference "${invRef}" for customer "${custSrcId}".`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Duplicate receivable key',
        source: rec,
        resolvedClientId: '',
        resolvedClientName: custName,
        outstandingUSD: outstanding,
        dueDate,
        migrationTreatment: treatment,
        error: err,
      };
    }
    seenReceivableKeys.add(sourceKey.toLowerCase());

    const resolvedCust = resolvedCustomerBySourceId.get(custSrcId.toLowerCase());
    if (!resolvedCust || resolvedCust.blocked) {
      const err = `Receivable "${invRef}" references unresolved or blocked customerSourceId "${custSrcId}" (${custName}).`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Unresolved customer reference',
        source: rec,
        resolvedClientId: '',
        resolvedClientName: custName,
        outstandingUSD: outstanding,
        dueDate,
        migrationTreatment: treatment,
        error: err,
      };
    }

    const already = existingObByKey.get(`receivable:${sourceKey}`.toLowerCase());
    if (already) {
      return {
        sourceKey,
        docId: already.id,
        action: 'skip_existing',
        reason: 'Historical receivable already imported',
        source: rec,
        resolvedClientId: resolvedCust.clientId,
        resolvedClientName: resolvedCust.companyName,
        outstandingUSD: outstanding,
        dueDate,
        migrationTreatment: treatment,
      };
    }

    return {
      sourceKey,
      docId,
      action: 'create',
      reason: `Opening receivable ${invRef} (excluded from VAT & current sales)`,
      source: rec,
      resolvedClientId: resolvedCust.clientId,
      resolvedClientName: resolvedCust.companyName,
      outstandingUSD: outstanding,
      dueDate,
      migrationTreatment: treatment,
    };
  });

  const seenCreditKeys = new Set<string>();
  const plannedCredits: PlannedCustomerCreditItem[] = safeCustomerCredits.map((cred, index) => {
    const custSrcId = (cred.customerSourceId || '').trim();
    const custName = (cred.customerName || '').trim();
    const creditUSD = parseFiniteNonNeg(cred.unappliedCreditUSD);
    const sourceKey = `cred:${custSrcId || index}`;
    const docId = makeDeterministicId('ob_crd', sourceKey);

    if (!custSrcId || creditUSD === null) {
      const err = `Customer credit row ${index + 1} (${custName || 'unknown'}) is missing customerSourceId or has invalid/negative unappliedCreditUSD.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Invalid credit entry',
        source: cred,
        resolvedClientId: '',
        resolvedClientName: custName,
        unappliedCreditUSD: creditUSD ?? 0,
        error: err,
      };
    }

    if (seenCreditKeys.has(sourceKey.toLowerCase())) {
      const err = `Duplicate unapplied customer credit for customerSourceId "${custSrcId}".`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Duplicate customer credit key',
        source: cred,
        resolvedClientId: '',
        resolvedClientName: custName,
        unappliedCreditUSD: creditUSD,
        error: err,
      };
    }
    seenCreditKeys.add(sourceKey.toLowerCase());

    const resolvedCust = resolvedCustomerBySourceId.get(custSrcId.toLowerCase());
    if (!resolvedCust || resolvedCust.blocked) {
      const err = `Customer credit for "${custName}" references unresolved or blocked customerSourceId "${custSrcId}".`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Unresolved customer reference',
        source: cred,
        resolvedClientId: '',
        resolvedClientName: custName,
        unappliedCreditUSD: creditUSD,
        error: err,
      };
    }

    const already = existingObByKey.get(`customer_credit:${sourceKey}`.toLowerCase());
    if (already) {
      return {
        sourceKey,
        docId: already.id,
        action: 'skip_existing',
        reason: 'Unapplied customer credit already imported',
        source: cred,
        resolvedClientId: resolvedCust.clientId,
        resolvedClientName: resolvedCust.companyName,
        unappliedCreditUSD: creditUSD,
      };
    }

    return {
      sourceKey,
      docId,
      action: 'create',
      reason: 'Opening unapplied customer credit (kept separate from gross receivables)',
      source: cred,
      resolvedClientId: resolvedCust.clientId,
      resolvedClientName: resolvedCust.companyName,
      unappliedCreditUSD: creditUSD,
    };
  });

  // ---------------------------------------------------------------------------
  // 6. Supplier Payables Planning (Rule 7)
  // ---------------------------------------------------------------------------
  const seenPayableKeys = new Set<string>();
  const matchedNativeSupplierInvoiceIds = new Set<string>();

  const plannedPayables: PlannedSupplierPayableItem[] = safeSupplierPayables.map((sp, index) => {
    const supplierName = ((sp.supplierName || sp.supplier || '') as string).trim();
    const rawRef = ((sp.sourceReference || '') as string).trim();
    const rawType = ((sp.recordType || sp.kind || '') as string).trim();
    const outstanding = parseFiniteNonNeg(sp.outstandingUSD);
    const recordedDate = ((sp.recordedDate || '') as string).trim();
    const dueDate = ((sp.dueDate || '') as string).trim();
    const sourceStatus = ((sp.status || '') as string).trim();
    const notes = ((sp.notes || sp.memo || '') as string).trim();

    // Preserve extra metadata safely within Firestore rules (max 20 string entries)
    const preservedMetadata: Record<string, string> = {};
    Object.keys(sp).forEach((k) => {
      if (KNOWN_SUPPLIER_PAYABLE_KEYS.has(k)) return;
      if (Object.keys(preservedMetadata).length >= 20) return;
      const val = sp[k];
      if (val === undefined || val === null) return;
      const serialized =
        typeof val === 'object' ? JSON.stringify(val) : String(val);
      preservedMetadata[k.slice(0, 64)] = serialized.slice(0, 240);
    });

    const isAccrual =
      normalizeText(rawType).includes('accrual') ||
      normalizeText(rawType).includes('opening_accrual') ||
      !rawRef ||
      ['n/a', 'none', 'accrual'].includes(normalizeText(rawRef));

    const recordType: 'supplier_payable_invoice' | 'supplier_opening_accrual' = isAccrual
      ? 'supplier_opening_accrual'
      : 'supplier_payable_invoice';

    const effectiveRef = rawRef || `ACCRUAL-${index + 1}`;
    const sourceKey = isAccrual
      ? `sp_acc:${normalizeText(supplierName)}:${effectiveRef}:${index}`
      : `sp_inv:${normalizeRef(effectiveRef)}:${normalizeText(supplierName)}`;
    const docId = makeDeterministicId('ob_sup', sourceKey);

    if (!supplierName || outstanding === null) {
      const err = `Supplier payable row ${index + 1} (${effectiveRef}) is missing supplier name or has invalid/negative outstandingUSD.`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Missing supplier name or invalid outstandingUSD',
        recordType,
        source: sp,
        sourceReference: effectiveRef,
        supplierName,
        counterpartyId: '',
        recordedDate,
        dueDate,
        outstandingUSD: outstanding ?? 0,
        sourceStatus,
        notes,
        isMatchedExisting: false,
        matchedSupplierInvoiceId: '',
        matchedSupplierInvoiceNo: '',
        preservedMetadata,
        error: err,
      };
    }

    if (seenPayableKeys.has(sourceKey.toLowerCase())) {
      const err = `Duplicate supplier payable key "${effectiveRef}" for "${supplierName}".`;
      blockingErrors.push(err);
      return {
        sourceKey,
        docId,
        action: 'blocked',
        reason: 'Duplicate supplier payable key',
        recordType,
        source: sp,
        sourceReference: effectiveRef,
        supplierName,
        counterpartyId: '',
        recordedDate,
        dueDate,
        outstandingUSD: outstanding,
        sourceStatus,
        notes,
        isMatchedExisting: false,
        matchedSupplierInvoiceId: '',
        matchedSupplierInvoiceNo: '',
        preservedMetadata,
        error: err,
      };
    }
    seenPayableKeys.add(sourceKey.toLowerCase());

    const resolvedSup = resolvedSupplierByNormName.get(normalizeText(supplierName));
    const counterpartyId = resolvedSup?.id || '';

    // Check overlap with existing native supplierInvoices ONLY for formal invoices
    if (recordType === 'supplier_payable_invoice') {
      const normRef = normalizeRef(effectiveRef);
      const candidates = existing.supplierInvoices.filter((si) => {
        const refMatch =
          normalizeRef(si.supplierInvoiceNo) === normRef ||
          normalizeRef(si.recordNumber) === normRef;
        if (!refMatch) return false;
        const amtCompatible =
          Math.abs((si.balanceDue ?? 0) - outstanding) <= 0.01 ||
          Math.abs((si.grossAmount ?? 0) - outstanding) <= 0.01;
        return amtCompatible;
      });

      let narrowed = candidates;
      if (candidates.length > 1) {
        const nameNarrowed = candidates.filter(
          (si) => normalizeText(si.supplierName) === normalizeText(supplierName)
        );
        if (nameNarrowed.length > 0) narrowed = nameNarrowed;
      }

      if (narrowed.length > 1) {
        const err = `Ambiguous overlap match for supplier invoice "${effectiveRef}" ($${outstanding.toFixed(2)}): ${narrowed.length} native supplier invoices match.`;
        blockingErrors.push(err);
        return {
          sourceKey,
          docId,
          action: 'blocked',
          reason: 'Ambiguous existing supplier invoice match',
          recordType,
          source: sp,
          sourceReference: effectiveRef,
          supplierName,
          counterpartyId,
          recordedDate,
          dueDate,
          outstandingUSD: outstanding,
          sourceStatus,
          notes,
          isMatchedExisting: false,
          matchedSupplierInvoiceId: '',
          matchedSupplierInvoiceNo: '',
          preservedMetadata,
          error: err,
        };
      }

      if (narrowed.length === 1) {
        const match = narrowed[0];
        matchedNativeSupplierInvoiceIds.add(match.id);
        const alreadyAudit = existingObByKey.get(
          `supplier_payable_invoice:${sourceKey}`.toLowerCase()
        );
        return {
          sourceKey,
          docId: alreadyAudit ? alreadyAudit.id : docId,
          action: alreadyAudit && alreadyAudit.isMatchedExisting ? 'skip_existing' : 'match_update',
          reason: `Matched existing native supplier invoice ${match.recordNumber} (${match.supplierInvoiceNo}) — linked in audit without double-counting`,
          recordType,
          source: sp,
          sourceReference: effectiveRef,
          supplierName,
          counterpartyId,
          recordedDate,
          dueDate,
          outstandingUSD: outstanding,
          sourceStatus,
          notes,
          isMatchedExisting: true,
          matchedSupplierInvoiceId: match.id,
          matchedSupplierInvoiceNo: match.supplierInvoiceNo || match.recordNumber,
          preservedMetadata,
        };
      }
    }

    const already = existingObByKey.get(`${recordType}:${sourceKey}`.toLowerCase());
    if (already) {
      return {
        sourceKey,
        docId: already.id,
        action: 'skip_existing',
        reason:
          recordType === 'supplier_opening_accrual'
            ? 'Opening accrual already imported'
            : 'Historical supplier payable already imported',
        recordType,
        source: sp,
        sourceReference: effectiveRef,
        supplierName,
        counterpartyId,
        recordedDate,
        dueDate,
        outstandingUSD: outstanding,
        sourceStatus,
        notes,
        isMatchedExisting: already.isMatchedExisting,
        matchedSupplierInvoiceId: already.matchedSupplierInvoiceId || '',
        matchedSupplierInvoiceNo: already.matchedSupplierInvoiceNo || '',
        preservedMetadata,
      };
    }

    return {
      sourceKey,
      docId,
      action: 'create',
      reason:
        recordType === 'supplier_opening_accrual'
          ? 'Unbilled opening supplier accrual (no input VAT or duplicate expense)'
          : 'Unmatched historical supplier invoice (no input VAT or duplicate purchase)',
      recordType,
      source: sp,
      sourceReference: effectiveRef,
      supplierName,
      counterpartyId,
      recordedDate,
      dueDate,
      outstandingUSD: outstanding,
      sourceStatus,
      notes,
      isMatchedExisting: false,
      matchedSupplierInvoiceId: '',
      matchedSupplierInvoiceNo: '',
      preservedMetadata,
    };
  });

  // ---------------------------------------------------------------------------
  // 7. Financial Controls Validation & Reconciliation
  // ---------------------------------------------------------------------------
  const grossReceivablesUSD = round2(
    plannedReceivables.reduce((sum, r) => sum + r.outstandingUSD, 0)
  );
  const unappliedCreditsUSD = round2(
    plannedCredits.reduce((sum, c) => sum + c.unappliedCreditUSD, 0)
  );
  const netReceivablesUSD = round2(grossReceivablesUSD - unappliedCreditsUSD);

  const importedPayablesUSD = round2(
    plannedPayables
      .filter((p) => p.recordType === 'supplier_payable_invoice' && !p.isMatchedExisting)
      .reduce((sum, p) => sum + p.outstandingUSD, 0)
  );
  const accrualPayablesUSD = round2(
    plannedPayables
      .filter((p) => p.recordType === 'supplier_opening_accrual')
      .reduce((sum, p) => sum + p.outstandingUSD, 0)
  );
  const matchedExistingPayablesUSD = round2(
    plannedPayables
      .filter((p) => p.isMatchedExisting)
      .reduce((sum, p) => sum + p.outstandingUSD, 0)
  );
  const totalSourcePayablesUSD = round2(
    importedPayablesUSD + accrualPayablesUSD + matchedExistingPayablesUSD
  );

  const nativeUnmatchedPayablesUSD = round2(
    existing.supplierInvoices
      .filter(
        (si) =>
          !matchedNativeSupplierInvoiceIds.has(si.id) && si.status !== 'Paid'
      )
      .reduce((sum, si) => sum + (si.balanceDue || 0), 0)
  );
  const nativeMatchedPayablesUSD = round2(
    existing.supplierInvoices
      .filter(
        (si) =>
          matchedNativeSupplierInvoiceIds.has(si.id) && si.status !== 'Paid'
      )
      .reduce((sum, si) => sum + (si.balanceDue || 0), 0)
  );
  const combinedOutstandingPayablesUSD = round2(
    importedPayablesUSD +
      accrualPayablesUSD +
      nativeMatchedPayablesUSD +
      nativeUnmatchedPayablesUSD
  );

  const trialBalanceDebitUSD = round2(
    plannedAccounts.reduce((sum, a) => sum + a.trialDebitUSD, 0)
  );
  const trialBalanceCreditUSD = round2(
    plannedAccounts.reduce((sum, a) => sum + a.trialCreditUSD, 0)
  );

  const ctrl = (root.controls || {}) as Partial<LegacyImportControls>;
  const buildCheck = (
    key: ControlCheckResult['key'],
    label: string,
    expectedRaw: unknown,
    actualUSD: number
  ): ControlCheckResult => {
    const expectedParsed = parseFiniteNonNeg(expectedRaw);
    if (expectedParsed === null) {
      blockingErrors.push(`controls.${key} is missing or invalid/negative.`);
      return {
        key,
        label,
        expectedUSD: 0,
        actualUSD,
        diffUSD: actualUSD,
        passed: false,
      };
    }
    const diffUSD = round2(actualUSD - expectedParsed);
    const passed = Math.abs(diffUSD) <= 0.01;
    if (!passed) {
      blockingErrors.push(
        `Control mismatch for ${label}: control=${expectedParsed.toFixed(2)} USD, detail=${actualUSD.toFixed(2)} USD (diff ${diffUSD.toFixed(2)}).`
      );
    }
    return {
      key,
      label,
      expectedUSD: expectedParsed,
      actualUSD,
      diffUSD,
      passed,
    };
  };

  const controlChecks: ControlCheckResult[] = [
    buildCheck('receivablesUSD', 'Customer Receivables', ctrl.receivablesUSD, grossReceivablesUSD),
    buildCheck(
      'unappliedCustomerCreditsUSD',
      'Unapplied Customer Credits',
      ctrl.unappliedCustomerCreditsUSD,
      unappliedCreditsUSD
    ),
    buildCheck(
      'supplierPayablesUSD',
      'Supplier Payables & Accruals',
      ctrl.supplierPayablesUSD,
      totalSourcePayablesUSD
    ),
    buildCheck(
      'trialBalanceDebitUSD',
      'Trial Balance Debits',
      ctrl.trialBalanceDebitUSD,
      trialBalanceDebitUSD
    ),
    buildCheck(
      'trialBalanceCreditUSD',
      'Trial Balance Credits',
      ctrl.trialBalanceCreditUSD,
      trialBalanceCreditUSD
    ),
  ];

  const tbDiff = round2(trialBalanceDebitUSD - trialBalanceCreditUSD);
  const tbBalanced = Math.abs(tbDiff) <= 0.01;
  if (!tbBalanced) {
    blockingErrors.push(
      `Trial balance does not balance: Debits (${trialBalanceDebitUSD.toFixed(2)}) vs Credits (${trialBalanceCreditUSD.toFixed(2)}).`
    );
  }
  controlChecks.push({
    key: 'trialBalanceInBalance',
    label: 'Trial Balance Debit = Credit',
    expectedUSD: trialBalanceDebitUSD,
    actualUSD: trialBalanceCreditUSD,
    diffUSD: tbDiff,
    passed: tbBalanced,
  });

  const controlsVerified = controlChecks.every((c) => c.passed);

  const allItems = [
    ...plannedCustomers,
    ...plannedSuppliers,
    ...plannedAccounts,
    ...plannedJobs,
    ...plannedReceivables,
    ...plannedCredits,
    ...plannedPayables,
  ];
  const toCreate = allItems.filter((i) => i.action === 'create').length;
  const toMatchUpdate = allItems.filter((i) => i.action === 'match_update').length;
  const toSkipExisting = allItems.filter((i) => i.action === 'skip_existing').length;
  const blockedCount = allItems.filter((i) => i.action === 'blocked').length;

  const fingerprintBase = {
    version: root.version,
    asOfDate: root.asOfDate,
    sourceSystem: root.sourceSystem,
    controls: root.controls,
    customerIds: plannedCustomers.map((c) => c.sourceKey),
    supplierKeys: plannedSuppliers.map((s) => s.sourceKey),
    accountCodes: plannedAccounts.map((a) => a.sourceKey),
    jobRefs: plannedJobs.map((j) => j.sourceKey),
    receivableKeys: plannedReceivables.map((r) => r.sourceKey),
    creditKeys: plannedCredits.map((c) => c.sourceKey),
    payableKeys: plannedPayables.map((p) => p.sourceKey),
  };
  const payloadFingerprint = computePayloadFingerprint(fingerprintBase);
  const runId = makeDeterministicId('mig', payloadFingerprint);

  return {
    validStructure: true,
    canImport: blockingErrors.length === 0 && blockedCount === 0 && controlsVerified,
    runId,
    payloadFingerprint,
    asOfDate: (root.asOfDate || '').trim(),
    sourceSystem: (root.sourceSystem || '').trim(),
    targetSystem: (root.targetSystem || '').trim(),
    alreadyCreatedInTarget: Array.isArray(root.alreadyCreatedInTarget)
      ? root.alreadyCreatedInTarget.slice(0, 100).map((x) => ({
          name: String(x?.name || ''),
          status: String(x?.status || ''),
        }))
      : [],
    constraints: Array.isArray(root.constraints)
      ? root.constraints.slice(0, 100).map((c) => String(c))
      : [],
    blockingErrors,
    warnings,
    controlChecks,
    controlsVerified,
    reconciliation: {
      grossReceivablesUSD,
      unappliedCreditsUSD,
      netReceivablesUSD,
      importedPayablesUSD,
      accrualPayablesUSD,
      matchedExistingPayablesUSD,
      totalSourcePayablesUSD,
      nativeUnmatchedPayablesUSD,
      combinedOutstandingPayablesUSD,
      trialBalanceDebitUSD,
      trialBalanceCreditUSD,
    },
    customers: plannedCustomers,
    suppliers: plannedSuppliers,
    accounts: plannedAccounts,
    pendingJobs: plannedJobs,
    receivables: plannedReceivables,
    customerCredits: plannedCredits,
    supplierPayables: plannedPayables,
    systemUserReferences,
    liabilityBalancesTable: lbResult.table,
    payableLedgerTable: plResult.table,
    summaryCounts: {
      totalPlanned: allItems.length,
      toCreate,
      toMatchUpdate,
      toSkipExisting,
      blockedCount,
    },
  };
}

export interface ExecutionRecordIntent {
  category: MigrationRecordCategory;
  sourceKey: string;
  compositeKey: string;
  displayLabel: string;
  intendedOutcome: MigrationRecordOutcome;
  targetCollection: string;
  targetDocId: string;
  needsWrite: boolean;
}

export function buildExecutionIntents(
  plan: LegacyImportPlan,
  options?: { retryFailedOnly?: boolean; failedKeys?: Set<string> }
): ExecutionRecordIntent[] {
  const intents: ExecutionRecordIntent[] = [];
  const onlyFailed = Boolean(options?.retryFailedOnly && options.failedKeys);

  const pushIntent = (
    category: MigrationRecordCategory,
    sourceKey: string,
    displayLabel: string,
    action: PlannedWriteAction,
    targetCollection: string,
    targetDocId: string
  ) => {
    const compositeKey = `${category}:${sourceKey}`;
    if (onlyFailed && !options?.failedKeys?.has(compositeKey)) {
      return;
    }
    const intendedOutcome: MigrationRecordOutcome =
      action === 'create'
        ? 'created'
        : action === 'match_update'
          ? 'matched'
          : action === 'skip_existing'
            ? 'skipped'
            : 'failed';
    intents.push({
      category,
      sourceKey,
      compositeKey,
      displayLabel: displayLabel.slice(0, 200),
      intendedOutcome,
      targetCollection,
      targetDocId,
      needsWrite: action === 'create' || action === 'match_update',
    });
  };

  plan.customers.forEach((c) =>
    pushIntent('customer', c.sourceKey, c.resolvedCompanyName || c.sourceKey, c.action, 'clients', c.docId)
  );
  plan.suppliers.forEach((s) =>
    pushIntent('supplier', s.sourceKey, s.resolvedName || s.sourceKey, s.action, 'suppliers', s.docId)
  );
  plan.accounts.forEach((a) =>
    pushIntent(
      'account',
      a.sourceKey,
      `${a.assignedCode} — ${a.source.name}`,
      a.action,
      'chartOfAccounts',
      a.docId
    )
  );
  plan.pendingJobs.forEach((j) =>
    pushIntent(
      'pending_job',
      j.sourceKey,
      `${j.sourceKey} — ${j.resolvedClientName}`,
      j.action,
      'jobs',
      j.docId
    )
  );
  plan.receivables.forEach((r) =>
    pushIntent(
      'receivable',
      r.sourceKey,
      `${r.source.sourceInvoiceReference} — ${r.resolvedClientName}`,
      r.action,
      'openingBalances',
      r.docId
    )
  );
  plan.customerCredits.forEach((c) =>
    pushIntent(
      'customer_credit',
      c.sourceKey,
      `Credit — ${c.resolvedClientName}`,
      c.action,
      'openingBalances',
      c.docId
    )
  );
  plan.supplierPayables.forEach((p) =>
    pushIntent(
      'supplier_payable',
      p.sourceKey,
      `${p.sourceReference} — ${p.supplierName}`,
      p.action,
      'openingBalances',
      p.docId
    )
  );

  return intents;
}

export function filterPlanForExecution(
  plan: LegacyImportPlan,
  options?: { retryFailedOnly?: boolean; failedKeys?: Iterable<string> }
): LegacyImportPlan {
  if (!options?.retryFailedOnly || !options.failedKeys) {
    return plan;
  }
  const keySet = new Set(options.failedKeys);
  const keepIfFailed = <T extends { sourceKey: string; action: PlannedWriteAction }>(
    category: MigrationRecordCategory,
    items: T[]
  ): T[] =>
    items.map((item) =>
      keySet.has(`${category}:${item.sourceKey}`)
        ? item
        : { ...item, action: 'skip_existing' as PlannedWriteAction }
    );

  return {
    ...plan,
    customers: keepIfFailed('customer', plan.customers),
    suppliers: keepIfFailed('supplier', plan.suppliers),
    accounts: keepIfFailed('account', plan.accounts),
    pendingJobs: keepIfFailed('pending_job', plan.pendingJobs),
    receivables: keepIfFailed('receivable', plan.receivables),
    customerCredits: keepIfFailed('customer_credit', plan.customerCredits),
    supplierPayables: keepIfFailed('supplier_payable', plan.supplierPayables),
  };
}

