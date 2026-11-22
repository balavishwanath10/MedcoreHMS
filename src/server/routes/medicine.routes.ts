import { Router } from 'express';
import { medicineController } from '../controllers/medicine.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

export const medicineRouter = Router();

// All medicine endpoints require authentication and tenant binding
medicineRouter.use(authenticateToken);
medicineRouter.use(requireTenant);

// Search medicine catalogue (accessible to all authenticated hospital staff)
medicineRouter.get('/', (req, res) => medicineController.searchMedicines(req, res));

// Get single medicine by ID
medicineRouter.get('/:id', (req, res) => medicineController.getMedicineById(req, res));

// Create / add medicine to catalogue (Pharmacist, Hospital Admin, Super Admin)
medicineRouter.post(
  '/',
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  (req, res) => medicineController.createMedicine(req, res),
);
