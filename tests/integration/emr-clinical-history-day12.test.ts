import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Allergy } from '../../src/server/models/Allergy.js';
import { Vaccination } from '../../src/server/models/Vaccination.js';
import { FamilyHistory } from '../../src/server/models/FamilyHistory.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 12: EMR Diagnoses, Treatment, Allergies & Clinical History Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const patientProfileId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();
  const encounterId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = new mongoose.Types.ObjectId().toString(),
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

  // =========================================================================
  // 1. Diagnoses & Treatment Plans in Encounters
  // =========================================================================
  describe('Diagnoses & Treatment Plans in Encounters', () => {
    it('should create an encounter containing ICD-10 confirmed diagnoses and structured treatment plans', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      });

      (vi.spyOn(DoctorProfile, 'findOne') as any).mockResolvedValue({
        _id: doctorProfileId,
        hospitalId: hospitalAId,
      });

      (vi.spyOn(Encounter, 'create') as any).mockImplementation(async (data: any) => ({
        _id: encounterId,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          doctorId: doctorProfileId,
          chiefComplaint: 'Persistent headache and elevated blood pressure',
          diagnoses: [
            {
              code: 'I10',
              description: 'Essential (primary) hypertension',
              type: 'CONFIRMED',
              notes: 'Systolic consistently above 140 mmHg',
            },
            {
              code: 'G43.909',
              description: 'Migraine, unspecified, not intractable',
              type: 'DIFFERENTIAL',
            },
          ],
          treatmentPlan: {
            instructions: 'Initiate low sodium DASH diet and daily blood pressure log.',
            prescriptions: [
              {
                medicationName: 'Amlodipine Besylate',
                dosage: '5mg',
                frequency: 'Once daily in the morning',
                duration: '30 days',
                instructions: 'Take with or without food',
              },
            ],
            lifestyleRecommendations: ['Reduce sodium intake', '30 minutes aerobic exercise daily'],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diagnoses).toHaveLength(2);
      expect(res.body.data.diagnoses[0].code).toBe('I10');
      expect(res.body.data.diagnoses[0].type).toBe('CONFIRMED');
      expect(res.body.data.treatmentPlan.prescriptions).toHaveLength(1);
      expect(res.body.data.treatmentPlan.prescriptions[0].medicationName).toBe(
        'Amlodipine Besylate',
      );
    });

    it('should reject invalid diagnosis data missing required ICD-10 code', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          doctorId: doctorProfileId,
          chiefComplaint: 'Checkup',
          diagnoses: [
            {
              code: '', // invalid empty code
              description: 'Incomplete diagnosis',
              type: 'CONFIRMED',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 2. Patient Allergies & Adverse Drug Reactions (ADR)
  // =========================================================================
  describe('POST /api/emr/allergies & GET /api/emr/allergies', () => {
    it('should record an allergy with LIFE_THREATENING severity and adverse drug reaction flag', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      });

      (vi.spyOn(Allergy, 'create') as any).mockImplementation(async (data: any) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        ...data,
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/emr/allergies',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          allergen: 'Penicillin V Potassium',
          reaction: 'Anaphylaxis, bronchospasm, and widespread urticaria',
          severity: 'LIFE_THREATENING',
          isAdverseDrugReaction: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.allergen).toBe('Penicillin V Potassium');
      expect(res.body.data.severity).toBe('LIFE_THREATENING');
      expect(res.body.data.isAdverseDrugReaction).toBe(true);
    });

    it('should reject allergy creation across hospital tenants', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/emr/allergies',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalBId, // Cross tenant
          patientId: patientProfileId,
          allergen: 'Latex',
          reaction: 'Contact dermatitis',
          severity: 'MODERATE',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 3. Vaccinations & Immunizations
  // =========================================================================
  describe('POST /api/emr/vaccinations & GET /api/emr/vaccinations', () => {
    it('should record an administered vaccination with lot number and next booster date', async () => {
      const nurseToken = createToken(ROLES.NURSE);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      });

      (vi.spyOn(Vaccination, 'create') as any).mockImplementation(async (data: any) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        ...data,
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/emr/vaccinations',
        headers: { authorization: `Bearer ${nurseToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          vaccineName: 'Tetanus, Diphtheria, Pertussis (Tdap)',
          batchNumber: 'LOT-98421A',
          administeredDate: '2026-11-20T10:00:00.000Z',
          nextDueDate: '2036-11-20T10:00:00.000Z',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vaccineName).toContain('Tdap');
      expect(res.body.data.batchNumber).toBe('LOT-98421A');
    });
  });

  // =========================================================================
  // 4. Family Medical History & Hereditary Flags
  // =========================================================================
  describe('POST /api/emr/family-history & GET /api/emr/family-history', () => {
    it('should record family history with diabetes and cardiac disease flags', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
      });

      (vi.spyOn(FamilyHistory, 'create') as any).mockImplementation(async (data: any) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        ...data,
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/emr/family-history',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          relationship: 'FATHER',
          condition: 'Type 2 Diabetes Mellitus with Myocardial Infarction at age 52',
          hasDiabetes: true,
          hasCardiacDisease: true,
          hasHypertension: false,
          hasCancer: false,
          notes: 'Early onset cardiovascular disease in first-degree relative.',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasDiabetes).toBe(true);
      expect(res.body.data.hasCardiacDisease).toBe(true);
    });
  });

  // =========================================================================
  // 5. Longitudinal Patient Timeline & Summary
  // =========================================================================
  describe('GET /api/emr/patients/:patientId/timeline', () => {
    it('should aggregate encounters, active diagnoses, allergies, immunizations, and hereditary risk analysis', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalAId,
        firstName: 'John',
        lastName: 'Doe',
        mrn: 'MRN-H1-0001',
      });

      (vi.spyOn(Allergy, 'find') as any).mockReturnValue({
        sort: vi.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId().toString(),
            patientId: patientProfileId,
            allergen: 'Penicillin',
            severity: 'LIFE_THREATENING',
            isAdverseDrugReaction: true,
          },
        ]),
      });

      (vi.spyOn(Vaccination, 'find') as any).mockReturnValue({
        sort: vi.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId().toString(),
            patientId: patientProfileId,
            vaccineName: 'Hepatitis B',
            administeredDate: new Date(),
          },
        ]),
      });

      (vi.spyOn(FamilyHistory, 'find') as any).mockReturnValue({
        sort: vi.fn().mockResolvedValue([
          {
            _id: new mongoose.Types.ObjectId().toString(),
            patientId: patientProfileId,
            relationship: 'FATHER',
            condition: 'Type 2 Diabetes',
            hasDiabetes: true,
            hasCardiacDisease: true,
          },
        ]),
      });

      (vi.spyOn(Encounter, 'find') as any).mockReturnValue({
        sort: vi.fn().mockResolvedValue([
          {
            _id: encounterId,
            patientId: patientProfileId,
            chiefComplaint: 'Routine hypertension follow-up',
            status: 'SIGNED',
            createdAt: new Date().toISOString(),
            diagnoses: [
              {
                code: 'I10',
                description: 'Essential (primary) hypertension',
                type: 'CONFIRMED',
                diagnosedAt: new Date(),
                diagnosedBy: doctorProfileId,
              },
            ],
            vitals: {
              systolicBp: 135,
              diastolicBp: 85,
              pulseRate: 72,
              bmi: 24.5,
            },
          },
        ]),
      });

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/emr/patients/${patientProfileId}/timeline`,
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patient.mrn).toBe('MRN-H1-0001');
      expect(res.body.data.summary.totalEncounters).toBe(1);
      expect(res.body.data.summary.activeDiagnosesCount).toBe(1);
      expect(res.body.data.summary.hasLifeThreateningAllergies).toBe(true);
      expect(res.body.data.summary.hereditaryRisks.hasDiabetesRisk).toBe(true);
      expect(res.body.data.summary.hereditaryRisks.hasCardiacRisk).toBe(true);
      expect(res.body.data.activeDiagnoses[0].code).toBe('I10');
      expect(res.body.data.allergies).toHaveLength(1);
      expect(res.body.data.vaccinations).toHaveLength(1);
      expect(res.body.data.familyHistory).toHaveLength(1);
    });

    it('should reject timeline access if patient belongs to another hospital tenant', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      (vi.spyOn(PatientProfile, 'findOne') as any).mockResolvedValue({
        _id: patientProfileId,
        hospitalId: hospitalBId, // Tenant B
      });

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/emr/patients/${patientProfileId}/timeline`,
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });
});
