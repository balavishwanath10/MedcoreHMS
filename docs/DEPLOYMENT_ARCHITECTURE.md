# MedCoreHMS — Deployment Architecture Specification

**Project:** MedCoreHMS
**Target Platform:** Render Web Service (Single Unified Service)
**Database:** MongoDB Atlas
**Architecture Model:** Unified Full-Stack Node.js/Express + React 19 SPA
**Date:** 2026-11-15

---

## 1. Unified Single-Service Deployment Model

In contrast to architectures that deploy the React frontend to a static host (e.g., Vercel, Netlify) and the backend API to a container service (e.g., Render, Railway, AWS ECS), MedCoreHMS is engineered to run as a **single unified Web Service on Render**.

```
+-------------------------------------------------------------------------+
|                         RENDER WEB SERVICE                              |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                  Express.js Server Process                      |   |
|   |                      (Port: process.env.PORT)                   |   |
|   |                                                                 |   |
|   |   +--------------------------+   +--------------------------+   |   |
|   |   |     REST API Router      |   |   Static Asset Server    |   |   |
|   |   |       (Prefix: /api)     |   |      (dist/client/)      |   |   |
|   |   |                          |   |                          |   |   |
|   |   |  - /api/health           |   |  - index.html            |   |   |
|   |   |  - /api/v1/auth          |   |  - assets/*.js           |   |   |
|   |   |  - /api/v1/hospitals     |   |  - assets/*.css          |   |   |
|   |   |  - /api/v1/patients      |   |  - SPA History Fallback  |   |   |
|   |   +--------------------------+   +--------------------------+   |   |
|   +-----------------------------------------------------------------+   |
+------------------------------------+------------------------------------+
                                     |
                                     | TLS / Mongoose 8
                                     v
                       +---------------------------+
                       |    MONGODB ATLAS CLUSTER  |
                       |    (Managed Replica Set)  |
                       +---------------------------+
```

---

## 2. Render Web Service Configuration

| Setting               | Configuration Value                     |
| :-------------------- | :-------------------------------------- |
| **Service Type**      | Web Service                             |
| **Environment**       | Node.js (Version 20+ / 22+ recommended) |
| **Root Directory**    | `.` (Repository root)                   |
| **Build Command**     | `npm install && npm run build`          |
| **Start Command**     | `npm start`                             |
| **Health Check Path** | `/api/health`                           |
| **Auto-Deploy**       | Yes (on push to `main` branch)          |

---

## 3. Build & Runtime Execution Flow

### 3.1 Build Phase (`npm run build`)

1. **Frontend Compilation (`npm run build:client`):** Vite compiles React 19 JSX/TSX and Tailwind CSS into minified static assets in `dist/client/`.
2. **Backend Compilation (`npm run build:server`):** TypeScript compiler (`tsc -p tsconfig.server.json`) compiles server code into `dist/server/`.

### 3.2 Runtime Phase (`npm start`)

1. Executes `node dist/server/server.js`.
2. Express loads validated environment variables via `src/server/config/env.js`.
3. Connects to MongoDB Atlas using Mongoose 8.
4. Binds to `process.env.PORT` (assigned dynamically by Render).
5. Serves incoming requests:
   - **Routes matching `/api/*`:** Routed to Express API controllers. Unhandled `/api/*` routes return 404 JSON.
   - **Static assets:** Files matching `dist/client/*` are served directly with HTTP cache headers.
   - **All other GET requests:** Served `dist/client/index.html` allowing React Router to handle client-side routing.

---

## 4. Environment Variables Required on Render

```bash
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/medcorehms?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<64-char-cryptographically-secure-random-string>
JWT_REFRESH_SECRET=<64-char-cryptographically-secure-random-string>
CLIENT_URL=https://medcorehms.onrender.com
```

---

## 5. Architectural Benefits of Unified Deployment

1. **Elimination of Cross-Origin Resource Sharing (CORS) Issues:** Because both the React client and Express API share the same origin, domain, and port in production, CORS complexity is eliminated for browser clients.
2. **Single Build & Deployment Pipeline:** Eliminates synchronization issues between frontend and backend versions. Every deployment is atomic.
3. **Cost Efficiency:** Consolidates compute resources into a single Render service instance rather than paying for two independent services.
4. **Simplified Secrets Management:** All runtime environment configuration lives in one Render environment dashboard.
