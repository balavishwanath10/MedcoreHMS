import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { LabTest } from '../../src/server/models/LabTest.js';
import { LabOrder } from '../../src/server/models/LabOrder.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 15: Laboratory Test Catalogue & Lab Orders Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();

  const technicianUserId = new mongoose.Types.ObjectId().toString();

  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const encounterId = new mongoose.Types.ObjectId().toString();
  const labOrderId = new mongoose.Types.ObjectId().toString();
  const labTestId1 = new mongoose.Types.ObjectId().toString();
  const labTestId2 = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = doctorUserId,
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

  describe('GET /api/lab/tests (Catalogue Search & Auto-Seeding)', () => {
    it('should search catalogue and return active lab tests', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      const sampleTests = [
        {
          _id: labTestId1,
          hospitalId: hospitalAId,
          code: 'CBC',
          name: 'Complete Blood Count',
          category: 'Hematology',
          sampleType: 'Blood',
          turnaroundTimeHours: 12,
          price: 30,
          isActive: true,
        },
      ];

      vi.spyOn(LabTest, 'countDocuments').mockResolvedValue(1 as any);
      vi.spyOn(LabTest, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(sampleTests),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/lab/tests?query=Blood',
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].code).toBe('CBC');
    });

    it('should allow Lab Technician to add a new test to the catalogue', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const newTestData = {
        hospitalId: hospitalAId,
        code: 'CRP-QUANT',
        name: 'C-Reactive Protein (Quantitative)',
        category: 'Biochemistry',
        sampleType: 'Serum',
        turnaroundTimeHours: 6,
        price: 28,
        referenceRanges: [
          { parameterName: 'CRP', unit: 'mg/L', minNormal: 0, maxNormal: 5, genderSpecific: 'ALL' },
        ],
      };

      vi.spyOn(LabTest, 'findOne').mockResolvedValue(null);
      vi.spyOn(LabTest, 'create').mockImplementation(async (data: any) => ({
        _id: new mongoose.Types.ObjectId(),
        ...data,
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/tests',
        headers: { authorization: `Bearer ${techToken}` },
        body: newTestData,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('CRP-QUANT');
    });

    it('should reject duplicate test code in the same hospital (400)', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId);

      vi.spyOn(LabTest, 'findOne').mockResolvedValue({
        _id: labTestId1,
        code: 'CBC',
        hospitalId: hospitalAId,
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/tests',
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          hospitalId: hospitalAId,
          code: 'CBC',
          name: 'Complete Blood Count Duplicate',
          category: 'Hematology',
          sampleType: 'Blood',
          turnaroundTimeHours: 12,
          price: 30,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('DUPLICATE_TEST_CODE');
    });
  });

  describe('POST /api/lab/orders (Lab Order Creation)', () => {
    const validOrderPayload = {
      hospitalId: hospitalAId,
      patientId: patientProfileId,
      doctorId: doctorProfileId,
      encounterId: encounterId,
      testIds: [labTestId1, labTestId2],
      priority: 'URGENT',
      clinicalNotes: 'Suspected severe bacterial infection, monitor inflammatory markers.',
    };

    it('should allow attending doctor to place diagnostic lab order', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(Encounter, 'findOne').mockResolvedValue({
        _id: encounterId,
        patientId: patientProfileId,
        hospitalId: hospitalAId,
      } as any);

      const mockTests = [
        { _id: labTestId1, code: 'CBC', name: 'Complete Blood Count', sampleType: 'Blood' },
        { _id: labTestId2, code: 'CRP', name: 'C-Reactive Protein', sampleType: 'Serum' },
      ];
      vi.spyOn(LabTest, 'find').mockResolvedValue(mockTests as any);

      vi.spyOn(LabOrder, 'create').mockImplementation(async (data: any) => ({
        _id: labOrderId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/orders',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: validOrderPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ORDERED');
      expect(res.body.data.priority).toBe('URGENT');
      expect(res.body.data.tests.length).toBe(2);
      expect(res.body.data.orderNumber).toContain('LAB-');
    });

    it('should reject lab order with invalid or unresolvable test IDs', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(Encounter, 'findOne').mockResolvedValue({
        _id: encounterId,
        patientId: patientProfileId,
        hospitalId: hospitalAId,
      } as any);

      // Returns only 1 test out of 2 requested
      vi.spyOn(LabTest, 'find').mockResolvedValue([
        { _id: labTestId1, code: 'CBC', name: 'Complete Blood Count', sampleType: 'Blood' },
      ] as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/orders',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: validOrderPayload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_LAB_TESTS');
    });

    it('should reject order placement by unauthorized role (PATIENT -> 403)', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/orders',
        headers: { authorization: `Bearer ${patientToken}` },
        body: validOrderPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should deny cross-hospital lab order creation', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      const crossTenantPayload = {
        ...validOrderPayload,
        hospitalId: hospitalBId, // Mismatch with authenticated hospital
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/lab/orders',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: crossTenantPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/lab/orders (Technician Queue & Patient Scoping)', () => {
    const mockOrderList = [
      {
        _id: labOrderId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        orderNumber: 'LAB-2026-881290',
        status: 'ORDERED',
        priority: 'ROUTINE',
        tests: [{ testCode: 'CBC', testName: 'Complete Blood Count', sampleType: 'Blood' }],
        orderedAt: new Date().toISOString(),
      },
    ];

    it('should return hospital orders for technician queue', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      vi.spyOn(LabOrder, 'find').mockReturnValue({
        sort: vi.fn().mockResolvedValue(mockOrderList),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/lab/orders?status=ORDERED',
        headers: { authorization: `Bearer ${techToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].orderNumber).toBe('LAB-2026-881290');
    });

    it('should restrict patient to viewing only their own lab orders', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
      } as any);

      (vi.spyOn(LabOrder, 'find') as any).mockImplementation((filter: any) => {
        expect(filter.patientId).toBe(patientProfileId);
        return {
          sort: vi.fn().mockResolvedValue(mockOrderList),
        } as any;
      });

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/lab/orders',
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('PATCH /api/lab/orders/:id/sample-collected (Sample Collection)', () => {
    it('should allow technician to mark sample as collected', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        status: 'ORDERED',
        orderNumber: 'LAB-2026-881290',
        tests: [{ testCode: 'CBC', status: 'ORDERED', sampleType: 'Blood' }],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/lab/orders/${labOrderId}/sample-collected`,
        headers: { authorization: `Bearer ${techToken}` },
        body: { notes: 'Blood drawn via venipuncture in EDTA tube' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockOrder.status).toBe('SAMPLE_COLLECTED');
      expect(mockOrder.sampleCollectedAt).toBeDefined();
      expect(mockOrder.sampleCollectedBy).toBe(technicianUserId);
      expect(mockOrder.tests[0].status).toBe('SAMPLE_COLLECTED');
    });

    it('should reject sample collection if order is cancelled', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const cancelledOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        status: 'CANCELLED',
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(cancelledOrder);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/lab/orders/${labOrderId}/sample-collected`,
        headers: { authorization: `Bearer ${techToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('ORDER_CANCELLED');
    });
  });
});
