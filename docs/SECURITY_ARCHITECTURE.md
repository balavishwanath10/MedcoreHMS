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
