# MedCoreHMS — Technology Decisions and PRD Architectural Deviations

**Project:** MedCoreHMS
**Author:** Architectural Engineering Team
**Date:** 2026-11-15
**Status:** APPROVED ARCHITECTURAL BASELINE

---

## 1. Executive Summary & Context

The original MedCoreHMS PRD v1.0 outlined a technology stack centered around Next.js 15, NestJS, Prisma ORM, PostgreSQL 16 (utilizing Row-Level Security and `pgcrypto`), Redis 7, Docker Compose, Nginx, and split deployment across Vercel and AWS.

Under **Approved Architecture Option A**, MedCoreHMS transitions to a unified **MERN-based architecture**:

- **Frontend:** React 19 + Vite + Tailwind CSS + TanStack Query + Zustand
- **Backend:** Node.js + Express.js + TypeScript
- **Data Layer:** MongoDB Atlas + Mongoose ODM
- **Deployment:** Single unified Render Web Service hosting both API endpoints and React production assets.

This document records the exact architectural decisions, trade-offs, security compensations, and data guarantees implemented to ensure that **zero functional or security requirements are compromised** by this deviation.

---

## 2. Technology Comparison Matrix

| Architectural Layer        | Original PRD Specification               | Approved Option A Replacement                                    | Primary Architectural Rationale                                                                                                    |
| :------------------------- | :--------------------------------------- | :--------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend Framework**     | Next.js 15 (App Router)                  | React 19 + Vite                                                  | Eliminates SSR/Edge runtime overhead; provides clean SPA separation; maximizes compatibility with modern UI libraries.             |
| **Backend Framework**      | NestJS (modular DI)                      | Express.js + TypeScript                                          | Lightweight, unopinionated, zero dependency bloat, straightforward middleware chaining, faster cold starts.                        |
| **Data Persistence**       | PostgreSQL 16 + Prisma                   | MongoDB Atlas + Mongoose ODM                                     | Flexible schema evolution for clinical records, encounters, and dynamic medical attributes; native JSON document storage.          |
| **Multi-Tenant Isolation** | PostgreSQL Row-Level Security (RLS)      | Explicit Tenant-Scoped Queries & Compound Indexes                | Native MongoDB queries enforce `{ hospitalId }` filter on every tenant resource. Enforced at repository and query helper level.    |
| **Cryptographic Security** | PostgreSQL `pgcrypto` extension          | Node.js Application-Level Field Encryption (AES-256-GCM)         | Encrypts PHI before transmission to MongoDB; database administrators cannot view plaintext clinical notes in Atlas.                |
| **Concurrency Controls**   | Postgres row locks (`SELECT FOR UPDATE`) | MongoDB Atomic Conditional Updates & Multi-Document Transactions | Prevents appointment double-booking and inventory race conditions using versioning (`$set`, `$inc`, and replica-set transactions). |
| **Deployment Model**       | Split: Vercel (FE) + AWS ECS/EC2 (BE)    | Single Render Web Service                                        | Single unified root project; single build command; single port; zero CORS configuration headaches in production.                   |

---

## 3. MongoDB Document Modeling & Collection Strategy

### 3.1 Relational vs. Document Paradigm

MongoDB does not provide relational foreign key constraints or SQL table joins with automatic referential integrity cascades. To maintain high data integrity:

- **Foundational Master Data (Hospitals, Users, Departments):** Modeled as top-level collections with normalized ObjectID references.
- **Hierarchical/Contained Data (Addresses, Emergency Contacts, Vitals, Audit Actions):** Modeled as embedded sub-documents within parent records to optimize read performance and atomic updates.
- **Audit Logs & Medical Records:** Stored in append-only immutable collections with explicit timestamps and tenant identifiers.

### 3.2 Tenant Isolation Strategy

In PostgreSQL, RLS automatically appends `tenant_id = current_setting(...)` to queries. In MongoDB:

1. Every hospital-specific collection contains a required `hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true }`.
2. Global collections (`Hospital`, `SuperAdmin` records) do not carry a `hospitalId`.
3. Backend service queries must never trust a client-supplied `hospitalId` parameter. Instead, `hospitalId` is extracted strictly from the verified JWT / session context of the authenticated user.
4. All read, update, and delete queries must explicitly include `{ hospitalId: req.user.hospitalId, _id: resourceId }`.

### 3.3 Compound Indexing & Uniqueness Constraints

PostgreSQL enforces table-level unique constraints. In MongoDB, tenant-scoped uniqueness is guaranteed via **unique compound indexes**:

- **Department code within hospital:** `{ hospitalId: 1, code: 1 }` (unique: true)
- **Patient MRN within hospital:** `{ hospitalId: 1, mrn: 1 }` (unique: true)
- **Doctor license number:** Global unique index on `{ licenseNumber: 1 }`
- **User email:** Global unique index on `{ email: 1 }` (case-insensitive collation)
- **Doctor appointment slot:** `{ hospitalId: 1, doctorId: 1, startTime: 1 }` (unique: true) to prevent double-booking at the database level.

---

## 4. Concurrency, Transactions & Race Conditions

### 4.1 Replica Set Multi-Document Transactions

MongoDB multi-document ACID transactions require a **replica set** deployment (standard on MongoDB Atlas and local testing clusters).

- Operations involving cross-collection consistency (such as creating an invoice, decrementing pharmacy inventory batches, and logging an audit event) are executed inside Mongoose session transactions:
  ```typescript
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // operations with { session }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
  ```

### 4.2 Atomic Conditional Updates

For high-concurrency operations like inventory stock decrement or appointment slot acquisition:

- Use atomic updates with criteria: `InventoryBatch.updateOne({ _id: batchId, remainingQuantity: { $gte: requestedQty } }, { $inc: { remainingQuantity: -requestedQty } })`.
- If `modifiedCount === 0`, the stock was insufficient or acquired by a concurrent request.

---

## 5. Protected Health Information (PHI) Encryption

The original PRD required `pgcrypto` for encrypting patient diagnosis, notes, and medical records.

### Replacement Strategy: Application-Level Encryption (ALE)

1. **Algorithm:** AES-256-GCM with authenticated data and unique 12-byte initialization vectors (IV) per record.
2. **Key Management:** Master Encryption Key (`PHI_ENCRYPTION_KEY`) stored strictly in environment variables / KMS, never stored in the database.
3. **Mongoose Plugin:** A custom pre-save / post-init encryption plugin will automatically encrypt sensitive fields (`allergies`, `diagnoses`, `clinicalNotes`) before writing to MongoDB and decrypt them on retrieval for authorized roles.
4. **Defense in Depth:** Even with unauthorized read access to the MongoDB cluster, patient health data remains unreadable without the runtime cryptographic key.

---

## 6. Background Jobs & Cache Architecture

- **Redis Integration:** Retained for Day 4+ for session invalidation, OTP rate limiting, and BullMQ task queues.
- **BullMQ Workers:** Asynchronous PDF report generation (Puppeteer) and email/SMS delivery will run in background worker threads, keeping API latency low.

---

## 7. Unified Deployment Strategy (Render)

- **Single Service:** Rather than deploying the frontend to Vercel and backend to Render/AWS, the application is bundled as a single Render Web Service.
- **Build Pipeline:** `npm run build` runs `vite build` (frontend assets into `dist/client`) and `tsc` (backend code into `dist/server`).
- **Runtime Serving:** Express listens on `process.env.PORT`, serves `/api/*` REST endpoints, and serves `dist/client` static assets with SPA fallback for all browser routes.
- **Port Uniformity:** Eliminates CORS issues in production since both UI and API share the exact same host and port.
