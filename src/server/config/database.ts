import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

interface DatabaseStatus {
  status: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
  readyState: number;
  host?: string;
  name?: string;
}

export function getDatabaseStatus(): DatabaseStatus {
  const readyState = mongoose.connection.readyState;
  let status: DatabaseStatus['status'] = 'disconnected';

  switch (readyState) {
    case 1:
      status = 'connected';
      break;
    case 2:
      status = 'connecting';
      break;
    case 3:
      status = 'disconnecting';
      break;
    default:
      status = 'disconnected';
  }

  return {
    status,
    readyState,
    host: readyState === 1 ? mongoose.connection.host : undefined,
    name: readyState === 1 ? mongoose.connection.name : undefined,
  };
}

export async function connectDatabase(): Promise<typeof mongoose | null> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // Safe logging: parse host without username/password
  const sanitizedUri = env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//[CREDENTIALS_REDACTED]@');

  try {
    logger.info('Attempting MongoDB connection...', { target: sanitizedUri });

    // Event listeners
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connection established successfully');
    });

    mongoose.connection.on('error', (err: Error) => {
      logger.error('MongoDB connection runtime error', { errorName: err.name });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    const conn = await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });

    return conn;
  } catch (error) {
    const err = error as Error;
    // Log error name and code, never credentials
    logger.error('Failed to connect to MongoDB', {
      errorName: err.name,
      message: err.message,
    });
    // Return null rather than crashing on startup when DB is initially offline,
    // allowing health check to report status truthfully.
    return null;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    logger.info('Closing MongoDB connection gracefully...');
    await mongoose.disconnect();
    logger.info('MongoDB disconnected cleanly');
  }
}
