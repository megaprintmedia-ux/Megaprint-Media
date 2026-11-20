import React from 'react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Calculator,
  ClipboardList,
  Clock,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  PackageCheck,
  Receipt,
  Settings,
  UserCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { CompanySettings, NavSection, TaxAccessScope, UserRole } from '../types/erp';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeSection: NavSection;
  onSelect: (section: NavSection) => void;
  role: UserRole;
  taxScope?: TaxAccessScope;
  settings: CompanySettings;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  group: 'Operations' | 'Finance & VAT' | 'People & Admin';
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: ['management', 'sales', 'accounts', 'production'],
    group: 'Operations',
  },
  {
    id: 'jobs',
    label: 'Jobs & Workflow',
    icon: Briefcase,
    roles: ['management', 'sales', 'accounts', 'production'],
    group: 'Operations',
  },
  {
    id: 'job-cards',
    label: 'Job Cards & Costing',
    icon: ClipboardList,
    roles: ['management', 'production', 'accounts', 'sales'],
    group: 'Operations',
  },
  {
    id: 'clients',
    label: 'Clients & Quotes',
    icon: Users,
    roles: ['management', 'sales', 'accounts'],
    group: 'Operations',
  },
  {
    id: 'inventory',
    label: 'Inventory & Samples',
    icon: Boxes,
    roles: ['management', 'production', 'sales', 'accounts'],
    group: 'Operations',
  },
  {
    id: 'goods-received',
    label: 'Goods Received (GRN)',
    icon: PackageCheck,
    roles: ['management', 'production', 'accounts', 'sales'],
    group: 'Operations',
  },
  {
    id: 'requisitions',
    label: 'Requisitions',
    icon: FileCheck2,
    roles: ['management', 'production', 'accounts', 'sales'],
    group: 'Operations',
  },
  {
    id: 'invoices',
    label: 'Invoices & VAT',
    icon: Calculator,
    roles: ['management', 'accounts', 'sales'],
    group: 'Finance & VAT',
  },
  {
    id: 'supplier-invoices',
    label: 'Supplier Tax Invoices',
    icon: Receipt,
    roles: ['management', 'accounts'],
    group: 'Finance & VAT',
  },
  {
    id: 'cash-book',
    label: 'Cash Book',
    icon: BookOpen,
    roles: ['management', 'accounts'],
    group: 'Finance & VAT',
  },
  {
    id: 'accounting',
    label: 'Ledger & VAT Return',
    icon: FileSpreadsheet,
    roles: ['management', 'accounts'],
    group: 'Finance & VAT',
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    icon: BarChart3,
    roles: ['management', 'accounts', 'sales', 'production'],
    group: 'Finance & VAT',
  },
  {
    id: 'time-tracking',
    label: 'Time Tracking',
    icon: Clock,
    roles: ['management', 'sales', 'accounts', 'production'],
    group: 'People & Admin',
  },
  {
    id: 'hr',
    label: 'HR & Payroll',
    icon: UserCheck,
    roles: ['management', 'accounts', 'sales', 'production'],
    group: 'People & Admin',
  },
  {
    id: 'my-account',
    label: 'My Account & Commissions',
    icon: UserCircle,
    roles: ['management', 'sales', 'accounts', 'production'],
    group: 'People & Admin',
  },
  {
    id: 'settings',
    label: 'Team & Settings',
    icon: Settings,
    roles: ['management'],
    group: 'People & Admin',
  },
  {
    id: 'legacy-import',
    label: 'Legacy Data Import',
    icon: FileSpreadsheet,
    roles: ['management'],
    group: 'People & Admin',
  },
];

const VAT_ONLY_ALLOWED_SECTIONS: NavSection[] = [
  'invoices',
  'supplier-invoices',
  'accounting',
  'reports',
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelect,
  role,
  taxScope = 'all',
  settings,
  mobileOpen,
  onCloseMobile,
}) => {
  const isVatOnly = role === 'accounts' && taxScope === 'vat_only';
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(role) &&
      (!isVatOnly || VAT_ONLY_ALLOWED_SECTIONS.includes(item.id))
  );
  const groups: Array<NavItem['group']> = [
    'Operations',
    'Finance & VAT',
    'People & Admin',
  ];

  const renderContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 w-64 select-none">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800 shrink-0">
        <BrandLogo
          logoDataUrl={settings.logoDataUrl}
          companyName={settings.companyName}
          variant="dark"
        />
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Primary navigation">
        {groups.map((group) => {
          const items = visibleItems.filter((i) => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="px-3 mb-2 text-[11px] font-medium tracking-wider text-slate-400">
                {group}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  const displayLabel =
                    item.id === 'my-account'
                      ? role === 'production'
                        ? 'My Account'
                        : role === 'sales'
                          ? 'My Account & Commissions'
                          : 'Team & Sales Comm.'
                      : item.label;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelect(item.id);
                        onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{displayLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 space-y-1">
        <div className="font-medium text-slate-300 truncate">
          {settings.companyName} Operations
        </div>
        {isVatOnly && (
          <div className="text-[11px] font-medium text-amber-300 pb-0.5">
            ZIMRA VAT-Only · Read-Only
          </div>
        )}
        <div className="flex items-center justify-between font-mono-nums">
          <span>VAT Rate</span>
          <span className="text-slate-200">{settings.defaultVatRate}%</span>
        </div>
        <div className="flex items-center justify-between font-mono-nums">
          <span>Currency</span>
          <span className="text-slate-200">{settings.currency}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 no-print">{renderContent()}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{renderContent()}</div>
        </div>
      )}
    </>
  );
};
