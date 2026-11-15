import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
  }),
);

// CORS configuration - strict allow-list
const allowedOrigins = [
  env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Hospital-Id'],
  }),
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logging (sanitized)
app.use((req, _res, next) => {
  if (req.path !== '/api/health') {
    logger.debug(`${req.method} ${req.path}`);
  }
  next();
});

// Mount API routes under /api
app.use('/api', apiRouter);

// Any unhandled /api/* request must return 404 JSON, NEVER frontend HTML
app.all('/api/*', notFoundHandler);

// Production Static Assets & SPA Fallback
// When compiled, __dirname is dist/server, so static assets are in dist/client
const distClientPath = path.resolve(__dirname, '../client');
const clientIndexHtml = path.resolve(distClientPath, 'index.html');

if (fs.existsSync(distClientPath)) {
  // Serve static assets from dist/client
  app.use(express.static(distClientPath));

  // SPA fallback for all non-API GET requests
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(clientIndexHtml);
  });
} else {
  // In development without built frontend assets, return a simple JSON response for root
  app.get('/', (_req, res) => {
    res.json({
      name: 'MedCoreHMS Backend Service',
      status: 'operational',
      environment: env.NODE_ENV,
      clientUrl: env.CLIENT_URL,
      apiHealth: '/api/health',
    });
  });
}

// Global centralized error handler
app.use(errorHandler);
