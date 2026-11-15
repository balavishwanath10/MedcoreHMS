# MedCoreHMS — Multi-Tenancy Architecture and Data Isolation Strategy

**Project:** MedCoreHMS
**Model:** Multi-Tenant Database, Shared Process, Explicit Query Scoping
**Date:** 2026-11-15

---

## 1. Multi-Tenancy Model Overview

MedCoreHMS implements a **Logical Multi-Tenancy Model** using a single shared MongoDB database. Every hospital registered on the platform acts as an autonomous tenant (`Hospital`).

The architecture strictly guarantees:

1. **Zero Data Leakage:** A hospital tenant can never view, query, update, or delete data belonging to another tenant.
2. **Autonomous Namespaces:** Department codes, Medical Record Numbers (MRNs), invoice numbers, and room designations are unique _within_ a hospital, allowing different hospitals to reuse identical internal numbering schemes without collision.
3. **Decoupled Client Authorization:** The tenant scope (`hospitalId`) is **never trusted from client input** (such as headers, route params, or request bodies). It is derived exclusively from cryptographically signed server tokens.

---

## 2. Tenant Scoping Classification

| Classification            | Collections                                                                                                                                                                                                                                                                           | Description                                                             | Scoping Rules                                                          |
| :------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| **Global Entities**       | `hospitals`, `users` (SuperAdmin only)                                                                                                                                                                                                                                                | Platform-level management entities with no parent tenant.               | Queried exclusively by `SUPER_ADMIN`.                                  |
| **Tenant-Owned Entities** | `users`, `departments`, `rooms`, `doctorProfiles`, `doctorAvailability`, `patientProfiles`, `appointments`, `encounters`, `medicalRecords`, `prescriptions`, `medicineCatalog`, `inventoryBatches`, `labOrders`, `labResults`, `invoices`, `payments`, `insuranceClaims`, `auditLogs` | All operational, clinical, and billing records belonging to a hospital. | **MUST** contain a required, indexed `hospitalId: ObjectId` reference. |

---

## 3. User-to-Hospital Relationship

```
+--------------------------------------------------------------------------+
| USER ACCOUNTS                                                            |
|                                                                          |
|   +------------------------------------+                                 |
|   | role: SUPER_ADMIN                  |                                 |
|   | hospitalId: null                   | ----> Global Platform Admin     |
|   +------------------------------------+                                 |
|                                                                          |
|   +------------------------------------+                                 |
|   | role: HOSPITAL_ADMIN / DOCTOR / ...|                                 |
|   | hospitalId: ObjectId("HOSP_001")   | ----> Bound Strictly to Hosp 1  |
|   +------------------------------------+                                 |
|                                                                          |
|   +------------------------------------+                                 |
|   | role: HOSPITAL_ADMIN / DOCTOR / ...|                                 |
|   | hospitalId: ObjectId("HOSP_002")   | ----> Bound Strictly to Hosp 2  |
|   +------------------------------------+                                 |
+--------------------------------------------------------------------------+
```

### 3.1 Super Admin Cross-Tenant Access

- A `SUPER_ADMIN` user has `hospitalId: null`.
- Only `SUPER_ADMIN` can access global administrative endpoints:
  - `POST /api/v1/hospitals` (Onboard new hospital)
  - `PATCH /api/v1/hospitals/:id/status` (Suspend / activate hospital)
  - `GET /api/v1/hospitals` (List all onboarded tenants)
- When a `SUPER_ADMIN` performs audit inspection on a specific hospital, the target `hospitalId` is explicitly supplied as a route parameter and recorded in the global `auditLogs`.

### 3.2 Hospital-Scoped Roles (The Other 8 Roles)

- `HOSPITAL_ADMIN`, `DOCTOR`, `NURSE`, `RECEPTIONIST`, `LAB_TECHNICIAN`, `PHARMACIST`, `ACCOUNTANT`, and `PATIENT` must have a non-null, valid `hospitalId`.
- Even if a client sends `{ hospitalId: "OTHER_HOSPITAL" }` in a request body, the backend controller ignores it and forcefully overrides it with `req.user.hospitalId`.

---

## 4. Query Scoping and Compound Uniqueness

### 4.1 Read Query Enforcement Pattern

Every read query on a tenant-owned entity must include `hospitalId`:

```typescript
// SECURE: Enforces tenant boundary
const patient = await PatientProfile.findOne({
  _id: patientId,
  hospitalId: req.user.hospitalId,
  isDeleted: false,
});

if (!patient) {
  // Returns 404 regardless of whether the ID exists in another hospital
  throw new NotFoundError('Patient record not found');
}
```

### 4.2 Write Query Enforcement Pattern

Every update or delete query must include `hospitalId`:

```typescript
// SECURE: Prevents updating documents owned by other tenants
const result = await Appointment.updateOne(
  {
    _id: appointmentId,
    hospitalId: req.user.hospitalId,
  },
  {
    $set: { status: 'CANCELLED', cancellationReason: reason },
  },
);

if (result.matchedCount === 0) {
  throw new NotFoundError('Appointment not found');
}
```

### 4.3 Hospital-Scoped Compound Indexes

To prevent cross-tenant collisions while enforcing intra-tenant uniqueness:

1. **Patient MRN:** `{ hospitalId: 1, mrn: 1 }` (unique: true)
   - Hospital A can have `MRN-001`, and Hospital B can also have `MRN-001`.
2. **Department Code:** `{ hospitalId: 1, code: 1 }` (unique: true)
   - Both Hospital A and Hospital B can have a `CARD` department code.
3. **Doctor Double-Booking:** `{ hospitalId: 1, doctorId: 1, startTime: 1 }` (unique: true)
4. **Invoice Number:** `{ hospitalId: 1, invoiceNumber: 1 }` (unique: true)

---

## 5. Security Verification & Required Multi-Tenancy Tests

To guarantee tenant isolation throughout development, the following automated test cases are required:

1. **Cross-Tenant Read Isolation:**
   - User from Hospital A attempts to fetch `GET /api/v1/patients/:id` where `:id` belongs to Hospital B.
   - _Expected Outcome:_ 404 Not Found (Zero information leakage).

2. **Cross-Tenant Mutation Block:**
   - User from Hospital A attempts to `PATCH /api/v1/appointments/:id` where `:id` belongs to Hospital B.
   - _Expected Outcome:_ 404 Not Found, 0 documents modified.

3. **Client-Supplied Tenant Injection Resistance:**
   - User from Hospital A submits `POST /api/v1/patients` with body `{ hospitalId: "HOSPITAL_B", ... }`.
   - _Expected Outcome:_ Document created with `hospitalId` set strictly to `HOSPITAL_A` (derived from auth token).

4. **Global Email Uniqueness Across Tenants:**
   - Attempt to register a user with an email already taken in another hospital.
   - _Expected Outcome:_ 409 Conflict. User emails are globally unique across the entire platform.
