# MedCoreHMS — System Architecture Specification

**Project:** MedCoreHMS
**Version:** 1.0.0-draft
**Architecture Model:** Unified Single-Process MERN Architecture (Option A)
**Date:** 2026-11-15

---

## 1. Architectural Philosophy and Overview

MedCoreHMS is an enterprise-grade Hospital Management System designed to serve multiple autonomous hospital tenants on a single shared infrastructure. The architecture balances strict data isolation, zero data leakage between tenants, regulatory compliance for Protected Health Information (PHI), and operational simplicity for a solo developer.

### Key Architectural Tenets

1. **Unified Application Runtime:** Eliminates project fragmentation by consolidating the client and server within a single root folder, single build step, and single deployment target (Render Web Service).
2. **Explicit Multi-Tenancy:** Data isolation is baked into every database query, schema design, and compound index rather than relying on client-supplied parameters or frontend filtering.
3. **Defense in Depth:** Sensitive clinical information is protected via application-level encryption (AES-256-GCM), sanitized structured logging, strict CORS policies, and Helmet header protection.
4. **Planned Evolution:** Core models and foundational architecture are established on Days 1–3; authentication, background processing, and real-time sockets are structured cleanly for subsequent implementation phases.

---

## 2. Layered Architecture

```
+-------------------------------------------------------------------------------+
| 1. PRESENTATION LAYER (React 19 SPA)                                          |
|    - Vite Bundler & HMR                                                       |
|    - React Router 7 Navigation & Route Guards                                 |
|    - TanStack Query 5 (Async Server State & Stale-While-Revalidate Caching)   |
|    - Zustand 5 (Global UI State & Active Tenant Context)                     |
|    - Tailwind CSS + shadcn/ui Design System Foundation                        |
+-------------------------------------------------------------------------------+
                                       |
                                       | HTTP / REST (Vite Proxy in Dev)
                                       v
+-------------------------------------------------------------------------------+
| 2. API GATEWAY & SECURITY LAYER (Express.js 4)                                |
|    - Helmet HTTP Security Headers (CSP, XSS, HSTS)                           |
|    - Strict Origin CORS Configuration                                         |
|    - Sanitized Request / Response Structured JSON Logger                      |
|    - Centralized Error Handler (Zod, Mongoose, MongoServerError 11000)        |
|    - Route Handlers (/api/health, /api/v1/*)                                  |
|    - SPA Static Asset Server & Fallback (dist/client/)                        |
+-------------------------------------------------------------------------------+
                                       |
                                       | Verified Tenant Context & User Claims
                                       v
+-------------------------------------------------------------------------------+
| 3. DOMAIN SERVICE LAYER (TypeScript Business Logic)                           |
|    - Tenant Isolation Enforcement (Auto-injection of hospitalId)             |
|    - 9-Role Role-Based Access Control (RBAC)                                  |
|    - Clinical Encounter & EMR Immutability Rules                             |
|    - Pharmacy FIFO Inventory Depletion                                        |
|    - Concurrency Control (Double-booking prevention & atomic updates)         |
+-------------------------------------------------------------------------------+
                                       |
                                       | Mongoose ODM 8 / Multi-Document Sessions
                                       v
+-------------------------------------------------------------------------------+
| 4. DATA PERSISTENCE LAYER                                                     |
|    - MongoDB Atlas Managed Cluster (Replica Set ACID Transactions)            |
|    - Strict Schema Validation & Compound Unique Indexes                       |
|    - Soft-Delete Flags (isDeleted) with EMR Permanent Deletion Immunity       |
+-------------------------------------------------------------------------------+
                                       |
                                       | Async Workers & External APIs (Planned)
                                       v
+-------------------------------------------------------------------------------+
| 5. PLANNED EXTERNAL INTEGRATIONS (Days 4+)                                    |
|    - Managed Redis 7 + BullMQ: Background PDF generation & async notifications|
|    - Cloudinary / S3: Encrypted medical attachment object storage             |
|    - Socket.IO: Real-time nurse call bell & appointment queue updates        |
|    - Twilio / Nodemailer: SMS OTP & email notifications                      |
+-------------------------------------------------------------------------------+
```

---

## 3. Implemented vs. Planned Infrastructure

To maintain complete transparency throughout development, the table below delineates current operational status:

| Component / Subsystem                 | Status          | Day Scheduled | Verification Method                                |
| :------------------------------------ | :-------------- | :------------ | :------------------------------------------------- |
| **Unified Project Scaffold**          | **IMPLEMENTED** | Day 1         | Single root package, build & start scripts         |
| **Vite + React 19 Frontend Shell**    | **IMPLEMENTED** | Day 1         | `npm run build:client` creates minified SPA        |
| **Express TypeScript Backend**        | **IMPLEMENTED** | Day 1         | `npm run build:server` compiles cleanly to `dist/` |
| **Health API (`GET /api/health`)**    | **IMPLEMENTED** | Day 1         | In-memory integration tests verify readyState      |
| **Structured Redaction Logger**       | **IMPLEMENTED** | Day 1         | Filters passwords, tokens, and PHI                 |
| **Mongoose Connection Lifecycle**     | **IMPLEMENTED** | Day 1 & 3     | Safe connection, graceful shutdown                 |
| **Core Mongoose Models (5 entities)** | **IMPLEMENTED** | Day 3         | Schema validation & unit test suite                |
| **Seed Architecture**                 | **IMPLEMENTED** | Day 3         | Development seed script foundation                 |
| **JWT Authentication & Refresh**      | **PLANNED**     | Day 4         | Token issuance, rotation, cookie security          |
| **Hospital Onboarding & RBAC**        | **PLANNED**     | Day 5         | Tenant registration, role assignment               |
| **Appointments & Doctor Schedule**    | **PLANNED**     | Day 6         | Slot booking, double-booking prevention            |
| **EMR, Vitals & Prescriptions**       | **PLANNED**     | Day 7         | Encounters, immutable clinical notes               |
| **Laboratory & Results**              | **PLANNED**     | Day 8         | Lab orders, sample tracking, reports               |
| **Pharmacy & FIFO Inventory**         | **PLANNED**     | Day 9         | Stock batches, expiry alerts, dispensing           |
| **Invoicing & Billing**               | **PLANNED**     | Day 10        | Line items, payments, insurance claims             |
| **Redis & BullMQ Background Jobs**    | **PLANNED**     | Day 11        | PDF generation, asynchronous notifications         |
| **Socket.IO Real-time Events**        | **PLANNED**     | Day 12        | Live notifications and queue broadcasts            |
| **Render Web Service Deployment**     | **PLANNED**     | Reserved      | Unified build and single-service deployment        |

---

## 4. Architectural Boundaries and Interfaces

### 4.1 Internal Communication

- Frontend communicates with backend strictly via REST JSON endpoints under `/api/*`.
- Development mode uses Vite proxy to forward requests from `localhost:5173/api` to `localhost:5000/api`.
- In production, Express directly handles `/api/*` and serves frontend static assets for all other paths.

### 4.2 Security Boundaries

- **CORS Allow-List:** In development, only `localhost:5173`, `localhost:3000`, and `CLIENT_URL` are permitted.
- **Tenant Context:** Authentication middleware extracts `hospitalId` from verified claims; controllers never accept `hospitalId` from `req.body` or `req.query` to prevent privilege escalation.
- **Error Sanitization:** Stack traces and internal database errors are completely suppressed in production responses.
