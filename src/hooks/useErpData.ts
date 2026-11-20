import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  CashBookAccount,
  CashBookCategory,
  CashBookEntry,
  CashBookEntryType,
  ChartAccount,
  Client,
  CommissionBasis,
  CommissionStatus,
  CompanySettings,
  CostType,
  DEFAULT_ZIM_CASH_ACCOUNTS,
  Employee,
  Expense,
  ExpenseCategory,
  GoodsReceipt,
  GoodsReceiptCondition,
  GoodsReceiptLine,
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockStatus,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
  Job,
  JobCostEntry,
  LeaveRequest,
  MigrationRecordCategory,
  MigrationRecordOutcome,
  MigrationReferenceTable,
  MigrationRun,
  MigrationRunRecord,
  MigrationRunStatus,
  NoteAudience,
  NoteTone,
  OpeningBalanceRecord,
  OperationalNote,
  PayrollRun,
  PricingMode,
  Requisition,
  RequisitionLine,
  RequisitionPriority,
  RequisitionStatus,
  RequisitionType,
  Supplier,
  SupplierInvoice,
  SupplierInvoiceCategory,
  SupplierInvoiceStatus,
  TaxAccessScope,
  TimeEntry,
  UserInvite,
  UserInviteStatus,
  UserProfile,
  VatTreatment,
} from '../types/erp';
import {
  calculateJobCommission,
  calculateVatBreakdown,
  computeExpenseVatReportable,
  computeInvoiceVatReportable,
  computeSupplierInvoiceVatReportable,
  round2,
  summarizeTaxBreakdown,
} from '../utils/vat';
import {
  chunkArray,
  filterPlanForExecution,
  LegacyImportPlan,
  makeDeterministicId,
  normalizePaymentTermsDays,
} from '../utils/legacyImport';

function mapMethodToCashAccount(
  method: string,
  explicitAccount?: string
): CashBookAccount {
  if (explicitAccount && explicitAccount.trim()) {
    return explicitAccount.trim();
  }
  const m = (method || '').toLowerCase();
  if (
    m.includes('ecocash') ||
    m.includes('innbucks') ||
    m.includes('mobile') ||
    m.includes('mpesa') ||
    m.includes('m-pesa')
  ) {
    return 'EcoCash Merchant Till';
  }
  if (m.includes('petty')) {
    return 'Petty Cash Float';
  }
  if (m.includes('cash')) {
    return 'USD Cash Drawer';
  }
  return 'CBZ Nostro USD Account';
}

function deriveStockStatus(qty: number, reorderLevel: number): InventoryStockStatus {
  if (qty <= 0) return 'Out of Stock';
  if (qty <= reorderLevel) return 'Low Stock';
  return 'In Stock';
}

function trimStr(val: string | undefined, max: number): string {
  return (val || '').trim().slice(0, max);
}

function getCreatedMillis(val: unknown): number {
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function useErpData() {
  const { user, profile, authReady } = useAuth();
  const isActiveUser = Boolean(authReady && user && profile?.status === 'active');
  const isManagement = profile?.role === 'management';
  const isVatAuditorOnly = Boolean(
    profile?.role === 'accounts' && profile?.taxScope === 'vat_only'
  );
  const isAccountsOrMgmt = Boolean(
    profile?.role === 'management' ||
      (profile?.role === 'accounts' && profile?.taxScope !== 'vat_only')
  );

  const [settings, setSettings] = useState<CompanySettings>({
    id: 'default',
    companyName: 'Megaprint',
    tagline: 'Printing · Branding · Corporate Wear · Tailoring',
    taxPin: 'BP 0200148291',
    zimraTin: '2000148291',
    vatRegNumber: '10048291',
    address: 'Workington Industrial Area, Coventry Road, Harare',
    phone: '+263 77 200 0000',
    email: 'megaprintmedia@gmail.com',
    currency: 'USD',
    defaultVatRate: 15,
    defaultCommissionRatePct: 5,
    defaultCommissionBasis: 'gross_profit',
    logoDataUrl: '',
    ownerUid: '',
  });
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userInvites, setUserInvites] = useState<UserInvite[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartAccount[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [notes, setNotes] = useState<OperationalNote[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [cashBookEntries, setCashBookEntries] = useState<CashBookEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalanceRecord[]>([]);
  const [migrationRuns, setMigrationRuns] = useState<MigrationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isActiveUser || !user || !profile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubs: Array<() => void> = [];

    const isBootAdmin =
      user.email?.toLowerCase() === 'megaprintmedia@gmail.com' &&
      user.emailVerified;

    const makeTeamQuery = (colName: string, orderField = 'createdAt') => {
      const colRef = collection(db, colName);
      if (isBootAdmin) {
        return query(colRef, orderBy(orderField, 'desc'));
      }
      return query(
        colRef,
        where('staffUids', 'array-contains', user.uid),
        orderBy(orderField, 'desc')
      );
    };

    const makeHrQuery = (colName: string, fieldName = 'hrViewerUids') => {
      const colRef = collection(db, colName);
      if (isBootAdmin) {
        return query(colRef, orderBy('createdAt', 'desc'));
      }
      return query(
        colRef,
        where(fieldName, 'array-contains', user.uid),
        orderBy('createdAt', 'desc')
      );
    };

    // Company settings
    unsubs.push(
      onSnapshot(
        doc(db, 'companySettings', 'default'),
        (snap) => {
          if (snap.exists()) {
            setSettings({
              id: snap.id,
              ...(snap.data() as Omit<CompanySettings, 'id'>),
            });
          }
        },
        (err) =>
          handleFirestoreError(err, OperationType.GET, 'companySettings/default')
      )
    );

    if (isVatAuditorOnly) {
      setClients([]);
      setJobs([]);
      setTimeEntries([]);
      setLeaveRequests([]);
      setNotes([]);
      setInventoryItems([]);
      setGoodsReceipts([]);
      setRequisitions([]);
      setChartOfAccounts([]);
      setEmployees([]);
      setPayrollRuns([]);
      setCashBookEntries([]);
      setSuppliers([]);
      setOpeningBalances([]);
      setMigrationRuns([]);
      setUsers([]);
      setUserInvites([]);

      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'invoices'),
            where('vatViewerUids', 'array-contains', user.uid)
          ),
          (snap) => {
            const list = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Invoice, 'id'>),
              }))
              .filter((inv) => computeInvoiceVatReportable(inv))
              .sort(
                (a, b) =>
                  getCreatedMillis(b.createdAt) - getCreatedMillis(a.createdAt) ||
                  (b.issueDate || '').localeCompare(a.issueDate || '')
              );
            setInvoices(list);
            setLoading(false);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
        )
      );

      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'supplierInvoices'),
            where('vatViewerUids', 'array-contains', user.uid)
          ),
          (snap) => {
            const list = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<SupplierInvoice, 'id'>),
              }))
              .filter((si) => computeSupplierInvoiceVatReportable(si))
              .sort(
                (a, b) =>
                  getCreatedMillis(b.createdAt) - getCreatedMillis(a.createdAt) ||
                  (b.invoiceDate || '').localeCompare(a.invoiceDate || '')
              );
            setSupplierInvoices(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierInvoices')
        )
      );

      unsubs.push(
        onSnapshot(
          query(
            collection(db, 'expenses'),
            where('vatViewerUids', 'array-contains', user.uid)
          ),
          (snap) => {
            const list = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Expense, 'id'>),
              }))
              .filter((exp) => computeExpenseVatReportable(exp))
              .sort(
                (a, b) =>
                  getCreatedMillis(b.createdAt) - getCreatedMillis(a.createdAt) ||
                  (b.expenseDate || '').localeCompare(a.expenseDate || '')
              );
            setExpenses(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
        )
      );

      return () => {
        unsubs.forEach((fn) => fn());
      };
    }

    // Clients
    unsubs.push(
      onSnapshot(
        makeTeamQuery('clients'),
        (snap) => {
          setClients(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, 'id'>) }))
          );
          setLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'clients')
      )
    );

    // Jobs
    unsubs.push(
      onSnapshot(
        makeTeamQuery('jobs'),
        (snap) => {
          setJobs(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Job, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'jobs')
      )
    );

    // Invoices
    unsubs.push(
      onSnapshot(
        makeTeamQuery('invoices'),
        (snap) => {
          setInvoices(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'invoices')
      )
    );

    // Time Entries
    unsubs.push(
      onSnapshot(
        makeTeamQuery('timeEntries'),
        (snap) => {
          setTimeEntries(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<TimeEntry, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'timeEntries')
      )
    );

    // Leave Requests
    unsubs.push(
      onSnapshot(
        makeTeamQuery('leaveRequests'),
        (snap) => {
          setLeaveRequests(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<LeaveRequest, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'leaveRequests')
      )
    );

    // Operational Notes (Manager Sticky Notes)
    unsubs.push(
      onSnapshot(
        makeTeamQuery('notes'),
        (snap) => {
          setNotes(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<OperationalNote, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notes')
      )
    );

    // Inventory & Samples (All active staff)
    unsubs.push(
      onSnapshot(
        makeTeamQuery('inventoryItems'),
        (snap) => {
          setInventoryItems(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<InventoryItem, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryItems')
      )
    );

    // Goods Received Notes (All active staff)
    unsubs.push(
      onSnapshot(
        makeTeamQuery('goodsReceipts'),
        (snap) => {
          setGoodsReceipts(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<GoodsReceipt, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'goodsReceipts')
      )
    );

    // Internal Requisitions (All active staff)
    unsubs.push(
      onSnapshot(
        makeTeamQuery('requisitions'),
        (snap) => {
          setRequisitions(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Requisition, 'id'>),
            }))
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'requisitions')
      )
    );

    // Chart of Accounts (Active staff can view active banks/cash accounts)
    unsubs.push(
      onSnapshot(
        makeTeamQuery('chartOfAccounts'),
        (snap) => {
          const items = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<ChartAccount, 'id'>),
            }))
            .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
          setChartOfAccounts(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'chartOfAccounts')
      )
    );

    // Restricted Accounts & HR collections
    if (isAccountsOrMgmt) {
      unsubs.push(
        onSnapshot(
          makeTeamQuery('expenses'),
          (snap) => {
            setExpenses(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Expense, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
        )
      );

      unsubs.push(
        onSnapshot(
          makeHrQuery('supplierInvoices', 'viewerUids'),
          (snap) => {
            setSupplierInvoices(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<SupplierInvoice, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'supplierInvoices')
        )
      );

      unsubs.push(
        onSnapshot(
          makeHrQuery('employees'),
          (snap) => {
            setEmployees(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Employee, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
        )
      );

      unsubs.push(
        onSnapshot(
          makeHrQuery('payrollRuns'),
          (snap) => {
            setPayrollRuns(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<PayrollRun, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'payrollRuns')
        )
      );

      unsubs.push(
        onSnapshot(
          makeHrQuery('cashBookEntries', 'viewerUids'),
          (snap) => {
            setCashBookEntries(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<CashBookEntry, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'cashBookEntries')
        )
      );
    } else {
      setExpenses([]);
      setSupplierInvoices([]);
      setPayrollRuns([]);
      setCashBookEntries([]);
      // Non-HR staff can still read their own linked Employee record (leave balances & rate)
      unsubs.push(
        onSnapshot(
          query(collection(db, 'employees'), where('userUid', '==', user.uid)),
          (snap) => {
            setEmployees(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Employee, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
        )
      );
    }

    // Users & Invites (Management only)
    if (isManagement) {
      const usersQuery = isBootAdmin
        ? query(collection(db, 'users'), orderBy('createdAt', 'desc'))
        : query(
            collection(db, 'users'),
            where('adminUids', 'array-contains', user.uid),
            orderBy('createdAt', 'desc')
          );
      unsubs.push(
        onSnapshot(
          usersQuery,
          (snap) => {
            setUsers(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<UserProfile, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );

      const invitesQuery = isBootAdmin
        ? query(collection(db, 'userInvites'), orderBy('createdAt', 'desc'))
        : query(
            collection(db, 'userInvites'),
            where('adminUids', 'array-contains', user.uid),
            orderBy('createdAt', 'desc')
          );
      unsubs.push(
        onSnapshot(
          invitesQuery,
          (snap) => {
            setUserInvites(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<UserInvite, 'id'>),
              }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'userInvites')
        )
      );

      const migrationRunsQuery = isBootAdmin
        ? query(collection(db, 'migrationRuns'))
        : query(
            collection(db, 'migrationRuns'),
            where('adminUids', 'array-contains', user.uid)
          );
      unsubs.push(
        onSnapshot(
          migrationRunsQuery,
          (snap) => {
            const list = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<MigrationRun, 'id'>),
              }))
              .sort(
                (a, b) =>
                  getCreatedMillis(b.updatedAt || b.createdAt) -
                  getCreatedMillis(a.updatedAt || a.createdAt)
              );
            setMigrationRuns(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'migrationRuns')
        )
      );
    } else {
      setUsers([]);
      setUserInvites([]);
      setMigrationRuns([]);
    }

    // Suppliers Master Register (All full active staff)
    const suppliersQuery = isBootAdmin
      ? query(collection(db, 'suppliers'))
      : query(
          collection(db, 'suppliers'),
          where('staffUids', 'array-contains', user.uid)
        );
    unsubs.push(
      onSnapshot(
        suppliersQuery,
        (snap) => {
          const list = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Supplier, 'id'>),
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setSuppliers(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
      )
    );

    // Historical Opening Balances (Accounts/Management + Sales receivables/credits; excluded from VAT-only auditor)
    if (isAccountsOrMgmt || profile.role === 'sales') {
      const obQuery = isBootAdmin
        ? query(collection(db, 'openingBalances'))
        : query(
            collection(db, 'openingBalances'),
            where('viewerUids', 'array-contains', user.uid)
          );
      unsubs.push(
        onSnapshot(
          obQuery,
          (snap) => {
            const list = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<OpeningBalanceRecord, 'id'>),
              }))
              .sort((a, b) =>
                (a.counterpartyName || '').localeCompare(b.counterpartyName || '')
              );
            setOpeningBalances(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'openingBalances')
        )
      );
    } else {
      setOpeningBalances([]);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [isActiveUser, isAccountsOrMgmt, isManagement, isVatAuditorOnly, user, profile]);

  const activeStaffUids = useMemo(() => {
    const uidSet = new Set<string>();
    if (user?.uid && !isVatAuditorOnly) uidSet.add(user.uid);
    users
      .filter(
        (u) =>
          u.status === 'active' &&
          !(u.role === 'accounts' && u.taxScope === 'vat_only')
      )
      .forEach((u) => {
        if (uidSet.size < 10) uidSet.add(u.uid);
      });
    return Array.from(uidSet);
  }, [user?.uid, isVatAuditorOnly, users]);

  const hrViewerUids = useMemo(() => {
    const uidSet = new Set<string>();
    if (user?.uid && !isVatAuditorOnly) uidSet.add(user.uid);
    users
      .filter(
        (u) =>
          u.status === 'active' &&
          (u.role === 'management' ||
            (u.role === 'accounts' && u.taxScope !== 'vat_only'))
      )
      .forEach((u) => {
        if (uidSet.size < 10) uidSet.add(u.uid);
      });
    return Array.from(uidSet);
  }, [user?.uid, isVatAuditorOnly, users]);

  const vatAuditorUids = useMemo(() => {
    const uidSet = new Set<string>();
    users
      .filter(
        (u) =>
          u.status === 'active' &&
          u.role === 'accounts' &&
          u.taxScope === 'vat_only'
      )
      .forEach((u) => {
        if (uidSet.size < 10) uidSet.add(u.uid);
      });
    return Array.from(uidSet);
  }, [users]);

  const activeAdminUids = useMemo(() => {
    const uidSet = new Set<string>();
    if (user?.uid) uidSet.add(user.uid);
    users
      .filter((u) => u.status === 'active' && u.role === 'management')
      .forEach((u) => {
        if (uidSet.size < 10) uidSet.add(u.uid);
      });
    return Array.from(uidSet);
  }, [user?.uid, users]);

  const salesAndFinanceViewerUids = useMemo(() => {
    const uidSet = new Set<string>();
    if (user?.uid && !isVatAuditorOnly) uidSet.add(user.uid);
    users
      .filter(
        (u) =>
          u.status === 'active' &&
          (u.role === 'management' ||
            u.role === 'sales' ||
            (u.role === 'accounts' && u.taxScope !== 'vat_only'))
      )
      .forEach((u) => {
        if (uidSet.size < 10) uidSet.add(u.uid);
      });
    return Array.from(uidSet);
  }, [user?.uid, isVatAuditorOnly, users]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const updateCompanySettings = async (
    updates: Partial<Omit<CompanySettings, 'id' | 'ownerUid' | 'updatedAt'>>
  ) => {
    if (!user) return;
    const payload = {
      companyName: trimStr(updates.companyName ?? settings.companyName, 120) || 'Megaprint',
      tagline: trimStr(updates.tagline ?? settings.tagline, 200),
      taxPin: trimStr(updates.taxPin ?? settings.taxPin, 64),
      zimraTin: trimStr(updates.zimraTin ?? settings.zimraTin, 64),
      vatRegNumber: trimStr(updates.vatRegNumber ?? settings.vatRegNumber, 64),
      address: trimStr(updates.address ?? settings.address, 300),
      phone: trimStr(updates.phone ?? settings.phone, 40),
      email: trimStr(updates.email ?? settings.email, 200),
      currency: trimStr(updates.currency ?? settings.currency, 6) || 'USD',
      defaultVatRate: Math.max(
        0,
        Math.min(50, Number(updates.defaultVatRate ?? settings.defaultVatRate) || 0)
      ),
      defaultCommissionRatePct: Math.max(
        0,
        Math.min(
          50,
          round2(
            Number(
              updates.defaultCommissionRatePct ??
                settings.defaultCommissionRatePct ??
                5
            ) || 0
          )
        )
      ),
      defaultCommissionBasis:
        updates.defaultCommissionBasis ??
        settings.defaultCommissionBasis ??
        'gross_profit',
      logoDataUrl: (updates.logoDataUrl ?? settings.logoDataUrl ?? '').slice(
        0,
        200000
      ),
      ownerUid: settings.ownerUid || user.uid,
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'companySettings', 'default'), payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'companySettings/default');
    }
  };

  const syncZimraVatScope = async (overrides?: {
    vatAuditorUids?: string[];
    staffUids?: string[];
    hrViewerUids?: string[];
  }) => {
    if (!user || !isManagement) return 0;
    const targetVatUids = (overrides?.vatAuditorUids ?? vatAuditorUids).slice(0, 10);
    const targetStaffUids = (overrides?.staffUids ?? activeStaffUids).slice(0, 10);
    const targetHrUids = (overrides?.hrViewerUids ?? hrViewerUids).slice(0, 10);

    const ops: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];

    invoices.forEach((inv) => {
      const reportable = computeInvoiceVatReportable(inv);
      const nextVatUids = reportable ? targetVatUids : [];
      ops.push({
        col: 'invoices',
        id: inv.id,
        data: {
          isVatReportable: reportable,
          vatViewerUids: nextVatUids,
          staffUids: targetStaffUids,
          updatedAt: serverTimestamp(),
        },
      });
    });

    supplierInvoices.forEach((si) => {
      const reportable = computeSupplierInvoiceVatReportable(si);
      const nextVatUids = reportable ? targetVatUids : [];
      ops.push({
        col: 'supplierInvoices',
        id: si.id,
        data: {
          isVatReportable: reportable,
          vatViewerUids: nextVatUids,
          viewerUids: targetHrUids,
          updatedAt: serverTimestamp(),
        },
      });
    });

    expenses.forEach((exp) => {
      const reportable = computeExpenseVatReportable(exp);
      const nextVatUids = reportable ? targetVatUids : [];
      ops.push({
        col: 'expenses',
        id: exp.id,
        data: {
          isVatReportable: reportable,
          vatViewerUids: nextVatUids,
          staffUids: targetStaffUids,
          updatedAt: serverTimestamp(),
        },
      });
    });

    try {
      for (let i = 0; i < ops.length; i += 400) {
        const chunk = ops.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((op) => {
          batch.update(doc(db, op.col, op.id), op.data);
        });
        await batch.commit();
      }
      return ops.length;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'syncZimraVatScope');
      return 0;
    }
  };

  const updateUserAccess = async (
    targetUid: string,
    role: UserProfile['role'],
    department: UserProfile['department'],
    status: UserProfile['status'],
    commissionRatePct?: number,
    taxScope?: TaxAccessScope
  ) => {
    try {
      const targetExisting = users.find((u) => u.uid === targetUid);
      const effectiveScope: TaxAccessScope =
        role === 'accounts'
          ? taxScope ?? targetExisting?.taxScope ?? 'all'
          : 'all';
      const updates: Record<string, unknown> = {
        role,
        department,
        status,
        taxScope: effectiveScope,
        updatedAt: serverTimestamp(),
      };
      if (role !== 'sales') {
        updates.commissionRatePct = 0;
      } else if (commissionRatePct !== undefined) {
        updates.commissionRatePct = Math.max(
          0,
          Math.min(50, round2(Number(commissionRatePct) || 0))
        );
      }
      await updateDoc(doc(db, 'users', targetUid), updates);

      // Keep ZIMRA VAT access lists synchronized when taxScope or status changes
      if (
        taxScope !== undefined ||
        (targetExisting &&
          (targetExisting.role === 'accounts' || role === 'accounts'))
      ) {
        const simulatedUsers = users.map((u) =>
          u.uid === targetUid
            ? { ...u, role, department, status, taxScope: effectiveScope }
            : u
        );
        const nextVat = simulatedUsers
          .filter(
            (u) =>
              u.status === 'active' &&
              u.role === 'accounts' &&
              u.taxScope === 'vat_only'
          )
          .map((u) => u.uid)
          .slice(0, 10);
        const nextStaff = Array.from(
          new Set(
            [
              ...(user?.uid ? [user.uid] : []),
              ...simulatedUsers
                .filter(
                  (u) =>
                    u.status === 'active' &&
                    !(u.role === 'accounts' && u.taxScope === 'vat_only')
                )
                .map((u) => u.uid),
            ].filter(Boolean)
          )
        ).slice(0, 10);
        const nextHr = Array.from(
          new Set(
            [
              ...(user?.uid ? [user.uid] : []),
              ...simulatedUsers
                .filter(
                  (u) =>
                    u.status === 'active' &&
                    (u.role === 'management' ||
                      (u.role === 'accounts' && u.taxScope !== 'vat_only'))
                )
                .map((u) => u.uid),
            ].filter(Boolean)
          )
        ).slice(0, 10);
        await syncZimraVatScope({
          vatAuditorUids: nextVat,
          staffUids: nextStaff,
          hrViewerUids: nextHr,
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const createClient = async (
    input: Omit<Client, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const cleanVatReg = trimStr(input.vatRegNumber, 64);
    try {
      const ref = await addDoc(collection(db, 'clients'), {
        companyName: trimStr(input.companyName, 160),
        contactName: trimStr(input.contactName, 120),
        email: trimStr(input.email, 200),
        phone: trimStr(input.phone, 40),
        taxPin: trimStr(input.taxPin, 64),
        zimraTin: trimStr(input.zimraTin, 64),
        vatRegNumber: cleanVatReg,
        isVatRegistered: Boolean(input.isVatRegistered ?? Boolean(cleanVatReg)),
        address: trimStr(input.address, 300),
        paymentTermsDays: normalizePaymentTermsDays(input.paymentTermsDays, 30),
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'clients');
    }
  };

  const updateClient = async (
    clientId: string,
    input: Partial<Omit<Client, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (input.companyName !== undefined) clean.companyName = trimStr(input.companyName, 160);
      if (input.contactName !== undefined) clean.contactName = trimStr(input.contactName, 120);
      if (input.email !== undefined) clean.email = trimStr(input.email, 200);
      if (input.phone !== undefined) clean.phone = trimStr(input.phone, 40);
      if (input.taxPin !== undefined) clean.taxPin = trimStr(input.taxPin, 64);
      if (input.zimraTin !== undefined) clean.zimraTin = trimStr(input.zimraTin, 64);
      if (input.vatRegNumber !== undefined)
        clean.vatRegNumber = trimStr(input.vatRegNumber, 64);
      if (input.isVatRegistered !== undefined)
        clean.isVatRegistered = Boolean(input.isVatRegistered);
      if (input.address !== undefined) clean.address = trimStr(input.address, 300);
      if (input.paymentTermsDays !== undefined)
        clean.paymentTermsDays = normalizePaymentTermsDays(input.paymentTermsDays, 0);
      if (input.notes !== undefined) clean.notes = trimStr(input.notes, 1000);
      await updateDoc(doc(db, 'clients', clientId), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${clientId}`);
    }
  };

  const createJob = async (
    input: Omit<Job, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const estCostSum =
      (Number(input.estimatedMaterialCost) || 0) +
      (Number(input.estimatedLaborCost) || 0) +
      (Number(input.estimatedSubcontractCost) || 0) +
      (Number(input.estimatedOverheadCost) || 0);
    const rawSalesUid = trimStr(input.assignedSalesUid, 128);
    const assignedRepProfile = rawSalesUid
      ? users.find((u) => u.uid === rawSalesUid) ||
        (profile?.uid === rawSalesUid ? profile : undefined)
      : undefined;
    const isSalesEligible = Boolean(
      rawSalesUid && (!assignedRepProfile || assignedRepProfile.role === 'sales')
    );

    const basis: CommissionBasis =
      input.commissionBasis || settings.defaultCommissionBasis || 'gross_profit';
    const ratePct = isSalesEligible
      ? Math.max(
          0,
          Math.min(
            50,
            round2(
              Number(
                input.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5
              ) || 0
            )
          )
        )
      : 0;
    const activeCost =
      (input.actualCostTotal || 0) > 0 ? input.actualCostTotal || 0 : estCostSum;
    const computedComm = isSalesEligible
      ? input.commissionAmount !== undefined
        ? round2(Math.max(0, Number(input.commissionAmount) || 0))
        : calculateJobCommission({
            netTotal: input.netTotal,
            grossProfit: input.netTotal - activeCost,
            commissionRatePct: ratePct,
            commissionBasis: basis,
          })
      : 0;

    try {
      const ref = await addDoc(collection(db, 'jobs'), {
        jobNumber: trimStr(input.jobNumber, 40),
        clientId: input.clientId,
        clientName: trimStr(input.clientName, 160),
        title: trimStr(input.title, 200),
        category: input.category,
        status: input.status,
        priority: input.priority,
        dueDate: trimStr(input.dueDate, 32),
        printMethod: trimStr(input.printMethod, 120),
        substrateOrFabric: trimStr(input.substrateOrFabric, 160),
        colorSpecs: trimStr(input.colorSpecs, 160),
        quantity: Math.max(1, Number(input.quantity) || 1),
        sizeBreakdown: input.sizeBreakdown,
        artworkNotes: trimStr(input.artworkNotes, 2000),
        tailoringMeasurements: trimStr(input.tailoringMeasurements, 2000),
        checklist: input.checklist,
        pricingMode: input.pricingMode,
        vatTreatment: input.vatTreatment,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        unitPrice: Math.max(0, round2(input.unitPrice)),
        netTotal: Math.max(0, round2(input.netTotal)),
        vatAmount: Math.max(0, round2(input.vatAmount)),
        grossTotal: Math.max(0, round2(input.grossTotal)),
        estimatedMaterialCost: Math.max(0, round2(input.estimatedMaterialCost)),
        estimatedLaborCost: Math.max(0, round2(input.estimatedLaborCost)),
        estimatedSubcontractCost: Math.max(0, round2(input.estimatedSubcontractCost)),
        estimatedOverheadCost: Math.max(0, round2(input.estimatedOverheadCost)),
        actualCostTotal: Math.max(0, round2(input.actualCostTotal)),
        assignedSalesUid: isSalesEligible ? rawSalesUid : '',
        assignedSalesName: isSalesEligible
          ? trimStr(
              assignedRepProfile?.displayName || input.assignedSalesName,
              120
            )
          : '',
        assignedProductionName: trimStr(input.assignedProductionName, 120),
        commissionRatePct: ratePct,
        commissionBasis: basis,
        commissionAmount: computedComm,
        commissionStatus: input.commissionStatus || 'Pending',
        commissionPaidDate: trimStr(input.commissionPaidDate, 32),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'jobs');
    }
  };

  const updateJob = async (
    jobId: string,
    updates: Partial<Omit<Job, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      await deleteDoc(doc(db, 'jobs', jobId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `jobs/${jobId}`);
    }
  };

  const addJobCostEntry = async (params: {
    jobId: string;
    currentActualCostTotal: number;
    costType: CostType;
    description: string;
    quantity: number;
    unitCost: number;
  }) => {
    if (!user || !profile) return;
    const totalCost = round2(params.quantity * params.unitCost);
    const batch = writeBatch(db);
    const costRef = doc(collection(db, `jobs/${params.jobId}/costs`));
    batch.set(costRef, {
      jobId: params.jobId,
      costType: params.costType,
      description: trimStr(params.description, 240),
      quantity: Math.max(0.01, Number(params.quantity) || 1),
      unitCost: Math.max(0, round2(params.unitCost)),
      totalCost: Math.max(0, totalCost),
      loggedByName: trimStr(profile.displayName, 120) || 'Staff',
      ownerUid: user.uid,
      staffUids: activeStaffUids,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'jobs', params.jobId), {
      actualCostTotal: round2((params.currentActualCostTotal || 0) + totalCost),
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `jobs/${params.jobId}/costs`);
    }
  };

  const subscribeJobCosts = (
    jobId: string,
    cb: (entries: JobCostEntry[]) => void
  ) => {
    if (!user) return () => {};
    const isBootAdmin =
      user.email?.toLowerCase() === 'megaprintmedia@gmail.com' &&
      user.emailVerified;
    const colRef = collection(db, `jobs/${jobId}/costs`);
    const q = isBootAdmin
      ? query(colRef, orderBy('createdAt', 'desc'))
      : query(
          colRef,
          where('staffUids', 'array-contains', user.uid),
          orderBy('createdAt', 'desc')
        );
    return onSnapshot(
      q,
      (snap) => {
        cb(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JobCostEntry, 'id'>),
          }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `jobs/${jobId}/costs`)
    );
  };

  const createInvoice = async (
    input: Omit<Invoice, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const boundedLines = input.lines.slice(0, 10);
    const taxSummary = summarizeTaxBreakdown(boundedLines, {
      netAmount: input.netAmount,
      vatAmount: input.vatAmount,
      grossAmount: input.grossAmount,
    });
    const cleanVatAmount = Math.max(0, round2(input.vatAmount));
    const cleanClientVatPin = trimStr(input.clientVatPin, 64);
    const cleanClientTin = trimStr(input.clientTin, 64);
    const cleanClientVatReg = trimStr(input.clientVatReg, 64);
    const isVatReportable = computeInvoiceVatReportable({
      status: input.status,
      vatAmount: cleanVatAmount,
      clientTin: cleanClientTin,
      clientVatPin: cleanClientVatPin,
      clientVatReg: cleanClientVatReg,
    });
    try {
      const ref = await addDoc(collection(db, 'invoices'), {
        invoiceNumber: trimStr(input.invoiceNumber, 40),
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        clientId: input.clientId,
        clientName: trimStr(input.clientName, 160),
        clientVatPin: cleanClientVatPin,
        clientTin: cleanClientTin,
        clientVatReg: cleanClientVatReg,
        issueDate: trimStr(input.issueDate, 32),
        dueDate: trimStr(input.dueDate, 32),
        status: input.status,
        pricingMode: input.pricingMode,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        lines: boundedLines,
        standardNetAmount: Math.max(
          0,
          round2(input.standardNetAmount ?? taxSummary.standardNetAmount)
        ),
        zeroRatedAmount: Math.max(
          0,
          round2(input.zeroRatedAmount ?? taxSummary.zeroRatedAmount)
        ),
        exemptAmount: Math.max(0, round2(input.exemptAmount ?? taxSummary.exemptAmount)),
        netAmount: Math.max(0, round2(input.netAmount)),
        vatAmount: cleanVatAmount,
        grossAmount: Math.max(0, round2(input.grossAmount)),
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtWithheldAmount: Math.max(0, round2(Number(input.whtWithheldAmount) || 0)),
        whtCertificateRef: trimStr(input.whtCertificateRef, 120),
        amountPaid: Math.max(0, round2(input.amountPaid)),
        balanceDue: Math.max(0, round2(input.balanceDue)),
        paymentMethod: trimStr(input.paymentMethod, 60),
        paymentReference: trimStr(input.paymentReference, 120),
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'invoices');
    }
  };

  const updateInvoice = async (
    invoiceId: string,
    input: {
      invoiceNumber: string;
      jobId?: string;
      jobNumber?: string;
      clientId: string;
      clientName: string;
      clientVatPin?: string;
      clientTin?: string;
      clientVatReg?: string;
      issueDate: string;
      dueDate: string;
      status: InvoiceStatus;
      pricingMode: PricingMode;
      vatRate: number;
      lines: InvoiceLine[];
      whtRate?: number;
      whtWithheldAmount?: number;
      whtCertificateRef?: string;
      amountPaid: number;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    }
  ) => {
    const boundedLines = input.lines.slice(0, 10);
    if (boundedLines.length === 0) return;
    const taxSummary = summarizeTaxBreakdown(boundedLines);
    const cleanClientVatPin = trimStr(input.clientVatPin, 64);
    const cleanClientTin = trimStr(input.clientTin, 64);
    const cleanClientVatReg = trimStr(input.clientVatReg, 64);
    const cleanPaid = Math.max(0, Math.min(taxSummary.grossAmount, round2(input.amountPaid)));
    const balanceDue = round2(Math.max(0, taxSummary.grossAmount - cleanPaid));
    const isVatReportable = computeInvoiceVatReportable({
      status: input.status,
      vatAmount: taxSummary.vatAmount,
      clientTin: cleanClientTin,
      clientVatPin: cleanClientVatPin,
      clientVatReg: cleanClientVatReg,
    });
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        invoiceNumber: trimStr(input.invoiceNumber, 40),
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        clientId: input.clientId,
        clientName: trimStr(input.clientName, 160),
        clientVatPin: cleanClientVatPin,
        clientTin: cleanClientTin,
        clientVatReg: cleanClientVatReg,
        issueDate: trimStr(input.issueDate, 32),
        dueDate: trimStr(input.dueDate, 32),
        status: input.status,
        pricingMode: input.pricingMode,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        lines: boundedLines,
        standardNetAmount: taxSummary.standardNetAmount,
        zeroRatedAmount: taxSummary.zeroRatedAmount,
        exemptAmount: taxSummary.exemptAmount,
        netAmount: taxSummary.netAmount,
        vatAmount: taxSummary.vatAmount,
        grossAmount: taxSummary.grossAmount,
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtWithheldAmount: Math.max(0, round2(Number(input.whtWithheldAmount) || 0)),
        whtCertificateRef: trimStr(input.whtCertificateRef, 120),
        amountPaid: cleanPaid,
        balanceDue,
        paymentMethod: trimStr(input.paymentMethod, 60),
        paymentReference: trimStr(input.paymentReference, 120),
        notes: trimStr(input.notes, 1000),
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
    }
  };

  const deleteInvoice = async (invoiceId: string) => {
    try {
      await deleteDoc(doc(db, 'invoices', invoiceId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invoices/${invoiceId}`);
    }
  };

  const recordInvoicePayment = async (
    invoice: Invoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string,
    options?: {
      whtWithheld?: number;
      whtRate?: number;
      whtCertificateRef?: string;
    }
  ) => {
    const cleanPay = Math.max(0, round2(paymentAmount));
    const cleanWht = Math.max(0, round2(options?.whtWithheld || 0));
    const totalSettled = round2(cleanPay + cleanWht);
    if (totalSettled <= 0) return;

    const newPaid = round2(
      Math.min(invoice.grossAmount, invoice.amountPaid + totalSettled)
    );
    const newBalance = round2(Math.max(0, invoice.grossAmount - newPaid));
    const nextStatus: Invoice['status'] =
      newBalance <= 0.01 ? 'Paid' : newPaid > 0 ? 'Part Paid' : invoice.status;
    const nextWhtTotal = round2((invoice.whtWithheldAmount || 0) + cleanWht);
    const inferredWhtRate =
      options?.whtRate !== undefined
        ? options.whtRate
        : cleanWht > 0 && invoice.netAmount > 0
          ? round2((cleanWht / invoice.netAmount) * 100)
          : invoice.whtRate || 0;
    const isVatReportable = computeInvoiceVatReportable({
      status: nextStatus,
      vatAmount: invoice.vatAmount,
      clientTin: invoice.clientTin,
      clientVatPin: invoice.clientVatPin,
      clientVatReg: invoice.clientVatReg,
    });

    try {
      const batch = writeBatch(db);
      const invUpdate: Record<string, unknown> = {
        amountPaid: newPaid,
        balanceDue: newBalance,
        status: nextStatus,
        paymentMethod: trimStr(method, 60),
        paymentReference: trimStr(reference, 120),
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        updatedAt: serverTimestamp(),
      };
      if (cleanWht > 0 || options?.whtCertificateRef) {
        invUpdate.whtWithheldAmount = nextWhtTotal;
        invUpdate.whtRate = Math.max(0, Math.min(50, round2(Number(inferredWhtRate) || 0)));
        invUpdate.whtCertificateRef = trimStr(
          options?.whtCertificateRef || invoice.whtCertificateRef,
          120
        );
      }
      batch.update(doc(db, 'invoices', invoice.id), invUpdate);

      if (user && profile && isAccountsOrMgmt && cleanPay > 0) {
        const cbRef = doc(collection(db, 'cashBookEntries'));
        batch.set(cbRef, {
          entryNumber: `CB-${new Date().getFullYear()}-${String(
            1 + cashBookEntries.length
          ).padStart(3, '0')}`,
          entryDate: new Date().toISOString().slice(0, 10),
          entryType: 'Receipt (Inflow)',
          account: mapMethodToCashAccount(method, cashBookAccount),
          counterparty: trimStr(invoice.clientName, 160) || 'Customer',
          category: 'Customer Receipt',
          reference: trimStr(reference, 120) || trimStr(method, 60),
          linkedDocRef: trimStr(invoice.invoiceNumber, 80),
          amount: cleanPay,
          reconciled: false,
          recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
          notes:
            cleanWht > 0
              ? `Auto-posted from Invoice ${invoice.invoiceNumber} (after ${cleanWht.toFixed(
                  2
                )} WHT withheld)`
              : `Auto-posted from Invoice ${invoice.invoiceNumber}`,
          ownerUid: user.uid,
          viewerUids: hrViewerUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Mark linked job commission Earned once customer pays invoice in full
      if (user && profile && isAccountsOrMgmt && nextStatus === 'Paid' && invoice.jobId) {
        const linkedJob = jobs.find((j) => j.id === invoice.jobId);
        if (
          linkedJob &&
          linkedJob.status !== 'Cancelled' &&
          (!linkedJob.commissionStatus || linkedJob.commissionStatus === 'Pending') &&
          (linkedJob.commissionAmount || 0) > 0
        ) {
          batch.update(doc(db, 'jobs', linkedJob.id), {
            commissionStatus: 'Earned',
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoice.id}`);
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, status: Invoice['status']) => {
    const targetInv = invoices.find((i) => i.id === invoiceId);
    const isVatReportable = targetInv
      ? computeInvoiceVatReportable({
          status,
          vatAmount: targetInv.vatAmount,
          clientTin: targetInv.clientTin,
          clientVatPin: targetInv.clientVatPin,
          clientVatReg: targetInv.clientVatReg,
        })
      : status !== 'Draft' && status !== 'Void';
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status,
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}`);
    }
  };

  const createExpense = async (
    input: Omit<Expense, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const treatment =
      input.vatTreatment ?? (input.isVatClaimable ? 'standard' : 'exempt');
    const cleanClaimable = Boolean(input.isVatClaimable && treatment === 'standard');
    const cleanVatAmount = Math.max(0, round2(input.vatAmount));
    const cleanVendorVatPin = trimStr(input.vendorVatPin, 64);
    const cleanVendorTin = trimStr(input.vendorTin, 64);
    const cleanVendorVatReg = trimStr(input.vendorVatReg, 64);
    const isVatReportable = computeExpenseVatReportable({
      isVatClaimable: cleanClaimable,
      vatAmount: cleanVatAmount,
      vendorTin: cleanVendorTin,
      vendorVatPin: cleanVendorVatPin,
      vendorVatReg: cleanVendorVatReg,
    });
    try {
      await addDoc(collection(db, 'expenses'), {
        expenseNumber: trimStr(input.expenseNumber, 40),
        vendorName: trimStr(input.vendorName, 160),
        vendorVatPin: cleanVendorVatPin,
        vendorTin: cleanVendorTin,
        vendorVatReg: cleanVendorVatReg,
        vendorInvoiceRef: trimStr(input.vendorInvoiceRef, 80),
        category: input.category,
        jobId: trimStr(input.jobId, 128),
        expenseDate: trimStr(input.expenseDate, 32),
        vatTreatment: treatment,
        isVatClaimable: cleanClaimable,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        netAmount: Math.max(0, round2(input.netAmount)),
        vatAmount: cleanVatAmount,
        grossAmount: Math.max(0, round2(input.grossAmount)),
        whtApplicable: Boolean(input.whtApplicable),
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtAmount: Math.max(0, round2(Number(input.whtAmount) || 0)),
        paymentStatus: input.paymentStatus,
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  const updateExpense = async (
    expenseId: string,
    input: {
      expenseNumber: string;
      vendorName: string;
      vendorVatPin?: string;
      vendorTin?: string;
      vendorVatReg?: string;
      vendorInvoiceRef?: string;
      category: ExpenseCategory;
      jobId?: string;
      expenseDate: string;
      vatTreatment: VatTreatment;
      isVatClaimable: boolean;
      vatRate: number;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
      whtApplicable?: boolean;
      whtRate?: number;
      whtAmount?: number;
      paymentStatus: 'Paid' | 'Payable';
      notes?: string;
    }
  ) => {
    const cleanClaimable = Boolean(
      input.isVatClaimable && input.vatTreatment === 'standard'
    );
    const cleanVatAmount = Math.max(0, round2(input.vatAmount));
    const cleanVendorVatPin = trimStr(input.vendorVatPin, 64);
    const cleanVendorTin = trimStr(input.vendorTin, 64);
    const cleanVendorVatReg = trimStr(input.vendorVatReg, 64);
    const isVatReportable = computeExpenseVatReportable({
      isVatClaimable: cleanClaimable,
      vatAmount: cleanVatAmount,
      vendorTin: cleanVendorTin,
      vendorVatPin: cleanVendorVatPin,
      vendorVatReg: cleanVendorVatReg,
    });
    try {
      await updateDoc(doc(db, 'expenses', expenseId), {
        expenseNumber: trimStr(input.expenseNumber, 40),
        vendorName: trimStr(input.vendorName, 160),
        vendorVatPin: cleanVendorVatPin,
        vendorTin: cleanVendorTin,
        vendorVatReg: cleanVendorVatReg,
        vendorInvoiceRef: trimStr(input.vendorInvoiceRef, 80),
        category: input.category,
        jobId: trimStr(input.jobId, 128),
        expenseDate: trimStr(input.expenseDate, 32),
        vatTreatment: input.vatTreatment,
        isVatClaimable: cleanClaimable,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        netAmount: Math.max(0, round2(input.netAmount)),
        vatAmount: cleanVatAmount,
        grossAmount: Math.max(0, round2(input.grossAmount)),
        whtApplicable: Boolean(input.whtApplicable),
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtAmount: Math.max(0, round2(Number(input.whtAmount) || 0)),
        paymentStatus: input.paymentStatus,
        notes: trimStr(input.notes, 1000),
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expenseId}`);
    }
  };

  const deleteExpense = async (expenseId: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
    }
  };

  const toggleExpensePaymentStatus = async (expense: Expense) => {
    try {
      await updateDoc(doc(db, 'expenses', expense.id), {
        paymentStatus: expense.paymentStatus === 'Paid' ? 'Payable' : 'Paid',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${expense.id}`);
    }
  };

  const createEmployee = async (
    input: Omit<Employee, 'id' | 'ownerUid' | 'hrViewerUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'employees'), {
        employeeCode: trimStr(input.employeeCode, 32),
        fullName: trimStr(input.fullName, 120),
        email: trimStr(input.email, 200),
        phone: trimStr(input.phone, 40),
        department: input.department,
        jobTitle: trimStr(input.jobTitle, 120),
        employmentType: input.employmentType,
        hourlyRate: Math.max(0, round2(input.hourlyRate)),
        monthlySalary: Math.max(0, round2(input.monthlySalary)),
        taxDeductionRate: Math.max(0, Math.min(60, Number(input.taxDeductionRate) || 0)),
        annualLeaveBalance: Math.max(0, Number(input.annualLeaveBalance) || 0),
        sickLeaveBalance: Math.max(0, Number(input.sickLeaveBalance) || 0),
        status: input.status,
        userUid: trimStr(input.userUid, 128),
        ownerUid: user.uid,
        hrViewerUids: hrViewerUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'employees');
    }
  };

  const createTimeEntry = async (
    input: Omit<TimeEntry, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'timeEntries'), {
        employeeId: input.employeeId,
        employeeName: trimStr(input.employeeName, 120),
        department: input.department,
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        date: trimStr(input.date, 32),
        clockInIso: trimStr(input.clockInIso, 64),
        clockOutIso: trimStr(input.clockOutIso, 64),
        breakMinutes: Math.max(0, Number(input.breakMinutes) || 0),
        regularHours: Math.max(0, round2(input.regularHours)),
        overtimeHours: Math.max(0, round2(input.overtimeHours)),
        totalHours: Math.max(0, round2(input.totalHours)),
        hourlyRate: Math.max(0, round2(input.hourlyRate)),
        laborCost: Math.max(0, round2(input.laborCost)),
        status: input.status,
        notes: trimStr(input.notes, 500),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'timeEntries');
    }
  };

  const updateTimeEntry = async (
    entryId: string,
    updates: Partial<Omit<TimeEntry, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => {
    try {
      await updateDoc(doc(db, 'timeEntries', entryId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `timeEntries/${entryId}`);
    }
  };

  const createLeaveRequest = async (
    input: Omit<
      LeaveRequest,
      'id' | 'status' | 'reviewedByName' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        employeeId: input.employeeId,
        employeeName: trimStr(input.employeeName, 120),
        department: input.department,
        leaveType: input.leaveType,
        startDate: trimStr(input.startDate, 32),
        endDate: trimStr(input.endDate, 32),
        daysCount: Math.max(1, Math.min(365, Number(input.daysCount) || 1)),
        reason: trimStr(input.reason, 500),
        status: 'Pending',
        reviewedByName: '',
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leaveRequests');
    }
  };

  const reviewLeaveRequest = async (
    leave: LeaveRequest,
    decision: 'Approved' | 'Declined'
  ) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'leaveRequests', leave.id), {
        status: decision,
        reviewedByName: trimStr(profile.displayName, 120),
        updatedAt: serverTimestamp(),
      });
      if (decision === 'Approved') {
        const emp = employees.find((e) => e.id === leave.employeeId);
        if (emp) {
          if (leave.leaveType === 'Annual') {
            await updateDoc(doc(db, 'employees', emp.id), {
              annualLeaveBalance: Math.max(0, emp.annualLeaveBalance - leave.daysCount),
              updatedAt: serverTimestamp(),
            });
          } else if (leave.leaveType === 'Sick') {
            await updateDoc(doc(db, 'employees', emp.id), {
              sickLeaveBalance: Math.max(0, emp.sickLeaveBalance - leave.daysCount),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leaveRequests/${leave.id}`);
    }
  };

  const createPayrollRun = async (
    input: Omit<PayrollRun, 'id' | 'ownerUid' | 'hrViewerUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'payrollRuns'), {
        periodLabel: trimStr(input.periodLabel, 80),
        payDate: trimStr(input.payDate, 32),
        employeeCount: Math.max(0, Number(input.employeeCount) || 0),
        totalGrossPay: Math.max(0, round2(input.totalGrossPay)),
        totalDeductions: Math.max(0, round2(input.totalDeductions)),
        totalNetPay: Math.max(0, round2(input.totalNetPay)),
        status: input.status,
        notes: trimStr(input.notes, 500),
        ownerUid: user.uid,
        hrViewerUids: hrViewerUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payrollRuns');
    }
  };

  const createNote = async (input: {
    title: string;
    body: string;
    audience: NoteAudience;
    tone: NoteTone;
    pinned: boolean;
  }) => {
    if (!user || !profile) return;
    const cleanTitle = trimStr(input.title, 120);
    const cleanBody = trimStr(input.body, 600);
    if (!cleanTitle || !cleanBody) return;
    try {
      await addDoc(collection(db, 'notes'), {
        title: cleanTitle,
        body: cleanBody,
        audience: input.audience,
        tone: input.tone,
        pinned: Boolean(input.pinned),
        authorName: trimStr(profile.displayName, 120) || 'Management',
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
    }
  };

  const togglePinNote = async (note: OperationalNote) => {
    try {
      await updateDoc(doc(db, 'notes', note.id), {
        pinned: !note.pinned,
        staffUids: activeStaffUids,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notes/${note.id}`);
    }
  };

  const deleteNote = async (noteId: string) => {
    try {
      await deleteDoc(doc(db, 'notes', noteId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${noteId}`);
    }
  };

  const createSupplierInvoice = async (
    input: Omit<SupplierInvoice, 'id' | 'ownerUid' | 'viewerUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user) return;
    const boundedLines = input.lines.slice(0, 10);
    const taxSummary = summarizeTaxBreakdown(boundedLines, {
      vatTreatment: input.vatTreatment,
      netAmount: input.netAmount,
      vatAmount: input.vatAmount,
      grossAmount: input.grossAmount,
    });
    const cleanTaxPin = trimStr(input.supplierTaxPin, 64);
    const cleanTin = trimStr(input.supplierTin, 64);
    const cleanVatReg = trimStr(input.supplierVatReg, 64);
    const cleanVatAmount = Math.max(0, round2(input.vatAmount));
    const cleanClaimable = Boolean(input.isVatClaimable);
    const isVatReportable = computeSupplierInvoiceVatReportable({
      isVatClaimable: cleanClaimable,
      vatAmount: cleanVatAmount,
      supplierTin: cleanTin,
      supplierTaxPin: cleanTaxPin,
      supplierVatReg: cleanVatReg,
    });
    try {
      const ref = await addDoc(collection(db, 'supplierInvoices'), {
        recordNumber: trimStr(input.recordNumber, 40),
        supplierName: trimStr(input.supplierName, 160),
        supplierTaxPin: cleanTaxPin,
        supplierTin: cleanTin,
        supplierVatReg: cleanVatReg,
        isVatRegistered: Boolean(input.isVatRegistered ?? Boolean(cleanVatReg || cleanTaxPin || cleanTin)),
        supplierInvoiceNo: trimStr(input.supplierInvoiceNo, 80),
        category: input.category,
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        invoiceDate: trimStr(input.invoiceDate, 32),
        dueDate: trimStr(input.dueDate, 32),
        pricingMode: input.pricingMode,
        vatTreatment: input.vatTreatment,
        isVatClaimable: cleanClaimable,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        lines: boundedLines,
        standardNetAmount: Math.max(
          0,
          round2(input.standardNetAmount ?? taxSummary.standardNetAmount)
        ),
        zeroRatedAmount: Math.max(
          0,
          round2(input.zeroRatedAmount ?? taxSummary.zeroRatedAmount)
        ),
        exemptAmount: Math.max(0, round2(input.exemptAmount ?? taxSummary.exemptAmount)),
        netAmount: Math.max(0, round2(input.netAmount)),
        vatAmount: cleanVatAmount,
        grossAmount: Math.max(0, round2(input.grossAmount)),
        whtApplicable: Boolean(input.whtApplicable),
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtAmount: Math.max(0, round2(Number(input.whtAmount) || 0)),
        whtRemitted: Boolean(input.whtRemitted),
        amountPaid: Math.max(0, round2(input.amountPaid)),
        balanceDue: Math.max(0, round2(input.balanceDue)),
        status: input.status,
        paymentMethod: trimStr(input.paymentMethod, 60),
        paymentReference: trimStr(input.paymentReference, 120),
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        viewerUids: hrViewerUids,
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'supplierInvoices');
    }
  };

  const updateSupplierInvoice = async (
    supplierInvoiceId: string,
    input: {
      recordNumber: string;
      supplierName: string;
      supplierTaxPin?: string;
      supplierTin?: string;
      supplierVatReg?: string;
      isVatRegistered?: boolean;
      supplierInvoiceNo: string;
      category: SupplierInvoiceCategory;
      jobId?: string;
      jobNumber?: string;
      invoiceDate: string;
      dueDate: string;
      pricingMode: PricingMode;
      vatTreatment: VatTreatment;
      isVatClaimable: boolean;
      vatRate: number;
      lines: InvoiceLine[];
      whtApplicable?: boolean;
      whtRate?: number;
      whtAmount?: number;
      whtRemitted?: boolean;
      amountPaid: number;
      status: SupplierInvoiceStatus;
      paymentMethod?: string;
      paymentReference?: string;
      notes?: string;
    }
  ) => {
    const boundedLines = input.lines.slice(0, 10);
    if (boundedLines.length === 0) return;
    const taxSummary = summarizeTaxBreakdown(boundedLines, {
      vatTreatment: input.vatTreatment,
      netAmount: 0,
      vatAmount: 0,
      grossAmount: 0,
    });
    const cleanTaxPin = trimStr(input.supplierTaxPin, 64);
    const cleanTin = trimStr(input.supplierTin, 64);
    const cleanVatReg = trimStr(input.supplierVatReg, 64);
    const cleanPaid = Math.max(0, Math.min(taxSummary.grossAmount, round2(input.amountPaid)));
    const balanceDue = round2(Math.max(0, taxSummary.grossAmount - cleanPaid));
    const cleanClaimable = Boolean(input.isVatClaimable && taxSummary.vatAmount > 0);
    const isVatReportable = computeSupplierInvoiceVatReportable({
      isVatClaimable: cleanClaimable,
      vatAmount: taxSummary.vatAmount,
      supplierTin: cleanTin,
      supplierTaxPin: cleanTaxPin,
      supplierVatReg: cleanVatReg,
    });
    try {
      await updateDoc(doc(db, 'supplierInvoices', supplierInvoiceId), {
        recordNumber: trimStr(input.recordNumber, 40),
        supplierName: trimStr(input.supplierName, 160),
        supplierTaxPin: cleanTaxPin,
        supplierTin: cleanTin,
        supplierVatReg: cleanVatReg,
        isVatRegistered: Boolean(
          input.isVatRegistered ?? Boolean(cleanVatReg || cleanTaxPin || cleanTin)
        ),
        supplierInvoiceNo: trimStr(input.supplierInvoiceNo, 80),
        category: input.category,
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        invoiceDate: trimStr(input.invoiceDate, 32),
        dueDate: trimStr(input.dueDate, 32),
        pricingMode: input.pricingMode,
        vatTreatment: input.vatTreatment,
        isVatClaimable: cleanClaimable,
        vatRate: Math.max(0, Math.min(50, Number(input.vatRate) || 0)),
        lines: boundedLines,
        standardNetAmount: taxSummary.standardNetAmount,
        zeroRatedAmount: taxSummary.zeroRatedAmount,
        exemptAmount: taxSummary.exemptAmount,
        netAmount: taxSummary.netAmount,
        vatAmount: taxSummary.vatAmount,
        grossAmount: taxSummary.grossAmount,
        whtApplicable: Boolean(input.whtApplicable),
        whtRate: Math.max(0, Math.min(50, Number(input.whtRate) || 0)),
        whtAmount: Math.max(0, round2(Number(input.whtAmount) || 0)),
        whtRemitted: Boolean(input.whtRemitted),
        amountPaid: cleanPaid,
        balanceDue,
        status: input.status,
        paymentMethod: trimStr(input.paymentMethod, 60),
        paymentReference: trimStr(input.paymentReference, 120),
        notes: trimStr(input.notes, 1000),
        isVatReportable,
        vatViewerUids: isVatReportable ? vatAuditorUids : [],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `supplierInvoices/${supplierInvoiceId}`
      );
    }
  };

  const recordSupplierPayment = async (
    supplierInvoice: SupplierInvoice,
    paymentAmount: number,
    method: string,
    reference: string,
    cashBookAccount?: string,
    options?: {
      whtDeducted?: number;
      whtRemitted?: boolean;
    }
  ) => {
    const cleanPay = Math.max(0, round2(paymentAmount));
    const cleanWht = Math.max(0, round2(options?.whtDeducted || 0));
    const totalSettled = round2(cleanPay + cleanWht);
    if (totalSettled <= 0) return;

    const newPaid = round2(
      Math.min(supplierInvoice.grossAmount, supplierInvoice.amountPaid + totalSettled)
    );
    const newBalance = round2(Math.max(0, supplierInvoice.grossAmount - newPaid));
    const nextStatus: SupplierInvoice['status'] =
      newBalance <= 0.01 ? 'Paid' : newPaid > 0 ? 'Part Paid' : 'Unpaid';
    try {
      const batch = writeBatch(db);
      const siUpdate: Record<string, unknown> = {
        amountPaid: newPaid,
        balanceDue: newBalance,
        status: nextStatus,
        paymentMethod: trimStr(method, 60),
        paymentReference: trimStr(reference, 120),
        updatedAt: serverTimestamp(),
      };
      if (cleanWht > 0) {
        siUpdate.whtApplicable = true;
        siUpdate.whtAmount = Math.max(
          cleanWht,
          round2(supplierInvoice.whtAmount || 0)
        );
        if (options?.whtRemitted !== undefined) {
          siUpdate.whtRemitted = Boolean(options.whtRemitted);
        }
      }
      batch.update(doc(db, 'supplierInvoices', supplierInvoice.id), siUpdate);

      if (user && profile && isAccountsOrMgmt && cleanPay > 0) {
        const cbRef = doc(collection(db, 'cashBookEntries'));
        batch.set(cbRef, {
          entryNumber: `CB-${new Date().getFullYear()}-${String(
            1 + cashBookEntries.length
          ).padStart(3, '0')}`,
          entryDate: new Date().toISOString().slice(0, 10),
          entryType: 'Payment (Outflow)',
          account: mapMethodToCashAccount(method, cashBookAccount),
          counterparty: trimStr(supplierInvoice.supplierName, 160) || 'Supplier',
          category: 'Supplier Payment',
          reference: trimStr(reference, 120) || trimStr(method, 60),
          linkedDocRef: trimStr(
            supplierInvoice.supplierInvoiceNo || supplierInvoice.recordNumber,
            80
          ),
          amount: cleanPay,
          reconciled: false,
          recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
          notes:
            cleanWht > 0
              ? `Auto-posted from Supplier Voucher ${supplierInvoice.recordNumber} (WHT ${cleanWht.toFixed(
                  2
                )} withheld)`
              : `Auto-posted from Supplier Voucher ${supplierInvoice.recordNumber}`,
          ownerUid: user.uid,
          viewerUids: hrViewerUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `supplierInvoices/${supplierInvoice.id}`
      );
    }
  };

  const markSupplierWhtRemitted = async (
    supplierInvoice: SupplierInvoice,
    cashBookAccount?: string,
    reference?: string
  ) => {
    if (!user || !profile || !isAccountsOrMgmt) return;
    const whtAmt = round2(Math.max(0, supplierInvoice.whtAmount || 0));
    if (whtAmt <= 0 || supplierInvoice.whtRemitted) return;
    const chosenAcc =
      (cashBookAccount && cashBookAccount.trim()) || DEFAULT_ZIM_CASH_ACCOUNTS[0];
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'supplierInvoices', supplierInvoice.id), {
        whtRemitted: true,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, 'cashBookEntries')), {
        entryNumber: `CB-${new Date().getFullYear()}-${String(
          1 + cashBookEntries.length
        ).padStart(3, '0')}`,
        entryDate: new Date().toISOString().slice(0, 10),
        entryType: 'Payment (Outflow)',
        account: chosenAcc,
        counterparty: 'ZIMRA (Withholding Tax)',
        category: 'Withholding Tax (ZIMRA)',
        reference:
          trimStr(reference, 120) || `WHT-${supplierInvoice.recordNumber}`,
        linkedDocRef: trimStr(
          supplierInvoice.supplierInvoiceNo || supplierInvoice.recordNumber,
          80
        ),
        amount: whtAmt,
        reconciled: false,
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: `ZIMRA Withholding Tax remittance for ${supplierInvoice.supplierName} (${supplierInvoice.recordNumber})`,
        ownerUid: user.uid,
        viewerUids: hrViewerUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `supplierInvoices/${supplierInvoice.id}`
      );
    }
  };

  const updateSupplierInvoiceVatStatus = async (
    supplierInvoiceId: string,
    updates: Partial<
      Pick<
        SupplierInvoice,
        | 'status'
        | 'isVatClaimable'
        | 'supplierTaxPin'
        | 'supplierTin'
        | 'supplierVatReg'
        | 'isVatRegistered'
        | 'whtApplicable'
        | 'whtRate'
        | 'whtAmount'
        | 'whtRemitted'
        | 'notes'
      >
    >
  ) => {
    try {
      const targetSi = supplierInvoices.find((s) => s.id === supplierInvoiceId);
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.status !== undefined) clean.status = updates.status;
      if (updates.isVatClaimable !== undefined)
        clean.isVatClaimable = Boolean(updates.isVatClaimable);
      if (updates.supplierTaxPin !== undefined)
        clean.supplierTaxPin = trimStr(updates.supplierTaxPin, 64);
      if (updates.supplierTin !== undefined)
        clean.supplierTin = trimStr(updates.supplierTin, 64);
      if (updates.supplierVatReg !== undefined)
        clean.supplierVatReg = trimStr(updates.supplierVatReg, 64);
      if (updates.isVatRegistered !== undefined)
        clean.isVatRegistered = Boolean(updates.isVatRegistered);
      if (updates.whtApplicable !== undefined)
        clean.whtApplicable = Boolean(updates.whtApplicable);
      if (updates.whtRate !== undefined)
        clean.whtRate = Math.max(0, Math.min(50, Number(updates.whtRate) || 0));
      if (updates.whtAmount !== undefined)
        clean.whtAmount = Math.max(0, round2(Number(updates.whtAmount) || 0));
      if (updates.whtRemitted !== undefined)
        clean.whtRemitted = Boolean(updates.whtRemitted);
      if (updates.notes !== undefined) clean.notes = trimStr(updates.notes, 1000);

      if (targetSi) {
        const isVatReportable = computeSupplierInvoiceVatReportable({
          isVatClaimable:
            updates.isVatClaimable ?? targetSi.isVatClaimable,
          vatAmount: targetSi.vatAmount,
          supplierTin: updates.supplierTin ?? targetSi.supplierTin,
          supplierTaxPin: updates.supplierTaxPin ?? targetSi.supplierTaxPin,
          supplierVatReg: updates.supplierVatReg ?? targetSi.supplierVatReg,
        });
        clean.isVatReportable = isVatReportable;
        clean.vatViewerUids = isVatReportable ? vatAuditorUids : [];
      }

      await updateDoc(doc(db, 'supplierInvoices', supplierInvoiceId), clean);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `supplierInvoices/${supplierInvoiceId}`
      );
    }
  };

  const deleteSupplierInvoice = async (supplierInvoiceId: string) => {
    try {
      await deleteDoc(doc(db, 'supplierInvoices', supplierInvoiceId));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `supplierInvoices/${supplierInvoiceId}`
      );
    }
  };

  const createInventoryItem = async (
    input: Omit<
      InventoryItem,
      'id' | 'status' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!user || !profile) return;
    const qty = Math.max(0, round2(input.quantityOnHand));
    const reorder = Math.max(0, round2(input.reorderLevel));
    const status = deriveStockStatus(qty, reorder);
    try {
      const batch = writeBatch(db);
      const itemRef = doc(collection(db, 'inventoryItems'));
      batch.set(itemRef, {
        sku: trimStr(input.sku, 40),
        name: trimStr(input.name, 160),
        itemType: input.itemType,
        unit: trimStr(input.unit, 32) || 'Pcs',
        quantityOnHand: qty,
        reorderLevel: reorder,
        unitCost: Math.max(0, round2(input.unitCost)),
        location: trimStr(input.location, 120),
        supplierName: trimStr(input.supplierName, 160),
        sampleClientOrSpec: trimStr(input.sampleClientOrSpec, 240),
        status,
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (qty > 0) {
        const movRef = doc(collection(db, `inventoryItems/${itemRef.id}/movements`));
        batch.set(movRef, {
          itemId: itemRef.id,
          movementType: 'Stock In',
          quantityDelta: qty,
          resultingQty: qty,
          jobId: '',
          jobNumber: '',
          recipientOrReason: 'Opening stock balance',
          loggedByName: trimStr(profile.displayName, 120) || 'Staff',
          ownerUid: user.uid,
          staffUids: activeStaffUids,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return itemRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'inventoryItems');
    }
  };

  const adjustInventoryStock = async (params: {
    item: InventoryItem;
    movementType: InventoryMovementType;
    quantityChange: number;
    jobId?: string;
    jobNumber?: string;
    recipientOrReason: string;
    sampleClientOrSpec?: string;
  }) => {
    if (!user || !profile) return;
    const isDeduction =
      params.movementType === 'Issue to Job' ||
      params.movementType === 'Sample Out';
    const rawDelta =
      isDeduction
        ? -Math.abs(params.quantityChange)
        : params.movementType === 'Adjustment'
          ? params.quantityChange
          : Math.abs(params.quantityChange);
    const nextQty = Math.max(0, round2(params.item.quantityOnHand + rawDelta));
    const actualDelta = round2(nextQty - params.item.quantityOnHand);
    if (actualDelta === 0) return;

    const nextStatus = deriveStockStatus(nextQty, params.item.reorderLevel);
    const itemUpdates: Record<string, unknown> = {
      quantityOnHand: nextQty,
      status: nextStatus,
      updatedAt: serverTimestamp(),
    };
    if (params.sampleClientOrSpec !== undefined) {
      itemUpdates.sampleClientOrSpec = trimStr(params.sampleClientOrSpec, 240);
    }

    try {
      const batch = writeBatch(db);
      const movRef = doc(collection(db, `inventoryItems/${params.item.id}/movements`));
      batch.set(movRef, {
        itemId: params.item.id,
        movementType: params.movementType,
        quantityDelta: actualDelta,
        resultingQty: nextQty,
        jobId: trimStr(params.jobId, 128),
        jobNumber: trimStr(params.jobNumber, 40),
        recipientOrReason:
          trimStr(params.recipientOrReason, 240) || params.movementType,
        loggedByName: trimStr(profile.displayName, 120) || 'Staff',
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'inventoryItems', params.item.id), itemUpdates);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `inventoryItems/${params.item.id}/movements`
      );
    }
  };

  const deleteInventoryItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'inventoryItems', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventoryItems/${itemId}`);
    }
  };

  const subscribeInventoryMovements = (
    itemId: string,
    cb: (entries: InventoryMovement[]) => void
  ) => {
    if (!user) return () => {};
    const isBootAdmin =
      user.email?.toLowerCase() === 'megaprintmedia@gmail.com' &&
      user.emailVerified;
    const colRef = collection(db, `inventoryItems/${itemId}/movements`);
    const q = isBootAdmin
      ? query(colRef, orderBy('createdAt', 'desc'))
      : query(
          colRef,
          where('staffUids', 'array-contains', user.uid),
          orderBy('createdAt', 'desc')
        );
    return onSnapshot(
      q,
      (snap) => {
        cb(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<InventoryMovement, 'id'>),
          }))
        );
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `inventoryItems/${itemId}/movements`
        )
    );
  };

  const createGoodsReceipt = async (
    input: Omit<
      GoodsReceipt,
      'id' | 'totalValue' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!user || !profile) return;
    const cleanItems: GoodsReceiptLine[] = input.items.slice(0, 10).map((line) => ({
      inventoryItemId: trimStr(line.inventoryItemId, 128),
      sku: trimStr(line.sku, 40),
      description: trimStr(line.description, 200) || 'Delivered Item',
      quantityOrdered: Math.max(0, round2(Number(line.quantityOrdered) || 0)),
      quantityReceived: Math.max(0, round2(Number(line.quantityReceived) || 0)),
      unit: trimStr(line.unit, 32) || 'Pcs',
      unitCost: Math.max(0, round2(Number(line.unitCost) || 0)),
    }));
    if (cleanItems.length === 0) return;

    const totalValue = round2(
      cleanItems.reduce(
        (acc, line) => acc + line.quantityReceived * line.unitCost,
        0
      )
    );
    const grnNumber = trimStr(input.grnNumber, 40);
    const supplierName = trimStr(input.supplierName, 160);
    const shouldPostStock =
      Boolean(input.postToInventory) &&
      input.conditionStatus !== 'Damaged / Rejected';

    try {
      const batch = writeBatch(db);
      const grnRef = doc(collection(db, 'goodsReceipts'));
      batch.set(grnRef, {
        grnNumber,
        supplierName,
        deliveryNoteRef: trimStr(input.deliveryNoteRef, 80),
        supplierInvoiceId: trimStr(input.supplierInvoiceId, 128),
        supplierInvoiceNo: trimStr(input.supplierInvoiceNo, 80),
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        receivedDate: trimStr(input.receivedDate, 32),
        receivedByName:
          trimStr(input.receivedByName, 120) ||
          trimStr(profile.displayName, 120) ||
          'Staff',
        conditionStatus: input.conditionStatus,
        items: cleanItems,
        totalValue,
        postToInventory: shouldPostStock,
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (shouldPostStock) {
        const qtyByItemId = new Map<string, number>();
        cleanItems.forEach((line) => {
          if (line.inventoryItemId && line.quantityReceived > 0) {
            qtyByItemId.set(
              line.inventoryItemId,
              round2((qtyByItemId.get(line.inventoryItemId) || 0) + line.quantityReceived)
            );
          }
        });

        qtyByItemId.forEach((delta, itemId) => {
          const item = inventoryItems.find((i) => i.id === itemId);
          if (!item || delta <= 0) return;
          const nextQty = round2(item.quantityOnHand + delta);
          const nextStatus = deriveStockStatus(nextQty, item.reorderLevel);
          batch.update(doc(db, 'inventoryItems', item.id), {
            quantityOnHand: nextQty,
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
          const movRef = doc(collection(db, `inventoryItems/${item.id}/movements`));
          batch.set(movRef, {
            itemId: item.id,
            movementType: 'Stock In',
            quantityDelta: delta,
            resultingQty: nextQty,
            jobId: trimStr(input.jobId, 128),
            jobNumber: trimStr(input.jobNumber, 40),
            recipientOrReason: trimStr(
              `${grnNumber} received from ${supplierName}`,
              240
            ),
            loggedByName: trimStr(profile.displayName, 120) || 'Staff',
            ownerUid: user.uid,
            staffUids: activeStaffUids,
            createdAt: serverTimestamp(),
          });
        });
      }

      await batch.commit();
      return grnRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'goodsReceipts');
    }
  };

  const updateGoodsReceipt = async (
    grnId: string,
    updates: Partial<{
      grnNumber: string;
      supplierName: string;
      deliveryNoteRef: string;
      conditionStatus: GoodsReceiptCondition;
      supplierInvoiceId: string;
      supplierInvoiceNo: string;
      jobId: string;
      jobNumber: string;
      receivedDate: string;
      receivedByName: string;
      items: GoodsReceiptLine[];
      postToInventory: boolean;
      notes: string;
    }>
  ) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.grnNumber !== undefined)
        clean.grnNumber = trimStr(updates.grnNumber, 40);
      if (updates.supplierName !== undefined)
        clean.supplierName = trimStr(updates.supplierName, 160);
      if (updates.deliveryNoteRef !== undefined)
        clean.deliveryNoteRef = trimStr(updates.deliveryNoteRef, 80);
      if (updates.conditionStatus !== undefined)
        clean.conditionStatus = updates.conditionStatus;
      if (updates.supplierInvoiceId !== undefined)
        clean.supplierInvoiceId = trimStr(updates.supplierInvoiceId, 128);
      if (updates.supplierInvoiceNo !== undefined)
        clean.supplierInvoiceNo = trimStr(updates.supplierInvoiceNo, 80);
      if (updates.jobId !== undefined) clean.jobId = trimStr(updates.jobId, 128);
      if (updates.jobNumber !== undefined)
        clean.jobNumber = trimStr(updates.jobNumber, 40);
      if (updates.receivedDate !== undefined)
        clean.receivedDate = trimStr(updates.receivedDate, 32);
      if (updates.receivedByName !== undefined)
        clean.receivedByName = trimStr(updates.receivedByName, 120);
      if (updates.postToInventory !== undefined)
        clean.postToInventory = Boolean(updates.postToInventory);
      if (updates.items !== undefined && updates.items.length > 0) {
        const cleanItems: GoodsReceiptLine[] = updates.items
          .slice(0, 10)
          .map((line) => ({
            inventoryItemId: trimStr(line.inventoryItemId, 128),
            sku: trimStr(line.sku, 40),
            description: trimStr(line.description, 200) || 'Delivered Item',
            quantityOrdered: Math.max(0, round2(Number(line.quantityOrdered) || 0)),
            quantityReceived: Math.max(0, round2(Number(line.quantityReceived) || 0)),
            unit: trimStr(line.unit, 32) || 'Pcs',
            unitCost: Math.max(0, round2(Number(line.unitCost) || 0)),
          }));
        clean.items = cleanItems;
        clean.totalValue = round2(
          cleanItems.reduce(
            (acc, line) => acc + line.quantityReceived * line.unitCost,
            0
          )
        );
      }
      if (updates.notes !== undefined) clean.notes = trimStr(updates.notes, 1000);
      await updateDoc(doc(db, 'goodsReceipts', grnId), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `goodsReceipts/${grnId}`);
    }
  };

  const deleteGoodsReceipt = async (grnId: string) => {
    try {
      await deleteDoc(doc(db, 'goodsReceipts', grnId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `goodsReceipts/${grnId}`);
    }
  };

  const createRequisition = async (input: {
    requisitionNumber: string;
    requisitionDate: string;
    neededByDate: string;
    requisitionType: RequisitionType;
    department: UserProfile['department'];
    priority: RequisitionPriority;
    jobId: string;
    jobNumber: string;
    preferredSupplier: string;
    lines: RequisitionLine[];
    justification: string;
    status: 'Draft' | 'Submitted';
  }) => {
    if (!user || !profile) return;
    const cleanLines: RequisitionLine[] = input.lines.slice(0, 10).map((line) => {
      const qty = Math.max(0.01, round2(Number(line.quantity) || 1));
      const unitCost = Math.max(0, round2(Number(line.estimatedUnitCost) || 0));
      return {
        inventoryItemId: trimStr(line.inventoryItemId, 128),
        sku: trimStr(line.sku, 40),
        description: trimStr(line.description, 200) || 'Requested Item',
        quantity: qty,
        unit: trimStr(line.unit, 32) || 'Pcs',
        estimatedUnitCost: unitCost,
        estimatedTotal: round2(qty * unitCost),
      };
    });
    if (cleanLines.length === 0) return;
    const totalEstimatedCost = round2(
      cleanLines.reduce((acc, l) => acc + l.estimatedTotal, 0)
    );
    try {
      const ref = await addDoc(collection(db, 'requisitions'), {
        requisitionNumber: trimStr(input.requisitionNumber, 40),
        requisitionDate: trimStr(input.requisitionDate, 32),
        neededByDate: trimStr(input.neededByDate, 32),
        requisitionType: input.requisitionType,
        department: input.department || profile.department,
        priority: input.priority,
        jobId: trimStr(input.jobId, 128),
        jobNumber: trimStr(input.jobNumber, 40),
        preferredSupplier: trimStr(input.preferredSupplier, 160),
        requestedByUid: user.uid,
        requestedByName: trimStr(profile.displayName, 120) || 'Staff',
        lines: cleanLines,
        totalEstimatedCost,
        justification: trimStr(input.justification, 1000),
        status: input.status === 'Draft' ? 'Draft' : 'Submitted',
        approvedByName: '',
        approvedDate: '',
        fulfillmentNotes: '',
        linkedRef: '',
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'requisitions');
    }
  };

  const updateRequisition = async (
    reqId: string,
    updates: Partial<{
      requisitionDate: string;
      neededByDate: string;
      requisitionType: RequisitionType;
      department: UserProfile['department'];
      priority: RequisitionPriority;
      jobId: string;
      jobNumber: string;
      preferredSupplier: string;
      lines: RequisitionLine[];
      justification: string;
      status: Extract<RequisitionStatus, 'Draft' | 'Submitted'>;
    }>
  ) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.requisitionDate !== undefined)
        clean.requisitionDate = trimStr(updates.requisitionDate, 32);
      if (updates.neededByDate !== undefined)
        clean.neededByDate = trimStr(updates.neededByDate, 32);
      if (updates.requisitionType !== undefined)
        clean.requisitionType = updates.requisitionType;
      if (updates.department !== undefined) clean.department = updates.department;
      if (updates.priority !== undefined) clean.priority = updates.priority;
      if (updates.jobId !== undefined) clean.jobId = trimStr(updates.jobId, 128);
      if (updates.jobNumber !== undefined)
        clean.jobNumber = trimStr(updates.jobNumber, 40);
      if (updates.preferredSupplier !== undefined)
        clean.preferredSupplier = trimStr(updates.preferredSupplier, 160);
      if (updates.justification !== undefined)
        clean.justification = trimStr(updates.justification, 1000);
      if (updates.status !== undefined) clean.status = updates.status;
      if (updates.lines !== undefined && updates.lines.length > 0) {
        const cleanLines: RequisitionLine[] = updates.lines
          .slice(0, 10)
          .map((line) => {
            const qty = Math.max(0.01, round2(Number(line.quantity) || 1));
            const unitCost = Math.max(
              0,
              round2(Number(line.estimatedUnitCost) || 0)
            );
            return {
              inventoryItemId: trimStr(line.inventoryItemId, 128),
              sku: trimStr(line.sku, 40),
              description: trimStr(line.description, 200) || 'Requested Item',
              quantity: qty,
              unit: trimStr(line.unit, 32) || 'Pcs',
              estimatedUnitCost: unitCost,
              estimatedTotal: round2(qty * unitCost),
            };
          });
        clean.lines = cleanLines;
        clean.totalEstimatedCost = round2(
          cleanLines.reduce((acc, l) => acc + l.estimatedTotal, 0)
        );
      }
      await updateDoc(doc(db, 'requisitions', reqId), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requisitions/${reqId}`);
    }
  };

  const reviewRequisition = async (
    req: Requisition,
    decision: 'Approved' | 'Rejected',
    notes?: string
  ) => {
    if (!profile) return;
    try {
      await updateDoc(doc(db, 'requisitions', req.id), {
        status: decision,
        approvedByName: trimStr(profile.displayName, 120) || 'Management',
        approvedDate: new Date().toISOString().slice(0, 10),
        fulfillmentNotes: trimStr(notes, 500),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requisitions/${req.id}`);
    }
  };

  const fulfillRequisition = async (
    req: Requisition,
    options?: {
      linkedRef?: string;
      fulfillmentNotes?: string;
      issueFromInventory?: boolean;
      postToCashBook?: boolean;
      cashBookAccount?: string;
      cashDisbursedAmount?: number;
    }
  ) => {
    if (!user || !profile) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'requisitions', req.id), {
        status: 'Fulfilled',
        linkedRef: trimStr(options?.linkedRef, 80),
        fulfillmentNotes: trimStr(options?.fulfillmentNotes, 500),
        updatedAt: serverTimestamp(),
      });

      if (
        options?.issueFromInventory &&
        req.requisitionType === 'Stock / Material Issue'
      ) {
        const qtyByItemId = new Map<string, number>();
        req.lines.forEach((line) => {
          if (line.inventoryItemId && line.quantity > 0) {
            qtyByItemId.set(
              line.inventoryItemId,
              round2((qtyByItemId.get(line.inventoryItemId) || 0) + line.quantity)
            );
          }
        });
        qtyByItemId.forEach((issueQty, itemId) => {
          const item = inventoryItems.find((i) => i.id === itemId);
          if (!item || issueQty <= 0) return;
          const nextQty = Math.max(0, round2(item.quantityOnHand - issueQty));
          const actualDelta = round2(nextQty - item.quantityOnHand);
          if (actualDelta === 0) return;
          batch.update(doc(db, 'inventoryItems', item.id), {
            quantityOnHand: nextQty,
            status: deriveStockStatus(nextQty, item.reorderLevel),
            updatedAt: serverTimestamp(),
          });
          const movRef = doc(collection(db, `inventoryItems/${item.id}/movements`));
          batch.set(movRef, {
            itemId: item.id,
            movementType: 'Issue to Job',
            quantityDelta: actualDelta,
            resultingQty: nextQty,
            jobId: trimStr(req.jobId, 128),
            jobNumber: trimStr(req.jobNumber, 40),
            recipientOrReason: trimStr(
              `${req.requisitionNumber} issued to ${req.requestedByName}`,
              240
            ),
            loggedByName: trimStr(profile.displayName, 120) || 'Stores',
            ownerUid: user.uid,
            staffUids: activeStaffUids,
            createdAt: serverTimestamp(),
          });
        });
      }

      if (
        options?.postToCashBook &&
        isAccountsOrMgmt &&
        req.requisitionType === 'Petty Cash / Expense'
      ) {
        const payAmount = round2(
          Number(options.cashDisbursedAmount ?? req.totalEstimatedCost) || 0
        );
        if (payAmount > 0) {
          const chosenAcc =
            (options.cashBookAccount && options.cashBookAccount.trim()) ||
            'Petty Cash Float';
          const cbRef = doc(collection(db, 'cashBookEntries'));
          batch.set(cbRef, {
            entryNumber: `CB-${new Date().getFullYear()}-${String(
              1 + cashBookEntries.length
            ).padStart(3, '0')}`,
            entryDate: new Date().toISOString().slice(0, 10),
            entryType: 'Payment (Outflow)',
            account: chosenAcc,
            counterparty: trimStr(req.requestedByName, 160) || 'Staff',
            category: 'Workshop Petty Cash',
            reference:
              trimStr(options.linkedRef, 120) || trimStr(req.requisitionNumber, 120),
            linkedDocRef: trimStr(req.requisitionNumber, 80),
            amount: payAmount,
            reconciled: false,
            recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
            notes: trimStr(
              `Petty cash disbursed for ${req.requisitionNumber}${
                req.jobNumber ? ` (${req.jobNumber})` : ''
              }`,
              500
            ),
            ownerUid: user.uid,
            viewerUids: hrViewerUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `requisitions/${req.id}`);
    }
  };

  const deleteRequisition = async (reqId: string) => {
    try {
      await deleteDoc(doc(db, 'requisitions', reqId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `requisitions/${reqId}`);
    }
  };

  const createCashBookEntry = async (
    input: Omit<
      CashBookEntry,
      'id' | 'recordedByName' | 'ownerUid' | 'viewerUids' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!user || !profile) return;
    const cleanAmount = round2(Number(input.amount) || 0);
    if (cleanAmount <= 0) return;
    try {
      const ref = await addDoc(collection(db, 'cashBookEntries'), {
        entryNumber: trimStr(input.entryNumber, 40),
        entryDate: trimStr(input.entryDate, 32),
        entryType: input.entryType,
        account: input.account,
        counterparty: trimStr(input.counterparty, 160),
        category: input.category,
        reference: trimStr(input.reference, 120),
        linkedDocRef: trimStr(input.linkedDocRef, 80),
        amount: cleanAmount,
        reconciled: Boolean(input.reconciled),
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: trimStr(input.notes, 500),
        ownerUid: user.uid,
        viewerUids: hrViewerUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cashBookEntries');
    }
  };

  const updateCashBookEntry = async (
    entryId: string,
    input: {
      entryNumber: string;
      entryDate: string;
      entryType: CashBookEntryType;
      account: CashBookAccount;
      counterparty: string;
      category: CashBookCategory;
      reference: string;
      linkedDocRef: string;
      amount: number;
      reconciled: boolean;
      notes: string;
    }
  ) => {
    const cleanAmount = round2(Number(input.amount) || 0);
    if (cleanAmount <= 0) return;
    try {
      await updateDoc(doc(db, 'cashBookEntries', entryId), {
        entryNumber: trimStr(input.entryNumber, 40),
        entryDate: trimStr(input.entryDate, 32),
        entryType: input.entryType,
        account: trimStr(input.account, 120),
        counterparty: trimStr(input.counterparty, 160),
        category: input.category,
        reference: trimStr(input.reference, 120),
        linkedDocRef: trimStr(input.linkedDocRef, 80),
        amount: cleanAmount,
        reconciled: Boolean(input.reconciled),
        notes: trimStr(input.notes, 500),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `cashBookEntries/${entryId}`
      );
    }
  };

  const toggleCashBookReconciled = async (entry: CashBookEntry) => {
    try {
      await updateDoc(doc(db, 'cashBookEntries', entry.id), {
        reconciled: !entry.reconciled,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `cashBookEntries/${entry.id}`
      );
    }
  };

  const deleteCashBookEntry = async (entryId: string) => {
    try {
      await deleteDoc(doc(db, 'cashBookEntries', entryId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cashBookEntries/${entryId}`);
    }
  };

  const createChartAccount = async (
    input: Omit<
      ChartAccount,
      'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'
    >
  ) => {
    if (!user) return;
    try {
      const ref = await addDoc(collection(db, 'chartOfAccounts'), {
        code: trimStr(input.code, 24),
        name: trimStr(input.name, 120),
        accountType: input.accountType,
        subType: input.subType,
        currency: trimStr(input.currency, 6) || settings.currency || 'USD',
        bankName: trimStr(input.bankName, 120),
        accountNumber: trimStr(input.accountNumber, 64),
        branch: trimStr(input.branch, 120),
        openingBalance: round2(Number(input.openingBalance) || 0),
        isCashBookAccount: Boolean(input.isCashBookAccount),
        isActive: input.isActive !== false,
        notes: trimStr(input.notes, 500),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chartOfAccounts');
    }
  };

  const updateChartAccount = async (
    accountId: string,
    updates: Partial<
      Omit<ChartAccount, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>
    >
  ) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.code !== undefined) clean.code = trimStr(updates.code, 24);
      if (updates.name !== undefined) clean.name = trimStr(updates.name, 120);
      if (updates.accountType !== undefined) clean.accountType = updates.accountType;
      if (updates.subType !== undefined) clean.subType = updates.subType;
      if (updates.currency !== undefined)
        clean.currency = trimStr(updates.currency, 6) || 'USD';
      if (updates.bankName !== undefined) clean.bankName = trimStr(updates.bankName, 120);
      if (updates.accountNumber !== undefined)
        clean.accountNumber = trimStr(updates.accountNumber, 64);
      if (updates.branch !== undefined) clean.branch = trimStr(updates.branch, 120);
      if (updates.openingBalance !== undefined)
        clean.openingBalance = round2(Number(updates.openingBalance) || 0);
      if (updates.isCashBookAccount !== undefined)
        clean.isCashBookAccount = Boolean(updates.isCashBookAccount);
      if (updates.isActive !== undefined) clean.isActive = Boolean(updates.isActive);
      if (updates.notes !== undefined) clean.notes = trimStr(updates.notes, 500);
      await updateDoc(doc(db, 'chartOfAccounts', accountId), clean);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `chartOfAccounts/${accountId}`
      );
    }
  };

  const deleteChartAccount = async (accountId: string) => {
    try {
      await deleteDoc(doc(db, 'chartOfAccounts', accountId));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `chartOfAccounts/${accountId}`
      );
    }
  };

  const seedDefaultChartOfAccounts = async () => {
    if (!user) return;
    const existingCodes = new Set(chartOfAccounts.map((a) => a.code));
    const defaults: Array<
      Omit<ChartAccount, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
    > = [
      {
        code: '1010',
        name: 'CBZ Nostro USD Account',
        accountType: 'Asset',
        subType: 'Bank',
        currency: 'USD',
        bankName: 'CBZ Bank Zimbabwe',
        accountNumber: '01120498110021',
        branch: 'Southerton / Workington Branch',
        openingBalance: 4500,
        isCashBookAccount: true,
        isActive: true,
        notes: 'Primary USD Nostro corporate current account',
      },
      {
        code: '1015',
        name: 'Stanbic ZWG Operating Account',
        accountType: 'Asset',
        subType: 'Bank',
        currency: 'ZWG',
        bankName: 'Stanbic Bank Zimbabwe',
        accountNumber: '9140002849102',
        branch: 'Harare Samora Machel',
        openingBalance: 0,
        isCashBookAccount: true,
        isActive: true,
        notes: 'Local ZWG (ZiG) clearing & ZIPIT receipts',
      },
      {
        code: '1020',
        name: 'EcoCash Merchant Till',
        accountType: 'Asset',
        subType: 'Mobile Money',
        currency: 'USD',
        bankName: 'EcoCash Zimbabwe',
        accountNumber: 'Merchant Code 482910',
        branch: 'Mobile Wallet',
        openingBalance: 650,
        isCashBookAccount: true,
        isActive: true,
        notes: 'Customer mobile walk-in payments & deposits',
      },
      {
        code: '1030',
        name: 'USD Cash Drawer',
        accountType: 'Asset',
        subType: 'Cash',
        currency: 'USD',
        bankName: 'Harare Front Desk Safe',
        accountNumber: 'CASH-USD-01',
        branch: 'Workington Reception',
        openingBalance: 350,
        isCashBookAccount: true,
        isActive: true,
        notes: 'Physical USD counter cash collections',
      },
      {
        code: '1040',
        name: 'Petty Cash Float',
        accountType: 'Asset',
        subType: 'Cash',
        currency: 'USD',
        bankName: 'Workshop Imprest Box',
        accountNumber: 'PETTY-01',
        branch: 'Harare Workshop',
        openingBalance: 200,
        isCashBookAccount: true,
        isActive: true,
        notes: 'Courier, trims, needles & daily sundries',
      },
      {
        code: '1200',
        name: 'Accounts Receivable (Trade Debtors)',
        accountType: 'Asset',
        subType: 'Receivable',
        currency: 'USD',
        bankName: '',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Control account for unpaid customer tax invoices',
      },
      {
        code: '2100',
        name: 'Accounts Payable (Trade Creditors)',
        accountType: 'Liability',
        subType: 'Payable',
        currency: 'USD',
        bankName: '',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Amounts owed to Zimbabwe textile & print suppliers',
      },
      {
        code: '2200',
        name: 'ZIMRA Output VAT Payable (15%)',
        accountType: 'Liability',
        subType: 'Tax / VAT',
        currency: 'USD',
        bankName: 'ZIMRA',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: '15% Output VAT charged on taxable customer invoices',
      },
      {
        code: '1350',
        name: 'ZIMRA Input VAT Claimable (15%)',
        accountType: 'Asset',
        subType: 'Tax / VAT',
        currency: 'USD',
        bankName: 'ZIMRA',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Claimable 15% Input VAT on fiscalized supplier tax invoices',
      },
      {
        code: '4000',
        name: 'Printing, Branding & Tailoring Revenue',
        accountType: 'Revenue',
        subType: 'Operating',
        currency: 'USD',
        bankName: '',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Net sales revenue across all 4 Megaprint service lines',
      },
      {
        code: '5000',
        name: 'Substrates, Inks & Fabrics COGS',
        accountType: 'Expense',
        subType: 'COGS',
        currency: 'USD',
        bankName: '',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Direct materials, vinyl media, pique fabric & subcontracting',
      },
      {
        code: '6100',
        name: 'Sales Commissions Expense',
        accountType: 'Expense',
        subType: 'Payroll',
        currency: 'USD',
        bankName: '',
        accountNumber: '',
        branch: '',
        openingBalance: 0,
        isCashBookAccount: false,
        isActive: true,
        notes: 'Sales team commissions earned & paid per production job',
      },
    ];

    const toCreate = defaults.filter((d) => !existingCodes.has(d.code));
    if (toCreate.length === 0) return;

    try {
      const batch = writeBatch(db);
      toCreate.forEach((acc) => {
        const ref = doc(collection(db, 'chartOfAccounts'));
        batch.set(ref, {
          ...acc,
          ownerUid: user.uid,
          staffUids: activeStaffUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chartOfAccounts');
    }
  };

  const createUserInvite = async (input: {
    email: string;
    displayName: string;
    role: UserProfile['role'];
    department: UserProfile['department'];
    taxScope?: TaxAccessScope;
    commissionRatePct: number;
  }) => {
    if (!user || !profile) return;
    const normalizedEmail = trimStr(input.email, 200).toLowerCase();
    if (!normalizedEmail) return;
    const resolvedScope: TaxAccessScope =
      input.role === 'accounts' ? input.taxScope || 'all' : 'all';
    try {
      const ref = await addDoc(collection(db, 'userInvites'), {
        email: normalizedEmail,
        displayName: trimStr(input.displayName, 120) || normalizedEmail,
        role: input.role,
        department: input.department,
        taxScope: resolvedScope,
        commissionRatePct:
          input.role === 'sales'
            ? Math.max(0, Math.min(50, round2(Number(input.commissionRatePct) || 0)))
            : 0,
        status: 'invited',
        invitedByName: trimStr(profile.displayName, 120) || 'Management',
        acceptedUid: '',
        ownerUid: user.uid,
        adminUids: activeAdminUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'userInvites');
    }
  };

  const updateUserInviteStatus = async (
    inviteId: string,
    status: UserInviteStatus
  ) => {
    try {
      await updateDoc(doc(db, 'userInvites', inviteId), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `userInvites/${inviteId}`);
    }
  };

  const deleteUserInvite = async (inviteId: string) => {
    try {
      await deleteDoc(doc(db, 'userInvites', inviteId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `userInvites/${inviteId}`);
    }
  };

  const updateJobCommission = async (
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
  ) => {
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      const existingJob = jobs.find((j) => j.id === jobId);
      const effectiveSalesUid =
        updates.assignedSalesUid !== undefined
          ? trimStr(updates.assignedSalesUid, 128)
          : existingJob?.assignedSalesUid || '';
      const assignedRep = effectiveSalesUid
        ? users.find((u) => u.uid === effectiveSalesUid) ||
          (profile?.uid === effectiveSalesUid ? profile : undefined)
        : undefined;
      const isSalesEligible = Boolean(
        effectiveSalesUid && (!assignedRep || assignedRep.role === 'sales')
      );

      if (updates.assignedSalesUid !== undefined)
        clean.assignedSalesUid = isSalesEligible ? effectiveSalesUid : '';
      if (updates.assignedSalesName !== undefined)
        clean.assignedSalesName = isSalesEligible
          ? trimStr(assignedRep?.displayName || updates.assignedSalesName, 120)
          : '';
      if (!isSalesEligible) {
        clean.commissionRatePct = 0;
        clean.commissionAmount = 0;
      } else {
        if (updates.commissionRatePct !== undefined)
          clean.commissionRatePct = Math.max(
            0,
            Math.min(50, round2(Number(updates.commissionRatePct) || 0))
          );
        if (updates.commissionAmount !== undefined)
          clean.commissionAmount = Math.max(
            0,
            round2(Number(updates.commissionAmount) || 0)
          );
      }
      if (updates.commissionBasis !== undefined)
        clean.commissionBasis = updates.commissionBasis;
      if (updates.commissionStatus !== undefined)
        clean.commissionStatus = updates.commissionStatus;
      if (updates.commissionPaidDate !== undefined)
        clean.commissionPaidDate = trimStr(updates.commissionPaidDate, 32);
      await updateDoc(doc(db, 'jobs', jobId), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${jobId}`);
    }
  };

  const payJobCommission = async (
    job: Job,
    cashBookAccount?: string,
    reference?: string
  ) => {
    if (!user || !profile || !isAccountsOrMgmt) return;
    const payout = round2(Math.max(0, job.commissionAmount || 0));
    if (payout <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const chosenAcc =
      (cashBookAccount && cashBookAccount.trim()) || DEFAULT_ZIM_CASH_ACCOUNTS[0];

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'jobs', job.id), {
        commissionStatus: 'Paid',
        commissionPaidDate: today,
        updatedAt: serverTimestamp(),
      });
      const cbRef = doc(collection(db, 'cashBookEntries'));
      batch.set(cbRef, {
        entryNumber: `CB-${new Date().getFullYear()}-${String(
          1 + cashBookEntries.length
        ).padStart(3, '0')}`,
        entryDate: today,
        entryType: 'Payment (Outflow)',
        account: chosenAcc,
        counterparty: trimStr(job.assignedSalesName, 160) || 'Sales Rep',
        category: 'Sales Commission',
        reference: trimStr(reference, 120) || `COMM-${job.jobNumber}`,
        linkedDocRef: trimStr(job.jobNumber, 80),
        amount: payout,
        reconciled: false,
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: `Sales commission payout for ${job.jobNumber} (${job.clientName})`,
        ownerUid: user.uid,
        viewerUids: hrViewerUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `jobs/${job.id}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Suppliers Master Register CRUD & Controlled Legacy Data Importer
  // ---------------------------------------------------------------------------

  const createSupplier = async (
    input: Omit<Supplier, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
  ) => {
    if (!user || isVatAuditorOnly) return undefined;
    const cleanVatReg = trimStr(input.vatRegNumber, 64).toUpperCase();
    try {
      const ref = await addDoc(collection(db, 'suppliers'), {
        name: trimStr(input.name, 160),
        contactName: trimStr(input.contactName, 120),
        phone: trimStr(input.phone, 40),
        email: trimStr(input.email, 200),
        address: trimStr(input.address, 300),
        zimraTin: trimStr(input.zimraTin, 64).toUpperCase(),
        vatRegNumber: cleanVatReg,
        isVatRegistered: Boolean(input.isVatRegistered ?? Boolean(cleanVatReg)),
        notes: trimStr(input.notes, 1000),
        ownerUid: user.uid,
        staffUids: activeStaffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'suppliers');
    }
  };

  const updateSupplier = async (
    supplierId: string,
    input: Partial<Omit<Supplier, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>>
  ) => {
    if (!user || isVatAuditorOnly) return;
    try {
      const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (input.name !== undefined) clean.name = trimStr(input.name, 160);
      if (input.contactName !== undefined) clean.contactName = trimStr(input.contactName, 120);
      if (input.phone !== undefined) clean.phone = trimStr(input.phone, 40);
      if (input.email !== undefined) clean.email = trimStr(input.email, 200);
      if (input.address !== undefined) clean.address = trimStr(input.address, 300);
      if (input.zimraTin !== undefined)
        clean.zimraTin = trimStr(input.zimraTin, 64).toUpperCase();
      if (input.vatRegNumber !== undefined)
        clean.vatRegNumber = trimStr(input.vatRegNumber, 64).toUpperCase();
      if (input.isVatRegistered !== undefined)
        clean.isVatRegistered = Boolean(input.isVatRegistered);
      if (input.notes !== undefined) clean.notes = trimStr(input.notes, 1000);
      await updateDoc(doc(db, 'suppliers', supplierId), clean);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `suppliers/${supplierId}`);
    }
  };

  const deleteSupplier = async (supplierId: string) => {
    if (!user || !isManagement) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${supplierId}`);
    }
  };

  const subscribeMigrationRunDetails = (
    runId: string,
    onRecords: (records: MigrationRunRecord[]) => void,
    onTables: (tables: MigrationReferenceTable[]) => void
  ) => {
    if (!user || !isManagement || !runId) {
      onRecords([]);
      onTables([]);
      return () => {};
    }
    const isBootAdmin =
      user.email?.toLowerCase() === 'megaprintmedia@gmail.com' && user.emailVerified;

    const recQ = isBootAdmin
      ? query(collection(db, 'migrationRuns', runId, 'records'))
      : query(
          collection(db, 'migrationRuns', runId, 'records'),
          where('adminUids', 'array-contains', user.uid)
        );
    const tblQ = isBootAdmin
      ? query(collection(db, 'migrationRuns', runId, 'tables'))
      : query(
          collection(db, 'migrationRuns', runId, 'tables'),
          where('adminUids', 'array-contains', user.uid)
        );

    const u1 = onSnapshot(
      recQ,
      (snap) => {
        onRecords(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<MigrationRunRecord, 'id'>),
            }))
            .sort((a, b) => a.category.localeCompare(b.category) || a.displayLabel.localeCompare(b.displayLabel))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `migrationRuns/${runId}/records`)
    );
    const u2 = onSnapshot(
      tblQ,
      (snap) => {
        onTables(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MigrationReferenceTable, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `migrationRuns/${runId}/tables`)
    );
    return () => {
      u1();
      u2();
    };
  };

  const executeLegacyImport = async (
    rawPlan: LegacyImportPlan,
    options?: {
      retryFailedOnly?: boolean;
      resumeRunId?: string;
      failedKeys?: string[];
      onProgress?: (progress: { phase: string; done: number; total: number }) => void;
    }
  ): Promise<{
    runId: string;
    status: MigrationRunStatus;
    createdCount: number;
    matchedCount: number;
    skippedCount: number;
    failedCount: number;
    failedKeys: string[];
    lastError: string;
  }> => {
    if (!user || !profile || !isManagement) {
      throw new Error('Only active Management accounts can run legacy data imports.');
    }
    if (!rawPlan.validStructure || !rawPlan.controlsVerified || rawPlan.blockingErrors.length > 0) {
      throw new Error(
        rawPlan.blockingErrors[0] ||
          'Import blocked: resolve validation or control total mismatches first.'
      );
    }

    const plan = options?.retryFailedOnly
      ? filterPlanForExecution(rawPlan, {
          retryFailedOnly: true,
          failedKeys: options.failedKeys || [],
        })
      : rawPlan;

    const runId = options?.resumeRunId || plan.runId;
    const executedByName =
      trimStr(profile.displayName, 120) || user.email || 'Management';
    const adminUids = activeAdminUids;
    const staffUids = activeStaffUids;
    const hrUids = hrViewerUids;
    const salesFinUids = salesAndFinanceViewerUids;

    interface BatchOp {
      ref: DocumentReference;
      mode: 'set' | 'update';
      data: Record<string, unknown>;
      category: MigrationRecordCategory;
      sourceKey: string;
      displayLabel: string;
      intendedOutcome: MigrationRecordOutcome;
      targetCollection: string;
      targetDocId: string;
    }

    interface OutcomeEntry {
      category: MigrationRecordCategory;
      sourceKey: string;
      displayLabel: string;
      outcome: MigrationRecordOutcome;
      targetCollection: string;
      targetDocId: string;
      errorMessage: string;
    }

    const outcomes = new Map<string, OutcomeEntry>();
    const recordStaticOutcome = (
      category: MigrationRecordCategory,
      sourceKey: string,
      displayLabel: string,
      outcome: MigrationRecordOutcome,
      targetCollection: string,
      targetDocId: string,
      errorMessage = ''
    ) => {
      outcomes.set(`${category}:${sourceKey}`, {
        category,
        sourceKey,
        displayLabel: displayLabel.slice(0, 200),
        outcome,
        targetCollection,
        targetDocId,
        errorMessage: errorMessage.slice(0, 500),
      });
    };

    const runPhaseBatches = async (phaseLabel: string, ops: BatchOp[]) => {
      const chunks = chunkArray(ops, 350);
      let completed = 0;
      for (const chunk of chunks) {
        options?.onProgress?.({ phase: phaseLabel, done: completed, total: ops.length });
        try {
          const batch = writeBatch(db);
          chunk.forEach((op) => {
            if (op.mode === 'set') {
              batch.set(op.ref, op.data);
            } else {
              batch.update(op.ref, op.data);
            }
          });
          await batch.commit();
          chunk.forEach((op) => {
            recordStaticOutcome(
              op.category,
              op.sourceKey,
              op.displayLabel,
              op.intendedOutcome,
              op.targetCollection,
              op.targetDocId
            );
          });
          completed += chunk.length;
        } catch {
          // Batch failed: fall back to per-record writes so partial successes are preserved
          for (const op of chunk) {
            try {
              if (op.mode === 'set') {
                await setDoc(op.ref, op.data);
              } else {
                await updateDoc(op.ref, op.data);
              }
              recordStaticOutcome(
                op.category,
                op.sourceKey,
                op.displayLabel,
                op.intendedOutcome,
                op.targetCollection,
                op.targetDocId
              );
            } catch (singleErr) {
              recordStaticOutcome(
                op.category,
                op.sourceKey,
                op.displayLabel,
                'failed',
                op.targetCollection,
                op.targetDocId,
                singleErr instanceof Error ? singleErr.message : String(singleErr)
              );
            }
            completed += 1;
          }
        }
      }
      options?.onProgress?.({ phase: phaseLabel, done: ops.length, total: ops.length });
    };

    // -------------------------------------------------------------------------
    // Phase 0: Initialize / Resume /migrationRuns/{runId} + raw 2D audit tables
    // -------------------------------------------------------------------------
    options?.onProgress?.({ phase: 'Initializing audit run snapshot', done: 0, total: 1 });
    const runRef = doc(db, 'migrationRuns', runId);
    const existingRunSnap = await getDoc(runRef);
    const runOwnerUid = existingRunSnap.exists()
      ? String(existingRunSnap.data()?.ownerUid || user.uid)
      : user.uid;

    const runPayloadBase = {
      sourceSystem: trimStr(plan.sourceSystem, 120) || 'Legacy ERP',
      targetSystem: trimStr(plan.targetSystem, 120) || 'Megaprint ERP',
      asOfDate: trimStr(plan.asOfDate, 32),
      payloadFingerprint: trimStr(plan.payloadFingerprint, 128),
      status: 'in_progress' as MigrationRunStatus,
      executedByUid: user.uid,
      executedByName,
      totalPlanned: rawPlan.summaryCounts.totalPlanned,
      createdCount: 0,
      matchedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      grossReceivablesUSD: plan.reconciliation.grossReceivablesUSD,
      unappliedCreditsUSD: plan.reconciliation.unappliedCreditsUSD,
      netReceivablesUSD: plan.reconciliation.netReceivablesUSD,
      importedPayablesUSD: plan.reconciliation.importedPayablesUSD,
      matchedExistingPayablesUSD: plan.reconciliation.matchedExistingPayablesUSD,
      accrualPayablesUSD: plan.reconciliation.accrualPayablesUSD,
      totalSupplierPayablesUSD: plan.reconciliation.totalSourcePayablesUSD,
      trialBalanceDebitUSD: plan.reconciliation.trialBalanceDebitUSD,
      trialBalanceCreditUSD: plan.reconciliation.trialBalanceCreditUSD,
      controlsVerified: plan.controlsVerified,
      systemUserReferences: plan.systemUserReferences.slice(0, 200),
      alreadyCreatedInTargetCount: plan.alreadyCreatedInTarget.length,
      constraintsCount: plan.constraints.length,
      hasLiabilityBalancesTable:
        plan.liabilityBalancesTable.headers.length > 0 ||
        plan.liabilityBalancesTable.rows.length > 0,
      hasPayableLedgerTable:
        plan.payableLedgerTable.headers.length > 0 ||
        plan.payableLedgerTable.rows.length > 0,
      failedKeys: [],
      lastError: '',
      ownerUid: runOwnerUid,
      adminUids,
    };

    if (!existingRunSnap.exists()) {
      const p0Batch = writeBatch(db);
      p0Batch.set(runRef, {
        ...runPayloadBase,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (runPayloadBase.hasLiabilityBalancesTable) {
        p0Batch.set(doc(db, 'migrationRuns', runId, 'tables', 'liabilityBalances'), {
          tableName: 'liabilityBalances',
          headers: plan.liabilityBalancesTable.headers,
          rows: plan.liabilityBalancesTable.rows,
          rowCount: plan.liabilityBalancesTable.rowCount,
          importRunId: runId,
          ownerUid: user.uid,
          adminUids,
          createdAt: serverTimestamp(),
        });
      }
      if (runPayloadBase.hasPayableLedgerTable) {
        p0Batch.set(doc(db, 'migrationRuns', runId, 'tables', 'payableLedger'), {
          tableName: 'payableLedger',
          headers: plan.payableLedgerTable.headers,
          rows: plan.payableLedgerTable.rows,
          rowCount: plan.payableLedgerTable.rowCount,
          importRunId: runId,
          ownerUid: user.uid,
          adminUids,
          createdAt: serverTimestamp(),
        });
      }
      await p0Batch.commit();
    } else {
      await updateDoc(runRef, {
        ...runPayloadBase,
        updatedAt: serverTimestamp(),
      });
    }

    // -------------------------------------------------------------------------
    // Phase 1: Master Entities (clients, suppliers, chartOfAccounts)
    // Must commit before Phase 2 so jobs satisfy existsAfter(/clients/{id})
    // -------------------------------------------------------------------------
    const phase1Ops: BatchOp[] = [];
    const existingClientMap = new Map(clients.map((c) => [c.id, c]));
    const existingSupplierMap = new Map(suppliers.map((s) => [s.id, s]));
    const existingCoaMap = new Map(chartOfAccounts.map((a) => [a.id, a]));

    for (const c of plan.customers) {
      if (c.action === 'skip_existing') {
        if (!options?.retryFailedOnly) {
          recordStaticOutcome(
            'customer',
            c.sourceKey,
            c.resolvedCompanyName,
            'skipped',
            'clients',
            c.docId
          );
        }
        continue;
      }
      if (c.action === 'blocked') {
        recordStaticOutcome(
          'customer',
          c.sourceKey,
          c.resolvedCompanyName || c.sourceKey,
          'failed',
          'clients',
          c.docId,
          c.error || 'Blocked by validation'
        );
        continue;
      }
      const targetRef = doc(db, 'clients', c.docId);
      const alreadyExists = existingClientMap.has(c.docId) || (await getDoc(targetRef)).exists();
      if (c.action === 'match_update' || alreadyExists) {
        const existingRec = existingClientMap.get(c.docId);
        const updatePayload: Record<string, unknown> = {
          legacySourceId: trimStr(c.source.sourceId, 128),
          legacyPricingMode: trimStr(c.legacyPricingMode, 64),
          creditApproved: c.creditApproved,
          creditLimitUSD: round2(c.creditLimitUSD),
          importRunId: runId,
          updatedAt: serverTimestamp(),
        };
        if (existingRec) {
          if (!existingRec.email && c.resolvedEmail) updatePayload.email = trimStr(c.resolvedEmail, 200);
          if (!existingRec.phone && c.resolvedPhone) updatePayload.phone = trimStr(c.resolvedPhone, 40);
          if (!existingRec.address && c.resolvedAddress)
            updatePayload.address = trimStr(c.resolvedAddress, 300);
          if (!existingRec.vatRegNumber && c.resolvedVatReg) {
            updatePayload.vatRegNumber = trimStr(c.resolvedVatReg, 64).toUpperCase();
            updatePayload.isVatRegistered = true;
          }
        }
        phase1Ops.push({
          ref: targetRef,
          mode: 'update',
          data: updatePayload,
          category: 'customer',
          sourceKey: c.sourceKey,
          displayLabel: c.resolvedCompanyName,
          intendedOutcome: 'matched',
          targetCollection: 'clients',
          targetDocId: c.docId,
        });
      } else {
        phase1Ops.push({
          ref: targetRef,
          mode: 'set',
          data: {
            companyName: trimStr(c.resolvedCompanyName, 160),
            contactName: trimStr(c.resolvedContactName, 120),
            email: trimStr(c.resolvedEmail, 200),
            phone: trimStr(c.resolvedPhone, 40),
            taxPin: trimStr(c.resolvedVatReg, 64).toUpperCase(),
            zimraTin: '',
            vatRegNumber: trimStr(c.resolvedVatReg, 64).toUpperCase(),
            isVatRegistered: Boolean(c.resolvedVatReg),
            address: trimStr(c.resolvedAddress, 300),
            paymentTermsDays: normalizePaymentTermsDays(c.resolvedPaymentTermsDays, 30),
            notes: trimStr(c.resolvedNotes, 1000),
            legacySourceId: trimStr(c.source.sourceId, 128),
            legacyPricingMode: trimStr(c.legacyPricingMode, 64),
            creditApproved: c.creditApproved,
            creditLimitUSD: round2(c.creditLimitUSD),
            importRunId: runId,
            ownerUid: user.uid,
            staffUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          category: 'customer',
          sourceKey: c.sourceKey,
          displayLabel: c.resolvedCompanyName,
          intendedOutcome: 'created',
          targetCollection: 'clients',
          targetDocId: c.docId,
        });
      }
    }

    for (const s of plan.suppliers) {
      if (s.action === 'skip_existing') {
        if (!options?.retryFailedOnly) {
          recordStaticOutcome(
            'supplier',
            s.sourceKey,
            s.resolvedName,
            'skipped',
            'suppliers',
            s.docId
          );
        }
        continue;
      }
      if (s.action === 'blocked') {
        recordStaticOutcome(
          'supplier',
          s.sourceKey,
          s.resolvedName || s.sourceKey,
          'failed',
          'suppliers',
          s.docId,
          s.error || 'Blocked by validation'
        );
        continue;
      }
      const targetRef = doc(db, 'suppliers', s.docId);
      const alreadyExists =
        existingSupplierMap.has(s.docId) || (await getDoc(targetRef)).exists();
      if (s.action === 'match_update' || alreadyExists) {
        const existingSup = existingSupplierMap.get(s.docId);
        const updatePayload: Record<string, unknown> = {
          legacySourceKey: trimStr(s.sourceKey, 128),
          importRunId: runId,
          updatedAt: serverTimestamp(),
        };
        if (existingSup) {
          if (!existingSup.phone && s.resolvedPhone) updatePayload.phone = trimStr(s.resolvedPhone, 40);
          if (!existingSup.email && s.resolvedEmail) updatePayload.email = trimStr(s.resolvedEmail, 200);
          if (!existingSup.address && s.resolvedAddress)
            updatePayload.address = trimStr(s.resolvedAddress, 300);
        }
        phase1Ops.push({
          ref: targetRef,
          mode: 'update',
          data: updatePayload,
          category: 'supplier',
          sourceKey: s.sourceKey,
          displayLabel: s.resolvedName,
          intendedOutcome: 'matched',
          targetCollection: 'suppliers',
          targetDocId: s.docId,
        });
      } else {
        phase1Ops.push({
          ref: targetRef,
          mode: 'set',
          data: {
            name: trimStr(s.resolvedName, 160),
            contactName: '',
            phone: trimStr(s.resolvedPhone, 40),
            email: trimStr(s.resolvedEmail, 200),
            address: trimStr(s.resolvedAddress, 300),
            zimraTin: '',
            vatRegNumber: '',
            isVatRegistered: false,
            notes: `Imported master supplier contact (${s.sourceKey})`,
            legacySourceKey: trimStr(s.sourceKey, 128),
            importRunId: runId,
            ownerUid: user.uid,
            staffUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          category: 'supplier',
          sourceKey: s.sourceKey,
          displayLabel: s.resolvedName,
          intendedOutcome: 'created',
          targetCollection: 'suppliers',
          targetDocId: s.docId,
        });
      }
    }

    for (const a of plan.accounts) {
      if (a.action === 'skip_existing') {
        if (!options?.retryFailedOnly) {
          recordStaticOutcome(
            'account',
            a.sourceKey,
            `${a.assignedCode} — ${a.source.name}`,
            'skipped',
            'chartOfAccounts',
            a.docId
          );
        }
        continue;
      }
      if (a.action === 'blocked') {
        recordStaticOutcome(
          'account',
          a.sourceKey,
          `${a.sourceKey} — ${a.source.name}`,
          'failed',
          'chartOfAccounts',
          a.docId,
          a.error || 'Blocked by validation'
        );
        continue;
      }
      const targetRef = doc(db, 'chartOfAccounts', a.docId);
      const alreadyExists = existingCoaMap.has(a.docId) || (await getDoc(targetRef)).exists();
      if (a.action === 'match_update' || alreadyExists) {
        // Safely link AR 1200 / AP 2100 or previously imported legacy doc without overwriting native balances
        phase1Ops.push({
          ref: targetRef,
          mode: 'update',
          data: {
            legacySourceCode: trimStr(a.source.sourceCode, 40),
            legacyParentCode: trimStr(a.source.parentCode || '', 40),
            legacyCurrencyLabel: trimStr(a.legacyCurrencyLabel, 40),
            legacyNormalBalanceUSD: a.normalSideBalanceUSD,
            legacyTrialDebitUSD: a.trialDebitUSD,
            legacyTrialCreditUSD: a.trialCreditUSD,
            importRunId: runId,
            updatedAt: serverTimestamp(),
          },
          category: 'account',
          sourceKey: a.sourceKey,
          displayLabel: `${a.assignedCode} — ${a.source.name}`,
          intendedOutcome: 'matched',
          targetCollection: 'chartOfAccounts',
          targetDocId: a.docId,
        });
      } else {
        phase1Ops.push({
          ref: targetRef,
          mode: 'set',
          data: {
            code: trimStr(a.assignedCode, 24),
            name: trimStr(a.source.name, 120),
            accountType: a.mappedAccountType,
            subType: a.mappedSubType,
            currency: trimStr(a.nativeCurrency, 6) || 'USD',
            bankName: '',
            accountNumber: '',
            branch: '',
            openingBalance: 0, // Never inflate target Cash Book opening floats with legacy balances
            isCashBookAccount: false,
            isActive: a.source.active !== false,
            notes: trimStr(a.mappingReason, 500),
            legacySourceCode: trimStr(a.source.sourceCode, 40),
            legacyParentCode: trimStr(a.source.parentCode || '', 40),
            legacyCurrencyLabel: trimStr(a.legacyCurrencyLabel, 40),
            legacyNormalBalanceUSD: a.normalSideBalanceUSD,
            legacyTrialDebitUSD: a.trialDebitUSD,
            legacyTrialCreditUSD: a.trialCreditUSD,
            legacyImported: true,
            importRunId: runId,
            ownerUid: user.uid,
            staffUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          category: 'account',
          sourceKey: a.sourceKey,
          displayLabel: `${a.assignedCode} — ${a.source.name}`,
          intendedOutcome: 'created',
          targetCollection: 'chartOfAccounts',
          targetDocId: a.docId,
        });
      }
    }

    await runPhaseBatches('Phase 1/3: Clients, Suppliers & Accounts', phase1Ops);

    // -------------------------------------------------------------------------
    // Phase 2: Jobs & Historical Opening Balances
    // -------------------------------------------------------------------------
    const phase2Ops: BatchOp[] = [];
    const existingJobIds = new Set(jobs.map((j) => j.id));
    const existingObIds = new Set(openingBalances.map((o) => o.id));

    for (const j of plan.pendingJobs) {
      if (j.action === 'skip_existing') {
        if (!options?.retryFailedOnly) {
          recordStaticOutcome(
            'pending_job',
            j.sourceKey,
            `${j.sourceKey} — ${j.resolvedClientName}`,
            'skipped',
            'jobs',
            j.docId
          );
        }
        continue;
      }
      if (j.action === 'blocked') {
        recordStaticOutcome(
          'pending_job',
          j.sourceKey,
          `${j.sourceKey} — ${j.resolvedClientName}`,
          'failed',
          'jobs',
          j.docId,
          j.error || 'Blocked by validation'
        );
        continue;
      }
      const targetRef = doc(db, 'jobs', j.docId);
      const alreadyExists = existingJobIds.has(j.docId) || (await getDoc(targetRef)).exists();
      if (alreadyExists) {
        recordStaticOutcome(
          'pending_job',
          j.sourceKey,
          `${j.sourceKey} — ${j.resolvedClientName}`,
          'skipped',
          'jobs',
          j.docId
        );
        continue;
      }

      const specSummary = j.legacyLinesExtracted
        ? `Imported with ${j.lineSpecsCount} line spec(s) · Prepared by: ${j.source.preparedBy || 'Unknown'}`
        : `Line specifications NOT extracted from legacy system (${j.source.sourceStatus}). Preserved legacy value $${j.valueUSD.toFixed(2)} without inventing production items or tax split. Prepared by: ${j.source.preparedBy || 'Unknown'}`;

      phase2Ops.push({
        ref: targetRef,
        mode: 'set',
        data: {
          jobNumber: trimStr(j.source.sourceReference, 40),
          clientId: j.resolvedClientId,
          clientName: trimStr(j.resolvedClientName, 160),
          title: trimStr(
            j.source.division
              ? `${j.source.division} — ${j.source.sourceReference}`
              : `Legacy Job ${j.source.sourceReference}`,
            200
          ),
          category: j.mappedCategory,
          status: j.mappedStatus,
          priority: 'Standard',
          dueDate: trimStr(j.source.dueDate || '', 32),
          printMethod: trimStr(j.source.division || 'Legacy Import', 120),
          substrateOrFabric: '',
          colorSpecs: '',
          quantity: j.legacyLinesExtracted ? 1 : 0,
          sizeBreakdown: {
            XS: 0,
            S: 0,
            M: 0,
            L: 0,
            XL: 0,
            XXL: 0,
            XXXL: 0,
            Custom: j.legacyLinesExtracted ? 1 : 0,
          },
          artworkNotes: trimStr(specSummary, 2000),
          tailoringMeasurements: '',
          checklist: {
            prePressOrPattern: j.mappedStatus !== 'Quoted',
            materialsIssued:
              j.mappedStatus === 'In Production' || j.mappedStatus === 'Ready for Dispatch',
            printingOrTailoring: j.mappedStatus === 'Ready for Dispatch',
            qualityControl: j.mappedStatus === 'Ready for Dispatch',
            dispatchReady: j.mappedStatus === 'Ready for Dispatch',
          },
          pricingMode: 'exclusive',
          vatTreatment: j.legacyLinesExtracted ? 'exempt' : 'unknown',
          vatRate: 0,
          unitPrice: j.legacyLinesExtracted ? round2(j.valueUSD) : 0,
          netTotal: j.legacyLinesExtracted ? round2(j.valueUSD) : 0,
          vatAmount: 0,
          grossTotal: j.legacyLinesExtracted ? round2(j.valueUSD) : 0,
          estimatedMaterialCost: 0,
          estimatedLaborCost: 0,
          estimatedSubcontractCost: 0,
          estimatedOverheadCost: 0,
          actualCostTotal: 0,
          assignedSalesUid: '',
          assignedSalesName: trimStr(j.source.salesOwner || '', 120),
          assignedProductionName: '',
          commissionRatePct: 0,
          commissionBasis: 'gross_profit',
          commissionAmount: 0,
          commissionStatus: 'Pending',
          legacySourceReference: trimStr(j.source.sourceReference, 120),
          legacySourceStatus: trimStr(j.source.sourceStatus, 80),
          legacyDivision: trimStr(j.source.division || '', 120),
          legacyPreparedBy: trimStr(j.source.preparedBy || '', 120),
          legacySalesOwner: trimStr(j.source.salesOwner || '', 120),
          legacyValueUSD: round2(j.valueUSD),
          legacyLinesExtracted: j.legacyLinesExtracted,
          importRunId: runId,
          ownerUid: user.uid,
          staffUids,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        category: 'pending_job',
        sourceKey: j.sourceKey,
        displayLabel: `${j.sourceKey} — ${j.resolvedClientName}`,
        intendedOutcome: 'created',
        targetCollection: 'jobs',
        targetDocId: j.docId,
      });
    }

    const pushOpeningBalanceOp = async (
      category: MigrationRecordCategory,
      item: {
        sourceKey: string;
        docId: string;
        action: string;
        error?: string;
      },
      displayLabel: string,
      recordData: Record<string, unknown>
    ) => {
      if (item.action === 'skip_existing') {
        if (!options?.retryFailedOnly) {
          recordStaticOutcome(
            category,
            item.sourceKey,
            displayLabel,
            'skipped',
            'openingBalances',
            item.docId
          );
        }
        return;
      }
      if (item.action === 'blocked') {
        recordStaticOutcome(
          category,
          item.sourceKey,
          displayLabel,
          'failed',
          'openingBalances',
          item.docId,
          item.error || 'Blocked by validation'
        );
        return;
      }
      const targetRef = doc(db, 'openingBalances', item.docId);
      const alreadyExists =
        existingObIds.has(item.docId) || (await getDoc(targetRef)).exists();
      if (alreadyExists) {
        const { createdAt: _ignore, ownerUid: _ignoreOwner, ...updateFields } = recordData;
        phase2Ops.push({
          ref: targetRef,
          mode: 'update',
          data: {
            ...updateFields,
            updatedAt: serverTimestamp(),
          },
          category,
          sourceKey: item.sourceKey,
          displayLabel,
          intendedOutcome: item.action === 'match_update' ? 'matched' : 'skipped',
          targetCollection: 'openingBalances',
          targetDocId: item.docId,
        });
      } else {
        phase2Ops.push({
          ref: targetRef,
          mode: 'set',
          data: {
            ...recordData,
            ownerUid: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          category,
          sourceKey: item.sourceKey,
          displayLabel,
          intendedOutcome: item.action === 'match_update' ? 'matched' : 'created',
          targetCollection: 'openingBalances',
          targetDocId: item.docId,
        });
      }
    };

    for (const r of plan.receivables) {
      await pushOpeningBalanceOp(
        'receivable',
        r,
        `${r.source.sourceInvoiceReference} — ${r.resolvedClientName}`,
        {
          recordType: 'receivable',
          sourceKey: trimStr(r.sourceKey, 160),
          sourceReference: trimStr(r.source.sourceInvoiceReference, 120),
          counterpartyId: trimStr(r.resolvedClientId, 128),
          counterpartySourceId: trimStr(r.source.customerSourceId, 128),
          counterpartyName: trimStr(r.resolvedClientName, 160),
          recordedDate: trimStr(plan.asOfDate, 32),
          dueDate: trimStr(r.dueDate, 32),
          outstandingUSD: round2(r.outstandingUSD),
          migrationTreatment: trimStr(r.migrationTreatment, 200),
          sourceStatus: 'Opening Balance',
          matchedSupplierInvoiceId: '',
          matchedSupplierInvoiceNo: '',
          isMatchedExisting: false,
          notes: 'Historical opening receivable — excluded from VAT & current revenue',
          asOfDate: trimStr(plan.asOfDate, 32),
          importRunId: runId,
          viewerUids: salesFinUids,
        }
      );
    }

    for (const cr of plan.customerCredits) {
      await pushOpeningBalanceOp(
        'customer_credit',
        cr,
        `Credit — ${cr.resolvedClientName}`,
        {
          recordType: 'customer_credit',
          sourceKey: trimStr(cr.sourceKey, 160),
          sourceReference: `UNAPPLIED-CREDIT-${cr.source.customerSourceId}`.slice(0, 120),
          counterpartyId: trimStr(cr.resolvedClientId, 128),
          counterpartySourceId: trimStr(cr.source.customerSourceId, 128),
          counterpartyName: trimStr(cr.resolvedClientName, 160),
          recordedDate: trimStr(plan.asOfDate, 32),
          dueDate: '',
          outstandingUSD: round2(cr.unappliedCreditUSD),
          migrationTreatment: 'Unapplied historical customer credit',
          sourceStatus: 'Unapplied Credit',
          matchedSupplierInvoiceId: '',
          matchedSupplierInvoiceNo: '',
          isMatchedExisting: false,
          notes: 'Historical unapplied customer credit kept separate from gross receivables',
          asOfDate: trimStr(plan.asOfDate, 32),
          importRunId: runId,
          viewerUids: salesFinUids,
        }
      );
    }

    for (const sp of plan.supplierPayables) {
      await pushOpeningBalanceOp(
        'supplier_payable',
        sp,
        `${sp.sourceReference} — ${sp.supplierName}`,
        {
          recordType: sp.recordType,
          sourceKey: trimStr(sp.sourceKey, 160),
          sourceReference: trimStr(sp.sourceReference, 120),
          counterpartyId: trimStr(sp.counterpartyId, 128),
          counterpartySourceId: '',
          counterpartyName: trimStr(sp.supplierName, 160),
          recordedDate: trimStr(sp.recordedDate || plan.asOfDate, 32),
          dueDate: trimStr(sp.dueDate, 32),
          outstandingUSD: round2(sp.outstandingUSD),
          migrationTreatment: trimStr(sp.reason, 200),
          sourceStatus: trimStr(sp.sourceStatus, 80),
          matchedSupplierInvoiceId: trimStr(sp.matchedSupplierInvoiceId, 128),
          matchedSupplierInvoiceNo: trimStr(sp.matchedSupplierInvoiceNo, 80),
          isMatchedExisting: sp.isMatchedExisting,
          notes: trimStr(sp.notes, 1000),
          preservedMetadata: sp.preservedMetadata,
          asOfDate: trimStr(plan.asOfDate, 32),
          importRunId: runId,
          viewerUids: hrUids,
        }
      );
    }

    await runPhaseBatches('Phase 2/3: Jobs & Historical Opening Balances', phase2Ops);

    // -------------------------------------------------------------------------
    // Phase 3: Write /migrationRuns/{runId}/records audit docs & compute final status
    // -------------------------------------------------------------------------
    options?.onProgress?.({ phase: 'Phase 3/3: Recording audit trail', done: 0, total: outcomes.size });
    const outcomeList = Array.from(outcomes.values());
    const recChunks = chunkArray(outcomeList, 350);
    let recDone = 0;
    for (const chunk of recChunks) {
      const recBatch = writeBatch(db);
      chunk.forEach((entry) => {
        const recId = makeDeterministicId('rec', `${entry.category}:${entry.sourceKey}`);
        recBatch.set(doc(db, 'migrationRuns', runId, 'records', recId), {
          importRunId: runId,
          category: entry.category,
          sourceKey: trimStr(entry.sourceKey, 160),
          displayLabel: trimStr(entry.displayLabel, 200),
          outcome: entry.outcome,
          targetCollection: trimStr(entry.targetCollection, 64),
          targetDocId: trimStr(entry.targetDocId, 128),
          errorMessage: trimStr(entry.errorMessage, 500),
          ownerUid: user.uid,
          adminUids,
          updatedAt: serverTimestamp(),
        });
      });
      await recBatch.commit();
      recDone += chunk.length;
      options?.onProgress?.({
        phase: 'Phase 3/3: Recording audit trail',
        done: recDone,
        total: outcomeList.length,
      });
    }

    // Recompute totals across ALL recorded audit entries for this run (safe for retry/resume)
    const allRecSnap = await getDocs(collection(db, 'migrationRuns', runId, 'records'));
    const allRecs = allRecSnap.docs.map((d) => d.data() as MigrationRunRecord);
    const createdCount = allRecs.filter((r) => r.outcome === 'created').length;
    const matchedCount = allRecs.filter((r) => r.outcome === 'matched').length;
    const skippedCount = allRecs.filter((r) => r.outcome === 'skipped').length;
    const failedRecs = allRecs.filter((r) => r.outcome === 'failed');
    const failedCount = failedRecs.length;
    const failedKeys = failedRecs
      .slice(0, 500)
      .map((r) => `${r.category}:${r.sourceKey}`);
    const lastError = trimStr(failedRecs[0]?.errorMessage || '', 500);
    const finalStatus: MigrationRunStatus =
      failedCount === 0 ? 'completed' : 'partial_failed';

    await updateDoc(runRef, {
      status: finalStatus,
      createdCount,
      matchedCount,
      skippedCount,
      failedCount,
      failedKeys,
      lastError,
      updatedAt: serverTimestamp(),
    });

    return {
      runId,
      status: finalStatus,
      createdCount,
      matchedCount,
      skippedCount,
      failedCount,
      failedKeys,
      lastError,
    };
  };

  const seedSampleData = async () => {
    if (!user || !profile) return;
    const vatRate = settings.defaultVatRate ?? 15;
    const staffUids = activeStaffUids;
    const hrUids = hrViewerUids;
    const today = new Date().toISOString().slice(0, 10);
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const in10Days = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const sampleSalesRep =
      users.find((u) => u.status === 'active' && u.role === 'sales') ||
      (profile.role === 'sales' ? profile : null);
    const sampleSalesUid = sampleSalesRep ? sampleSalesRep.uid : '';
    const sampleSalesName = sampleSalesRep ? sampleSalesRep.displayName : '';
    const sampleCommRate = sampleSalesRep
      ? sampleSalesRep.commissionRatePct ?? settings.defaultCommissionRatePct ?? 5
      : 0;

    try {
      const batch = writeBatch(db);

      // Default Zimbabwean Chart of Accounts (only if none exist yet)
      if (chartOfAccounts.length === 0) {
        const coaSeeds: Array<
          Omit<ChartAccount, 'id' | 'ownerUid' | 'staffUids' | 'createdAt' | 'updatedAt'>
        > = [
          {
            code: '1010',
            name: 'CBZ Nostro USD Account',
            accountType: 'Asset',
            subType: 'Bank',
            currency: 'USD',
            bankName: 'CBZ Bank Zimbabwe',
            accountNumber: '01120498110021',
            branch: 'Southerton / Workington Branch',
            openingBalance: 4500,
            isCashBookAccount: true,
            isActive: true,
            notes: 'Primary USD Nostro corporate current account',
          },
          {
            code: '1015',
            name: 'Stanbic ZWG Operating Account',
            accountType: 'Asset',
            subType: 'Bank',
            currency: 'ZWG',
            bankName: 'Stanbic Bank Zimbabwe',
            accountNumber: '9140002849102',
            branch: 'Harare Samora Machel',
            openingBalance: 0,
            isCashBookAccount: true,
            isActive: true,
            notes: 'Local ZWG (ZiG) clearing & ZIPIT receipts',
          },
          {
            code: '1020',
            name: 'EcoCash Merchant Till',
            accountType: 'Asset',
            subType: 'Mobile Money',
            currency: 'USD',
            bankName: 'EcoCash Zimbabwe',
            accountNumber: 'Merchant Code 482910',
            branch: 'Mobile Wallet',
            openingBalance: 650,
            isCashBookAccount: true,
            isActive: true,
            notes: 'Customer mobile walk-in payments & deposits',
          },
          {
            code: '1030',
            name: 'USD Cash Drawer',
            accountType: 'Asset',
            subType: 'Cash',
            currency: 'USD',
            bankName: 'Harare Front Desk Safe',
            accountNumber: 'CASH-USD-01',
            branch: 'Workington Reception',
            openingBalance: 350,
            isCashBookAccount: true,
            isActive: true,
            notes: 'Physical USD counter cash collections',
          },
          {
            code: '1040',
            name: 'Petty Cash Float',
            accountType: 'Asset',
            subType: 'Cash',
            currency: 'USD',
            bankName: 'Workshop Imprest Box',
            accountNumber: 'PETTY-01',
            branch: 'Harare Workshop',
            openingBalance: 200,
            isCashBookAccount: true,
            isActive: true,
            notes: 'Courier, trims, needles & daily sundries',
          },
          {
            code: '4000',
            name: 'Printing, Branding & Tailoring Revenue',
            accountType: 'Revenue',
            subType: 'Operating',
            currency: 'USD',
            bankName: '',
            accountNumber: '',
            branch: '',
            openingBalance: 0,
            isCashBookAccount: false,
            isActive: true,
            notes: 'Net sales revenue across all 4 Megaprint service lines',
          },
          {
            code: '6100',
            name: 'Sales Commissions Expense',
            accountType: 'Expense',
            subType: 'Payroll',
            currency: 'USD',
            bankName: '',
            accountNumber: '',
            branch: '',
            openingBalance: 0,
            isCashBookAccount: false,
            isActive: true,
            notes: 'Sales team commissions earned & paid per production job',
          },
        ];
        coaSeeds.forEach((acc) => {
          batch.set(doc(collection(db, 'chartOfAccounts')), {
            ...acc,
            ownerUid: user.uid,
            staffUids,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      }

      // Zimbabwean Clients
      const c1 = doc(collection(db, 'clients'));
      const c2 = doc(collection(db, 'clients'));
      const c3 = doc(collection(db, 'clients'));

      batch.set(c1, {
        companyName: 'Msasa Logistics (Pvt) Ltd',
        contactName: 'Rumbidzai Chikwanda',
        email: 'procurement@msasalogistics.co.zw',
        phone: '+263 77 234 5678',
        taxPin: 'BP 0200881920',
        zimraTin: '2000881920',
        vatRegNumber: '10088192',
        isVatRegistered: true,
        address: 'Msasa Industrial Park, Harare',
        paymentTermsDays: 30,
        notes: 'Fleet branding & driver reflective workwear account',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(c2, {
        companyName: 'Victoria Falls Safari Lodge',
        contactName: 'Tendai Moyo',
        email: 'events@vicfallslodge.co.zw',
        phone: '+263 71 889 1020',
        taxPin: 'BP 0200441209',
        zimraTin: '2000441209',
        vatRegNumber: '10044120',
        isVatRegistered: true,
        address: 'Stand 471B Squire Cummings Rd, Victoria Falls',
        paymentTermsDays: 14,
        notes: 'Bespoke concierge suits & embroidered hospitality uniforms',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(c3, {
        companyName: 'ZimTech Summit Harare',
        contactName: 'Tatenda Ncube',
        email: 'tatenda@zimtech.co.zw',
        phone: '+263 78 410 9221',
        taxPin: 'BP 0200772011',
        zimraTin: '2000772011',
        vatRegNumber: '10077201',
        isVatRegistered: true,
        address: 'Borrowdale Office Park, Harare',
        paymentTermsDays: 7,
        notes: 'Conference pull-up banners, lanyards & branded corporate wear',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Jobs (with USD realistic figures & 5% Sales Commission trace)
      const j1Vat = calculateVatBreakdown({
        amount: 120 * 14.5,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      const j1 = doc(collection(db, 'jobs'));
      batch.set(j1, {
        jobNumber: 'MP-2026-1041',
        clientId: c1.id,
        clientName: 'Msasa Logistics (Pvt) Ltd',
        title: '120 Branded Heavy-Duty Polo Shirts & Reflective Jackets',
        category: 'Corporate Wear',
        status: 'In Production',
        priority: 'Urgent',
        dueDate: in5Days,
        printMethod: 'Embroidery + Reflective Heat Transfer',
        substrateOrFabric: '240gsm Cotton Pique & Oxford Reflective Shell',
        colorSpecs: 'Navy Blue #0F172A + Safety Amber #D97706',
        quantity: 120,
        sizeBreakdown: { XS: 4, S: 16, M: 34, L: 36, XL: 20, XXL: 8, XXXL: 2, Custom: 0 },
        artworkNotes: 'Left chest crest embroidered 85mm wide; back reflective wordmark 260mm.',
        tailoringMeasurements: 'Standard corporate fit; reinforce double-stitch on shoulder seams.',
        checklist: {
          prePressOrPattern: true,
          materialsIssued: true,
          printingOrTailoring: false,
          qualityControl: false,
          dispatchReady: false,
        },
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
        unitPrice: 14.5,
        netTotal: j1Vat.netAmount,
        vatAmount: j1Vat.vatAmount,
        grossTotal: j1Vat.grossAmount,
        estimatedMaterialCost: 820,
        estimatedLaborCost: 245,
        estimatedSubcontractCost: 0,
        estimatedOverheadCost: 95,
        actualCostTotal: 742,
        assignedSalesUid: sampleSalesUid,
        assignedSalesName: sampleSalesName,
        assignedProductionName: 'Farai Mutasa',
        commissionRatePct: sampleCommRate,
        commissionBasis: 'gross_profit',
        commissionAmount:
          sampleCommRate > 0
            ? round2((Math.max(0, j1Vat.netAmount - 742) * sampleCommRate) / 100)
            : 0,
        commissionStatus: 'Pending',
        commissionPaidDate: '',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const j2Vat = calculateVatBreakdown({
        amount: 18 * 165,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      const j2 = doc(collection(db, 'jobs'));
      batch.set(j2, {
        jobNumber: 'MP-2026-1042',
        clientId: c2.id,
        clientName: 'Victoria Falls Safari Lodge',
        title: '18 Bespoke Tailored Concierge 2-Piece Suits',
        category: 'Tailoring',
        status: 'Quality Control',
        priority: 'Standard',
        dueDate: in10Days,
        printMethod: 'Bespoke Tailoring & Lapel Pin Monogram',
        substrateOrFabric: 'Super 120s Wool Blend Charcoal + Satin Lining',
        colorSpecs: 'Charcoal Slate with Gold Piping',
        quantity: 18,
        sizeBreakdown: { XS: 0, S: 3, M: 6, L: 5, XL: 3, XXL: 1, XXXL: 0, Custom: 18 },
        artworkNotes: 'Interior woven lodge label; gold bullion monogram on breast pocket.',
        tailoringMeasurements: 'Individual fitting sheets #VF-01 through #VF-18 attached in workshop folder.',
        checklist: {
          prePressOrPattern: true,
          materialsIssued: true,
          printingOrTailoring: true,
          qualityControl: false,
          dispatchReady: false,
        },
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
        unitPrice: 165,
        netTotal: j2Vat.netAmount,
        vatAmount: j2Vat.vatAmount,
        grossTotal: j2Vat.grossAmount,
        estimatedMaterialCost: 1180,
        estimatedLaborCost: 680,
        estimatedSubcontractCost: 0,
        estimatedOverheadCost: 140,
        actualCostTotal: 1915,
        assignedSalesUid: sampleSalesUid,
        assignedSalesName: sampleSalesName,
        assignedProductionName: 'Chipo Nyathi',
        commissionRatePct: sampleCommRate,
        commissionBasis: 'gross_profit',
        commissionAmount:
          sampleCommRate > 0
            ? round2((Math.max(0, j2Vat.netAmount - 1915) * sampleCommRate) / 100)
            : 0,
        commissionStatus: 'Pending',
        commissionPaidDate: '',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const j3Vat = calculateVatBreakdown({
        amount: 2500 * 0.52,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      const j3 = doc(collection(db, 'jobs'));
      batch.set(j3, {
        jobNumber: 'MP-2026-1043',
        clientId: c3.id,
        clientName: 'ZimTech Summit Harare',
        title: '2,500 A4 Summit Program Booklets & 12 Pull-Up Banners',
        category: 'Printing',
        status: 'Completed',
        priority: 'Express',
        dueDate: today,
        printMethod: '4-Color Offset + Large Format Eco-Solvent',
        substrateOrFabric: '300gsm Matte Art Cover / 130gsm Inner / 440gsm PVC',
        colorSpecs: 'CMYK + Pantone 286C',
        quantity: 2500,
        sizeBreakdown: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0, Custom: 2500 },
        artworkNotes: 'Matte lamination on cover, saddle-stitched spine, 3mm bleed verified.',
        tailoringMeasurements: '',
        checklist: {
          prePressOrPattern: true,
          materialsIssued: true,
          printingOrTailoring: true,
          qualityControl: true,
          dispatchReady: true,
        },
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
        unitPrice: 0.52,
        netTotal: j3Vat.netAmount,
        vatAmount: j3Vat.vatAmount,
        grossTotal: j3Vat.grossAmount,
        estimatedMaterialCost: 580,
        estimatedLaborCost: 150,
        estimatedSubcontractCost: 65,
        estimatedOverheadCost: 70,
        actualCostTotal: 842,
        assignedSalesUid: sampleSalesUid,
        assignedSalesName: sampleSalesName,
        assignedProductionName: 'Kudakwashe Sibanda',
        commissionRatePct: sampleCommRate,
        commissionBasis: 'gross_profit',
        commissionAmount:
          sampleCommRate > 0
            ? round2((Math.max(0, j3Vat.netAmount - 842) * sampleCommRate) / 100)
            : 0,
        commissionStatus: sampleSalesRep ? 'Earned' : 'Pending',
        commissionPaidDate: '',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const j4Vat = calculateVatBreakdown({
        amount: 6 * 280,
        pricingMode: 'inclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      const j4 = doc(collection(db, 'jobs'));
      batch.set(j4, {
        jobNumber: 'MP-2026-1044',
        clientId: c1.id,
        clientName: 'Msasa Logistics (Pvt) Ltd',
        title: '6 Box Truck Full Vinyl Fleet Wraps',
        category: 'Branding',
        status: 'Approved',
        priority: 'Urgent',
        dueDate: in10Days,
        printMethod: 'Cast Vinyl Print & UV Overlaminate + Installation',
        substrateOrFabric: '3M IJ180mC Cast Wrap Film + 8518 Gloss Laminate',
        colorSpecs: 'Full CMYK Brand Gradient',
        quantity: 6,
        sizeBreakdown: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0, Custom: 6 },
        artworkNotes: 'Template verified against box truck panel seams; rivet channel primer required.',
        tailoringMeasurements: '',
        checklist: {
          prePressOrPattern: true,
          materialsIssued: false,
          printingOrTailoring: false,
          qualityControl: false,
          dispatchReady: false,
        },
        pricingMode: 'inclusive',
        vatTreatment: 'standard',
        vatRate,
        unitPrice: 280,
        netTotal: j4Vat.netAmount,
        vatAmount: j4Vat.vatAmount,
        grossTotal: j4Vat.grossAmount,
        estimatedMaterialCost: 720,
        estimatedLaborCost: 220,
        estimatedSubcontractCost: 0,
        estimatedOverheadCost: 80,
        actualCostTotal: 0,
        assignedSalesUid: sampleSalesUid,
        assignedSalesName: sampleSalesName,
        assignedProductionName: 'Kudakwashe Sibanda',
        commissionRatePct: sampleCommRate,
        commissionBasis: 'gross_profit',
        commissionAmount:
          sampleCommRate > 0
            ? round2(
                (Math.max(0, j4Vat.netAmount - (720 + 220 + 80)) * sampleCommRate) /
                  100
              )
            : 0,
        commissionStatus: 'Pending',
        commissionPaidDate: '',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Job Cost entries for j1
      const jc1 = doc(collection(db, `jobs/${j1.id}/costs`));
      batch.set(jc1, {
        jobId: j1.id,
        costType: 'Material',
        description: '240gsm Cotton Pique Fabric Rolls & Reflective Tape',
        quantity: 120,
        unitCost: 5.4,
        totalCost: 648,
        loggedByName: profile.displayName,
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
      });
      const jc2 = doc(collection(db, `jobs/${j1.id}/costs`));
      batch.set(jc2, {
        jobId: j1.id,
        costType: 'Labor',
        description: 'Cutting & Embroidery Machine Setup (16 hrs)',
        quantity: 16,
        unitCost: 5.875,
        totalCost: 94,
        loggedByName: profile.displayName,
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
      });

      // Invoices
      const inv1 = doc(collection(db, 'invoices'));
      batch.set(inv1, {
        invoiceNumber: 'INV-2026-081',
        jobId: j3.id,
        jobNumber: 'MP-2026-1043',
        clientId: c3.id,
        clientName: 'ZimTech Summit Harare',
        clientVatPin: 'BP 0200772011',
        clientTin: '2000772011',
        clientVatReg: '10077201',
        issueDate: today,
        dueDate: in5Days,
        status: 'Paid',
        pricingMode: 'exclusive',
        vatRate,
        lines: [
          {
            description: '2,500 A4 Summit Program Booklets & 12 Pull-Up Banners',
            quantity: 2500,
            unitPrice: 0.52,
            vatTreatment: 'standard',
            netAmount: j3Vat.netAmount,
            vatAmount: j3Vat.vatAmount,
            grossAmount: j3Vat.grossAmount,
          },
        ],
        standardNetAmount: j3Vat.netAmount,
        zeroRatedAmount: 0,
        exemptAmount: 0,
        netAmount: j3Vat.netAmount,
        vatAmount: j3Vat.vatAmount,
        grossAmount: j3Vat.grossAmount,
        whtRate: 0,
        whtWithheldAmount: 0,
        whtCertificateRef: '',
        amountPaid: j3Vat.grossAmount,
        balanceDue: 0,
        paymentMethod: 'CBZ Nostro USD',
        paymentReference: 'ZIPIT-884120',
        notes: 'Settled in full on delivery. Fiscalized ZIMRA FDMS receipt issued.',
        ownerUid: user.uid,
        staffUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const inv2 = doc(collection(db, 'invoices'));
      const inv2Deposit = round2(j1Vat.grossAmount * 0.5);
      batch.set(inv2, {
        invoiceNumber: 'INV-2026-082',
        jobId: j1.id,
        jobNumber: 'MP-2026-1041',
        clientId: c1.id,
        clientName: 'Msasa Logistics (Pvt) Ltd',
        clientVatPin: 'BP 0200881920',
        clientTin: '2000881920',
        clientVatReg: '10088192',
        issueDate: today,
        dueDate: in10Days,
        status: 'Part Paid',
        pricingMode: 'exclusive',
        vatRate,
        lines: [
          {
            description: '120 Branded Heavy-Duty Polo Shirts & Reflective Jackets',
            quantity: 120,
            unitPrice: 14.5,
            vatTreatment: 'standard',
            netAmount: j1Vat.netAmount,
            vatAmount: j1Vat.vatAmount,
            grossAmount: j1Vat.grossAmount,
          },
        ],
        standardNetAmount: j1Vat.netAmount,
        zeroRatedAmount: 0,
        exemptAmount: 0,
        netAmount: j1Vat.netAmount,
        vatAmount: j1Vat.vatAmount,
        grossAmount: j1Vat.grossAmount,
        whtRate: 0,
        whtWithheldAmount: 0,
        whtCertificateRef: '',
        amountPaid: inv2Deposit,
        balanceDue: round2(j1Vat.grossAmount - inv2Deposit),
        paymentMethod: 'EcoCash Merchant Till',
        paymentReference: 'EC260419.8821',
        notes: '50% production deposit received via EcoCash.',
        ownerUid: user.uid,
        staffUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Expenses (Input VAT)
      const exp1 = doc(collection(db, 'expenses'));
      const e1Vat = calculateVatBreakdown({
        amount: 648,
        pricingMode: 'inclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      batch.set(exp1, {
        expenseNumber: 'EXP-2026-201',
        vendorName: 'David Whitehead Textiles Zimbabwe',
        vendorVatPin: 'BP 0200109381',
        vendorTin: '2000109381',
        vendorVatReg: '10010938',
        vendorInvoiceRef: 'DW-7741',
        category: 'Tailoring & Trims',
        jobId: j1.id,
        expenseDate: today,
        vatTreatment: 'standard',
        isVatClaimable: true,
        vatRate,
        netAmount: e1Vat.netAmount,
        vatAmount: e1Vat.vatAmount,
        grossAmount: e1Vat.grossAmount,
        whtApplicable: false,
        whtRate: 0,
        whtAmount: 0,
        paymentStatus: 'Paid',
        notes: '240gsm cotton pique rolls for Msasa Logistics order',
        ownerUid: user.uid,
        staffUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const exp2 = doc(collection(db, 'expenses'));
      const e2Vat = calculateVatBreakdown({
        amount: 580,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      batch.set(exp2, {
        expenseNumber: 'EXP-2026-202',
        vendorName: 'Harare Print & Substrate Supplies',
        vendorVatPin: 'BP 0200662901',
        vendorTin: '2000662901',
        vendorVatReg: '10066290',
        vendorInvoiceRef: 'HPS-33190',
        category: 'Materials & Substrates',
        jobId: j3.id,
        expenseDate: today,
        vatTreatment: 'standard',
        isVatClaimable: true,
        vatRate,
        netAmount: e2Vat.netAmount,
        vatAmount: e2Vat.vatAmount,
        grossAmount: e2Vat.grossAmount,
        whtApplicable: false,
        whtRate: 0,
        whtAmount: 0,
        paymentStatus: 'Paid',
        notes: '300gsm art card, CMYK offset inks & PVC banner media',
        ownerUid: user.uid,
        staffUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const exp3 = doc(collection(db, 'expenses'));
      batch.set(exp3, {
        expenseNumber: 'EXP-2026-203',
        vendorName: 'Workington Industrial Properties',
        vendorVatPin: '',
        vendorTin: '2000510099',
        vendorVatReg: '',
        vendorInvoiceRef: 'RENT-HARARE',
        category: 'Utilities & Rent',
        jobId: '',
        expenseDate: today,
        vatTreatment: 'exempt',
        isVatClaimable: false,
        vatRate: 0,
        netAmount: 850,
        vatAmount: 0,
        grossAmount: 850,
        whtApplicable: false,
        whtRate: 0,
        whtAmount: 0,
        paymentStatus: 'Paid',
        notes: 'Workington print floor & tailoring studio monthly lease (VAT Exempt)',
        ownerUid: user.uid,
        staffUids,
        isVatReportable: false,
        vatViewerUids: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Employees (Harare / Zimbabwe)
      const emp1 = doc(collection(db, 'employees'));
      const emp2 = doc(collection(db, 'employees'));
      const emp3 = doc(collection(db, 'employees'));
      const emp4 = doc(collection(db, 'employees'));

      batch.set(emp1, {
        employeeCode: 'MP-001',
        fullName: 'Chipo Nyathi',
        email: 'chipo@megaprint.co.zw',
        phone: '+263 77 200 3011',
        department: 'Production',
        jobTitle: 'Master Tailor & Pattern Maker',
        employmentType: 'Full-Time',
        hourlyRate: 5.5,
        monthlySalary: 880,
        taxDeductionRate: 15,
        annualLeaveBalance: 18,
        sickLeaveBalance: 10,
        status: 'Active',
        userUid: '',
        ownerUid: user.uid,
        hrViewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(emp2, {
        employeeCode: 'MP-002',
        fullName: 'Farai Mutasa',
        email: 'farai@megaprint.co.zw',
        phone: '+263 71 441 8820',
        department: 'Production',
        jobTitle: 'Screen Print & Embroidery Lead',
        employmentType: 'Full-Time',
        hourlyRate: 4.8,
        monthlySalary: 760,
        taxDeductionRate: 14,
        annualLeaveBalance: 20,
        sickLeaveBalance: 10,
        status: 'Active',
        userUid: '',
        ownerUid: user.uid,
        hrViewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(emp3, {
        employeeCode: 'MP-003',
        fullName: 'Kudakwashe Sibanda',
        email: 'kuda@megaprint.co.zw',
        phone: '+263 78 119 0452',
        department: 'Production',
        jobTitle: 'Large Format & Fleet Wrap Technician',
        employmentType: 'Full-Time',
        hourlyRate: 4.6,
        monthlySalary: 720,
        taxDeductionRate: 14,
        annualLeaveBalance: 21,
        sickLeaveBalance: 10,
        status: 'Active',
        userUid: '',
        ownerUid: user.uid,
        hrViewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(emp4, {
        employeeCode: 'MP-004',
        fullName: 'Nyasha Dube',
        email: 'nyasha@megaprint.co.zw',
        phone: '+263 77 908 3124',
        department: 'Accounts',
        jobTitle: 'Accounts & ZIMRA VAT Compliance Officer',
        employmentType: 'Full-Time',
        hourlyRate: 6.0,
        monthlySalary: 950,
        taxDeductionRate: 18,
        annualLeaveBalance: 19,
        sickLeaveBalance: 10,
        status: 'Active',
        userUid: '',
        ownerUid: user.uid,
        hrViewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Time Entries
      const te1 = doc(collection(db, 'timeEntries'));
      batch.set(te1, {
        employeeId: emp1.id,
        employeeName: 'Chipo Nyathi',
        department: 'Production',
        jobId: j2.id,
        jobNumber: 'MP-2026-1042',
        date: today,
        clockInIso: `${today}T08:00:00`,
        clockOutIso: `${today}T17:30:00`,
        breakMinutes: 30,
        regularHours: 8,
        overtimeHours: 1,
        totalHours: 9,
        hourlyRate: 5.5,
        laborCost: 52.25,
        status: 'Approved',
        notes: 'Suit jacket lapel stitching & final steam pressing',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const te2 = doc(collection(db, 'timeEntries'));
      batch.set(te2, {
        employeeId: emp2.id,
        employeeName: 'Farai Mutasa',
        department: 'Production',
        jobId: j1.id,
        jobNumber: 'MP-2026-1041',
        date: today,
        clockInIso: `${today}T08:15:00`,
        clockOutIso: '',
        breakMinutes: 0,
        regularHours: 0,
        overtimeHours: 0,
        totalHours: 0,
        hourlyRate: 4.8,
        laborCost: 0,
        status: 'Clocked In',
        notes: 'Running 12-head embroidery machine batch #2',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Leave Request
      const lr1 = doc(collection(db, 'leaveRequests'));
      batch.set(lr1, {
        employeeId: emp3.id,
        employeeName: 'Kudakwashe Sibanda',
        department: 'Production',
        leaveType: 'Annual',
        startDate: in10Days,
        endDate: new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10),
        daysCount: 3,
        reason: 'Family travel to Bulawayo after fleet wrap installation completes.',
        status: 'Pending',
        reviewedByName: '',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Operational Sticky Notes
      const n1 = doc(collection(db, 'notes'));
      batch.set(n1, {
        title: 'Priority Dispatch: Msasa Logistics Polos',
        body: 'Confirm reflective strip QC check and carton labeling on MP-2026-1041 before 4:00 PM Friday dispatch.',
        audience: 'Production',
        tone: 'amber',
        pinned: true,
        authorName: trimStr(profile.displayName, 120) || 'Management',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const n2 = doc(collection(db, 'notes'));
      batch.set(n2, {
        title: 'ZIMRA 15% VAT & Fiscal Tax Invoices',
        body: 'All vendor tax invoices for fabric, inks, and vinyl rolls must show the supplier ZIMRA BP Number & FDMS fiscal code before month-end VAT7 close.',
        audience: 'All Staff',
        tone: 'sky',
        pinned: false,
        authorName: trimStr(profile.displayName, 120) || 'Management',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Supplier Tax Invoices
      const si1 = doc(collection(db, 'supplierInvoices'));
      const si1Vat = calculateVatBreakdown({
        amount: 648,
        pricingMode: 'inclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      batch.set(si1, {
        recordNumber: 'SI-2026-001',
        supplierName: 'David Whitehead Textiles Zimbabwe',
        supplierTaxPin: 'BP 0200109381',
        supplierTin: '2000109381',
        supplierVatReg: '10010938',
        isVatRegistered: true,
        supplierInvoiceNo: 'FDMS-DW-44910',
        category: 'Tailoring & Trims',
        jobId: j1.id,
        jobNumber: 'MP-2026-1041',
        invoiceDate: today,
        dueDate: in10Days,
        pricingMode: 'inclusive',
        vatTreatment: 'standard',
        isVatClaimable: true,
        vatRate,
        lines: [
          {
            description: '240gsm Lacoste Cotton Pique Rolls & Reflective Trim',
            quantity: 120,
            unitPrice: 5.4,
            vatTreatment: 'standard',
            netAmount: si1Vat.netAmount,
            vatAmount: si1Vat.vatAmount,
            grossAmount: si1Vat.grossAmount,
          },
        ],
        standardNetAmount: si1Vat.netAmount,
        zeroRatedAmount: 0,
        exemptAmount: 0,
        netAmount: si1Vat.netAmount,
        vatAmount: si1Vat.vatAmount,
        grossAmount: si1Vat.grossAmount,
        whtApplicable: false,
        whtRate: 0,
        whtAmount: 0,
        whtRemitted: false,
        amountPaid: si1Vat.grossAmount,
        balanceDue: 0,
        status: 'Paid',
        paymentMethod: 'CBZ Nostro USD',
        paymentReference: 'RTGS-20941',
        notes: 'Valid ZIMRA fiscalized supplier tax invoice verified for Input VAT claim.',
        ownerUid: user.uid,
        viewerUids: hrUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const si2 = doc(collection(db, 'supplierInvoices'));
      const si2Vat = calculateVatBreakdown({
        amount: 720,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        vatRate,
      });
      batch.set(si2, {
        recordNumber: 'SI-2026-002',
        supplierName: '3M & Graphics Zimbabwe',
        supplierTaxPin: 'BP 0200332819',
        supplierTin: '2000332819',
        supplierVatReg: '10033281',
        isVatRegistered: true,
        supplierInvoiceNo: 'FDMS-883421',
        category: 'Materials & Substrates',
        jobId: j4.id,
        jobNumber: 'MP-2026-1044',
        invoiceDate: today,
        dueDate: in10Days,
        pricingMode: 'exclusive',
        vatTreatment: 'standard',
        isVatClaimable: true,
        vatRate,
        lines: [
          {
            description: '3M IJ180mC Cast Wrap Vinyl Rolls + Gloss Overlaminate',
            quantity: 4,
            unitPrice: 180,
            vatTreatment: 'standard',
            netAmount: si2Vat.netAmount,
            vatAmount: si2Vat.vatAmount,
            grossAmount: si2Vat.grossAmount,
          },
        ],
        standardNetAmount: si2Vat.netAmount,
        zeroRatedAmount: 0,
        exemptAmount: 0,
        netAmount: si2Vat.netAmount,
        vatAmount: si2Vat.vatAmount,
        grossAmount: si2Vat.grossAmount,
        whtApplicable: false,
        whtRate: 0,
        whtAmount: 0,
        whtRemitted: false,
        amountPaid: round2(si2Vat.grossAmount * 0.5),
        balanceDue: round2(si2Vat.grossAmount * 0.5),
        status: 'Part Paid',
        paymentMethod: 'ZIPIT',
        paymentReference: 'ZIPIT-66201',
        notes: '50% supplier deposit cleared; balance due on wrap film delivery.',
        ownerUid: user.uid,
        viewerUids: hrUids,
        isVatReportable: true,
        vatViewerUids: vatAuditorUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Inventory & Samples
      const invItem1 = doc(collection(db, 'inventoryItems'));
      batch.set(invItem1, {
        sku: 'INK-ECO-CYN',
        name: 'Eco-Solvent Cyan Ink Cartridge 1L',
        itemType: 'Consumable',
        unit: 'Litres',
        quantityOnHand: 4,
        reorderLevel: 6,
        unitCost: 48,
        location: 'Large Format Print Bay A1',
        supplierName: 'Harare Print & Substrate Supplies',
        sampleClientOrSpec: '',
        status: 'Low Stock',
        notes: 'Reorder triggered below 6L for Roland / Mimaki wide-format plotters.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(collection(db, `inventoryItems/${invItem1.id}/movements`)), {
        itemId: invItem1.id,
        movementType: 'Stock In',
        quantityDelta: 4,
        resultingQty: 4,
        jobId: '',
        jobNumber: '',
        recipientOrReason: 'Initial warehouse count',
        loggedByName: trimStr(profile.displayName, 120) || 'Management',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
      });

      const invItem2 = doc(collection(db, 'inventoryItems'));
      batch.set(invItem2, {
        sku: 'FAB-LAC-240',
        name: '240gsm Cotton Pique Navy Fabric Roll',
        itemType: 'Substrate & Fabric',
        unit: 'Meters',
        quantityOnHand: 185,
        reorderLevel: 50,
        unitCost: 5.2,
        location: 'Tailoring Store Rack B3',
        supplierName: 'David Whitehead Textiles Zimbabwe',
        sampleClientOrSpec: '',
        status: 'In Stock',
        notes: 'Standard corporate polo shirt fabric.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const invItem3 = doc(collection(db, 'inventoryItems'));
      batch.set(invItem3, {
        sku: 'SMP-POLO-KIT',
        name: 'Corporate Polo & Embroidery Swatch Kit',
        itemType: 'Sample',
        unit: 'Kits',
        quantityOnHand: 6,
        reorderLevel: 2,
        unitCost: 22,
        location: 'Harare Showroom Cabinet S1',
        supplierName: 'In-House Sample Room',
        sampleClientOrSpec: 'Msasa Logistics / 2 kits checked out for client fitting',
        status: 'In Stock',
        notes: 'Includes S–XXL fit samples plus thread Pantone swatch card.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const invItem4 = doc(collection(db, 'inventoryItems'));
      batch.set(invItem4, {
        sku: 'TRM-REF-50M',
        name: 'High-Visibility Reflective Tape 50mm',
        itemType: 'Packaging & Trims',
        unit: 'Rolls',
        quantityOnHand: 0,
        reorderLevel: 5,
        unitCost: 14.5,
        location: 'Tailoring Store Drawer C4',
        supplierName: 'David Whitehead Textiles Zimbabwe',
        sampleClientOrSpec: '',
        status: 'Out of Stock',
        notes: 'Consumed on MP-2026-1041; urgent replenishment pending.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Goods Received Notes (GRN)
      const grn1 = doc(collection(db, 'goodsReceipts'));
      batch.set(grn1, {
        grnNumber: 'GRN-2026-001',
        supplierName: 'David Whitehead Textiles Zimbabwe',
        deliveryNoteRef: 'DN-DW-8812',
        supplierInvoiceId: si1.id,
        supplierInvoiceNo: 'FDMS-DW-44910',
        jobId: j1.id,
        jobNumber: 'MP-2026-1041',
        receivedDate: today,
        receivedByName: trimStr(profile.displayName, 120) || 'Stores Lead',
        conditionStatus: 'Accepted',
        items: [
          {
            inventoryItemId: invItem2.id,
            sku: 'FAB-LAC-240',
            description: '240gsm Cotton Pique Navy Fabric Roll',
            quantityOrdered: 120,
            quantityReceived: 120,
            unit: 'Meters',
            unitCost: 5.2,
          },
        ],
        totalValue: 624,
        postToInventory: true,
        notes: 'Weight, shade & roll meterage verified at Workington receiving bay.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const grn2 = doc(collection(db, 'goodsReceipts'));
      batch.set(grn2, {
        grnNumber: 'GRN-2026-002',
        supplierName: 'Harare Print & Substrate Supplies',
        deliveryNoteRef: 'WAY-HPS-4091',
        supplierInvoiceId: '',
        supplierInvoiceNo: '',
        jobId: j3.id,
        jobNumber: 'MP-2026-1043',
        receivedDate: today,
        receivedByName: trimStr(profile.displayName, 120) || 'Stores Lead',
        conditionStatus: 'Partial / Short',
        items: [
          {
            inventoryItemId: invItem1.id,
            sku: 'INK-ECO-CYN',
            description: 'Eco-Solvent Cyan Ink Cartridge 1L',
            quantityOrdered: 6,
            quantityReceived: 4,
            unit: 'Litres',
            unitCost: 48,
          },
        ],
        totalValue: 192,
        postToInventory: true,
        notes: '4 litres received; 2 litres backordered for Friday courier.',
        ownerUid: user.uid,
        staffUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Cash Book Ledger Entries (Linked to Zimbabwean Banks & EcoCash)
      const cb1 = doc(collection(db, 'cashBookEntries'));
      batch.set(cb1, {
        entryNumber: 'CB-2026-001',
        entryDate: today,
        entryType: 'Receipt (Inflow)',
        account: 'CBZ Nostro USD Account',
        counterparty: 'ZimTech Summit Harare',
        category: 'Customer Receipt',
        reference: 'ZIPIT-884120',
        linkedDocRef: 'INV-2026-081',
        amount: j3Vat.grossAmount,
        reconciled: true,
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: 'Full invoice settlement cleared in CBZ Nostro USD statement.',
        ownerUid: user.uid,
        viewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const cb2 = doc(collection(db, 'cashBookEntries'));
      batch.set(cb2, {
        entryNumber: 'CB-2026-002',
        entryDate: today,
        entryType: 'Receipt (Inflow)',
        account: 'EcoCash Merchant Till',
        counterparty: 'Msasa Logistics (Pvt) Ltd',
        category: 'Customer Receipt',
        reference: 'EC260419.8821',
        linkedDocRef: 'INV-2026-082',
        amount: inv2Deposit,
        reconciled: true,
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: '50% job deposit received via EcoCash Merchant Till.',
        ownerUid: user.uid,
        viewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const cb3 = doc(collection(db, 'cashBookEntries'));
      batch.set(cb3, {
        entryNumber: 'CB-2026-003',
        entryDate: today,
        entryType: 'Payment (Outflow)',
        account: 'CBZ Nostro USD Account',
        counterparty: 'David Whitehead Textiles Zimbabwe',
        category: 'Supplier Payment',
        reference: 'RTGS-20941',
        linkedDocRef: 'FDMS-DW-44910',
        amount: si1Vat.grossAmount,
        reconciled: false,
        recordedByName: trimStr(profile.displayName, 120) || 'Accounts',
        notes: 'Payment for 240gsm cotton pique fabric rolls.',
        ownerUid: user.uid,
        viewerUids: hrUids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'seedSampleData');
    }
  };

  return {
    loading,
    settings,
    users,
    userInvites,
    chartOfAccounts,
    clients,
    jobs,
    invoices,
    expenses,
    supplierInvoices,
    inventoryItems,
    goodsReceipts,
    requisitions,
    cashBookEntries,
    suppliers,
    openingBalances,
    migrationRuns,
    employees,
    timeEntries,
    leaveRequests,
    payrollRuns,
    notes,
    updateCompanySettings,
    updateUserAccess,
    syncZimraVatScope,
    createChartAccount,
    updateChartAccount,
    deleteChartAccount,
    seedDefaultChartOfAccounts,
    createUserInvite,
    updateUserInviteStatus,
    deleteUserInvite,
    createClient,
    updateClient,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    executeLegacyImport,
    subscribeMigrationRunDetails,
    createJob,
    updateJob,
    deleteJob,
    updateJobCommission,
    payJobCommission,
    addJobCostEntry,
    subscribeJobCosts,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    recordInvoicePayment,
    updateInvoiceStatus,
    createExpense,
    updateExpense,
    deleteExpense,
    toggleExpensePaymentStatus,
    createSupplierInvoice,
    updateSupplierInvoice,
    recordSupplierPayment,
    markSupplierWhtRemitted,
    updateSupplierInvoiceVatStatus,
    deleteSupplierInvoice,
    createInventoryItem,
    adjustInventoryStock,
    deleteInventoryItem,
    subscribeInventoryMovements,
    createGoodsReceipt,
    updateGoodsReceipt,
    deleteGoodsReceipt,
    createRequisition,
    updateRequisition,
    reviewRequisition,
    fulfillRequisition,
    deleteRequisition,
    createCashBookEntry,
    updateCashBookEntry,
    toggleCashBookReconciled,
    deleteCashBookEntry,
    createEmployee,
    createTimeEntry,
    updateTimeEntry,
    createLeaveRequest,
    reviewLeaveRequest,
    createPayrollRun,
    createNote,
    togglePinNote,
    deleteNote,
    seedSampleData,
  };
}
