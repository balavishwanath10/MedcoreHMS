# Day 18 Completion Report: Billing, Invoices & Payment Foundation

**Project:** MedCoreHMS  
**Repository:** https://github.com/balavishwanath10/MedCoreHMS.git  
**Branch:** `main`  
**Milestone:** Day 18 of 18 — Billing, Invoices & Payment Foundation  
**Date:** 2026-11-22  

---

## 1. Executive Summary

Day 18 implements the complete clinical billing, itemized invoice generation, payment transaction reconciliation, and cryptographically verified payment webhook infrastructure for MedCoreHMS. 

The subsystem automates the consolidation of hospital care charges—including doctor consultation fees, diagnostic laboratory orders, and prescribed medications—into unified itemized invoices. It supports multi-channel payment reconciliation (Cash at counter, online Stripe/Razorpay gateways, and third-party administrator TPA insurance claims), enforces strict idempotency key checks to prevent duplicate charging, and verifies incoming gateway webhooks using HMAC-SHA256 digital signatures.

All implementations adhere strictly to the unified single Render deployment service, unified MERN/Mongoose repository structure, and multi-tenant patient privacy boundaries.

---

## 2. Key Architecture & Deliverables

### A. Data Models & Schemas

1. **`Invoice` (`src/server/models/Invoice.ts`)**:
   - Represents patient invoices for hospital encounters, clinical consultations, medications, and laboratory tests.
   - Fields:
     - `hospitalId`: Tenant isolation key.
     - `patientId`: Reference to `PatientProfile`.
     - `encounterId`: Optional linkage to clinical `Encounter`.
     - `invoiceNumber`: Human-readable sequential reference (e.g. `INV-2026-XXXX`).
     - `lineItems`: Array of structured line item subdocuments:
       - `itemType`: `'CONSULTATION' | 'PHARMACY' | 'LABORATORY' | 'PROCEDURE' | 'ROOM_BED' | 'OTHER'`.
       - `description`: Textual item description.
       - `quantity`, `unitPrice`, `amount`, and `referenceId`.
     - `subtotal`: Server-computed sum of all item charges.
     - `taxAmount`: Server-calculated tax (e.g. 5%).
     - `discountAmount`: Concessions or insurance copay adjustments.
     - `totalAmount`: Final net invoice payable amount.
     - `paidAmount`: Accumulated payments received against the invoice.
     - `balanceDue`: Real-time remaining unpaid balance.
     - `status`: `'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED' | 'VOID'`.
     - `tpaClaim`: Optional structured insurance claim details (`providerName`, `policyNumber`, `claimAmount`, `claimStatus`, `approvedAmount`).
     - `issuedAt`, `dueDate`, `paidAt`, `isDeleted`.
   - Compound indexes:
     - `{ hospitalId: 1, invoiceNumber: 1 }` (unique).
     - `{ hospitalId: 1, patientId: 1, createdAt: -1 }`.
     - `{ hospitalId: 1, status: 1 }`.
     - `{ hospitalId: 1, encounterId: 1 }`.

2. **`PaymentTransaction` (`src/server/models/PaymentTransaction.ts`)**:
   - Immutable financial transaction record.
   - Fields:
     - `hospitalId`, `invoiceId`, `patientId`.
     - `paymentMethod`: `'CASH' | 'STRIPE' | 'RAZORPAY' | 'INSURANCE_TPA'`.
     - `amount`: Payment sum.
     - `currency`: Default `'USD'`.
     - `transactionReference`: Internal reference identifier.
     - `gatewayTransactionId`: Online gateway reference (e.g. Stripe `pi_xxx`).
     - `status`: `'PENDING' | 'SUCCESS' | 'FAILED'`.
     - `idempotencyKey`: Client or gateway supplied deduplication key.
     - `recordedBy`: User ID or `'GATEWAY_WEBHOOK'`.
     - `recordedAt`, `isDeleted`.
   - Compound indexes:
     - `{ hospitalId: 1, invoiceId: 1 }`.
     - `{ hospitalId: 1, patientId: 1, createdAt: -1 }`.
     - `{ hospitalId: 1, idempotencyKey: 1 }` (unique, sparse).

3. **Shared Types & Zod Schemas (`src/shared/types/index.ts`, `src/shared/schemas/index.ts`)**:
   - Exported `InvoiceStatus`, `InvoiceLineItemType`, `PaymentMethod`, `PaymentStatus`, `IInvoiceLineItem`, `ITpaClaimDetails`, `IInvoice`, `IPaymentTransaction`.
   - `invoiceCreateSchema`: Validates patient, line items, discounts, tax rates, and TPA details.
   - `paymentRecordSchema`: Validates payment method, positive payment amount, currency, and idempotency key.

---

### B. Controller & Business Logic

1. **Billing Controller (`src/server/controllers/billing.controller.ts`)**:
   - `createInvoice`: Computes line items, subtotal, taxes, and balance due on the server side to guarantee arithmetic integrity. Automatically increments `invoiceNumber` per tenant.
   - `generateFromEncounter` (`POST /api/billing/invoices/generate-from-encounter/:encounterId`):
     - Automatically aggregates consultation fee, all diagnostic laboratory orders associated with the encounter, and all prescribed medications.
     - Assembles itemized line items with quantities, unit prices, and references, applying standard tax rates.
   - `recordPayment` (`POST /api/billing/invoices/:id/payments`):
     - Validates tenant boundary and ensures invoice is not already paid (`INVOICE_ALREADY_PAID`).
     - Idempotency verification: Detects matching `idempotencyKey` and returns existing transaction without double deduction.
     - Updates invoice `paidAmount` and `balanceDue`. Transitions status to `'PARTIALLY_PAID'` or `'PAID'` (when balance reaches 0).
     - Records audit event `BILLING_PAYMENT_RECORD`.
   - `handlePaymentWebhook` (`POST /api/billing/webhook/stripe` & `POST /api/billing/webhook/payment`):
     - Cryptographic verification: Validates incoming HMAC-SHA256 signature using `process.env.PAYMENT_WEBHOOK_SECRET`. Rejects invalid or forged signatures with 401 `INVALID_WEBHOOK_SIGNATURE`.
     - Idempotency protection: Deduplicates webhooks using `idempotencyKey`.
     - Processes `payment_intent.succeeded` events, applies payment to invoice, and updates status to `'PAID'`.
   - `getInvoices` & `getInvoiceById`:
     - Patient privacy boundary: Patients querying invoices only receive their own records. Cross-hospital access returns 403 `CROSS_TENANT_ACCESS_DENIED`.

---

### C. Frontend Interface

- **`src/client/pages/BillingPage.tsx`**:
  - **Invoices & Payments Tab**: Displays all patient invoices with status badges, paid/balance progress, quick "Pay" action, and "Details" view.
  - **Encounter Aggregator Tab**: Interactive list of clinical encounters with 1-click "Aggregate Invoice" action.
  - **TPA Insurance Claims Tab**: Dedicated view of invoices linked to Third-Party Administrator claims with policy numbers, claim amounts, and claim status.
  - **Payment Modal**: Counter payment entry supporting Cash, Stripe, Razorpay, and TPA claims.
  - **Itemized Invoice Modal**: Line item breakdown, tax/discount display, and transaction payment history.
  - **Manual Invoice Modal**: Custom line-item invoice creation.
- **Client API Integration (`src/client/services/api.ts`)**: `fetchInvoices`, `fetchInvoiceById`, `createInvoice`, `generateInvoiceFromEncounter`, `recordInvoicePayment`, `fetchInvoicePayments`.
- **Navigation**: Registered `/billing` route in `App.tsx` and added "Billing & Invoices" link with `CreditCard` icon in `Layout.tsx`.

---

## 3. Verification & Test Results

### Test Suite: `tests/integration/billing-payments-day18.test.ts`
- **Total Tests:** 13 passing.
- **Coverage Areas:**
  - Invoice creation with server-computed subtotal, 5% tax, discount, and balance due.
  - Unique human-readable `invoiceNumber` generation.
  - Clinical encounter auto-aggregation: Compiling consultation fee, laboratory tests, and prescriptions into line items.
  - Patient privacy boundary: Restricting patient queries strictly to their own invoices.
  - Patient access denial: Forbidding patients from viewing other patients' invoices by ID (403 `FORBIDDEN`).
  - Partial payment recording: Correct decrement of `balanceDue` and transition to `PARTIALLY_PAID`.
  - Full payment completion: Transition of status to `PAID` upon zero balance.
  - Overpayment guard: Rejection of payment attempts on already fully paid invoices.
  - Idempotency key protection: Safe deduplication preventing double payment.
  - Webhook security: Rejection of webhooks missing cryptographic signature headers (400 `MISSING_SIGNATURE`).
  - Webhook security: Rejection of invalid or forged HMAC-SHA256 signatures (401 `INVALID_WEBHOOK_SIGNATURE`).
  - Webhook execution: Successful processing of valid HMAC-SHA256 signed `payment_intent.succeeded` events.
  - Cross-hospital multi-tenant isolation denial (403 `CROSS_TENANT_ACCESS_DENIED`).

### Full Project Regression
- **Total Unit & Integration Tests:** 23 test files, 263 tests passing (100%).
- **TypeScript Typecheck:** Clean pass (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`).
- **Prettier Code Formatting:** 100% compliant.
- **Production Build:** Succeeded (`vite build` + server build).
