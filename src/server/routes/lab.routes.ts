import { Router } from 'express';
import { labController } from '../controllers/lab.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

export const labRouter = Router();

// All lab routes require valid authentication and hospital tenant binding
labRouter.use(authenticateToken);
labRouter.use(requireTenant);

// Search & list laboratory diagnostic test catalogue
labRouter.get('/tests', (req, res) => labController.getLabTests(req, res));

// Add diagnostic test to catalogue (Lab Technician, Hospital Admin, Super Admin)
labRouter.post(
  '/tests',
  requireRole(ROLES.LAB_TECHNICIAN, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => labController.createLabTest(req, res),
);

// Place new lab order (Physicians & Admins)
labRouter.post(
  '/orders',
  requireRole(ROLES.DOCTOR, ROLES.LAB_TECHNICIAN, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => labController.createLabOrder(req, res),
);

// List lab orders (Technicians & staff see queue; patients see own records)
labRouter.get('/orders', (req, res) => labController.getLabOrders(req, res));

// Get single lab order by ID
labRouter.get('/orders/:id', (req, res) => labController.getLabOrderById(req, res));

// Mark specimen / sample as collected (Lab Technician, Nurse, Hospital Admin, Super Admin)
labRouter.patch(
  '/orders/:id/sample-collected',
  requireRole(ROLES.LAB_TECHNICIAN, ROLES.NURSE, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => labController.markSampleCollected(req, res),
);

// Submit structured parameter results for an order item (Lab Technician, Doctor, Admin)
labRouter.post(
  '/orders/:orderId/results',
  requireRole(ROLES.LAB_TECHNICIAN, ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => labController.submitLabResult(req, res),
);

// Review & Approve / Reject lab results (Doctor, Hospital Admin, Super Admin)
labRouter.post(
  '/results/:id/review',
  requireRole(ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => labController.reviewLabResult(req, res),
);

// List lab results (Staff see tenant; patients see only APPROVED results)
labRouter.get('/results', (req, res) => labController.getLabResults(req, res));

// Get single lab result by ID (Patients restricted to APPROVED)
labRouter.get('/results/:id', (req, res) => labController.getLabResultById(req, res));
