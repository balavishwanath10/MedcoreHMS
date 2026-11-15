import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Hospital } from '../models/Hospital.js';
import { RefreshToken, hashToken } from '../models/RefreshToken.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendEmailOtpSchema,
  verifyEmailOtpSchema,
  sendPhoneOtpSchema,
  verifyPhoneOtpSchema,
} from '../../shared/schemas/index.js';
import { ROLES } from '../../shared/constants/roles.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { notificationService } from '../services/notification.service.js';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = registerSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let hospitalObjectId: mongoose.Types.ObjectId | null = null;
    if (validatedData.hospitalId) {
      if (!mongoose.Types.ObjectId.isValid(validatedData.hospitalId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_HOSPITAL_ID',
            message: 'Provided hospitalId is not a valid ObjectId format.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const hospital = await Hospital.findById(validatedData.hospitalId);
      if (!hospital || hospital.isDeleted) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_NOT_FOUND',
            message: 'Referenced hospital was not found or is inactive.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      hospitalObjectId = hospital._id as mongoose.Types.ObjectId;
    }

    const passwordHash = await hashPassword(validatedData.password);

    const newUser = await User.create({
      email: normalizedEmail,
      passwordHash,
      role: ROLES.PATIENT,
      firstName: validatedData.firstName.trim(),
      lastName: validatedData.lastName.trim(),
      phone: validatedData.phone?.trim(),
      hospitalId: hospitalObjectId,
      status: 'ACTIVE',
      isEmailVerified: false,
      isPhoneVerified: false,
    });

    logger.info('New patient account registered successfully', {
      userId: newUser._id.toString(),
      role: newUser.role,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser._id,
          email: newUser.email,
          role: newUser.role,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phone: newUser.phone,
          hospitalId: newUser.hospitalId,
          isEmailVerified: newUser.isEmailVerified,
          isPhoneVerified: newUser.isPhoneVerified,
          createdAt: newUser.createdAt,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = loginSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail, isDeleted: false }).select(
      '+passwordHash',
    );

    if (!user || !user.passwordHash) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const isPasswordValid = await verifyPassword(validatedData.password, user.passwordHash);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (user.status === 'SUSPENDED' || user.status === 'INACTIVE') {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been deactivated or suspended. Please contact administration.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const familyId = crypto.randomUUID();
    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId ? user.hospitalId.toString() : null,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload, familyId);

    // Persist refresh token hash
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      familyId,
      isRevoked: false,
      expiresAt,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    user.lastLoginAt = new Date();
    await user.save();

    logger.info('User authenticated successfully', {
      userId: user._id.toString(),
      role: user.role,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          hospitalId: user.hospitalId,
          status: user.status,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawRefreshToken) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED_NO_REFRESH_TOKEN',
          message: 'Refresh token is required.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Verify cryptographic signature and expiry of refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(rawRefreshToken);
    } catch (jwtErr) {
      const err = jwtErr as Error;
      res.status(401).json({
        success: false,
        error: {
          code:
            err.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'INVALID_REFRESH_TOKEN',
          message: err.message,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const incomingHash = hashToken(rawRefreshToken);
    const storedToken = await RefreshToken.findOne({ tokenHash: incomingHash });

    // REUSE DETECTION: If token record not found or already revoked, an attacker is reusing old tokens!
    if (!storedToken || storedToken.isRevoked) {
      logger.warn('Refresh token reuse detected! Invalidating all session tokens for family', {
        familyId: decoded.familyId,
        userId: decoded.userId,
      });

      if (decoded.familyId) {
        // Revoke the entire token family
        await RefreshToken.updateMany(
          { familyId: decoded.familyId },
          { $set: { isRevoked: true } },
        );
      }

      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REUSE_DETECTED',
          message:
            'Security alert: Refresh token reuse detected. All sessions terminated. Please login again.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check expiration against database record
    if (storedToken.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please login again.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Token is valid: Revoke the old token and rotate
    storedToken.isRevoked = true;
    await storedToken.save();

    const familyId = storedToken.familyId || crypto.randomUUID();
    const tokenPayload = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      hospitalId: decoded.hospitalId,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload, familyId);

    // Save new refresh token record
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      userId: new mongoose.Types.ObjectId(decoded.userId),
      tokenHash: hashToken(newRefreshToken),
      familyId,
      isRevoked: false,
      expiresAt: newExpiresAt,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await RefreshToken.updateOne({ tokenHash }, { $set: { isRevoked: true } });
    }

    res.clearCookie('refreshToken', { path: '/api/auth' });

    res.status(200).json({
      success: true,
      data: {
        message: 'Logged out successfully. Session tokens revoked.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail, isDeleted: false });

    // Anti-enumeration: Return same success message even if account does not exist
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      user.passwordResetTokenHash = resetTokenHash;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      // Dispatch reset email (without logging raw token)
      await notificationService.sendEmail({
        to: user.email,
        subject: 'MedCoreHMS — Password Reset Request',
        text: `You have requested a password reset. Use your reset link within 1 hour.`,
      });

      // In testing environment, attach token to res for test verification
      if (process.env.NODE_ENV === 'test') {
        res.setHeader('X-Test-Reset-Token', resetToken);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        message:
          'If an account exists with this email address, password reset instructions have been dispatched.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(validatedData.token).digest('hex');

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
      isDeleted: false,
    }).select('+passwordResetTokenHash +passwordResetExpires');

    if (!user) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OR_EXPIRED_RESET_TOKEN',
          message: 'Password reset token is invalid, already used, or expired.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Set new password (bcrypt cost 12)
    const newPasswordHash = await hashPassword(validatedData.newPassword);
    user.passwordHash = newPasswordHash;
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await user.save();

    // Revoke all active sessions for this user
    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });

    logger.info('Password successfully reset for user', { userId: user._id.toString() });

    res.status(200).json({
      success: true,
      data: {
        message: 'Password has been reset successfully. Please login with your new credentials.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function sendEmailOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = sendEmailOtpSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail, isDeleted: false });
    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'No account found with this email address.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Generate 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

    user.emailOtpHash = otpHash;
    user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.emailOtpAttempts = 0;
    await user.save();

    await notificationService.sendEmail({
      to: user.email,
      subject: 'MedCoreHMS — Verification Code',
      text: 'Your 6-digit verification code is valid for 10 minutes.',
    });

    if (process.env.NODE_ENV === 'test') {
      res.setHeader('X-Test-Email-Otp', rawOtp);
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'A 6-digit verification code has been dispatched to your email address.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = verifyEmailOtpSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail, isDeleted: false }).select(
      '+emailOtpHash +emailOtpExpires +emailOtpAttempts',
    );

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if ((user.emailOtpAttempts || 0) >= 5) {
      res.status(429).json({
        success: false,
        error: {
          code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
          message:
            'Maximum verification attempts exceeded. Please request a new verification code.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!user.emailOtpExpires || user.emailOtpExpires < new Date()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new code.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const providedHash = crypto.createHash('sha256').update(validatedData.otp).digest('hex');

    if (providedHash !== user.emailOtpHash) {
      user.emailOtpAttempts = (user.emailOtpAttempts || 0) + 1;
      await user.save();

      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: `Invalid verification code. ${5 - (user.emailOtpAttempts || 0)} attempts remaining.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    user.isEmailVerified = true;
    user.emailOtpHash = null;
    user.emailOtpExpires = null;
    user.emailOtpAttempts = 0;
    await user.save();

    logger.info('Email verified successfully via OTP', { userId: user._id.toString() });

    res.status(200).json({
      success: true,
      data: {
        message: 'Email address verified successfully.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function sendPhoneOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = sendPhoneOtpSchema.parse(req.body);
    const user = await User.findOne({ phone: validatedData.phone, isDeleted: false });

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'No account registered with this phone number.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

    user.phoneOtpHash = otpHash;
    user.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.phoneOtpAttempts = 0;
    await user.save();

    await notificationService.sendSms({
      to: validatedData.phone,
      message: `Your MedCoreHMS verification code is valid for 10 minutes.`,
    });

    if (process.env.NODE_ENV === 'test') {
      res.setHeader('X-Test-Phone-Otp', rawOtp);
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'A 6-digit verification code has been dispatched via SMS.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyPhoneOtp(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validatedData = verifyPhoneOtpSchema.parse(req.body);
    const user = await User.findOne({ phone: validatedData.phone, isDeleted: false }).select(
      '+phoneOtpHash +phoneOtpExpires +phoneOtpAttempts',
    );

    if (!user) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if ((user.phoneOtpAttempts || 0) >= 5) {
      res.status(429).json({
        success: false,
        error: {
          code: 'OTP_MAX_ATTEMPTS_EXCEEDED',
          message:
            'Maximum verification attempts exceeded. Please request a new verification code.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!user.phoneOtpExpires || user.phoneOtpExpires < new Date()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OTP_EXPIRED',
          message: 'Verification code has expired. Please request a new code.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const providedHash = crypto.createHash('sha256').update(validatedData.otp).digest('hex');

    if (providedHash !== user.phoneOtpHash) {
      user.phoneOtpAttempts = (user.phoneOtpAttempts || 0) + 1;
      await user.save();

      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: `Invalid verification code. ${5 - (user.phoneOtpAttempts || 0)} attempts remaining.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    user.isPhoneVerified = true;
    user.phoneOtpHash = null;
    user.phoneOtpExpires = null;
    user.phoneOtpAttempts = 0;
    await user.save();

    logger.info('Phone verified successfully via OTP', { userId: user._id.toString() });

    res.status(200).json({
      success: true,
      data: {
        message: 'Phone number verified successfully.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication context missing.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const user = await User.findById(req.user.userId);

    if (!user || user.isDeleted) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Authenticated user profile was not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          hospitalId: user.hospitalId,
          status: user.status,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
