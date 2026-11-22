import { Request, Response } from 'express';
import { Encounter } from '../models/Encounter.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Appointment } from '../models/Appointment.js';
import {
  encounterCreateSchema,
  encounterUpdateSchema,
  encounterAddendumSchema,
  encounterSignSchema,
  vitalsSchema,
} from '../../shared/schemas/index.js';
import { enrichVitals } from '../utils/vitalsCalculator.js';
import { logger } from '../utils/logger.js';
import { ROLES, UserRole } from '../../shared/constants/roles.js';
import { IClinicalRevision } from '../../shared/types/index.js';

export class EncounterController {
  /**
   * Preview vitals calculation (BMI, Category, Abnormal Flags)
   */
  async calculateVitals(req: Request, res: Response): Promise<void> {
    try {
      const validated = vitalsSchema.parse(req.body);
      const enriched = enrichVitals(validated);

      res.status(200).json({
        success: true,
        data: enriched,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid vitals data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to calculate vitals',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Create a new clinical encounter
   */
  async createEncounter(req: Request, res: Response): Promise<void> {
    try {
      const validated = encounterCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required to create an encounter',
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
            message: 'Cannot create encounters in another hospital tenant',
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

      // Verify Doctor Profile exists in the same tenant
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

      // If appointment linked, verify tenant
      if (validated.appointmentId) {
        const appointment = await Appointment.findOne({
          _id: validated.appointmentId,
          hospitalId,
          isDeleted: false,
        });

        if (!appointment) {
          res.status(404).json({
            success: false,
            error: {
              code: 'APPOINTMENT_NOT_FOUND',
              message: 'Linked appointment not found in this hospital tenant',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Calculate BMI and abnormal flags if vitals present
      let enrichedVitals = undefined;
      if (validated.vitals) {
        enrichedVitals = enrichVitals(validated.vitals);
      }

      const encounter = await Encounter.create({
        ...validated,
        hospitalId,
        vitals: enrichedVitals,
        status: 'OPEN',
        isDeleted: false,
      });

      logger.info('Clinical encounter created successfully', {
        encounterId: encounter._id,
        hospitalId,
        patientId: encounter.patientId,
        doctorId: encounter.doctorId,
        hasAbnormalVitals: Boolean(enrichedVitals?.abnormalFlags?.length),
      });

      res.status(201).json({
        success: true,
        data: encounter,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid encounter data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create encounter', { error: err.message, stack: err.stack });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create clinical encounter',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List encounters with tenant scoping and patient access control
   */
  async getEncounters(req: Request, res: Response): Promise<void> {
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

      // Patient role can only view their own encounters
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

      if (req.query.appointmentId) {
        filter.appointmentId = req.query.appointmentId;
      }

      if (req.query.status) {
        filter.status = req.query.status;
      }

      const encounters = await Encounter.find(filter).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: encounters,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to fetch encounters', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch encounters',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single encounter by ID
   */
  async getEncounterById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const encounter = await Encounter.findOne({ _id: id, isDeleted: false });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant check
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        encounter.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to encounter from another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Patient privacy check
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile || encounter.patientId !== patientProfile._id.toString()) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Patients may only access their own medical encounters',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        success: true,
        data: encounter,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get encounter', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve encounter',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Update draft encounter (IMMUTABILITY ENFORCEMENT)
   */
  async updateEncounter(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const encounter = await Encounter.findOne({ _id: id, isDeleted: false });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant check
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        encounter.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot update encounter in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // EMR IMMUTABILITY CHECK
      // If the record is SIGNED or AMENDED, direct overwriting is strictly prohibited by law and PRD
      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'ENCOUNTER_IMMUTABLE',
            message:
              'Finalized encounters are immutable and cannot be edited directly. Please append an amendment or addendum.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = encounterUpdateSchema.parse(req.body);

      // EMR APPEND-ONLY IMMUTABILITY:
      // Capture historical snapshot before updating, ensuring no clinical entries are silently overwritten
      const changedFields: string[] = [];
      const previousSnapshot: Record<string, any> = {};

      if (
        validated.chiefComplaint !== undefined &&
        validated.chiefComplaint !== encounter.chiefComplaint
      ) {
        changedFields.push('chiefComplaint');
        previousSnapshot.chiefComplaint = encounter.chiefComplaint;
        encounter.chiefComplaint = validated.chiefComplaint;
      }
      if (validated.vitals !== undefined) {
        changedFields.push('vitals');
        previousSnapshot.vitals = encounter.vitals
          ? JSON.parse(JSON.stringify(encounter.vitals))
          : undefined;
        encounter.vitals = enrichVitals(validated.vitals);
      }
      if (validated.symptoms !== undefined) {
        changedFields.push('symptoms');
        previousSnapshot.symptoms = encounter.symptoms
          ? JSON.parse(JSON.stringify(encounter.symptoms))
          : [];
        encounter.symptoms = validated.symptoms as any;
      }
      if (
        validated.historyOfPresentIllness !== undefined &&
        validated.historyOfPresentIllness !== encounter.historyOfPresentIllness
      ) {
        changedFields.push('historyOfPresentIllness');
        previousSnapshot.historyOfPresentIllness = encounter.historyOfPresentIllness;
        encounter.historyOfPresentIllness = validated.historyOfPresentIllness;
      }
      if (
        validated.clinicalNotes !== undefined &&
        validated.clinicalNotes !== encounter.clinicalNotes
      ) {
        changedFields.push('clinicalNotes');
        previousSnapshot.clinicalNotes = encounter.clinicalNotes;
        encounter.clinicalNotes = validated.clinicalNotes;
      }
      if (validated.assessment !== undefined && validated.assessment !== encounter.assessment) {
        changedFields.push('assessment');
        previousSnapshot.assessment = encounter.assessment;
        encounter.assessment = validated.assessment;
      }
      if (validated.diagnoses !== undefined) {
        changedFields.push('diagnoses');
        previousSnapshot.diagnoses = encounter.diagnoses
          ? JSON.parse(JSON.stringify(encounter.diagnoses))
          : [];
        encounter.diagnoses = validated.diagnoses as any;
      }
      if (validated.treatmentPlan !== undefined) {
        changedFields.push('treatmentPlan');
        previousSnapshot.treatmentPlan = encounter.treatmentPlan
          ? JSON.parse(JSON.stringify(encounter.treatmentPlan))
          : undefined;
        encounter.treatmentPlan = validated.treatmentPlan as any;
      }

      if (changedFields.length > 0) {
        if (!encounter.revisions) {
          encounter.revisions = [];
        }
        const revisionCount = encounter.revisions.length + 1;
        const revision: IClinicalRevision = {
          revisionNumber: revisionCount,
          authorId: req.user?.userId || 'SYSTEM',
          authorRole: req.user?.role || 'UNKNOWN',
          authorName: req.user?.email || 'Clinical Staff',
          reasonForChange: validated.reasonForChange || 'Clinical documentation update',
          previousSnapshot,
          changedFields,
          createdAt: new Date(),
        };
        encounter.revisions.push(revision);
      }

      await encounter.save();

      logger.info('Draft encounter updated successfully', {
        encounterId: encounter._id,
        hospitalId: encounter.hospitalId,
      });

      res.status(200).json({
        success: true,
        data: encounter,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to update encounter', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update encounter',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Finalize and sign encounter (Strict doctor / supervisor role check)
   */
  async signEncounter(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const encounter = await Encounter.findOne({ _id: id, isDeleted: false });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant check
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        encounter.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot sign encounter in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check role - only DOCTOR, HOSPITAL_ADMIN, SUPER_ADMIN can sign medical encounters
      const allowedRoles: UserRole[] = [ROLES.DOCTOR, ROLES.HOSPITAL_ADMIN, ROLES.SUPER_ADMIN];
      if (!allowedRoles.includes(req.user?.role as UserRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'Only attending physicians or authorized administrators may sign clinical encounters',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (encounter.status === 'SIGNED' || encounter.status === 'AMENDED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'ENCOUNTER_ALREADY_SIGNED',
            message: 'This clinical encounter is already finalized and signed',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      encounterSignSchema.parse(req.body);

      encounter.status = 'SIGNED';
      encounter.signedAt = new Date();
      encounter.signedBy = req.user?.userId || 'unknown';

      await encounter.save();

      // If linked to an appointment, complete consultation if still open
      if (encounter.appointmentId) {
        try {
          const appointment = await Appointment.findOne({
            _id: encounter.appointmentId,
            hospitalId: encounter.hospitalId,
            isDeleted: false,
          });

          if (appointment && ['IN_PROGRESS', 'CONFIRMED'].includes(appointment.status)) {
            appointment.status = 'COMPLETED';
            appointment.statusHistory = appointment.statusHistory || [];
            appointment.statusHistory.push({
              status: 'COMPLETED',
              changedBy: req.user?.userId || 'system',
              changedAt: new Date(),
              reason: 'Clinical encounter finalized and signed',
            });
            await appointment.save();
          }
        } catch (appErr: any) {
          logger.warn('Failed to auto-complete appointment on encounter sign', {
            appointmentId: encounter.appointmentId,
            error: appErr.message,
          });
        }
      }

      logger.info('Clinical encounter finalized and signed successfully', {
        encounterId: encounter._id,
        signedBy: encounter.signedBy,
        signedAt: encounter.signedAt,
      });

      res.status(200).json({
        success: true,
        data: encounter,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Explicit signature confirmation is required',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to sign encounter', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to sign encounter',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Append an addendum/amendment to a finalized encounter
   */
  async addAddendum(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const encounter = await Encounter.findOne({ _id: id, isDeleted: false });

      if (!encounter) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Encounter not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant check
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        encounter.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot amend encounter in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Role check - clinical staff or admins can add addenda
      const allowedRoles: UserRole[] = [
        ROLES.DOCTOR,
        ROLES.NURSE,
        ROLES.HOSPITAL_ADMIN,
        ROLES.SUPER_ADMIN,
      ];
      if (!allowedRoles.includes(req.user?.role as UserRole)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only clinical or administrative staff may amend medical encounters',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Only signed or already-amended encounters can have addenda appended
      if (encounter.status === 'OPEN') {
        res.status(400).json({
          success: false,
          error: {
            code: 'ENCOUNTER_NOT_SIGNED',
            message: 'Cannot add an addendum to an open draft encounter. Edit the draft directly.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = encounterAddendumSchema.parse(req.body);

      const newAddendum = {
        authorId: req.user?.userId || 'unknown',
        authorRole: req.user?.role || 'UNKNOWN',
        authorName: req.user?.email || 'Clinical Staff',
        amendmentReason: validated.amendmentReason,
        notes: validated.notes,
        createdAt: new Date(),
      };

      encounter.addenda = encounter.addenda || [];
      encounter.addenda.push(newAddendum);
      encounter.status = 'AMENDED';

      await encounter.save();

      logger.info('Addendum appended to signed encounter', {
        encounterId: encounter._id,
        authorId: newAddendum.authorId,
        amendmentReason: newAddendum.amendmentReason,
      });

      res.status(200).json({
        success: true,
        data: encounter,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid addendum data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to add addendum', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to append addendum to encounter',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const encounterController = new EncounterController();
