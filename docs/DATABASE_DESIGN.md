# MedCoreHMS — Comprehensive MongoDB Database Design

**Project:** MedCoreHMS
**Engine:** MongoDB 7+ / Atlas (Replica Set)
**ODM:** Mongoose 8
**Date:** 2026-11-15

---

## 1. Data Modeling Strategy & Design Principles

The database design adapts the original relational PostgreSQL schema into a high-performance, document-oriented MongoDB model without sacrificing data integrity, tenant isolation, or regulatory auditability.

### 1.1 Embedding vs. Referencing Decisions

1. **Referencing (Normalized):** Used when data entities have independent lifecycles, grow without bound, require cross-collection indexing, or participate in complex authorization queries.
   - _Examples:_ `Hospital`, `User`, `Department`, `DoctorProfile`, `PatientProfile`, `Appointment`, `Encounter`, `Invoice`.
2. **Embedding (Denormalized):** Used when data is tightly coupled to a parent entity, bounded in size, and always read/written atomically with the parent.
   - _Address Decision:_ Addresses (`street`, `city`, `state`, `postalCode`, `country`) are modeled as **embedded sub-documents** within `Hospital` and `PatientProfile`. Addresses have no independent business lifecycle and embedding eliminates redundant query joins.
   - _Emergency Contact Decision:_ Modeled as embedded sub-documents within `PatientProfile`.
   - _Invoice Line Items:_ Bounded (typically 1–25 items per clinical visit) and embedded within `Invoice` to ensure atomic total calculations.
   - _Prescription Items:_ Embedded within `Prescription` (`medicineId`, `dosage`, `frequency`, `durationDays`).

### 1.2 Immutability & Soft-Delete Safeguards

- **Medical Records & Encounters:** Per medical regulatory standards and PRD directives, clinical notes, diagnostic evaluations, and encounter records are **strictly immutable and cannot be permanently deleted**. No hard delete or soft delete is permitted on EMR data. Corrections are stored as addenda.
- **Master Entities (Patients, Doctors, Departments):** Support soft-deletion via `isDeleted: { type: Boolean, default: false, index: true }`. Read queries automatically filter `{ isDeleted: false }`.

---

## 2. Complete Domain Collection Specifications

### 2.1 Hospital Management Domain

#### `hospitals` (Tenant Root Collection)

- **Purpose:** Primary tenant identity record. Controls hospital branding, licensing, and operational settings.
- **Tenant Scope:** Global (root tenant).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `name`: `String` (Required, 2-100 chars)
  - `code`: `String` (Required, Uppercase, unique)
  - `slug`: `String` (Required, Lowercase, unique)
  - `email`: `String` (Required, valid email)
  - `phone`: `String` (Required)
  - `address`: `Embedded Address` (`street`, `city`, `state`, `postalCode`, `country`)
  - `licenseNumber`: `String` (Required, unique)
  - `taxId`: `String` (Optional)
  - `status`: `String` (Enum: `ACTIVE`, `SUSPENDED`, `ONBOARDING`, `INACTIVE`)
  - `settings`: `Object` (`timezone`, `currency`, `appointmentSlotDurationMinutes`, `allowPatientPortalRegistration`)
  - `isDeleted`: `Boolean` (Default: false)
  - `createdAt`, `updatedAt`: `Date`
- **Indexes:** `{ code: 1 }` (unique), `{ slug: 1 }` (unique), `{ licenseNumber: 1 }` (unique), `{ status: 1 }`.

#### `departments`

- **Purpose:** Hospital clinical and administrative departments (e.g., Cardiology, Radiology, Pediatrics).
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `name`: `String` (Required, 2-100 chars)
  - `code`: `String` (Required, unique per hospital)
  - `description`: `String` (Optional, max 500 chars)
  - `headDoctorId`: `ObjectId` (Ref: `DoctorProfile`, Optional)
  - `isActive`: `Boolean` (Default: true)
  - `isDeleted`: `Boolean` (Default: false)
- **Indexes:** `{ hospitalId: 1, code: 1 }` (unique compound), `{ hospitalId: 1, isActive: 1 }`.

#### `rooms`

- **Purpose:** Hospital physical rooms, examination rooms, and inpatient wards.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `departmentId`: `ObjectId` (Ref: `Department`, Required)
  - `roomNumber`: `String` (Required)
  - `type`: `String` (Enum: `CONSULTATION`, `ICU`, `GENERAL_WARD`, `OPERATION_THEATER`, `LAB`)
  - `capacity`: `Number` (Default: 1)
  - `isOccupied`: `Boolean` (Default: false)
  - `isDeleted`: `Boolean` (Default: false)
- **Indexes:** `{ hospitalId: 1, roomNumber: 1 }` (unique compound), `{ hospitalId: 1, type: 1 }`.

---

### 2.2 Identity and Access Management Domain

#### `users`

- **Purpose:** Central authentication and identity records for all 9 roles.
- **Tenant Scope:** Hospital-scoped for all roles except `SUPER_ADMIN` (where `hospitalId` is null).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Nullable only for `SUPER_ADMIN`)
  - `email`: `String` (Required, lowercase, trimmed, globally unique)
  - `passwordHash`: `String` (Required, bcrypt hash; NEVER serialized in toJSON/toObject)
  - `role`: `String` (Enum: 9 PRD roles, Required)
  - `firstName`: `String` (Required, 1-50 chars)
  - `lastName`: `String` (Required, 1-50 chars)
  - `phone`: `String` (Optional)
  - `status`: `String` (Enum: `ACTIVE`, `INACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED`)
  - `isEmailVerified`: `Boolean` (Default: false)
  - `lastLoginAt`: `Date` (Nullable)
  - `isDeleted`: `Boolean` (Default: false)
- **Indexes:** `{ email: 1 }` (unique), `{ hospitalId: 1, role: 1 }`, `{ hospitalId: 1, isDeleted: 1 }`.

#### `refreshTokens`

- **Purpose:** Rotational refresh token tracking for secure session management.
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `userId`: `ObjectId` (Ref: `User`, Required)
  - `tokenHash`: `String` (Required, SHA-256 hash of token)
  - `familyId`: `String` (Required, for token reuse detection)
  - `isRevoked`: `Boolean` (Default: false)
  - `expiresAt`: `Date` (Required, TTL index)
- **Indexes:** `{ tokenHash: 1 }` (unique), `{ userId: 1, isRevoked: 1 }`, `{ expiresAt: 1 }` (expireAfterSeconds: 0).

---

### 2.3 Clinical & Doctor Domain

#### `doctorProfiles`

- **Purpose:** Extended professional profile for medical practitioners.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `userId`: `ObjectId` (Ref: `User`, Required, unique)
  - `departmentId`: `ObjectId` (Ref: `Department`, Required)
  - `licenseNumber`: `String` (Required, globally unique medical registry license)
  - `specialization`: `String` (Required, e.g. "Cardiologist")
  - `qualifications`: `Array of String` (e.g. `["MBBS", "MD Cardiology"]`)
  - `experienceYears`: `Number` (Min: 0)
  - `consultationFee`: `Number` (Min: 0)
  - `bio`: `String` (Optional)
  - `isActive`: `Boolean` (Default: true)
  - `isDeleted`: `Boolean` (Default: false)
- **Indexes:** `{ userId: 1 }` (unique), `{ licenseNumber: 1 }` (unique), `{ hospitalId: 1, departmentId: 1 }`, `{ hospitalId: 1, isActive: 1 }`.

#### `doctorAvailability`

- **Purpose:** Weekly schedules and recurring slot templates for doctors.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `dayOfWeek`: `Number` (0=Sunday to 6=Saturday)
  - `startTime`: `String` (HH:mm format, e.g., "09:00")
  - `endTime`: `String` (HH:mm format, e.g., "17:00")
  - `slotDurationMinutes`: `Number` (Default: 30)
  - `isAvailable`: `Boolean` (Default: true)
- **Indexes:** `{ hospitalId: 1, doctorId: 1, dayOfWeek: 1 }`.

---

### 2.4 Patient Domain

#### `patientProfiles`

- **Purpose:** Core patient demographic and emergency contact record.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `userId`: `ObjectId` (Ref: `User`, Optional link to patient portal account)
  - `mrn`: `String` (Medical Record Number, required, unique per hospital)
  - `firstName`: `String` (Required, 1-50 chars)
  - `lastName`: `String` (Required, 1-50 chars)
  - `dateOfBirth`: `Date` (Required)
  - `gender`: `String` (Enum: `MALE`, `FEMALE`, `OTHER`)
  - `bloodGroup`: `String` (Enum: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `UNKNOWN`)
  - `phone`: `String` (Required)
  - `email`: `String` (Optional)
  - `emergencyContact`: `Embedded Object` (`name`, `relationship`, `phone`)
  - `address`: `Embedded Address` (`street`, `city`, `state`, `postalCode`, `country`)
  - `isDeleted`: `Boolean` (Default: false - soft delete)
  - `createdAt`, `updatedAt`: `Date`
- **Indexes:** `{ hospitalId: 1, mrn: 1 }` (unique compound), `{ hospitalId: 1, phone: 1 }`, `{ hospitalId: 1, lastName: 1, firstName: 1 }`, `{ hospitalId: 1, isDeleted: 1 }`.

---

### 2.5 Appointments & Scheduling Domain

#### `appointments`

- **Purpose:** Scheduled consultations between patients and doctors.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `startTime`: `Date` (Required)
  - `endTime`: `Date` (Required)
  - `status`: `String` (Enum: `SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`)
  - `type`: `String` (Enum: `ROUTINE`, `EMERGENCY`, `FOLLOW_UP`, `TELEMEDICINE`)
  - `reason`: `String` (Optional)
  - `cancellationReason`: `String` (Optional)
  - `isDeleted`: `Boolean` (Default: false)
- **Indexes:**
  - `{ hospitalId: 1, doctorId: 1, startTime: 1 }` (unique compound index for active slots to prevent double-booking)
  - `{ hospitalId: 1, patientId: 1, startTime: -1 }` (patient history lookup)
  - `{ hospitalId: 1, status: 1, startTime: 1 }` (schedule queue)

---

### 2.6 Electronic Medical Records (EMR) Domain

#### `encounters`

- **Purpose:** Clinical visit episode linking an appointment, patient, doctor, and observations.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Immutability:** Permanent clinical record (Never deleted).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `appointmentId`: `ObjectId` (Ref: `Appointment`, Optional)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `encounterDate`: `Date` (Required)
  - `type`: `String` (Enum: `OUTPATIENT`, `INPATIENT`, `EMERGENCY`, `ICU`)
  - `chiefComplaint`: `String` (Required)
  - `vitals`: `Embedded Object`
    - `systolicBp`: `Number` (mmHg)
    - `diastolicBp`: `Number` (mmHg)
    - `pulseRate`: `Number` (bpm)
    - `temperatureF`: `Number`
    - `respiratoryRate`: `Number`
    - `oxygenSaturation`: `Number` (%)
    - `weightKg`: `Number`
    - `heightCm`: `Number`
    - `bmi`: `Number`
  - `status`: `String` (Enum: `OPEN`, `SIGNED`, `LOCKED`)
  - `signedAt`: `Date` (Nullable)
- **Indexes:** `{ hospitalId: 1, patientId: 1, encounterDate: -1 }`, `{ hospitalId: 1, doctorId: 1, encounterDate: -1 }`.

#### `medicalRecords`

- **Purpose:** Detailed diagnostic findings, clinical notes, and allergies.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Sensitive Fields:** `clinicalNotes`, `diagnoses`, `allergies` (Protected via Application-Level Encryption).
- **Immutability:** Permanent clinical record (Never deleted).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `encounterId`: `ObjectId` (Ref: `Encounter`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `diagnoses`: `Array of Object` (`icd10Code`, `description`, `type: PRIMARY | SECONDARY`)
  - `allergies`: `Array of Object` (`allergen`, `severity: MILD | MODERATE | SEVERE`, `reaction`)
  - `clinicalNotes`: `String` (Encrypted PHI text)
  - `treatmentPlan`: `String` (Encrypted PHI text)
  - `isImmutable`: `Boolean` (Default: true)
- **Indexes:** `{ hospitalId: 1, patientId: 1 }`, `{ hospitalId: 1, encounterId: 1 }`.

---

### 2.7 Prescriptions and Pharmacy Domain

#### `prescriptions`

- **Purpose:** Medical prescriptions issued by doctors during an encounter.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `encounterId`: `ObjectId` (Ref: `Encounter`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `items`: `Array of Embedded PrescriptionItem`
    - `medicineId`: `ObjectId` (Ref: `MedicineCatalog`, Required)
    - `medicineName`: `String` (Denormalized for historical accuracy)
    - `dosage`: `String` (e.g. "500mg")
    - `frequency`: `String` (e.g. "1-0-1 after meals")
    - `durationDays`: `Number`
    - `dispenseQuantity`: `Number`
    - `instructions`: `String`
  - `status`: `String` (Enum: `ISSUED`, `PARTIALLY_DISPENSED`, `DISPENSED`, `CANCELLED`)
- **Indexes:** `{ hospitalId: 1, patientId: 1, createdAt: -1 }`, `{ hospitalId: 1, status: 1 }`.

#### `medicineCatalog`

- **Purpose:** Standard hospital formulary and pharmaceutical master catalog.
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `name`: `String` (Required, e.g. "Amoxicillin")
  - `genericName`: `String` (Required)
  - `category`: `String` (e.g. "Antibiotic")
  - `dosageForm`: `String` (Enum: `TABLET`, `CAPSULE`, `SYRUP`, `INJECTION`, `OINTMENT`)
  - `strength`: `String` (e.g. "500mg")
  - `unitPrice`: `Number` (Required)
  - `reorderLevel`: `Number` (Default: 50)
  - `isActive`: `Boolean` (Default: true)
- **Indexes:** `{ hospitalId: 1, name: 1 }`, `{ hospitalId: 1, genericName: 1 }`.

#### `inventoryBatches` (FIFO Tracking)

- **Purpose:** Physical batches of pharmaceuticals with expiry dates, supporting FIFO dispensing.
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `medicineId`: `ObjectId` (Ref: `MedicineCatalog`, Required)
  - `batchNumber`: `String` (Required)
  - `expiryDate`: `Date` (Required)
  - `receivedDate`: `Date` (Required)
  - `purchaseCost`: `Number` (Required)
  - `initialQuantity`: `Number` (Required)
  - `remainingQuantity`: `Number` (Required, min: 0)
- **Indexes:**
  - `{ hospitalId: 1, medicineId: 1, expiryDate: 1, remainingQuantity: 1 }` (Critical FIFO query index: locates earliest expiring active batch)
  - `{ hospitalId: 1, expiryDate: 1 }` (Expiry audit alerts)

---

### 2.8 Laboratory Domain

#### `labOrders` & `labResults`

- **Purpose:** Clinical laboratory test requests and quantitative/qualitative result reports.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields (`labOrders`):**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `encounterId`: `ObjectId` (Ref: `Encounter`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `doctorId`: `ObjectId` (Ref: `DoctorProfile`, Required)
  - `testName`: `String` (Required, e.g. "Complete Blood Count")
  - `testCode`: `String` (e.g. "CBC")
  - `status`: `String` (Enum: `ORDERED`, `SAMPLE_COLLECTED`, `IN_ANALYSIS`, `COMPLETED`, `CANCELLED`)
  - `priority`: `String` (Enum: `ROUTINE`, `URGENT`, `STAT`)
- **Fields (`labResults`):**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `labOrderId`: `ObjectId` (Ref: `LabOrder`, Required, unique)
  - `technicianId`: `ObjectId` (Ref: `User`, Required)
  - `testParameters`: `Array of Object` (`parameterName`, `value`, `unit`, `referenceRange`, `isAbnormal`)
  - `technicianNotes`: `String`
  - `verifiedAt`: `Date`
- **Indexes:** `{ hospitalId: 1, patientId: 1 }`, `{ hospitalId: 1, status: 1 }`, `{ labOrderId: 1 }` (unique).

---

### 2.9 Billing, Payments & Insurance Domain

#### `invoices`

- **Purpose:** Itemized billing statements generated for patient encounters and pharmacy charges.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `encounterId`: `ObjectId` (Ref: `Encounter`, Optional)
  - `invoiceNumber`: `String` (Required, unique per hospital, e.g. "INV-2026-0001")
  - `items`: `Array of Embedded InvoiceItem`
    - `description`: `String` (Required)
    - `category`: `String` (Enum: `CONSULTATION`, `LAB`, `PHARMACY`, `ROOM`, `PROCEDURE`)
    - `unitPrice`: `Number`
    - `quantity`: `Number`
    - `total`: `Number`
  - `subtotal`: `Number` (Calculated)
  - `discountAmount`: `Number` (Default: 0)
  - `taxAmount`: `Number` (Default: 0)
  - `totalAmount`: `Number` (Required)
  - `paidAmount`: `Number` (Default: 0)
  - `status`: `String` (Enum: `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `VOID`)
  - `dueDate`: `Date`
- **Indexes:** `{ hospitalId: 1, invoiceNumber: 1 }` (unique compound), `{ hospitalId: 1, patientId: 1, status: 1 }`.

#### `payments`

- **Purpose:** Ledger of incoming transactions against invoices.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required).
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `invoiceId`: `ObjectId` (Ref: `Invoice`, Required)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `amount`: `Number` (Required, min: 0.01)
  - `paymentMethod`: `String` (Enum: `CASH`, `CARD`, `UPI`, `INSURANCE`, `NET_BANKING`)
  - `transactionReference`: `String` (Required, unique per hospital for gateway reconciliation)
  - `status`: `String` (Enum: `SUCCESS`, `PENDING`, `FAILED`, `REFUNDED`)
  - `recordedBy`: `ObjectId` (Ref: `User`, Required)
- **Indexes:** `{ hospitalId: 1, transactionReference: 1 }` (unique compound), `{ hospitalId: 1, invoiceId: 1 }`.

#### `insuranceClaims`

- **Purpose:** Claims submitted to third-party medical insurance providers.
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Required)
  - `invoiceId`: `ObjectId` (Ref: `Invoice`, Required, unique)
  - `patientId`: `ObjectId` (Ref: `PatientProfile`, Required)
  - `providerName`: `String` (Required)
  - `policyNumber`: `String` (Required)
  - `claimNumber`: `String` (Required)
  - `claimAmount`: `Number` (Required)
  - `approvedAmount`: `Number` (Default: 0)
  - `status`: `String` (Enum: `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SETTLED`)
- **Indexes:** `{ hospitalId: 1, claimNumber: 1 }` (unique compound), `{ invoiceId: 1 }` (unique).

---

### 2.10 Audit & Observability Domain

#### `auditLogs`

- **Purpose:** Immutable compliance and forensic trail recording all state changes and PHI access.
- **Tenant Scope:** Hospital-scoped (`hospitalId` required, or null for platform-wide SuperAdmin actions).
- **Immutability:** Strictly append-only. No updates or deletions allowed.
- **Fields:**
  - `_id`: `ObjectId` (PK)
  - `hospitalId`: `ObjectId` (Ref: `Hospital`, Nullable for platform actions)
  - `userId`: `ObjectId` (Ref: `User`, Required)
  - `userRole`: `String` (Required snapshot of role at time of action)
  - `action`: `String` (Required, e.g. `PATIENT_RECORD_VIEW`, `PRESCRIPTION_DISPENSE`, `USER_LOGIN`)
  - `entityType`: `String` (e.g. `PatientProfile`, `MedicalRecord`, `Invoice`)
  - `entityId`: `ObjectId` (Required)
  - `ipAddress`: `String` (Anonymized / masked per privacy guidelines)
  - `userAgent`: `String`
  - `diff`: `Object` (`before`, `after` — sensitive values redacted)
  - `timestamp`: `Date` (Default: Date.now, Required)
- **Indexes:** `{ hospitalId: 1, timestamp: -1 }`, `{ hospitalId: 1, entityType: 1, entityId: 1 }`, `{ userId: 1, timestamp: -1 }`.
