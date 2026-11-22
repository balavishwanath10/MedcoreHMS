import { Request, Response } from 'express';
import { Medicine } from '../models/Medicine.js';
import { medicineCreateSchema } from '../../shared/schemas/index.js';
import { logger } from '../utils/logger.js';
import { ROLES } from '../../shared/constants/roles.js';

export const DEFAULT_FORMULARY = [
  {
    name: 'Amoxicillin 500mg',
    genericName: 'Amoxicillin',
    category: 'Antibiotic',
    dosageForm: 'capsule' as const,
    strength: '500mg',
    unitPrice: 15,
  },
  {
    name: 'Paracetamol 650mg',
    genericName: 'Acetaminophen',
    category: 'Analgesic / Antipyretic',
    dosageForm: 'tablet' as const,
    strength: '650mg',
    unitPrice: 5,
  },
  {
    name: 'Cetirizine 10mg',
    genericName: 'Cetirizine Hydrochloride',
    category: 'Antihistamine',
    dosageForm: 'tablet' as const,
    strength: '10mg',
    unitPrice: 8,
  },
  {
    name: 'Metformin 500mg',
    genericName: 'Metformin Hydrochloride',
    category: 'Antidiabetic',
    dosageForm: 'tablet' as const,
    strength: '500mg',
    unitPrice: 12,
  },
  {
    name: 'Salbutamol Syrup 2mg/5ml',
    genericName: 'Albuterol / Salbutamol',
    category: 'Bronchodilator',
    dosageForm: 'syrup' as const,
    strength: '2mg/5ml',
    unitPrice: 45,
  },
  {
    name: 'Ceftriaxone 1g Injection',
    genericName: 'Ceftriaxone Sodium',
    category: 'Antibiotic (Cephalosporin)',
    dosageForm: 'injection' as const,
    strength: '1g',
    unitPrice: 85,
  },
  {
    name: 'Hydrocortisone 1% Cream',
    genericName: 'Hydrocortisone',
    category: 'Corticosteroid Topical',
    dosageForm: 'topical' as const,
    strength: '1%',
    unitPrice: 60,
  },
];

export class MedicineController {
  /**
   * Search hospital medicine catalogue by name, generic name, or category.
   * Auto-seeds standard formulary if catalogue is empty for tenant.
   */
  async searchMedicines(req: Request, res: Response): Promise<void> {
    try {
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN
          ? (req.query.hospitalId as string) || req.user?.hospitalId
          : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required to query formulary',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if formulary exists for this hospital; if empty, seed defaults
      const existingCount = await Medicine.countDocuments({ hospitalId, isDeleted: false });
      if (existingCount === 0) {
        const seedItems = DEFAULT_FORMULARY.map((item) => ({
          ...item,
          hospitalId,
          reorderLevel: 50,
          isActive: true,
          isDeleted: false,
        }));
        await Medicine.insertMany(seedItems);
        logger.info('Auto-seeded default formulary catalogue for hospital', { hospitalId });
      }

      const query: Record<string, any> = {
        hospitalId,
        isActive: true,
        isDeleted: false,
      };

      const searchTerm = req.query.search as string;
      if (searchTerm && searchTerm.trim()) {
        const regex = new RegExp(searchTerm.trim(), 'i');
        query.$or = [{ name: regex }, { genericName: regex }, { category: regex }];
      }

      if (req.query.category) {
        query.category = req.query.category;
      }

      if (req.query.form) {
        query.dosageForm = req.query.form;
      }

      const medicines = await Medicine.find(query).sort({ name: 1 }).limit(50);

      res.status(200).json({
        success: true,
        data: medicines,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to search medicines', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to search medicine catalogue',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Add a new medicine to the hospital catalogue.
   */
  async createMedicine(req: Request, res: Response): Promise<void> {
    try {
      const validated = medicineCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'HOSPITAL_ID_REQUIRED',
            message: 'Hospital context is required to add medicines',
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
            message: 'Cannot create medicine in another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const medicine = await Medicine.create({
        ...validated,
        hospitalId,
        isDeleted: false,
      });

      res.status(201).json({
        success: true,
        data: medicine,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid medicine data provided',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create medicine', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create medicine',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single medicine by ID.
   */
  async getMedicineById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const medicine = await Medicine.findOne({ _id: id, isDeleted: false });

      if (!medicine) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Medicine not found in catalogue',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        medicine.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to medicine from another hospital tenant',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: medicine,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get medicine', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve medicine',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const medicineController = new MedicineController();
