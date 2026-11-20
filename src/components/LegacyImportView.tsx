import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileJson,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Upload,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ChartAccount,
  Client,
  CompanySettings,
  Job,
  MigrationReferenceTable,
  MigrationRun,
  MigrationRunRecord,
  MigrationRunStatus,
  OpeningBalanceRecord,
  Supplier,
  SupplierInvoice,
  UserRole,
} from '../types/erp';
import {
  LegacyImportPlan,
  parseAndPlanLegacyImport,
} from '../utils/legacyImport';
import { formatMoney } from '../utils/vat';

interface LegacyImportViewProps {
  role: UserRole;
  settings: CompanySettings;
  clients: Client[];
  suppliers: Supplier[];
  chartOfAccounts: ChartAccount[];
  jobs: Job[];
  supplierInvoices: SupplierInvoice[];
  openingBalances: OpeningBalanceRecord[];
  migrationRuns: MigrationRun[];
  onExecuteImport: (
    plan: LegacyImportPlan,
    options?: {
      retryFailedOnly?: boolean;
      resumeRunId?: string;
      failedKeys?: string[];
      onProgress?: (progress: { phase: string; done: number; total: number }) => void;
    }
  ) => Promise<{
    runId: string;
    status: MigrationRunStatus;
    createdCount: number;
    matchedCount: number;
    skippedCount: number;
    failedCount: number;
    failedKeys: string[];
    lastError: string;
  }>;
  onSubscribeRunDetails: (
    runId: string,
    onRecords: (records: MigrationRunRecord[]) => void,
    onTables: (tables: MigrationReferenceTable[]) => void
  ) => () => void;
}

type PreviewTab =
  | 'overview'
  | 'accounts'
  | 'customers'
  | 'suppliers'
  | 'jobs'
  | 'receivables'
  | 'payables'
  | 'references';

export const LegacyImportView: React.FC<LegacyImportViewProps> = ({
  role,
  settings,
  clients,
  suppliers,
  chartOfAccounts,
  jobs,
  supplierInvoices,
  openingBalances,
  migrationRuns,
  onExecuteImport,
  onSubscribeRunDetails,
}) => {
  const [rawJson, setRawJson] = useState('');
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<LegacyImportPlan | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('overview');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(
    null
  );
  const [execResult, setExecResult] = useState<{
    runId: string;
    status: MigrationRunStatus;
    createdCount: number;
    matchedCount: number;
    skippedCount: number;
    failedCount: number;
    failedKeys: string[];
    lastError: string;
  } | null>(null);
  const [execError, setExecError] = useState('');

  // Audit history inspector state
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [runRecords, setRunRecords] = useState<MigrationRunRecord[]>([]);
  const [runTables, setRunTables] = useState<MigrationReferenceTable[]>([]);
  const [recordFilter, setRecordFilter] = useState<'all' | 'failed' | 'created' | 'matched' | 'skipped'>('all');

  useEffect(() => {
    if (!selectedRunId) {
      setRunRecords([]);
      setRunTables([]);
      return;
    }
    return onSubscribeRunDetails(selectedRunId, setRunRecords, setRunTables);
  }, [selectedRunId, onSubscribeRunDetails]);

  const selectedRun = useMemo(
    () => migrationRuns.find((r) => r.id === selectedRunId) || null,
    [migrationRuns, selectedRunId]
  );

  const filteredRunRecords = useMemo(() => {
    if (recordFilter === 'all') return runRecords;
    return runRecords.filter((r) => r.outcome === recordFilter);
  }, [runRecords, recordFilter]);

  if (role !== 'management') {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-8 text-center max-w-xl mx-auto">
        <ShieldAlert className="h-8 w-8 text-red-600 mx-auto mb-3" />
        <h2 className="font-display text-base font-bold text-slate-900">
          Management Authorization Required
        </h2>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
          Legacy Data Import, historical migration audit logs, and unverified source user
          references are strictly restricted to active Management accounts.
        </p>
      </div>
    );
  }

  const runDryRun = (inputText: string) => {
    setExecError('');
    setExecResult(null);
    const nextPlan = parseAndPlanLegacyImport(inputText, {
      clients,
      suppliers,
      chartOfAccounts,
      jobs,
      supplierInvoices,
      openingBalances,
    });
    setPlan(nextPlan);
    setPreviewTab('overview');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRawJson(text);
    runDryRun(text);
  };

  const handleRefreshDryRun = () => {
    runDryRun(rawJson);
  };

  const handleClear = () => {
    setRawJson('');
    setFileName('');
    setPlan(null);
    setExecResult(null);
    setExecError('');
  };

  const handleExecuteImport = async (retryRun?: MigrationRun) => {
    if (!plan) return;
    setImporting(true);
    setExecError('');
    setProgress({ phase: 'Preparing batch write plan', done: 0, total: 1 });
    try {
      const freshPlan = parseAndPlanLegacyImport(rawJson, {
        clients,
        suppliers,
        chartOfAccounts,
        jobs,
        supplierInvoices,
        openingBalances,
      });
      setPlan(freshPlan);

      const res = await onExecuteImport(
        freshPlan,
        retryRun
          ? {
              retryFailedOnly: true,
              resumeRunId: retryRun.id,
              failedKeys: retryRun.failedKeys,
              onProgress: setProgress,
            }
          : { onProgress: setProgress }
      );
      setExecResult(res);
      setSelectedRunId(res.runId);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header / Scope Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Controlled Legacy Data Import (Management Only)
            </h2>
          </div>
          <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
            Upload a migration JSON file or paste JSON below to run a read-only dry-run
            validation against financial controls, existing clients, Chart of Accounts
            collisions, pending jobs, and existing supplier invoices before writing any records.
            Historical balances never issue duplicate VAT invoices or alter cash floats.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer">
            <Upload className="h-3.5 w-3.5 text-blue-600" />
            <span>{fileName ? `Loaded: ${fileName}` : 'Upload JSON File'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {rawJson && (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* JSON Input Area */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
            <FileJson className="h-3.5 w-3.5 text-slate-500" />
            <span>Migration Payload JSON (v1 Contract)</span>
          </label>
          <span className="text-[11px] text-slate-500 font-mono-nums">
            {rawJson ? `${rawJson.length.toLocaleString()} chars` : 'No payload loaded'}
          </span>
        </div>
        <textarea
          rows={6}
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          placeholder='Paste JSON contract {"version":1,"asOfDate":"YYYY-MM-DD",...} or upload a .json file above.'
          className="w-full border border-slate-200 rounded-md p-3 text-xs font-mono-nums bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Re-running the same payload uses deterministic keys to prevent duplicates and
            preserve existing target records.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!rawJson.trim() || importing}
              onClick={handleRefreshDryRun}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Validate &amp; Preview (Dry Run)</span>
            </button>
            <button
              type="button"
              disabled={!plan || !plan.canImport || importing}
              onClick={() => handleExecuteImport()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{importing ? 'Importing...' : 'Import Validated Data'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Live Progress */}
      {progress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
            <span>{progress.phase}</span>
            <span className="font-mono-nums">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{
                width: `${
                  progress.total > 0
                    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
                    : 20
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Execution Error or Result */}
      {execError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-800 flex items-start gap-2.5">
          <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Import Execution Error</div>
            <div className="mt-1">{execError}</div>
          </div>
        </div>
      )}

      {execResult && (
        <div
          className={`border rounded-lg p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            execResult.status === 'completed'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              {execResult.status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
              <span>
                Run {execResult.runId} finished with status:{' '}
                <strong className="uppercase">{execResult.status}</strong>
              </span>
            </div>
            <div className="font-mono-nums">
              Created: {execResult.createdCount} · Matched/Linked: {execResult.matchedCount} ·
              Skipped Existing: {execResult.skippedCount} · Failed: {execResult.failedCount}
            </div>
            {execResult.lastError && (
              <div className="text-red-700">Last error: {execResult.lastError}</div>
            )}
          </div>
          {execResult.status === 'partial_failed' && (
            <button
              type="button"
              disabled={importing}
              onClick={() =>
                handleExecuteImport({
                  id: execResult.runId,
                  failedKeys: execResult.failedKeys,
                } as MigrationRun)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry Failed ({execResult.failedCount})</span>
            </button>
          )}
        </div>
      )}

      {/* Dry-Run Preview Results */}
      {plan && (
        <div className="space-y-5">
          {/* Control Totals Verification */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Dry-Run Validation &amp; Control Reconciliation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono-nums">
                  {plan.sourceSystem || '—'} → {plan.targetSystem || '—'} · As of:{' '}
                  {plan.asOfDate || '—'} · Deterministic Run ID: {plan.runId}
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded text-xs font-semibold border ${
                  plan.canImport
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {plan.canImport
                  ? 'Controls Verified — Ready to Import'
                  : 'Blocked — Resolve Errors Before Importing'}
              </div>
            </div>

            {plan.controlChecks.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {plan.controlChecks.map((chk) => (
                  <div
                    key={chk.key}
                    className={`border rounded-md p-3 text-xs ${
                      chk.passed
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-red-300 bg-red-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{chk.label}</span>
                      {chk.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="mt-2 font-mono-nums flex justify-between text-[11px] text-slate-600">
                      <span>Control: {formatMoney(chk.expectedUSD, 'USD')}</span>
                      <span>Detail: {formatMoney(chk.actualUSD, 'USD')}</span>
                    </div>
                    {!chk.passed && (
                      <div className="mt-1 font-mono-nums text-[11px] font-semibold text-red-700">
                        Variance: {formatMoney(chk.diffUSD, 'USD')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Blocking Errors & Warnings */}
            {plan.blockingErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 space-y-1.5 text-xs text-red-900">
                <div className="font-semibold flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span>Blocking Validation Errors ({plan.blockingErrors.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 max-h-48 overflow-y-auto">
                  {plan.blockingErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-1.5 text-xs text-amber-900">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Migration Review Notes ({plan.warnings.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 max-h-36 overflow-y-auto">
                  {plan.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Financial Opening Reconciliation Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">Gross Receivables</div>
                <div className="mt-1 font-mono-nums text-sm font-bold text-slate-900">
                  {formatMoney(plan.reconciliation.grossReceivablesUSD, 'USD')}
                </div>
              </div>
              <div className="border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">Unapplied Credits (Sep.)</div>
                <div className="mt-1 font-mono-nums text-sm font-bold text-emerald-700">
                  -{formatMoney(plan.reconciliation.unappliedCreditsUSD, 'USD')}
                </div>
              </div>
              <div className="border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">Net Receivables</div>
                <div className="mt-1 font-mono-nums text-sm font-bold text-blue-700">
                  {formatMoney(plan.reconciliation.netReceivablesUSD, 'USD')}
                </div>
              </div>
              <div className="border border-slate-200 rounded-md p-3">
                <div className="text-[11px] text-slate-500">
                  Combined AP Outstanding
                </div>
                <div className="mt-1 font-mono-nums text-sm font-bold text-slate-900">
                  {formatMoney(plan.reconciliation.combinedOutstandingPayablesUSD, 'USD')}
                </div>
                <div className="text-[10px] text-slate-500 font-mono-nums mt-0.5">
                  Src {formatMoney(plan.reconciliation.totalSourcePayablesUSD, 'USD')} · Matched{' '}
                  {formatMoney(plan.reconciliation.matchedExistingPayablesUSD, 'USD')}
                </div>
              </div>
            </div>
          </div>

          {/* Preview Sub-Tabs */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-2.5 border-b border-slate-200 bg-slate-50 flex items-center gap-1 overflow-x-auto">
              {(
                [
                  ['overview', `Overview (${plan.summaryCounts.totalPlanned})`],
                  ['accounts', `Accounts & Collisions (${plan.accounts.length})`],
                  ['customers', `Customers (${plan.customers.length})`],
                  ['suppliers', `Suppliers (${plan.suppliers.length})`],
                  ['jobs', `Pending Jobs (${plan.pendingJobs.length})`],
                  [
                    'receivables',
                    `Receivables & Credits (${plan.receivables.length + plan.customerCredits.length})`,
                  ],
                  ['payables', `Supplier Payables (${plan.supplierPayables.length})`],
                  ['references', `User Refs & 2D Tables`],
                ] as Array<[PreviewTab, string]>
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setPreviewTab(tabId)}
                  className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                    previewTab === tabId
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {previewTab === 'overview' && (
                <div className="space-y-5">
                  <div className="overflow-x-auto border border-slate-200 rounded-md">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 text-right">Total</th>
                          <th className="py-2.5 px-3 text-right">New Create</th>
                          <th className="py-2.5 px-3 text-right">Match / Link</th>
                          <th className="py-2.5 px-3 text-right">Skip Existing</th>
                          <th className="py-2.5 px-3 text-right">Blocked</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono-nums">
                        {(
                          [
                            ['Customers', plan.customers],
                            ['Suppliers (Master)', plan.suppliers],
                            ['Chart of Accounts', plan.accounts],
                            ['Pending Jobs', plan.pendingJobs],
                            ['Receivables (Opening)', plan.receivables],
                            ['Customer Credits', plan.customerCredits],
                            ['Supplier Payables & Accruals', plan.supplierPayables],
                          ] as Array<[string, Array<{ action: string }>]>
                        ).map(([label, rows]) => (
                          <tr key={label}>
                            <td className="py-2 px-3 font-sans font-medium text-slate-900">
                              {label}
                            </td>
                            <td className="py-2 px-3 text-right">{rows.length}</td>
                            <td className="py-2 px-3 text-right text-blue-700">
                              {rows.filter((r) => r.action === 'create').length}
                            </td>
                            <td className="py-2 px-3 text-right text-emerald-700">
                              {rows.filter((r) => r.action === 'match_update').length}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-500">
                              {rows.filter((r) => r.action === 'skip_existing').length}
                            </td>
                            <td className="py-2 px-3 text-right text-red-700">
                              {rows.filter((r) => r.action === 'blocked').length}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(plan.alreadyCreatedInTarget.length > 0 || plan.constraints.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="border border-slate-200 rounded-md p-3.5 space-y-2">
                        <div className="font-semibold text-slate-800">
                          Already Created in Target ({plan.alreadyCreatedInTarget.length})
                        </div>
                        <ul className="space-y-1 text-slate-600">
                          {plan.alreadyCreatedInTarget.map((item, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span>{item.name}</span>
                              <span className="font-mono-nums text-slate-500">{item.status}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="border border-slate-200 rounded-md p-3.5 space-y-2">
                        <div className="font-semibold text-slate-800">
                          Source Migration Constraints ({plan.constraints.length})
                        </div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600">
                          {plan.constraints.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {previewTab === 'accounts' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">Source Code</th>
                        <th className="py-2.5 px-3">Assigned Code</th>
                        <th className="py-2.5 px-3">Account Name</th>
                        <th className="py-2.5 px-3">Mapped Type</th>
                        <th className="py-2.5 px-3">Currency Label</th>
                        <th className="py-2.5 px-3 text-right">Normal Bal. USD</th>
                        <th className="py-2.5 px-3 text-right">Debit USD</th>
                        <th className="py-2.5 px-3 text-right">Credit USD</th>
                        <th className="py-2.5 px-3">Mapping Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.accounts.map((acc) => (
                        <tr key={acc.sourceKey}>
                          <td className="py-2 px-3 font-mono-nums font-semibold">
                            {acc.source.sourceCode}
                          </td>
                          <td className="py-2 px-3 font-mono-nums font-bold text-blue-700">
                            {acc.assignedCode}
                            {acc.mappingKind === 'create_collision_remapped' && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                                Remapped
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {acc.source.name}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {acc.mappedAccountType} / {acc.mappedSubType}
                          </td>
                          <td className="py-2 px-3 font-mono-nums text-slate-600">
                            {acc.legacyCurrencyLabel} → {acc.nativeCurrency}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono-nums ${
                              acc.normalSideBalanceUSD < 0
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-700'
                            }`}
                          >
                            {formatMoney(acc.normalSideBalanceUSD, 'USD')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums">
                            {formatMoney(acc.trialDebitUSD, 'USD')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums">
                            {formatMoney(acc.trialCreditUSD, 'USD')}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {acc.error ? (
                              <span className="text-red-700 font-medium">{acc.error}</span>
                            ) : (
                              acc.mappingReason
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewTab === 'customers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Source ID</th>
                        <th className="py-2.5 px-3">Contacts</th>
                        <th className="py-2.5 px-3 text-right">Terms</th>
                        <th className="py-2.5 px-3">Credit / Pricing</th>
                        <th className="py-2.5 px-3">Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.customers.map((c) => (
                        <tr key={c.sourceKey}>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {c.resolvedCompanyName || '—'}
                            <div className="text-[11px] text-slate-500">
                              Contact: {c.resolvedContactName || 'Not recorded'}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono-nums text-[11px] text-slate-500">
                            {c.source.sourceId}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <div>{c.resolvedPhone || '—'}</div>
                            <div className="text-slate-400">{c.resolvedEmail || '—'}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums">
                            Net {c.resolvedPaymentTermsDays}d
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <div>{c.legacyPricingMode || '—'}</div>
                            <div className="font-mono-nums text-[11px]">
                              {c.creditApproved
                                ? `Approved: ${formatMoney(c.creditLimitUSD, 'USD')}`
                                : 'No credit'}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`text-[11px] font-medium ${
                                c.action === 'blocked'
                                  ? 'text-red-700'
                                  : c.action === 'match_update'
                                    ? 'text-emerald-700'
                                    : c.action === 'create'
                                      ? 'text-blue-700'
                                      : 'text-slate-500'
                              }`}
                            >
                              {c.error || c.matchReason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewTab === 'suppliers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">Supplier Name</th>
                        <th className="py-2.5 px-3">Source Key</th>
                        <th className="py-2.5 px-3">Phone / Email</th>
                        <th className="py-2.5 px-3">Address</th>
                        <th className="py-2.5 px-3">Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.suppliers.map((s) => (
                        <tr key={s.sourceKey}>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {s.resolvedName || '—'}
                          </td>
                          <td className="py-2 px-3 font-mono-nums text-slate-500">
                            {s.sourceKey}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <div>{s.resolvedPhone || '—'}</div>
                            <div className="text-slate-400">{s.resolvedEmail || '—'}</div>
                          </td>
                          <td className="py-2 px-3 text-slate-600">{s.resolvedAddress || '—'}</td>
                          <td className="py-2 px-3 text-slate-600">
                            {s.error ? (
                              <span className="text-red-700 font-medium">{s.error}</span>
                            ) : (
                              s.matchReason
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewTab === 'jobs' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">Source Ref</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Division</th>
                        <th className="py-2.5 px-3">Source → Mapped Status</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3 text-right">Value USD</th>
                        <th className="py-2.5 px-3">Line Specs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.pendingJobs.map((j) => (
                        <tr key={j.sourceKey}>
                          <td className="py-2 px-3 font-mono-nums font-semibold">
                            {j.sourceKey}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {j.resolvedClientName || j.source.customerName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {j.source.division || j.mappedCategory}
                          </td>
                          <td className="py-2 px-3">
                            <span className="text-slate-500">{j.source.sourceStatus}</span> →{' '}
                            <strong className="text-slate-900">{j.mappedStatus}</strong>
                          </td>
                          <td className="py-2 px-3 font-mono-nums text-slate-600">
                            {j.source.dueDate || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums font-semibold">
                            {formatMoney(j.valueUSD, 'USD')}
                          </td>
                          <td className="py-2 px-3">
                            {j.error ? (
                              <span className="text-red-700 font-medium">{j.error}</span>
                            ) : j.legacyLinesExtracted ? (
                              <span className="text-emerald-700">
                                {j.lineSpecsCount} spec(s)
                              </span>
                            ) : (
                              <span className="text-amber-700">Not extracted (value retained)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewTab === 'receivables' && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">
                      Historical Customer Receivables ({plan.receivables.length})
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2 px-3">Invoice Ref</th>
                            <th className="py-2 px-3">Customer</th>
                            <th className="py-2 px-3">Due Date</th>
                            <th className="py-2 px-3">Treatment</th>
                            <th className="py-2 px-3 text-right">Outstanding USD</th>
                            <th className="py-2 px-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {plan.receivables.map((r) => (
                            <tr key={r.sourceKey}>
                              <td className="py-2 px-3 font-mono-nums font-semibold">
                                {r.source.sourceInvoiceReference}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {r.resolvedClientName}
                              </td>
                              <td className="py-2 px-3 font-mono-nums text-slate-600">
                                {r.dueDate || '—'}
                              </td>
                              <td className="py-2 px-3 text-slate-600">{r.migrationTreatment}</td>
                              <td className="py-2 px-3 text-right font-mono-nums font-semibold">
                                {formatMoney(r.outstandingUSD, 'USD')}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {r.error ? (
                                  <span className="text-red-700">{r.error}</span>
                                ) : (
                                  r.action
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">
                      Unapplied Customer Credits ({plan.customerCredits.length})
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2 px-3">Customer</th>
                            <th className="py-2 px-3">Source ID</th>
                            <th className="py-2 px-3 text-right">Unapplied Credit USD</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {plan.customerCredits.map((c) => (
                            <tr key={c.sourceKey}>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {c.resolvedClientName}
                              </td>
                              <td className="py-2 px-3 font-mono-nums text-slate-500">
                                {c.source.customerSourceId}
                              </td>
                              <td className="py-2 px-3 text-right font-mono-nums font-semibold text-emerald-700">
                                {formatMoney(c.unappliedCreditUSD, 'USD')}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {c.error ? (
                                  <span className="text-red-700">{c.error}</span>
                                ) : (
                                  c.reason
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {previewTab === 'payables' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3">Classification</th>
                        <th className="py-2.5 px-3">Due Date</th>
                        <th className="py-2.5 px-3 text-right">Outstanding USD</th>
                        <th className="py-2.5 px-3">Overlap / Audit Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plan.supplierPayables.map((sp) => (
                        <tr key={sp.sourceKey}>
                          <td className="py-2 px-3 font-mono-nums font-semibold">
                            {sp.sourceReference}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-900">
                            {sp.supplierName || '—'}
                          </td>
                          <td className="py-2 px-3">
                            {sp.isMatchedExisting ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px]">
                                Matched Native ({sp.matchedSupplierInvoiceNo})
                              </span>
                            ) : sp.recordType === 'supplier_opening_accrual' ? (
                              <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                                Opening Accrual
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[11px]">
                                Opening Invoice
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono-nums text-slate-600">
                            {sp.dueDate || '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-nums font-semibold">
                            {formatMoney(sp.outstandingUSD, 'USD')}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {sp.error ? (
                              <span className="text-red-700 font-medium">{sp.error}</span>
                            ) : (
                              <div>
                                <div>{sp.reason}</div>
                                {Object.keys(sp.preservedMetadata).length > 0 && (
                                  <div className="text-[10px] font-mono-nums text-slate-400 mt-0.5">
                                    Preserved keys:{' '}
                                    {Object.keys(sp.preservedMetadata).join(', ')}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewTab === 'references' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                      <Users className="h-3.5 w-3.5 text-slate-500" />
                      <span>
                        Unverified Source User References ({plan.systemUserReferences.length}) —
                        Read-Only Audit Reference (No Login Accounts or Payroll Created)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                      {plan.systemUserReferences.map((u, idx) => (
                        <div
                          key={`${u.value}-${idx}`}
                          className="border border-slate-200 rounded px-3 py-2 bg-slate-50 space-y-0.5"
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-slate-900">{u.text}</span>
                            <span className="font-mono-nums text-[11px] text-slate-500 truncate max-w-[140px]">
                              {u.value}
                            </span>
                          </div>
                          {(u.recordType || u.employeeRecordAvailable === false || u.createLoginOrInvite === false) && (
                            <div className="text-[10px] text-slate-500">
                              {[
                                u.recordType ? `Type: ${u.recordType}` : '',
                                u.employeeRecordAvailable === false ? 'No employee record' : '',
                                u.createLoginOrInvite === false ? 'No login/invite' : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {[plan.liabilityBalancesTable, plan.payableLedgerTable].map((tbl) => (
                    <div key={tbl.tableName}>
                      <h4 className="text-xs font-semibold text-slate-800 mb-2">
                        2D Reference Table: {tbl.tableName} ({tbl.rowCount} rows)
                      </h4>
                      {tbl.headers.length === 0 ? (
                        <div className="text-xs text-slate-500">No rows recorded.</div>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-md max-h-64 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                                {tbl.headers.map((h, hi) => (
                                  <th key={hi} className="py-2 px-2.5 whitespace-nowrap">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono-nums">
                              {tbl.rows.slice(0, 50).map((row, ri) => (
                                <tr key={ri}>
                                  {row.cells.map((cell, ci) => (
                                    <td
                                      key={ci}
                                      className="py-1.5 px-2.5 text-slate-700 whitespace-nowrap"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historical Migration Runs & Audit Log */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-600" />
            <h3 className="font-display text-sm font-bold text-slate-900">
              Saved Migration Runs &amp; Audit History ({migrationRuns.length})
            </h3>
          </div>
        </div>

        {migrationRuns.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No legacy migration runs recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 px-4">Run ID</th>
                  <th className="py-2.5 px-4">Source / As Of</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Created</th>
                  <th className="py-2.5 px-4 text-right">Matched</th>
                  <th className="py-2.5 px-4 text-right">Skipped</th>
                  <th className="py-2.5 px-4 text-right">Failed</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {migrationRuns.map((run) => {
                  const canRetryWithLoaded =
                    run.status === 'partial_failed' &&
                    plan &&
                    plan.payloadFingerprint === run.payloadFingerprint;
                  return (
                    <tr key={run.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono-nums font-semibold text-slate-900">
                        {run.id}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{run.sourceSystem}</div>
                        <div className="text-[11px] text-slate-500 font-mono-nums">
                          As of {run.asOfDate} · By {run.executedByName}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                            run.status === 'completed'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : run.status === 'partial_failed'
                                ? 'bg-red-50 border-red-200 text-red-800'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {run.createdCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {run.matchedCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums">
                        {run.skippedCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-nums text-red-700 font-semibold">
                        {run.failedCount}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRunId(selectedRunId === run.id ? '' : run.id)
                          }
                          className="px-2.5 py-1 rounded border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {selectedRunId === run.id ? 'Hide Audit' : 'Inspect Audit'}
                        </button>
                        {run.status === 'partial_failed' && (
                          <button
                            type="button"
                            disabled={!canRetryWithLoaded || importing}
                            title={
                              canRetryWithLoaded
                                ? 'Retry only failed records from this run'
                                : 'Load or paste the matching JSON payload above to retry failed items'
                            }
                            onClick={() => handleExecuteImport(run)}
                            className="px-2.5 py-1 rounded bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-40"
                          >
                            Retry Failed
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Selected Run Record Audit Drawer */}
        {selectedRun && (
          <div className="border-t border-slate-200 p-5 bg-slate-50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display text-xs font-bold text-slate-900">
                  Record Audit Trail — {selectedRun.id}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono-nums">
                  Net Receivables: {formatMoney(selectedRun.netReceivablesUSD, 'USD')} · Total
                  Source AP: {formatMoney(selectedRun.totalSupplierPayablesUSD, 'USD')} ·
                  Unverified User Refs: {selectedRun.systemUserReferences?.length || 0}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {(['all', 'failed', 'created', 'matched', 'skipped'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setRecordFilter(f)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize ${
                      recordFilter === f
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-md overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Source Key</th>
                    <th className="py-2 px-3">Label</th>
                    <th className="py-2 px-3">Outcome</th>
                    <th className="py-2 px-3">Target</th>
                    <th className="py-2 px-3">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRunRecords.map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-1.5 px-3 font-mono-nums text-[11px] text-slate-600">
                        {rec.category}
                      </td>
                      <td className="py-1.5 px-3 font-mono-nums text-[11px]">
                        {rec.sourceKey}
                      </td>
                      <td className="py-1.5 px-3 font-medium text-slate-900">
                        {rec.displayLabel}
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            rec.outcome === 'failed'
                              ? 'text-red-700'
                              : rec.outcome === 'matched'
                                ? 'text-emerald-700'
                                : rec.outcome === 'created'
                                  ? 'text-blue-700'
                                  : 'text-slate-500'
                          }`}
                        >
                          {rec.outcome}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 font-mono-nums text-[11px] text-slate-500">
                        {rec.targetCollection}/{rec.targetDocId}
                      </td>
                      <td className="py-1.5 px-3 text-red-700 text-[11px]">
                        {rec.errorMessage || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedRun.systemUserReferences &&
              selectedRun.systemUserReferences.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-md p-3.5">
                  <div className="text-[11px] font-semibold text-slate-700 mb-2">
                    Stored Read-Only System User References (
                    {selectedRun.systemUserReferences.length})
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {selectedRun.systemUserReferences.map((u, idx) => (
                      <span
                        key={`${u.value}-${idx}`}
                        className="px-2 py-1 rounded border border-slate-200 bg-slate-50 font-mono-nums text-slate-700"
                      >
                        {u.text} ({u.value})
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {runTables.length > 0 && (
              <div className="text-[11px] text-slate-600 font-mono-nums">
                Archived 2D Reference Tables:{' '}
                {runTables.map((t) => `${t.tableName} (${t.rowCount} rows)`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
