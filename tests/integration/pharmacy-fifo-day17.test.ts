import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { InventoryBatch } from '../../src/server/models/InventoryBatch.js';
import { Medicine } from '../../src/server/models/Medicine.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 17: Pharmacy Inventory & FIFO Dispensing Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const pharmacistUserId = new mongoose.Types.ObjectId().toString();
  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const medicineId = new mongoose.Types.ObjectId().toString();
  const prescriptionId = new mongoose.Types.ObjectId().toString();
  const batchAId = new mongoose.Types.ObjectId().toString();
  const batchBId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = pharmacistUserId,
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

  describe('GET /api/pharmacy/batches (Stock Listing & Expiry Filter)', () => {
    it('should list inventory batches in hospital tenant', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockBatches = [
        {
          _id: batchAId,
          hospitalId: hospitalAId,
          medicineId,
          medicineName: 'Amoxicillin 500mg',
          batchNumber: 'AMX-001',
          quantityAvailable: 50,
          status: 'ACTIVE',
        },
      ];

      vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockBatches),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/pharmacy/batches',
        headers: { authorization: `Bearer ${pharmacistToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].batchNumber).toBe('AMX-001');
    });

    it('should return 30-day expiring batches via /api/pharmacy/batches/expiring', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockExpiring = [
        {
          _id: batchAId,
          hospitalId: hospitalAId,
          medicineName: 'Amoxicillin 500mg',
          batchNumber: 'AMX-EXP-30',
          quantityAvailable: 25,
          expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
          status: 'ACTIVE',
        },
      ];

      vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockExpiring),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/pharmacy/batches/expiring?days=30',
        headers: { authorization: `Bearer ${pharmacistToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].batchNumber).toBe('AMX-EXP-30');
    });
  });

  describe('POST /api/pharmacy/batches (Batch Reception & Unique Validation)', () => {
    it('should allow Pharmacist to register a new inventory batch', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockMedicine = {
        _id: medicineId,
        hospitalId: hospitalAId,
        name: 'Azithromycin 250mg',
        unitPrice: 8,
        isDeleted: false,
      };

      vi.spyOn(Medicine, 'findOne').mockResolvedValue(mockMedicine as any);
      vi.spyOn(InventoryBatch, 'findOne').mockResolvedValue(null);
      vi.spyOn(InventoryBatch, 'create').mockImplementation(async (data: any) => ({
        _id: batchAId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const payload = {
        medicineId,
        batchNumber: 'AZI-2026-B1',
        expiryDate: '2027-12-31',
        quantityReceived: 100,
        unitCost: 4.5,
        mrp: 9.0,
        locationRack: 'Rack C-4',
        supplier: 'Global Meds',
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/pharmacy/batches',
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.batchNumber).toBe('AZI-2026-B1');
      expect(res.body.data.quantityAvailable).toBe(100);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should reject duplicate batch numbers for the same medicine in tenant', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockMedicine = { _id: medicineId, hospitalId: hospitalAId, isDeleted: false };
      const existingBatch = { _id: batchAId, batchNumber: 'DUPLICATE-01' };

      vi.spyOn(Medicine, 'findOne').mockResolvedValue(mockMedicine as any);
      vi.spyOn(InventoryBatch, 'findOne').mockResolvedValue(existingBatch as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/pharmacy/batches',
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {
          medicineId,
          batchNumber: 'DUPLICATE-01',
          expiryDate: '2027-12-31',
          quantityReceived: 50,
          unitCost: 5,
          mrp: 10,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_BATCH_NUMBER');
    });

    it('should reject batch creation from unauthorized roles (Patient)', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/pharmacy/batches',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          medicineId,
          batchNumber: 'UNAUTH-01',
          expiryDate: '2027-12-31',
          quantityReceived: 10,
          unitCost: 1,
          mrp: 2,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /api/pharmacy/batches/:id/quarantine (Batch Quarantine)', () => {
    it('should quarantine a batch with mandatory clinical/regulatory reason', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockBatch: any = {
        _id: batchAId,
        hospitalId: hospitalAId,
        batchNumber: 'RECALL-BATCH-99',
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(InventoryBatch, 'findOne').mockResolvedValue(mockBatch);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/pharmacy/batches/${batchAId}/quarantine`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {
          reason: 'Manufacturer recall issued for packaging defect',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockBatch.status).toBe('QUARANTINED');
      expect(mockBatch.save).toHaveBeenCalled();
    });

    it('should fail quarantine if reason is missing or less than 3 characters', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockBatch: any = { _id: batchAId, hospitalId: hospitalAId, isDeleted: false };
      vi.spyOn(InventoryBatch, 'findOne').mockResolvedValue(mockBatch);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/pharmacy/batches/${batchAId}/quarantine`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: { reason: 'no' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/pharmacy/batches/scan-expired (Expiry Automation)', () => {
    it('should scan and mark batches with past expiry dates as EXPIRED', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const pastBatch1: any = {
        _id: batchAId,
        status: 'ACTIVE',
        expiryDate: new Date('2020-01-01'),
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(InventoryBatch, 'find').mockResolvedValue([pastBatch1] as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/pharmacy/batches/scan-expired',
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.expiredCount).toBe(1);
      expect(pastBatch1.status).toBe('EXPIRED');
      expect(pastBatch1.save).toHaveBeenCalled();
    });
  });

  describe('POST /api/pharmacy/dispense/:prescriptionId (FIFO Dispensing Engine)', () => {
    it('should dispense prescription strictly following FIFO order (earliest expiry first)', async () => {
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
            medicineId,
            medicineName: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'TDS', // multiplier 3
            durationDays: 5, // requestedQuantity = 5 * 3 = 15
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Batch 1: Expires in 10 days, quantity available: 5 (Earliest expiring!)
      const batch1: any = {
        _id: batchAId,
        hospitalId: hospitalAId,
        medicineId,
        batchNumber: 'BATCH-FIFO-EARLY',
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        quantityAvailable: 5,
        unitCost: 2.0,
        mrp: 4.0,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Batch 2: Expires in 60 days, quantity available: 20
      const batch2: any = {
        _id: batchBId,
        hospitalId: hospitalAId,
        medicineId,
        batchNumber: 'BATCH-FIFO-LATER',
        expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        quantityAvailable: 20,
        unitCost: 2.2,
        mrp: 4.5,
        status: 'ACTIVE',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      // InventoryBatch.find returns batches sorted by earliest expiry
      vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([batch1, batch2]),
      } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);

      const receipt = res.body.data;
      expect(receipt.prescriptionId).toBe(prescriptionId);
      expect(receipt.items.length).toBe(1);
      expect(receipt.items[0].dispensedQuantity).toBe(15);

      // Verify FIFO allocation breakdown:
      // 5 from batch1 (depleting it), 10 from batch2 (leaving 10)
      const allocations = receipt.items[0].allocatedBatches;
      expect(allocations.length).toBe(2);

      expect(allocations[0].batchNumber).toBe('BATCH-FIFO-EARLY');
      expect(allocations[0].quantity).toBe(5);

      expect(allocations[1].batchNumber).toBe('BATCH-FIFO-LATER');
      expect(allocations[1].quantity).toBe(10);

      // Verify state changes on batches
      expect(batch1.quantityAvailable).toBe(0);
      expect(batch1.status).toBe('DEPLETED');
      expect(batch1.save).toHaveBeenCalled();

      expect(batch2.quantityAvailable).toBe(10);
      expect(batch2.status).toBe('ACTIVE');
      expect(batch2.save).toHaveBeenCalled();

      // Verify prescription status transitioned to DISPENSED
      expect(mockPrescription.status).toBe('DISPENSED');
      expect(mockPrescription.save).toHaveBeenCalled();

      // Verify grand total calculation (5 * 4.0 + 10 * 4.5 = 20 + 45 = 65)
      expect(receipt.grandTotal).toBe(65);
    });

    it('should reject dispensing when available non-expired stock is insufficient', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST, hospitalAId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        status: 'ISSUED',
        isDeleted: false,
        items: [
          {
            medicineId,
            medicineName: 'Amoxicillin 500mg',
            frequency: 'BD', // 2
            durationDays: 10, // 20 units requested
          },
        ],
      };

      // Only 5 units available in stock
      const scarceBatch: any = {
        _id: batchAId,
        quantityAvailable: 5,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      vi.spyOn(InventoryBatch, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue([scarceBatch]),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.error.message).toContain('Insufficient non-expired stock');
    });

    it('should reject dispensing an already DISPENSED prescription', async () => {
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

    it('should enforce tenant isolation across hospitals when dispensing', async () => {
      const pharmacistHospitalBToken = createToken(ROLES.PHARMACIST, hospitalBId);

      const mockPrescriptionHospitalA: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId, // belongs to Hospital A
        status: 'ISSUED',
        isDeleted: false,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescriptionHospitalA);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/pharmacy/dispense/${prescriptionId}`,
        headers: { authorization: `Bearer ${pharmacistHospitalBToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });
});
