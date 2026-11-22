import { Router } from 'express';
import {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
} from '../controllers/appointment.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';

export const appointmentRouter = Router();

appointmentRouter.use(authenticateToken);
appointmentRouter.use(requireTenant);

// Create / book appointment
appointmentRouter.post(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT'),
  createAppointment,
);

// List appointments (role & tenant filtered)
appointmentRouter.get(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getAppointments,
);

// Get single appointment details
appointmentRouter.get(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getAppointmentById,
);

// Update appointment status (confirm, in_progress, complete, cancel, no_show)
appointmentRouter.patch(
  '/:id/status',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  updateAppointmentStatus,
);
