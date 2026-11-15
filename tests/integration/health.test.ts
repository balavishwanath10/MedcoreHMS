import { describe, it, expect } from 'vitest';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';

describe('GET /api/health Integration Tests', () => {
  it('should return 200 with truthful database status', async () => {
    const res = await makeRequest(app, {
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.version).toBe('0.1.0');
    expect(res.body.data.database).toBeDefined();
    expect(typeof res.body.data.database.readyState).toBe('number');
    expect(['connected', 'disconnected', 'degraded']).toContain(res.body.data.status);
  });

  it('should return 404 JSON for non-existent API routes', async () => {
    const res = await makeRequest(app, {
      method: 'GET',
      url: '/api/non-existent-route-xyz',
    });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
