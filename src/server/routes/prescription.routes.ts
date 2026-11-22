import { Router } from 'express';
import { prescriptionController } from '../controllers/prescription.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

export const prescriptionRouter = Router();

// All prescription endpoints require authentication and tenant binding
prescriptionRouter.use(authenticateToken);
prescriptionRouter.use(requireTenant);

// Issue new prescription (Attending Doctor, Hospital Admin, Super Admin)
prescriptionRouter.post(
  '/',
  requireRole(ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => prescriptionController.createPrescription(req, res),
);

// List prescriptions with role-based scoping (Patient sees own; staff sees hospital)
prescriptionRouter.get('/', (req, res) => prescriptionController.getPrescriptions(req, res));

// Get single prescription by ID with tenant isolation & patient privacy
prescriptionRouter.get('/:id', (req, res) => prescriptionController.getPrescriptionById(req, res));

// Amend prescription (Attending Doctor, Hospital Admin, Super Admin)
prescriptionRouter.post(
  '/:id/amend',
  requireRole(ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => prescriptionController.amendPrescription(req, res),
);
