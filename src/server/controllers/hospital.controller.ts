import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Hospital } from '../models/Hospital.js';
import {
  hospitalCreateSchema,
  hospitalUpdateSchema,
  hospitalStatusUpdateSchema,
} from '../../shared/schemas/index.js';
import { logger } from '../utils/logger.js';

export async function createHospital(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = hospitalCreateSchema.parse(req.body);

    const slug =
      validated.slug ||
      validated.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    // Check for existing duplicates
    const existingCode = await Hospital.findOne({ code: validated.code });
    if (existingCode) {
      res.status(409).json({
        success: false,
        error: {
          code: 'HOSPITAL_CODE_EXISTS',
          message: `A hospital with code '${validated.code}' already exists.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const existingLicense = await Hospital.findOne({ licenseNumber: validated.licenseNumber });
    if (existingLicense) {
      res.status(409).json({
        success: false,
        error: {
          code: 'LICENSE_EXISTS',
          message: `A hospital with license number '${validated.licenseNumber}' already exists.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hospital = await Hospital.create({
      ...validated,
      slug,
      isDeleted: false,
    });

    logger.info('Hospital created successfully by SuperAdmin', {
      hospitalId: hospital._id,
      code: hospital.code,
      name: hospital.name,
    });

    res.status(201).json({
      success: true,
      data: hospital,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getHospitals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    if (userRole === 'SUPER_ADMIN') {
      const filter: Record<string, unknown> = { isDeleted: false };
      if (req.query.status) {
        filter.status = req.query.status;
      }
      const hospitals = await Hospital.find(filter).sort({ createdAt: -1 });
      res.status(200).json({
        success: true,
        data: hospitals,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Tenant scoped: return the user's hospital
    if (!userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_REQUIRED',
          message: 'Tenant context is missing for authenticated user.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hospital = await Hospital.findOne({ _id: userHospitalId, isDeleted: false });
    if (!hospital) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Tenant hospital not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: [hospital],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getHospitalById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Provided hospital ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Cross-tenant check: non-superadmin can only query their own hospital
    if (userRole !== 'SUPER_ADMIN' && userHospitalId !== id) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Access to another hospital profile is prohibited.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const hospital = await Hospital.findOne({ _id: id, isDeleted: false });
    if (!hospital) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Hospital not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: hospital,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateHospital(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Provided hospital ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && userHospitalId !== id) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'You cannot update another hospital profile.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const validated = hospitalUpdateSchema.parse(req.body);

    const hospital = await Hospital.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: validated },
      { new: true, runValidators: true },
    );

    if (!hospital) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Hospital not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info('Hospital updated successfully', {
      hospitalId: id,
      updatedBy: req.user?.userId,
    });

    res.status(200).json({
      success: true,
      data: hospital,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateHospitalStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Provided hospital ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { status, reason } = hospitalStatusUpdateSchema.parse(req.body);

    const hospital = await Hospital.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: { status } },
      { new: true, runValidators: true },
    );

    if (!hospital) {
      res.status(404).json({
        success: false,
        error: {
          code: 'HOSPITAL_NOT_FOUND',
          message: 'Hospital not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.info('Hospital status updated by SuperAdmin', {
      hospitalId: id,
      newStatus: status,
      reason,
      updatedBy: req.user?.userId,
    });

    res.status(200).json({
      success: true,
      data: hospital,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
