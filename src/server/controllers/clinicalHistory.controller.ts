import { Request, Response } from 'express';
import { Allergy } from '../models/Allergy.js';
import { Vaccination } from '../models/Vaccination.js';
import { FamilyHistory } from '../models/FamilyHistory.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { Encounter } from '../models/Encounter.js';
import {
  allergyCreateSchema,
  vaccinationCreateSchema,
  familyHistoryCreateSchema,
} from '../../shared/schemas/index.js';
import { logger } from '../utils/logger.js';
import { ROLES } from '../../shared/constants/roles.js';

export class ClinicalHistoryController {
  // =========================================================================
  // ALLERGIES
  // =========================================================================

  async createAllergy(req: Request, res: Response): Promise<void> {
    try {
      const validated = allergyCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot add allergy in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

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

      const allergy = await Allergy.create({
        ...validated,
        hospitalId,
        isDeleted: false,
      });

      logger.info('Patient allergy recorded', {
        allergyId: allergy._id,
        patientId: allergy.patientId,
        severity: allergy.severity,
        isLifeThreatening: allergy.severity === 'LIFE_THREATENING',
      });

      res.status(201).json({
        success: true,
        data: allergy,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid allergy data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create allergy', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record allergy',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getAllergies(req: Request, res: Response): Promise<void> {
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

      const allergies = await Allergy.find(filter).sort({ severity: -1, createdAt: -1 });

      res.status(200).json({
        success: true,
        data: allergies,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to fetch allergies', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch allergies',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // =========================================================================
  // VACCINATIONS
  // =========================================================================

  async createVaccination(req: Request, res: Response): Promise<void> {
    try {
      const validated = vaccinationCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot record vaccination in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

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

      const vaccination = await Vaccination.create({
        ...validated,
        hospitalId,
        isDeleted: false,
      });

      logger.info('Patient vaccination recorded', {
        vaccinationId: vaccination._id,
        patientId: vaccination.patientId,
        vaccineName: vaccination.vaccineName,
      });

      res.status(201).json({
        success: true,
        data: vaccination,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid vaccination data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create vaccination', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record vaccination',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getVaccinations(req: Request, res: Response): Promise<void> {
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

      const vaccinations = await Vaccination.find(filter).sort({ administeredDate: -1 });

      res.status(200).json({
        success: true,
        data: vaccinations,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to fetch vaccinations', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch vaccinations',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // =========================================================================
  // FAMILY HISTORY
  // =========================================================================

  async createFamilyHistory(req: Request, res: Response): Promise<void> {
    try {
      const validated = familyHistoryCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot record family history in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

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

      const history = await FamilyHistory.create({
        ...validated,
        hospitalId,
        isDeleted: false,
      });

      logger.info('Family medical history recorded', {
        historyId: history._id,
        patientId: history.patientId,
        relationship: history.relationship,
        condition: history.condition,
      });

      res.status(201).json({
        success: true,
        data: history,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid family history data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create family history', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to record family history',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getFamilyHistories(req: Request, res: Response): Promise<void> {
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

      const histories = await FamilyHistory.find(filter).sort({ createdAt: -1 });

      res.status(200).json({
        success: true,
        data: histories,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to fetch family history', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch family history',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  // =========================================================================
  // LONGITUDINAL PATIENT TIMELINE & EMR SUMMARY
  // =========================================================================

  async getPatientTimeline(req: Request, res: Response): Promise<void> {
    try {
      const patientId = req.params.patientId as string;
      const hospitalId = req.user?.hospitalId;

      const patient = await PatientProfile.findOne({
        _id: patientId,
        isDeleted: false,
      });

      if (!patient) {
        res.status(404).json({
          success: false,
          error: {
            code: 'PATIENT_NOT_FOUND',
            message: 'Patient profile not found',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Tenant isolation
      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        hospitalId &&
        patient.hospitalId.toString() !== hospitalId.toString()
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to patient from another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Patient self-access privacy check
      if (req.user?.role === ROLES.PATIENT) {
        if (patient.userId && patient.userId.toString() !== req.user.userId) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Patients may only view their own longitudinal medical history',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Concurrently aggregate all longitudinal clinical data
      const [allergies, vaccinations, familyHistory, encounters] = await Promise.all([
        Allergy.find({ patientId, isDeleted: false }).sort({ severity: -1, createdAt: -1 }),
        Vaccination.find({ patientId, isDeleted: false }).sort({ administeredDate: -1 }),
        FamilyHistory.find({ patientId, isDeleted: false }).sort({ createdAt: -1 }),
        Encounter.find({ patientId, isDeleted: false }).sort({ createdAt: -1 }),
      ]);

      // Extract active confirmed diagnoses across all encounters
      const activeDiagnosesMap = new Map<string, any>();
      encounters.forEach((enc) => {
        if (enc.diagnoses) {
          enc.diagnoses.forEach((diag: any) => {
            if (diag.type === 'CONFIRMED' && !activeDiagnosesMap.has(diag.code)) {
              activeDiagnosesMap.set(diag.code, {
                code: diag.code,
                description: diag.description,
                diagnosedAt: diag.diagnosedAt,
                diagnosedBy: diag.diagnosedBy,
                notes: diag.notes,
                encounterId: enc._id,
              });
            }
          });
        }
      });

      // Hereditary risk analysis
      const hereditaryRisks = {
        hasDiabetesRisk: familyHistory.some((f) => f.hasDiabetes),
        hasHypertensionRisk: familyHistory.some((f) => f.hasHypertension),
        hasCancerRisk: familyHistory.some((f) => f.hasCancer),
        hasCardiacRisk: familyHistory.some((f) => f.hasCardiacDisease),
      };

      // Life threatening allergy flags
      const lifeThreateningAllergies = allergies.filter((a) => a.severity === 'LIFE_THREATENING');

      res.status(200).json({
        success: true,
        data: {
          patient,
          summary: {
            totalEncounters: encounters.length,
            activeDiagnosesCount: activeDiagnosesMap.size,
            activeAllergiesCount: allergies.length,
            hasLifeThreateningAllergies: lifeThreateningAllergies.length > 0,
            lifeThreateningAllergies,
            hereditaryRisks,
          },
          activeDiagnoses: Array.from(activeDiagnosesMap.values()),
          allergies,
          vaccinations,
          familyHistory,
          encounters,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get patient clinical timeline', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve patient clinical timeline',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const clinicalHistoryController = new ClinicalHistoryController();
