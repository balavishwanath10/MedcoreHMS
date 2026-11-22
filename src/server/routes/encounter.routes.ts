import { Router } from 'express';
import { encounterController } from '../controllers/encounter.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

export const encounterRouter = Router();

// All encounter endpoints require authentication
encounterRouter.use(authenticateToken);
encounterRouter.use(requireTenant);

// Calculate vitals endpoint (BMI, categorization, abnormal flags)
encounterRouter.post('/calculate-vitals', (req, res) =>
  encounterController.calculateVitals(req, res),
);

// Create encounter (Clinical staff & Admins)
encounterRouter.post(
  '/',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => encounterController.createEncounter(req, res),
);

// List encounters (Tenant-scoped; patients restricted to their own records)
encounterRouter.get('/', (req, res) => encounterController.getEncounters(req, res));

// Get single encounter by ID
encounterRouter.get('/:id', (req, res) => encounterController.getEncounterById(req, res));

// Update draft encounter (Strict immutability check in controller)
encounterRouter.put(
  '/:id',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => encounterController.updateEncounter(req, res),
);

// Finalize and sign encounter (Only Doctors and Admins)
encounterRouter.post(
  '/:id/sign',
  requireRole(ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => encounterController.signEncounter(req, res),
);

// Append addendum/amendment to finalized encounter
encounterRouter.post(
  '/:id/addendum',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => encounterController.addAddendum(req, res),
);
