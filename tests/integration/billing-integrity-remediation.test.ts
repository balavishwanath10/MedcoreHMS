import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { Invoice } from '../../src/server/models/Invoice.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { LabOrder } from '../../src/server/models/LabOrder.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Billing Data Integrity, Concurrency & Zero-Default Tax Remediation Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const accountantUserId = new mongoose.Types.ObjectId().toString();
  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const encounterId = new mongoose.Types.ObjectId().toString();
  const existingInvoiceId = new mongoose.Types.ObjectId().toString();
  const newInvoiceId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = accountantUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-medcore.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);
  });

  describe('Duplicate Encounter Invoice Generation Prevention (409 Conflict)', () => {
    it('should reject second invoice generation attempt for the same clinical encounter (409 INVOICE_ALREADY_EXISTS)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        chiefComplaint: 'Chest tightness',
        isDeleted: false,
      };

      const existingActiveInvoice: any = {
        _id: existingInvoiceId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        encounterId,
        invoiceNumber: 'INV-2026-0001',
        status: 'ISSUED',
        isDeleted: false,
      };

      vi.spyOn(Encounter, 'findOne').mockResolvedValue(mockEncounter);
      vi.spyOn(Invoice, 'findOne').mockResolvedValue(existingActiveInvoice);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/generate-from-encounter/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVOICE_ALREADY_EXISTS');
      expect(res.body.error.message).toContain('already been generated');
      expect(res.body.error.details.existingInvoiceId).toBe(existingInvoiceId);
    });
  });

  describe('PRD Compliant 0% Default Tax Rate', () => {
    it('should default taxAmount to 0 when auto-aggregating encounter into invoice without tax override', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        chiefComplaint: 'Follow-up visit',
        isDeleted: false,
      };

      vi.spyOn(Encounter, 'findOne').mockResolvedValue(mockEncounter);
      vi.spyOn(Invoice, 'findOne').mockResolvedValue(null); // No existing invoice
      vi.spyOn(LabOrder, 'find').mockResolvedValue([]);
      vi.spyOn(Prescription, 'find').mockResolvedValue([]);
      vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(0);

      let createdInvoiceData: any = null;
      vi.spyOn(Invoice, 'create').mockImplementation(async (data: any) => {
        createdInvoiceData = data;
        return { _id: newInvoiceId, ...data };
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/billing/invoices/generate-from-encounter/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {}, // No tax override
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      expect(createdInvoiceData.subtotal).toBe(50.0);
      // Tax must default to 0 (NOT hardcoded 5%)
      expect(createdInvoiceData.taxAmount).toBe(0);
      expect(createdInvoiceData.totalAmount).toBe(50.0);
      expect(createdInvoiceData.balanceDue).toBe(50.0);
    });

    it('should default taxRatePercent to 0% in manual invoice creation when not specified', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockPatient: any = {
        _id: patientProfileId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatient);
      vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(2);

      let createdInvoiceData: any = null;
      vi.spyOn(Invoice, 'create').mockImplementation(async (data: any) => {
        createdInvoiceData = data;
        return { _id: newInvoiceId, ...data };
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/invoices',
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          patientId: patientProfileId,
          lineItems: [
            {
              itemType: 'CONSULTATION',
              description: 'Routine checkup',
              quantity: 1,
              unitPrice: 100.0,
            },
          ],
          // taxRatePercent omitted
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(createdInvoiceData.taxAmount).toBe(0);
      expect(createdInvoiceData.totalAmount).toBe(100.0);
    });
  });

  describe('Invoice Number Concurrency Collision Resilience', () => {
    it('should retry and successfully create invoice when initial invoiceNumber collides with a concurrent transaction', async () => {
      const accountantToken = createToken(ROLES.ACCOUNTANT, hospitalAId);

      const mockPatient: any = {
        _id: patientProfileId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatient);
      vi.spyOn(Invoice, 'countDocuments').mockResolvedValue(5);

      let callCount = 0;
      vi.spyOn(Invoice, 'create').mockImplementation(async (data: any) => {
        callCount++;
        if (callCount === 1) {
          // Simulate duplicate key collision on first attempt
          const collisionError: any = new Error('E11000 duplicate key error invoiceNumber');
          collisionError.code = 11000;
          throw collisionError;
        }
        return { _id: newInvoiceId, ...data };
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/billing/invoices',
        headers: { authorization: `Bearer ${accountantToken}` },
        body: {
          patientId: patientProfileId,
          lineItems: [
            {
              itemType: 'CONSULTATION',
              description: 'Specialist Visit',
              quantity: 1,
              unitPrice: 80.0,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(callCount).toBe(2); // Retried once and succeeded!
    });
  });
});
