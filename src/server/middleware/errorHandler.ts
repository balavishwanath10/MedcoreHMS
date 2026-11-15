import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
    timestamp: new Date().toISOString(),
  });
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  void _next;
  const isProduction = env.NODE_ENV === 'production';

  // Log error safely
  logger.error('Unhandled request error', {
    method: req.method,
    url: req.originalUrl,
    errorName: err.name,
    message: err.message,
    ...(isProduction ? {} : { stack: err.stack }),
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle Mongoose duplicate key error (11000)
  const errorObj = err as unknown as Record<string, unknown>;
  if (errorObj.code === 11000) {
    const keyPattern = errorObj.keyPattern as Record<string, number> | undefined;
    const field = keyPattern ? Object.keys(keyPattern).join(', ') : 'field';
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT_DUPLICATE',
        message: `A record with this ${field} already exists.`,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'SCHEMA_VALIDATION_ERROR',
        message: err.message,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = isProduction && statusCode === 500 ? 'Internal Server Error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      ...(isProduction ? {} : { details: err.details }),
    },
    timestamp: new Date().toISOString(),
  });
}
