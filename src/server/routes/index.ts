import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { securityRouter } from './security.routes.js';

export const apiRouter = Router();

// Mount foundational routes
apiRouter.use(healthRouter);

// Mount authentication routes under /api/auth and /api/v1/auth
apiRouter.use('/auth', authRouter);
apiRouter.use('/v1/auth', authRouter);

// Mount RBAC & Tenant security routes under /api/security and /api/v1/security
apiRouter.use('/security', securityRouter);
apiRouter.use('/v1/security', securityRouter);

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
        auth: '/api/auth',
        security: '/api/security',
      },
    },
    timestamp: new Date().toISOString(),
  });
});
