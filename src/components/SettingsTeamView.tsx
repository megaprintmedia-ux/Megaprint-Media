import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { roleToDepartment } from '../context/AuthContext';
import {
  ChartAccount,
  ChartAccountSubType,
  ChartAccountType,
  CommissionBasis,
  CommissionStatus,
  CompanySettings,
  Job,
  TaxAccessScope,
  UserInvite,
  UserInviteStatus,
  UserProfile,
  UserRole,
} from '../types/erp';
import {
  calculateJobCommission,
  calculateJobCosting,
  formatMoney,
} from '../utils/vat';
import { BrandLogo } from './BrandLogo';
import { StatusText } from './StatusText';

interface SettingsTeamViewProps {
  settings: CompanySettings;
  users: UserProfile[];
  userInvites: UserInvite[];
  chartOfAccounts: ChartAccount[];
  jobs: Job[];
  onUpdateSettings: (
    updates: Partial<Omit<CompanySettings, 'id' | 'ownerUid' | 'updatedAt'>>
  ) => Promise<void>;
  onUpdateUserAccess: (
    targetUid: string,
    role: UserRole,
    department: UserProfile['department'],
    status: UserProfile['status'],
    commissionRatePct?: number,
    taxScope?: TaxAccessScope
  ) => Promise<void>;
  onSyncZimraVatScope?: () => Promise<number>;
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
  onCreateChartAccount: (
    input: Omit<ChartAccount, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => Promise<string | undefined>;
  onUpdateChartAccount: (
    accountId: string,
    updates: Partial<
      Omit<ChartAccount, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
    >
  ) => Promise<void>;
  onDeleteChartAccount: (accountId: string) => Promise<void>;
  onSeedDefaultChartOfAccounts: () => Promise<void>;
  onCreateUserInvite: (input: {
    email: string;
    displayName: string;
    role: UserRole;
    department: UserProfile['department'];
    taxScope?: TaxAccessScope;
    commissionRatePct: number;
  }) => Promise<string | undefined>;
  onUpdateUserInviteStatus: (
    inviteId: string,
    status: UserInviteStatus
  ) => Promise<void>;
  onDeleteUserInvite: (inviteId: string) => Promise<void>;
}

type SettingsTab = 'company' | 'coa' | 'commissions' | 'team';
type CoaFilter = 'All' | 'Cash & Bank' | ChartAccountType;

const ACCOUNT_TYPES: ChartAccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Revenue',
  'Expense',
];

const ACCOUNT_SUBTYPES: ChartAccountSubType[] = [
  'Bank',
  'Mobile Money',
  'Cash',
  'Receivable',
  'Payable',
  'Tax / VAT',
  'Operating',
  'COGS',
  'Payroll',
];

const ACCOUNT_CURRENCIES = ['USD', 'ZWG', 'ZAR', 'BWP', 'GBP', 'EUR'];

export const SettingsTeamView: React.FC<SettingsTeamViewProps> = ({
  settings,
  users,
  userInvites,
  chartOfAccounts,
  jobs,
  onUpdateSettings,
  onUpdateUserAccess,
  onSyncZimraVatScope,
  onUpdateJobCommission,
  onCreateChartAccount,
  onUpdateChartAccount,
  onDeleteChartAccount,
  onSeedDefaultChartOfAccounts,
  onCreateUserInvite,
  onUpdateUserInviteStatus,
  onDeleteUserInvite,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');

  // Company & ZIMRA VAT state
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [taxPin, setTaxPin] = useState(settings.taxPin);
  const [zimraTin, setZimraTin] = useState(settings.zimraTin || '');
  const [vatRegNumber, setVatRegNumber] = useState(settings.vatRegNumber || '');
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [email, setEmail] = useState(settings.email);
  const [currency, setCurrency] = useState(settings.currency);
  const [defaultVatRate, setDefaultVatRate] = useState(String(settings.defaultVatRate));
  const [logoDataUrl, setLogoDataUrl] = useState(settings.logoDataUrl || '');
  const [logoMessage, setLogoMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Commission Policy & Manual Job Commission Configuration state
  const [defaultCommBasis, setDefaultCommBasis] = useState<CommissionBasis>(
    settings.defaultCommissionBasis || 'gross_profit'
  );
  const [defaultCommRate, setDefaultCommRate] = useState(
    String(settings.defaultCommissionRatePct ?? 5)
  );
  const [savingCommPolicy, setSavingCommPolicy] = useState(false);
  const [savedCommPolicy, setSavedCommPolicy] = useState(false);
  const [commSearch, setCommSearch] = useState('');
  const [jobCommDrafts, setJobCommDrafts] = useState<
    Record<
      string,
      {
        repUid: string;
        basis: CommissionBasis;
        ratePct: string;
        amount: string;
        status: CommissionStatus;
      }
    >
  >({});
  const [savingJobCommId, setSavingJobCommId] = useState<string | null>(null);
  const [savedJobCommId, setSavedJobCommId] = useState<string | null>(null);

  // Chart of Accounts state
  const [coaFilter, setCoaFilter] = useState<CoaFilter>('All');
  const [showCoaModal, setShowCoaModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [accCode, setAccCode] = useState('');
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<ChartAccountType>('Asset');
  const [accSubType, setAccSubType] = useState<ChartAccountSubType>('Bank');
  const [accCurrency, setAccCurrency] = useState(settings.currency || 'USD');
  const [accBankName, setAccBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accBranch, setAccBranch] = useState('');
  const [accOpeningBal, setAccOpeningBal] = useState('0');
  const [accIsCashBook, setAccIsCashBook] = useState(true);
  const [accIsActive, setAccIsActive] = useState(true);
  const [accNotes, setAccNotes] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [seedingCoa, setSeedingCoa] = useState(false);

  // Team Invites & Commission Rate edits state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('sales');
  const [inviteTaxScope, setInviteTaxScope] = useState<TaxAccessScope>('all');
  const [inviteCommRate, setInviteCommRate] = useState(
    String(settings.defaultCommissionRatePct ?? 5)
  );
  const [savingInvite, setSavingInvite] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [commDrafts, setCommDrafts] = useState<Record<string, string>>({});
  const [syncingZimra, setSyncingZimra] = useState(false);
  const [zimraSyncNotice, setZimraSyncNotice] = useState('');

  useEffect(() => {
    setCompanyName(settings.companyName);
    setTagline(settings.tagline);
    setTaxPin(settings.taxPin);
    setZimraTin(settings.zimraTin || '');
    setVatRegNumber(settings.vatRegNumber || '');
    setAddress(settings.address);
    setPhone(settings.phone);
    setEmail(settings.email);
    setCurrency(settings.currency);
    setDefaultVatRate(String(settings.defaultVatRate));
    setDefaultCommBasis(settings.defaultCommissionBasis || 'gross_profit');
    setDefaultCommRate(String(settings.defaultCommissionRatePct ?? 5));
    setLogoDataUrl(settings.logoDataUrl || '');
  }, [settings]);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    const defaultPct = settings.defaultCommissionRatePct ?? 5;
    users.forEach((u) => {
      nextDrafts[u.uid] = String(
        u.commissionRatePct ?? (u.role === 'sales' ? defaultPct : 0)
      );
    });
    setCommDrafts(nextDrafts);
  }, [users, settings.defaultCommissionRatePct]);

  useEffect(() => {
    const nextJobDrafts: Record<
      string,
      {
        repUid: string;
        basis: CommissionBasis;
        ratePct: string;
        amount: string;
        status: CommissionStatus;
      }
    > = {};
    const fallbackBasis: CommissionBasis =
      settings.defaultCommissionBasis || 'gross_profit';
    const fallbackRate = settings.defaultCommissionRatePct ?? 5;
    jobs.forEach((j) => {
      nextJobDrafts[j.id] = {
        repUid: j.assignedSalesUid || '',
        basis: j.commissionBasis || fallbackBasis,
        ratePct: String(j.commissionRatePct ?? fallbackRate),
        amount: String(j.commissionAmount ?? 0),
        status: j.commissionStatus || 'Pending',
      };
    });
    setJobCommDrafts(nextJobDrafts);
  }, [jobs, settings.defaultCommissionBasis, settings.defaultCommissionRatePct]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoMessage('');
    if (file.size > 150000) {
      setLogoMessage('Please choose a logo image under 150 KB (PNG, JPG, or SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onUpdateSettings({
        companyName,
        tagline,
        taxPin,
        zimraTin,
        vatRegNumber,
        address,
        phone,
        email,
        currency,
        defaultVatRate: Number(defaultVatRate) || 15,
        logoDataUrl,
      });
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const coaSummary = useMemo(() => {
    const total = chartOfAccounts.length;
    const cashBanks = chartOfAccounts.filter((a) => a.isCashBookAccount);
    const activeCount = chartOfAccounts.filter((a) => a.isActive).length;
    const bankOpeningTotal = cashBanks
      .filter((a) => a.isActive)
      .reduce((acc, a) => acc + (a.openingBalance || 0), 0);
    return {
      total,
      cashBankCount: cashBanks.length,
      activeCount,
      bankOpeningTotal,
    };
  }, [chartOfAccounts]);

  const filteredCoa = useMemo(() => {
    return chartOfAccounts.filter((acc) => {
      if (coaFilter === 'All') return true;
      if (coaFilter === 'Cash & Bank') return acc.isCashBookAccount;
      return acc.accountType === coaFilter;
    });
  }, [chartOfAccounts, coaFilter]);

  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccCode('');
    setAccName('');
    setAccType('Asset');
    setAccSubType('Bank');
    setAccCurrency(settings.currency || 'USD');
    setAccBankName('');
    setAccNumber('');
    setAccBranch('');
    setAccOpeningBal('0');
    setAccIsCashBook(true);
    setAccIsActive(true);
    setAccNotes('');
    setShowCoaModal(true);
  };

  const openEditAccount = (acc: ChartAccount) => {
    setEditingAccount(acc);
    setAccCode(acc.code);
    setAccName(acc.name);
    setAccType(acc.accountType);
    setAccSubType(acc.subType);
    setAccCurrency(acc.currency || settings.currency || 'USD');
    setAccBankName(acc.bankName || '');
    setAccNumber(acc.accountNumber || '');
    setAccBranch(acc.branch || '');
    setAccOpeningBal(String(acc.openingBalance ?? 0));
    setAccIsCashBook(acc.isCashBookAccount);
    setAccIsActive(acc.isActive);
    setAccNotes(acc.notes || '');
    setShowCoaModal(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCode.trim() || !accName.trim()) return;
    setSavingAccount(true);
    try {
      const payload = {
        code: accCode.trim(),
        name: accName.trim(),
        accountType: accType,
        subType: accSubType,
        currency: accCurrency.trim() || settings.currency || 'USD',
        bankName: accBankName.trim(),
        accountNumber: accNumber.trim(),
        branch: accBranch.trim(),
        openingBalance: Number(accOpeningBal) || 0,
        isCashBookAccount: accIsCashBook,
        isActive: accIsActive,
        notes: accNotes.trim(),
      };
      if (editingAccount) {
        await onUpdateChartAccount(editingAccount.id, payload);
      } else {
        await onCreateChartAccount(payload);
      }
      setShowCoaModal(false);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSeedCoa = async () => {
    setSeedingCoa(true);
    try {
      await onSeedDefaultChartOfAccounts();
    } finally {
      setSeedingCoa(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    setSavingInvite(true);
    try {
      await onCreateUserInvite({
        email: cleanEmail,
        displayName: inviteName.trim() || cleanEmail.split('@')[0],
        role: inviteRole,
        department: roleToDepartment(inviteRole),
        taxScope: inviteRole === 'accounts' ? inviteTaxScope : 'all',
        commissionRatePct: Math.max(0, Math.min(50, Number(inviteCommRate) || 0)),
      });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('sales');
      setInviteTaxScope('all');
      setInviteCommRate('5');
      setShowInviteModal(false);
    } finally {
      setSavingInvite(false);
    }
  };

  const handleSyncZimraAccess = async () => {
    if (!onSyncZimraVatScope) return;
    setSyncingZimra(true);
    setZimraSyncNotice('');
    try {
      const updatedCount = await onSyncZimraVatScope();
      setZimraSyncNotice(
        `Synced ZIMRA VAT-only visibility across ${updatedCount} financial record${updatedCount === 1 ? '' : 's'}.`
      );
    } finally {
      setSyncingZimra(false);
    }
  };

  const handleSaveCommissionPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCommPolicy(true);
    setSavedCommPolicy(false);
    try {
      await onUpdateSettings({
        defaultCommissionBasis: defaultCommBasis,
        defaultCommissionRatePct: Math.max(
          0,
          Math.min(50, Number(defaultCommRate) || 0)
        ),
      });
      setSavedCommPolicy(true);
    } finally {
      setSavingCommPolicy(false);
    }
  };

  const salesTeamUsers = useMemo(() => {
    return users.filter((u) => u.role === 'sales');
  }, [users]);

  const activeSalesMembers = useMemo(() => {
    return users.filter((u) => u.status === 'active' && u.role === 'sales');
  }, [users]);

  const filteredCommissionJobs = useMemo(() => {
    const q = commSearch.trim().toLowerCase();
    return jobs.filter((j) => {
      if (j.status === 'Cancelled') return false;
      if (!q) return true;
      return (
        j.jobNumber.toLowerCase().includes(q) ||
        j.clientName.toLowerCase().includes(q) ||
        j.title.toLowerCase().includes(q) ||
        (j.assignedSalesName || '').toLowerCase().includes(q)
      );
    });
  }, [jobs, commSearch]);

  const handleSaveManualJobCommission = async (job: Job) => {
    const draft = jobCommDrafts[job.id];
    if (!draft) return;
    const chosenSalesUser = activeSalesMembers.find((u) => u.uid === draft.repUid);
    const isSalesAssigned = Boolean(chosenSalesUser);
    const rate = isSalesAssigned
      ? Math.max(0, Math.min(50, Number(draft.ratePct) || 0))
      : 0;
    const amt = isSalesAssigned ? Math.max(0, Number(draft.amount) || 0) : 0;
    setSavingJobCommId(job.id);
    setSavedJobCommId(null);
    try {
      await onUpdateJobCommission(job.id, {
        assignedSalesUid: chosenSalesUser ? chosenSalesUser.uid : '',
        assignedSalesName: chosenSalesUser ? chosenSalesUser.displayName : '',
        commissionBasis: draft.basis,
        commissionRatePct: rate,
        commissionAmount: amt,
        commissionStatus: isSalesAssigned ? draft.status : 'Pending',
      });
      setSavedJobCommId(job.id);
    } finally {
      setSavingJobCommId(null);
    }
  };

  const handleCopyInviteUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  return (
    <div className="space-y-5">
      {/* Section Sub-Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'company'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Company &amp; ZIMRA VAT
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('coa')}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'coa'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Chart of Accounts &amp; Banks ({chartOfAccounts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commissions')}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'commissions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Commissions &amp; Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('team')}
            className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'team'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Team, Invites &amp; Access ({users.length + userInvites.filter((i) => i.status === 'invited').length})
          </button>
        </div>

        <div className="text-xs text-slate-500 font-mono-nums">
          {settings.currency} · ZIMRA VAT {settings.defaultVatRate}% · Comm{' '}
          {settings.defaultCommissionRatePct ?? 5}% (
          {(settings.defaultCommissionBasis || 'gross_profit') === 'gross_profit'
            ? 'Job Net Profit'
            : 'Net Sales'}
          )
        </div>
      </div>

      {/* TAB 1: Company Profile & ZIMRA VAT */}
      {activeTab === 'company' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 max-w-3xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Company Profile, Brand Logo &amp; ZIMRA VAT Settings
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Used across Job Cards, Fiscal Tax Invoices, and ZIMRA VAT Return worksheets.
              </p>
            </div>
            <BrandLogo
              logoDataUrl={logoDataUrl}
              companyName={companyName}
              variant="light"
              compact
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-900">
                Upload Official Megaprint Logo
              </div>
              <div className="text-[11px] text-slate-500">
                PNG, JPG, or SVG under 150 KB. Replaces the geometric placeholder.
              </div>
              {logoMessage && (
                <div className="text-xs text-red-700 mt-1">{logoMessage}</div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Choose Logo</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoFile}
                  className="sr-only"
                />
              </label>
              {logoDataUrl && (
                <button
                  type="button"
                  onClick={() => setLogoDataUrl('')}
                  className="text-xs text-slate-500 hover:text-red-700 px-2 py-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ZIMRA TIN (Taxpayer Identification #)
              </label>
              <input
                type="text"
                value={zimraTin}
                onChange={(e) => setZimraTin(e.target.value)}
                placeholder="e.g. 2000148291"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ZIMRA VAT Reg Number
              </label>
              <input
                type="text"
                value={vatRegNumber}
                onChange={(e) => setVatRegNumber(e.target.value)}
                placeholder="e.g. 10048291"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ZIMRA BP Number (Legacy / FDMS)
              </label>
              <input
                type="text"
                value={taxPin}
                onChange={(e) => setTaxPin(e.target.value)}
                placeholder="e.g. BP 0200148291"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Reporting Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="USD">USD (US Dollar)</option>
                <option value="ZWG">ZWG (Zimbabwe Gold / ZiG)</option>
                <option value="ZAR">ZAR (South African Rand)</option>
                <option value="BWP">BWP (Botswana Pula)</option>
                <option value="GBP">GBP (British Pound)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Standard ZIMRA VAT Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={defaultVatRate}
                onChange={(e) => setDefaultVatRate(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
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
                placeholder="+263 77 200 0000"
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Official Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Physical Address (Harare / Branch)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Workington Industrial Area, Coventry Road, Harare"
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-emerald-700 font-medium">
              {savedNotice ? 'Settings updated across system.' : ''}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Company Settings'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Chart of Accounts & Banks */}
      {activeTab === 'coa' && (
        <div className="space-y-5">
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-medium text-slate-500">Ledger Accounts</div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-slate-900">
                {coaSummary.total}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {coaSummary.activeCount} active in general ledger
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-medium text-slate-500">
                Cash Book &amp; Bank Accounts
              </div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-blue-700">
                {coaSummary.cashBankCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Banks, EcoCash tills &amp; cash drawers
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="text-xs font-medium text-slate-500">
                Bank &amp; Cash Opening Float
              </div>
              <div className="mt-2 font-mono-nums text-2xl font-semibold text-emerald-700">
                {formatMoney(coaSummary.bankOpeningTotal, settings.currency)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Feeds opening balance in Cash Book
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between">
              <div>
                <div className="text-xs font-medium text-slate-500">
                  Zimbabwean Default Pack
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  CBZ Nostro USD, Stanbic ZWG, EcoCash, ZIMRA VAT &amp; Commissions.
                </div>
              </div>
              <button
                type="button"
                onClick={handleSeedCoa}
                disabled={seedingCoa}
                className="mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
              >
                <Landmark className="h-3.5 w-3.5" />
                <span>
                  {seedingCoa ? 'Loading...' : 'Load Default Zimbabwe Accounts'}
                </span>
              </button>
            </div>
          </div>

          {/* Filter & Add Bar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md overflow-x-auto">
              {(
                ['All', 'Cash & Bank', 'Asset', 'Liability', 'Revenue', 'Expense'] as const
              ).map((filterOpt) => (
                <button
                  key={filterOpt}
                  type="button"
                  onClick={() => setCoaFilter(filterOpt)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    coaFilter === filterOpt
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {filterOpt}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openCreateAccount}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Add Bank / Ledger Account</span>
            </button>
          </div>

          {/* Chart of Accounts Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {filteredCoa.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 space-y-3">
                <p>
                  No accounts configured in this filter. Load the default Zimbabwean Chart of
                  Accounts or add your bank accounts, EcoCash tills, and GL codes.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Account Name &amp; Type</th>
                      <th className="py-3 px-4">Bank / Account / Branch</th>
                      <th className="py-3 px-4">Cash Book</th>
                      <th className="py-3 px-4 text-right">Opening Balance</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCoa.map((acc) => (
                      <tr key={acc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono-nums font-bold text-slate-900 whitespace-nowrap">
                          {acc.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{acc.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {acc.accountType} · {acc.subType} · {acc.currency}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {acc.bankName || acc.accountNumber || acc.branch ? (
                            <>
                              <div className="text-slate-800 font-medium">
                                {acc.bankName || '—'}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-nums mt-0.5">
                                {acc.accountNumber ? `A/C ${acc.accountNumber}` : ''}
                                {acc.accountNumber && acc.branch ? ' · ' : ''}
                                {acc.branch || ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">
                              {acc.notes || 'General Ledger Control'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={
                              acc.isCashBookAccount
                                ? 'text-blue-700 font-medium'
                                : 'text-slate-400'
                            }
                          >
                            {acc.isCashBookAccount ? 'Enabled' : 'GL Only'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatMoney(acc.openingBalance || 0, acc.currency || settings.currency)}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateChartAccount(acc.id, { isActive: !acc.isActive })
                            }
                            className="hover:underline"
                            title="Toggle account active status"
                          >
                            <StatusText status={acc.isActive ? 'Active' : 'Disabled'} />
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditAccount(acc)}
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                              title="Edit account"
                              aria-label={`Edit ${acc.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteChartAccount(acc.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete account"
                              aria-label={`Delete ${acc.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Commissions & Manual Configuration */}
      {activeTab === 'commissions' && (
        <div className="space-y-6">
          {/* Global Commission Policy */}
          <form
            onSubmit={handleSaveCommissionPolicy}
            className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Sales Team Commission Policy &amp; Default Rule
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Commissions apply <strong>only to Sales &amp; Marketing team members</strong>.
                  By default, commission is calculated on the{' '}
                  <strong>Net Profit of the Job</strong> (Net Sales Excl. VAT minus job costs).
                </p>
              </div>
              <span className="text-xs font-mono-nums font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md shrink-0">
                Active Default:{' '}
                {defaultCommBasis === 'gross_profit'
                  ? `${defaultCommRate || 0}% of Job Net Profit`
                  : `${defaultCommRate || 0}% of Net Sales`}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Commission Calculation Basis
                </label>
                <select
                  value={defaultCommBasis}
                  onChange={(e) =>
                    setDefaultCommBasis(e.target.value as CommissionBasis)
                  }
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="gross_profit">
                    % of Net Profit of Job (Sales Excl. VAT − Costs) — Default
                  </option>
                  <option value="net_sales">% of Net Sales Value (Excl. VAT)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Company Commission Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={defaultCommRate}
                  onChange={(e) => setDefaultCommRate(e.target.value)}
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-700 font-medium">
                {savedCommPolicy
                  ? 'Commission defaults saved across Megaprint ERP.'
                  : ''}
              </span>
              <button
                type="submit"
                disabled={savingCommPolicy}
                className="px-5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {savingCommPolicy ? 'Saving...' : 'Save Commission Defaults'}
              </button>
            </div>
          </form>

          {/* Per-Staff Default Commission Rates (Sales Team Only) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Sales Team Default Commission Rates ({salesTeamUsers.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Only Sales &amp; Marketing team members are eligible for job commissions.
                Management, Accounts, and Production roles are excluded.
              </p>
            </div>
            {salesTeamUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No Sales &amp; Marketing team members registered yet. Assign a user to
                Sales &amp; Marketing under Team, Invites &amp; Access to set their
                commission rate.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {salesTeamUsers.map((u) => {
                  const commVal =
                    commDrafts[u.uid] ??
                    String(
                      u.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5
                    );
                  return (
                    <div
                      key={u.uid}
                      className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {u.displayName}
                        </div>
                        <div className="text-slate-500 truncate">
                          {u.department} · {u.email}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusText status={u.status} />
                        <div className="flex items-center gap-1 border border-slate-200 rounded-md px-2 py-1 bg-slate-50">
                          <span className="text-[11px] text-slate-500">Rate %</span>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.5"
                            value={commVal}
                            onChange={(e) =>
                              setCommDrafts((prev) => ({
                                ...prev,
                                [u.uid]: e.target.value,
                              }))
                            }
                            className="w-16 bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-mono-nums text-right"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateUserAccess(
                                u.uid,
                                u.role,
                                u.department,
                                u.status,
                                Number(commVal) || 0
                              )
                            }
                            className="px-2.5 py-0.5 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800"
                          >
                            Save Rate
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Per-Job Commission Editor */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Manual Job Commission Editor &amp; Overrides ({filteredCommissionJobs.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manually assign reps, switch basis, recalculate on Job Net Profit, or
                  enter custom commission amounts and statuses per job.
                </p>
              </div>
              <input
                type="text"
                value={commSearch}
                onChange={(e) => setCommSearch(e.target.value)}
                placeholder="Search job #, client, or sales rep..."
                className="border border-slate-200 rounded-md px-3 py-1.5 text-xs bg-white w-full md:w-64"
              />
            </div>

            {filteredCommissionJobs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active jobs match your search.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                      <th className="py-2.5 px-4">Job &amp; Client</th>
                      <th className="py-2.5 px-4 text-right">Net Sales / Job Net Profit</th>
                      <th className="py-2.5 px-4">Sales Rep</th>
                      <th className="py-2.5 px-4">Basis &amp; Rate %</th>
                      <th className="py-2.5 px-4">Manual Amount ({settings.currency})</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCommissionJobs.map((job) => {
                      const costing = calculateJobCosting(job);
                      const draft = jobCommDrafts[job.id] || {
                        repUid: job.assignedSalesUid || '',
                        basis:
                          job.commissionBasis ||
                          settings.defaultCommissionBasis ||
                          'gross_profit',
                        ratePct: String(
                          job.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5
                        ),
                        amount: String(job.commissionAmount ?? 0),
                        status: (job.commissionStatus || 'Pending') as CommissionStatus,
                      };
                      const isSalesRepSelected = activeSalesMembers.some(
                        (u) => u.uid === draft.repUid
                      );
                      const formulaAmount = isSalesRepSelected
                        ? calculateJobCommission({
                            netTotal: job.netTotal,
                            grossProfit: costing.grossProfit,
                            commissionRatePct: Number(draft.ratePct) || 0,
                            commissionBasis: draft.basis,
                          })
                        : 0;

                      return (
                        <tr key={job.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 align-top">
                            <div className="font-mono-nums font-bold text-blue-700">
                              {job.jobNumber}
                            </div>
                            <div className="font-medium text-slate-900 mt-0.5">
                              {job.clientName}
                            </div>
                            <div className="text-[11px] text-slate-500 max-w-[180px] truncate">
                              {job.title}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-right font-mono-nums whitespace-nowrap">
                            <div className="text-slate-700">
                              {formatMoney(job.netTotal, settings.currency)}
                            </div>
                            <div
                              className={`text-[11px] font-semibold mt-0.5 ${
                                costing.grossProfit <= 0
                                  ? 'text-red-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              Profit: {formatMoney(costing.grossProfit, settings.currency)}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <select
                              value={isSalesRepSelected ? draft.repUid : ''}
                              onChange={(e) => {
                                const repUid = e.target.value;
                                if (!repUid) {
                                  setJobCommDrafts((prev) => ({
                                    ...prev,
                                    [job.id]: {
                                      ...draft,
                                      repUid: '',
                                      ratePct: '0',
                                      amount: '0',
                                    },
                                  }));
                                  return;
                                }
                                const rep = activeSalesMembers.find(
                                  (u) => u.uid === repUid
                                );
                                const nextRate = String(
                                  rep?.commissionRatePct ??
                                    settings.defaultCommissionRatePct ??
                                    5
                                );
                                const recalc = calculateJobCommission({
                                  netTotal: job.netTotal,
                                  grossProfit: costing.grossProfit,
                                  commissionRatePct: Number(nextRate) || 0,
                                  commissionBasis: draft.basis,
                                });
                                setJobCommDrafts((prev) => ({
                                  ...prev,
                                  [job.id]: {
                                    ...draft,
                                    repUid,
                                    ratePct: nextRate,
                                    amount: String(recalc),
                                  },
                                }));
                              }}
                              className="border border-slate-200 rounded px-2 py-1 text-xs bg-white max-w-[165px]"
                            >
                              <option value="">Unassigned (0% Comm.)</option>
                              {activeSalesMembers.map((u) => (
                                <option key={u.uid} value={u.uid}>
                                  {u.displayName}
                                </option>
                              ))}
                            </select>
                            {!isSalesRepSelected && job.assignedSalesName && (
                              <div className="text-[10px] text-amber-700 mt-0.5">
                                Was: {job.assignedSalesName} (Non-sales · Save to clear)
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={draft.basis}
                                disabled={!isSalesRepSelected}
                                onChange={(e) => {
                                  const nextBasis = e.target.value as CommissionBasis;
                                  const recalc = calculateJobCommission({
                                    netTotal: job.netTotal,
                                    grossProfit: costing.grossProfit,
                                    commissionRatePct: Number(draft.ratePct) || 0,
                                    commissionBasis: nextBasis,
                                  });
                                  setJobCommDrafts((prev) => ({
                                    ...prev,
                                    [job.id]: {
                                      ...draft,
                                      basis: nextBasis,
                                      amount: String(recalc),
                                    },
                                  }));
                                }}
                                className="border border-slate-200 rounded px-2 py-1 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                <option value="gross_profit">Job Net Profit</option>
                                <option value="net_sales">Net Sales</option>
                              </select>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                step="0.5"
                                disabled={!isSalesRepSelected}
                                value={isSalesRepSelected ? draft.ratePct : '0'}
                                onChange={(e) => {
                                  const nextRate = e.target.value;
                                  const recalc = calculateJobCommission({
                                    netTotal: job.netTotal,
                                    grossProfit: costing.grossProfit,
                                    commissionRatePct: Number(nextRate) || 0,
                                    commissionBasis: draft.basis,
                                  });
                                  setJobCommDrafts((prev) => ({
                                    ...prev,
                                    [job.id]: {
                                      ...draft,
                                      ratePct: nextRate,
                                      amount: String(recalc),
                                    },
                                  }));
                                }}
                                className="w-14 border border-slate-200 rounded px-1.5 py-1 text-xs font-mono-nums text-right disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <span className="text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={!isSalesRepSelected}
                                value={isSalesRepSelected ? draft.amount : '0'}
                                onChange={(e) =>
                                  setJobCommDrafts((prev) => ({
                                    ...prev,
                                    [job.id]: {
                                      ...draft,
                                      amount: e.target.value,
                                    },
                                  }))
                                }
                                className="w-24 border border-slate-200 rounded px-2 py-1 text-xs font-mono-nums font-semibold disabled:bg-slate-100 disabled:text-slate-400"
                              />
                              <button
                                type="button"
                                disabled={!isSalesRepSelected}
                                onClick={() =>
                                  setJobCommDrafts((prev) => ({
                                    ...prev,
                                    [job.id]: {
                                      ...draft,
                                      amount: String(formulaAmount),
                                    },
                                  }))
                                }
                                title={`Set to formula amount (${formatMoney(formulaAmount, settings.currency)})`}
                                className="px-2 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                              >
                                Calc
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono-nums mt-0.5">
                              Formula: {formatMoney(formulaAmount, settings.currency)}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <select
                              value={draft.status}
                              disabled={!isSalesRepSelected}
                              onChange={(e) =>
                                setJobCommDrafts((prev) => ({
                                  ...prev,
                                  [job.id]: {
                                    ...draft,
                                    status: e.target.value as CommissionStatus,
                                  },
                                }))
                              }
                              className="border border-slate-200 rounded px-2 py-1 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="Pending">Pending</option>
                              <option value="Earned">Earned</option>
                              <option value="Approved">Approved</option>
                              <option value="Paid">Paid</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                            <button
                              type="button"
                              disabled={savingJobCommId === job.id}
                              onClick={() => handleSaveManualJobCommission(job)}
                              className="px-3 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 disabled:opacity-50"
                            >
                              {savingJobCommId === job.id
                                ? 'Saving...'
                                : savedJobCommId === job.id
                                  ? 'Saved'
                                  : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Team, Invites & Access */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {/* Invite / Pre-Authorize User Banner */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Add Team Members &amp; Pre-Authorize Logins
                </h2>
                <p className="text-xs text-slate-500 max-w-2xl">
                  Add staff or external ZIMRA VAT auditors by email before they sign in.
                  Accounts marked <strong className="text-slate-700">ZIMRA / VAT-Only</strong>{' '}
                  only see VAT-taxable records with a customer or supplier TIN / VAT Reg #.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {onSyncZimraVatScope && (
                  <button
                    type="button"
                    disabled={syncingZimra}
                    onClick={handleSyncZimraAccess}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span>
                      {syncingZimra ? 'Syncing ZIMRA Scope...' : 'Sync ZIMRA VAT Scope'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyInviteUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Portal Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Portal Login Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Add / Invite User</span>
                </button>
              </div>
            </div>
            {zimraSyncNotice && (
              <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                {zimraSyncNotice}
              </div>
            )}
          </div>

          {/* Pending & Historical Invitations */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  User Invitations ({userInvites.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Pre-authorized Google emails awaiting or having completed onboarding.
                </p>
              </div>
            </div>
            {userInvites.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No pending or past user invitations yet. Click &ldquo;Add / Invite User&rdquo;
                above to grant access to a team member.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                      <th className="py-2.5 px-4">Staff Name &amp; Email</th>
                      <th className="py-2.5 px-4">Role &amp; Department</th>
                      <th className="py-2.5 px-4 text-right">Default Comm %</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userInvites.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {inv.displayName}
                          </div>
                          <div className="text-slate-500 font-mono-nums">{inv.email}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 capitalize">
                          <div>
                            {inv.role} · {inv.department}
                          </div>
                          {inv.role === 'accounts' && (
                            <div
                              className={`text-[11px] mt-0.5 normal-case ${
                                inv.taxScope === 'vat_only'
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-500'
                              }`}
                            >
                              {inv.taxScope === 'vat_only'
                                ? 'ZIMRA / VAT-Only Auditor (Read-Only · TIN & VAT Only)'
                                : 'Full Company Accounts'}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums font-semibold text-slate-900">
                          {inv.role === 'sales' ? `${inv.commissionRatePct}%` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <StatusText
                            status={
                              inv.status === 'invited'
                                ? 'Invited'
                                : inv.status === 'accepted'
                                  ? 'Accepted'
                                  : 'Revoked'
                            }
                          />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {inv.status === 'invited' && (
                              <button
                                type="button"
                                onClick={() => onUpdateUserInviteStatus(inv.id, 'revoked')}
                                className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Revoke
                              </button>
                            )}
                            {inv.status === 'revoked' && (
                              <button
                                type="button"
                                onClick={() => onUpdateUserInviteStatus(inv.id, 'invited')}
                                className="px-2.5 py-1 rounded border border-slate-200 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                              >
                                Re-Activate
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDeleteUserInvite(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                              title="Delete invite"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Registered Users & Commission Rates */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Registered Users, RBAC &amp; Sales Commission Rates ({users.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign team roles, activate/disable access, and configure default sales
                commission % per member.
              </p>
            </div>
            {users.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No staff accounts have signed in yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {users.map((u) => {
                  const commVal =
                    commDrafts[u.uid] ?? String(u.commissionRatePct ?? (u.role === 'sales' ? 5 : 0));
                  return (
                    <div
                      key={u.id}
                      className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {u.displayName}
                        </div>
                        <div className="text-xs text-slate-500 truncate">{u.email}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusText status={u.status} />
                          <span className="text-slate-300">·</span>
                          <span className="text-[11px] text-slate-500">{u.department}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <select
                          value={u.role}
                          onChange={(e) => {
                            const nextRole = e.target.value as UserRole;
                            onUpdateUserAccess(
                              u.uid,
                              nextRole,
                              roleToDepartment(nextRole),
                              u.status,
                              nextRole === 'sales'
                                ? Number(commVal) || settings.defaultCommissionRatePct || 5
                                : 0,
                              nextRole === 'accounts' ? u.taxScope || 'all' : 'all'
                            );
                          }}
                          className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium bg-white"
                          aria-label={`Role for ${u.displayName}`}
                        >
                          <option value="management">Management</option>
                          <option value="sales">Sales &amp; Marketing</option>
                          <option value="accounts">Accounts</option>
                          <option value="production">Production</option>
                        </select>

                        {u.role === 'accounts' && (
                          <select
                            value={u.taxScope || 'all'}
                            onChange={(e) => {
                              const nextScope = e.target.value as TaxAccessScope;
                              onUpdateUserAccess(
                                u.uid,
                                u.role,
                                u.department,
                                u.status,
                                0,
                                nextScope
                              );
                            }}
                            className={`border rounded-md px-2.5 py-1.5 text-xs font-medium ${
                              u.taxScope === 'vat_only'
                                ? 'border-amber-300 bg-amber-50 text-amber-900'
                                : 'border-slate-200 bg-white text-slate-800'
                            }`}
                            aria-label={`Tax audit scope for ${u.displayName}`}
                          >
                            <option value="all">Full Company Accounts</option>
                            <option value="vat_only">
                              ZIMRA / VAT-Only (Read-Only · TIN &amp; VAT)
                            </option>
                          </select>
                        )}

                        <select
                          value={u.status}
                          onChange={(e) => {
                            const nextStatus = e.target.value as UserProfile['status'];
                            onUpdateUserAccess(
                              u.uid,
                              u.role,
                              u.department,
                              nextStatus,
                              u.role === 'sales' ? Number(commVal) || 0 : 0,
                              u.role === 'accounts' ? u.taxScope || 'all' : 'all'
                            );
                          }}
                          className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium bg-white"
                          aria-label={`Status for ${u.displayName}`}
                        >
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="disabled">Disabled</option>
                        </select>

                        {u.role === 'sales' ? (
                          <div className="flex items-center gap-1 border border-slate-200 rounded-md px-2 py-1 bg-slate-50">
                            <span className="text-[11px] text-slate-500">Comm %</span>
                            <input
                              type="number"
                              min="0"
                              max="50"
                              step="0.5"
                              value={commVal}
                              onChange={(e) =>
                                setCommDrafts((prev) => ({
                                  ...prev,
                                  [u.uid]: e.target.value,
                                }))
                              }
                              className="w-14 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono-nums text-right"
                              aria-label={`Commission rate for ${u.displayName}`}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateUserAccess(
                                  u.uid,
                                  u.role,
                                  u.department,
                                  u.status,
                                  Number(commVal) || 0,
                                  'all'
                                )
                              }
                              className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 px-2 py-1 border border-slate-100 rounded-md bg-slate-50">
                            {u.role === 'accounts' && u.taxScope === 'vat_only'
                              ? 'ZIMRA VAT Audit'
                              : 'Sales team only'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Chart of Accounts Entry */}
      {showCoaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {editingAccount
                    ? `Edit Account · ${editingAccount.code}`
                    : 'Add Bank or General Ledger Account'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure bank details, cash drawers, or ledger accounts for Zimbabwe operations.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCoaModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveAccount}
              className="p-6 overflow-y-auto space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={accCode}
                    onChange={(e) => setAccCode(e.target.value)}
                    placeholder="e.g. 1010"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="e.g. CBZ Nostro USD Account"
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account Class
                  </label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as ChartAccountType)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Sub-Type
                  </label>
                  <select
                    value={accSubType}
                    onChange={(e) =>
                      setAccSubType(e.target.value as ChartAccountSubType)
                    }
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {ACCOUNT_SUBTYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Currency
                  </label>
                  <select
                    value={accCurrency}
                    onChange={(e) => setAccCurrency(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                  >
                    {ACCOUNT_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Bank / Institution Name
                  </label>
                  <input
                    type="text"
                    value={accBankName}
                    onChange={(e) => setAccBankName(e.target.value)}
                    placeholder="e.g. CBZ Bank / Stanbic / EcoCash"
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Account / Merchant Till #
                  </label>
                  <input
                    type="text"
                    value={accNumber}
                    onChange={(e) => setAccNumber(e.target.value)}
                    placeholder="e.g. 01120498110021"
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Branch / Location
                  </label>
                  <input
                    type="text"
                    value={accBranch}
                    onChange={(e) => setAccBranch(e.target.value)}
                    placeholder="e.g. Southerton / Workington Branch"
                    className="w-full border border-slate-200 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Opening Balance ({accCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={accOpeningBal}
                    onChange={(e) => setAccOpeningBal(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 font-mono-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                  placeholder="Account usage, signatories, or SWIFT / RTGS routing details"
                  className="w-full border border-slate-200 rounded-md px-3 py-2"
                />
              </div>

              <div className="flex flex-wrap gap-5 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accIsCashBook}
                    onChange={(e) => setAccIsCashBook(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="font-medium text-slate-800">
                    Show in Cash Book &amp; Payment dropdowns
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accIsActive}
                    onChange={(e) => setAccIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span className="font-medium text-slate-800">Account Active</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCoaModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingAccount
                    ? 'Saving...'
                    : editingAccount
                      ? 'Update Account'
                      : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Invite Team Member */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Add / Pre-Authorize User Login
                </h2>
                <p className="text-[11px] text-slate-500">
                  User activates automatically on first Google sign-in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateInvite} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Google Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff.member@gmail.com"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Tatenda Moyo"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Assigned Team / Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => {
                      const r = e.target.value as UserRole;
                      setInviteRole(r);
                      if (r !== 'accounts') setInviteTaxScope('all');
                      setInviteCommRate(
                        r === 'sales'
                          ? String(settings.defaultCommissionRatePct ?? 5)
                          : '0'
                      );
                    }}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    <option value="sales">Sales &amp; Marketing</option>
                    <option value="accounts">Accounts</option>
                    <option value="production">Production</option>
                    <option value="management">Management</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Default Commission (%) {inviteRole !== 'sales' && '— Sales Only'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    disabled={inviteRole !== 'sales'}
                    value={inviteRole === 'sales' ? inviteCommRate : '0'}
                    onChange={(e) => setInviteCommRate(e.target.value)}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm font-mono-nums disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
              {inviteRole === 'accounts' && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-md p-3 space-y-2">
                  <label className="block font-semibold text-slate-800">
                    Accounts Visibility &amp; ZIMRA Audit Scope
                  </label>
                  <select
                    value={inviteTaxScope}
                    onChange={(e) =>
                      setInviteTaxScope(e.target.value as TaxAccessScope)
                    }
                    className="w-full border border-amber-200 rounded-md px-3 py-2 text-xs bg-white font-medium text-slate-800"
                  >
                    <option value="all">
                      Full Company Accounts (Cash Book, Expenses &amp; All Invoices)
                    </option>
                    <option value="vat_only">
                      ZIMRA / VAT-Only Auditor (Read-Only · VAT &amp; TIN Records Only)
                    </option>
                  </select>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    {inviteTaxScope === 'vat_only'
                      ? 'ZIMRA / VAT-Only accounts are strictly read-only and cannot see non-VAT invoices, non-TIN transactions, Cash Book, Payroll, or Jobs.'
                      : 'Full Company Accounts can manage invoices, supplier bills, Cash Book, and internal non-VAT transactions.'}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInvite}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingInvite ? 'Saving Invite...' : 'Authorize User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
