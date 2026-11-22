import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { LabOrder } from '../../src/server/models/LabOrder.js';
import { LabTest } from '../../src/server/models/LabTest.js';
import { LabResult } from '../../src/server/models/LabResult.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';
import { evaluateLabParameter } from '../../src/server/utils/labEvaluator.js';

describe('Laboratory Reference Range Authority & Patient Privacy Remediation Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const labTechUserId = new mongoose.Types.ObjectId().toString();
  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const orderId = new mongoose.Types.ObjectId().toString();
  const testId = new mongoose.Types.ObjectId().toString();
  const resultId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = labTechUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-lab.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);
  });

  describe('Authoritative Catalogue Reference Range Enforcement (Anti-Downgrade)', () => {
    it('should override client-submitted reference ranges with authoritative catalogue ranges to prevent abnormal flag tampering', async () => {
      const techToken = createToken(ROLES.LAB_TECHNICIAN, hospitalAId);

      const mockOrder: any = {
        _id: orderId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        status: 'SAMPLE_COLLECTED',
        isDeleted: false,
        tests: [
          {
            testId,
            testCode: 'GLUC_FAST',
            testName: 'Fasting Blood Glucose',
          },
        ],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      // Authoritative hospital catalogue: normal glucose is 70 - 100 mg/dL
      const mockCatalogueLabTest: any = {
        _id: testId,
        hospitalId: hospitalAId,
        testCode: 'GLUC_FAST',
        testName: 'Fasting Blood Glucose',
        referenceRanges: [
          {
            parameterName: 'Fasting Blood Glucose',
            unit: 'mg/dL',
            minNormal: 70,
            maxNormal: 100,
          },
        ],
      };

      vi.spyOn(LabOrder, 'findOne').mockResolvedValue(mockOrder);
      vi.spyOn(LabTest, 'findOne').mockResolvedValue(mockCatalogueLabTest);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(null);
      vi.spyOn(LabResult, 'create').mockImplementation(async (data: any) => ({
        _id: resultId,
        ...data,
      }));

      // Malicious client tries to spoof referenceRangeMax to 400 to hide abnormal result of 280
      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/lab/orders/${orderId}/results`,
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          testId,
          results: [
            {
              parameterName: 'Fasting Blood Glucose',
              value: 280, // Severely elevated
              unit: 'mg/dL',
              referenceRangeMin: 70,
              referenceRangeMax: 400, // Client tries to override normal range!
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);

      const savedParam = res.body.data.results[0];
      // Must take authoritative catalogue range (max 100, NOT client 400)
      expect(savedParam.referenceRangeMax).toBe(100);
      // Result of 280 mg/dL against maxNormal 100 MUST be flagged as abnormal!
      expect(savedParam.isAbnormal).toBe(true);
      expect(savedParam.abnormalFlag).toBe('CRITICAL_HIGH');
    });
  });

  describe('Clinical Lab Parameter Evaluation Correctness', () => {
    it('should correctly evaluate normal, low, high, and critical lab values', () => {
      // Normal range 70 - 100
      expect(evaluateLabParameter(85, 70, 100).abnormalFlag).toBe('NORMAL');
      expect(evaluateLabParameter(85, 70, 100).isAbnormal).toBe(false);

      // Low
      expect(evaluateLabParameter(65, 70, 100).abnormalFlag).toBe('LOW');
      expect(evaluateLabParameter(65, 70, 100).isAbnormal).toBe(true);

      // High
      expect(evaluateLabParameter(130, 70, 100).abnormalFlag).toBe('HIGH');
      expect(evaluateLabParameter(130, 70, 100).isAbnormal).toBe(true);

      // Critical High (> 1.5x max)
      expect(evaluateLabParameter(250, 70, 100).abnormalFlag).toBe('CRITICAL_HIGH');
      expect(evaluateLabParameter(250, 70, 100).isAbnormal).toBe(true);

      // Critical Low (< 0.5x min)
      expect(evaluateLabParameter(30, 70, 100).abnormalFlag).toBe('CRITICAL_LOW');
      expect(evaluateLabParameter(30, 70, 100).isAbnormal).toBe(true);
    });

    it('should correctly evaluate qualitative/text results', () => {
      expect(evaluateLabParameter('NEGATIVE', undefined, undefined, 'Negative').isAbnormal).toBe(false);
      expect(evaluateLabParameter('POSITIVE', undefined, undefined, 'Negative').isAbnormal).toBe(true);
      expect(evaluateLabParameter('REACTIVE', undefined, undefined, 'Non-Reactive').abnormalFlag).toBe('ABNORMAL');
    });
  });

  describe('Patient Privacy & Unapproved Result Access Guard', () => {
    it('should prevent patient from viewing unapproved lab results (403 or filtered)', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      const mockPatientProfile: any = {
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      const unapprovedLabResult: any = {
        _id: resultId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        orderId,
        status: 'SUBMITTED', // NOT APPROVED YET!
        isDeleted: false,
      };

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile);
      vi.spyOn(LabResult, 'findOne').mockResolvedValue(unapprovedLabResult);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/lab/results/${resultId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_UNAPPROVED');
      expect(res.body.error.message).toContain('approved');
    });
  });
});
