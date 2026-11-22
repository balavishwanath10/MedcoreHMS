import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { authRouter } from './auth.routes.js';
import { securityRouter } from './security.routes.js';
import { hospitalRouter } from './hospital.routes.js';
import { departmentRouter } from './department.routes.js';
import { doctorRouter } from './doctor.routes.js';
import { availabilityRouter } from './availability.routes.js';
import { appointmentRouter } from './appointment.routes.js';

export const apiRouter = Router();

// Mount foundational routes
apiRouter.use(healthRouter);

// Mount authentication routes under /api/auth and /api/v1/auth
apiRouter.use('/auth', authRouter);
apiRouter.use('/v1/auth', authRouter);

// Mount RBAC & Tenant security routes under /api/security and /api/v1/security
apiRouter.use('/security', securityRouter);
apiRouter.use('/v1/security', securityRouter);

// Mount Hospital Management routes under /api/hospitals and /api/v1/hospitals
apiRouter.use('/hospitals', hospitalRouter);
apiRouter.use('/v1/hospitals', hospitalRouter);

// Mount Department routes under /api/departments and /api/v1/departments
apiRouter.use('/departments', departmentRouter);
apiRouter.use('/v1/departments', departmentRouter);

// Mount Doctor routes under /api/doctors and /api/v1/doctors
apiRouter.use('/doctors', doctorRouter);
apiRouter.use('/v1/doctors', doctorRouter);

// Mount Doctor Availability routes under /api/availability and /api/v1/availability
apiRouter.use('/availability', availabilityRouter);
apiRouter.use('/v1/availability', availabilityRouter);

// Mount Appointment routes under /api/appointments and /api/v1/appointments
apiRouter.use('/appointments', appointmentRouter);
apiRouter.use('/v1/appointments', appointmentRouter);

// Base route for /api
apiRouter.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'MedCoreHMS API',
      version: '0.1.0',
      description: 'Multi-Tenant Hospital Management System API',
      status: 'operational',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        security: '/api/security',
        hospitals: '/api/hospitals',
        departments: '/api/departments',
        doctors: '/api/doctors',
        availability: '/api/availability',
        appointments: '/api/appointments',
      },
    },
    timestamp: new Date().toISOString(),
  });
});
