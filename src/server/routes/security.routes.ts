import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireRole, requirePermission } from '../middleware/rbac.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { withTenant, assertTenantAccess } from '../utils/tenantScope.js';

const router = Router();

// ==========================================
// 1. RBAC Role-Based Protected Routes
// ==========================================

router.get(
  '/admin-only',
  authenticateToken,
  requireRole('SUPER_ADMIN', 'HOSPITAL_ADMIN'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Admin access granted' });
  },
);

router.get(
  '/doctor-only',
  authenticateToken,
  requireRole('DOCTOR'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Doctor access granted' });
  },
);

router.get(
  '/clinical',
  authenticateToken,
  requireRole('DOCTOR', 'NURSE'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Clinical team access granted' });
  },
);

router.get(
  '/nurse-only',
  authenticateToken,
  requireRole('NURSE'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Nurse access granted' });
  },
);

router.get(
  '/lab-only',
  authenticateToken,
  requireRole('LAB_TECHNICIAN'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Lab technician access granted' });
  },
);

router.get(
  '/pharmacy-only',
  authenticateToken,
  requireRole('PHARMACIST'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Pharmacist access granted' });
  },
);

router.get(
  '/receptionist-only',
  authenticateToken,
  requireRole('RECEPTIONIST'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Receptionist access granted' });
  },
);

router.get(
  '/accountant-only',
  authenticateToken,
  requireRole('ACCOUNTANT'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Accountant access granted' });
  },
);

router.get(
  '/patient-only',
  authenticateToken,
  requireRole('PATIENT'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Patient portal access granted' });
  },
);

// ==========================================
// 2. Granular Permission Protected Routes
// ==========================================

router.get(
  '/prescriptions-write',
  authenticateToken,
  requirePermission('prescriptions:write'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Prescription write permission verified' });
  },
);

router.get(
  '/prescriptions-dispense',
  authenticateToken,
  requirePermission('prescriptions:dispense'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Prescription dispense permission verified' });
  },
);

router.get(
  '/billing-manage',
  authenticateToken,
  requirePermission('billing:manage'),
  (_req: Request, res: Response) => {
    res.status(200).json({ success: true, message: 'Billing manage permission verified' });
  },
);

// ==========================================
// 3. Multi-Tenant Isolation Routes
// ==========================================

router.get('/tenant-data', authenticateToken, requireTenant, (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      hospitalId: req.hospitalId,
      userRole: req.user?.role,
    },
  });
});

router.get(
  '/hospitals/:hospitalId/records',
  authenticateToken,
  requireTenant,
  (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        accessible: true,
        hospitalId: req.hospitalId,
        targetHospitalId: req.targetHospitalId,
      },
    });
  },
);

router.post('/tenant-records', authenticateToken, requireTenant, (req: Request, res: Response) => {
  res.status(201).json({
    success: true,
    data: {
      created: true,
      hospitalId: req.body.hospitalId,
    },
  });
});

router.get('/query-scope', authenticateToken, requireTenant, (req: Request, res: Response) => {
  const scopedFilter = withTenant(req, { isDeleted: false });
  res.status(200).json({
    success: true,
    data: {
      filter: {
        ...scopedFilter,
        hospitalId: scopedFilter.hospitalId ? scopedFilter.hospitalId.toString() : null,
      },
    },
  });
});

router.post(
  '/assert-access/:resourceHospitalId',
  authenticateToken,
  (req: Request, res: Response, next) => {
    try {
      assertTenantAccess(
        req.user?.hospitalId,
        req.params.resourceHospitalId as string,
        req.user?.role,
      );
      res.status(200).json({
        success: true,
        message: 'Tenant access validated successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as securityRouter };
