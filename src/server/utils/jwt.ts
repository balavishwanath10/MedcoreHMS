import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { UserRole } from '../../shared/types/index.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  hospitalId: string | null;
}

export interface RefreshTokenPayload extends TokenPayload {
  familyId?: string;
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export function generateAccessToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function generateRefreshToken(payload: TokenPayload, familyId?: string): string {
  const tokenPayload: RefreshTokenPayload = {
    ...payload,
    ...(familyId ? { familyId } : {}),
  };
  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    jwtid: crypto.randomUUID(),
  };
  return jwt.sign(tokenPayload, env.JWT_REFRESH_SECRET, options);
}

export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    return decoded;
  } catch (error) {
    const err = error as Error;
    if (err.name === 'TokenExpiredError') {
      const expiredError = new Error('Access token has expired');
      expiredError.name = 'TokenExpiredError';
      throw expiredError;
    }
    const invalidError = new Error('Invalid access token');
    invalidError.name = 'JsonWebTokenError';
    throw invalidError;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch (error) {
    const err = error as Error;
    if (err.name === 'TokenExpiredError') {
      const expiredError = new Error('Refresh token has expired');
      expiredError.name = 'TokenExpiredError';
      throw expiredError;
    }
    const invalidError = new Error('Invalid refresh token');
    invalidError.name = 'JsonWebTokenError';
    throw invalidError;
  }
}
