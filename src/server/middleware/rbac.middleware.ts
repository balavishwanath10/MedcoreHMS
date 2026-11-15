import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../../shared/types/index.js';
import { logger } from '../utils/logger.js';

export type Permission =
  | 'hospitals:manage'
  | 'hospitals:read'
  | 'departments:manage'
  | 'departments:read'
  | 'staff:manage'
  | 'staff:read'
  | 'patients:manage'
  | 'patients:read'
  | 'patients:write'
  | 'patients:read_own'
  | 'appointments:manage'
  | 'appointments:read'
  | 'appointments:book'
  | 'appointments:book_own'
  | 'clinical:write'
  | 'clinical:read'
  | 'clinical:read_own'
  | 'prescriptions:write'
  | 'prescriptions:dispense'
  | 'prescriptions:read'
  | 'prescriptions:read_own'
  | 'lab:order'
  | 'lab:process'
  | 'lab:read'
  | 'lab:read_own'
  | 'billing:manage'
  | 'billing:read'
  | 'billing:pay_own'
  | 'audit:read_all'
  | 'audit:read_tenant';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    'hospitals:manage',
    'hospitals:read',
    'departments:read',
    'staff:read',
    'audit:read_all',
  ],
  HOSPITAL_ADMIN: [
    'hospitals:read',
    'departments:manage',
    'departments:read',
    'staff:manage',
    'staff:read',
    'patients:manage',
    'patients:read',
    'appointments:manage',
    'appointments:read',
    'billing:read',
    'audit:read_tenant',
  ],
  DOCTOR: [
    'departments:read',
    'staff:read',
    'patients:read',
    'patients:write',
    'appointments:read',
    'clinical:write',
    'clinical:read',
    'prescriptions:write',
    'prescriptions:read',
    'lab:order',
    'lab:read',
    'billing:read',
  ],
  NURSE: [
    'departments:read',
    'patients:read',
    'patients:write',
    'appointments:read',
    'clinical:read',
    'prescriptions:read',
    'lab:read',
  ],
  RECEPTIONIST: [
    'departments:read',
    'patients:manage',
    'patients:read',
    'patients:write',
    'appointments:manage',
    'appointments:read',
    'appointments:book',
    'billing:read',
  ],
  LAB_TECHNICIAN: ['patients:read', 'lab:order', 'lab:process', 'lab:read'],
  PHARMACIST: ['patients:read', 'prescriptions:dispense', 'prescriptions:read', 'billing:read'],
  ACCOUNTANT: ['patients:read', 'billing:manage', 'billing:read', 'audit:read_tenant'],
  PATIENT: [
    'patients:read_own',
    'appointments:book_own',
    'clinical:read_own',
    'prescriptions:read_own',
    'lab:read_own',
    'billing:pay_own',
  ],
};

/**
 * Enforces that an authenticated user has one of the allowed roles.
 * Returns 401 Unauthorized if not authenticated.
 * Returns 403 Forbidden if user's role is not in allowedRoles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to access this resource.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('RBAC role permission denied', {
        userId: req.user.userId,
        userRole: req.user.role,
        allowedRoles,
        url: req.originalUrl,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Enforces that an authenticated user has the required granular permission.
 * Returns 401 Unauthorized if not authenticated.
 * Returns 403 Forbidden if user's role lacks the permission.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required to access this resource.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userPermissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (!userPermissions.includes(permission)) {
      logger.warn('RBAC granular permission denied', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredPermission: permission,
        url: req.originalUrl,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied: role '${req.user.role}' lacks permission '${permission}'.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}
