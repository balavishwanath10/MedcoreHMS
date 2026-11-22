import { Request, Response } from 'express';
import { Prescription } from '../models/Prescription.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Encounter } from '../models/Encounter.js';
import { prescriptionCreateSchema, prescriptionAmendSchema } from '../../shared/schemas/index.js';
import { recordAuditEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { ROLES, UserRole } from '../../shared/constants/roles.js';

export class PrescriptionController {
  /**
   * Create and issue a new medical prescription.
   * Scoped to hospital, patient, doctor, and authorized clinical encounter.
   */
  async createPrescription(req: Request, res: Response): Promise<void> {
    try {
      const validated = prescriptionCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required to issue a prescription',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant isolation validation
      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot issue prescriptions in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check role - DOCTOR, HOSPITAL_ADMIN, or SUPER_ADMIN
      const allowedRoles: UserRole[] = [ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN];
      if (!allowedRoles.includes(req.user?.role as UserRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'Only authorized physicians or clinical administrators may issue prescriptions',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Doctor Profile
      const doctor = await DoctorProfile.findOne({
        _id: validated.doctorId,
        hospitalId,
        isDeleted: false,
      });

      if (!doctor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Doctor profile not found in this hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // If user is a DOCTOR, verify they are issuing under their own doctor profile
      if (req.user?.role === ROLES.DOCTOR && doctor.userId.toString() !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_DOCTOR',
            message: 'Physicians may only issue prescriptions under their own authorized profile',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Patient Profile exists in the same tenant
      const patient = await PatientProfile.findOne({
        _id: validated.patientId,
        hospitalId,
        isDeleted: false,
      });

      if (!patient) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: 'Patient profile not found in this hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Encounter exists in the same tenant and matches patient
      const encounter = await Encounter.findOne({
        _id: validated.encounterId,
        hospitalId,
        isDeleted: false,
      });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ENCOUNTER_NOT_FOUND',
            message: 'Clinical encounter not found in this hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (encounter.patientId.toString() !== validated.patientId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'ENCOUNTER_PATIENT_MISMATCH',
            message: 'The linked clinical encounter does not belong to the specified patient',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Create prescription
      const prescription = await Prescription.create({
        ...validated,
        hospitalId,
        status: 'ISSUED',
        issuedAt: new Date(),
        isDeleted: false,
      });

      // Record regulatory audit trail
      await recordAuditEvent({
        hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'PRESCRIPTION_CREATE',
        entityType: 'Prescription',
        entityId: prescription._id.toString(),
        details: {
          patientId: validated.patientId,
          doctorId: validated.doctorId,
          encounterId: validated.encounterId,
          itemCount: validated.items.length,
          medicines: validated.items.map((i) => i.medicineName),
        },
      });

      logger.info('Medical prescription issued successfully', {
        prescriptionId: prescription._id,
        hospitalId,
        patientId: prescription.patientId,
        doctorId: prescription.doctorId,
        itemCount: prescription.items.length,
      });

      res.status(201).json({
        success: true,
        data: prescription,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid prescription data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to issue prescription', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to issue medical prescription',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single prescription by ID with tenant isolation and patient privacy checks.
   */
  async getPrescriptionById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const prescription = await Prescription.findOne({ _id: id, isDeleted: false });

      if (!prescription) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Cross-tenant access validation
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        prescription.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to prescription from another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Patient privacy check - patients can only access their own prescriptions
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (
          !patientProfile ||
          prescription.patientId.toString() !== patientProfile._id.toString()
        ) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Patients may only access their own medical prescriptions',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        success: true,
        data: prescription,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get prescription', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve prescription',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List prescriptions with filters, tenant scoping, and role privacy enforcement.
   */
  async getPrescriptions(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, any> = { isDeleted: false };

      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        if (!req.user?.hospitalId) {
          res.status(403).json({
            success: false,
            error: {
              code: 'CROSS_TENANT_ACCESS_DENIED',
              message: 'Hospital context is required',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        filter.hospitalId = req.user.hospitalId;
      }

      // Patient role can only view their own prescriptions
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile) {
          res.status(200).json({
            success: true,
            data: [],
            timestamp: new Date().toISOString(),
          });
          return;
        }
        filter.patientId = patientProfile._id.toString();
      } else if (req.query.patientId) {
        filter.patientId = req.query.patientId;
      }

      if (req.query.doctorId) {
        filter.doctorId = req.query.doctorId;
      }

      if (req.query.encounterId) {
        filter.encounterId = req.query.encounterId;
      }

      if (req.query.status) {
        filter.status = req.query.status;
      }

      const prescriptions = await Prescription.find(filter).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: prescriptions,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to list prescriptions', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list prescriptions',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Amend an issued prescription with complete audit trail and preserved historical items.
   * Prescriptions cannot be silently altered after issuance.
   */
  async amendPrescription(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const prescription = await Prescription.findOne({ _id: id, isDeleted: false });

      if (!prescription) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Prescription not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Cross-tenant check
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        prescription.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot amend prescription in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check role - only DOCTOR, HOSPITAL_ADMIN, or SUPER_ADMIN may amend
      const allowedRoles: UserRole[] = [ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN];
      if (!allowedRoles.includes(req.user?.role as UserRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only attending physicians or clinical administrators may amend prescriptions',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // If user is DOCTOR, verify ownership
      if (req.user?.role === ROLES.DOCTOR) {
        const doctorProfile = await DoctorProfile.findOne({
          userId: req.user.userId,
          hospitalId: prescription.hospitalId,
          isDeleted: false,
        });

        if (!doctorProfile || doctorProfile._id.toString() !== prescription.doctorId.toString()) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message:
                'Only the prescribing physician or an administrator may amend this prescription',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      if (prescription.status === 'CANCELLED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'PRESCRIPTION_CANCELLED',
            message: 'Cannot amend a cancelled prescription',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = prescriptionAmendSchema.parse(req.body);

      // Preserve historical items in append-only amendment record
      const previousItems = JSON.parse(JSON.stringify(prescription.items));
      const amendmentNumber = (prescription.amendments?.length || 0) + 1;

      const newAmendment = {
        amendmentNumber,
        previousItems,
        revisedItems: validated.items,
        authorId: req.user?.userId || 'unknown',
        authorRole: req.user?.role || 'UNKNOWN',
        authorName: req.user?.email || 'Clinical Staff',
        reason: validated.reason,
        amendedAt: new Date(),
      };

      prescription.amendments = prescription.amendments || [];
      prescription.amendments.push(newAmendment);
      prescription.items = validated.items as any;
      prescription.status = 'AMENDED';

      await prescription.save();

      // Record regulatory audit trail
      await recordAuditEvent({
        hospitalId: prescription.hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'PRESCRIPTION_AMEND',
        entityType: 'Prescription',
        entityId: prescription._id.toString(),
        details: {
          amendmentNumber,
          reason: validated.reason,
          newItemCount: validated.items.length,
        },
        diff: {
          before: previousItems,
          after: validated.items,
        },
      });

      logger.info('Prescription amended successfully with audit trail', {
        prescriptionId: prescription._id,
        amendmentNumber,
        reason: validated.reason,
      });

      res.status(200).json({
        success: true,
        data: prescription,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid amendment data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to amend prescription', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to amend prescription',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const prescriptionController = new PrescriptionController();
