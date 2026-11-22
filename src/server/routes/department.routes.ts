import { Router } from 'express';
import {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
} from '../controllers/department.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export const departmentRouter = Router();

departmentRouter.use(authenticateToken);

// Create department (Super Admin or Hospital Admin)
departmentRouter.post('/', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), createDepartment);

// List departments (Staff roles can view departments)
departmentRouter.get(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  getDepartments,
);

// Get single department by ID
departmentRouter.get(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST'),
  getDepartmentById,
);

// Update department (Super Admin or Hospital Admin)
departmentRouter.patch('/:id', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), updateDepartment);

// Soft delete department
departmentRouter.delete('/:id', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), deleteDepartment);
