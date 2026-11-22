import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { InventoryBatch } from '../../src/server/models/InventoryBatch.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Pharmacy Inventory Concurrency & FEFO/FIFO Safety Remediation Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const pharmacistUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();
  const doctorUserId = new mongoose.Types.ObjectId().toString();

  const prescriptionId = new mongoose.Types.ObjectId().toString();
  const medicineAId = new mongoose.Types.ObjectId().toString();
  const medicineBId = new mongoose.Types.ObjectId().toString();

  const batch1Id = new mongoose.Types.ObjectId().toString();
  const batch2Id = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = pharmacistUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-pharmacy.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('FEFO (First-Expiry-First-Out) vs FIFO (First-In-First-Out) Ordering', () => {
    it('should dispense using FEFO strategy by default (sorting by earliest expiry date)', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorUserId,
        status: 'ISSUED',
        isDeleted: false,
        items: [
          {
            medicineId: medicineAId,
            medicineName: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'OD',
            durationDays: 10, // requested quantity = 10
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Batch 1: Received 30 days ago, expires in 100 days
      const batchLaterExpiry: any = {
        _id: batch1Id,
        hospitalId: hospitalAId,
        medicineId: medicineAId,
        batchNumber: 'BATCH-EARLY-REC-LATE-EXP',
        receivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
        quantityAvailable: 20,
        unitCost: 1.5,
        mrp: 3.0,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Batch 2: Received yesterday, expires in 10 days (Earliest expiry!)
      const batchEarlierExpiry: any = {
        _id: batch2Id,
        hospitalId: hospitalAId,
        medicineId: medicineAId,
        batchNumber: 'BATCH-LATE-REC-EARLY-EXP',
        receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        quantityAvailable: 10,
        unitCost: 1.8,
        mrp: 3.5,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      const findSpy = vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockImplementation((sortCriteria: any) => {
          // Verify FEFO sorts primarily by expiryDate ascending
          expect(sortCriteria.expiryDate).toBe(1);
          // Return earliest expiry batch first
          return Promise.resolve([batchEarlierExpiry, batchLaterExpiry]);
        }),
      } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: { strategy: 'FEFO' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(findSpy).toHaveBeenCalled();
      const allocated = res.body.data.items[0].allocatedBatches;
      expect(allocated.length).toBe(1);
      expect(allocated[0].batchNumber).toBe('BATCH-LATE-REC-EARLY-EXP');
      expect(batchEarlierExpiry.quantityAvailable).toBe(0);
      expect(batchEarlierExpiry.status).toBe('DEPLETED');
    });

    it('should dispense using FIFO strategy when requested (sorting by earliest receipt date)', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorUserId,
        status: 'ISSUED',
        isDeleted: false,
        items: [
          {
            medicineId: medicineAId,
            medicineName: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'OD',
            durationDays: 10,
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Batch 1: Received 30 days ago (Oldest receipt!)
      const batchOldestReceipt: any = {
        _id: batch1Id,
        hospitalId: hospitalAId,
        medicineId: medicineAId,
        batchNumber: 'BATCH-FIFO-OLDEST-RECEIPT',
        receivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
        quantityAvailable: 15,
        unitCost: 1.5,
        mrp: 3.0,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      const findSpy = vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockImplementation((sortCriteria: any) => {
          // Verify FIFO sorts primarily by receivedAt ascending
          expect(sortCriteria.receivedAt).toBe(1);
          return Promise.resolve([batchOldestReceipt]);
        }),
      } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: { strategy: 'FIFO' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(findSpy).toHaveBeenCalled();
      const allocated = res.body.data.items[0].allocatedBatches;
      expect(allocated[0].batchNumber).toBe('BATCH-FIFO-OLDEST-RECEIPT');
      expect(batchOldestReceipt.quantityAvailable).toBe(5);
    });
  });

  describe('Multi-Item Dispensing & Rollback Compensation on Partial Failure', () => {
    it('should compensate and rollback previously deducted stock when a subsequent item has insufficient stock', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorUserId,
        status: 'ISSUED',
        isDeleted: false,
        items: [
          {
            medicineId: medicineAId,
            medicineName: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'OD',
            durationDays: 5, // Requires 5
          },
          {
            medicineId: medicineBId,
            medicineName: 'Azithromycin 250mg',
            dosage: '250mg',
            frequency: 'OD',
            durationDays: 10, // Requires 10 (Only 2 available!)
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const batchMedA: any = {
        _id: batch1Id,
        hospitalId: hospitalAId,
        medicineId: medicineAId,
        batchNumber: 'BATCH-MED-A-OK',
        quantityAvailable: 10,
        expiryDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
        unitCost: 1.0,
        mrp: 2.0,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const batchMedB: any = {
        _id: batch2Id,
        hospitalId: hospitalAId,
        medicineId: medicineBId,
        batchNumber: 'BATCH-MED-B-SHORT',
        quantityAvailable: 2, // Only 2 available (requires 10)
        expiryDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000),
        unitCost: 2.0,
        mrp: 4.0,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      (vi.spyOn(InventoryBatch, 'find') as any).mockImplementation((filter: any) => {
        if (filter.medicineId === medicineAId) {
          return { sort: vi.fn().mockResolvedValue([batchMedA]) };
        }
        return { sort: vi.fn().mockResolvedValue([batchMedB]) };
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.message).toContain('Azithromycin 250mg');

      // Prescription status must remain ISSUED (not DISPENSED)
      expect(mockPrescription.status).toBe('ISSUED');
      // Med A batch quantity must remain at 10 (undeducted / rolled back)
      expect(batchMedA.quantityAvailable).toBe(10);
    });

    it('should reject dispensing an already DISPENSED prescription (400)', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const alreadyDispensedPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        status: 'DISPENSED',
        isDeleted: false,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(alreadyDispensedPrescription);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('PRESCRIPTION_ALREADY_DISPENSED');
    });
  });
});
