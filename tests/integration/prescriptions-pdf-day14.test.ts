import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Prescription } from '../../src/server/models/Prescription.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { Hospital } from '../../src/server/models/Hospital.js';
import { User } from '../../src/server/models/User.js';
import { AuditLog } from '../../src/server/models/AuditLog.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Day 14: Digital Signatures & Signed Prescription PDF Generation Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();

  const otherDoctorUserId = new mongoose.Types.ObjectId().toString();
  const otherDoctorProfileId = new mongoose.Types.ObjectId().toString();

  const patientUserId = new mongoose.Types.ObjectId().toString();
  const patientProfileId = new mongoose.Types.ObjectId().toString();

  const otherPatientUserId = new mongoose.Types.ObjectId().toString();
  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const prescriptionId = new mongoose.Types.ObjectId().toString();

  const sampleSignaturePng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

  describe('POST /api/doctors/:id/signature (Signature Upload & Validation)', () => {
    it('should upload valid PNG digital signature for authenticated doctor', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(mockDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: sampleSignaturePng,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.doctorId).toBe(doctorProfileId);
      expect(mockDoctor.signatureData).toBe(sampleSignaturePng);
      expect(mockDoctor.signatureMimeType).toBe('image/png');
    });

    it('should reject signature upload with invalid MIME type (e.g. image/jpeg or text/plain)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
          mimeType: 'image/jpeg', // Invalid - only image/png and image/svg+xml allowed
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject signature upload if file size exceeds 500KB', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      // Create >500KB payload
      const largeBase64 = 'A'.repeat(800 * 1024);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: largeBase64,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject doctor uploading signature for another doctor profile (403)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      // Target doctor belongs to another user
      const otherDoctor: any = {
        _id: otherDoctorProfileId,
        userId: otherDoctorUserId,
        hospitalId: hospitalAId,
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(otherDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${otherDoctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: sampleSignaturePng,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/prescriptions/:id/sign (Prescription Electronic Signing)', () => {
    it('should allow prescribing doctor to sign prescription with registered signature', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'ISSUED',
        signedAt: null,
        items: [{ medicineName: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'TDS' }],
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      const mockDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        signatureData: sampleSignaturePng,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(mockDoctor);
      vi.spyOn(AuditLog, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockPrescription.digitalSignature).toBe(sampleSignaturePng);
      expect(mockPrescription.signedAt).toBeDefined();
      expect(mockPrescription.signedBy).toBe(doctorProfileId);
    });

    it('should reject signing if prescription is already signed', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const alreadySignedPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'ISSUED',
        signedAt: new Date(),
        digitalSignature: sampleSignaturePng,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(alreadySignedPrescription);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('ALREADY_SIGNED');
    });

    it('should reject signing if prescription is cancelled', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const cancelledPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'CANCELLED',
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(cancelledPrescription);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('PRESCRIPTION_CANCELLED');
    });

    it('should reject signing if doctor has no registered digital signature', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const unsignedPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId,
        status: 'ISSUED',
        signedAt: null,
      };

      const doctorWithoutSignature: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        signatureData: null, // No signature on file
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(unsignedPrescription);
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(doctorWithoutSignature);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/sign`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('SIGNATURE_REQUIRED');
    });

    it('should reject signing by a doctor other than the prescribing doctor (403)', async () => {
      const otherDoctorToken = createToken(ROLES.DOCTOR, hospitalAId, otherDoctorUserId);

      const mockPrescription: any = {
        _id: prescriptionId,
        hospitalId: hospitalAId,
        patientId: patientProfileId,
        doctorId: doctorProfileId, // belongs to doctorProfileId
        status: 'ISSUED',
      };

      const otherDoctor: any = {
        _id: otherDoctorProfileId,
        userId: otherDoctorUserId,
        hospitalId: hospitalAId,
        signatureData: sampleSignaturePng,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription);
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(otherDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/prescriptions/${prescriptionId}/sign`,
        headers: { authorization: `Bearer ${otherDoctorToken}` },
        body: {},
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/prescriptions/:id/pdf (Signed Prescription PDF Generation)', () => {
    const mockPrescription = {
      _id: prescriptionId,
      hospitalId: hospitalAId,
      patientId: patientProfileId,
      doctorId: doctorProfileId,
      status: 'ISSUED',
      diagnosis: 'Acute Bronchitis',
      signedAt: new Date().toISOString(),
      digitalSignature: sampleSignaturePng,
      items: [
        {
          medicineName: 'Azithromycin 500mg',
          dosageForm: 'tablet',
          dosage: '500mg',
          frequency: 'OD',
          durationDays: 3,
          specialInstructions: 'Take before meals',
        },
      ],
      notes: 'Hydrate well and rest.',
      issuedAt: new Date().toISOString(),
    };

    const mockHospital = {
      _id: hospitalAId,
      name: 'St. Jude Memorial Hospital',
      licenseNumber: 'HOSP-NY-8891',
      phone: '+1-555-0199',
      email: 'records@stjude.hospital',
      address: { street: '100 Medical Blvd', city: 'New York', state: 'NY' },
    };

    const mockDoctorProfile = {
      _id: doctorProfileId,
      userId: doctorUserId,
      licenseNumber: 'DOC-NY-4421',
      specialization: 'Pulmonology',
      departmentName: 'Internal Medicine',
      signatureData: sampleSignaturePng,
    };

    const mockDoctorUser = {
      _id: doctorUserId,
      firstName: 'Sarah',
      lastName: 'Connor',
    };

    const mockPatientProfile = {
      _id: patientProfileId,
      userId: patientUserId,
      mrn: 'MRN-88712',
      gender: 'Male',
      dateOfBirth: '1985-05-15',
      bloodGroup: 'O+',
    };

    const mockPatientUser = {
      _id: patientUserId,
      firstName: 'Johnathan',
      lastName: 'Doe',
      phone: '+1-555-0123',
    };

    it('should generate valid PDF buffer with application/pdf header for attending doctor', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any);
      vi.spyOn(Hospital, 'findById').mockResolvedValue(mockHospital as any);
      vi.spyOn(DoctorProfile, 'findById').mockResolvedValue(mockDoctorProfile as any);
      (vi.spyOn(User, 'findById') as any).mockImplementation(async (id: any) => {
        if (id.toString() === doctorUserId) return mockDoctorUser as any;
        if (id.toString() === patientUserId) return mockPatientUser as any;
        return null;
      });
      vi.spyOn(PatientProfile, 'findById').mockResolvedValue(mockPatientProfile as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}/pdf`,
        headers: { authorization: `Bearer ${doctorToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain(`prescription-${prescriptionId}.pdf`);
      // Verify PDF binary starts with standard %PDF- header
      const bodyText = res.body instanceof Buffer ? res.body.toString('utf-8') : String(res.body);
      expect(bodyText.startsWith('%PDF-1.4')).toBe(true);
      expect(bodyText).toContain('%%EOF');
      expect(bodyText).toContain('MEDICAL PRESCRIPTION');
      expect(bodyText).toContain('Azithromycin 500mg');
    });

    it('should allow patient to download their own signed prescription PDF', async () => {
      const patientToken = createToken(ROLES.PATIENT, hospitalAId, patientUserId);

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any);
      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(mockPatientProfile as any);
      vi.spyOn(Hospital, 'findById').mockResolvedValue(mockHospital as any);
      vi.spyOn(DoctorProfile, 'findById').mockResolvedValue(mockDoctorProfile as any);
      (vi.spyOn(User, 'findById') as any).mockImplementation(async (id: any) => {
        if (id.toString() === doctorUserId) return mockDoctorUser as any;
        if (id.toString() === patientUserId) return mockPatientUser as any;
        return null;
      });
      vi.spyOn(PatientProfile, 'findById').mockResolvedValue(mockPatientProfile as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}/pdf`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('should deny patient access when trying to download another patient prescription PDF (403)', async () => {
      const otherPatientToken = createToken(ROLES.PATIENT, hospitalAId, otherPatientUserId);

      const otherPatientProfile = {
        _id: otherPatientProfileId,
        userId: otherPatientUserId,
      };

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any); // belongs to patientProfileId
      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue(otherPatientProfile as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}/pdf`,
        headers: { authorization: `Bearer ${otherPatientToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should deny cross-hospital prescription PDF download (403)', async () => {
      const crossHospitalToken = createToken(ROLES.DOCTOR, hospitalBId);

      vi.spyOn(Prescription, 'findOne').mockResolvedValue(mockPrescription as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/prescriptions/${prescriptionId}/pdf`,
        headers: { authorization: `Bearer ${crossHospitalToken}` },
      });

      // Rejected by requireTenant or controller cross-tenant check
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
