import { AuditLog } from '../models/AuditLog.js';
import { logger } from './logger.js';

export async function recordAuditEvent(params: {
  hospitalId?: string | null;
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  diff?: { before?: any; after?: any };
}): Promise<void> {
  try {
    await AuditLog.create({
      ...params,
      timestamp: new Date(),
    });
    logger.info(`[AUDIT] ${params.action} on ${params.entityType}:${params.entityId}`, {
      userId: params.userId,
      userRole: params.userRole,
      hospitalId: params.hospitalId,
    });
  } catch (err: any) {
    logger.error('Failed to persist audit log record', {
      error: err.message,
      action: params.action,
    });
  }
}
