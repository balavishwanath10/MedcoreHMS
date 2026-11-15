import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/medcorehms'),
  JWT_ACCESS_SECRET: z.string().default('development-jwt-access-secret-min-32-chars-long'),
  JWT_REFRESH_SECRET: z.string().default('development-jwt-refresh-secret-min-32-chars-long'),
  REDIS_URL: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.format();
  // Safe logging without exposing values
  console.error('[CONFIG_ERROR] Invalid environment configuration:', Object.keys(formatted));
  throw new Error('Environment variable validation failed');
}

export const env = parsedEnv.data;
