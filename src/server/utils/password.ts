import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 12;

export async function hashPassword(plaintextPassword: string): Promise<string> {
  if (!plaintextPassword || plaintextPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
  return bcrypt.hash(plaintextPassword, salt);
}

export async function verifyPassword(
  plaintextPassword: string,
  hashedPassword: string,
): Promise<boolean> {
  if (!plaintextPassword || !hashedPassword) {
    return false;
  }
  return bcrypt.compare(plaintextPassword, hashedPassword);
}
