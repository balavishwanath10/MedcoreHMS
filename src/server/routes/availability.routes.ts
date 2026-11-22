import { Router } from 'express';
import {
  createAvailability,
  getAvailability,
  getAvailableSlots,
  getAvailabilityById,
  updateAvailability,
  deleteAvailability,
} from '../controllers/availability.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export const availabilityRouter = Router();

availabilityRouter.use(authenticateToken);

// Create availability schedule (Super Admin, Hospital Admin, or Doctor for self)
availabilityRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'),
  createAvailability,
);

// List availability schedules
availabilityRouter.get(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getAvailability,
);

// Generate available time slots for a doctor on a specific date (YYYY-MM-DD)
availabilityRouter.get(
  '/slots',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getAvailableSlots,
);

// Get single availability record
availabilityRouter.get(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getAvailabilityById,
);

// Update availability schedule
availabilityRouter.patch(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'),
  updateAvailability,
);

// Delete availability schedule
availabilityRouter.delete(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'),
  deleteAvailability,
);
