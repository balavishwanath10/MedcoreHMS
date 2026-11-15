# MedCoreHMS — Security Architecture and Sensitive Data Protection Plan

**Project:** MedCoreHMS
**Compliance Targets:** HIPAA Security Rule, GDPR (Health Data), ISO 27001
**Date:** 2026-11-15

---

## 1. Security Architecture Principles

MedCoreHMS is designed to handle highly sensitive Protected Health Information (PHI) and financial transaction data. The architecture enforces a zero-trust model across all layers.

```
+--------------------------------------------------------------------------+
|                     LAYERED DEFENSE IN DEPTH                             |
|                                                                          |
|   1. Transport Security       --> TLS 1.3 Strict HTTPS                   |
|   2. Boundary Protection      --> Helmet Headers + Strict CORS           |
|   3. Input Sanitization       --> Zod Runtime Type & Schema Bounds       |
|   4. Tenant Isolation         --> Verified Claims, Never Client Headers  |
|   5. Cryptographic Protection --> Application-Level AES-256-GCM for PHI  |
|   6. Observability Hygiene    --> Zero PHI / Passwords in Logs           |
|   7. Immutability             --> Append-only EMR & Audit Logs           |
+--------------------------------------------------------------------------+
```

---

## 2. Encryption and Cryptographic Controls

### 2.1 Encryption in Transit

- All communication between browser clients and the Express server is forced over **TLS 1.3 / HTTPS**.
- All database communication between the Express backend and the MongoDB Atlas cluster uses **TLS with strict certificate validation**.
- Insecure TLS bypasses or certificate revocation ignore flags are strictly prohibited.

### 2.2 Encryption at Rest

- **MongoDB Atlas Storage Encryption:** Handled via AES-256 volume encryption provided by cloud infrastructure (AWS EBS / GCP Persistent Disk).
- **Application-Level Encryption (ALE) for PHI:**
  - Database volume encryption protects against stolen physical drives, but does _not_ protect data from privileged database administrators or compromised read-only replicas.
  - To fulfill the PRD's `pgcrypto` requirement in MongoDB, sensitive medical fields (`clinicalNotes`, `diagnoses`, `treatmentPlan`, `allergies`) undergo **Application-Level Encryption (ALE)** using AES-256-GCM before being stored in the database.
  - Each encrypted field stores: `{ ciphertext: string, iv: string, authTag: string }`.
  - The cryptographic master key (`PHI_ENCRYPTION_KEY`) is stored in environment variables, never committed to Git, and never stored in MongoDB.

---

## 3. Audit Trails & Observability Hygiene

### 3.1 Immutable Audit Logging

- Every read, update, or deletion of patient records generates an append-only document in the `auditLogs` collection.
- Audit records store:
  - `userId` & `userRole`
  - `hospitalId`
  - `action` (e.g. `PATIENT_RECORD_VIEW`, `PRESCRIPTION_DISPENSE`)
  - `entityType` & `entityId`
  - Timestamp (server-generated)
  - Anonymized client IP and User-Agent
- Audit records are permanent and have no delete API endpoint.

### 3.2 Sensitive Logging Prevention

To prevent credential or medical data leakage in monitoring tools:

- The custom structured logger (`src/server/utils/logger.ts`) enforces automated recursive redaction for keys matching:
  - `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `jwt`, `secret`, `otp`, `authorization`, `cookie`, `ssn`, `creditCard`, `medicalHistory`, `diagnosis`.
- Production logs output structured JSON with sensitive values replaced with `"[REDACTED]"`.
- Production error responses never include stack traces or internal database driver messages.

---

## 4. Web Application Security Controls

1. **Helmet HTTP Headers:**
   - Content Security Policy (CSP) in production.
   - HSTS (`Strict-Transport-Security` with `maxAge: 31536000`).
   - `X-Content-Type-Options: nosniff`.
   - `X-Frame-Options: DENY` (prevents clickjacking).
2. **CORS Hardening:**
   - Strict origin allow-list (`CLIENT_URL`, `http://localhost:5173`, `http://localhost:3000`).
   - Wildcards (`*`) are strictly prohibited in production.
3. **Payload Bounds:**
   - `express.json({ limit: '10mb' })` prevents memory exhaustion denial of service.
   - Zod runtime schema validation rejects unexpected or malicious request parameters.

---

## 5. Authentication, RBAC & Multi-Tenant Implementation (Days 4–6 Verified)

### 5.1 Password & Token Security (Day 4)
- **Bcrypt Hashing:** `src/server/utils/password.ts` enforces salt cost factor 12.
- **Dual-Token System:** `src/server/utils/jwt.ts` issues short-lived 15m access tokens and 7d refresh tokens with unique UUID `jwtid` claims.
- **Safe Cookie Transport:** Refresh tokens are transmitted exclusively via `HttpOnly`, `SameSite: strict`, `secure: true` (in production) cookies.
- **Zero Secret Exposure:** Zero password hashes or refresh tokens are returned in JSON response bodies or logged.

### 5.2 Session Lifecycle & Recovery (Day 5)
- **Token Rotation & Reuse Detection:** `RefreshToken.ts` tracks token families and hashes (`tokenHash`). Attempted reuse of an already-rotated refresh token instantly invalidates all sessions in that token's family.
- **Session Revocation:** `/api/auth/logout` revokes the database token record and clears the cookie.
- **Non-Enumerating Password Reset:** `/api/auth/forgot-password` returns identical responses regardless of whether the submitted email exists.
- **Brute-Force & Rate Limiting:** `rateLimiter.ts` limits auth attempts, and OTP verifications lock out after 5 consecutive failed attempts.

### 5.3 RBAC & Multi-Tenant Isolation (Day 6)
- **9 PRD Roles Enforced:** `requireRole` in `src/server/middleware/rbac.middleware.ts` enforces access control across all 9 roles.
- **Granular Permissions:** `requirePermission` implements least-privilege action boundaries.
- **Multi-Tenant Protection:** `requireTenant` in `src/server/middleware/tenant.middleware.ts` blocks cross-tenant tampering, enforces tenant scope on all operations, and permits `SUPER_ADMIN` platform-wide oversight.
- **Query Scoping & Assertions:** `withTenant` and `assertTenantAccess` in `src/server/utils/tenantScope.ts` enforce intra-tenant query boundaries at the database layer.
