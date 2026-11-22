import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { Invoice } from '../../src/server/models/Invoice.js';
import { PaymentTransaction } from '../../src/server/models/PaymentTransaction.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Payment Security & Cryptographic Webhook Reconciliation Remediation Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const accountantUserId = new mongoose.Types.ObjectId().toString();
  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();
  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const invoiceId = new mongoose.Types.ObjectId().toString();
  const transactionId = new mongoose.Types.ObjectId().toString();

  const webhookSecret =
    process.env.PAYMENT_WEBHOOK_SECRET || 'whsec_medcore_payment_webhook_secret';

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = accountantUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-test.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cryptographic Webhook Signature Verification (Stripe & Razorpay)', () => {
    it('should reject webhook request missing signature header (400)', async () => {
      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        body: { type: 'payment_intent.succeeded' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MISSING_SIGNATURE');
    });

    it('should verify standard Stripe header with timestamp and v1 signature (200)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 250.0,
          gatewayTransactionId: 'pi_remediation_stripe_001',
          idempotencyKey: 'wh_rem_stripe_001',
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHash = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${rawPayload}`)
        .digest('hex');

      const stripeSignatureHeader = `t=${timestamp},v1=${signatureHash}`;

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 250.0,
        paidAmount: 0,
        balanceDue: 250.0,
        status: 'ISSUED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(PaymentTransaction, 'create').mockResolvedValue({ _id: transactionId } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: {
          'stripe-signature': stripeSignatureHeader,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.status).toBe('processed');
      expect(mockInvoice.status).toBe('PAID');
      expect(mockInvoice.balanceDue).toBe(0);
      expect(mockInvoice.save).toHaveBeenCalled();
    });

    it('should reject Stripe webhook replay attack with expired timestamp > 300s (401)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 100.0,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s old (> 300s tolerance)
      const staleSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${staleTimestamp}.${rawPayload}`)
        .digest('hex');

      const stripeSignatureHeader = `t=${staleTimestamp},v1=${staleSignature}`;

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: {
          'stripe-signature': stripeSignatureHeader,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('should reject tampered payload when signature does not match (401)', async () => {
      const originalPayload = {
        type: 'payment_intent.succeeded',
        data: { invoiceId, amount: 100.0 },
      };

      const timestamp = Math.floor(Date.now() / 1000);
      const signatureHash = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${timestamp}.${JSON.stringify(originalPayload)}`)
        .digest('hex');

      const tamperedPayload = {
        type: 'payment_intent.succeeded',
        data: { invoiceId, amount: 9999.0 }, // Tampered amount!
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: {
          'stripe-signature': `t=${timestamp},v1=${signatureHash}`,
        },
        body: tamperedPayload,
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    });

    it('should verify Razorpay webhook via x-razorpay-signature header (200)', async () => {
      const payload = {
        type: 'payment.captured',
        data: {
          invoiceId,
          amount: 175.0,
          gatewayTransactionId: 'pay_rzp_remediation_002',
          idempotencyKey: 'wh_rzp_002',
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const rzpSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawPayload)
        .digest('hex');

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 175.0,
        paidAmount: 0,
        balanceDue: 175.0,
        status: 'ISSUED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      vi.spyOn(PaymentTransaction, 'create').mockResolvedValue({ _id: transactionId } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/payment',
        headers: {
          'x-razorpay-signature': rzpSignature,
        },
        body: payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(mockInvoice.status).toBe('PAID');
    });
  });

  describe('Webhook-to-Invoice Reconciliation Controls', () => {
    it('should reject webhook if tenant hospital does not match invoice tenant (403)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 100.0,
          hospitalId: hospitalBId, // Mismatched tenant hospital!
        },
      };

      const rawPayload = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId, // Belongs to Hospital A!
        patientId: patientProfileId,
        totalAmount: 100.0,
        paidAmount: 0,
        balanceDue: 100.0,
        status: 'ISSUED',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: { 'stripe-signature': sig },
        body: payload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should reject webhook if patient ID in event does not match invoice patient (400)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 100.0,
          hospitalId: hospitalAId,
          patientId: otherPatientProfileId, // Mismatched patient profile!
        },
      };

      const rawPayload = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        status: 'ISSUED',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: { 'stripe-signature': sig },
        body: payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('PATIENT_MISMATCH');
    });

    it('should gracefully acknowledge already settled invoice without double counting (200 already_paid)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 100.0,
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const paidInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        status: 'PAID',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(paidInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: { 'stripe-signature': sig },
        body: payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('already_paid');
    });

    it('should reject webhook on inactive or cancelled invoice (400)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 100.0,
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const cancelledInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        status: 'CANCELLED',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(cancelledInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: { 'stripe-signature': sig },
        body: payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVOICE_INACTIVE');
    });

    it('should handle duplicate webhook delivery via unique index catch (200 already_processed)', async () => {
      const payload = {
        type: 'payment_intent.succeeded',
        data: {
          invoiceId,
          amount: 50.0,
          idempotencyKey: 'idemp-concurrent-race-11000',
          hospitalId: hospitalAId,
        },
      };

      const rawPayload = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 100.0,
        paidAmount: 0,
        balanceDue: 100.0,
        status: 'ISSUED',
        isDeleted: false,
        save: vi.fn(),
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);
      vi.spyOn(PaymentTransaction, 'findOne').mockResolvedValue(null);
      // Simulate MongoDB duplicate key error E11000 on concurrent race
      const dupError: any = new Error('E11000 duplicate key error collection');
      dupError.code = 11000;
      vi.spyOn(PaymentTransaction, 'create').mockRejectedValue(dupError);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/webhook/stripe',
        headers: { 'stripe-signature': sig },
        body: payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.status).toBe('already_processed');
    });
  });

  describe('Direct Payment Recording & Role Isolation', () => {
    it('CRITICAL SECURITY: should deny PATIENT role from recording manual payments (403 Forbidden)', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 100.0,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject payment recording that exceeds outstanding balance due (400)', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        totalAmount: 100.0,
        paidAmount: 40.0,
        balanceDue: 60.0, // Only 60 due!
        status: 'PARTIALLY_PAID',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 150.0, // Exceeds balance of 60!
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    });

    it('should reject payment recording on inactive or cancelled invoice (400)', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockInvoice: any = {
        _id: invoiceId,
        hospitalId: hospitalAId,
        status: 'VOID',
        isDeleted: false,
      };

      vi.spyOn(Invoice, 'findOne').mockResolvedValue(mockInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/${invoiceId}/payments`,
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          paymentMethod: 'CASH',
          amount: 50.0,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVOICE_INACTIVE');
    });
  });
});
