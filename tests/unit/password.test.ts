import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/server/utils/password.js';

describe('Password Security & Hashing Utilities', () => {
  it('should hash a valid password using bcrypt cost factor 12', async () => {
    const rawPassword = 'StrongPassword123!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);
    // Bcrypt hashes with cost factor 12 start with $2a$12$ or $2b$12$
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
  });

  it('should correctly verify a matching password', async () => {
    const rawPassword = 'ValidMedicalPassword2026#';
    const hash = await hashPassword(rawPassword);

    const isMatch = await verifyPassword(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject a mismatched password', async () => {
    const rawPassword = 'ValidMedicalPassword2026#';
    const wrongPassword = 'WrongPassword2026#';
    const hash = await hashPassword(rawPassword);

    const isMatch = await verifyPassword(wrongPassword, hash);
    expect(isMatch).toBe(false);
  });

  it('should reject passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters');
  });

  it('should return false when verifying with empty input', async () => {
    const isMatch = await verifyPassword('', '$2b$12$dummy');
    expect(isMatch).toBe(false);
  });
});
