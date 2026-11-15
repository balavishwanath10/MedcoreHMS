import { app } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    logger.info('Starting MedCoreHMS Unified Server...', {
      environment: env.NODE_ENV,
      port: env.PORT,
    });

    // Attempt database connection (does not crash if offline; logs status)
    await connectDatabase();

    server = app.listen(env.PORT, () => {
      logger.info(`MedCoreHMS server listening on port ${env.PORT}`, {
        healthEndpoint: `http://localhost:${env.PORT}/api/health`,
        environment: env.NODE_ENV,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit if shutdown takes longer than 10s
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000);
  } else {
    await disconnectDatabase();
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: env.NODE_ENV === 'production' ? undefined : error.stack,
  });
  process.exit(1);
});

startServer();
