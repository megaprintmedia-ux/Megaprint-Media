# Security Specification: Megaprint ERP & Operations System

## 1. Data Invariants
1. **Identity & Role Integrity**: No user may self-assign `management` or `accounts` roles on `/users/{userId}` creation or update. Only a verified `management` user or bootstrapped admin (`megaprintmedia@gmail.com` with `email_verified == true`) can promote or reassign roles.
2. **Temporal Integrity**: `createdAt` and `updatedAt` are validated against `request.time`, and `createdAt` + `ownerUid` are immutable after creation.
3. **Referential & Subcollection Gate**: `/jobs/{jobId}/costs/{costId}` cannot exist without an existing parent `/jobs/{jobId}` document, and `incoming().jobId == jobId`.
4. **Terminal State Locking**: Once a `Job` reaches `Completed` or `Cancelled`, or an `Invoice` reaches `Void`, non-admin users cannot mutate financial or specification fields.
5. **Bounded Arrays & Size Limits**: Every string field enforces strict `.size()` bounds, every document ID matches `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and array fields (`staffUids`, `hrViewerUids`, `lines`) are bounded (`<= 10`).
6. **PII & Payroll Isolation**: `/users/{userId}`, `/employees/{employeeId}`, and `/payrollRuns/{runId}` restrict read/list access strictly to owners, bootstrapped admin, or explicitly authorized `hrViewerUids` / `management` / `accounts` roles.
7. **Zero Client Query Trust**: Every `allow list` clause evaluates `resource.data` directly (checking `ownerUid`, `staffUids`, `hrViewerUids`, or `isBootstrappedAdmin()`) without calling `get()` or `exists()`.

## 2. "Dirty Dozen" Adversarial Payloads
1. **Self-Admin Privilege Escalation**: `POST /users/attackerUid` with `{ role: 'management', status: 'active' }`. Expected: `PERMISSION_DENIED`.
2. **Email Spoofing Attack**: Auth token with `email: 'megaprintmedia@gmail.com'` and `email_verified: false`. Expected: `PERMISSION_DENIED`.
3. **Ghost / Shadow Field Injection**: Creating a `Job` with extra field `isTaxExemptOverride: true`. Expected: `PERMISSION_DENIED` (`hasOnly` check fails).
4. **ID Poisoning**: Creating `/jobs/<1500-char-junk-id>` or invalid characters `../bad`. Expected: `PERMISSION_DENIED` (`isValidId` fails).
5. **Orphaned Job Cost Entry**: Creating `/jobs/nonExistentJob/costs/c1`. Expected: `PERMISSION_DENIED` (parent `exists()` check fails).
6. **Owner Spoofing**: Creating a `Client` with `ownerUid: 'someoneElseUid'`. Expected: `PERMISSION_DENIED`.
7. **Immutable Field Mutation**: Updating `Job.createdAt` or `Job.ownerUid`. Expected: `PERMISSION_DENIED`.
8. **Terminal State Bypass**: Non-admin updating `netTotal` on a `Completed` job. Expected: `PERMISSION_DENIED`.
9. **Type / Value Poisoning**: Updating `Invoice.vatAmount` to a string `"free"` or negative number `-500`. Expected: `PERMISSION_DENIED` (`isValidInvoice` fails).
10. **Unbounded Array Bomb**: Setting `Job.staffUids` to 50 UIDs. Expected: `PERMISSION_DENIED` (`size() <= 10` fails).
11. **PII / Salary Scraping**: Unrelated Sales user listing `/employees` or reading another user's `/users/{uid}`. Expected: `PERMISSION_DENIED`.
12. **Timestamp Backdating**: Submitting `createdAt` as a client string or past timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
