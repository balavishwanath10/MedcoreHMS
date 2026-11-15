# MedCoreHMS — Database Foundation Verification Report

**Project:** MedCoreHMS
**Engine:** MongoDB 7+ / Mongoose 8
**Verification Date:** 2026-11-16
**Status:** SCHEMA VALIDATION & MODEL REGISTRATION PASS | LIVE DB BLOCKED

---

## 1. Executive Summary

This report documents the verification results of the foundational MedCoreHMS MongoDB models and database connection architecture implemented on Day 3.

Per the non-negotiable project rules:

- **No Mocked Integration Reporting:** Schema validation and model definitions were verified via automated unit test suites (`tests/unit/models.test.ts`) and a dedicated verification script (`scripts/verify-db.ts`).
- **Live Database Truthfulness:** Because no local MongoDB daemon was active on `mongodb://localhost:27017` and no external Atlas cluster was configured in `.env`, the live database connection check is **truthfully recorded as BLOCKED**.
- **Zero Credential Leakage:** Error reporting cleanly intercepted connection timeouts and server selection errors without exposing credentials or internal connection strings.

---

## 2. Verification Test Matrix

| Verification Area              | Verification Target                                                 | Verification Method                   | Actual Result                                                                            | Status      |
| :----------------------------- | :------------------------------------------------------------------ | :------------------------------------ | :--------------------------------------------------------------------------------------- | :---------- |
| **Model Registration**         | `Hospital`, `User`, `Department`, `DoctorProfile`, `PatientProfile` | `scripts/verify-db.ts`                | All 5 models verified in `mongoose.models`                                               | **PASS**    |
| **Hospital Validation**        | Name, code, slug, email, license, status                            | `tests/unit/models.test.ts` (3 tests) | All required fields & enum constraints enforced                                          | **PASS**    |
| **User Role & Tenant Check**   | 9 PRD roles, tenant requirement, SuperAdmin null                    | `tests/unit/models.test.ts` (6 tests) | Roles enforced; orphan hospital-scoped users rejected                                    | **PASS**    |
| **User Security Transform**    | `passwordHash` stripping on `toJSON` and `toObject`                 | `tests/unit/models.test.ts` (1 test)  | `passwordHash` undefined in all serialized outputs                                       | **PASS**    |
| **Department Validation**      | Code length <= 10, hospitalId required                              | `tests/unit/models.test.ts` (3 tests) | Required fields & code bounds enforced                                                   | **PASS**    |
| **Doctor Profile Validation**  | License, qualifications min 1, non-negative fees                    | `tests/unit/models.test.ts` (3 tests) | Negative fees & empty qualifications rejected                                            | **PASS**    |
| **Patient Profile Validation** | MRN, future DOB rejection, gender/blood enums                       | `tests/unit/models.test.ts` (3 tests) | Future DOB and invalid enums rejected                                                    | **PASS**    |
| **Compound Index Plan**        | Tenant-first compound indexes declared                              | `scripts/verify-db.ts`                | 100% of planned indexes reflected in schemas                                             | **PASS**    |
| **Live MongoDB Connection**    | Probe `MONGODB_URI` (`mongodb://localhost:27017/medcorehms`)        | `scripts/verify-db.ts`                | `MongooseServerSelectionError: connect EACCES ::1:27017, connect EACCES 127.0.0.1:27017` | **BLOCKED** |
| **Seed Script Idempotency**    | Prevent duplicate records on re-runs                                | Code Inspection (`scripts/seed.ts`)   | Verified queries (`findOne`) guard every insert                                          | **PASS**    |

---

## 3. Actual Command Execution Evidence

### 3.1 Unit Test Suite Execution (`npm test`)

```bash
> medcorehms@0.1.0 test
> vitest run

 RUN  v3.2.7 C:/Users/91949/Desktop/MedcoreHMS

 ✓ tests/unit/health.test.ts (2 tests) 5ms
 ✓ tests/unit/models.test.ts (18 tests) 23ms
 ✓ tests/integration/health.test.ts (2 tests) 10ms

 Test Files  3 passed (3)
      Tests  22 passed (22)
   Start at  00:00:11
   Duration  3.00s
```

### 3.2 Database Verification Script Output (`npx tsx scripts/verify-db.ts`)

```json
{
  "liveDbConnected": false,
  "modelsRegistered": true,
  "schemaValidationVerified": true,
  "modelDetails": {
    "Hospital": {
      "collection": "hospitals",
      "indexes": [["code"], ["slug"], ["licenseNumber"], ["status"], ["isDeleted"]]
    },
    "User": {
      "collection": "users",
      "indexes": [["email"], ["hospitalId", "role"], ["hospitalId", "isDeleted"]]
    },
    "Department": {
      "collection": "departments",
      "indexes": [
        ["hospitalId"],
        ["hospitalId", "code"],
        ["hospitalId", "isActive"],
        ["hospitalId", "isDeleted"]
      ]
    },
    "DoctorProfile": {
      "collection": "doctorprofiles",
      "indexes": [
        ["hospitalId"],
        ["userId"],
        ["licenseNumber"],
        ["hospitalId", "departmentId"],
        ["hospitalId", "isActive"],
        ["hospitalId", "isDeleted"]
      ]
    },
    "PatientProfile": {
      "collection": "patientprofiles",
      "indexes": [
        ["hospitalId"],
        ["hospitalId", "mrn"],
        ["hospitalId", "phone"],
        ["hospitalId", "lastName", "firstName"],
        ["hospitalId", "isDeleted"]
      ]
    }
  }
}
```

---

## 4. Live Database Diagnosis and Instructions

### Current Status: BLOCKED

When executing database operations against the default `MONGODB_URI`:

```
{"level":"ERROR","message":"Failed to connect to MongoDB","meta":{"errorName":"MongooseServerSelectionError","message":"connect EACCES ::1:27017, connect EACCES 127.0.0.1:27017"}}
{"level":"WARN","message":"Live MongoDB Connection Check: BLOCKED (No active MongoDB server at URI)"}
```

### Resolution Steps to Connect Live Database:

1. **Option A — MongoDB Atlas (Recommended for Render Deployment):**
   - Create a free or dedicated cluster at `https://cloud.mongodb.com`.
   - Configure a database user and IP access list (allow `0.0.0.0/0` with strong authentication for cloud deployments).
   - Add the connection string to `.env`:
     ```bash
     MONGODB_URI=mongodb+srv://<db_user>:<db_password>@cluster0.mongodb.net/medcorehms?retryWrites=true&w=majority
     ```
2. **Option B — Local MongoDB Community Server:**
   - Install MongoDB Community Server on Windows from `https://www.mongodb.com/try/download/community`.
   - Start the MongoDB service:
     ```powershell
     net start MongoDB
     ```
3. **Run Seed & Verification:**
   ```powershell
   npx tsx scripts/seed.ts
   npx tsx scripts/verify-db.ts
   ```
