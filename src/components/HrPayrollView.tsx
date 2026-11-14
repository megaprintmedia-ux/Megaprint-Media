import React, { useMemo, useState } from 'react';
import { Check, Plus, X, XCircle } from 'lucide-react';
import {
  CompanySettings,
  Department,
  Employee,
  EmploymentType,
  LeaveRequest,
  LeaveType,
  PayrollRun,
  TimeEntry,
  UserProfile,
  UserRole,
} from '../types/erp';
import { formatMoney, round2 } from '../utils/vat';
import { StatusText } from './StatusText';

interface HrPayrollViewProps {
  role: UserRole;
  profile: UserProfile;
  settings: CompanySettings;
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  timeEntries: TimeEntry[];
  payrollRuns: PayrollRun[];
  onCreateEmployee: (
    input: Omit<Employee, 'id' | 'ownerUid' | 'hrViewerUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onCreateLeaveRequest: (
    input: Omit<
      LeaveRequest,
      'id' | 'status' | 'reviewedByName' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<void>;
  onReviewLeave: (
    leave: LeaveRequest,
    decision: 'Approved' | 'Declined'
  ) => Promise<void>;
  onCreatePayrollRun: (
    input: Omit<PayrollRun, 'id' | 'ownerUid' | 'hrViewerUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
}

export const HrPayrollView: React.FC<HrPayrollViewProps> = ({
  role,
  profile,
  settings,
  employees,
  leaveRequests,
  timeEntries,
  payrollRuns,
  onCreateEmployee,
  onCreateLeaveRequest,
  onReviewLeave,
  onCreatePayrollRun,
}) => {
  const isHrAdmin = role === 'management' || role === 'accounts';
  const [tab, setTab] = useState<'directory' | 'leave' | 'payroll'>(
    isHrAdmin ? 'directory' : 'leave'
  );
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  // Employee form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState<Department>('Production');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full-Time');
  const [monthlySalary, setMonthlySalary] = useState('450');
  const [hourlyRate, setHourlyRate] = useState('4');
  const [taxRate, setTaxRate] = useState('15');
  const [savingEmp, setSavingEmp] = useState(false);

  // Leave request form state
  const [leaveEmpId, setLeaveEmpId] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('Annual');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [daysCount, setDaysCount] = useState('1');
  const [reason, setReason] = useState('');
  const [savingLeave, setSavingLeave] = useState(false);

  // Payroll calculator
  const [periodLabel, setPeriodLabel] = useState(
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  );
  const [savingPayroll, setSavingPayroll] = useState(false);

  const payrollPreview = useMemo(() => {
    const activeEmps = employees.filter((e) => e.status === 'Active');
    const rows = activeEmps.map((emp) => {
      const overtimeHrs = timeEntries
        .filter((t) => t.employeeId === emp.id && t.status === 'Approved')
        .reduce((a, t) => a + (t.overtimeHours || 0), 0);
      const overtimePay = round2(overtimeHrs * emp.hourlyRate * 1.5);
      const grossPay = round2(emp.monthlySalary + overtimePay);
      const deductions = round2(grossPay * (emp.taxDeductionRate / 100));
      const netPay = round2(grossPay - deductions);
      return { emp, overtimeHrs, overtimePay, grossPay, deductions, netPay };
    });
    const totalGross = round2(rows.reduce((a, r) => a + r.grossPay, 0));
    const totalDeductions = round2(rows.reduce((a, r) => a + r.deductions, 0));
    const totalNet = round2(rows.reduce((a, r) => a + r.netPay, 0));
    return { rows, totalGross, totalDeductions, totalNet };
  }, [employees, timeEntries]);

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !jobTitle.trim()) return;
    setSavingEmp(true);
    try {
      const nextCode = `MP-${String(employees.length + 1).padStart(3, '0')}`;
      await onCreateEmployee({
        employeeCode: nextCode,
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        department,
        jobTitle: jobTitle.trim(),
        employmentType,
        hourlyRate: Number(hourlyRate) || 0,
        monthlySalary: Number(monthlySalary) || 0,
        taxDeductionRate: Number(taxRate) || 0,
        annualLeaveBalance: 21,
        sickLeaveBalance: 10,
        status: 'Active',
        userUid: '',
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setJobTitle('');
      setShowAddEmployee(false);
    } finally {
      setSavingEmp(false);
    }
  };

  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const emp = employees.find((item) => item.id === leaveEmpId);
    setSavingLeave(true);
    try {
      await onCreateLeaveRequest({
        employeeId: emp ? emp.id : profile.uid,
        employeeName: emp ? emp.fullName : profile.displayName,
        department: emp ? emp.department : profile.department,
        leaveType,
        startDate,
        endDate,
        daysCount: Math.max(1, Number(daysCount) || 1),
        reason: reason.trim(),
      });
      setReason('');
      setShowLeaveModal(false);
    } finally {
      setSavingLeave(false);
    }
  };

  const handleRunPayroll = async () => {
    if (payrollPreview.rows.length === 0) return;
    setSavingPayroll(true);
    try {
      await onCreatePayrollRun({
        periodLabel: periodLabel.trim() || 'Monthly Payroll',
        payDate: new Date().toISOString().slice(0, 10),
        employeeCount: payrollPreview.rows.length,
        totalGrossPay: payrollPreview.totalGross,
        totalDeductions: payrollPreview.totalDeductions,
        totalNetPay: payrollPreview.totalNet,
        status: 'Approved',
        notes: 'Calculated from base salary + approved overtime minus PAYE/statutory deductions.',
      });
    } finally {
      setSavingPayroll(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          {isHrAdmin && (
            <button
              type="button"
              onClick={() => setTab('directory')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                tab === 'directory'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Employee Directory ({employees.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('leave')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'leave'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Management ({leaveRequests.length})
          </button>
          {isHrAdmin && (
            <button
              type="button"
              onClick={() => setTab('payroll')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                tab === 'payroll'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Payroll Calculator
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Request Leave</span>
          </button>
          {isHrAdmin && (
            <button
              type="button"
              onClick={() => setShowAddEmployee(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Add Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* Employee Directory */}
      {tab === 'directory' && isHrAdmin && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {employees.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No employees added yet. Register tailors, printers, designers, sales, and accounts staff.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Name &amp; Role</th>
                    <th className="py-2.5 px-4">Department</th>
                    <th className="py-2.5 px-4 text-right">Hourly Rate</th>
                    <th className="py-2.5 px-4 text-right">Monthly Base</th>
                    <th className="py-2.5 px-4 text-right">Leave Bal.</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono-nums text-xs font-semibold text-blue-700 whitespace-nowrap">
                        {emp.employeeCode}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{emp.fullName}</div>
                        <div className="text-xs text-slate-500">
                          {emp.jobTitle} · {emp.employmentType}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {emp.department}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs">
                        {formatMoney(emp.hourlyRate, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold text-slate-900">
                        {formatMoney(emp.monthlySalary, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                        {emp.annualLeaveBalance}d Ann · {emp.sickLeaveBalance}d Sick
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={emp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Leave Requests Tab */}
      {tab === 'leave' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {leaveRequests.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No leave requests submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-4">Dates</th>
                    <th className="py-2.5 px-4 text-right">Days</th>
                    <th className="py-2.5 px-4">Reason</th>
                    <th className="py-2.5 px-4">Status</th>
                    {isHrAdmin && <th className="py-2.5 px-4 text-right">Decision</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {leaveRequests.map((lr) => (
                    <tr key={lr.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{lr.employeeName}</div>
                        <div className="text-xs text-slate-500">{lr.department}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        {lr.leaveType}
                      </td>
                      <td className="py-3 px-4 font-mono-nums text-xs text-slate-600 whitespace-nowrap">
                        {lr.startDate} → {lr.endDate}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-semibold">
                        {lr.daysCount}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-[260px] truncate">
                        {lr.reason}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={lr.status} />
                      </td>
                      {isHrAdmin && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {lr.status === 'Pending' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onReviewLeave(lr, 'Approved')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                              >
                                <Check className="h-3 w-3" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onReviewLeave(lr, 'Declined')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50"
                              >
                                <XCircle className="h-3 w-3" />
                                <span>Decline</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {lr.reviewedByName ? `By ${lr.reviewedByName}` : 'Reviewed'}
                            </span>
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
      )}

      {/* Payroll Calculator Tab */}
      {tab === 'payroll' && isHrAdmin && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Pay Period Label
                </label>
                <input
                  type="text"
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  className="border border-slate-200 rounded-md px-3 py-1.5 text-sm font-medium"
                />
              </div>
              <div className="pl-2">
                <div className="text-[11px] text-slate-500">Total Net Payroll</div>
                <div className="font-mono-nums text-lg font-bold text-slate-900">
                  {formatMoney(payrollPreview.totalNet, settings.currency)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRunPayroll}
              disabled={savingPayroll || payrollPreview.rows.length === 0}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {savingPayroll ? 'Recording Payroll...' : 'Approve & Save Payroll Run'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4 text-right">Base Salary</th>
                    <th className="py-2.5 px-4 text-right">Approved OT</th>
                    <th className="py-2.5 px-4 text-right">Gross Pay</th>
                    <th className="py-2.5 px-4 text-right">Tax / Statutory</th>
                    <th className="py-2.5 px-4 text-right">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {payrollPreview.rows.map((r) => (
                    <tr key={r.emp.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{r.emp.fullName}</div>
                        <div className="text-xs text-slate-500">
                          {r.emp.department} · Tax {r.emp.taxDeductionRate}%
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs">
                        {formatMoney(r.emp.monthlySalary, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-slate-600">
                        {r.overtimeHrs.toFixed(1)}h (
                        {formatMoney(r.overtimePay, settings.currency)})
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-medium">
                        {formatMoney(r.grossPay, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs text-red-700">
                        -{formatMoney(r.deductions, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-nums text-xs font-bold text-slate-900">
                        {formatMoney(r.netPay, settings.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {payrollRuns.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 font-display text-xs font-semibold text-slate-900 bg-slate-50">
                Historical Payroll Runs
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {payrollRuns.map((pr) => (
                  <div
                    key={pr.id}
                    className="px-5 py-3 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-semibold text-slate-900">{pr.periodLabel}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="font-mono-nums text-slate-500">
                        {pr.payDate} · {pr.employeeCount} staff
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono-nums">
                      <span>Gross {formatMoney(pr.totalGrossPay, settings.currency)}</span>
                      <span className="font-bold text-slate-900">
                        Net {formatMoney(pr.totalNetPay, settings.currency)}
                      </span>
                      <StatusText status={pr.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-base font-bold text-slate-900">
                Register Employee Profile
              </h2>
              <button
                type="button"
                onClick={() => setShowAddEmployee(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Master Tailor / Screen Printer"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as Department)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="Production">Production</option>
                    <option value="Sales & Marketing">Sales &amp; Marketing</option>
                    <option value="Accounts">Accounts</option>
                    <option value="Management">Management</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Employment Type
                  </label>
                  <select
                    value={employmentType}
                    onChange={(e) =>
                      setEmploymentType(e.target.value as EmploymentType)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="Full-Time">Full-Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Casual">Casual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Base Salary ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={monthlySalary}
                    onChange={(e) => setMonthlySalary(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hourly Labor Rate ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Statutory Tax / Deduction Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-32 border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEmployee(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEmp}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  {savingEmp ? 'Saving...' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Submit Leave Request
              </h2>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveLeave} className="p-5 space-y-4">
              {isHrAdmin && employees.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Employee
                  </label>
                  <select
                    value={leaveEmpId}
                    onChange={(e) => setLeaveEmpId(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Myself ({profile.displayName})</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Leave Type
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="Annual">Annual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Compassionate">Compassionate</option>
                    <option value="Unpaid">Unpaid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Days Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={daysCount}
                    onChange={(e) => setDaysCount(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason
                </label>
                <textarea
                  rows={2}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLeave}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  {savingLeave ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
