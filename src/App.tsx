import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useErpData } from './hooks/useErpData';
import { Job, NavSection, UserRole } from './types/erp';
import { BrandLogo } from './components/BrandLogo';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { JobCardModal } from './components/JobCardModal';
import { ClientsView } from './components/ClientsView';
import { InventoryView } from './components/InventoryView';
import { GoodsReceivedView } from './components/GoodsReceivedView';
import { InvoicesVatView } from './components/InvoicesVatView';
import { SupplierInvoicesView } from './components/SupplierInvoicesView';
import { CashBookView } from './components/CashBookView';
import { AccountingView } from './components/AccountingView';
import { ReportsView } from './components/ReportsView';
import { TimeTrackingView } from './components/TimeTrackingView';
import { HrPayrollView } from './components/HrPayrollView';
import { MyAccountView } from './components/MyAccountView';
import { SettingsTeamView } from './components/SettingsTeamView';

const DEFAULT_SECTION_BY_ROLE: Record<UserRole, NavSection> = {
  management: 'dashboard',
  sales: 'dashboard',
  accounts: 'invoices',
  production: 'job-cards',
};

const ErpWorkspace: React.FC = () => {
  const {
    user,
    profile,
    authReady,
    signingIn,
    authError,
    activeViewRole,
    setActiveViewRole,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const erp = useErpData();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedJobCard, setSelectedJobCard] = useState<Job | null>(null);
  const [prefillInvoiceJob, setPrefillInvoiceJob] = useState<Job | null>(null);
  const [newJobSignal, setNewJobSignal] = useState(0);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">
          Loading Megaprint Operations System...
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-8 space-y-6">
          <BrandLogo
            logoDataUrl={erp.settings.logoDataUrl}
            companyName="Megaprint"
            variant="light"
          />
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-slate-900">
              Operations, Costing &amp; Accounting Portal
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Sign in with your Megaprint Google account to access role-based tools
              for Sales &amp; Marketing, Production Job Cards, VAT Accounting, Time
              Tracking, and HR.
            </p>
          </div>

          {authError && (
            <div className="border border-red-200 bg-red-50 text-red-700 text-xs rounded-md p-3">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={signingIn}
            className="w-full py-2.5 px-4 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (profile.status !== 'active') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-8 space-y-5">
          <BrandLogo companyName="Megaprint" variant="light" />
          <div className="space-y-2">
            <h1 className="font-display text-lg font-bold text-slate-900">
              {profile.status === 'pending'
                ? 'Account Awaiting Team Activation'
                : 'Account Access Disabled'}
            </h1>
            <p className="text-sm text-slate-600">
              Signed in as <strong className="text-slate-900">{profile.email}</strong>.
              Please ask Management to activate your profile and assign your team
              department (Sales &amp; Marketing, Accounts, Production, or Management).
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="px-4 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const effectiveRole: UserRole =
    profile.role === 'management' ? activeViewRole : profile.role;

  const liveSelectedJob = selectedJobCard
    ? erp.jobs.find((j) => j.id === selectedJobCard.id) || selectedJobCard
    : null;

  const handleRolePreviewChange = (nextRole: UserRole) => {
    setActiveViewRole(nextRole);
    setActiveSection(DEFAULT_SECTION_BY_ROLE[nextRole]);
  };

  const handleQuickNewJob = () => {
    setActiveSection('jobs');
    setNewJobSignal((n) => n + 1);
  };

  const handleCreateInvoiceFromJob = (job: Job) => {
    setSelectedJobCard(null);
    setPrefillInvoiceJob(job);
    setActiveSection('invoices');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        role={effectiveRole}
        settings={erp.settings}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          profile={profile}
          activeViewRole={effectiveRole}
          onChangeViewRole={handleRolePreviewChange}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickNewJob={handleQuickNewJob}
          onSignOut={signOut}
        />

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {erp.loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-28 bg-white border border-slate-200 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {activeSection === 'dashboard' && (
                <DashboardView
                  role={effectiveRole}
                  settings={erp.settings}
                  jobs={erp.jobs}
                  clients={erp.clients}
                  invoices={erp.invoices}
                  expenses={erp.expenses}
                  supplierInvoices={erp.supplierInvoices}
                  inventoryItems={erp.inventoryItems}
                  employees={erp.employees}
                  timeEntries={erp.timeEntries}
                  leaveRequests={erp.leaveRequests}
                  notes={erp.notes}
                  onNavigate={setActiveSection}
                  onOpenJobCard={setSelectedJobCard}
                  onSeedSampleData={erp.seedSampleData}
                  onCreateNote={erp.createNote}
                  onTogglePinNote={erp.togglePinNote}
                  onDeleteNote={erp.deleteNote}
                />
              )}

              {(activeSection === 'jobs' || activeSection === 'job-cards') && (
                <JobsView
                  mode={activeSection}
                  role={effectiveRole}
                  profile={profile}
                  users={erp.users}
                  settings={erp.settings}
                  jobs={erp.jobs}
                  clients={erp.clients}
                  openCreateModalSignal={newJobSignal}
                  onCreateJob={erp.createJob}
                  onDeleteJob={erp.deleteJob}
                  onOpenJobCard={setSelectedJobCard}
                />
              )}

              {activeSection === 'clients' && (
                <ClientsView
                  settings={erp.settings}
                  clients={erp.clients}
                  jobs={erp.jobs}
                  invoices={erp.invoices}
                  onCreateClient={erp.createClient}
                  onUpdateClient={erp.updateClient}
                />
              )}

              {activeSection === 'inventory' && (
                <InventoryView
                  role={effectiveRole}
                  settings={erp.settings}
                  inventoryItems={erp.inventoryItems}
                  jobs={erp.jobs}
                  onCreateInventoryItem={erp.createInventoryItem}
                  onAdjustInventoryStock={erp.adjustInventoryStock}
                  onDeleteInventoryItem={erp.deleteInventoryItem}
                  subscribeInventoryMovements={erp.subscribeInventoryMovements}
                />
              )}

              {activeSection === 'goods-received' && (
                <GoodsReceivedView
                  role={effectiveRole}
                  userDisplayName={profile.displayName}
                  settings={erp.settings}
                  goodsReceipts={erp.goodsReceipts}
                  supplierInvoices={erp.supplierInvoices}
                  inventoryItems={erp.inventoryItems}
                  jobs={erp.jobs}
                  onCreateGoodsReceipt={erp.createGoodsReceipt}
                  onUpdateGoodsReceipt={erp.updateGoodsReceipt}
                  onDeleteGoodsReceipt={erp.deleteGoodsReceipt}
                />
              )}

              {activeSection === 'invoices' && (
                <InvoicesVatView
                  role={effectiveRole}
                  settings={erp.settings}
                  chartOfAccounts={erp.chartOfAccounts}
                  invoices={erp.invoices}
                  clients={erp.clients}
                  jobs={erp.jobs}
                  prefillJob={prefillInvoiceJob}
                  onClearPrefillJob={() => setPrefillInvoiceJob(null)}
                  onCreateInvoice={erp.createInvoice}
                  onRecordPayment={erp.recordInvoicePayment}
                  onUpdateStatus={erp.updateInvoiceStatus}
                />
              )}

              {activeSection === 'supplier-invoices' && (
                <SupplierInvoicesView
                  role={effectiveRole}
                  settings={erp.settings}
                  chartOfAccounts={erp.chartOfAccounts}
                  supplierInvoices={erp.supplierInvoices}
                  jobs={erp.jobs}
                  onCreateSupplierInvoice={erp.createSupplierInvoice}
                  onRecordSupplierPayment={erp.recordSupplierPayment}
                  onUpdateVatStatus={erp.updateSupplierInvoiceVatStatus}
                  onDeleteSupplierInvoice={erp.deleteSupplierInvoice}
                />
              )}

              {activeSection === 'cash-book' && (
                <CashBookView
                  role={effectiveRole}
                  settings={erp.settings}
                  chartOfAccounts={erp.chartOfAccounts}
                  cashBookEntries={erp.cashBookEntries}
                  invoices={erp.invoices}
                  supplierInvoices={erp.supplierInvoices}
                  onCreateCashBookEntry={erp.createCashBookEntry}
                  onToggleCashBookReconciled={erp.toggleCashBookReconciled}
                  onDeleteCashBookEntry={erp.deleteCashBookEntry}
                />
              )}

              {activeSection === 'accounting' && (
                <AccountingView
                  settings={erp.settings}
                  invoices={erp.invoices}
                  expenses={erp.expenses}
                  supplierInvoices={erp.supplierInvoices}
                  jobs={erp.jobs}
                  onCreateExpense={erp.createExpense}
                  onToggleExpenseStatus={erp.toggleExpensePaymentStatus}
                />
              )}

              {activeSection === 'reports' && (
                <ReportsView
                  role={effectiveRole}
                  settings={erp.settings}
                  jobs={erp.jobs}
                  clients={erp.clients}
                  invoices={erp.invoices}
                  supplierInvoices={erp.supplierInvoices}
                  expenses={erp.expenses}
                  inventoryItems={erp.inventoryItems}
                  timeEntries={erp.timeEntries}
                />
              )}

              {activeSection === 'time-tracking' && (
                <TimeTrackingView
                  role={effectiveRole}
                  profile={profile}
                  settings={erp.settings}
                  employees={erp.employees}
                  jobs={erp.jobs}
                  timeEntries={erp.timeEntries}
                  onCreateTimeEntry={erp.createTimeEntry}
                  onUpdateTimeEntry={erp.updateTimeEntry}
                />
              )}

              {activeSection === 'hr' && (
                <HrPayrollView
                  role={effectiveRole}
                  profile={profile}
                  settings={erp.settings}
                  employees={erp.employees}
                  leaveRequests={erp.leaveRequests}
                  timeEntries={erp.timeEntries}
                  payrollRuns={erp.payrollRuns}
                  onCreateEmployee={erp.createEmployee}
                  onCreateLeaveRequest={erp.createLeaveRequest}
                  onReviewLeave={erp.reviewLeaveRequest}
                  onCreatePayrollRun={erp.createPayrollRun}
                />
              )}

              {activeSection === 'my-account' && (
                <MyAccountView
                  profile={profile}
                  role={effectiveRole}
                  settings={erp.settings}
                  users={erp.users}
                  jobs={erp.jobs}
                  invoices={erp.invoices}
                  employees={erp.employees}
                  timeEntries={erp.timeEntries}
                  leaveRequests={erp.leaveRequests}
                  notes={erp.notes}
                  chartOfAccounts={erp.chartOfAccounts}
                  onOpenJobCard={setSelectedJobCard}
                  onUpdateJobCommission={erp.updateJobCommission}
                  onPayJobCommission={erp.payJobCommission}
                  onNavigate={setActiveSection}
                />
              )}

              {activeSection === 'settings' && (
                <SettingsTeamView
                  settings={erp.settings}
                  users={erp.users}
                  userInvites={erp.userInvites}
                  chartOfAccounts={erp.chartOfAccounts}
                  jobs={erp.jobs}
                  onUpdateSettings={erp.updateCompanySettings}
                  onUpdateUserAccess={erp.updateUserAccess}
                  onUpdateJobCommission={erp.updateJobCommission}
                  onCreateChartAccount={erp.createChartAccount}
                  onUpdateChartAccount={erp.updateChartAccount}
                  onDeleteChartAccount={erp.deleteChartAccount}
                  onSeedDefaultChartOfAccounts={erp.seedDefaultChartOfAccounts}
                  onCreateUserInvite={erp.createUserInvite}
                  onUpdateUserInviteStatus={erp.updateUserInviteStatus}
                  onDeleteUserInvite={erp.deleteUserInvite}
                />
              )}
            </>
          )}
        </main>
      </div>

      {liveSelectedJob && (
        <JobCardModal
          job={liveSelectedJob}
          settings={erp.settings}
          role={effectiveRole}
          onClose={() => setSelectedJobCard(null)}
          onUpdateJob={erp.updateJob}
          onUpdateJobCommission={erp.updateJobCommission}
          onAddCostEntry={erp.addJobCostEntry}
          subscribeJobCosts={erp.subscribeJobCosts}
          onCreateInvoiceFromJob={handleCreateInvoiceFromJob}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <ErpWorkspace />
    </AuthProvider>
  );
}
