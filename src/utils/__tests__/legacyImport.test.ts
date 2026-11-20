import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionIntents,
  extractOldCustomerIdFromNotes,
  filterPlanForExecution,
  normalizePaymentTermsDays,
  parseAndPlanLegacyImport,
  planCoaEntries,
  type ExistingErpSnapshot,
  type LegacyImportRootPayload,
} from '../legacyImport';
import type {
  ChartAccount,
  Client,
  Job,
  OpeningBalanceRecord,
  Supplier,
  SupplierInvoice,
} from '../../types/erp';

function makeEmptySnapshot(): ExistingErpSnapshot {
  return {
    clients: [],
    suppliers: [],
    chartOfAccounts: [],
    jobs: [],
    invoices: [],
    supplierInvoices: [],
    openingBalances: [],
  };
}

function makeBaselinePayload(): LegacyImportRootPayload {
  return {
    version: 1,
    asOfDate: '2026-06-30',
    sourceSystem: 'SyntheticLegacyBook',
    targetSystem: 'MegaprintERP',
    counts: {
      customers: 2,
      suppliers: 1,
      accounts: 4,
      pendingJobs: 2,
      receivableInvoices: 1,
      customerCredits: 1,
      supplierPayables: 2,
      systemUserReferences: 2,
    },
    controls: {
      receivablesUSD: 350.25,
      unappliedCustomerCreditsUSD: 40.0,
      supplierPayablesUSD: 275.5,
      trialBalanceDebitUSD: 1250.0,
      trialBalanceCreditUSD: 1250.0,
    },
    alreadyCreatedInTarget: [
      { name: 'Synthetic Alpha Co', status: 'Entered manually before cutover' },
    ],
    constraints: [
      'Preserve zero-day payment terms exactly.',
      'Do not fabricate missing production line specs.',
    ],
    data: {
      customers: [
        {
          sourceId: 'syn-cust-001',
          name: 'Synthetic Alpha Co',
          phone: '+263770000111',
          email: 'alpha@synthetic.example',
          vatRegistrationNumber: 'VAT-SYN-01',
          address: '10 Synthetic Way',
          primaryContact: null,
          legacyPricingMode: 'legacy_tier_a',
          creditApproved: true,
          creditLimitUSD: 1500,
          paymentTermsDays: 0,
        },
        {
          sourceId: 'syn-cust-002',
          name: 'Synthetic Beta Studio',
          phone: null,
          email: null,
          vatRegistrationNumber: null,
          address: null,
          primaryContact: null,
          legacyPricingMode: 'cash_only',
          creditApproved: false,
          creditLimitUSD: 0,
          paymentTermsDays: 0,
        },
      ],
      suppliers: [
        {
          sourceKey: 'syn-sup-001',
          name: 'Synthetic Paper Mill',
          phone: null,
          email: 'ap@papermill.example',
          address: null,
        },
      ],
      accounts: [
        {
          sourceCode: '1200',
          name: 'Trade Receivables Control',
          type: 'Accounts Receivable',
          parentCode: null,
          currency: 'USD',
          active: true,
          normalSideBalanceUSD: 829.45,
          trialDebitUSD: 829.45,
          trialCreditUSD: 0,
        },
        {
          sourceCode: '2150',
          name: 'Signed Liability Adjustment',
          type: 'Other Current Liability',
          parentCode: '2000',
          currency: 'USD',
          active: true,
          normalSideBalanceUSD: -420.55,
          trialDebitUSD: 420.55,
          trialCreditUSD: 0,
        },
        {
          sourceCode: '3100',
          name: 'Accumulated Deficit Reserve',
          type: 'Equity',
          parentCode: null,
          currency: 'USD',
          active: true,
          normalSideBalanceUSD: -1250.0,
          trialDebitUSD: 0,
          trialCreditUSD: 1250.0,
        },
        {
          sourceCode: '6100',
          name: 'Legacy Press Maintenance',
          type: 'Expense',
          parentCode: '6000',
          currency: 'Multiple',
          active: true,
          normalSideBalanceUSD: 0,
          trialDebitUSD: 0,
          trialCreditUSD: 0,
        },
      ],
      pendingJobs: [
        {
          sourceReference: 'SYN-JOB-100',
          customerSourceId: 'syn-cust-001',
          customerName: 'Synthetic Alpha Co',
          division: 'Large Format Printing',
          valueUSD: 480.0,
          dueDate: '2026-07-10',
          sourceStatus: 'In Production',
          preparedBy: 'Synthetic Estimator',
          salesOwner: null,
          lineSpecifications: null,
        },
        {
          sourceReference: 'SYN-JOB-101',
          customerSourceId: 'syn-cust-002',
          customerName: 'Synthetic Beta Studio',
          division: 'Corporate Wear',
          valueUSD: 220.0,
          dueDate: null,
          sourceStatus: 'Completed',
          preparedBy: 'Synthetic Estimator',
          salesOwner: 'Synthetic Rep',
          lineSpecifications: [{ item: 'Polo Embroidery', qty: 10 }],
        },
      ],
      receivables: [
        {
          sourceInvoiceReference: 'SYN-INV-0901',
          customerSourceId: 'syn-cust-001',
          customerName: 'Synthetic Alpha Co',
          dueDate: '2026-06-15',
          outstandingUSD: 350.25,
          originalNetAndVATSplit: null,
          migrationTreatment: 'Opening receivable (non-VAT historical)',
        },
      ],
      customerCredits: [
        {
          customerSourceId: 'syn-cust-002',
          customerName: 'Synthetic Beta Studio',
          unappliedCreditUSD: 40.0,
        },
      ],
      supplierPayables: [
        {
          sourceReference: 'SYN-BILL-701',
          supplierName: 'Synthetic Paper Mill',
          recordedDate: '2026-06-20',
          dueDate: '2026-07-20',
          outstandingUSD: 190.5,
          kind: 'invoice',
          status: 'Unpaid',
          targetDuplicate: { matchedInTarget: false, candidateRef: 'SUP-INV-009' },
          notes: 'Synthetic paper stock bill',
        },
        {
          sourceReference: 'SYN-ACC-002',
          supplierName: 'Synthetic Freelance Studio',
          recordedDate: '2026-06-28',
          outstandingUSD: 85.0,
          kind: 'accrual',
          status: 'Accrued',
          memo: 'Unbilled finishing accrual',
        },
      ],
      systemUserReferences: [
        {
          sourceUserId: 'usr-syn-99',
          displayName: 'Synthetic Preparer',
          recordType: 'legacy_reference_only',
          employeeRecordAvailable: false,
          createLoginOrInvite: false,
        },
        {
          text: 'Synthetic Legacy Approver',
          value: 'usr-syn-100',
        },
      ],
      liabilityBalances: [
        ['Account', 'Balance USD'],
        ['Trade Creditors', '275.50'],
      ],
      payableLedger: [
        ['Supplier', 'Reference', 'Outstanding USD'],
        ['Synthetic Paper Mill', 'SYN-BILL-701', '190.50'],
      ],
    },
  };
}

test('normalizePaymentTermsDays preserves numeric 0 and falls back only on empty/nullish values', () => {
  assert.equal(normalizePaymentTermsDays(0, 30), 0);
  assert.equal(normalizePaymentTermsDays('0', 30), 0);
  assert.equal(normalizePaymentTermsDays(undefined, 30), 30);
  assert.equal(normalizePaymentTermsDays(null, 30), 30);
  assert.equal(normalizePaymentTermsDays('', 30), 30);
  assert.equal(normalizePaymentTermsDays(14, 30), 14);
});

test('extractOldCustomerIdFromNotes parses UUIDs and alphanumeric source IDs', () => {
  assert.equal(
    extractOldCustomerIdFromNotes('Migrated manually. Old customer ID: 7f8e9a10-1234-5678-abcd-001122334455'),
    '7f8e9a10-1234-5678-abcd-001122334455'
  );
  assert.equal(extractOldCustomerIdFromNotes('No legacy reference here'), null);
});

test('accepts signed normalSideBalanceUSD, input aliases, null VAT splits, and unextracted jobs cleanly', () => {
  const payload = makeBaselinePayload();
  const plan = parseAndPlanLegacyImport(payload, makeEmptySnapshot());

  assert.equal(plan.validStructure, true);
  assert.equal(plan.controlsVerified, true);
  assert.equal(plan.canImport, true, `Unexpected blocking errors: ${plan.blockingErrors.join(' | ')}`);
  assert.equal(plan.blockingErrors.length, 0);

  // Signed normal-side balances preserved accurately
  const signedLiability = plan.accounts.find((a) => a.sourceKey === '2150');
  const signedEquity = plan.accounts.find((a) => a.sourceKey === '3100');
  assert.ok(signedLiability);
  assert.ok(signedEquity);
  assert.equal(signedLiability.action, 'create');
  assert.equal(signedLiability.normalSideBalanceUSD, -420.55);
  assert.equal(signedEquity.action, 'create');
  assert.equal(signedEquity.normalSideBalanceUSD, -1250.0);

  // Blank customer contacts & zero payment terms preserved
  const beta = plan.customers.find((c) => c.sourceKey === 'syn-cust-002');
  assert.ok(beta);
  assert.equal(beta.resolvedContactName, '');
  assert.equal(beta.resolvedEmail, '');
  assert.equal(beta.resolvedPhone, '');
  assert.equal(beta.resolvedPaymentTermsDays, 0);

  // System user references accept both sourceUserId/displayName & value/text without creating invites
  assert.equal(plan.systemUserReferences.length, 2);
  assert.deepEqual(plan.systemUserReferences[0], {
    text: 'Synthetic Preparer',
    value: 'usr-syn-99',
    recordType: 'legacy_reference_only',
    employeeRecordAvailable: false,
    createLoginOrInvite: false,
  });
  assert.deepEqual(plan.systemUserReferences[1], {
    text: 'Synthetic Legacy Approver',
    value: 'usr-syn-100',
  });

  // Supplier payables classify kind='accrual' vs kind='invoice' and preserve kind + targetDuplicate
  const spInv = plan.supplierPayables.find((p) => p.sourceReference === 'SYN-BILL-701');
  const spAcc = plan.supplierPayables.find((p) => p.sourceReference === 'SYN-ACC-002');
  assert.ok(spInv);
  assert.ok(spAcc);
  assert.equal(spInv.recordType, 'supplier_payable_invoice');
  assert.equal(spInv.preservedMetadata.kind, 'invoice');
  assert.ok(spInv.preservedMetadata.targetDuplicate.includes('SUP-INV-009'));
  assert.equal(spAcc.recordType, 'supplier_opening_accrual');
  assert.equal(spAcc.preservedMetadata.kind, 'accrual');

  // Pending jobs handle lineSpecifications: null vs populated array explicitly
  const unextractedJob = plan.pendingJobs.find((j) => j.sourceKey === 'SYN-JOB-100');
  const extractedJob = plan.pendingJobs.find((j) => j.sourceKey === 'SYN-JOB-101');
  assert.ok(unextractedJob);
  assert.ok(extractedJob);
  assert.equal(unextractedJob.legacyLinesExtracted, false);
  assert.equal(unextractedJob.lineSpecsCount, 0);
  assert.equal(unextractedJob.valueUSD, 480.0);
  assert.equal(extractedJob.legacyLinesExtracted, true);
  assert.equal(extractedJob.lineSpecsCount, 1);

  // Net receivables & controls reconciliation
  assert.equal(plan.reconciliation.grossReceivablesUSD, 350.25);
  assert.equal(plan.reconciliation.unappliedCreditsUSD, 40.0);
  assert.equal(plan.reconciliation.netReceivablesUSD, 310.25);
  assert.equal(plan.reconciliation.importedPayablesUSD, 190.5);
  assert.equal(plan.reconciliation.accrualPayablesUSD, 85.0);
});

test('blocks negative trial columns, receivables, credits, payables, and control mismatches', () => {
  const base = makeBaselinePayload();

  // Negative trialDebitUSD must still fail
  const negTrial = structuredClone(base);
  negTrial.data.accounts[0].trialDebitUSD = -10;
  const negTrialPlan = parseAndPlanLegacyImport(negTrial, makeEmptySnapshot());
  assert.equal(negTrialPlan.canImport, false);
  assert.equal(negTrialPlan.accounts[0].action, 'blocked');

  // Negative trialCreditUSD must fail
  const negCreditTrial = structuredClone(base);
  negCreditTrial.data.accounts[2].trialCreditUSD = -5;
  const negCreditTrialPlan = parseAndPlanLegacyImport(negCreditTrial, makeEmptySnapshot());
  assert.equal(negCreditTrialPlan.canImport, false);
  assert.equal(negCreditTrialPlan.accounts[2].action, 'blocked');

  // Negative receivable outstandingUSD must fail
  const negRec = structuredClone(base);
  negRec.data.receivables[0].outstandingUSD = -100;
  const negRecPlan = parseAndPlanLegacyImport(negRec, makeEmptySnapshot());
  assert.equal(negRecPlan.canImport, false);
  assert.equal(negRecPlan.receivables[0].action, 'blocked');

  // Negative customer credit must fail
  const negCred = structuredClone(base);
  negCred.data.customerCredits[0].unappliedCreditUSD = -20;
  const negCredPlan = parseAndPlanLegacyImport(negCred, makeEmptySnapshot());
  assert.equal(negCredPlan.canImport, false);
  assert.equal(negCredPlan.customerCredits[0].action, 'blocked');

  // Negative supplier payable must fail
  const negPay = structuredClone(base);
  negPay.data.supplierPayables[0].outstandingUSD = -50;
  const negPayPlan = parseAndPlanLegacyImport(negPay, makeEmptySnapshot());
  assert.equal(negPayPlan.canImport, false);
  assert.equal(negPayPlan.supplierPayables[0].action, 'blocked');

  // Mismatched counts.receivableInvoices must fail
  const badCount = structuredClone(base);
  badCount.counts = { ...badCount.counts, receivableInvoices: 99 };
  const badCountPlan = parseAndPlanLegacyImport(badCount, makeEmptySnapshot());
  assert.equal(badCountPlan.canImport, false);
  assert.ok(badCountPlan.blockingErrors.some((e) => e.includes('receivableInvoices')));

  // Mismatched controls must block import
  const badCtrl = structuredClone(base);
  badCtrl.controls.receivablesUSD = 999.99;
  const badCtrlPlan = parseAndPlanLegacyImport(badCtrl, makeEmptySnapshot());
  assert.equal(badCtrlPlan.controlsVerified, false);
  assert.equal(badCtrlPlan.canImport, false);
});

test('matches pre-entered customers via Account Notes and blocks ambiguous matches', () => {
  const payload = makeBaselinePayload();
  const snapshot = makeEmptySnapshot();
  snapshot.clients = [
    {
      id: 'native-cli-1',
      companyName: 'Synthetic Alpha Co',
      contactName: '',
      email: 'alpha@synthetic.example',
      phone: '+263770000111',
      taxPin: '',
      vatRegNumber: 'VAT-SYN-01',
      address: '10 Synthetic Way',
      paymentTermsDays: 0,
      notes: 'Pre-entered record. Old customer ID: syn-cust-001',
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    } as Client,
  ];

  const plan = parseAndPlanLegacyImport(payload, snapshot);
  assert.equal(plan.canImport, true);
  const alpha = plan.customers.find((c) => c.sourceKey === 'syn-cust-001');
  assert.ok(alpha);
  assert.equal(alpha.action, 'match_update');
  assert.equal(alpha.docId, 'native-cli-1');

  // Ambiguous duplicate name in target blocks writes
  snapshot.clients.push(
    {
      id: 'native-cli-2',
      companyName: 'Synthetic Beta Studio',
      contactName: '',
      email: '',
      phone: '',
      taxPin: '',
      address: '',
      paymentTermsDays: 0,
      notes: '',
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    } as Client,
    {
      id: 'native-cli-3',
      companyName: 'Synthetic Beta Studio',
      contactName: '',
      email: '',
      phone: '',
      taxPin: '',
      address: '',
      paymentTermsDays: 0,
      notes: '',
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    } as Client
  );

  const ambigPlan = parseAndPlanLegacyImport(payload, snapshot);
  assert.equal(ambigPlan.canImport, false);
  const betaBlocked = ambigPlan.customers.find((c) => c.sourceKey === 'syn-cust-002');
  assert.ok(betaBlocked);
  assert.equal(betaBlocked.action, 'blocked');
});

test('remaps colliding Chart of Accounts codes cleanly and maps 1200/2100 to native control accounts', () => {
  const existingAccounts: ChartAccount[] = [
    {
      id: 'coa-native-ar',
      code: '1200',
      name: 'Accounts Receivable',
      accountType: 'Asset',
      subType: 'Receivable',
      currency: 'USD',
      bankName: '',
      accountNumber: '',
      branch: '',
      openingBalance: 100,
      isCashBookAccount: false,
      isActive: true,
      notes: '',
      ownerUid: 'u1',
      staffUids: ['u1'],
    },
    {
      id: 'coa-native-ap',
      code: '2100',
      name: 'Accounts Payable',
      accountType: 'Liability',
      subType: 'Payable',
      currency: 'USD',
      bankName: '',
      accountNumber: '',
      branch: '',
      openingBalance: 50,
      isCashBookAccount: false,
      isActive: true,
      notes: '',
      ownerUid: 'u1',
      staffUids: ['u1'],
    },
    {
      id: 'coa-native-6100',
      code: '6100',
      name: 'Direct Ink Purchases',
      accountType: 'Expense',
      subType: 'Operating',
      currency: 'USD',
      bankName: '',
      accountNumber: '',
      branch: '',
      openingBalance: 0,
      isCashBookAccount: false,
      isActive: true,
      notes: '',
      ownerUid: 'u1',
      staffUids: ['u1'],
    },
    {
      id: 'coa-native-1010',
      code: '1010',
      name: 'USD Cash Drawer',
      accountType: 'Asset',
      subType: 'Cash',
      currency: 'USD',
      bankName: '',
      accountNumber: '',
      branch: '',
      openingBalance: 500,
      isCashBookAccount: true,
      isActive: true,
      notes: '',
      ownerUid: 'u1',
      staffUids: ['u1'],
    },
  ];

  const planned = planCoaEntries(
    [
      {
        sourceCode: '1200',
        name: 'Trade Debtors Legacy',
        type: 'Accounts Receivable',
        currency: 'USD',
        normalSideBalanceUSD: 350,
        trialDebitUSD: 350,
        trialCreditUSD: 0,
      },
      {
        sourceCode: '2100',
        name: 'Trade Creditors Legacy',
        type: 'Accounts Payable',
        currency: 'USD',
        normalSideBalanceUSD: 200,
        trialDebitUSD: 0,
        trialCreditUSD: 200,
      },
      {
        sourceCode: '1010',
        name: 'Legacy Suspense Clearing',
        type: 'Asset',
        currency: 'USD',
        normalSideBalanceUSD: 0,
        trialDebitUSD: 0,
        trialCreditUSD: 0,
      },
      {
        sourceCode: '6100',
        name: 'Legacy Admin Repairs',
        type: 'Expense',
        currency: 'Multiple',
        normalSideBalanceUSD: 150,
        trialDebitUSD: 150,
        trialCreditUSD: 0,
      },
    ],
    existingAccounts
  );

  assert.equal(planned[0].mappingKind, 'map_native_control');
  assert.equal(planned[0].docId, 'coa-native-ar');
  assert.equal(planned[0].assignedCode, '1200');

  assert.equal(planned[1].mappingKind, 'map_native_control');
  assert.equal(planned[1].docId, 'coa-native-ap');
  assert.equal(planned[1].assignedCode, '2100');

  assert.equal(planned[2].mappingKind, 'create_collision_remapped');
  assert.equal(planned[2].assignedCode, 'LEG-1010');
  assert.equal(planned[2].source.sourceCode, '1010');

  assert.equal(planned[3].mappingKind, 'create_collision_remapped');
  assert.equal(planned[3].assignedCode, 'LEG-6100');
  assert.equal(planned[3].legacyCurrencyLabel, 'Multiple');
  assert.equal(planned[3].nativeCurrency, 'USD');
});

test('re-running the same payload produces skip_existing idempotency and retry filtering targets only failed keys', () => {
  const payload = makeBaselinePayload();
  const initialPlan = parseAndPlanLegacyImport(payload, makeEmptySnapshot());
  assert.equal(initialPlan.summaryCounts.toCreate > 0, true);

  // Build snapshot reflecting all records already written from initialPlan
  const completedSnapshot: ExistingErpSnapshot = {
    clients: initialPlan.customers.map((c) => ({
      id: c.docId,
      companyName: c.resolvedCompanyName,
      contactName: c.resolvedContactName,
      email: c.resolvedEmail,
      phone: c.resolvedPhone,
      taxPin: '',
      vatRegNumber: c.resolvedVatReg,
      address: c.resolvedAddress,
      paymentTermsDays: c.resolvedPaymentTermsDays,
      notes: c.resolvedNotes,
      legacySourceId: c.source.sourceId,
      legacyPricingMode: c.legacyPricingMode || undefined,
      creditApproved: c.creditApproved,
      creditLimitUSD: c.creditLimitUSD,
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    })),
    suppliers: initialPlan.suppliers.map((s): Supplier => ({
      id: s.docId,
      name: s.resolvedName,
      contactName: '',
      phone: s.resolvedPhone,
      email: s.resolvedEmail,
      address: s.resolvedAddress,
      notes: '',
      legacySourceKey: s.source.sourceKey,
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    })),
    chartOfAccounts: initialPlan.accounts.map((a): ChartAccount => ({
      id: a.docId,
      code: a.assignedCode,
      name: a.source.name,
      accountType: a.mappedAccountType,
      subType: a.mappedSubType,
      currency: a.nativeCurrency,
      bankName: '',
      accountNumber: '',
      branch: '',
      openingBalance: 0,
      isCashBookAccount: false,
      isActive: true,
      notes: '',
      legacySourceCode: a.source.sourceCode,
      legacyNormalBalanceUSD: a.normalSideBalanceUSD,
      legacyImported: true,
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    })),
    jobs: initialPlan.pendingJobs.map((j): Job => ({
      id: j.docId,
      jobNumber: `JOB-${j.sourceKey}`,
      clientId: j.resolvedClientId,
      clientName: j.resolvedClientName,
      title: j.sourceKey,
      category: j.mappedCategory,
      status: j.mappedStatus,
      priority: 'Standard',
      dueDate: j.source.dueDate || '',
      printMethod: '',
      substrateOrFabric: '',
      colorSpecs: '',
      quantity: j.legacyLinesExtracted ? 1 : 0,
      sizeBreakdown: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0, XXXL: 0, Custom: 0 },
      artworkNotes: '',
      tailoringMeasurements: '',
      checklist: {
        prePressOrPattern: false,
        materialsIssued: false,
        printingOrTailoring: false,
        qualityControl: false,
        dispatchReady: false,
      },
      pricingMode: 'exclusive',
      vatTreatment: j.legacyLinesExtracted ? 'exempt' : 'unknown',
      vatRate: 0,
      unitPrice: 0,
      netTotal: 0,
      vatAmount: 0,
      grossTotal: 0,
      estimatedMaterialCost: 0,
      estimatedLaborCost: 0,
      estimatedSubcontractCost: 0,
      estimatedOverheadCost: 0,
      actualCostTotal: 0,
      assignedSalesName: j.source.salesOwner || '',
      assignedProductionName: '',
      legacySourceReference: j.source.sourceReference,
      legacyValueUSD: j.valueUSD,
      legacyLinesExtracted: j.legacyLinesExtracted,
      ownerUid: 'owner-1',
      staffUids: ['owner-1'],
    })),
    invoices: [],
    supplierInvoices: [] as SupplierInvoice[],
    openingBalances: [
      ...initialPlan.receivables.map((r): OpeningBalanceRecord => ({
        id: r.docId,
        recordType: 'receivable',
        sourceKey: r.sourceKey,
        importRunId: initialPlan.runId,
        asOfDate: initialPlan.asOfDate,
        sourceReference: r.source.sourceInvoiceReference,
        counterpartyId: r.resolvedClientId,
        counterpartySourceId: r.source.customerSourceId,
        counterpartyName: r.resolvedClientName,
        recordedDate: initialPlan.asOfDate,
        dueDate: r.dueDate,
        outstandingUSD: r.outstandingUSD,
        migrationTreatment: r.migrationTreatment,
        sourceStatus: 'Open',
        matchedSupplierInvoiceId: '',
        matchedSupplierInvoiceNo: '',
        isMatchedExisting: false,
        notes: '',
        ownerUid: 'owner-1',
        viewerUids: ['owner-1'],
      })),
      ...initialPlan.customerCredits.map((c): OpeningBalanceRecord => ({
        id: c.docId,
        recordType: 'customer_credit',
        sourceKey: c.sourceKey,
        importRunId: initialPlan.runId,
        asOfDate: initialPlan.asOfDate,
        sourceReference: c.sourceKey,
        counterpartyId: c.resolvedClientId,
        counterpartySourceId: c.source.customerSourceId,
        counterpartyName: c.resolvedClientName,
        recordedDate: initialPlan.asOfDate,
        dueDate: '',
        outstandingUSD: c.unappliedCreditUSD,
        migrationTreatment: 'Unapplied credit',
        sourceStatus: 'Unapplied',
        matchedSupplierInvoiceId: '',
        matchedSupplierInvoiceNo: '',
        isMatchedExisting: false,
        notes: '',
        ownerUid: 'owner-1',
        viewerUids: ['owner-1'],
      })),
      ...initialPlan.supplierPayables.map((p): OpeningBalanceRecord => ({
        id: p.docId,
        recordType: p.recordType,
        sourceKey: p.sourceKey,
        importRunId: initialPlan.runId,
        asOfDate: initialPlan.asOfDate,
        sourceReference: p.sourceReference,
        counterpartyId: p.counterpartyId,
        counterpartySourceId: '',
        counterpartyName: p.supplierName,
        recordedDate: p.recordedDate,
        dueDate: p.dueDate,
        outstandingUSD: p.outstandingUSD,
        migrationTreatment: p.reason,
        sourceStatus: p.sourceStatus,
        matchedSupplierInvoiceId: p.matchedSupplierInvoiceId,
        matchedSupplierInvoiceNo: p.matchedSupplierInvoiceNo,
        isMatchedExisting: p.isMatchedExisting,
        notes: p.notes,
        ownerUid: 'owner-1',
        viewerUids: ['owner-1'],
      })),
    ],
  };

  const rerunPlan = parseAndPlanLegacyImport(payload, completedSnapshot);
  assert.equal(rerunPlan.canImport, true);
  assert.equal(rerunPlan.summaryCounts.toCreate, 0);
  assert.equal(rerunPlan.summaryCounts.toMatchUpdate, 0);
  assert.equal(rerunPlan.summaryCounts.toSkipExisting, initialPlan.summaryCounts.totalPlanned);

  // Verify retryFailedOnly filtering narrows writes solely to failedKeys
  const failedKey = `pending_job:${initialPlan.pendingJobs[0].sourceKey}`;
  const filtered = filterPlanForExecution(initialPlan, {
    retryFailedOnly: true,
    failedKeys: new Set([failedKey]),
  });
  const intents = buildExecutionIntents(filtered, {
    retryFailedOnly: true,
    failedKeys: new Set([failedKey]),
  });
  assert.equal(intents.length, 1);
  assert.equal(intents[0].compositeKey, failedKey);
  assert.equal(intents[0].needsWrite, true);
});
