import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED_NO_TOKEN',
        message: 'Authentication required. No authorization token provided.',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED_MALFORMED_TOKEN',
        message: 'Malformed authorization header. Expected Bearer <token>.',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    const err = error as Error;
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED_TOKEN_EXPIRED',
          message: 'Access token has expired. Please refresh your session.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED_INVALID_TOKEN',
        message: 'Invalid or tampered authentication token.',
      },
      timestamp: new Date().toISOString(),
    });
  }
}
