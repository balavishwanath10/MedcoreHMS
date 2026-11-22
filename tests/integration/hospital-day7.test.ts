import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Hospital } from '../../src/server/models/Hospital.js';
import { Department } from '../../src/server/models/Department.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { User } from '../../src/server/models/User.js';
import { UserRole } from '../../src/shared/types/index.js';

describe('Day 7: Hospital Onboarding, Departments & Doctor Profiles Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const createToken = (role: UserRole, hospitalId: string | null = hospitalAId) => {
    return generateAccessToken({
      userId: new mongoose.Types.ObjectId().toString(),
      email: `${role.toLowerCase()}@test.hospital`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Super Admin Hospital Creation & Onboarding
  // =========================================================================
  describe('Hospital Creation & Onboarding (POST /api/hospitals)', () => {
    const validHospitalPayload = {
      name: 'General Care Hospital',
      code: 'GENCARE',
      email: 'contact@gencare.org',
      phone: '+1-555-0100',
      address: {
        street: '123 Health Ave',
        city: 'Metropolis',
        state: 'NY',
        postalCode: '10001',
        country: 'USA',
      },
      licenseNumber: 'LIC-GEN-2026',
      status: 'ONBOARDING' as const,
    };

    it('should allow SUPER_ADMIN to create and onboard a new hospital', async () => {
      const superAdminToken = createToken('SUPER_ADMIN', null);

      vi.spyOn(Hospital, 'findOne').mockResolvedValue(null);
      vi.spyOn(Hospital, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
            createdAt: new Date(),
          }) as any,
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/hospitals',
        headers: { authorization: `Bearer ${superAdminToken}` },
        body: validHospitalPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('General Care Hospital');
      expect(res.body.data.code).toBe('GENCARE');
    });

    it('should reject hospital creation when requested by unauthorized role (e.g. HOSPITAL_ADMIN, DOCTOR)', async () => {
      const hospitalAdminToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/hospitals',
        headers: { authorization: `Bearer ${hospitalAdminToken}` },
        body: validHospitalPayload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject duplicate hospital code with 409 Conflict', async () => {
      const superAdminToken = createToken('SUPER_ADMIN', null);

      vi.spyOn(Hospital, 'findOne').mockResolvedValueOnce({
        _id: new mongoose.Types.ObjectId(),
        code: 'GENCARE',
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/hospitals',
        headers: { authorization: `Bearer ${superAdminToken}` },
        body: validHospitalPayload,
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('HOSPITAL_CODE_EXISTS');
    });

    it('should reject invalid hospital payload (validation error)', async () => {
      const superAdminToken = createToken('SUPER_ADMIN', null);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/hospitals',
        headers: { authorization: `Bearer ${superAdminToken}` },
        body: {
          name: 'X', // Too short (min 2)
          code: 'INVALID_TOOLONGCODE', // Max 10
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. Hospital Status Verification & Activation
  // =========================================================================
  describe('Hospital Status Verification (PATCH /api/hospitals/:id/status)', () => {
    it('should allow SUPER_ADMIN to verify and activate an onboarded hospital', async () => {
      const superAdminToken = createToken('SUPER_ADMIN', null);
      const targetId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(Hospital, 'findOneAndUpdate').mockResolvedValue({
        _id: targetId,
        name: 'General Care Hospital',
        status: 'ACTIVE',
      } as any);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/hospitals/${targetId}/status`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        body: { status: 'ACTIVE', reason: 'Verification documents confirmed' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should forbid HOSPITAL_ADMIN from changing verification status', async () => {
      const hospitalAdminToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/hospitals/${hospitalAId}/status`,
        headers: { authorization: `Bearer ${hospitalAdminToken}` },
        body: { status: 'ACTIVE' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 3. Multi-Tenant Cross-Access Boundary Protection
  // =========================================================================
  describe('Cross-Tenant Hospital Isolation', () => {
    it('should reject HOSPITAL_ADMIN attempting to update another tenant hospital', async () => {
      const adminHospitalAToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/hospitals/${hospitalBId}`,
        headers: { authorization: `Bearer ${adminHospitalAToken}` },
        body: { name: 'Compromised Name' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should allow HOSPITAL_ADMIN to update their own hospital settings', async () => {
      const adminHospitalAToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      vi.spyOn(Hospital, 'findOneAndUpdate').mockResolvedValue({
        _id: hospitalAId,
        name: 'Hospital A Renamed',
        settings: { appointmentSlotDurationMinutes: 45 },
      } as any);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/hospitals/${hospitalAId}`,
        headers: { authorization: `Bearer ${adminHospitalAToken}` },
        body: {
          settings: { appointmentSlotDurationMinutes: 45 },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settings.appointmentSlotDurationMinutes).toBe(45);
    });
  });

  // =========================================================================
  // 4. Department Management
  // =========================================================================
  describe('Department Management (/api/departments)', () => {
    it('should create a department within the tenant hospital', async () => {
      const adminToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      vi.spyOn(Department, 'findOne').mockResolvedValue(null);
      vi.spyOn(Department, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
            isActive: true,
          }) as any,
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/departments',
        headers: { authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Cardiology Department',
          code: 'CARD',
          description: 'Heart and cardiovascular health',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Cardiology Department');
      expect(res.body.data.code).toBe('CARD');
    });

    it('should reject duplicate department code in same hospital', async () => {
      const adminToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      vi.spyOn(Department, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        code: 'CARD',
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/departments',
        headers: { authorization: `Bearer ${adminToken}` },
        body: {
          name: 'Cardiology 2',
          code: 'CARD',
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DEPARTMENT_CODE_EXISTS');
    });

    it('should prevent cross-tenant department access', async () => {
      const adminHospitalAToken = createToken('HOSPITAL_ADMIN', hospitalAId);
      const targetDeptId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(Department, 'findOne').mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          _id: targetDeptId,
          hospitalId: new mongoose.Types.ObjectId(hospitalBId),
          name: 'Hospital B Oncology',
        }),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/departments/${targetDeptId}`,
        headers: { authorization: `Bearer ${adminHospitalAToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 5. Doctor Profile Management & Department Link
  // =========================================================================
  describe('Doctor Profile Management (/api/doctors)', () => {
    it('should create a doctor profile linked to user and department', async () => {
      const adminToken = createToken('HOSPITAL_ADMIN', hospitalAId);
      const targetUserId = new mongoose.Types.ObjectId().toString();
      const targetDeptId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: targetUserId,
        role: 'DOCTOR',
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        isDeleted: false,
      } as any);

      vi.spyOn(Department, 'findOne').mockResolvedValue({
        _id: targetDeptId,
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        isDeleted: false,
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(null);

      vi.spyOn(DoctorProfile, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
          }) as any,
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/doctors',
        headers: { authorization: `Bearer ${adminToken}` },
        body: {
          userId: targetUserId,
          departmentId: targetDeptId,
          licenseNumber: 'MD-NY-2026-99',
          specialization: 'Cardiologist',
          qualifications: ['MBBS', 'MD Cardiology'],
          experienceYears: 8,
          consultationFee: 150,
          bio: 'Experienced cardiovascular specialist',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.specialization).toBe('Cardiologist');
      expect(res.body.data.licenseNumber).toBe('MD-NY-2026-99');
    });

    it('should reject doctor profile creation if referenced user has wrong role', async () => {
      const adminToken = createToken('HOSPITAL_ADMIN', hospitalAId);
      const targetUserId = new mongoose.Types.ObjectId().toString();
      const targetDeptId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: targetUserId,
        role: 'PATIENT', // Not DOCTOR!
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/doctors',
        headers: { authorization: `Bearer ${adminToken}` },
        body: {
          userId: targetUserId,
          departmentId: targetDeptId,
          licenseNumber: 'MD-FAIL-01',
          specialization: 'General',
          qualifications: ['MBBS'],
          experienceYears: 2,
          consultationFee: 50,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_ROLE');
    });

    it('should deny cross-tenant doctor profile viewing', async () => {
      const doctorAId = new mongoose.Types.ObjectId().toString();
      const adminHospitalAToken = createToken('HOSPITAL_ADMIN', hospitalAId);

      vi.spyOn(DoctorProfile, 'findOne').mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockResolvedValue({
            _id: doctorAId,
            hospitalId: new mongoose.Types.ObjectId(hospitalBId),
            specialization: 'Neurologist',
          }),
        }),
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/doctors/${doctorAId}`,
        headers: { authorization: `Bearer ${adminHospitalAToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });
});
