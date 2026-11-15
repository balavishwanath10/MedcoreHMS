# MedCoreHMS — Nine-Role Permission Matrix

**Project:** MedCoreHMS
**Specification:** PRD v1.0 Functional Source of Truth
**Date:** 2026-11-15

---

## 1. Role Definitions

| Role # | Role Identifier  | Scope           | Primary System Responsibility                                                                                     |
| :----- | :--------------- | :-------------- | :---------------------------------------------------------------------------------------------------------------- |
| **1**  | `SUPER_ADMIN`    | Global Platform | Manages hospital tenants, reviews platform audit logs, configures global system settings.                         |
| **2**  | `HOSPITAL_ADMIN` | Hospital Tenant | Onboards hospital staff, manages departments, configures hospital settings and appointment slot defaults.         |
| **3**  | `DOCTOR`         | Hospital Tenant | Conducts encounters, updates clinical EMR notes, writes prescriptions, requests lab orders, manages availability. |
| **4**  | `NURSE`          | Hospital Tenant | Records patient triage vitals, prepares patients for consultation, reviews active prescriptions.                  |
| **5**  | `RECEPTIONIST`   | Hospital Tenant | Registers new patients, books/reschedules appointments, checks patients in at the front desk.                     |
| **6**  | `LAB_TECHNICIAN` | Hospital Tenant | Receives lab orders, logs specimen collection, records parameter results, uploads lab reports.                    |
| **7**  | `PHARMACIST`     | Hospital Tenant | Manages pharmaceutical inventory, dispenses medications from prescriptions, tracks batch expiry (FIFO).           |
| **8**  | `ACCOUNTANT`     | Hospital Tenant | Generates invoices, processes payments, reconciles insurance claims, views financial reports.                     |
| **9**  | `PATIENT`        | Hospital Tenant | Books personal appointments, views personal medical history, downloads prescriptions and paid invoices.           |

---

## 2. Granular Module Permission Matrix

**Legend:**

- `C` = Create
- `R` = Read
- `U` = Update
- `D` = Soft Delete / Void
- `-` = No Access (403 Forbidden)
- `*` = Self / Own Records Only

| Functional Module        | SUPER_ADMIN | HOSPITAL_ADMIN |  DOCTOR   |     NURSE     | RECEPTIONIST | LAB_TECH |   PHARMACIST    | ACCOUNTANT  |  PATIENT   |
| :----------------------- | :---------: | :------------: | :-------: | :-----------: | :----------: | :------: | :-------------: | :---------: | :--------: |
| **Hospital Tenancy**     | C, R, U, D  |       R        |     -     |       -       |      -       |    -     |        -        |      -      |     -      |
| **Departments & Rooms**  |      R      |   C, R, U, D   |     R     |       R       |      R       |    -     |        -        |      -      |     -      |
| **Staff & User Mgmt**    |      R      |   C, R, U, D   |     R     |       -       |      -       |    -     |        -        |      -      |     -      |
| **Patient Demographics** |      -      |       R        |   R, U    |     R, U      |   C, R, U    |    R     |        R        |      R      |   R*, U*   |
| **Appointment Booking**  |      -      |      R, D      |   R, U*   |       R       |  C, R, U, D  |    -     |        -        |      -      | C*, R*, U* |
| **Doctor Availability**  |      -      |      R, U      | C*, R, U* |       R       |      R       |    -     |        -        |      -      |     R      |
| **Vitals & Triage**      |      -      |       -        |   R, U    |    C, R, U    |      R       |    -     |        -        |      -      |     R*     |
| **EMR / Clinical Notes** |      -      |       -        | C, R, U*  | R (read-only) |      -       |    -     |        -        |      -      |     R*     |
| **Prescriptions**        |      -      |       -        | C, R, U*  |       R       |      -       |    -     | R, U (dispense) |      R      |     R*     |
| **Pharmacy Inventory**   |      -      |       R        |     -     |       -       |      -       |    -     |   C, R, U, D    |      R      |     -      |
| **Lab Orders**           |      -      |       -        | C, R, D*  |       R       |      -       |   R, U   |        -        |      -      |     R*     |
| **Lab Results**          |      -      |       -        |     R     |       R       |      -       | C, R, U  |        -        |      -      |     R*     |
| **Invoices & Billing**   |      -      |       R        |     R     |       -       |      R       |    -     |        -        | C, R, U, D  |     R*     |
| **Payments Processing**  |      -      |       R        |     -     |       -       | R (cash/pos) |    -     |        -        |   C, R, U   |  R* (pay)  |
| **Insurance Claims**     |      -      |       R        |     -     |       -       |      -       |    -     |        -        |   C, R, U   |     R*     |
| **Audit Logs**           |   R (All)   |   R (Tenant)   |     -     |       -       |      -       |    -     |        -        | R (Billing) |     -      |

---

## 3. Critical Business & Authorization Rules

1. **EMR Immutability:**
   - Once a clinical encounter is signed and finalized by a `DOCTOR`, neither the Doctor nor the `HOSPITAL_ADMIN` may edit or delete the clinical notes. Corrections must be submitted as distinct append-only addenda.
2. **Prescription Dispensing Lock:**
   - Only a `PHARMACIST` can update a prescription status to `DISPENSED`. Once fully dispensed, the items cannot be dispensed again.
3. **Medical Record Confidentiality:**
   - `RECEPTIONIST`, `ACCOUNTANT`, and `SUPER_ADMIN` have **zero access** to patient clinical notes, diagnoses, or lab results. They view only operational, scheduling, or billing metadata.
4. **Patient Portal Boundaries:**
   - A `PATIENT` can only view records where `patientProfile.userId === req.user.userId`. Cross-patient access attempts are rejected immediately with 403 Forbidden.

---

## 4. Open Questions & Ambiguities Flagged for Future Days

> **OPEN QUESTION 1 (Receptionist Payment Handling):**
> Does the `RECEPTIONIST` role have permission to collect direct upfront consultation fees at the front desk, or is payment recording strictly restricted to the `ACCOUNTANT` role?
> _Proposed Baseline:_ Receptionists may record immediate consultation cash/card payments at check-in, but only Accountants may issue refunds, void invoices, or submit insurance claims.

> **OPEN QUESTION 2 (Nurse Prescription Visibility):**
> Should a `NURSE` be allowed to mark medication as administered during inpatient stays?
> _Proposed Baseline:_ Preserved for Day 7 (EMR module implementation) upon confirming inpatient workflow specs.
