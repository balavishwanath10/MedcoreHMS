import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { LabTest } from '../../src/server/models/LabTest.js';
import { LabOrder } from '../../src/server/models/LabOrder.js';
import { LabResult } from '../../src/server/models/LabResult.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { evaluateLabParameter } from '../../src/server/utils/labEvaluator.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 16: Structured Lab Results & Approval Workflow Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const technicianUserId = new mongoose.Types.ObjectId().toString();

  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const labOrderId = new mongoose.Types.ObjectId().toString();
  const labTestId1 = new mongoose.Types.ObjectId().toString();
  const labTestId2 = new mongoose.Types.ObjectId().toString();
  const labResultId = new mongoose.Types.ObjectId().toString();

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

  describe('Lab Evaluator Utility Unit Tests', () => {
    it('should correctly classify NORMAL numerical values', () => {
      const res = evaluateLabParameter(14.2, 13.0, 17.0);
      expect(res.isAbnormal).toBe(false);
      expect(res.abnormalFlag).toBe('NORMAL');
    });

    it('should correctly classify LOW and CRITICAL_LOW values', () => {
      // Normal: 10 - 20. Value 8 is LOW.
      const lowRes = evaluateLabParameter(8, 10, 20);
      expect(lowRes.isAbnormal).toBe(true);
      expect(lowRes.abnormalFlag).toBe('LOW');

      // Value 5 (< 60% of 10 = 6) is CRITICAL_LOW
      const critLowRes = evaluateLabParameter(5, 10, 20);
      expect(critLowRes.isAbnormal).toBe(true);
      expect(critLowRes.abnormalFlag).toBe('CRITICAL_LOW');
    });

    it('should correctly classify HIGH and CRITICAL_HIGH values', () => {
      // Normal: 10 - 20. Value 25 is HIGH.
      const highRes = evaluateLabParameter(25, 10, 20);
      expect(highRes.isAbnormal).toBe(true);
      expect(highRes.abnormalFlag).toBe('HIGH');

      // Value 35 (> 150% of 20 = 30) is CRITICAL_HIGH
      const critHighRes = evaluateLabParameter(35, 10, 20);
      expect(critHighRes.isAbnormal).toBe(true);
      expect(critHighRes.abnormalFlag).toBe('CRITICAL_HIGH');
    });

    it('should evaluate qualitative text results against expected text reference', () => {
      const normalRes = evaluateLabParameter('Negative', undefined, undefined, 'Negative');
      expect(normalRes.isAbnormal).toBe(false);
      expect(normalRes.abnormalFlag).toBe('NORMAL');

      const abnormalRes = evaluateLabParameter('Positive', undefined, undefined, 'Negative');
      expect(abnormalRes.isAbnormal).toBe(true);
      expect(abnormalRes.abnormalFlag).toBe('ABNORMAL');
    });
  });

  describe('POST /api/lab/orders/:orderId/results (Technician Results Entry)', () => {
    it('should allow Lab Technician to submit structured results and auto-flag abnormals', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        orderNumber: 'LAB-2026-0001',
        patientId: patientProfileId,
        doctorId: doctorUserId,
        status: 'SAMPLE_COLLECTED',
        isDeleted: false,
        tests: [
          {
            testId: labTestId1,
            testCode: 'CBC',
            testName: 'Complete Blood Count',
            status: 'SAMPLE_COLLECTED',
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const mockCatalogueTest = {
        _id: labTestId1,
        hospitalId: hospitalAId,
        code: 'CBC',
        name: 'Complete Blood Count',
        referenceRanges: [
          { parameterName: 'Hemoglobin', unit: 'g/dL', minNormal: 13.0, maxNormal: 17.0 },
          { parameterName: 'WBC', unit: '10^3/uL', minNormal: 4.5, maxNormal: 11.0 },
        ],
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(LabTest, 'findOne').mockResolvedValue(mockCatalogueTest as any);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(null);
      vi.spyOn(LabResult, 'create').mockImplementation(async (data: any) => ({
        _id: labResultId,
        ...data,
      }));
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const payload = {
        testId: labTestId1,
        technicianNotes: 'Analyzed on Sysmex hematology analyzer. Slightly elevated WBC.',
        results: [
          {
            parameterName: 'Hemoglobin',
            value: 14.5,
            unit: 'g/dL',
          },
          {
            parameterName: 'WBC',
            value: 14.8, // Should be flagged as HIGH (max is 11.0)
            unit: '10^3/uL',
          },
        ],
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/orders/${labOrderId}/results`,
        headers: { authorization: `Bearer ${techToken}` },
        body: payload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.results.length).toBe(2);

      // Check parameter enrichment & auto-evaluation
      const wbcParam = res.body.data.results.find((p: any) => p.parameterName === 'WBC');
      expect(wbcParam).toBeDefined();
      expect(wbcParam.isAbnormal).toBe(true);
      expect(wbcParam.abnormalFlag).toBe('HIGH');
      expect(wbcParam.referenceRangeMin).toBe(4.5);
      expect(wbcParam.referenceRangeMax).toBe(11.0);

      // Verify order and test status transitioned to IN_PROGRESS
      expect(mockOrder.status).toBe('IN_PROGRESS');
      expect(mockOrder.tests[0].status).toBe('IN_PROGRESS');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should reject result submission for a test not part of the order', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        status: 'SAMPLE_COLLECTED',
        isDeleted: false,
        tests: [{ testId: labTestId1, testCode: 'CBC', status: 'SAMPLE_COLLECTED' }],
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);

      const payload = {
        testId: labTestId2, // Not in order!
        results: [{ parameterName: 'Glucose', value: 95, unit: 'mg/dL' }],
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/orders/${labOrderId}/results`,
        headers: { authorization: `Bearer ${techToken}` },
        body: payload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TEST_NOT_IN_ORDER');
    });

    it('should prevent modifying results that have already been APPROVED', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId, technicianUserId);

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        tests: [{ testId: labTestId1 }],
        isDeleted: false,
      };

      const existingApprovedResult: any = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        testId: labTestId1,
        status: 'APPROVED',
        isDeleted: false,
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(LabTest, 'findOne').mockResolvedValue(null);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(existingApprovedResult);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/orders/${labOrderId}/results`,
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          testId: labTestId1,
          results: [{ parameterName: 'Hemoglobin', value: 14.0, unit: 'g/dL' }],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('RESULT_ALREADY_APPROVED');
    });
  });

  describe('POST /api/lab/results/:id/review (Senior Doctor / Pathologist Review)', () => {
    it('should allow Doctor to approve results and auto-complete the order if all tests done', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockResult: any = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        testId: labTestId1,
        status: 'SUBMITTED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        status: 'IN_PROGRESS',
        isDeleted: false,
        tests: [
          {
            testId: labTestId1,
            status: 'IN_PROGRESS',
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(LabResult, 'findOne').mockResolvedValue(mockResult);
      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/results/${labResultId}/review`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          action: 'APPROVE',
          notes: 'Clinically correlated. Verified by Pathologist.',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockResult.status).toBe('APPROVED');
      expect(mockResult.reviewedBy).toBe(doctorUserId);
      expect(mockResult.save).toHaveBeenCalled();

      // Test item should be COMPLETED
      expect(mockOrder.tests[0].status).toBe('COMPLETED');
      // All tests completed -> entire order completed
      expect(mockOrder.status).toBe('COMPLETED');
      expect(mockOrder.save).toHaveBeenCalled();
    });

    it('should reject approval from unauthorized role (Nurse)', async () => {
      const nurseToken = createToken(ROLES.NURSE, hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/results/${labResultId}/review`,
        headers: { authorization: `Bearer ${nurseToken}` },
        body: { action: 'APPROVE' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow Doctor to reject results with mandatory reason', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockResult: any = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        testId: labTestId1,
        status: 'SUBMITTED',
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const mockOrder: any = {
        _id: labOrderId,
        hospitalId: hospitalAId,
        status: 'IN_PROGRESS',
        isDeleted: false,
        tests: [{ testId: labTestId1, status: 'IN_PROGRESS' }],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(LabResult, 'findOne').mockResolvedValue(mockResult);
      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/results/${labResultId}/review`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          action: 'REJECT',
          reason: 'Sample hemolysis detected; please repeat specimen draw and retest.',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockResult.status).toBe('REJECTED');
      expect(mockResult.reviewNotes).toContain('Sample hemolysis');
    });

    it('should fail review when REJECT action is missing mandatory reason', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockResult: any = {
        _id: labResultId,
        hospitalId: hospitalAId,
        status: 'SUBMITTED',
        isDeleted: false,
      };

      vi.spyOn(LabResult, 'findOne').mockResolvedValue(mockResult);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/results/${labResultId}/review`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          action: 'REJECT',
          // reason omitted
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Patient Privacy & Unapproved Result Access Isolation', () => {
    it('should strictly FORBID patients from viewing UNAPPROVED lab results via ID', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const unapprovedResult = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        patientId: patientProfileId,
        status: 'SUBMITTED', // NOT approved yet!
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(unapprovedResult as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/lab/results/${labResultId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_UNAPPROVED');
    });

    it('should allow patient to view their own APPROVED lab result', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const approvedResult = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        patientId: patientProfileId,
        status: 'APPROVED',
        results: [{ parameterName: 'Hemoglobin', value: 14.5, unit: 'g/dL', isAbnormal: false }],
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(approvedResult as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/lab/results/${labResultId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
    });

    it('should deny patient access to another patient result', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const otherPatientResult = {
        _id: labResultId,
        hospitalId: hospitalAId,
        orderId: labOrderId,
        patientId: otherPatientProfileId, // Different patient!
        status: 'APPROVED',
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(otherPatientResult as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/lab/results/${labResultId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should enforce tenant isolation across hospitals on lab results', async () => {
      const doctorTokenHospitalB = createToken(ROLES.DOCTOR, hospitalBId);

      const mockResultHospitalA = {
        _id: labResultId,
        hospitalId: hospitalAId,
        status: 'APPROVED',
        isDeleted: false,
      };

      vi.spyOn(LabResult, 'findOne').mockResolvedValue(mockResultHospitalA as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/lab/results/${labResultId}`,
        headers: { authorization: `Bearer ${doctorTokenHospitalB}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });
});
