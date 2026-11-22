import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Invoice } from '../../src/server/models/Invoice.js';
import { PaymentTransaction } from '../../src/server/models/PaymentTransaction.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { LabOrder } from '../../src/server/models/LabOrder.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 18: Billing, Invoices & Verified Payment Processing Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const accountantUserId = new mongoose.Types.ObjectId().toString();
  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const encounterId = new mongoose.Types.ObjectId().toString();
  const invoiceId = new mongoose.Types.ObjectId().toString();
  const transactionId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = accountantUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-a.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/billing/invoices (Invoice Creation & Calculation)', () => {
    it('should calculate subtotal, taxes, discounts, and generate invoice number', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockPatient = {
        _id: patientProfileId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatient as any);
      vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(5 as any);
      vi.spyOn(Invoice, 'create').mockImplementation(async (data: any) => ({
        _id: invoiceId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const payload = {
        patientId: patientProfileId,
        lineItems: [
          {
            itemType: 'CONSULTATION',
            description: 'Cardiology Specialist Consultation',
            quantity: 1,
            unitPrice: 100,
          },
          {
            itemType: 'PHARMACY',
            description: 'Amoxicillin 500mg (10 tabs)',
            quantity: 2,
            unitPrice: 20, // 40
          },
        ],
        discountAmount: 10, // subtotal = 140 - 10 = 130
        taxRatePercent: 5, // 5% of 130 = 6.50 -> total = 136.50
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/invoices',
        headers: { authorization: `Bearer ${accountantToken}` },
        body: payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      const inv = res.body.data;
      expect(inv.invoiceNumber).toBe(`INV-${new Date().getFullYear()}-0006`);
      expect(inv.subtotal).toBe(140);
      expect(inv.discountAmount).toBe(10);
      expect(inv.taxAmount).toBe(6.5);
      expect(inv.totalAmount).toBe(136.5);
      expect(inv.paidAmount).toBe(0);
      expect(inv.balanceDue).toBe(136.5);
      expect(inv.status).toBe('ISSUED');
    });

    it('should reject invoice creation without patient profile in hospital', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(null);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/invoices',
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          patientId: patientProfileId,
          lineItems: [
            { itemType: 'CONSULTATION', description: 'Consultation', quantity: 1, unitPrice: 50 },
          ],
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.body.error.code).toBe('PATIENT_NOT_FOUND');
    });
  });

  describe('POST /api/billing/invoices/generate-from-encounter/:encounterId (Auto-Aggregation)', () => {
    it('should automatically compile consultation, lab orders, and prescriptions from encounter', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockEncounter = {
        _id: encounterId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        type: 'OPD_SPECIALIST',
        isDeleted: false,
      };

      const mockLabOrders = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          hospitalId: hospitalAId,
          tests: [{ testCode: 'CBC', testName: 'Complete Blood Count' }],
        },
      ];

      const mockPrescriptions = [
        {
          _id: new mongoose.Types.ObjectId().toString(),
          hospitalId: hospitalAId,
          items: [
            { medicineName: 'Paracetamol', dosage: '500mg', durationDays: 3, frequency: 'BD' },
          ], // 3 * 2 = 6 units
        },
      ];

      vi.spyOn(Encounter, 'findOne').mockResolvedValue(mockEncounter as any);
      vi.spyOn(LabOrder, 'find').mockResolvedValue(mockLabOrders as any);
      vi.spyOn(Prescription, 'find').mockResolvedValue(mockPrescriptions as any);
      vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(10 as any);
      vi.spyOn(Invoice, 'create').mockImplementation(async (data: any) => ({
        _id: invoiceId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/generate-from-encounter/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      const inv = res.body.data;
      expect(inv.lineItems.length).toBe(3);
      expect(inv.lineItems[0].itemType).toBe('CONSULTATION');
      expect(inv.lineItems[1].itemType).toBe('LABORATORY');
      expect(inv.lineItems[2].itemType).toBe('PHARMACY');
      expect(inv.status).toBe('ISSUED');
    });
  });

  describe('GET /api/billing/invoices (Listing & Patient Privacy)', () => {
    it('should restrict patients to strictly accessing their own invoices', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const mockPatientInvoices = [
        {
          _id: invoiceId,
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          invoiceNumber: 'INV-2026-0001',
          totalAmount: 120,
        },
      ];

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(Invoice, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockPatientInvoices),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/billing/invoices',
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });

    it('should forbid patients from viewing another patient invoice by ID', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const otherPatientInvoice = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: otherPatientProfileId, // Different patient!
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(Invoice, 'findOne').mockResolvedValue(otherPatientInvoice as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/billing/invoices/${invoiceId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/billing/invoices/:id/payments (Payment Recording & Status)', () => {
    it('should record partial payment and transition status to PARTIALLY_PAID', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 100,
        paidAmount: 0,
        balanceDue: 100,
        status: 'ISSUED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'create').mockImplementation(async (data: any) => ({
        _id: transactionId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 40,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      expect(mockInvoice.paidAmount).toBe(40);
      expect(mockInvoice.balanceDue).toBe(60);
      expect(mockInvoice.status).toBe('PARTIALLY_PAID');
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    it('should record full payment and transition status to PAID', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 100,
        paidAmount: 40,
        balanceDue: 60,
        status: 'PARTIALLY_PAID',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'create').mockImplementation(async (data: any) => ({
        _id: transactionId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'STRIPE',
          amount: 60,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(mockInvoice.paidAmount).toBe(100);
      expect(mockInvoice.balanceDue).toBe(0);
      expect(mockInvoice.status).toBe('PAID');
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    it('should reject payment on an invoice that is already PAID in full', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const paidInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        status: 'PAID',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(paidInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 20,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVOICE_ALREADY_PAID');
    });

    it('should prevent double payments when submitting duplicate idempotencyKey', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 100,
        paidAmount: 50,
        balanceDue: 50,
        status: 'PARTIALLY_PAID',
        isDeleted: false,
      };

      const existingTx = {
        _id: transactionId,
        hospitalId: hospitalAId,
        idempotencyKey: 'IDEMP-DUP-12345',
        amount: 50,
        status: 'SUCCESS',
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(existingTx as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 50,
          idempotencyKey: 'IDEMP-DUP-12345',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.message).toContain('already processed with this idempotency key');
    });
  });

  describe('POST /api/billing/webhook/stripe (Cryptographic Webhook Verification)', () => {
    const webhookSecret =
      process.env.PAYMENT_WEBHOOK_SECRET || 'whsec_medcore_payment_webhook_secret';

    it('should reject webhook request missing signature header', async () => {
      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        body: { type: 'payment_intent.succeeded' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MISSING_SIGNATURE');
    });

    it('should reject webhook request with invalid HMAC signature', async () => {
      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: {
          'stripe-signature': 'invalid_signature_hash_xyz',
        },
        body: { type: 'payment_intent.succeeded' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('should accept valid HMAC-SHA256 signed webhook and update invoice to PAID', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 150.0,
          gatewayTransactionId: 'pi_test_3N2j8492hf',
          idempotencyKey: 'wh_idemp_9999',
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const validSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 150.0,
        paidAmount: 0,
        balanceDue: 150.0,
        status: 'ISSUED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(PaymentTransaction, 'create').mockResolvedValue({} as any);
      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: {
          'stripe-signature': validSignature,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('processed');
      expect(mockInvoice.status).toBe('PAID');
      expect(mockInvoice.paidAmount).toBe(150.0);
      expect(mockInvoice.balanceDue).toBe(0);
      expect(mockInvoice.save).toHaveBeenCalled();
    });
  });

  describe('Multi-Tenant Isolation in Billing', () => {
    it('should deny accountant from Hospital B from recording payment for Hospital A invoice', async () => {
      const hospitalBAccountantToken = createToken(ROLES.ACCOUNTANT, hospitalBId);

      const mockInvoiceHospitalA: any = {
        _id: invoiceId,
        hospitalId: hospitalAId, // Hospital A
        status: 'ISSUED',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoiceHospitalA);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${hospitalBAccountantToken}` },
        body: { paymentMethod: 'CASH', amount: 50 },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });
});
