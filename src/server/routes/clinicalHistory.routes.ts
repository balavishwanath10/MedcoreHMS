import { Router } from 'express';
import { clinicalHistoryController } from '../controllers/clinicalHistory.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

export const clinicalHistoryRouter = Router();

// All EMR clinical history routes require authentication and tenant context
clinicalHistoryRouter.use(authenticateToken);
clinicalHistoryRouter.use(requireTenant);

// Allergies
clinicalHistoryRouter.post(
  '/allergies',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => clinicalHistoryController.createAllergy(req, res),
);
clinicalHistoryRouter.get('/allergies', (req, res) =>
  clinicalHistoryController.getAllergies(req, res),
);

// Vaccinations
clinicalHistoryRouter.post(
  '/vaccinations',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => clinicalHistoryController.createVaccination(req, res),
);
clinicalHistoryRouter.get('/vaccinations', (req, res) =>
  clinicalHistoryController.getVaccinations(req, res),
);

// Family History
clinicalHistoryRouter.post(
  '/family-history',
  requireRole(ROLES.DOCTOR, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => clinicalHistoryController.createFamilyHistory(req, res),
);
clinicalHistoryRouter.get('/family-history', (req, res) =>
  clinicalHistoryController.getFamilyHistories(req, res),
);

// Longitudinal Patient Timeline & Summary
clinicalHistoryRouter.get('/patients/:patientId/timeline', (req, res) =>
  clinicalHistoryController.getPatientTimeline(req, res),
);
