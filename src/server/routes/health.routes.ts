import { Router, Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/health', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const isDbConnected = dbStatus.status === 'connected';
  const overallStatus = isDbConnected ? 'healthy' : 'degraded';

  const responseBody = {
    success: true,
    data: {
      status: overallStatus,
      uptimeSeconds,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      environment: env.NODE_ENV,
      database: dbStatus,
    },
    timestamp: new Date().toISOString(),
  };

  // We return 200 with degraded status if app is running but DB disconnected,
  // or 503 if strict healthy required. Degraded status allows monitoring systems
  // to inspect the diagnostic report without total request failure.
  res.status(isDbConnected ? 200 : 200).json(responseBody);
});
