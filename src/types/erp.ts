export type UserRole = 'management' | 'sales' | 'accounts' | 'production';

export type Department = 'Management' | 'Sales & Marketing' | 'Accounts' | 'Production';

export type ServiceCategory = 'Printing' | 'Branding' | 'Corporate Wear' | 'Tailoring';

export type JobStatus =
  | 'Quoted'
  | 'Approved'
  | 'In Production'
  | 'Quality Control'
  | 'Ready for Dispatch'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled';

export type JobPriority = 'Standard' | 'Urgent' | 'Express';

export type PricingMode = 'exclusive' | 'inclusive';

export type VatTreatment = 'standard' | 'zero' | 'exempt';

export type InvoiceStatus = 'Draft' | 'Issued' | 'Part Paid' | 'Paid' | 'Overdue' | 'Void';

export type ExpenseCategory =
  | 'Materials & Substrates'
  | 'Tailoring & Trims'
  | 'Payroll & Wages'
  | 'Utilities & Rent'
  | 'Equipment & Maintenance'
  | 'Logistics & Delivery'
  | 'Marketing & Admin';

export type CostType = 'Material' | 'Labor' | 'Subcontract' | 'Overhead';

export type EmploymentType = 'Full-Time' | 'Contract' | 'Casual';

export type LeaveType = 'Annual' | 'Sick' | 'Compassionate' | 'Unpaid';

export type NavSection =
  | 'dashboard'
  | 'jobs'
  | 'job-cards'
  | 'clients'
  | 'inventory'
  | 'goods-received'
  | 'invoices'
  | 'supplier-invoices'
  | 'cash-book'
  | 'accounting'
  | 'reports'
  | 'time-tracking'
  | 'hr'
  | 'my-account'
  | 'settings';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: Department;
  status: 'active' | 'pending' | 'disabled';
  commissionRatePct?: number;
  inviteId?: string;
  adminUids?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tagline: string;
  taxPin: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  defaultVatRate: number;
  defaultCommissionRatePct?: number;
  defaultCommissionBasis?: CommissionBasis;
  logoDataUrl?: string;
  ownerUid: string;
  updatedAt?: unknown;
}

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  taxPin: string;
  address: string;
  paymentTermsDays: number;
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SizeBreakdown {
  XS: number;
  S: number;
  M: number;
  L: number;
  XL: number;
  XXL: number;
  XXXL: number;
  Custom: number;
}

export interface ProductionChecklist {
  prePressOrPattern: boolean;
  materialsIssued: boolean;
  printingOrTailoring: boolean;
  qualityControl: boolean;
  dispatchReady: boolean;
}

export interface Job {
  id: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  title: string;
  category: ServiceCategory;
  status: JobStatus;
  priority: JobPriority;
  dueDate: string;
  printMethod: string;
  substrateOrFabric: string;
  colorSpecs: string;
  quantity: number;
  sizeBreakdown: SizeBreakdown;
  artworkNotes: string;
  tailoringMeasurements: string;
  checklist: ProductionChecklist;
  pricingMode: PricingMode;
  vatTreatment: VatTreatment;
  vatRate: number;
  unitPrice: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  estimatedMaterialCost: number;
  estimatedLaborCost: number;
  estimatedSubcontractCost: number;
  estimatedOverheadCost: number;
  actualCostTotal: number;
  assignedSalesUid?: string;
  assignedSalesName: string;
  assignedProductionName: string;
  commissionRatePct?: number;
  commissionBasis?: CommissionBasis;
  commissionAmount?: number;
  commissionStatus?: CommissionStatus;
  commissionPaidDate?: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CommissionBasis = 'net_sales' | 'gross_profit';
export type CommissionStatus = 'Pending' | 'Earned' | 'Approved' | 'Paid';

export interface JobCostEntry {
  id: string;
  jobId: string;
  costType: CostType;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  loggedByName: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  vatTreatment: VatTreatment;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId: string;
  jobNumber: string;
  clientId: string;
  clientName: string;
  clientVatPin: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  pricingMode: PricingMode;
  vatRate: number;
  lines: InvoiceLine[];
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  vendorName: string;
  vendorVatPin: string;
  vendorInvoiceRef: string;
  category: ExpenseCategory;
  jobId: string;
  expenseDate: string;
  isVatClaimable: boolean;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  paymentStatus: 'Paid' | 'Payable';
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  department: Department;
  jobTitle: string;
  employmentType: EmploymentType;
  hourlyRate: number;
  monthlySalary: number;
  taxDeductionRate: number;
  annualLeaveBalance: number;
  sickLeaveBalance: number;
  status: 'Active' | 'On Leave' | 'Inactive';
  userUid: string;
  ownerUid: string;
  hrViewerUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  jobId: string;
  jobNumber: string;
  date: string;
  clockInIso: string;
  clockOutIso: string;
  breakMinutes: number;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  hourlyRate: number;
  laborCost: number;
  status: 'Clocked In' | 'Completed' | 'Approved';
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  reviewedByName: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PayrollRun {
  id: string;
  periodLabel: string;
  payDate: string;
  employeeCount: number;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  status: 'Draft' | 'Approved' | 'Paid';
  notes: string;
  ownerUid: string;
  hrViewerUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type NoteAudience = 'All Staff' | 'Production' | 'Sales & Marketing' | 'Accounts';

export type NoteTone = 'amber' | 'sky' | 'emerald' | 'slate';

export interface OperationalNote {
  id: string;
  title: string;
  body: string;
  audience: NoteAudience;
  tone: NoteTone;
  pinned: boolean;
  authorName: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SupplierInvoiceCategory =
  | 'Materials & Substrates'
  | 'Tailoring & Trims'
  | 'Subcontracting & Finishing'
  | 'Equipment & Maintenance'
  | 'Logistics & Delivery'
  | 'Utilities & Rent'
  | 'Marketing & Admin';

export type SupplierInvoiceStatus = 'Unpaid' | 'Part Paid' | 'Paid' | 'Disputed';

export interface SupplierInvoice {
  id: string;
  recordNumber: string;
  supplierName: string;
  supplierTaxPin: string;
  supplierInvoiceNo: string;
  category: SupplierInvoiceCategory;
  jobId: string;
  jobNumber: string;
  invoiceDate: string;
  dueDate: string;
  pricingMode: PricingMode;
  vatTreatment: VatTreatment;
  isVatClaimable: boolean;
  vatRate: number;
  lines: InvoiceLine[];
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: SupplierInvoiceStatus;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  ownerUid: string;
  viewerUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type InventoryItemType =
  | 'Consumable'
  | 'Substrate & Fabric'
  | 'Sample'
  | 'Packaging & Trims'
  | 'Finished Stock';

export type InventoryStockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export type InventoryMovementType =
  | 'Stock In'
  | 'Issue to Job'
  | 'Sample Out'
  | 'Sample Return'
  | 'Adjustment';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  itemType: InventoryItemType;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  location: string;
  supplierName: string;
  sampleClientOrSpec: string;
  status: InventoryStockStatus;
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  resultingQty: number;
  jobId: string;
  jobNumber: string;
  recipientOrReason: string;
  loggedByName: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
}

export type GoodsReceiptCondition = 'Accepted' | 'Partial / Short' | 'Damaged / Rejected';

export interface GoodsReceiptLine {
  inventoryItemId: string;
  sku: string;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  unit: string;
  unitCost: number;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  supplierName: string;
  deliveryNoteRef: string;
  supplierInvoiceId: string;
  supplierInvoiceNo: string;
  jobId: string;
  jobNumber: string;
  receivedDate: string;
  receivedByName: string;
  conditionStatus: GoodsReceiptCondition;
  items: GoodsReceiptLine[];
  totalValue: number;
  postToInventory: boolean;
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CashBookEntryType =
  | 'Receipt (Inflow)'
  | 'Payment (Outflow)'
  | 'Contra / Transfer';

export type CashBookAccount = string;

export const DEFAULT_ZIM_CASH_ACCOUNTS = [
  'CBZ Nostro USD Account',
  'Stanbic ZiG Operating Account',
  'EcoCash Merchant Till',
  'USD Cash Drawer',
  'Petty Cash Float',
] as const;

export type CashBookCategory =
  | 'Customer Receipt'
  | 'Supplier Payment'
  | 'Wages & Casuals'
  | 'Sales Commission'
  | 'Transport & Fuel'
  | 'Workshop Petty Cash'
  | 'Bank Deposit / Transfer'
  | 'Other Operating';

export interface CashBookEntry {
  id: string;
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
  recordedByName: string;
  notes: string;
  ownerUid: string;
  viewerUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ChartAccountType =
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Revenue'
  | 'Expense';

export type ChartAccountSubType =
  | 'Bank'
  | 'Mobile Money'
  | 'Cash'
  | 'Receivable'
  | 'Payable'
  | 'Tax / VAT'
  | 'Operating'
  | 'COGS'
  | 'Payroll';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  accountType: ChartAccountType;
  subType: ChartAccountSubType;
  currency: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  openingBalance: number;
  isCashBookAccount: boolean;
  isActive: boolean;
  notes: string;
  ownerUid: string;
  staffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type UserInviteStatus = 'invited' | 'accepted' | 'revoked';

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  department: Department;
  commissionRatePct: number;
  status: UserInviteStatus;
  invitedByName: string;
  acceptedUid: string;
  ownerUid: string;
  adminUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}
