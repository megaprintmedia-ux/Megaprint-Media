import React from 'react';
import { LogOut, Menu, Plus } from 'lucide-react';
import { NavSection, TaxAccessScope, UserProfile, UserRole } from '../types/erp';

interface TopBarProps {
  activeSection: NavSection;
  profile: UserProfile;
  activeViewRole: UserRole;
  taxScope?: TaxAccessScope;
  previewVatOnly?: boolean;
  onChangeViewRole: (role: UserRole, vatOnly?: boolean) => void;
  onOpenMobileMenu: () => void;
  onQuickNewJob: () => void;
  onSignOut: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Executive Overview',
  jobs: 'Jobs & Workflow',
  'job-cards': 'Job Cards & Costing',
  clients: 'Clients & Quotes',
  inventory: 'Inventory, Consumables & Samples',
  'goods-received': 'Goods Received Notes (GRN)',
  requisitions: 'Requisitions & Approvals',
  invoices: 'Invoices & VAT',
  'supplier-invoices': 'Supplier Tax Invoices',
  'cash-book': 'Cash Book & Bank Ledger',
  accounting: 'Accounting & VAT Return',
  reports: 'Reports & Analytics',
  'time-tracking': 'Employee Time Tracking',
  hr: 'HR & Payroll Solutions',
  'my-account': 'My Account & Sales Commissions',
  settings: 'Team & Company Settings',
};

const ROLE_LABELS: Record<UserRole, string> = {
  management: 'Management',
  sales: 'Sales & Marketing',
  accounts: 'Accounts',
  production: 'Production',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  profile,
  activeViewRole,
  taxScope = 'all',
  previewVatOnly = false,
  onChangeViewRole,
  onOpenMobileMenu,
  onQuickNewJob,
  onSignOut,
}) => {
  const canCreateJob =
    activeViewRole === 'management' || activeViewRole === 'sales';
  const isViewingVatOnly =
    activeViewRole === 'accounts' && (taxScope === 'vat_only' || previewVatOnly);
  const activeRoleLabel = isViewingVatOnly
    ? 'Accounts (ZIMRA / VAT-Only)'
    : ROLE_LABELS[activeViewRole];
  const profileRoleLabel =
    profile.role === 'accounts' && profile.taxScope === 'vat_only'
      ? 'Accounts (ZIMRA / VAT-Only)'
      : ROLE_LABELS[profile.role];

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-8 shrink-0 no-print">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
            {activeRoleLabel}
          </span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <h1 className="font-display font-semibold text-slate-900 truncate">
            {activeSection === 'my-account' && activeViewRole === 'production'
              ? 'My Account'
              : SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {profile.role === 'management' && (
          <label className="hidden md:flex items-center gap-2 text-xs text-slate-600">
            <span className="whitespace-nowrap">Team view:</span>
            <select
              value={isViewingVatOnly ? 'accounts_vat' : activeViewRole}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'accounts_vat') {
                  onChangeViewRole('accounts', true);
                } else {
                  onChangeViewRole(val as UserRole, false);
                }
              }}
              className="border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              aria-label="Preview team workspace"
            >
              <option value="management">Management</option>
              <option value="sales">Sales &amp; Marketing</option>
              <option value="accounts">Accounts (Full)</option>
              <option value="accounts_vat">Accounts (ZIMRA / VAT-Only)</option>
              <option value="production">Production</option>
            </select>
          </label>
        )}

        {canCreateJob && (
          <button
            type="button"
            onClick={onQuickNewJob}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Job</span>
          </button>
        )}

        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="text-right leading-tight">
            <div className="text-xs font-semibold text-slate-900 max-w-[140px] truncate">
              {profile.displayName}
            </div>
            <div className="text-[11px] text-slate-500">{profileRoleLabel}</div>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
