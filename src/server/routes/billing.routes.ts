import { Router } from 'express';
import { BillingController } from '../controllers/billing.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { requireTenant } from '../middleware/tenant.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { ROLES } from '../../shared/constants/roles.js';

const router = Router();
const billingController = new BillingController();

// Cryptographically verified webhook endpoint (Unauthenticated; signature validated in controller)
router.post('/webhook/stripe', billingController.handlePaymentWebhook.bind(billingController));
router.post('/webhook/payment', billingController.handlePaymentWebhook.bind(billingController));

// Invoice listing & single view
router.get(
  '/invoices',
  authenticateToken,
  requireTenant,
  billingController.getInvoices.bind(billingController),
);

router.get(
  '/invoices/:id',
  authenticateToken,
  requireTenant,
  billingController.getInvoiceById.bind(billingController),
);

// Manual invoice creation (Accountant, Hospital Admin, Super Admin)
router.post(
  '/invoices',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.ACCOUNTANT, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  billingController.createInvoice.bind(billingController),
);

// Auto-aggregate clinical encounter into an itemized invoice
router.post(
  '/invoices/generate-from-encounter/:encounterId',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.ACCOUNTANT, ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  billingController.generateFromEncounter.bind(billingController),
);

// Payment recording (Accountants, Receptionists, Hospital Admins, Super Admins)
router.post(
  '/invoices/:id/payments',
  authenticateToken,
  requireTenant,
  requireRole(ROLES.ACCOUNTANT, ROLES.RECEPTIONIST, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN),
  billingController.recordPayment.bind(billingController),
);

// Payment history for an invoice
router.get(
  '/invoices/:id/payments',
  authenticateToken,
  requireTenant,
  billingController.getPaymentTransactions.bind(billingController),
);

export default router;
