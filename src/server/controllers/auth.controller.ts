import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Hospital } from '../models/Hospital.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import { registerSchema, loginSchema } from '../../shared/schemas/index.js';
import { ROLES } from '../../shared/constants/roles.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validatedData = registerSchema.parse(req.body);
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    // Check for existing user
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

    // Verify hospitalId if provided
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

    // Security: Public registration always defaults strictly to PATIENT
    // Privileged roles cannot be self-assigned via public registration
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

    // Query user and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail, isDeleted: false }).select(
      '+passwordHash',
    );

    if (!user || !user.passwordHash) {
      // Constant-time feel response to avoid enumeration
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

    // Verify bcrypt password
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

    // Check account status
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

    // Generate JWTs
    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId ? user.hospitalId.toString() : null,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Set secure HttpOnly cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    logger.info('User authenticated successfully', {
      userId: user._id.toString(),
      role: user.role,
    });

    // Return access token and user info. NEVER return refresh token or password in JSON
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
        },
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
