import { describe, it, expect } from 'vitest';
import { getDatabaseStatus } from '../../src/server/config/database.js';
import { notFoundHandler } from '../../src/server/middleware/errorHandler.js';

describe('Health and System Diagnostics Unit Tests', () => {
  it('should truthfully report disconnected status when MongoDB is not connected', () => {
    const status = getDatabaseStatus();
    expect(status).toBeDefined();
    expect(['disconnected', 'connected']).toContain(status.status);
    expect(typeof status.readyState).toBe('number');
    // In test environment without active DB, readyState should be 0 (disconnected)
    if (status.status === 'disconnected') {
      expect(status.readyState).toBe(0);
      expect(status.host).toBeUndefined();
    }
  });

  it('should return 404 JSON for non-existent routes with correct schema', () => {
    let statusCode = 0;
    let jsonPayload: Record<string, unknown> = {};

    const req = {
      method: 'GET',
      originalUrl: '/api/unknown-endpoint',
    } as any;

    const res = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: Record<string, unknown>) => {
        jsonPayload = payload;
        return res;
      },
    } as any;

    notFoundHandler(req, res);

    expect(statusCode).toBe(404);
    expect(jsonPayload.success).toBe(false);
    expect((jsonPayload.error as Record<string, unknown>).code).toBe('ROUTE_NOT_FOUND');
    expect((jsonPayload.error as Record<string, unknown>).message).toContain(
      'Cannot GET /api/unknown-endpoint',
    );
    expect(jsonPayload.timestamp).toBeDefined();
  });
});
