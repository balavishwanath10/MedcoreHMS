import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { Medicine } from '../../src/server/models/Medicine.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { Encounter } from '../../src/server/models/Encounter.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 13: Prescription Foundation & Medicine Lookup Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();

  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const otherPatientUserId = new mongoose.Types.ObjectId().toString();
  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const encounterId = new mongoose.Types.ObjectId().toString();
  const prescriptionId = new mongoose.Types.ObjectId().toString();

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

  describe('GET /api/medicines (Formulary Search)', () => {
    it('should search formulary and return matching medicines', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const sampleMedicines = [
        {
          _id: new mongoose.Types.ObjectId(),
          hospitalId: hospitalAId,
          name: 'Amoxicillin 500mg',
          genericName: 'Amoxicillin',
          dosageForm: 'capsule',
          strength: '500mg',
          category: 'Antibiotic',
          isRestricted: false,
          stockQuantity: 100,
        },
      ];

      vi.spyOn(Medicine, 'countDocuments').mockResolvedValue(1 as any);
      vi.spyOn(Medicine, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(sampleMedicines),
        }),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/medicines?query=Amox',
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Amoxicillin 500mg');
    });

    it('should allow pharmacist to create a new medicine entry in formulary', async () => {
      const pharmacistToken = createToken(ROLES.PHARMACIST);

      const newMedData = {
        name: 'Metformin 500mg',
        genericName: 'Metformin Hydrochloride',
        dosageForm: 'tablet',
        strength: '500mg',
        category: 'Antidiabetic',
        manufacturer: 'PharmaCore',
        isRestricted: false,
      };

      vi.spyOn(Medicine, 'create').mockImplementation(async (data: any) => ({
        _id: new mongoose.Types.ObjectId(),
        ...data,
      }));

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/medicines',
        headers: { authorization: `Bearer ${pharmacistToken}` },
        body: newMedData,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Metformin 500mg');
    });
  });

  describe('POST /api/prescriptions (Prescription Creation)', () => {
    const validPrescriptionPayload = {
      hospitalId: hospitalAId,
      patientId: patientProfileId,
      doctorId: doctorProfileId,
      encounterId: encounterId,
      diagnosis: 'Upper Respiratory Tract Infection',
      items: [
        {
          medicineName: 'Amoxicillin 500mg',
          genericName: 'Amoxicillin',
          dosageForm: 'capsule',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5,
          instructions: 'Take after food',
        },
        {
          medicineName: 'Paracetamol 650mg',
          genericName: 'Acetaminophen',
          dosageForm: 'tablet',
          dosage: '650mg',
          frequency: 'BD',
          durationDays: 3,
          instructions: 'For fever above 100F',
        },
      ],
      notes: 'Patient advised warm saline gargles and hydration.',
    };

    it('should create a valid multi-item prescription', async () => {
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

      vi.spyOn(Prescription, 'create').mockImplementation(async (data: any) => ({
        _id: prescriptionId,
        ...data,
        status: 'ISSUED',
        createdAt: new Date().toISOString(),
      }));

      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/prescriptions',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: validPrescriptionPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ISSUED');
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.diagnosis).toBe('Upper Respiratory Tract Infection');
    });

    it('should reject prescription creation with invalid medicine form or frequency (Zod 400)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const invalidPayload = {
        ...validPrescriptionPayload,
        items: [
          {
            medicineName: 'Amoxicillin 500mg',
            dosageForm: 'unknown_form', // Invalid
            dosage: '500mg',
            frequency: 'INVALID_FREQ', // Invalid
            durationDays: 5,
          },
        ],
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/prescriptions',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: invalidPayload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject prescription creation if required fields are missing (Zod 400)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR);

      const incompletePayload = {
        patientId: patientProfileId,
        // missing doctorId, items, diagnosis
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/prescriptions',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: incompletePayload,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthorized role (PATIENT/NURSE cannot create prescriptions -> 403)', async () => {
      const patientToken = createToken(ROLES.PATIENT);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/prescriptions',
        headers: { authorization: `Bearer ${patientToken}` },
        body: validPrescriptionPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should deny cross-hospital prescription creation', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId);

      const crossHospitalPayload = {
        ...validPrescriptionPayload,
        hospitalId: hospitalBId, // Mismatch with authenticated hospital
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/prescriptions',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: crossHospitalPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/prescriptions/:id (Ownership & Privacy)', () => {
    const mockPrescription = {
      _id: prescriptionId,
      hospitalId: hospitalAId,
      patientId: patientProfileId,
      doctorId: doctorProfileId,
      status: 'ISSUED',
      items: [
        {
          medicineName: 'Amoxicillin 500mg',
          dosageForm: 'capsule',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5,
        },
      ],
      diagnosis: 'Bacterial Pharyngitis',
      amendments: [],
      createdAt: new Date().toISOString(),
    };

    it('should allow patient to retrieve their own prescription', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: patientProfileId,
        userId: patientUserId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(prescriptionId);
    });

    it('should prevent patient from accessing another patient prescription (403)', async () => {
      const otherPatientToken = createToken(ROLES.PATIENT, hospitalAId, otherPatientUserId);

      // Other patient's profile has a different ID
      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: otherPatientProfileId,
        userId: otherPatientUserId,
        hospitalId: hospitalAId,
      } as any);

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any); // belongs to patientProfileId

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}`,
        headers: { authorization: `Bearer ${otherPatientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/prescriptions/:id/amend (Append-Only Amendment)', () => {
    it('should amend prescription preserving original items and logging audit record', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const existingPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'ISSUED',
        items: [
          {
            medicineName: 'Amoxicillin 500mg',
            dosageForm: 'capsule',
            dosage: '500mg',
            frequency: 'TDS',
            durationDays: 5,
          },
        ],
        amendments: [],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(existingPrescription);
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
      } as any);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const amendPayload = {
        reason: 'Patient reported mild penicillin allergy; switching to Azithromycin',
        items: [
          {
            medicineName: 'Azithromycin 500mg',
            genericName: 'Azithromycin',
            dosageForm: 'tablet',
            dosage: '500mg',
            frequency: 'OD',
            durationDays: 3,
            instructions: 'Take 1 hour before meal',
          },
        ],
        notes: 'Discontinue Amoxicillin immediately.',
      };

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/amend`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: amendPayload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('AMENDED');
      expect(existingPrescription.amendments.length).toBe(1);
      expect(existingPrescription.amendments[0].reason).toContain('penicillin allergy');
      expect(existingPrescription.amendments[0].previousItems[0].medicineName).toBe(
        'Amoxicillin 500mg',
      );
      expect(existingPrescription.items[0].medicineName).toBe('Azithromycin 500mg');
    });

    it('should reject amendment if mandatory reason is missing', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const existingPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'ISSUED',
        items: [],
        amendments: [],
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(existingPrescription);
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/amend`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          // missing reason
          items: [
            {
              medicineName: 'Azithromycin 500mg',
              dosageForm: 'tablet',
              dosage: '500mg',
              frequency: 'OD',
              durationDays: 3,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
