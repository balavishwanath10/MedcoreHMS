# MedCoreHMS — Database Index and Concurrency Strategy Plan

**Project:** MedCoreHMS
**Engine:** MongoDB Atlas (Replica Set)
**Date:** 2026-11-15

---

## 1. Index Strategy Overview

Indexes in MedCoreHMS are engineered around the principle of **Tenant-First Compound Indexing**. Because every tenant query begins with `{ hospitalId }`, placing `hospitalId` as the leading prefix in compound indexes guarantees that index scans are tightly bounded within the tenant's partition of the B-Tree.

### Primary Index Design Principles

1. **Equality-Sort-Range (ESR) Rule:** Fields used for exact equality matching (`hospitalId`, `status`, `role`) appear first, followed by sort fields (`createdAt`, `startTime`), and finally range fields (`dateOfBirth`, `remainingQuantity`).
2. **Compound Uniqueness:** Ensures unique constraints are enforced strictly per hospital rather than globally (e.g., patient MRNs, department codes).
3. **No Redundant Single-Field Indexes:** If a compound index `{ hospitalId: 1, code: 1 }` exists, a single-field index on `{ hospitalId: 1 }` is omitted because MongoDB uses index prefixes efficiently.

---

## 2. Comprehensive Collection Index Matrix

| Collection             | Index Specification                                                     | Type                      | Query Pattern Supported                                    |
| :--------------------- | :---------------------------------------------------------------------- | :------------------------ | :--------------------------------------------------------- |
| **`hospitals`**        | `{ code: 1 }`                                                           | Unique                    | Lookup hospital by unique code (e.g. `METRO`)              |
|                        | `{ slug: 1 }`                                                           | Unique                    | Vanity URL routing (e.g. `/hospital/metro-city`)           |
|                        | `{ licenseNumber: 1 }`                                                  | Unique                    | Prevents duplicate hospital registration                   |
|                        | `{ status: 1 }`                                                         | Standard                  | SuperAdmin filter for active/suspended tenants             |
| **`users`**            | `{ email: 1 }`                                                          | Unique                    | Global login authentication lookup                         |
|                        | `{ hospitalId: 1, role: 1 }`                                            | Compound                  | Filter staff by role within a hospital                     |
|                        | `{ hospitalId: 1, isDeleted: 1 }`                                       | Compound                  | Active user listings per hospital                          |
| **`departments`**      | `{ hospitalId: 1, code: 1 }`                                            | Unique Compound           | Department code uniqueness per hospital                    |
|                        | `{ hospitalId: 1, isActive: 1 }`                                        | Compound                  | Listing active departments for appointments                |
| **`doctorProfiles`**   | `{ userId: 1 }`                                                         | Unique                    | One-to-one mapping from User to DoctorProfile              |
|                        | `{ licenseNumber: 1 }`                                                  | Unique                    | Medical council license registration                       |
|                        | `{ hospitalId: 1, departmentId: 1 }`                                    | Compound                  | Doctors by department lookup                               |
|                        | `{ hospitalId: 1, isActive: 1 }`                                        | Compound                  | Available doctors list for patient booking                 |
| **`patientProfiles`**  | `{ hospitalId: 1, mrn: 1 }`                                             | Unique Compound           | Medical Record Number uniqueness per hospital              |
|                        | `{ hospitalId: 1, phone: 1 }`                                           | Compound                  | Fast patient phone lookup at reception desk                |
|                        | `{ hospitalId: 1, lastName: 1, firstName: 1 }`                          | Compound                  | Patient directory search and auto-complete                 |
|                        | `{ hospitalId: 1, isDeleted: 1 }`                                       | Compound                  | Active patient roster                                      |
| **`appointments`**     | `{ hospitalId: 1, doctorId: 1, startTime: 1 }`                          | Unique Compound (Partial) | **Concurrency Control:** Prevents doctor double-booking    |
|                        | `{ hospitalId: 1, patientId: 1, startTime: -1 }`                        | Compound                  | Patient consultation history in chronological order        |
|                        | `{ hospitalId: 1, status: 1, startTime: 1 }`                            | Compound                  | Front desk daily appointment schedule queue                |
| **`encounters`**       | `{ hospitalId: 1, patientId: 1, encounterDate: -1 }`                    | Compound                  | Patient longitudinal medical record history                |
|                        | `{ hospitalId: 1, doctorId: 1, encounterDate: -1 }`                     | Compound                  | Doctor encounter review queue                              |
| **`medicalRecords`**   | `{ hospitalId: 1, patientId: 1 }`                                       | Compound                  | Comprehensive medical history retrieval                    |
|                        | `{ hospitalId: 1, encounterId: 1 }`                                     | Unique Compound           | Direct access from visit encounter                         |
| **`prescriptions`**    | `{ hospitalId: 1, patientId: 1, createdAt: -1 }`                        | Compound                  | Patient prescription history                               |
|                        | `{ hospitalId: 1, status: 1, createdAt: 1 }`                            | Compound                  | Pharmacy dispensing queue                                  |
| **`inventoryBatches`** | `{ hospitalId: 1, medicineId: 1, expiryDate: 1, remainingQuantity: 1 }` | Compound                  | **FIFO Selection:** Locates earliest expiring active stock |
|                        | `{ hospitalId: 1, expiryDate: 1 }`                                      | Compound                  | Expiry alerts and regulatory destruction audit             |
| **`invoices`**         | `{ hospitalId: 1, invoiceNumber: 1 }`                                   | Unique Compound           | Invoice reference lookup                                   |
|                        | `{ hospitalId: 1, patientId: 1, status: 1 }`                            | Compound                  | Patient outstanding balance lookup                         |
| **`payments`**         | `{ hospitalId: 1, transactionReference: 1 }`                            | Unique Compound           | Gateway payment idempotency & reconciliation               |
|                        | `{ hospitalId: 1, invoiceId: 1 }`                                       | Compound                  | Payment history for specific invoice                       |
| **`auditLogs`**        | `{ hospitalId: 1, timestamp: -1 }`                                      | Compound                  | Compliance audit trail retrieval                           |
|                        | `{ hospitalId: 1, entityType: 1, entityId: 1 }`                         | Compound                  | Forensic history of specific record                        |
| **`refreshTokens`**    | `{ tokenHash: 1 }`                                                      | Unique                    | Fast session validation                                    |
|                        | `{ expiresAt: 1 }`                                                      | TTL Index                 | Automatic database cleanup after expiration                |

---

## 3. Concurrency Controls & Race Condition Mitigations

### 3.1 Doctor Double-Booking Prevention

**Problem:** Two users attempt to book the exact same 30-minute doctor slot at the same millisecond.
**Solution:**

1. **Unique Compound Partial Index:**
   ```javascript
   // Only indexes active slots; cancelled appointments do not block re-booking
   db.appointments.createIndex(
     { hospitalId: 1, doctorId: 1, startTime: 1 },
     {
       unique: true,
       partialFilterExpression: { status: { $in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] } },
     },
   );
   ```
2. **Duplicate Key Handling:** If a race condition occurs, MongoDB throws code `11000`. The centralized `errorHandler` intercepts this and translates it into a clean `409 Conflict: "This appointment slot was just acquired by another patient. Please select another time."`

### 3.2 Patient Overlapping Appointment Prevention

**Rule:** A patient cannot have two active appointments at the same time in different departments.
**Solution:**

- Verified during booking via an atomic conditional query:
  ```typescript
  const existing = await Appointment.findOne({
    hospitalId: req.user.hospitalId,
    patientId: targetPatientId,
    status: { $in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
    $or: [
      { startTime: { $lt: requestedEndTime, $gte: requestedStartTime } },
      { endTime: { $gt: requestedStartTime, $lte: requestedEndTime } },
    ],
  });
  if (existing) {
    throw new ConflictError('Patient already has an active appointment during this time window.');
  }
  ```

### 3.3 Pharmacy FIFO Stock Depletion

**Rule:** Medication must always be dispensed from the batch with the earliest expiration date that still has remaining stock.
**Solution:**

- Atomic conditional decrement with `$gte` check:
  ```typescript
  const batch = await InventoryBatch.findOneAndUpdate(
    {
      hospitalId,
      medicineId,
      remainingQuantity: { $gte: requestedQuantity },
      expiryDate: { $gt: new Date() }, // Cannot dispense expired medication
    },
    {
      $inc: { remainingQuantity: -requestedQuantity },
    },
    {
      sort: { expiryDate: 1 }, // Earliest expiring first
      new: true,
    },
  );
  ```

### 3.4 Payment Webhook Idempotency

**Rule:** Payment gateway webhooks (e.g. Stripe, Razorpay) may retry identical events multiple times.
**Solution:**

- Unique compound index on `{ hospitalId: 1, transactionReference: 1 }`.
- Duplicate payment attempts return a successful `200 OK: "Payment already recorded"` without creating duplicate financial credits.
