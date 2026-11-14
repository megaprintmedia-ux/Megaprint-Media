import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Briefcase,
  Check,
  Clock,
  CreditCard,
  DollarSign,
  Pin,
  UserCircle,
  X,
} from 'lucide-react';
import {
  ChartAccount,
  CommissionBasis,
  CommissionStatus,
  CompanySettings,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Employee,
  Invoice,
  Job,
  LeaveRequest,
  NavSection,
  OperationalNote,
  TimeEntry,
  UserProfile,
  UserRole,
} from '../types/erp';
import { calculateJobCosting, formatMoney, round2 } from '../utils/vat';
import { StatusText } from './StatusText';

interface MyAccountViewProps {
  profile: UserProfile;
  role: UserRole;
  settings: CompanySettings;
  users: UserProfile[];
  jobs: Job[];
  invoices: Invoice[];
  employees: Employee[];
  timeEntries: TimeEntry[];
  leaveRequests: LeaveRequest[];
  notes: OperationalNote[];
  chartOfAccounts: ChartAccount[];
  onOpenJobCard: (job: Job) => void;
  onUpdateJobCommission: (
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
  onPayJobCommission: (
    job: Job,
    cashBookAccount?: string,
    reference?: string
  ) => Promise<void>;
  onNavigate: (section: NavSection) => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  management: 'Management',
  sales: 'Sales & Marketing',
  accounts: 'Accounts',
  production: 'Production',
};

export const MyAccountView: React.FC<MyAccountViewProps> = ({
  profile,
  role,
  settings,
  users,
  jobs,
  invoices,
  employees,
  timeEntries,
  leaveRequests,
  notes,
  chartOfAccounts,
  onOpenJobCard,
  onUpdateJobCommission,
  onPayJobCommission,
  onNavigate,
}) => {
  const canInspectTeam = role === 'management' || role === 'accounts';
  const [selectedMemberKey, setSelectedMemberKey] = useState<string>(profile.uid);
  const [statusFilter, setStatusFilter] = useState<'All' | CommissionStatus>('All');

  // Commission payout modal state
  const [payModalJob, setPayModalJob] = useState<Job | null>(null);
  const [payAccount, setPayAccount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [paying, setPaying] = useState(false);

  const cashBookAccounts = useMemo(() => {
    const active = chartOfAccounts
      .filter((a) => a.isCashBookAccount && a.isActive)
      .map((a) => a.name);
    return active.length > 0 ? active : [...DEFAULT_ZIM_CASH_ACCOUNTS];
  }, [chartOfAccounts]);

  // Build selectable member list for Management & Accounts
  const memberOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; uid: string; name: string; subtitle: string; commissionRatePct: number }
    >();

    map.set(profile.uid, {
      key: profile.uid,
      uid: profile.uid,
      name: profile.displayName,
      subtitle: `${ROLE_LABELS[profile.role]} (My Account)`,
      commissionRatePct: profile.commissionRatePct ?? (profile.role === 'sales' ? 5 : 0),
    });

    users.forEach((u) => {
      if (!map.has(u.uid)) {
        map.set(u.uid, {
          key: u.uid,
          uid: u.uid,
          name: u.displayName,
          subtitle: ROLE_LABELS[u.role],
          commissionRatePct: u.commissionRatePct ?? (u.role === 'sales' ? 5 : 0),
        });
      }
    });

    jobs.forEach((j) => {
      if (j.assignedSalesUid && !map.has(j.assignedSalesUid)) {
        map.set(j.assignedSalesUid, {
          key: j.assignedSalesUid,
          uid: j.assignedSalesUid,
          name: j.assignedSalesName || 'Sales Rep',
          subtitle: 'Sales & Marketing',
          commissionRatePct: j.commissionRatePct ?? 5,
        });
      }
    });

    return Array.from(map.values());
  }, [profile, users, jobs]);

  const effectiveSelection = canInspectTeam ? selectedMemberKey : profile.uid;
  const isAllTeam = canInspectTeam && effectiveSelection === 'ALL';

  const selectedMember = useMemo(() => {
    if (isAllTeam) return null;
    return (
      memberOptions.find((m) => m.key === effectiveSelection) ||
      memberOptions[0] || {
        key: profile.uid,
        uid: profile.uid,
        name: profile.displayName,
        subtitle: ROLE_LABELS[profile.role],
        commissionRatePct: profile.commissionRatePct ?? 0,
      }
    );
  }, [isAllTeam, memberOptions, effectiveSelection, profile]);

  const memberUserProfile = useMemo(() => {
    if (!selectedMember) return null;
    return users.find((u) => u.uid === selectedMember.uid) || (selectedMember.uid === profile.uid ? profile : null);
  }, [selectedMember, users, profile]);

  // Filter jobs belonging to selected member (either Sales Rep or Production Lead)
  const memberSalesJobs = useMemo(() => {
    const activeJobs = jobs.filter((j) => j.status !== 'Cancelled');
    if (isAllTeam) return activeJobs;
    if (!selectedMember) return [];
    const targetNameLower = selectedMember.name.trim().toLowerCase();
    return activeJobs.filter((j) => {
      if (j.assignedSalesUid) {
        return j.assignedSalesUid === selectedMember.uid;
      }
      return (j.assignedSalesName || '').trim().toLowerCase() === targetNameLower;
    });
  }, [jobs, isAllTeam, selectedMember]);

  const memberAssignedProductionJobs = useMemo(() => {
    if (isAllTeam || !selectedMember) return [];
    const targetNameLower = selectedMember.name.trim().toLowerCase();
    return jobs.filter((j) => {
      if (j.status === 'Cancelled') return false;
      const isSales =
        j.assignedSalesUid === selectedMember.uid ||
        (j.assignedSalesName || '').trim().toLowerCase() === targetNameLower;
      const isProd =
        (j.assignedProductionName || '').trim().toLowerCase() === targetNameLower;
      return isSales || isProd;
    });
  }, [jobs, isAllTeam, selectedMember]);

  const filteredCommissionJobs = useMemo(() => {
    if (statusFilter === 'All') return memberSalesJobs;
    return memberSalesJobs.filter(
      (j) => (j.commissionStatus || 'Pending') === statusFilter
    );
  }, [memberSalesJobs, statusFilter]);

  const commissionStats = useMemo(() => {
    let totalNetSales = 0;
    let pendingAmount = 0;
    let earnedReadyAmount = 0;
    let paidAmount = 0;

    memberSalesJobs.forEach((j) => {
      totalNetSales = round2(totalNetSales + (j.netTotal || 0));
      const amt = round2(j.commissionAmount || 0);
      const st = j.commissionStatus || 'Pending';
      if (st === 'Paid') {
        paidAmount = round2(paidAmount + amt);
      } else if (st === 'Earned' || st === 'Approved') {
        earnedReadyAmount = round2(earnedReadyAmount + amt);
      } else {
        pendingAmount = round2(pendingAmount + amt);
      }
    });

    return {
      jobCount: memberSalesJobs.length,
      totalNetSales,
      pendingAmount,
      earnedReadyAmount,
      paidAmount,
    };
  }, [memberSalesJobs]);

  // Match HR employee profile
  const matchedEmployee = useMemo(() => {
    if (isAllTeam || !selectedMember) return null;
    const emailLower = (memberUserProfile?.email || '').trim().toLowerCase();
    const nameLower = selectedMember.name.trim().toLowerCase();
    return (
      employees.find((e) => e.userUid && e.userUid === selectedMember.uid) ||
      (emailLower
        ? employees.find((e) => (e.email || '').trim().toLowerCase() === emailLower)
        : undefined) ||
      employees.find((e) => e.fullName.trim().toLowerCase() === nameLower) ||
      null
    );
  }, [isAllTeam, selectedMember, memberUserProfile, employees]);

  const memberTimeEntries = useMemo(() => {
    if (isAllTeam || !selectedMember) return timeEntries.slice(0, 6);
    const targetNameLower = selectedMember.name.trim().toLowerCase();
    return timeEntries
      .filter(
        (t) =>
          (matchedEmployee && t.employeeId === matchedEmployee.id) ||
          t.employeeId === selectedMember.uid ||
          t.employeeName.trim().toLowerCase() === targetNameLower
      )
      .slice(0, 6);
  }, [isAllTeam, selectedMember, matchedEmployee, timeEntries]);

  const memberLeaveRequests = useMemo(() => {
    if (isAllTeam || !selectedMember) return leaveRequests.slice(0, 5);
    const targetNameLower = selectedMember.name.trim().toLowerCase();
    return leaveRequests
      .filter(
        (l) =>
          (matchedEmployee && l.employeeId === matchedEmployee.id) ||
          l.employeeId === selectedMember.uid ||
          l.employeeName.trim().toLowerCase() === targetNameLower
      )
      .slice(0, 5);
  }, [isAllTeam, selectedMember, matchedEmployee, leaveRequests]);

  const relevantNotes = useMemo(() => {
    const dept = memberUserProfile?.department || profile.department;
    return notes
      .filter((n) => n.audience === 'All Staff' || n.audience === dept)
      .slice(0, 4);
  }, [notes, memberUserProfile, profile.department]);

  const getLinkedInvoiceState = (jobId: string) => {
    const linked = invoices.filter((i) => i.jobId === jobId && i.status !== 'Void');
    if (linked.length === 0) return { label: 'Not Invoiced', paidPct: 0 };
    const totalGross = round2(linked.reduce((a, i) => a + (i.grossAmount || 0), 0));
    const totalPaid = round2(linked.reduce((a, i) => a + (i.amountPaid || 0), 0));
    const paidPct = totalGross > 0 ? Math.min(100, Math.round((totalPaid / totalGross) * 100)) : 0;
    const nums = linked.map((i) => i.invoiceNumber).join(', ');
    return { label: `${nums} (${paidPct}% paid)`, paidPct };
  };

  const openPayModal = (job: Job) => {
    setPayModalJob(job);
    setPayAccount(cashBookAccounts[0] || DEFAULT_ZIM_CASH_ACCOUNTS[0]);
    setPayRef(`COMM-${job.jobNumber}`);
  };

  const handleConfirmPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalJob) return;
    setPaying(true);
    try {
      await onPayJobCommission(payModalJob, payAccount, payRef);
      setPayModalJob(null);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Member Identity & Switcher Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
            <UserCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-slate-900">
                {isAllTeam ? 'All Sales Team Accounts' : selectedMember?.name}
              </h2>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-medium text-blue-700">
                {isAllTeam ? 'Company-Wide Commission Ledger' : selectedMember?.subtitle}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
              {!isAllTeam && memberUserProfile?.email && (
                <span>{memberUserProfile.email}</span>
              )}
              {!isAllTeam && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono-nums text-slate-700 font-medium">
                    Default Sales Commission: {selectedMember?.commissionRatePct ?? 0}%
                  </span>
                </>
              )}
              {matchedEmployee && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    {matchedEmployee.jobTitle} ({matchedEmployee.employeeCode})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {canInspectTeam && (
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-medium text-slate-500 whitespace-nowrap">
              Inspect Account:
            </label>
            <select
              value={effectiveSelection}
              onChange={(e) => setSelectedMemberKey(e.target.value)}
              className="border border-slate-200 rounded-md px-3 py-2 text-xs font-medium text-slate-800 bg-white min-w-[220px]"
              aria-label="Select team member account"
            >
              <option value="ALL">All Sales Team Members ({jobs.filter((j) => j.status !== 'Cancelled').length} jobs)</option>
              {memberOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name} — {m.subtitle}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Commission & Sales KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Net Sales Attributed</span>
            <Briefcase className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
            {formatMoney(commissionStats.totalNetSales, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono-nums">
            Across {commissionStats.jobCount} attributed jobs
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Earned / Approved Payable</span>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-blue-700">
            {formatMoney(commissionStats.earnedReadyAmount, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Ready for payout settlement
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Commission Paid</span>
            <Check className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
            {formatMoney(commissionStats.paidAmount, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Disbursed &amp; posted to Cash Book
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Pending (Invoiced / WIP)</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono-nums text-2xl font-semibold text-amber-700">
            {formatMoney(commissionStats.pendingAmount, settings.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Unlocks to Earned when client settles invoice
          </div>
        </div>
      </div>

      {/* Job-by-Job Sales Commission Trace */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              Job-by-Job Commission Trace Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Every job tracks its assigned sales rep, rate %, calculation basis, client
              payment progress, and payout status.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
            {(['All', 'Pending', 'Earned', 'Approved', 'Paid'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {filteredCommissionJobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No jobs match this commission filter for the selected account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-3 px-4">Job # &amp; Client</th>
                  {isAllTeam && <th className="py-3 px-4">Sales Rep</th>}
                  <th className="py-3 px-4">Job Stage &amp; Invoice</th>
                  <th className="py-3 px-4 text-right">Net Sales / Margin</th>
                  <th className="py-3 px-4">Commission Rule</th>
                  <th className="py-3 px-4 text-right">Commission</th>
                  <th className="py-3 px-4">Comm. Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCommissionJobs.map((job) => {
                  const costing = calculateJobCosting(job);
                  const invInfo = getLinkedInvoiceState(job.id);
                  const commStatus: CommissionStatus = job.commissionStatus || 'Pending';
                  const commRate = job.commissionRatePct ?? 0;
                  const commBasis: CommissionBasis =
                    job.commissionBasis || settings.defaultCommissionBasis || 'gross_profit';
                  const commAmt = job.commissionAmount ?? 0;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => onOpenJobCard(job)}
                          className="font-mono-nums font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{job.jobNumber}</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                        <div className="font-medium text-slate-900 mt-0.5">
                          {job.clientName}
                        </div>
                        <div className="text-[11px] text-slate-500 max-w-[220px] truncate">
                          {job.title}
                        </div>
                      </td>
                      {isAllTeam && (
                        <td className="py-3 px-4 align-top font-medium text-slate-800 whitespace-nowrap">
                          {job.assignedSalesName || 'Unassigned'}
                        </td>
                      )}
                      <td className="py-3 px-4 align-top">
                        <StatusText status={job.status} />
                        <div className="text-[11px] text-slate-500 font-mono-nums mt-1">
                          {invInfo.label}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right font-mono-nums">
                        <div className="font-semibold text-slate-900">
                          {formatMoney(job.netTotal, settings.currency)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Net Profit {formatMoney(costing.grossProfit, settings.currency)}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-mono-nums font-semibold text-slate-800">
                          {commRate}%
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {commBasis === 'gross_profit' ? 'of Job Net Profit' : 'of Net Sales'}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right font-mono-nums font-bold text-slate-900 whitespace-nowrap">
                        {formatMoney(commAmt, settings.currency)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <StatusText status={commStatus} />
                        {job.commissionPaidDate && (
                          <div className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                            Paid {job.commissionPaidDate}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canInspectTeam && commStatus === 'Pending' && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateJobCommission(job.id, { commissionStatus: 'Earned' })
                              }
                              className="px-2 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Mark Earned
                            </button>
                          )}
                          {canInspectTeam && commStatus === 'Earned' && (
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateJobCommission(job.id, {
                                  commissionStatus: 'Approved',
                                })
                              }
                              className="px-2 py-1 rounded border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                            >
                              Approve
                            </button>
                          )}
                          {canInspectTeam &&
                            commAmt > 0 &&
                            (commStatus === 'Earned' || commStatus === 'Approved') && (
                              <button
                                type="button"
                                onClick={() => openPayModal(job)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700"
                              >
                                <CreditCard className="h-3 w-3" />
                                <span>Pay</span>
                              </button>
                            )}
                          {(!canInspectTeam || commStatus === 'Paid' || commAmt === 0) && (
                            <button
                              type="button"
                              onClick={() => onOpenJobCard(job)}
                              className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                            >
                              Job Card
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

      {/* Personal Activity & HR Snapshot Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned Jobs (Sales + Production) */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              {isAllTeam ? 'Active Company Jobs' : 'Assigned Jobs'}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('jobs')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              View all
            </button>
          </div>
          {(isAllTeam ? jobs.slice(0, 5) : memberAssignedProductionJobs.slice(0, 5))
            .length === 0 ? (
            <div className="p-6 text-xs text-slate-500 text-center">
              No active jobs assigned to this account yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {(isAllTeam ? jobs.slice(0, 5) : memberAssignedProductionJobs.slice(0, 5)).map(
                (job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onOpenJobCard(job)}
                    className="w-full px-5 py-3 text-left hover:bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-mono-nums font-semibold text-blue-700">
                        {job.jobNumber}
                      </div>
                      <div className="font-medium text-slate-900 truncate">{job.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {job.clientName} · Due {job.dueDate || 'TBD'}
                      </div>
                    </div>
                    <StatusText status={job.status} />
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* HR Leave Balances & Time Tracking */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Time, Leave &amp; HR Account
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => onNavigate('time-tracking')}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Timesheets
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => onNavigate('hr')}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                Leave
              </button>
            </div>
          </div>
          <div className="p-5 space-y-4 text-xs">
            {matchedEmployee ? (
              <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
                <div>
                  <div className="text-[11px] text-slate-500">Annual Leave Bal.</div>
                  <div className="font-mono-nums text-base font-bold text-slate-900">
                    {matchedEmployee.annualLeaveBalance} days
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Sick Leave Bal.</div>
                  <div className="font-mono-nums text-base font-bold text-slate-900">
                    {matchedEmployee.sickLeaveBalance} days
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-slate-500">
                {isAllTeam
                  ? 'Select an individual team member above to view their HR leave balance.'
                  : 'Ask HR/Management to link your Employee Profile UID for live leave balances.'}
              </div>
            )}

            <div>
              <div className="font-semibold text-slate-800 mb-2">
                Recent Time Entries ({memberTimeEntries.length})
              </div>
              {memberTimeEntries.length === 0 ? (
                <div className="text-slate-500">No logged shift entries yet.</div>
              ) : (
                <div className="space-y-2">
                  {memberTimeEntries.map((te) => (
                    <div
                      key={te.id}
                      className="flex items-center justify-between border-b border-slate-100 pb-1.5"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">
                          {te.jobNumber ? `${te.jobNumber} · ` : ''}
                          {te.date}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {te.notes || te.department}
                        </div>
                      </div>
                      <div className="text-right font-mono-nums shrink-0 pl-2">
                        <div className="font-semibold text-slate-900">
                          {te.regularHours + te.overtimeHours}h
                        </div>
                        <StatusText status={te.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {memberLeaveRequests.length > 0 && (
              <div>
                <div className="font-semibold text-slate-800 mb-1.5">
                  Recent Leave Requests
                </div>
                <div className="space-y-1.5">
                  {memberLeaveRequests.map((lr) => (
                    <div
                      key={lr.id}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-slate-700">
                        {lr.leaveType} ({lr.daysCount}d · {lr.startDate})
                      </span>
                      <StatusText status={lr.status} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Team Notices & Reminders */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Operational Notices
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Dashboard Board
            </button>
          </div>
          {relevantNotes.length === 0 ? (
            <div className="p-6 text-xs text-slate-500 text-center">
              No operational notices posted for your department.
            </div>
          ) : (
            <div className="p-4 space-y-2.5">
              {relevantNotes.map((note) => (
                <div
                  key={note.id}
                  className={`rounded-md border p-3 text-xs ${
                    note.tone === 'amber'
                      ? 'bg-amber-50/80 border-amber-200'
                      : note.tone === 'sky'
                        ? 'bg-sky-50/80 border-sky-200'
                        : note.tone === 'emerald'
                          ? 'bg-emerald-50/80 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                    <span className="truncate">{note.title}</span>
                    {note.pinned && <Pin className="h-3 w-3 text-slate-500 shrink-0" />}
                  </div>
                  <p className="text-slate-700 mt-1 leading-relaxed">{note.body}</p>
                  <div className="text-[11px] text-slate-500 mt-1.5">
                    {note.audience} · {note.authorName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pay Commission Modal */}
      {payModalJob && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Pay Sales Commission — {payModalJob.jobNumber}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Marks commission Paid and posts an outflow in the Cash Book.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalJob(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmPayout} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Sales Rep</span>
                  <strong className="text-slate-900">
                    {payModalJob.assignedSalesName || 'Sales Rep'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Commission Payout</span>
                  <strong className="font-mono-nums text-emerald-700 text-sm">
                    {formatMoney(payModalJob.commissionAmount || 0, settings.currency)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Pay From Cash / Bank Account *
                </label>
                <select
                  value={payAccount}
                  onChange={(e) => setPayAccount(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {cashBookAccounts.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Payment Reference (EcoCash / ZIPIT / Voucher)
                </label>
                <input
                  type="text"
                  required
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayModalJob(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {paying ? 'Posting Payout...' : 'Confirm & Post to Cash Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
