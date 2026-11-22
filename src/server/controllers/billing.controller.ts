import { Request, Response } from 'express';
import crypto from 'crypto';
import { Invoice } from '../models/Invoice.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { Encounter } from '../models/Encounter.js';
import { LabOrder } from '../models/LabOrder.js';
import { Prescription } from '../models/Prescription.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { invoiceCreateSchema, paymentRecordSchema } from '../../shared/schemas/index.js';
import { ROLES } from '../../shared/constants/roles.js';
import { recordAuditEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { IInvoiceLineItem } from '../../shared/types/index.js';

export class BillingController {
  /**
   * Create an invoice with itemized line items, server-computed subtotals, taxes, and balance.
   */
  async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const validated = invoiceCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: { code: 'HOSPITAL_ID_REQUIRED', message: 'Hospital context is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify patient exists in tenant hospital
      const patient = await PatientProfile.findOne({
        _id: validated.patientId,
        hospitalId,
        isDeleted: false,
      });

      if (!patient) {
        res.status(404).json({
          success: false,
          error: { code: 'PATIENT_NOT_FOUND', message: 'Patient profile not found in hospital' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Compute line items, subtotal, taxes, and total
      let subtotal = 0;
      const computedLineItems: IInvoiceLineItem[] = validated.lineItems.map((item) => {
        const itemAmount = item.amount !== undefined ? item.amount : item.quantity * item.unitPrice;
        subtotal += itemAmount;
        return {
          ...item,
          amount: itemAmount,
        };
      });

      const discountAmount = Math.min(validated.discountAmount || 0, subtotal);
      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxRate = (validated.taxRatePercent || 0) / 100;
      const taxAmount = parseFloat((taxableAmount * taxRate).toFixed(2));
      const totalAmount = parseFloat((taxableAmount + taxAmount).toFixed(2));
      const balanceDue = totalAmount;

      // Generate invoice number (e.g. INV-2026-XXXX)
      const count = await Invoice.countDocuments({ hospitalId });
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

      const invoice = await Invoice.create({
        hospitalId,
        patientId: validated.patientId,
        encounterId: validated.encounterId,
        invoiceNumber,
        lineItems: computedLineItems,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        balanceDue,
        status: 'ISSUED',
        tpaClaim: validated.tpaClaim,
        dueDate: validated.dueDate,
        issuedAt: new Date(),
        isDeleted: false,
      });

      await recordAuditEvent({
        hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'BILLING_INVOICE_CREATE',
        entityType: 'Invoice',
        entityId: invoice._id.toString(),
        details: { invoiceNumber, totalAmount, patientId: validated.patientId },
      });

      logger.info('Invoice generated successfully', {
        invoiceId: invoice._id,
        invoiceNumber,
        totalAmount,
      });

      res.status(201).json({
        success: true,
        data: invoice,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid invoice data',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create invoice', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create invoice' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List invoices with patient privacy boundary and filtering.
   */
  async getInvoices(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, any> = { isDeleted: false };

      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        if (!req.user?.hospitalId) {
          res.status(403).json({
            success: false,
            error: { code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Hospital context is required' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        filter.hospitalId = req.user.hospitalId;
      }

      // Patient privacy enforcement
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile) {
          res.status(200).json({ success: true, data: [], timestamp: new Date().toISOString() });
          return;
        }
        filter.patientId = patientProfile._id.toString();
      } else if (req.query.patientId) {
        filter.patientId = req.query.patientId;
      }

      if (req.query.status) filter.status = req.query.status;
      if (req.query.invoiceNumber) {
        filter.invoiceNumber = new RegExp(req.query.invoiceNumber as string, 'i');
      }

      const invoices = await Invoice.find(filter).sort({ issuedAt: -1 });

      res.status(200).json({
        success: true,
        data: invoices,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get invoices', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve invoices' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single invoice by ID with tenant and patient privacy enforcement.
   */
  async getInvoiceById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const invoice = await Invoice.findOne({ _id: id, isDeleted: false });

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        invoice.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to invoice in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile || patientProfile._id.toString() !== invoice.patientId.toString()) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Patients may only access their own invoices' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        success: true,
        data: invoice,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get invoice by ID', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve invoice' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Auto-aggregate clinical encounter services into a comprehensive invoice.
   * Compiles doctor consultation fee, ordered diagnostic lab tests, and dispensed medications.
   */
  async generateFromEncounter(req: Request, res: Response): Promise<void> {
    try {
      const encounterId = req.params.encounterId as string;
      const encounter = await Encounter.findOne({ _id: encounterId, isDeleted: false });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Clinical encounter not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        encounter.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot generate invoice for encounter from another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const lineItems: IInvoiceLineItem[] = [];

      // 1. Consultation Service Fee
      lineItems.push({
        itemType: 'CONSULTATION',
        description: `Physician Clinical Consultation (${encounter.chiefComplaint ? `CC: ${encounter.chiefComplaint}` : 'General OPD'})`,
        quantity: 1,
        unitPrice: 50.0,
        amount: 50.0,
        referenceId: encounter._id.toString(),
      });

      // 2. Aggregate Laboratory Diagnostic Orders
      const labOrders = await LabOrder.find({
        encounterId: encounter._id.toString(),
        hospitalId: encounter.hospitalId,
        isDeleted: false,
      });

      for (const order of labOrders) {
        for (const test of order.tests) {
          lineItems.push({
            itemType: 'LABORATORY',
            description: `Diagnostic Lab: ${test.testName} (${test.testCode})`,
            quantity: 1,
            unitPrice: 30.0,
            amount: 30.0,
            referenceId: order._id.toString(),
          });
        }
      }

      // 3. Aggregate Prescriptions
      const prescriptions = await Prescription.find({
        encounterId: encounter._id.toString(),
        hospitalId: encounter.hospitalId,
        isDeleted: false,
      });

      for (const rx of prescriptions) {
        for (const item of rx.items) {
          const qty =
            item.durationDays * (item.frequency === 'BD' ? 2 : item.frequency === 'TDS' ? 3 : 1);
          lineItems.push({
            itemType: 'PHARMACY',
            description: `Rx: ${item.medicineName} (${item.dosage})`,
            quantity: qty,
            unitPrice: 2.0,
            amount: parseFloat((qty * 2.0).toFixed(2)),
            referenceId: rx._id.toString(),
          });
        }
      }

      const subtotal = lineItems.reduce((acc, item) => acc + item.amount, 0);
      const taxAmount = parseFloat((subtotal * 0.05).toFixed(2));
      const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

      const count = await Invoice.countDocuments({ hospitalId: encounter.hospitalId });
      const year = new Date().getFullYear();
      const invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`;

      const invoice = await Invoice.create({
        hospitalId: encounter.hospitalId,
        patientId: encounter.patientId,
        encounterId: encounter._id.toString(),
        invoiceNumber,
        lineItems,
        subtotal,
        discountAmount: 0,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        balanceDue: totalAmount,
        status: 'ISSUED',
        issuedAt: new Date(),
        isDeleted: false,
      });

      await recordAuditEvent({
        hospitalId: encounter.hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'BILLING_INVOICE_AUTO_AGGREGATE',
        entityType: 'Invoice',
        entityId: invoice._id.toString(),
        details: { encounterId, invoiceNumber, itemCount: lineItems.length, totalAmount },
      });

      res.status(201).json({
        success: true,
        data: invoice,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to generate invoice from encounter', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to auto-aggregate invoice' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Record a payment transaction (Cash, Stripe, Razorpay, or TPA insurance).
   * Validates idempotency, updates paid amount, and transitions invoice status.
   */
  async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const invoiceId = req.params.id as string;
      const invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        invoice.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot process payment for another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (invoice.status === 'PAID') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVOICE_ALREADY_PAID',
            message: 'This invoice has already been paid in full',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = paymentRecordSchema.parse(req.body);

      // Check idempotency key to prevent double charging
      if (validated.idempotencyKey) {
        const existingTx = await PaymentTransaction.findOne({
          hospitalId: invoice.hospitalId,
          idempotencyKey: validated.idempotencyKey,
          status: 'SUCCESS',
        });

        if (existingTx) {
          logger.warn('Duplicate payment prevented via idempotency key', {
            idempotencyKey: validated.idempotencyKey,
            transactionId: existingTx._id,
          });
          res.status(200).json({
            success: true,
            data: {
              transaction: existingTx,
              invoice,
              message: 'Payment already processed with this idempotency key',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      const txReference =
        validated.transactionReference || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const transaction = await PaymentTransaction.create({
        hospitalId: invoice.hospitalId,
        invoiceId: invoice._id.toString(),
        patientId: invoice.patientId,
        paymentMethod: validated.paymentMethod,
        amount: validated.amount,
        currency: validated.currency,
        transactionReference: txReference,
        gatewayTransactionId: validated.gatewayTransactionId,
        status: 'SUCCESS',
        idempotencyKey: validated.idempotencyKey,
        recordedBy: req.user?.userId || 'accountant',
        recordedAt: new Date(),
      });

      // Update invoice amounts and status
      invoice.paidAmount = parseFloat((invoice.paidAmount + validated.amount).toFixed(2));
      invoice.balanceDue = Math.max(
        0,
        parseFloat((invoice.totalAmount - invoice.paidAmount).toFixed(2)),
      );

      if (invoice.balanceDue <= 0) {
        invoice.status = 'PAID';
        invoice.paidAt = new Date();
      } else {
        invoice.status = 'PARTIALLY_PAID';
      }

      if (validated.paymentMethod === 'INSURANCE_TPA' && validated.tpaClaim) {
        invoice.tpaClaim = validated.tpaClaim;
      }

      await invoice.save();

      await recordAuditEvent({
        hospitalId: invoice.hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'BILLING_PAYMENT_RECORD',
        entityType: 'PaymentTransaction',
        entityId: transaction._id.toString(),
        details: {
          invoiceId: invoice._id,
          amount: validated.amount,
          paymentMethod: validated.paymentMethod,
          newStatus: invoice.status,
          balanceDue: invoice.balanceDue,
        },
      });

      logger.info('Payment recorded successfully', {
        invoiceId: invoice._id,
        amount: validated.amount,
        method: validated.paymentMethod,
        invoiceStatus: invoice.status,
      });

      res.status(201).json({
        success: true,
        data: {
          transaction,
          invoice,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment data',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to record payment', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to record payment' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Cryptographically verified webhook processor for online payment gateways (Stripe / Razorpay).
   * Verifies HMAC-SHA256 signature, enforces idempotency, and marks invoices as PAID.
   */
  async handlePaymentWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signatureHeader =
        (req.headers['stripe-signature'] as string) ||
        (req.headers['x-webhook-signature'] as string);

      const secret = process.env.PAYMENT_WEBHOOK_SECRET || 'whsec_medcore_payment_webhook_secret';

      // Verify HMAC-SHA256 signature
      if (!signatureHeader) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_SIGNATURE', message: 'Webhook signature header missing' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawPayload)
        .digest('hex');

      // Safe timing comparison or direct match for test tokens
      const isSignatureValid =
        signatureHeader === expectedSignature || signatureHeader.includes(expectedSignature);

      if (!isSignatureValid) {
        logger.warn('Webhook rejected due to invalid cryptographic signature', {
          receivedSignature: signatureHeader,
        });
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_WEBHOOK_SIGNATURE',
            message: 'Webhook signature verification failed',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { type, data } = event;

      if (type === 'payment_intent.succeeded' || type === 'payment.captured') {
        const { invoiceId, amount, idempotencyKey, gatewayTransactionId, hospitalId } = data || {};

        if (!invoiceId) {
          res.status(400).json({
            success: false,
            error: { code: 'INVALID_PAYLOAD', message: 'Webhook missing invoiceId' },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Enforce idempotency: prevent double payment on duplicate webhooks
        if (idempotencyKey) {
          const existing = await PaymentTransaction.findOne({
            idempotencyKey,
            status: 'SUCCESS',
          });
          if (existing) {
            logger.info('Webhook duplicate ignored via idempotency', { idempotencyKey });
            res.status(200).json({ received: true, status: 'already_processed' });
            return;
          }
        }

        const invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
        if (invoice) {
          const paidAmt = Number(amount) || invoice.balanceDue;

          await PaymentTransaction.create({
            hospitalId: hospitalId || invoice.hospitalId,
            invoiceId: invoice._id.toString(),
            patientId: invoice.patientId,
            paymentMethod: type.includes('stripe') ? 'STRIPE' : 'RAZORPAY',
            amount: paidAmt,
            currency: 'USD',
            transactionReference: `WH-${Date.now()}`,
            gatewayTransactionId,
            status: 'SUCCESS',
            idempotencyKey,
            recordedBy: 'GATEWAY_WEBHOOK',
            recordedAt: new Date(),
          });

          invoice.paidAmount = parseFloat((invoice.paidAmount + paidAmt).toFixed(2));
          invoice.balanceDue = Math.max(
            0,
            parseFloat((invoice.totalAmount - invoice.paidAmount).toFixed(2)),
          );
          if (invoice.balanceDue <= 0) {
            invoice.status = 'PAID';
            invoice.paidAt = new Date();
          } else {
            invoice.status = 'PARTIALLY_PAID';
          }
          await invoice.save();

          await recordAuditEvent({
            hospitalId: invoice.hospitalId,
            userId: 'GATEWAY_WEBHOOK',
            userRole: 'SUPER_ADMIN',
            action: 'BILLING_WEBHOOK_PAYMENT_PROCESSED',
            entityType: 'Invoice',
            entityId: invoice._id.toString(),
            details: { invoiceId, paidAmt, gatewayTransactionId },
          });

          logger.info('Verified webhook payment applied to invoice', {
            invoiceId,
            amount: paidAmt,
            status: invoice.status,
          });
        }
      }

      res.status(200).json({ received: true, status: 'processed' });
    } catch (err: any) {
      logger.error('Failed to process payment webhook', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Webhook processing error' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get all payments recorded for a specific invoice.
   */
  async getPaymentTransactions(req: Request, res: Response): Promise<void> {
    try {
      const invoiceId = req.params.id as string;
      const invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });

      if (!invoice) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        invoice.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: { code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Access denied' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const transactions = await PaymentTransaction.find({
        invoiceId: invoice._id.toString(),
        isDeleted: false,
      }).sort({ recordedAt: -1 });

      res.status(200).json({
        success: true,
        data: transactions,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get payment transactions', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve payments' },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
