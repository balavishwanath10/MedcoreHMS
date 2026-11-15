import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { UserRole, ALL_ROLES } from '../../src/shared/types/index.js';

describe('RBAC & Multi-Tenant Isolation Integration Tests (Day 6)', () => {
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

  // ==========================================
  // Check 1, 2, 3: Role-Based Authorization
  // ==========================================
  describe('RBAC Core Enforcement (Checks 1, 2, 3)', () => {
    it('CHECK 2: should return 401 Unauthorized when Authorization header is missing', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/doctor-only',
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED_NO_TOKEN');
    });

    it('CHECK 1: should return 403 Forbidden when authenticated user lacks required role', async () => {
      const nurseToken = createToken('NURSE');

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/doctor-only',
        headers: {
          authorization: `Bearer ${nurseToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('CHECK 3: should return 200 OK when authenticated user has the required role', async () => {
      const doctorToken = createToken('DOCTOR');

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/doctor-only',
        headers: {
          authorization: `Bearer ${doctorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Doctor access granted');
    });
  });

  // ==========================================
  // Check 4: Multi-Role Authorization
  // ==========================================
  describe('Multi-Role Access (Check 4)', () => {
    it('should allow DOCTOR to access clinical endpoint', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/clinical',
        headers: {
          authorization: `Bearer ${createToken('DOCTOR')}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should allow NURSE to access clinical endpoint', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/clinical',
        headers: {
          authorization: `Bearer ${createToken('NURSE')}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-clinical role (e.g. ACCOUNTANT) from clinical endpoint (403)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/clinical',
        headers: {
          authorization: `Bearer ${createToken('ACCOUNTANT')}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ==========================================
  // Check 5: All 9 PRD Roles Validation
  // ==========================================
  describe('Validation of All 9 PRD Roles (Check 5)', () => {
    it('should verify all 9 roles exist in ALL_ROLES constant', () => {
      expect(ALL_ROLES).toHaveLength(9);
      expect(ALL_ROLES).toContain('SUPER_ADMIN');
      expect(ALL_ROLES).toContain('HOSPITAL_ADMIN');
      expect(ALL_ROLES).toContain('DOCTOR');
      expect(ALL_ROLES).toContain('NURSE');
      expect(ALL_ROLES).toContain('RECEPTIONIST');
      expect(ALL_ROLES).toContain('LAB_TECHNICIAN');
      expect(ALL_ROLES).toContain('PHARMACIST');
      expect(ALL_ROLES).toContain('ACCOUNTANT');
      expect(ALL_ROLES).toContain('PATIENT');
    });

    const roleEndpointMatrix: Array<{ role: UserRole; endpoint: string }> = [
      { role: 'DOCTOR', endpoint: '/api/security/doctor-only' },
      { role: 'NURSE', endpoint: '/api/security/nurse-only' },
      { role: 'LAB_TECHNICIAN', endpoint: '/api/security/lab-only' },
      { role: 'PHARMACIST', endpoint: '/api/security/pharmacy-only' },
      { role: 'RECEPTIONIST', endpoint: '/api/security/receptionist-only' },
      { role: 'ACCOUNTANT', endpoint: '/api/security/accountant-only' },
      { role: 'PATIENT', endpoint: '/api/security/patient-only' },
      { role: 'HOSPITAL_ADMIN', endpoint: '/api/security/admin-only' },
      { role: 'SUPER_ADMIN', endpoint: '/api/security/admin-only' },
    ];

    for (const { role, endpoint } of roleEndpointMatrix) {
      it(`should grant access to role ${role} at its authorized endpoint`, async () => {
        const token = createToken(role);
        const res = await makeRequest(app, {
          method: 'GET',
          url: endpoint,
          headers: {
            authorization: `Bearer ${token}`,
          },
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
      });
    }
  });

  // ==========================================
  // Check 6: Non-Super-Admin without hospitalId
  // ==========================================
  describe('Tenant Context Requirement (Check 6)', () => {
    it('CHECK 6: should return 403 TENANT_REQUIRED when non-SuperAdmin has no hospitalId', async () => {
      const orphanDoctorToken = createToken('DOCTOR', null);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/tenant-data',
        headers: {
          authorization: `Bearer ${orphanDoctorToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_REQUIRED');
    });
  });

  // ==========================================
  // Checks 7, 8, 9: Cross-Tenant Isolation & SuperAdmin
  // ==========================================
  describe('Multi-Tenant Data Isolation (Checks 7, 8, 9)', () => {
    it('CHECK 8: should allow user from Hospital A to access Hospital A resources', async () => {
      const doctorTokenA = createToken('DOCTOR', hospitalAId);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/security/hospitals/${hospitalAId}/records`,
        headers: {
          authorization: `Bearer ${doctorTokenA}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessible).toBe(true);
      expect(res.body.data.hospitalId).toBe(hospitalAId);
    });

    it('CHECK 7: CRITICAL SECURITY: should block user from Hospital A attempting to access Hospital B (403)', async () => {
      const doctorTokenA = createToken('DOCTOR', hospitalAId);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/security/hospitals/${hospitalBId}/records`,
        headers: {
          authorization: `Bearer ${doctorTokenA}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
      expect(res.body.error.message).toContain(
        'Access to resources of another hospital is strictly prohibited',
      );
    });

    it('CHECK 9: should allow SUPER_ADMIN to access any hospital without cross-tenant block', async () => {
      const superAdminToken = createToken('SUPER_ADMIN', null);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/security/hospitals/${hospitalBId}/records`,
        headers: {
          authorization: `Bearer ${superAdminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessible).toBe(true);
      expect(res.body.data.targetHospitalId).toBe(hospitalBId);
    });
  });

  // ==========================================
  // Check 10: Anti-Tampering & Client Injection Resistance
  // ==========================================
  describe('Tenant Scoping Anti-Tampering (Check 10)', () => {
    it('CHECK 10: should reject client query param injection attempting cross-tenant access', async () => {
      const receptionistTokenA = createToken('RECEPTIONIST', hospitalAId);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/security/tenant-data?hospitalId=${hospitalBId}`,
        headers: {
          authorization: `Bearer ${receptionistTokenA}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('CHECK 10: should sanitize and lock request body hospitalId to authenticated tenant', async () => {
      const nurseTokenA = createToken('NURSE', hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/security/tenant-records',
        headers: {
          authorization: `Bearer ${nurseTokenA}`,
        },
        body: {
          name: 'Triage Record',
          hospitalId: hospitalAId, // matching tenant
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hospitalId).toBe(hospitalAId);
    });

    it('CHECK 10: should block client body injection targeting a different hospitalId', async () => {
      const nurseTokenA = createToken('NURSE', hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/security/tenant-records',
        headers: {
          authorization: `Bearer ${nurseTokenA}`,
        },
        body: {
          name: 'Spoofed Record',
          hospitalId: hospitalBId, // attacker attempting to write into Hospital B
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // ==========================================
  // Database Query Scoping & Utility Assertions
  // ==========================================
  describe('Tenant Query Scoping & Utilities', () => {
    it('should inject user hospitalId into Mongoose query filter via withTenant', async () => {
      const accountantTokenA = createToken('ACCOUNTANT', hospitalAId);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/query-scope',
        headers: {
          authorization: `Bearer ${accountantTokenA}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.filter.hospitalId).toBe(hospitalAId);
      expect(res.body.data.filter.isDeleted).toBe(false);
    });

    it('should allow assertTenantAccess when user hospital matches resource hospital', async () => {
      const token = createToken('DOCTOR', hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/security/assert-access/${hospitalAId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject assertTenantAccess when user hospital does not match resource hospital', async () => {
      const token = createToken('DOCTOR', hospitalAId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/security/assert-access/${hospitalBId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // ==========================================
  // Granular Permissions (requirePermission)
  // ==========================================
  describe('Granular Permissions Verification', () => {
    it('should grant DOCTOR permission to prescriptions-write', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/prescriptions-write',
        headers: {
          authorization: `Bearer ${createToken('DOCTOR')}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny NURSE permission to prescriptions-write (403)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/prescriptions-write',
        headers: {
          authorization: `Bearer ${createToken('NURSE')}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('lacks permission');
    });

    it('should grant PHARMACIST permission to prescriptions-dispense', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/prescriptions-dispense',
        headers: {
          authorization: `Bearer ${createToken('PHARMACIST')}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny DOCTOR permission to prescriptions-dispense (403)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/prescriptions-dispense',
        headers: {
          authorization: `Bearer ${createToken('DOCTOR')}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should grant ACCOUNTANT permission to billing-manage', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/billing-manage',
        headers: {
          authorization: `Bearer ${createToken('ACCOUNTANT')}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should deny PATIENT permission to billing-manage (403)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/security/billing-manage',
        headers: {
          authorization: `Bearer ${createToken('PATIENT')}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
