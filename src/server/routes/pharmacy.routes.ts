import { Router } from 'express';
import { PharmacyController } from '../controllers/pharmacy.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

const router = Router();
const pharmacyController = new PharmacyController();

// Query inventory batches and 30-day expiring stock (Accessible by hospital clinical & pharmacy staff)
router.get(
  '/batches',
  authenticateToken,
  requireTenant,
  pharmacyController.getBatches.bind(pharmacyController),
);

router.get(
  '/batches/expiring',
  authenticateToken,
  requireTenant,
  pharmacyController.getExpiringBatches.bind(pharmacyController),
);

router.get(
  '/batches/:id',
  authenticateToken,
  requireTenant,
  pharmacyController.getBatchById.bind(pharmacyController),
);

// Inventory batch reception & management (Restricted to Pharmacist, Hospital Admin, Super Admin)
router.post(
  '/batches',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  pharmacyController.addBatch.bind(pharmacyController),
);

router.patch(
  '/batches/:id',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  pharmacyController.updateBatch.bind(pharmacyController),
);

router.patch(
  '/batches/:id/quarantine',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  pharmacyController.quarantineBatch.bind(pharmacyController),
);

router.post(
  '/batches/scan-expired',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  pharmacyController.quarantineExpiredBatches.bind(pharmacyController),
);

// FIFO Prescription Dispensing (Restricted to Pharmacist, Hospital Admin, Super Admin)
router.post(
  '/dispense/:prescriptionId',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.PHARMACIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  pharmacyController.dispensePrescription.bind(pharmacyController),
);

export default router;
