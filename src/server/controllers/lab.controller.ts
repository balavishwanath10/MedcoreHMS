import { Request, Response } from 'express';
import { LabTest } from '../models/LabTest.js';
import { LabOrder } from '../models/LabOrder.js';
import { LabResult } from '../models/LabResult.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { Encounter } from '../models/Encounter.js';
import {
  labTestCreateSchema,
  labOrderCreateSchema,
  sampleCollectedSchema,
  labResultSubmitSchema,
  labResultReviewSchema,
} from '../../shared/schemas/index.js';
import { evaluateLabParameter } from '../utils/labEvaluator.js';
import { recordAuditEvent } from '../utils/auditLogger.js';
import { logger } from '../utils/logger.js';
import { ROLES } from '../../shared/constants/roles.js';

const DEFAULT_STANDARD_TESTS = [
  {
    code: 'CBC',
    name: 'Complete Blood Count (CBC)',
    category: 'Hematology',
    sampleType: 'Blood',
    turnaroundTimeHours: 12,
    price: 30,
    referenceRanges: [
      {
        parameterName: 'Hemoglobin',
        unit: 'g/dL',
        minNormal: 13.5,
        maxNormal: 17.5,
        genderSpecific: 'MALE',
      },
      {
        parameterName: 'Hemoglobin',
        unit: 'g/dL',
        minNormal: 12.0,
        maxNormal: 15.5,
        genderSpecific: 'FEMALE',
      },
      {
        parameterName: 'WBC Count',
        unit: '/mcL',
        minNormal: 4500,
        maxNormal: 11000,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'Platelets',
        unit: '/mcL',
        minNormal: 150000,
        maxNormal: 450000,
        genderSpecific: 'ALL',
      },
    ],
  },
  {
    code: 'LIPID',
    name: 'Lipid Profile Panel',
    category: 'Biochemistry',
    sampleType: 'Serum',
    turnaroundTimeHours: 24,
    price: 45,
    referenceRanges: [
      {
        parameterName: 'Total Cholesterol',
        unit: 'mg/dL',
        minNormal: 100,
        maxNormal: 200,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'Triglycerides',
        unit: 'mg/dL',
        minNormal: 50,
        maxNormal: 150,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'HDL Cholesterol',
        unit: 'mg/dL',
        minNormal: 40,
        maxNormal: 60,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'LDL Cholesterol',
        unit: 'mg/dL',
        minNormal: 0,
        maxNormal: 100,
        genderSpecific: 'ALL',
      },
    ],
  },
  {
    code: 'FBS',
    name: 'Fasting Blood Sugar (Glucose)',
    category: 'Biochemistry',
    sampleType: 'Plasma',
    turnaroundTimeHours: 12,
    price: 15,
    referenceRanges: [
      {
        parameterName: 'Fasting Glucose',
        unit: 'mg/dL',
        minNormal: 70,
        maxNormal: 99,
        genderSpecific: 'ALL',
      },
    ],
  },
  {
    code: 'LFT',
    name: 'Comprehensive Liver Function Test',
    category: 'Biochemistry',
    sampleType: 'Serum',
    turnaroundTimeHours: 24,
    price: 55,
    referenceRanges: [
      {
        parameterName: 'Bilirubin Total',
        unit: 'mg/dL',
        minNormal: 0.2,
        maxNormal: 1.2,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'ALT / SGPT',
        unit: 'U/L',
        minNormal: 7,
        maxNormal: 56,
        genderSpecific: 'ALL',
      },
      {
        parameterName: 'AST / SGOT',
        unit: 'U/L',
        minNormal: 10,
        maxNormal: 40,
        genderSpecific: 'ALL',
      },
    ],
  },
  {
    code: 'URINE-R',
    name: 'Urine Routine & Microscopic Examination',
    category: 'Pathology',
    sampleType: 'Urine',
    turnaroundTimeHours: 8,
    price: 20,
    referenceRanges: [
      { parameterName: 'Urine Protein', unit: '', textRange: 'Negative', genderSpecific: 'ALL' },
      { parameterName: 'Urine Glucose', unit: '', textRange: 'Negative', genderSpecific: 'ALL' },
    ],
  },
];

export class LabController {
  /**
   * Search and list active diagnostic tests in the hospital catalogue.
   * Auto-seeds standard diagnostic tests if hospital catalogue is currently empty.
   */
  async getLabTests(req: Request, res: Response): Promise<void> {
    try {
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN
          ? (req.query.hospitalId as string) || req.user?.hospitalId
          : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: { code: 'HOSPITAL_ID_REQUIRED', message: 'Hospital context is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Auto-seed if empty
      const existingCount = await LabTest.countDocuments({ hospitalId });
      if (existingCount === 0) {
        for (const test of DEFAULT_STANDARD_TESTS) {
          await LabTest.create({ ...test, hospitalId, isActive: true });
        }
      }

      const query = (req.query.query as string) || '';
      const category = (req.query.category as string) || '';

      const filter: Record<string, any> = { hospitalId, isActive: true };
      if (category) filter.category = category;
      if (query.trim()) {
        const regex = new RegExp(query.trim(), 'i');
        filter.$or = [{ name: regex }, { code: regex }, { category: regex }];
      }

      const tests = await LabTest.find(filter).sort({ category: 1, name: 1 });

      res.status(200).json({
        success: true,
        data: tests,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get lab tests', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve lab test catalogue' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Create a new diagnostic test in the hospital catalogue.
   * Restricted to Lab Technicians, Hospital Admins, and Super Admins.
   */
  async createLabTest(req: Request, res: Response): Promise<void> {
    try {
      const validated = labTestCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: { code: 'HOSPITAL_ID_REQUIRED', message: 'Hospital context is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot add test to another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check code uniqueness
      const existing = await LabTest.findOne({ hospitalId, code: validated.code });
      if (existing) {
        res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_TEST_CODE',
            message: `Test code '${validated.code}' already exists in this hospital`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const test = await LabTest.create({ ...validated, hospitalId });

      logger.info('New lab test created in catalogue', {
        hospitalId,
        code: test.code,
        name: test.name,
      });

      res.status(201).json({
        success: true,
        data: test,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid test catalogue data',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create lab test', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create lab test' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Place a new laboratory diagnostic order during clinical care.
   * Enforces doctor role, patient profile matching, and clinical encounter validation.
   */
  async createLabOrder(req: Request, res: Response): Promise<void> {
    try {
      const validated = labOrderCreateSchema.parse(req.body);
      const hospitalId =
        req.user?.role === ROLES.SUPER_ADMIN ? validated.hospitalId : req.user?.hospitalId;

      if (!hospitalId) {
        res.status(400).json({
          success: false,
          error: { code: 'HOSPITAL_ID_REQUIRED', message: 'Hospital context is required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role !== ROLES.SUPER_ADMIN && validated.hospitalId !== hospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot place lab orders in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Doctor
      const doctor = await DoctorProfile.findOne({
        _id: validated.doctorId,
        hospitalId,
        isDeleted: false,
      });

      if (!doctor) {
        res.status(404).json({
          success: false,
          error: { code: 'DOCTOR_NOT_FOUND', message: 'Doctor profile not found in this hospital' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role === ROLES.DOCTOR && doctor.userId.toString() !== req.user.userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_DOCTOR',
            message: 'Physicians may only place orders under their own profile',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Patient
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
            message: 'Patient profile not found in this hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Verify Encounter if provided
      if (validated.encounterId) {
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
              message: 'Clinical encounter not found in this hospital',
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
              message: 'Clinical encounter does not belong to the specified patient',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Verify and resolve ordered tests
      const labTests = await LabTest.find({
        _id: { $in: validated.testIds },
        hospitalId,
        isActive: true,
      });

      if (labTests.length !== validated.testIds.length) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LAB_TESTS',
            message: 'One or more ordered test IDs are invalid or inactive in this hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const orderItems = labTests.map((t) => ({
        testId: t._id.toString(),
        testCode: t.code,
        testName: t.name,
        sampleType: t.sampleType,
        status: 'ORDERED' as const,
      }));

      const randomSuffix = Math.floor(100000 + Math.random() * 900000);
      const orderNumber = `LAB-${new Date().getFullYear()}-${randomSuffix}`;

      const order = await LabOrder.create({
        hospitalId,
        patientId: validated.patientId,
        doctorId: validated.doctorId,
        encounterId: validated.encounterId,
        orderNumber,
        tests: orderItems,
        priority: validated.priority || 'ROUTINE',
        clinicalNotes: validated.clinicalNotes,
        status: 'ORDERED',
        orderedAt: new Date(),
        isDeleted: false,
      });

      await recordAuditEvent({
        hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'LAB_ORDER_CREATE',
        entityType: 'LabOrder',
        entityId: order._id.toString(),
        details: { orderNumber, testCount: orderItems.length, priority: order.priority },
      });

      logger.info('Lab diagnostic order created successfully', {
        orderId: order._id,
        orderNumber,
        patientId: order.patientId,
        testCount: orderItems.length,
      });

      res.status(201).json({
        success: true,
        data: order,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid lab order data',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to create lab order', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to place lab order' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List lab orders with filtering by status, priority, patient, and doctor.
   * Technicians and clinical staff see the hospital queue; patients see only their own orders.
   */
  async getLabOrders(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, any> = { isDeleted: false };

      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        if (!req.user?.hospitalId) {
          res.status(403).json({
            success: false,
            error: { code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Hospital context is required' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        filter.hospitalId = req.user.hospitalId;
      }

      // Patient privacy enforcement
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile) {
          res.status(200).json({ success: true, data: [], timestamp: new Date().toISOString() });
          return;
        }

        filter.patientId = patientProfile._id.toString();
      }

      if (req.query.status) filter.status = req.query.status;
      if (req.query.priority) filter.priority = req.query.priority;
      if (req.query.patientId) filter.patientId = req.query.patientId;
      if (req.query.doctorId) filter.doctorId = req.query.doctorId;

      const orders = await LabOrder.find(filter).sort({ orderedAt: -1 });

      res.status(200).json({
        success: true,
        data: orders,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to list lab orders', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list lab orders' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single lab order by ID with tenant isolation and patient privacy.
   */
  async getLabOrderById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const order = await LabOrder.findOne({ _id: id, isDeleted: false });

      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lab order not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        order.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to lab order in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile || patientProfile._id.toString() !== order.patientId.toString()) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Patients may only access their own lab orders' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        success: true,
        data: order,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get lab order', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve lab order' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Mark specimen/sample as collected by technician or nurse.
   * Transitions status to SAMPLE_COLLECTED.
   */
  async markSampleCollected(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const order = await LabOrder.findOne({ _id: id, isDeleted: false });

      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lab order not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        order.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot manage lab order in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (order.status === 'CANCELLED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'ORDER_CANCELLED',
            message: 'Cannot collect sample for a cancelled order',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      sampleCollectedSchema.parse(req.body || {});

      const collectedAt = new Date();
      const collectedBy = req.user?.userId || 'technician';

      order.status = 'SAMPLE_COLLECTED';
      order.sampleCollectedAt = collectedAt;
      order.sampleCollectedBy = collectedBy;

      order.tests.forEach((t) => {
        if (t.status === 'ORDERED') {
          t.status = 'SAMPLE_COLLECTED';
          t.collectedAt = collectedAt;
          t.collectedBy = collectedBy;
        }
      });

      await order.save();

      await recordAuditEvent({
        hospitalId: order.hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'LAB_SAMPLE_COLLECTED',
        entityType: 'LabOrder',
        entityId: order._id.toString(),
        details: { orderNumber: order.orderNumber, collectedAt },
      });

      logger.info('Lab sample marked collected', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        collectedBy,
      });

      res.status(200).json({
        success: true,
        data: order,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to mark lab sample collected', { error: err.message });
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update sample collection status',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Submit structured diagnostic laboratory results for an order item.
   * Automatically computes abnormal flags based on test reference ranges.
   */
  async submitLabResult(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.orderId as string;
      const order = await LabOrder.findOne({ _id: orderId, isDeleted: false });

      if (!order) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lab order not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        order.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot submit results in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = labResultSubmitSchema.parse(req.body);

      // Verify test exists in order
      const orderTest = order.tests.find((t) => t.testId === validated.testId);
      if (!orderTest) {
        res.status(400).json({
          success: false,
          error: {
            code: 'TEST_NOT_IN_ORDER',
            message: 'The specified test does not exist in this lab order',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Fetch reference ranges from LabTest catalogue to enrich parameters
      const labTest = await LabTest.findOne({
        _id: validated.testId,
        hospitalId: order.hospitalId,
      });

      // Automatically evaluate each parameter result
      const enrichedResults = validated.results.map((param) => {
        let minNormal = param.referenceRangeMin;
        let maxNormal = param.referenceRangeMax;
        let textRange = param.textRange;

        if (labTest?.referenceRanges) {
          const matchRange = labTest.referenceRanges.find(
            (r) => r.parameterName.toLowerCase() === param.parameterName.toLowerCase(),
          );
          if (matchRange) {
            if (minNormal === undefined) minNormal = matchRange.minNormal;
            if (maxNormal === undefined) maxNormal = matchRange.maxNormal;
            if (!textRange) textRange = matchRange.textRange;
          }
        }

        const evaluation = evaluateLabParameter(param.value, minNormal, maxNormal, textRange);

        return {
          ...param,
          referenceRangeMin: minNormal,
          referenceRangeMax: maxNormal,
          textRange,
          isAbnormal: evaluation.isAbnormal,
          abnormalFlag: evaluation.abnormalFlag,
        };
      });

      // Create or update LabResult document in SUBMITTED state
      let labResult = await LabResult.findOne({
        hospitalId: order.hospitalId,
        orderId: order._id.toString(),
        testId: validated.testId,
        isDeleted: false,
      });

      if (labResult && labResult.status === 'APPROVED') {
        res.status(400).json({
          success: false,
          error: {
            code: 'RESULT_ALREADY_APPROVED',
            message: 'Cannot modify an already approved lab result',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (labResult) {
        labResult.results = enrichedResults;
        labResult.technicianNotes = validated.technicianNotes;
        labResult.status = 'SUBMITTED';
        labResult.submittedAt = new Date();
        labResult.technicianId = req.user?.userId || 'technician';
        if (validated.pdfAttachmentUrl) labResult.pdfAttachmentUrl = validated.pdfAttachmentUrl;
        await labResult.save();
      } else {
        labResult = await LabResult.create({
          hospitalId: order.hospitalId,
          orderId: order._id.toString(),
          testId: validated.testId,
          patientId: order.patientId,
          technicianId: req.user?.userId || 'technician',
          results: enrichedResults,
          technicianNotes: validated.technicianNotes,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          pdfAttachmentUrl: validated.pdfAttachmentUrl,
          isDeleted: false,
        });
      }

      // Update order test item status
      orderTest.status = 'IN_PROGRESS';
      if (order.status === 'ORDERED' || order.status === 'SAMPLE_COLLECTED') {
        order.status = 'IN_PROGRESS';
      }
      await order.save();

      await recordAuditEvent({
        hospitalId: order.hospitalId,
        userId: req.user?.userId || 'unknown',
        userRole: req.user?.role || 'UNKNOWN',
        action: 'LAB_RESULT_SUBMIT',
        entityType: 'LabResult',
        entityId: labResult._id.toString(),
        details: {
          orderId: order._id,
          testCode: orderTest.testCode,
          parameterCount: enrichedResults.length,
        },
      });

      logger.info('Lab result submitted for clinical review', {
        resultId: labResult._id,
        orderId: order._id,
        testId: validated.testId,
      });

      res.status(201).json({
        success: true,
        data: labResult,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid result parameters',
            details: err.errors,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to submit lab result', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to submit lab result' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Senior doctor or pathologist review & approval workflow.
   * Approving locks result and marks test as COMPLETED.
   * Rejecting sends test back with mandatory rejection reason.
   */
  async reviewLabResult(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const labResult = await LabResult.findOne({ _id: id, isDeleted: false });

      if (!labResult) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lab result not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        labResult.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Cannot review results in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validated = labResultReviewSchema.parse(req.body);

      const order = await LabOrder.findOne({ _id: labResult.orderId, isDeleted: false });

      if (validated.action === 'APPROVE') {
        labResult.status = 'APPROVED';
        labResult.reviewedBy = req.user?.userId;
        labResult.reviewedAt = new Date();
        labResult.reviewNotes = validated.notes;
        await labResult.save();

        if (order) {
          const orderTest = order.tests.find((t) => t.testId === labResult.testId);
          if (orderTest) {
            orderTest.status = 'COMPLETED';
          }
          // Check if all tests in order are completed
          const allCompleted = order.tests.every((t) => t.status === 'COMPLETED');
          if (allCompleted) {
            order.status = 'COMPLETED';
          }
          await order.save();
        }

        await recordAuditEvent({
          hospitalId: labResult.hospitalId,
          userId: req.user?.userId || 'unknown',
          userRole: req.user?.role || 'UNKNOWN',
          action: 'LAB_RESULT_APPROVE',
          entityType: 'LabResult',
          entityId: labResult._id.toString(),
          details: { orderId: labResult.orderId, testId: labResult.testId },
        });

        logger.info('Lab result approved by clinical reviewer', {
          resultId: labResult._id,
          reviewerId: req.user?.userId,
        });
      } else {
        // REJECT action
        labResult.status = 'REJECTED';
        labResult.reviewedBy = req.user?.userId;
        labResult.reviewedAt = new Date();
        labResult.reviewNotes = validated.reason;
        await labResult.save();

        if (order) {
          const orderTest = order.tests.find((t) => t.testId === labResult.testId);
          if (orderTest) {
            orderTest.status = 'IN_PROGRESS';
          }
          await order.save();
        }

        await recordAuditEvent({
          hospitalId: labResult.hospitalId,
          userId: req.user?.userId || 'unknown',
          userRole: req.user?.role || 'UNKNOWN',
          action: 'LAB_RESULT_REJECT',
          entityType: 'LabResult',
          entityId: labResult._id.toString(),
          details: { reason: validated.reason },
        });

        logger.info('Lab result rejected by clinical reviewer', {
          resultId: labResult._id,
          reason: validated.reason,
        });
      }

      res.status(200).json({
        success: true,
        data: labResult,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: err.errors[0]?.message || 'Invalid review data',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.error('Failed to review lab result', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process review' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * List lab results.
   * Technicians and clinical staff see results in tenant hospital.
   * Patients can ONLY access APPROVED results belonging to themselves.
   */
  async getLabResults(req: Request, res: Response): Promise<void> {
    try {
      const filter: Record<string, any> = { isDeleted: false };

      if (req.user?.role !== ROLES.SUPER_ADMIN) {
        if (!req.user?.hospitalId) {
          res.status(403).json({
            success: false,
            error: { code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Hospital context is required' },
            timestamp: new Date().toISOString(),
          });
          return;
        }
        filter.hospitalId = req.user.hospitalId;
      }

      // Patient privacy & visibility restriction
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile) {
          res.status(200).json({ success: true, data: [], timestamp: new Date().toISOString() });
          return;
        }

        filter.patientId = patientProfile._id.toString();
        // Strictly only APPROVED results are viewable by patients
        filter.status = 'APPROVED';
      }

      if (req.query.orderId) filter.orderId = req.query.orderId;
      if (req.query.testId) filter.testId = req.query.testId;
      if (req.query.status && req.user?.role !== ROLES.PATIENT) filter.status = req.query.status;

      const results = await LabResult.find(filter).sort({ submittedAt: -1 });

      res.status(200).json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to list lab results', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list lab results' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get single lab result by ID.
   * Enforces patient ownership and restricts patients from viewing unapproved results.
   */
  async getLabResultById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const labResult = await LabResult.findOne({ _id: id, isDeleted: false });

      if (!labResult) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lab result not found' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (
        req.user?.role !== ROLES.SUPER_ADMIN &&
        req.user?.hospitalId &&
        labResult.hospitalId !== req.user.hospitalId
      ) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access denied to lab result in another hospital',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Patient privacy & approved status check
      if (req.user?.role === ROLES.PATIENT) {
        const patientProfile = await PatientProfile.findOne({
          userId: req.user.userId,
          isDeleted: false,
        });

        if (!patientProfile || patientProfile._id.toString() !== labResult.patientId.toString()) {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Patients may only access their own lab results',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (labResult.status !== 'APPROVED') {
          res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN_UNAPPROVED',
              message: 'Unapproved laboratory results are not accessible to patients',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      res.status(200).json({
        success: true,
        data: labResult,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      logger.error('Failed to get lab result', { error: err.message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve lab result' },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const labController = new LabController();
