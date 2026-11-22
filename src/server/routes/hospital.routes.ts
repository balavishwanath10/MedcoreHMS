import { Router } from 'express';
import {
  createHospital,
  getHospitals,
  getHospitalById,
  updateHospital,
  updateHospitalStatus,
} from '../controllers/hospital.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export const hospitalRouter = Router();

hospitalRouter.use(authenticateToken);

// Super Admin creates a new hospital tenant
hospitalRouter.post('/', requireRole('SUPER_ADMIN'), createHospital);

// List hospitals (Super Admin sees all, tenant users see their own)
hospitalRouter.get('/', getHospitals);

// Get hospital details by ID (tenant checked)
hospitalRouter.get('/:id', getHospitalById);

// Update hospital profile & settings (Super Admin or Hospital Admin for own hospital)
hospitalRouter.patch('/:id', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), updateHospital);

// Super Admin verifies/changes hospital status (ACTIVE, SUSPENDED, ONBOARDING, INACTIVE)
hospitalRouter.patch('/:id/status', requireRole('SUPER_ADMIN'), updateHospitalStatus);
