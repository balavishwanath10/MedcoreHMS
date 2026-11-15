import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { User } from '../../src/server/models/User.js';
import { hashPassword } from '../../src/server/utils/password.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';

describe('Authentication API Endpoints Integration Tests', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyHospitalId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should successfully register a new patient user', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User, 'create').mockImplementation(async (userData: any) => ({
        _id: dummyUserId,
        email: userData.email,
        role: userData.role,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        hospitalId: userData.hospitalId,
        status: userData.status,
        isEmailVerified: false,
        createdAt: new Date(),
        toJSON: () => ({ email: userData.email, role: userData.role }),
      }) as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        body: {
          email: 'patient.test@example.com',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1-555-1234',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('patient.test@example.com');
      expect(res.body.data.user.role).toBe('PATIENT');
      // Password hash must never leak in response
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('should reject registration when email already exists (409 Conflict)', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        _id: dummyUserId,
        email: 'duplicate@example.com',
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        body: {
          email: 'duplicate@example.com',
          password: 'SecurePassword123!',
          firstName: 'Jane',
          lastName: 'Doe',
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should reject registration with invalid email or short password (400)', async () => {
      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        body: {
          email: 'not-an-email',
          password: 'short',
          firstName: 'J',
          lastName: 'D',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent privilege escalation by assigning PATIENT role regardless of client input', async () => {
      let createdRole = '';
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User, 'create').mockImplementation(async (userData: any) => {
        createdRole = userData.role;
        return {
          _id: dummyUserId,
          ...userData,
          createdAt: new Date(),
        } as any;
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        body: {
          email: 'escalation.attempt@example.com',
          password: 'SecurePassword123!',
          firstName: 'Attacker',
          lastName: 'User',
          role: 'SUPER_ADMIN', // Attempting to self-grant Super Admin
        },
      });

      expect(res.statusCode).toBe(201);
      expect(createdRole).toBe('PATIENT');
      expect(res.body.data.user.role).toBe('PATIENT');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should successfully authenticate user with valid credentials and set HttpOnly cookie', async () => {
      const password = 'CorrectPassword123!';
      const passwordHash = await hashPassword(password);

      const mockUser = {
        _id: dummyUserId,
        email: 'doctor.chen@metro.local',
        passwordHash,
        role: 'DOCTOR',
        firstName: 'Sarah',
        lastName: 'Chen',
        hospitalId: dummyHospitalId,
        status: 'ACTIVE',
        isEmailVerified: true,
        lastLoginAt: null,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'doctor.chen@metro.local',
          password: 'CorrectPassword123!',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.user.email).toBe('doctor.chen@metro.local');
      expect(res.body.data.user.role).toBe('DOCTOR');
      // Refresh token must NOT be in JSON body
      expect(res.body.data.refreshToken).toBeUndefined();
      // Password hash must NOT be in JSON body
      expect(res.body.data.user.passwordHash).toBeUndefined();
      // Refresh token must be in HttpOnly cookie
      expect(res.cookies['refreshToken']).toBeDefined();
    });

    it('should reject login with wrong password (401 Invalid Credentials)', async () => {
      const passwordHash = await hashPassword('CorrectPassword123!');
      const mockUser = {
        _id: dummyUserId,
        email: 'user@example.com',
        passwordHash,
        status: 'ACTIVE',
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'user@example.com',
          password: 'WrongPassword999!',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.data).toBeUndefined();
    });

    it('should reject login for nonexistent user (401 Invalid Credentials)', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for suspended accounts (403)', async () => {
      const password = 'ValidPassword123!';
      const passwordHash = await hashPassword(password);

      const mockUser = {
        _id: dummyUserId,
        email: 'suspended@metro.local',
        passwordHash,
        status: 'SUSPENDED',
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        body: {
          email: 'suspended@metro.local',
          password,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should reject requests without an Authorization header (401)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/auth/me',
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_NO_TOKEN');
    });

    it('should reject requests with invalid or tampered token (401)', async () => {
      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: 'Bearer invalid.tampered.token',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED_INVALID_TOKEN');
    });

    it('should return authenticated user profile for valid access token', async () => {
      const token = generateAccessToken({
        userId: dummyUserId.toString(),
        email: 'doctor.me@metro.local',
        role: 'DOCTOR',
        hospitalId: dummyHospitalId.toString(),
      });

      const mockUser = {
        _id: dummyUserId,
        email: 'doctor.me@metro.local',
        role: 'DOCTOR',
        firstName: 'Sarah',
        lastName: 'Chen',
        phone: '555-0101',
        hospitalId: dummyHospitalId,
        status: 'ACTIVE',
        isEmailVerified: true,
        createdAt: new Date(),
      };

      vi.spyOn(User, 'findById').mockResolvedValue(mockUser as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('doctor.me@metro.local');
      expect(res.body.data.user.role).toBe('DOCTOR');
      expect(res.body.data.user.passwordHash).toBeUndefined();
    });
  });
});
