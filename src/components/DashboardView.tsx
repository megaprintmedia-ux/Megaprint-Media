import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Database,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import {
  Client,
  CompanySettings,
  Employee,
  Expense,
  InventoryItem,
  Invoice,
  Job,
  LeaveRequest,
  NavSection,
  NoteAudience,
  NoteTone,
  OperationalNote,
  ServiceCategory,
  SupplierInvoice,
  TimeEntry,
  UserRole,
} from '../types/erp';
import { calculateJobCosting, formatMoney } from '../utils/vat';
import { StatusText } from './StatusText';

interface DashboardViewProps {
  role: UserRole;
  settings: CompanySettings;
  jobs: Job[];
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
  supplierInvoices: SupplierInvoice[];
  inventoryItems: InventoryItem[];
  employees: Employee[];
  timeEntries: TimeEntry[];
  leaveRequests: LeaveRequest[];
  notes: OperationalNote[];
  onNavigate: (section: NavSection) => void;
  onOpenJobCard: (job: Job) => void;
  onSeedSampleData: () => Promise<void>;
  onCreateNote: (input: {
    title: string;
    body: string;
    audience: NoteAudience;
    tone: NoteTone;
    pinned: boolean;
  }) => Promise<void>;
  onTogglePinNote: (note: OperationalNote) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}

const CATEGORIES: ServiceCategory[] = [
  'Printing',
  'Branding',
  'Corporate Wear',
  'Tailoring',
];

function extractMonthKey(timestampVal: unknown, fallbackDate?: string): string {
  if (fallbackDate && /^\d{4}-\d{2}/.test(fallbackDate)) {
    return fallbackDate.slice(0, 7);
  }
  if (timestampVal && typeof timestampVal === 'object' && 'toDate' in timestampVal) {
    const dt = (timestampVal as { toDate: () => Date }).toDate();
    if (!Number.isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 7);
    }
  }
  if (typeof timestampVal === 'string' && /^\d{4}-\d{2}/.test(timestampVal)) {
    return timestampVal.slice(0, 7);
  }
  return new Date().toISOString().slice(0, 7);
}

function formatMonthLabel(monthKey: string): string {
  const [yr, mo] = monthKey.split('-').map(Number);
  if (!yr || !mo) return monthKey;
  return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

const NOTE_AUDIENCES: NoteAudience[] = [
  'All Staff',
  'Production',
  'Sales & Marketing',
  'Accounts',
];

const NOTE_TONE_STYLES: Record<
  NoteTone,
  { label: string; cardClass: string; swatchClass: string }
> = {
  amber: {
    label: 'Warm Yellow',
    cardClass: 'bg-amber-50/90 border-amber-200',
    swatchClass: 'bg-amber-200 border-amber-400',
  },
  sky: {
    label: 'Workshop Blue',
    cardClass: 'bg-sky-50/90 border-sky-200',
    swatchClass: 'bg-sky-200 border-sky-400',
  },
  emerald: {
    label: 'Mint Green',
    cardClass: 'bg-emerald-50/90 border-emerald-200',
    swatchClass: 'bg-emerald-200 border-emerald-400',
  },
  slate: {
    label: 'Neutral Paper',
    cardClass: 'bg-slate-50 border-slate-200',
    swatchClass: 'bg-slate-200 border-slate-400',
  },
};

function formatNoteDate(timestampVal: unknown): string {
  if (timestampVal && typeof timestampVal === 'object' && 'toDate' in timestampVal) {
    const dt = (timestampVal as { toDate: () => Date }).toDate();
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  }
  return 'Just now';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  role,
  settings,
  jobs,
  clients,
  invoices,
  expenses,
  supplierInvoices,
  inventoryItems,
  employees,
  timeEntries,
  leaveRequests,
  notes,
  onNavigate,
  onOpenJobCard,
  onSeedSampleData,
  onCreateNote,
  onTogglePinNote,
  onDeleteNote,
}) => {
  const [seeding, setSeeding] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteAudience, setNoteAudience] = useState<NoteAudience>('All Staff');
  const [noteTone, setNoteTone] = useState<NoteTone>('amber');
  const [notePinned, setNotePinned] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [notes]);

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = noteTitle.trim();
    const cleanBody = noteBody.trim();
    if (!cleanTitle || !cleanBody) {
      setNoteError('Please enter both a reminder headline and message.');
      return;
    }
    setNoteError(null);
    setSavingNote(true);
    try {
      await onCreateNote({
        title: cleanTitle,
        body: cleanBody,
        audience: noteAudience,
        tone: noteTone,
        pinned: notePinned,
      });
      setNoteTitle('');
      setNoteBody('');
      setNoteAudience('All Staff');
      setNoteTone('amber');
      setNotePinned(false);
      setShowNoteForm(false);
    } catch {
      setNoteError('Could not save reminder. Please check your permissions and try again.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePin = async (note: OperationalNote) => {
    setNoteBusyId(note.id);
    try {
      await onTogglePinNote(note);
    } finally {
      setNoteBusyId(null);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setNoteBusyId(noteId);
    try {
      await onDeleteNote(noteId);
    } finally {
      setNoteBusyId(null);
    }
  };

  const metrics = useMemo(() => {
    const activeJobs = jobs.filter(
      (j) => j.status !== 'Completed' && j.status !== 'Cancelled'
    );
    const totalQuotedNet = jobs
      .filter((j) => j.status !== 'Cancelled')
      .reduce((acc, j) => acc + (j.netTotal || 0), 0);

    const outputVat = invoices
      .filter((i) => i.status !== 'Void' && i.status !== 'Draft')
      .reduce((acc, i) => acc + (i.vatAmount || 0), 0);

    const inputVat =
      expenses
        .filter((e) => e.isVatClaimable)
        .reduce((acc, e) => acc + (e.vatAmount || 0), 0) +
      supplierInvoices
        .filter((s) => s.isVatClaimable)
        .reduce((acc, s) => acc + (s.vatAmount || 0), 0);

    const netVatPayable = outputVat - inputVat;

    const receivables = invoices
      .filter((i) => i.status !== 'Void' && i.status !== 'Draft')
      .reduce((acc, i) => acc + (i.balanceDue || 0), 0);

    const margins = jobs
      .filter((j) => j.netTotal > 0 && j.status !== 'Cancelled')
      .map((j) => calculateJobCosting(j).grossMarginPct);
    const avgMargin =
      margins.length > 0
        ? margins.reduce((a, b) => a + b, 0) / margins.length
        : 0;

    const clockedInCount = timeEntries.filter(
      (t) => t.status === 'Clocked In'
    ).length;

    const pendingLeave = leaveRequests.filter((l) => l.status === 'Pending').length;
    const lowStockCount = inventoryItems.filter(
      (i) => i.status === 'Low Stock' || i.status === 'Out of Stock'
    ).length;

    return {
      activeJobsCount: activeJobs.length,
      totalQuotedNet,
      outputVat,
      inputVat,
      netVatPayable,
      receivables,
      avgMargin,
      clockedInCount,
      pendingLeave,
      lowStockCount,
    };
  }, [jobs, invoices, expenses, supplierInvoices, inventoryItems, timeEntries, leaveRequests]);

  const monthlySummary = useMemo(() => {
    const monthInvoices = invoices.filter(
      (inv) =>
        inv.status !== 'Void' &&
        inv.status !== 'Draft' &&
        extractMonthKey(inv.createdAt, inv.issueDate) === selectedMonth
    );

    const totalRevenueNet = monthInvoices.reduce(
      (acc, inv) => acc + (inv.netAmount || 0),
      0
    );
    const totalRevenueGross = monthInvoices.reduce(
      (acc, inv) => acc + (inv.grossAmount || 0),
      0
    );
    const collectedRevenue = monthInvoices.reduce(
      (acc, inv) => acc + (inv.amountPaid || 0),
      0
    );

    const pendingInvoicesList = monthInvoices.filter(
      (inv) =>
        inv.status === 'Issued' ||
        inv.status === 'Part Paid' ||
        inv.status === 'Overdue' ||
        inv.balanceDue > 0.01
    );
    const pendingInvoiceTotal = pendingInvoicesList.reduce(
      (acc, inv) => acc + (inv.balanceDue || 0),
      0
    );

    const monthJobs = jobs.filter(
      (j) =>
        extractMonthKey(j.createdAt, j.dueDate) === selectedMonth ||
        (j.dueDate && j.dueDate.startsWith(selectedMonth))
    );
    const activeProductionJobs = monthJobs.filter(
      (j) => j.status !== 'Completed' && j.status !== 'Cancelled'
    );
    const completedMonthJobs = monthJobs.filter((j) => j.status === 'Completed');
    const totalUnitsThisMonth = monthJobs
      .filter((j) => j.status !== 'Cancelled')
      .reduce((acc, j) => acc + (j.quantity || 0), 0);

    const monthExpensesNet =
      expenses
        .filter((e) => extractMonthKey(e.createdAt, e.expenseDate) === selectedMonth)
        .reduce((acc, e) => acc + (e.netAmount || 0), 0) +
      supplierInvoices
        .filter((s) => extractMonthKey(s.createdAt, s.invoiceDate) === selectedMonth)
        .reduce((acc, s) => acc + (s.netAmount || 0), 0);

    const monthHours = timeEntries
      .filter((t) => extractMonthKey(t.createdAt, t.date) === selectedMonth)
      .reduce((acc, t) => acc + (t.totalHours || 0), 0);

    return {
      monthLabel: formatMonthLabel(selectedMonth),
      invoiceCount: monthInvoices.length,
      totalRevenueNet,
      totalRevenueGross,
      collectedRevenue,
      pendingInvoicesCount: pendingInvoicesList.length,
      pendingInvoiceTotal,
      activeProductionJobsCount: activeProductionJobs.length,
      completedJobsCount: completedMonthJobs.length,
      totalUnitsThisMonth,
      monthExpensesNet,
      netMonthlyProfit: totalRevenueNet - monthExpensesNet,
      monthHours,
    };
  }, [selectedMonth, invoices, jobs, expenses, supplierInvoices, timeEntries]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await onSeedSampleData();
    } finally {
      setSeeding(false);
    }
  };

  const isEmpty = jobs.length === 0 && clients.length === 0;

  return (
    <div className="space-y-6">
      {isEmpty && role === 'management' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Initialize Megaprint Workspace
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl">
              Your database is ready. Load a realistic sample dataset covering Printing,
              Branding, Corporate Wear, Tailoring jobs, VAT invoices, expenses, and staff
              timesheets, or start creating your own records immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Database className="h-4 w-4" />
            <span>{seeding ? 'Loading Dataset...' : 'Load Sample Megaprint Data'}</span>
          </button>
        </div>
      )}

      {/* Monthly Performance Summary Card */}
      <section
        aria-label="Monthly performance summary"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Monthly Summary — {monthlySummary.monthLabel}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Key monthly operational, production, and billing metrics across Megaprint
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 shrink-0">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span className="whitespace-nowrap">Period</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedMonth(e.target.value);
              }}
              aria-label="Select summary month"
              className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-mono-nums text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          {/* Metric 1: Total Revenue (or Production Units for Production role) */}
          {role !== 'production' ? (
            <div className="p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Total Monthly Revenue
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('accounting')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  Ledger
                </button>
              </div>
              <div className="font-mono-nums text-2xl font-semibold text-slate-900">
                {formatMoney(monthlySummary.totalRevenueNet, settings.currency)}
              </div>
              <div className="text-xs text-slate-500 font-mono-nums">
                Gross {formatMoney(monthlySummary.totalRevenueGross, settings.currency)} ·{' '}
                {monthlySummary.invoiceCount} invoices
              </div>
            </div>
          ) : (
            <div className="p-5 flex flex-col justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Monthly Production Volume
              </span>
              <div className="font-mono-nums text-2xl font-semibold text-slate-900">
                {monthlySummary.totalUnitsThisMonth.toLocaleString()} units
              </div>
              <div className="text-xs text-slate-500 font-mono-nums">
                {monthlySummary.completedJobsCount} completed jobs this month
              </div>
            </div>
          )}

          {/* Metric 2: Active Production Jobs */}
          <div className="p-5 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Active Production Jobs
              </span>
              <button
                type="button"
                onClick={() => onNavigate('jobs')}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
              >
                View Jobs
              </button>
            </div>
            <div className="font-mono-nums text-2xl font-semibold text-slate-900">
              {monthlySummary.activeProductionJobsCount}
            </div>
            <div className="text-xs text-slate-500 font-mono-nums">
              {monthlySummary.completedJobsCount} completed ·{' '}
              {monthlySummary.totalUnitsThisMonth.toLocaleString()} total units
            </div>
          </div>

          {/* Metric 3: Pending Invoices */}
          {role !== 'production' ? (
            <div className="p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Pending Invoices
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('invoices')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  Collect
                </button>
              </div>
              <div className="font-mono-nums text-2xl font-semibold text-amber-700">
                {formatMoney(monthlySummary.pendingInvoiceTotal, settings.currency)}
              </div>
              <div className="text-xs text-slate-500 font-mono-nums">
                {monthlySummary.pendingInvoicesCount} awaiting settlement · Collected{' '}
                {formatMoney(monthlySummary.collectedRevenue, settings.currency)}
              </div>
            </div>
          ) : (
            <div className="p-5 flex flex-col justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Monthly Shop-Floor Hours
              </span>
              <div className="font-mono-nums text-2xl font-semibold text-slate-900">
                {monthlySummary.monthHours.toFixed(1)} hrs
              </div>
              <div className="text-xs text-slate-500">
                Logged across active production shifts
              </div>
            </div>
          )}

          {/* Metric 4: Monthly Operating Surplus / Hours */}
          {role === 'management' || role === 'accounts' ? (
            <div className="p-5 flex flex-col justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">
                Monthly Net Operating Position
              </span>
              <div
                className={`font-mono-nums text-2xl font-semibold ${
                  monthlySummary.netMonthlyProfit >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                {formatMoney(monthlySummary.netMonthlyProfit, settings.currency)}
              </div>
              <div className="text-xs text-slate-500 font-mono-nums">
                Expenses {formatMoney(monthlySummary.monthExpensesNet, settings.currency)} ·{' '}
                {monthlySummary.monthHours.toFixed(1)}h logged
              </div>
            </div>
          ) : (
            <div className="p-5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">
                  Team Hours Logged
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('time-tracking')}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  Timesheets
                </button>
              </div>
              <div className="font-mono-nums text-2xl font-semibold text-slate-900">
                {monthlySummary.monthHours.toFixed(1)} hrs
              </div>
              <div className="text-xs text-slate-500">
                {metrics.clockedInCount} staff currently clocked in
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Active Production Jobs</div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {metrics.activeJobsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {jobs.length} total jobs · {clients.length} active clients
          </div>
        </div>

        {(role === 'management' || role === 'accounts') && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">
              Net VAT Payable ({settings.defaultVatRate}%)
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {formatMoney(metrics.netVatPayable, settings.currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono-nums">
              Out {formatMoney(metrics.outputVat, settings.currency)} · In{' '}
              {formatMoney(metrics.inputVat, settings.currency)}
            </div>
          </div>
        )}

        {role === 'sales' && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">
              Pipeline Revenue (Excl. VAT)
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {formatMoney(metrics.totalQuotedNet, settings.currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {jobs.filter((j) => j.status === 'Quoted').length} pending quotes
            </div>
          </div>
        )}

        {role === 'production' && (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">
              In Production / QC
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {
                jobs.filter(
                  (j) =>
                    j.status === 'In Production' || j.status === 'Quality Control'
                ).length
              }
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {jobs.filter((j) => j.priority === 'Express' || j.priority === 'Urgent').length}{' '}
              urgent or express orders
            </div>
          </div>
        )}

        {(role === 'management' || role === 'accounts') ? (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">
              Receivables Outstanding
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {formatMoney(metrics.receivables, settings.currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Avg Job Margin {metrics.avgMargin.toFixed(1)}%
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="text-xs font-medium text-slate-500">
              Ready for Dispatch
            </div>
            <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
              {jobs.filter((j) => j.status === 'Ready for Dispatch').length}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {jobs.filter((j) => j.status === 'Completed').length} completed orders
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Attendance &amp; Stock Alerts
            </span>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              Inventory
            </button>
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {metrics.clockedInCount} clocked in
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {metrics.lowStockCount} low-stock SKUs · {metrics.pendingLeave} leave pending
          </div>
        </div>
      </div>

      {/* Production Line Split + Active Jobs Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Department Breakdown
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <span>All Jobs</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {CATEGORIES.map((cat) => {
              const catJobs = jobs.filter((j) => j.category === cat);
              const activeCount = catJobs.filter(
                (j) => j.status !== 'Completed' && j.status !== 'Cancelled'
              ).length;
              const catNet = catJobs.reduce((acc, j) => acc + (j.netTotal || 0), 0);
              return (
                <div key={cat} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{cat}</div>
                    <div className="text-xs text-slate-500">
                      {activeCount} active · {catJobs.length} total
                    </div>
                  </div>
                  {role !== 'production' && (
                    <div className="font-mono-nums text-sm font-medium text-slate-800">
                      {formatMoney(catNet, settings.currency)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Active Job Queue &amp; Cost Health
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('job-cards')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              <span>Job Cards</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No jobs logged yet. Create a new job to track specs, VAT, and job card costs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Job #</th>
                    <th className="py-2.5 px-4">Client &amp; Title</th>
                    <th className="py-2.5 px-4">Service</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Due</th>
                    {role !== 'production' && (
                      <th className="py-2.5 px-4 text-right">Margin</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {jobs.slice(0, 7).map((job) => {
                    const costing = calculateJobCosting(job);
                    return (
                      <tr
                        key={job.id}
                        onClick={() => onOpenJobCard(job)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono-nums text-xs font-semibold text-blue-700 whitespace-nowrap">
                          {job.jobNumber}
                        </td>
                        <td className="py-2.5 px-4 min-w-[200px]">
                          <div className="font-medium text-slate-900 truncate max-w-[260px]">
                            {job.title}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[260px]">
                            {job.clientName} · Qty {job.quantity}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                          {job.category}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusText status={job.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                          {job.dueDate || '—'}
                        </td>
                        {role !== 'production' && (
                          <td
                            className={`py-2.5 px-4 text-right font-mono-nums text-xs font-semibold whitespace-nowrap ${
                              costing.isOverBudget || costing.grossMarginPct < 15
                                ? 'text-red-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {costing.grossMarginPct.toFixed(1)}%
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
      </div>

      {/* Operational Sticky Notes Board */}
      <section
        aria-label="Operational reminders and manager sticky notes"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <StickyNote className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Operational Reminders &amp; Notice Board
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quick shift handoffs, dispatch alerts, and compliance reminders from Management
              </p>
            </div>
          </div>

          {role === 'management' && (
            <button
              type="button"
              onClick={() => {
                setShowNoteForm((prev) => !prev);
                setNoteError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                showNoteForm
                  ? 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showNoteForm ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span>Close</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Post Sticky Note</span>
                </>
              )}
            </button>
          )}
        </div>

        {showNoteForm && role === 'management' && (
          <form
            onSubmit={handleNoteSubmit}
            className="px-5 py-4 bg-slate-50 border-b border-slate-200 space-y-3"
          >
            {noteError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {noteError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reminder Headline
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g. Rush embroidery cutoff at 3:00 PM"
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Target Team
                </label>
                <select
                  value={noteAudience}
                  onChange={(e) => setNoteAudience(e.target.value as NoteAudience)}
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {NOTE_AUDIENCES.map((aud) => (
                    <option key={aud} value={aud}>
                      {aud}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Operational Note
              </label>
              <textarea
                rows={2}
                maxLength={600}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write clear instructions or reminders visible to all staff..."
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">Note Color</span>
                  <div className="flex items-center gap-1.5">
                    {(Object.keys(NOTE_TONE_STYLES) as NoteTone[]).map((toneKey) => (
                      <button
                        key={toneKey}
                        type="button"
                        aria-label={NOTE_TONE_STYLES[toneKey].label}
                        onClick={() => setNoteTone(toneKey)}
                        className={`h-5 w-5 rounded border transition-transform ${
                          NOTE_TONE_STYLES[toneKey].swatchClass
                        } ${
                          noteTone === toneKey
                            ? 'ring-2 ring-blue-600 ring-offset-1 scale-110'
                            : 'opacity-75 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notePinned}
                    onChange={(e) => setNotePinned(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>Pin to top of board</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={savingNote}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {savingNote ? 'Posting...' : 'Post Reminder'}
              </button>
            </div>
          </form>
        )}

        <div className="p-5">
          {sortedNotes.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              No active reminders posted yet.
              {role === 'management'
                ? ' Use "Post Sticky Note" above to share shift instructions or priority alerts with all staff.'
                : ' Management reminders will appear here as soon as they are posted.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedNotes.map((note) => {
                const style = NOTE_TONE_STYLES[note.tone] || NOTE_TONE_STYLES.amber;
                const isBusy = noteBusyId === note.id;
                return (
                  <article
                    key={note.id}
                    className={`border rounded-md p-4 flex flex-col justify-between gap-3 ${style.cardClass}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {note.pinned && (
                            <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 mb-1">
                              <Pin className="h-3 w-3" />
                              <span>Pinned</span>
                            </div>
                          )}
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                            {note.title}
                          </h3>
                        </div>

                        {role === 'management' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleTogglePin(note)}
                              disabled={isBusy}
                              title={note.pinned ? 'Unpin reminder' : 'Pin reminder'}
                              aria-label={note.pinned ? 'Unpin reminder' : 'Pin reminder'}
                              className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-black/5 disabled:opacity-40"
                            >
                              {note.pinned ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={isBusy}
                              title="Delete reminder"
                              aria-label="Delete reminder"
                              className="p-1 rounded text-slate-500 hover:text-red-700 hover:bg-red-100/60 disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {note.body}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-black/10 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="truncate font-medium">
                        {note.audience} · {note.authorName}
                      </span>
                      <span className="font-mono-nums whitespace-nowrap shrink-0">
                        {formatNoteDate(note.createdAt)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
