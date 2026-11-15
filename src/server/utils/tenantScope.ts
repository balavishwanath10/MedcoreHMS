import { Request } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';

export function createTenantError(statusCode: number, code: string, message: string): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * Injects the tenant scope (hospitalId) into a Mongoose query filter object.
 *
 * - If user is SUPER_ADMIN:
 *   - If targetHospitalId is provided (or existing filter.hospitalId), queries that hospital.
 *   - If no hospitalId specified, returns unconstrained global filter.
 * - For all other roles:
 *   - Strictly locks filter.hospitalId to req.user.hospitalId.
 */
export function withTenant<T extends Record<string, any>>(
  req: Request,
  filter: T = {} as T,
): T & { hospitalId?: any } {
  if (req.user?.role === 'SUPER_ADMIN') {
    if (req.targetHospitalId) {
      return {
        ...filter,
        hospitalId: new mongoose.Types.ObjectId(req.targetHospitalId),
      };
    }
    return { ...filter };
  }

  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    throw createTenantError(
      403,
      'TENANT_REQUIRED',
      'Tenant context is required for database queries.',
    );
  }

  return {
    ...filter,
    hospitalId: new mongoose.Types.ObjectId(hospitalId),
  };
}

/**
 * Asserts that an authenticated user has authorization to access a resource owned by resourceHospitalId.
 * Throws 403 AppError if user belongs to a different hospital.
 */
export function assertTenantAccess(
  userHospitalId: string | null | undefined,
  resourceHospitalId: string | mongoose.Types.ObjectId,
  userRole?: string,
): void {
  // SUPER_ADMIN has platform-wide authority
  if (userRole === 'SUPER_ADMIN' || userHospitalId === null) {
    return;
  }

  if (!userHospitalId) {
    throw createTenantError(403, 'TENANT_REQUIRED', 'Tenant context is required.');
  }

  const resHospitalStr = resourceHospitalId.toString();
  if (userHospitalId !== resHospitalStr) {
    throw createTenantError(
      403,
      'CROSS_TENANT_ACCESS_DENIED',
      'Access to resources of another hospital is strictly prohibited.',
    );
  }
}

/**
 * Enforces that non-SuperAdmin mutation payloads cannot forge or spoof another hospital's ID.
 */
export function enforceTenantBody(req: Request): void {
  if (
    req.user?.role !== 'SUPER_ADMIN' &&
    req.user?.hospitalId &&
    req.body &&
    typeof req.body === 'object'
  ) {
    req.body.hospitalId = req.user.hospitalId;
  }
}
