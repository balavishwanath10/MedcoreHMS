import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const apiRouter = Router();

// Mount foundational routes
apiRouter.use(healthRouter);

// Base route for /api
apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'MedCoreHMS API',
      version: '0.1.0',
      description: 'Multi-Tenant Hospital Management System API',
      status: 'operational',
      endpoints: {
        health: '/api/health',
      },
    },
    timestamp: new Date().toISOString(),
  });
});
