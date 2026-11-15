# MedCoreHMS — Multi-Tenant Hospital Management System

MedCoreHMS is an enterprise-grade, multi-tenant Hospital Management System built from scratch as a unified full-stack application. It features strict data isolation between hospital tenants, role-based access control across nine specialized clinical and administrative roles, comprehensive Electronic Medical Records (EMR), appointment scheduling, pharmacy inventory with FIFO batch management, laboratory processing, and financial invoicing.

---

## 1. Unified Application Architecture

Unlike traditional multi-project repositories with separate `client/` and `server/` packages, MedCoreHMS is engineered as **ONE unified application** within a single root folder:

- **Single Root Structure:** One `package.json`, one `package-lock.json`, and one dependency tree.
- **Unified Build:** `npm run build` bundles the React 19 frontend into `dist/client` and compiles the Express TypeScript backend into `dist/server`.
- **Single Runtime Service:** Express hosts the REST API at `/api/*` and serves the production SPA static bundle on a single application port (`process.env.PORT`).
- **Target Platform:** Designed for seamless deployment as a single **Render Web Service** with external managed MongoDB Atlas.

---

## 2. Approved Technology Stack (Option A)

| Layer             | Technology               | Version        | Purpose                                          |
| :---------------- | :----------------------- | :------------- | :----------------------------------------------- |
| **Frontend**      | React                    | 19.0.0         | Component architecture & client view             |
| **Build Tool**    | Vite                     | 6.1.0          | Fast HMR and optimized production bundling       |
| **Language**      | TypeScript               | 5.7.3          | Strict end-to-end type safety                    |
| **Styling**       | Tailwind CSS             | 3.4.17         | Utility-first responsive design system           |
| **State & Cache** | TanStack Query & Zustand | 5.66.0 / 5.0.3 | Server-state caching and lightweight UI store    |
| **Routing**       | React Router             | 7.1.5          | Client-side SPA navigation                       |
| **Backend**       | Express.js               | 4.21.2         | Modular REST API service & static asset host     |
| **Database**      | MongoDB / Mongoose       | 8.10.1         | Document persistence & schema validation         |
| **Validation**    | Zod                      | 3.24.2         | Request payload validation & runtime parsing     |
| **Security**      | Helmet & CORS            | 8.0.0 / 2.8.5  | HTTP header hardening & strict origin allow-list |
| **Testing**       | Vitest                   | 3.0.5          | Blazing-fast unit and integration test runner    |

---

## 3. Project Directory Structure

```
MedCoreHMS/
|-- src/
|   |-- client/               # React 19 SPA frontend
|   |   |-- components/       # Reusable UI components & Layout
|   |   |-- pages/            # Page-level components (HomePage shell)
|   |   |-- hooks/            # Custom React hooks
|   |   |-- services/         # API clients (fetchHealth)
|   |   |-- store/            # Zustand state stores
|   |   |-- types/            # Client-specific types
|   |   |-- App.tsx           # Router & layout container
|   |   |-- main.tsx          # Application entry & QueryClientProvider
|   |   |-- index.css         # Tailwind base styles
|   |
|   |-- server/               # Express.js TypeScript backend
|   |   |-- config/           # Environment validation & DB connection
|   |   |-- middleware/       # Error handling, logging, notFound
|   |   |-- routes/           # REST endpoints (/api/health, /api)
|   |   |-- models/           # Mongoose schemas & indexes (Day 3)
|   |   |-- utils/            # Structured logger with redaction
|   |   |-- app.ts            # Express app configuration & middleware
|   |   |-- server.ts         # Server entry, DB init & graceful shutdown
|   |
|   |-- shared/               # Shared across client & server
|       |-- types/            # Domain interfaces (Hospital, User, Patient)
|       |-- schemas/          # Zod validation schemas
|       |-- constants/        # Nine PRD roles & enums
|
|-- dist/                     # Production build artifacts
|   |-- client/               # Compiled Vite frontend assets
|   |-- server/               # Compiled Express backend runtime
|
|-- tests/                    # Automated test suites
|   |-- unit/                 # Unit tests (health, schemas, models)
|   |-- integration/          # In-memory Express integration tests
|   |-- utils/                # In-memory test dispatcher
|
|-- docs/                     # Architectural documentation
|   |-- diagrams/             # Mermaid architectural diagrams
|   |-- reports/              # Daily verification completion reports
|
|-- index.html                # HTML5 entry template
|-- vite.config.ts            # Vite bundler & dev proxy config
|-- tsconfig.json             # Root & client TypeScript configuration
|-- tsconfig.server.json      # Server compilation configuration
|-- package.json              # Unified project dependencies & scripts
|-- .env.example              # Sample environment template
|-- .gitignore                # Git exclusions (secrets, builds, node_modules)
```

---

## 4. Prerequisites

- **Node.js:** v20.x or v22.x LTS (compatible with v26.3.x active)
- **npm:** v9.x or later
- **MongoDB:** MongoDB Atlas or local MongoDB replica set (for transaction support)

---

## 5. Installation and Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/balavishwanath10/MedCoreHMS.git
   cd MedCoreHMS
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   _Edit `.env` to configure your MongoDB connection string and runtime settings._

---

## 6. Available Scripts

| Command                    | Description                                                      |
| :------------------------- | :--------------------------------------------------------------- |
| `npm run dev`              | Runs both Express backend and Vite frontend concurrently         |
| `npm run dev:client`       | Starts Vite development server at `http://localhost:5173`        |
| `npm run dev:server`       | Starts Express backend in watch mode via `tsx` on `PORT`         |
| `npm run build`            | Builds both frontend (`dist/client`) and backend (`dist/server`) |
| `npm start`                | Launches production Express server hosting API & static frontend |
| `npm run typecheck`        | Validates strict TypeScript types for client and server          |
| `npm run lint`             | Runs TypeScript type checking and Prettier format verification   |
| `npm run format`           | Auto-formats codebase with Prettier                              |
| `npm test`                 | Executes all Vitest unit and integration test suites             |
| `npm run test:unit`        | Executes unit test suites                                        |
| `npm run test:integration` | Executes in-memory integration test suites                       |

---

## 7. Current Implementation Status

- [x] **Phase 0:** Environment & repository audit complete (`docs/INITIAL_ENVIRONMENT_AUDIT.md`).
- [x] **Day 1:** Unified React 19 + Express foundation operational; health endpoint verified; production build verified (`docs/reports/DAY_1_COMPLETION_REPORT.md`).
- [x] **Day 2:** Architecture & MongoDB schema design documented (`docs/reports/DAY_2_COMPLETION_REPORT.md`).
- [x] **Day 3:** Core Mongoose models implemented and verified (`docs/reports/DAY_3_COMPLETION_REPORT.md`).
- [ ] **Day 4+:** Authentication, RBAC, and business modules (Strictly out of scope until approved).
