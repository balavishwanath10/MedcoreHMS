import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Middleware ensuring valid multi-tenant context and strict data isolation.
 *
 * Rules:
 * 1. User must be authenticated (req.user present).
 * 2. SUPER_ADMIN is exempt from tenant binding, but can specify target hospital via param/query/header.
 * 3. All other 8 roles must have a valid hospitalId in their authenticated token context.
 * 4. Any attempt to target a different hospital via param, query, body, or header is blocked (403 CROSS_TENANT_ACCESS_DENIED).
 * 5. Downstream req.hospitalId and req.body.hospitalId are strictly locked to req.user.hospitalId.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required to access tenant resources.',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // SUPER_ADMIN handling (platform-wide access)
  if (req.user.role === 'SUPER_ADMIN') {
    const targetHospitalId =
      (req.params.hospitalId as string) ||
      (req.query.hospitalId as string) ||
      (req.headers['x-hospital-id'] as string) ||
      (req.body?.hospitalId as string);

    if (targetHospitalId) {
      req.targetHospitalId = targetHospitalId;
      req.hospitalId = targetHospitalId;
    }

    return next();
  }

  // Non-SuperAdmin must belong to a hospital
  const userHospitalId = req.user.hospitalId;
  if (!userHospitalId) {
    logger.warn('Access denied: authenticated non-SuperAdmin user has no tenant hospitalId', {
      userId: req.user.userId,
      role: req.user.role,
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_REQUIRED',
        message: 'Tenant hospital context is required.',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check for cross-tenant targeting attempts
  const explicitTarget =
    (req.params.hospitalId as string) ||
    (req.query.hospitalId as string) ||
    (req.headers['x-hospital-id'] as string) ||
    (req.body?.hospitalId as string);

  if (explicitTarget && explicitTarget !== userHospitalId) {
    logger.warn('CRITICAL SECURITY: Cross-tenant access attempt detected and blocked', {
      userId: req.user.userId,
      role: req.user.role,
      userHospitalId,
      attemptedTargetHospitalId: explicitTarget,
      path: req.originalUrl,
      method: req.method,
    });

    res.status(403).json({
      success: false,
      error: {
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Access to resources of another hospital is strictly prohibited.',
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Lock tenant scope
  req.hospitalId = userHospitalId;
  if (req.body && typeof req.body === 'object') {
    req.body.hospitalId = userHospitalId;
  }

  next();
}
