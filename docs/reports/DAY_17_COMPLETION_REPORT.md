# Day 17 Completion Report: Pharmacy Inventory & Expiry Management

**Project:** MedCoreHMS  
**Repository:** https://github.com/balavishwanath10/MedCoreHMS.git  
**Branch:** `main`  
**Milestone:** Day 17 of 18 — Pharmacy Inventory & Expiry Management  
**Date:** 2026-11-22  

---

## 1. Executive Summary

Day 17 implements the pharmacy inventory, batch management, First-In-First-Out (FIFO) prescription dispensing engine, and automated expiry tracking for MedCoreHMS. The subsystem establishes strict control over pharmaceutical inventory batches, preventing stock degradation, stockouts, and dispensing of expired medications.

The FIFO engine consumes medicine batches in strict order of earliest expiration date, ensuring optimal inventory turnover. Batches marked as `EXPIRED` or `QUARANTINED` are strictly excluded from dispensing. A 30-day early-warning expiration monitor enables pharmacy staff to take proactive measures before stocks perish.

All deliverables maintain the unified single-root MERN/Mongoose architecture, multi-tenant isolation, and RBAC controls.

---

## 2. Key Architecture & Deliverables

### A. Data Models & Schemas

1. **`InventoryBatch` (`src/server/models/InventoryBatch.ts`)**:
   - Represents physical pharmaceutical batches received into a hospital pharmacy.
   - Fields:
     - `hospitalId`: Tenant isolation key.
     - `medicineId`: Reference to `Medicine` catalogue item.
     - `medicineName`: Denormalized medicine name for fast querying and reporting.
     - `batchNumber`: Manufacturer batch/lot identifier.
     - `expiryDate`: Medication expiration date (indexed for FIFO sorting).
     - `manufactureDate`: Optional manufacture date.
     - `quantityReceived`: Initial received stock quantity.
     - `quantityAvailable`: Real-time remaining stock quantity.
     - `unitCost`: Procurement cost per unit.
     - `mrp`: Maximum Retail Price charged per unit.
     - `status`: `'ACTIVE' | 'EXPIRED' | 'QUARANTINED' | 'DEPLETED'`.
     - `reorderThreshold`: Stock warning threshold (default: 20).
     - `locationRack`: Storage rack or bin location identifier.
     - `supplier`: Wholesaler or manufacturer name.
     - `isDeleted`: Soft deletion flag.
   - Compound indexes:
     - `{ hospitalId: 1, medicineId: 1, expiryDate: 1 }`: Primary index supporting FIFO queue lookups.
     - `{ hospitalId: 1, status: 1, expiryDate: 1 }`: Supports 30-day expiry query and automated scans.
     - `{ hospitalId: 1, batchNumber: 1, medicineId: 1 }` (unique): Prevents duplicate batch entry.

2. **Shared Types & Zod Schemas (`src/shared/types/index.ts`, `src/shared/schemas/index.ts`)**:
   - Types: `BatchStatus`, `IInventoryBatch`, `IDispensedBatchAllocation`, `IDispenseItemResult`, `IDispenseReceipt`.
   - `inventoryBatchCreateSchema`: Validates batch payload (medicine, batch number, dates, quantities, pricing).
   - `inventoryBatchUpdateSchema`: Validates updates to cost, MRP, thresholds, and status.
   - `batchQuarantineSchema`: Enforces mandatory quarantine reason of at least 3 characters.
   - `dispensePrescriptionSchema`: Validates optional dispensing item overrides and clinical notes.

---

### B. Business Logic & FIFO Dispensing Engine

1. **FIFO Dispensing Engine (`src/server/controllers/pharmacy.controller.ts`)**:
   - `dispensePrescription` (`POST /api/pharmacy/dispense/:prescriptionId`):
     - Validates tenant hospital boundary and prescription status. Rejects already `DISPENSED` or `CANCELLED` prescriptions.
     - Resolves requested item quantities from duration and daily frequency (OD=1, BD=2, TDS=3, QID=4, SOS=1).
     - Pre-flight stock verification: Queries active, non-expired, non-quarantined batches sorted by earliest expiry (`expiryDate: 1`). If total non-expired stock across valid batches is less than required, halts atomically with 400 `INSUFFICIENT_STOCK`.
     - Allocation: Iterates through batches in FIFO order, taking `min(batch.quantityAvailable, remaining)`. Decrements batch quantity; when quantity reaches 0, transitions batch status to `DEPLETED`.
     - Transitions parent `Prescription` status to `DISPENSED`.
     - Logs audit event `PHARMACY_PRESCRIPTION_DISPENSED`.
     - Returns an itemized `IDispenseReceipt` detailing exact batches consumed and grand total.

2. **Expiry Management & Quarantine Workflows**:
   - `getExpiringBatches` (`GET /api/pharmacy/batches/expiring`): Lists active stock expiring within 30 days.
   - `quarantineExpiredBatches` (`POST /api/pharmacy/batches/scan-expired`): Batch scan that identifies all batches with `expiryDate <= now` and marks them `EXPIRED`.
   - `quarantineBatch` (`PATCH /api/pharmacy/batches/:id/quarantine`): Manual quarantine for damaged or recalled lots with mandatory clinical explanation.

---

### C. Frontend Interface

- **`src/client/pages/PharmacyPage.tsx`**:
  - **Inventory Stock Tab**: Interactive table with real-time stock levels, reorder warnings, MRP, rack locations, and quarantine triggers.
  - **FIFO Dispensing Queue Tab**: Real-time queue of issued prescriptions. One-click "Dispense (FIFO)" action opens an itemized receipt showing exact batch allocations and totals.
  - **30-Day Expiry Alerts Tab**: Filtered view with days-remaining countdown badges, expiry warnings, and "Scan & Expire Past Batches" automation trigger.
  - **Modals**: "Receive New Batch" form and "Quarantine Batch" modal with mandatory reason.
- **Client API Integration (`src/client/services/api.ts`)**: `fetchBatches`, `fetchExpiringBatches`, `addInventoryBatch`, `updateInventoryBatch`, `quarantineBatch`, `scanAndExpireBatches`, `dispensePrescription`.
- **Navigation**: Registered `/pharmacy` route in `App.tsx` and added "Pharmacy & Inventory" link with `Package` icon in `Layout.tsx`.

---

## 3. Verification & Test Results

### Test Suite: `tests/integration/pharmacy-fifo-day17.test.ts`
- **Total Tests:** 12 passing.
- **Coverage Areas:**
  - Inventory batch listing and 30-day expiry filtering.
  - Batch registration with formulary medicine verification.
  - Uniqueness constraint: Rejecting duplicate batch numbers per medicine.
  - RBAC: Rejecting unauthorized roles (e.g. Patient) from registering batches.
  - Quarantine workflow: Transitioning status to `QUARANTINED` with mandatory reason validation.
  - Expiry scan automation: Identifying past-due batches and setting status to `EXPIRED`.
  - FIFO allocation verification: Depleting earliest expiring batch first before touching later batches.
  - State tracking: Correct transition to `DEPLETED` upon zero stock and `DISPENSED` on prescription.
  - Stock protection: Atomic rejection with `INSUFFICIENT_STOCK` when requested quantity exceeds available stock.
  - Idempotency / guard: Rejecting dispensing of already dispensed prescriptions.
  - Cross-hospital multi-tenant isolation.

### Full Project Regression
- **Total Unit & Integration Tests:** 22 test files, 250 tests passing (100%).
- **TypeScript Typecheck:** Clean pass (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`).
- **Prettier Code Formatting:** 100% compliant.
- **Production Build:** Succeeded (`vite build` + server build).
