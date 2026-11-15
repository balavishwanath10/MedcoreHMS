import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { User } from '../../src/server/models/User.js';
import { RefreshToken, hashToken } from '../../src/server/models/RefreshToken.js';
import { generateRefreshToken } from '../../src/server/utils/jwt.js';

describe('Authentication Lifecycle, Recovery & OTP Integration Tests (Day 5)', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyHospitalId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Refresh Token Rotation & Reuse Detection (5.1 & 5.2)', () => {
    it('should rotate refresh token and issue new access token', async () => {
      const familyId = crypto.randomUUID();
      const initialRefreshToken = generateRefreshToken(
        {
          userId: dummyUserId.toString(),
          email: 'doctor@metro.local',
          role: 'DOCTOR',
          hospitalId: dummyHospitalId.toString(),
        },
        familyId,
      );

      const storedTokenDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: dummyUserId,
        tokenHash: hashToken(initialRefreshToken),
        familyId,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(storedTokenDoc as any);
      vi.spyOn(RefreshToken, 'create').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          cookie: `refreshToken=${initialRefreshToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(storedTokenDoc.isRevoked).toBe(true);
      expect(res.cookies['refreshToken']).toBeDefined();
      expect(res.cookies['refreshToken']).not.toBe(initialRefreshToken);
    });

    it('CRITICAL SECURITY: should detect refresh token reuse and revoke token family (5.2)', async () => {
      const familyId = 'family-reuse-check-999';
      const reusedToken = generateRefreshToken(
        {
          userId: dummyUserId.toString(),
          email: 'doctor@metro.local',
          role: 'DOCTOR',
          hospitalId: dummyHospitalId.toString(),
        },
        familyId,
      );

      // Stored token is ALREADY revoked (indicating reuse attempt of an old token)
      const revokedTokenDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: dummyUserId,
        tokenHash: hashToken(reusedToken),
        familyId,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      vi.spyOn(RefreshToken, 'findOne').mockResolvedValue(revokedTokenDoc as any);
      const updateManySpy = vi.spyOn(RefreshToken, 'updateMany').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/refresh',
        headers: {
          cookie: `refreshToken=${reusedToken}`,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
      // Must revoke the entire family
      expect(updateManySpy).toHaveBeenCalledWith({ familyId }, { $set: { isRevoked: true } });
    });
  });

  describe('Logout & Session Revocation (5.3)', () => {
    it('should revoke the active refresh token and clear cookie', async () => {
      const activeToken = generateRefreshToken({
        userId: dummyUserId.toString(),
        email: 'user@metro.local',
        role: 'PATIENT',
        hospitalId: null,
      });

      const updateOneSpy = vi.spyOn(RefreshToken, 'updateOne').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          cookie: `refreshToken=${activeToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(updateOneSpy).toHaveBeenCalledWith(
        { tokenHash: hashToken(activeToken) },
        { $set: { isRevoked: true } },
      );
    });
  });

  describe('Password Recovery Workflow (5.4)', () => {
    it('should handle forgot password without account enumeration', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/forgot-password',
        body: { email: 'nonexistent@medcore.local' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('instructions have been dispatched');
    });

    it('should reject invalid or expired reset token (400)', async () => {
      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/reset-password',
        body: {
          token: 'invalid_or_expired_token_string_must_be_at_least_32_characters_long',
          newPassword: 'BrandNewSecurePassword2026!',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_RESET_TOKEN');
    });

    it('should successfully reset password, clear token, and revoke active sessions', async () => {
      const rawToken = 'a'.repeat(64);
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const mockUser = {
        _id: dummyUserId,
        email: 'patient@metro.local',
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const updateManySpy = vi.spyOn(RefreshToken, 'updateMany').mockResolvedValue({} as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/reset-password',
        body: {
          token: rawToken,
          newPassword: 'BrandNewSecurePassword2026!',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.passwordResetTokenHash).toBeNull();
      expect(mockUser.passwordResetExpires).toBeNull();
      expect(updateManySpy).toHaveBeenCalledWith(
        { userId: dummyUserId },
        { $set: { isRevoked: true } },
      );
    });
  });

  describe('Email OTP Verification (5.5)', () => {
    it('should generate and send 6-digit email OTP', async () => {
      const mockUser = {
        _id: dummyUserId,
        email: 'verify@metro.local',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(mockUser as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/send-email-otp',
        body: { email: 'verify@metro.local' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should verify email with correct 6-digit OTP', async () => {
      const rawOtp = '123456';
      const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

      const mockUser = {
        _id: dummyUserId,
        email: 'verify@metro.local',
        emailOtpHash: otpHash,
        emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        emailOtpAttempts: 0,
        isEmailVerified: false,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/verify-email-otp',
        body: { email: 'verify@metro.local', otp: '123456' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.isEmailVerified).toBe(true);
      expect(mockUser.emailOtpHash).toBeNull();
    });

    it('should reject incorrect OTP and increment attempt count', async () => {
      const rawOtp = '123456';
      const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

      const mockUser = {
        _id: dummyUserId,
        email: 'verify@metro.local',
        emailOtpHash: otpHash,
        emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        emailOtpAttempts: 2,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/verify-email-otp',
        body: { email: 'verify@metro.local', otp: '999999' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(mockUser.emailOtpAttempts).toBe(3);
    });

    it('should lockout verification when max attempts (5) are reached (429)', async () => {
      const mockUser = {
        _id: dummyUserId,
        email: 'locked@metro.local',
        emailOtpAttempts: 5,
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/verify-email-otp',
        body: { email: 'locked@metro.local', otp: '123456' },
      });

      expect(res.statusCode).toBe(429);
      expect(res.body.error.code).toBe('OTP_MAX_ATTEMPTS_EXCEEDED');
    });
  });

  describe('Phone OTP Verification (5.6)', () => {
    it('should verify phone number with correct OTP', async () => {
      const rawOtp = '654321';
      const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

      const mockUser = {
        _id: dummyUserId,
        phone: '+1-555-9876',
        phoneOtpHash: otpHash,
        phoneOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        phoneOtpAttempts: 0,
        isPhoneVerified: false,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockReturnValue({
        select: vi.fn().mockResolvedValue(mockUser),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/auth/verify-phone-otp',
        body: { phone: '+1-555-9876', otp: '654321' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUser.isPhoneVerified).toBe(true);
    });
  });
});
