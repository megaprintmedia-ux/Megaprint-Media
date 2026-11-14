import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Play, Square } from 'lucide-react';
import {
  CompanySettings,
  Department,
  Employee,
  Job,
  TimeEntry,
  UserProfile,
  UserRole,
} from '../types/erp';
import { calculateHoursAndLabor, formatMoney } from '../utils/vat';
import { StatusText } from './StatusText';

interface TimeTrackingViewProps {
  role: UserRole;
  profile: UserProfile;
  settings: CompanySettings;
  employees: Employee[];
  jobs: Job[];
  timeEntries: TimeEntry[];
  onCreateTimeEntry: (
    input: Omit<TimeEntry, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateTimeEntry: (
    entryId: string,
    updates: Partial<Omit<TimeEntry, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => Promise<void>;
}

function formatElapsed(startIso: string, nowMs: number): string {
  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs) || nowMs < startMs) return '00:00:00';
  const totalSec = Math.floor((nowMs - startMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const TimeTrackingView: React.FC<TimeTrackingViewProps> = ({
  role,
  profile,
  settings,
  employees,
  jobs,
  timeEntries,
  onCreateTimeEntry,
  onUpdateTimeEntry,
}) => {
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [notes, setNotes] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const canManageAll = role === 'management' || role === 'accounts';

  const activeClockedEntries = useMemo(
    () => timeEntries.filter((t) => t.status === 'Clocked In'),
    [timeEntries]
  );

  const totalHoursLogged = useMemo(
    () => timeEntries.reduce((acc, t) => acc + (t.totalHours || 0), 0),
    [timeEntries]
  );

  const handleClockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenEmp = employees.find((emp) => emp.id === selectedEmpId);
    const chosenJob = jobs.find((j) => j.id === selectedJobId);
    const nowIso = new Date().toISOString();

    setSubmitting(true);
    try {
      await onCreateTimeEntry({
        employeeId: chosenEmp ? chosenEmp.id : profile.uid,
        employeeName: chosenEmp ? chosenEmp.fullName : profile.displayName,
        department: chosenEmp
          ? chosenEmp.department
          : (profile.department as Department),
        jobId: chosenJob ? chosenJob.id : '',
        jobNumber: chosenJob ? chosenJob.jobNumber : '',
        date: nowIso.slice(0, 10),
        clockInIso: nowIso,
        clockOutIso: '',
        breakMinutes: 0,
        regularHours: 0,
        overtimeHours: 0,
        totalHours: 0,
        hourlyRate: chosenEmp ? chosenEmp.hourlyRate : 450,
        laborCost: 0,
        status: 'Clocked In',
        notes: notes.trim(),
      });
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async (entry: TimeEntry) => {
    const outIso = new Date().toISOString();
    const brk = Math.max(0, Number(breakMinutes) || 0);
    const calc = calculateHoursAndLabor({
      clockInIso: entry.clockInIso,
      clockOutIso: outIso,
      breakMinutes: brk,
      hourlyRate: entry.hourlyRate,
    });
    await onUpdateTimeEntry(entry.id, {
      clockOutIso: outIso,
      breakMinutes: brk,
      regularHours: calc.regularHours,
      overtimeHours: calc.overtimeHours,
      totalHours: calc.totalHours,
      laborCost: calc.laborCost,
      status: 'Completed',
    });
  };

  const handleApproveTimesheet = async (entry: TimeEntry) => {
    await onUpdateTimeEntry(entry.id, { status: 'Approved' });
  };

  return (
    <div className="space-y-6">
      {/* Live Clock-In Station */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleClockIn}
          className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Shift Clock-In &amp; Job Time Attribution
            </h2>
            <span className="font-mono-nums text-xs text-slate-500">
              {new Date(nowMs).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Staff Member
              </label>
              {employees.length > 0 && canManageAll ? (
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">Myself ({profile.displayName})</option>
                  {employees
                    .filter((e) => e.status === 'Active')
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} — {emp.jobTitle}
                      </option>
                    ))}
                </select>
              ) : (
                <div className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-800">
                  {profile.displayName} ({profile.department})
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tag Job Card (Optional)
              </label>
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">General Shift / Non-Job</option>
                {jobs
                  .filter((j) => j.status !== 'Completed' && j.status !== 'Cancelled')
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.jobNumber} — {j.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Task description (e.g. Pattern cutting, 4-color screen setup, invoicing)..."
              className="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{submitting ? 'Clocking In...' : 'Clock In Now'}</span>
            </button>
          </div>
        </form>

        {/* Active Shifts & Break Setting */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Active Shifts ({activeClockedEntries.length})
            </h2>
            <div className="text-xs text-slate-500 font-mono-nums">
              {totalHoursLogged.toFixed(1)} hrs total
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <span>Break deduction on clock-out (min)</span>
            <input
              type="number"
              min="0"
              max="180"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              className="w-16 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums bg-white text-right"
            />
          </div>

          {activeClockedEntries.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">
              No active shifts running right now.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-48 overflow-y-auto">
              {activeClockedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-slate-200 rounded-md p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {entry.employeeName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono-nums">
                      {formatElapsed(entry.clockInIso, nowMs)}
                      {entry.jobNumber ? ` · ${entry.jobNumber}` : ''}
                    </div>
                  </div>
                  {(canManageAll || entry.ownerUid === profile.uid) && (
                    <button
                      type="button"
                      onClick={() => handleClockOut(entry)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shrink-0"
                    >
                      <Square className="h-3 w-3" />
                      <span>Clock Out</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Timesheet Ledger */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Attendance &amp; Timesheet Log
          </h2>
          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            <span>Overtime calculated automatically &gt; 8 hrs/day (1.5x)</span>
          </div>
        </div>

        {timeEntries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No time entries logged yet. Use the Clock-In station above to record shifts.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Employee &amp; Dept</th>
                  <th className="py-2.5 px-4">Job Ref &amp; Notes</th>
                  <th className="py-2.5 px-4 text-right">Regular</th>
                  <th className="py-2.5 px-4 text-right">Overtime</th>
                  <th className="py-2.5 px-4 text-right">Total Hrs</th>
                  {canManageAll && (
                    <th className="py-2.5 px-4 text-right">Labor Cost</th>
                  )}
                  <th className="py-2.5 px-4">Status</th>
                  {canManageAll && <th className="py-2.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {timeEntries.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono-nums text-xs text-slate-700 whitespace-nowrap">
                      {t.date}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{t.employeeName}</div>
                      <div className="text-xs text-slate-500">{t.department}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-mono-nums font-medium text-blue-700">
                        {t.jobNumber || 'General Shift'}
                      </div>
                      <div className="text-slate-500 truncate max-w-[240px]">
                        {t.notes || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs">
                      {t.regularHours.toFixed(2)}h
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs text-amber-700">
                      {t.overtimeHours.toFixed(2)}h
                    </td>
                    <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900">
                      {t.totalHours.toFixed(2)}h
                    </td>
                    {canManageAll && (
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900 whitespace-nowrap">
                        {formatMoney(t.laborCost, settings.currency)}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <StatusText status={t.status} />
                    </td>
                    {canManageAll && (
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {t.status === 'Completed' && (
                          <button
                            type="button"
                            onClick={() => handleApproveTimesheet(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
