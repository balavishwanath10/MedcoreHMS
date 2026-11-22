import { Router } from 'express';
import {
  createDoctorProfile,
  getDoctorProfiles,
  getDoctorProfileById,
  updateDoctorProfile,
  deleteDoctorProfile,
  uploadDoctorSignature,
  uploadMySignature,
} from '../controllers/doctor.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export const doctorRouter = Router();

doctorRouter.use(authenticateToken);

// Doctor signature upload (Doctor self or Admin)
doctorRouter.post('/signature', requireRole('DOCTOR'), uploadMySignature);
doctorRouter.post(
  '/:id/signature',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'),
  uploadDoctorSignature,
);

// Create doctor profile (Super Admin or Hospital Admin)
doctorRouter.post('/', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), createDoctorProfile);

// List doctor profiles (Staff and Patients can browse doctors)
doctorRouter.get(
  '/',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getDoctorProfiles,
);

// Get single doctor profile by ID
doctorRouter.get(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PATIENT'),
  getDoctorProfileById,
);

// Update doctor profile (Super Admin, Hospital Admin, or Doctor self)
doctorRouter.patch(
  '/:id',
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN', 'DOCTOR'),
  updateDoctorProfile,
);

// Delete doctor profile (Super Admin or Hospital Admin)
doctorRouter.delete('/:id', requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'), deleteDoctorProfile);
