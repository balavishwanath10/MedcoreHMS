# MedCoreHMS — Foundational Mongoose Models Specification

**Project:** MedCoreHMS
**Engine:** MongoDB 7+ / Mongoose 8
**Scope:** Foundational Entities (Day 3 Implementation)
**Date:** 2026-11-15

---

## 1. Overview and Core Conventions

Day 3 establishes the concrete, strictly typed Mongoose models for the foundational entities of MedCoreHMS. All models implement:

- Strict TypeScript document interfaces extending `Document`.
- Required field validations and min/max length constraints.
- Explicit enum sets matching PRD requirements.
- Automatic UTC timestamps (`createdAt`, `updatedAt`).
- Security transforms stripping `__v` and sensitive fields (e.g. `passwordHash`).
- Compound indexes optimizing tenant-scoped queries.

---

## 2. Core Implemented Models

### 2.1 `Hospital` (`src/server/models/Hospital.ts`)

The root tenant record. Every other clinical and operational record links to a `Hospital`.

| Field Name      | BSON Type       | Constraints & Validation                                                                   | Description                                    |
| :-------------- | :-------------- | :----------------------------------------------------------------------------------------- | :--------------------------------------------- |
| `name`          | String          | Required, trim, 2-100 chars                                                                | Legal hospital facility name                   |
| `code`          | String          | Required, uppercase, 2-10 chars, **Unique**                                                | Short hospital identifier code (e.g., `METRO`) |
| `slug`          | String          | Required, lowercase, **Unique**                                                            | URL-friendly vanity slug                       |
| `email`         | String          | Required, email regex, lowercase                                                           | Official administrative contact email          |
| `phone`         | String          | Required, trim                                                                             | Main facility telephone number                 |
| `address`       | Embedded Object | Required (`street`, `city`, `state`, `postalCode`, `country`)                              | Physical facility location                     |
| `licenseNumber` | String          | Required, trim, **Unique**                                                                 | State healthcare operating license             |
| `taxId`         | String          | Optional, trim                                                                             | Federal/state tax registration ID              |
| `status`        | String          | Enum: `ACTIVE`, `SUSPENDED`, `ONBOARDING`, `INACTIVE`                                      | Facility operational status                    |
| `settings`      | Embedded Object | `timezone`, `currency`, `appointmentSlotDurationMinutes`, `allowPatientPortalRegistration` | Tenant-specific runtime defaults               |
| `isDeleted`     | Boolean         | Default: `false`                                                                           | Soft-deletion flag                             |

**Indexes:**

- `{ code: 1 }` (unique: true)
- `{ slug: 1 }` (unique: true)
- `{ licenseNumber: 1 }` (unique: true)
- `{ status: 1 }`
- `{ isDeleted: 1 }`

---

### 2.2 `User` (`src/server/models/User.ts`)

The central identity and authentication record for all 9 PRD roles.

| Field Name        | BSON Type | Constraints & Validation                                        | Description                        |
| :---------------- | :-------- | :-------------------------------------------------------------- | :--------------------------------- |
| `hospitalId`      | ObjectId  | Ref: `Hospital`, Nullable only for `SUPER_ADMIN`                | Tenant boundary anchor             |
| `email`           | String    | Required, lowercase, **Unique**, email regex                    | Login credential (globally unique) |
| `passwordHash`    | String    | Required, `select: false`, stripped on serialization            | Bcrypt hashed credential           |
| `role`            | String    | Enum: 9 PRD Roles (Required)                                    | User authorization level           |
| `firstName`       | String    | Required, trim, 1-50 chars                                      | Given name                         |
| `lastName`        | String    | Required, trim, 1-50 chars                                      | Family name                        |
| `phone`           | String    | Optional, trim                                                  | Mobile contact number              |
| `status`          | String    | Enum: `ACTIVE`, `INACTIVE`, `PENDING_VERIFICATION`, `SUSPENDED` | User account lifecycle status      |
| `isEmailVerified` | Boolean   | Default: `false`                                                | Email verification flag            |
| `lastLoginAt`     | Date      | Default: `null`                                                 | Audit login timestamp              |
| `isDeleted`       | Boolean   | Default: `false`                                                | Soft-deletion flag                 |

**Security Controls:**

- `toJSON` and `toObject` transforms explicitly execute `delete ret.passwordHash`.
- Custom validator rejects any non-`SUPER_ADMIN` user created without a `hospitalId`.

**Indexes:**

- `{ email: 1 }` (unique: true)
- `{ hospitalId: 1, role: 1 }`
- `{ hospitalId: 1, isDeleted: 1 }`

---

### 2.3 `Department` (`src/server/models/Department.ts`)

Hospital clinical departments (e.g. Cardiology, Emergency, Pediatrics).

| Field Name     | BSON Type | Constraints & Validation                      | Description                           |
| :------------- | :-------- | :-------------------------------------------- | :------------------------------------ |
| `hospitalId`   | ObjectId  | Ref: `Hospital`, Required, indexed            | Tenant owner                          |
| `name`         | String    | Required, trim, 2-100 chars                   | Department title                      |
| `code`         | String    | Required, uppercase, 2-10 chars               | Department code (unique per hospital) |
| `description`  | String    | Optional, max 500 chars                       | Department overview                   |
| `headDoctorId` | ObjectId  | Ref: `DoctorProfile`, Optional, default: null | Department lead physician             |
| `isActive`     | Boolean   | Default: `true`                               | Operational status                    |
| `isDeleted`    | Boolean   | Default: `false`                              | Soft-delete flag                      |

**Indexes:**

- `{ hospitalId: 1, code: 1 }` (unique: true) — Intra-tenant unique compound index
- `{ hospitalId: 1, isActive: 1 }`
- `{ hospitalId: 1, isDeleted: 1 }`

---

### 2.4 `DoctorProfile` (`src/server/models/DoctorProfile.ts`)

Professional medical credentials and department mapping for doctors.

| Field Name        | BSON Type       | Constraints & Validation           | Description                                   |
| :---------------- | :-------------- | :--------------------------------- | :-------------------------------------------- |
| `hospitalId`      | ObjectId        | Ref: `Hospital`, Required, indexed | Tenant owner                                  |
| `userId`          | ObjectId        | Ref: `User`, Required, **Unique**  | 1:1 link to User account                      |
| `departmentId`    | ObjectId        | Ref: `Department`, Required        | Primary department assignment                 |
| `licenseNumber`   | String          | Required, trim, **Unique**         | State/national medical board license          |
| `specialization`  | String          | Required, trim                     | Medical sub-specialty                         |
| `qualifications`  | Array of String | Required, min 1 entry              | Academic/clinical credentials (e.g. MBBS, MD) |
| `experienceYears` | Number          | Required, min: 0, default: 0       | Post-residency clinical experience            |
| `consultationFee` | Number          | Required, min: 0, default: 0       | Base consultation fee                         |
| `bio`             | String          | Optional, max 1000 chars           | Professional biography                        |
| `isActive`        | Boolean         | Default: `true`                    | Scheduling availability flag                  |
| `isDeleted`       | Boolean         | Default: `false`                   | Soft-delete flag                              |

**Indexes:**

- `{ userId: 1 }` (unique: true)
- `{ licenseNumber: 1 }` (unique: true)
- `{ hospitalId: 1, departmentId: 1 }`
- `{ hospitalId: 1, isActive: 1 }`
- `{ hospitalId: 1, isDeleted: 1 }`

---

### 2.5 `PatientProfile` (`src/server/models/PatientProfile.ts`)

Demographics, emergency contacts, and Medical Record Number (MRN) for registered patients.

| Field Name         | BSON Type       | Constraints & Validation                                          | Description                                 |
| :----------------- | :-------------- | :---------------------------------------------------------------- | :------------------------------------------ |
| `hospitalId`       | ObjectId        | Ref: `Hospital`, Required, indexed                                | Tenant owner                                |
| `userId`           | ObjectId        | Ref: `User`, Optional, default: null                              | Link to patient portal login account        |
| `mrn`              | String          | Required, uppercase, 3-30 chars                                   | Medical Record Number (unique per hospital) |
| `firstName`        | String          | Required, trim, 1-50 chars                                        | Patient given name                          |
| `lastName`         | String          | Required, trim, 1-50 chars                                        | Patient surname                             |
| `dateOfBirth`      | Date            | Required, validator: `<= new Date()`                              | Birth date (future dates rejected)          |
| `gender`           | String          | Enum: `MALE`, `FEMALE`, `OTHER`                                   | Gender                                      |
| `bloodGroup`       | String          | Enum: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `UNKNOWN` | ABO/Rh blood typing                         |
| `phone`            | String          | Required, trim                                                    | Contact mobile phone                        |
| `email`            | String          | Optional, lowercase, trim                                         | Optional contact email                      |
| `emergencyContact` | Embedded Object | Required (`name`, `relationship`, `phone`)                        | Primary emergency next-of-kin               |
| `address`          | Embedded Object | Required (`street`, `city`, `state`, `postalCode`, `country`)     | Residential address                         |
| `isDeleted`        | Boolean         | Default: `false`                                                  | Soft-delete flag                            |

**Indexes:**

- `{ hospitalId: 1, mrn: 1 }` (unique: true) — Intra-tenant unique compound index
- `{ hospitalId: 1, phone: 1 }`
- `{ hospitalId: 1, lastName: 1, firstName: 1 }`
- `{ hospitalId: 1, isDeleted: 1 }`
