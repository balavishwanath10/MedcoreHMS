import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { Appointment } from '../../src/server/models/Appointment.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 11: EMR Encounters, Vitals & Immutability Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const patientProfileId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();
  const appointmentId = new mongoose.Types.ObjectId().toString();
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

  describe('POST /api/encounters/calculate-vitals', () => {
    it('should compute live BMI, categorization, and abnormal flags', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters/calculate-vitals',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          systolicBp: 145,
          diastolicBp: 95,
          pulseRate: 110,
          temperatureF: 101.2,
          respiratoryRate: 22,
          oxygenSaturation: 93,
          heightCm: 175,
          weightKg: 85,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bmi).toBe(27.8);
      expect(res.body.data.bmiCategory).toBe('OVERWEIGHT');
      expect(res.body.data.abnormalFlags).toContain('HIGH_BLOOD_PRESSURE');
      expect(res.body.data.abnormalFlags).toContain('TACHYCARDIA');
      expect(res.body.data.abnormalFlags).toContain('FEVER');
      expect(res.body.data.abnormalFlags).toContain('TACHYPNEA');
      expect(res.body.data.abnormalFlags).toContain('HYPOXIA');
    });

    it('should reject impossible vitals values with validation error', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters/calculate-vitals',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          systolicBp: -10, // Invalid
          diastolicBp: 80,
          pulseRate: 72,
          temperatureF: 120, // Exceeds human physiological limit
          respiratoryRate: 16,
          oxygenSaturation: 105, // Impossible
          heightCm: 175,
          weightKg: 70,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/encounters', () => {
    it('should create an encounter with enriched vitals in draft OPEN status', async () => {
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
          chiefComplaint: 'Acute chest tightness and shortness of breath',
          vitals: {
            systolicBp: 150,
            diastolicBp: 95,
            pulseRate: 105,
            temperatureF: 98.6,
            respiratoryRate: 18,
            oxygenSaturation: 97,
            heightCm: 175,
            weightKg: 80,
          },
          symptoms: [{ name: 'Chest Pain', severity: 'SEVERE', duration: '2 hours' }],
          historyOfPresentIllness: 'Sudden onset chest pain radiating to left arm.',
          assessment: 'Rule out Acute Coronary Syndrome.',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.vitals.bmi).toBe(26.1);
      expect(res.body.data.vitals.bmiCategory).toBe('OVERWEIGHT');
      expect(res.body.data.vitals.abnormalFlags).toContain('HIGH_BLOOD_PRESSURE');
    });

    it('should reject encounter creation by unauthorized role (PATIENT)', async () => {
      const patientToken = createToken(ROLES.PATIENT);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          hospitalId: hospitalAId,
          patientId: patientProfileId,
          doctorId: doctorProfileId,
          chiefComplaint: 'Headache',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject cross-tenant encounter creation', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/encounters',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          hospitalId: hospitalBId, // Cross tenant mismatch
          patientId: patientProfileId,
          doctorId: doctorProfileId,
          chiefComplaint: 'Routine checkup',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  describe('PUT /api/encounters/:id (Draft updates vs. IMMUTABILITY)', () => {
    it('should allow clinical staff to update an OPEN draft encounter', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'OPEN',
        chiefComplaint: 'Old complaint',
        revisions: [],
        save: vi.fn().mockResolvedValue(true),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockEncounter);

      const res = await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'Updated complaint with new findings',
          assessment: 'Stable condition',
          reasonForChange: 'Patient reported secondary symptoms during consultation',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockEncounter.chiefComplaint).toBe('Updated complaint with new findings');
      expect(mockEncounter.revisions).toHaveLength(1);
      expect(mockEncounter.revisions[0].previousSnapshot.chiefComplaint).toBe('Old complaint');
      expect(mockEncounter.revisions[0].reasonForChange).toBe(
        'Patient reported secondary symptoms during consultation',
      );
      expect(mockEncounter.revisions[0].changedFields).toContain('chiefComplaint');
      expect(mockEncounter.save).toHaveBeenCalled();
    });

    it('CRITICAL APPEND-ONLY AUDIT: should preserve historical entry snapshot when open encounter is updated multiple times', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'OPEN',
        chiefComplaint: 'Original entry baseline',
        revisions: [],
        save: vi.fn().mockResolvedValue(true),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockEncounter);

      // First revision
      await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'First revision text',
          reasonForChange: 'Lab results reviewed',
        },
      });

      // Second revision
      await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'Second revision text',
          reasonForChange: 'Attending physician follow-up note',
        },
      });

      // Third revision to strictly prove old entries remain untouched
      await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'Third revision text',
          reasonForChange: 'Final pre-sign clinical adjustment',
        },
      });

      expect(mockEncounter.revisions).toHaveLength(3);
      // Verify first historical entry remains completely unchanged
      expect(mockEncounter.revisions[0].revisionNumber).toBe(1);
      expect(mockEncounter.revisions[0].previousSnapshot.chiefComplaint).toBe(
        'Original entry baseline',
      );
      expect(mockEncounter.revisions[0].revisedSnapshot.chiefComplaint).toBe('First revision text');
      expect(mockEncounter.revisions[0].reasonForChange).toBe('Lab results reviewed');

      // Verify second historical entry remains completely unchanged
      expect(mockEncounter.revisions[1].revisionNumber).toBe(2);
      expect(mockEncounter.revisions[1].previousSnapshot.chiefComplaint).toBe(
        'First revision text',
      );
      expect(mockEncounter.revisions[1].revisedSnapshot.chiefComplaint).toBe('Second revision text');
      expect(mockEncounter.revisions[1].reasonForChange).toBe('Attending physician follow-up note');

      // Verify third entry
      expect(mockEncounter.revisions[2].revisionNumber).toBe(3);
      expect(mockEncounter.revisions[2].previousSnapshot.chiefComplaint).toBe(
        'Second revision text',
      );
      expect(mockEncounter.revisions[2].revisedSnapshot.chiefComplaint).toBe('Third revision text');
      expect(mockEncounter.revisions[2].reasonForChange).toBe('Final pre-sign clinical adjustment');

      expect(mockEncounter.chiefComplaint).toBe('Third revision text');
    });

    it('CRITICAL APPEND-ONLY AUDIT: should reject clinical correction without mandatory reasonForChange', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'OPEN',
        chiefComplaint: 'Original baseline',
        revisions: [],
        save: vi.fn(),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockEncounter);

      const res = await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'Attempted change without reason',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(mockEncounter.save).not.toHaveBeenCalled();
    });

    it('CRITICAL IMMUTABILITY: should reject direct modification of a SIGNED encounter', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockSignedEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'SIGNED',
        chiefComplaint: 'Finalized clinical notes',
        save: vi.fn(),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockSignedEncounter);

      const res = await makeRequest(app, {
        method: 'PUT',
        url: `/api/encounters/${encounterId}`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          chiefComplaint: 'Attempted overwrite of signed record',
          reasonForChange: 'Attempted edit on signed record',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ENCOUNTER_IMMUTABLE');
      expect(mockSignedEncounter.save).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/encounters/:id/sign', () => {
    it('should finalize and sign an OPEN encounter when called by DOCTOR', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'OPEN',
        appointmentId,
        save: vi.fn().mockResolvedValue(true),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockEncounter);
      (vi.spyOn(Appointment, 'findOne') as any).mockResolvedValue({
        _id: appointmentId,
        status: 'IN_PROGRESS',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/encounters/${encounterId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          confirmation: true,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockEncounter.status).toBe('SIGNED');
      expect(mockEncounter.signedAt).toBeDefined();
      expect(mockEncounter.save).toHaveBeenCalled();
    });

    it('should reject signing by a NURSE role', async () => {
      const nurseToken = createToken(ROLES.NURSE);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/encounters/${encounterId}/sign`,
        headers: { authorization: `Bearer ${nurseToken}` },
        body: {
          confirmation: true,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject signing an already SIGNED encounter', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockSignedEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'SIGNED',
        save: vi.fn(),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockSignedEncounter);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/encounters/${encounterId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          confirmation: true,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ENCOUNTER_ALREADY_SIGNED');
    });
  });

  describe('POST /api/encounters/:id/addendum', () => {
    it('should append an addendum to a SIGNED encounter and transition status to AMENDED', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockSignedEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'SIGNED',
        chiefComplaint: 'Signed clinical baseline diagnosis and unchanged notes',
        addenda: [],
        save: vi.fn().mockResolvedValue(true),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockSignedEncounter);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/encounters/${encounterId}/addendum`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          amendmentReason: 'Lab follow-up results',
          notes:
            'Serum troponin returned negative at 6 hours. Patient discharged in stable condition.',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockSignedEncounter.status).toBe('AMENDED');
      expect(mockSignedEncounter.addenda).toHaveLength(1);
      expect(mockSignedEncounter.addenda[0].amendmentReason).toBe('Lab follow-up results');
      expect(mockSignedEncounter.chiefComplaint).toBe(
        'Signed clinical baseline diagnosis and unchanged notes',
      );
      expect(mockSignedEncounter.save).toHaveBeenCalled();
    });

    it('should reject addendum on an OPEN draft encounter', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const mockOpenEncounter: any = {
        _id: encounterId,
        hospitalId: hospitalAId,
        status: 'OPEN',
        save: vi.fn(),
      };

      (vi.spyOn(Encounter, 'findOne') as any).mockResolvedValue(mockOpenEncounter);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/encounters/${encounterId}/addendum`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          amendmentReason: 'Premature addendum',
          notes: 'Cannot add addendum to draft.',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ENCOUNTER_NOT_SIGNED');
    });
  });
});
