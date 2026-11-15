import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  TokenPayload,
} from '../../src/server/utils/jwt.js';
import { env } from '../../src/server/config/env.js';

describe('JWT Issuance and Validation Utilities', () => {
  const dummyPayload: TokenPayload = {
    userId: '60d5ec49f1b2c8b1f8e4e1a1',
    email: 'dr.smith@metro.local',
    role: 'DOCTOR',
    hospitalId: '60d5ec49f1b2c8b1f8e4e1a0',
  };

  it('should generate an access token with 15-minute expiration', () => {
    const token = generateAccessToken(dummyPayload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(dummyPayload.userId);
    expect(decoded.email).toBe(dummyPayload.email);
    expect(decoded.role).toBe('DOCTOR');
    expect(decoded.hospitalId).toBe(dummyPayload.hospitalId);

    // Check exp - iat is roughly 900 seconds (15 minutes)
    const rawDecoded = jwt.decode(token) as { exp: number; iat: number };
    expect(rawDecoded.exp - rawDecoded.iat).toBe(15 * 60);
  });

  it('should generate a refresh token with 7-day expiration', () => {
    const token = generateRefreshToken(dummyPayload, 'fam-12345');
    expect(token).toBeDefined();

    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(dummyPayload.userId);
    expect(decoded.familyId).toBe('fam-12345');

    // Check exp - iat is roughly 604800 seconds (7 days)
    const rawDecoded = jwt.decode(token) as { exp: number; iat: number };
    expect(rawDecoded.exp - rawDecoded.iat).toBe(7 * 24 * 60 * 60);
  });

  it('should reject an expired access token', () => {
    // Generate an already-expired token
    const expiredToken = jwt.sign(dummyPayload, env.JWT_ACCESS_SECRET, { expiresIn: '-1s' });

    expect(() => verifyAccessToken(expiredToken)).toThrow('Access token has expired');
  });

  it('should reject a token signed with the wrong secret', () => {
    const foreignToken = jwt.sign(dummyPayload, 'unauthorized-foreign-signing-key');

    expect(() => verifyAccessToken(foreignToken)).toThrow('Invalid access token');
  });
});
