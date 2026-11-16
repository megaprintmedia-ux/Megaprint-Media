import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useErpData } from './hooks/useErpData';
import { Job, NavSection, UserRole } from './types/erp';
import { BrandLogo } from './components/BrandLogo';
import { LoginView } from './components/LoginView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { JobsView } from './components/JobsView';
import { JobCardModal } from './components/JobCardModal';
import { ClientsView } from './components/ClientsView';
import { InventoryView } from './components/InventoryView';
import { GoodsReceivedView } from './components/GoodsReceivedView';
import { RequisitionsView } from './components/RequisitionsView';
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
    emailVerified,
    profile,
    authReady,
    signingIn,
    authError,
    activeViewRole,
    setActiveViewRole,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    refreshVerificationStatus,
    retryProfileSetup,
    clearAuthError,
    signOut,
  } = useAuth();

  const erp = useErpData();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedJobCard, setSelectedJobCard] = useState<Job | null>(null);
  const [prefillInvoiceJob, setPrefillInvoiceJob] = useState<Job | null>(null);
  const [newJobSignal, setNewJobSignal] = useState(0);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState('');

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">
          Loading Megaprint Operations System...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        logoDataUrl={erp.settings.logoDataUrl}
        companyName={erp.settings.companyName || 'Megaprint'}
        signingIn={signingIn}
        authError={authError}
        onSignInWithEmail={signInWithEmail}
        onSignUpWithEmail={signUpWithEmail}
        onSignInWithGoogle={signInWithGoogle}
        onSendPasswordReset={sendPasswordReset}
        onClearError={clearAuthError}
      />
    );
  }

  if (!emailVerified) {
    return (
      <div className="min-h-screen bg-[#f1f4f6] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full overflow-hidden shadow-sm">
          <div className="h-1.5 w-full bg-[#c5a049]" />
          <div className="p-8 space-y-5">
            <BrandLogo
              logoDataUrl={erp.settings.logoDataUrl}
              companyName={erp.settings.companyName || 'Megaprint'}
              variant="light"
            />
            <div className="space-y-2">
              <h1 className="font-display text-lg font-bold text-slate-900">
                Verify Your Email Address
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                We sent a verification link to{' '}
                <strong className="text-slate-900">{user.email}</strong>. Open
                your inbox or <strong>Spam / Junk</strong> folder for an email from{' '}
                <span className="font-mono text-xs text-slate-800">
                  noreply@spheric-machine-1v0ns.firebaseapp.com
                </span>
                , click the link, and this page will continue automatically.
              </p>
            </div>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 leading-relaxed">
                {authError}
              </div>
            )}

            {verificationNotice && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 leading-relaxed">
                {verificationNotice}
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={verifyingEmail}
                onClick={async () => {
                  setVerifyingEmail(true);
                  setVerificationNotice('');
                  try {
                    await refreshVerificationStatus({ silent: false });
                  } finally {
                    setVerifyingEmail(false);
                  }
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-[#136e66] hover:bg-[#0e5750] text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {verifyingEmail
                  ? 'Checking verification...'
                  : "I've Verified My Email — Continue"}
              </button>

              <button
                type="button"
                disabled={signingIn}
                onClick={signInWithGoogle}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Continue with Google (Instant Verification)
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    setVerificationNotice('');
                    const sent = await resendVerificationEmail();
                    if (sent) {
                      setVerificationNotice(
                        `Fresh verification link sent to ${user.email}. Check Inbox and Spam/Junk.`
                      );
                    }
                  }}
                  className="px-3.5 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Resend Link
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="px-3.5 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg max-w-sm w-full p-6 text-center space-y-3">
          <div className="text-sm font-medium text-slate-700">
            Setting up your Megaprint workspace profile...
          </div>
          {authError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 text-left">
              {authError}
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={retryProfileSetup}
              className="px-3.5 py-1.5 rounded-md bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Retry Setup
            </button>
            <button
              type="button"
              onClick={signOut}
              className="px-3.5 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Sign Out
            </button>
          </div>
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
                  cashBookEntries={erp.cashBookEntries}
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

              {activeSection === 'requisitions' && (
                <RequisitionsView
                  role={effectiveRole}
                  profile={profile}
                  settings={erp.settings}
                  requisitions={erp.requisitions}
                  inventoryItems={erp.inventoryItems}
                  jobs={erp.jobs}
                  chartOfAccounts={erp.chartOfAccounts}
                  onCreateRequisition={erp.createRequisition}
                  onUpdateRequisition={erp.updateRequisition}
                  onReviewRequisition={erp.reviewRequisition}
                  onFulfillRequisition={erp.fulfillRequisition}
                  onDeleteRequisition={erp.deleteRequisition}
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
                  onRemitSupplierWht={erp.markSupplierWhtRemitted}
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
          users={erp.users}
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
