import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Department } from '../models/Department.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { departmentCreateSchema, departmentUpdateSchema } from '../../shared/schemas/index.js';
import { logger } from '../utils/logger.js';

export async function createDepartment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    // Enforce tenant boundary: non-SuperAdmin can only create in their own hospital
    const payload = { ...req.body };
    if (userRole !== 'SUPER_ADMIN') {
      if (!userHospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_REQUIRED',
            message: 'Hospital context is required to create a department.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      payload.hospitalId = userHospitalId;
    }

    const validated = departmentCreateSchema.parse(payload);

    // If headDoctorId is provided, verify doctor exists in same hospital
    if (validated.headDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(validated.headDoctorId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DOCTOR_ID',
            message: 'Provided headDoctorId is invalid.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const doctor = await DoctorProfile.findOne({
        _id: validated.headDoctorId,
        hospitalId: validated.hospitalId,
        isDeleted: false,
      });

      if (!doctor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Head doctor profile not found in this hospital.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // Check unique code per hospital
    const existing = await Department.findOne({
      hospitalId: validated.hospitalId,
      code: validated.code,
      isDeleted: false,
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DEPARTMENT_CODE_EXISTS',
          message: `Department with code '${validated.code}' already exists in this hospital.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const department = await Department.create({
      ...validated,
      isDeleted: false,
    });

    logger.info('Department created successfully', {
      departmentId: department._id,
      code: department.code,
      hospitalId: department.hospitalId,
    });

    res.status(201).json({
      success: true,
      data: department,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDepartments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    let targetHospitalId = req.user?.hospitalId;

    if (userRole === 'SUPER_ADMIN') {
      targetHospitalId = (req.query.hospitalId as string) || targetHospitalId;
    }

    const filter: Record<string, unknown> = { isDeleted: false };
    if (targetHospitalId) {
      filter.hospitalId = targetHospitalId;
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const departments = await Department.find(filter)
      .populate('headDoctorId', 'specialization licenseNumber')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: departments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDepartmentById(
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
          message: 'Provided department ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const department = await Department.findOne({ _id: id, isDeleted: false }).populate(
      'headDoctorId',
    );
    if (!department) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DEPARTMENT_NOT_FOUND',
          message: 'Department not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && department.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Access to department in another hospital is prohibited.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: department,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateDepartment(
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
          message: 'Provided department ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const department = await Department.findOne({ _id: id, isDeleted: false });
    if (!department) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DEPARTMENT_NOT_FOUND',
          message: 'Department not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && department.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot update department belonging to another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const validated = departmentUpdateSchema.parse(req.body);

    if (validated.headDoctorId) {
      if (!mongoose.Types.ObjectId.isValid(validated.headDoctorId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DOCTOR_ID',
            message: 'Provided headDoctorId is invalid.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const doctor = await DoctorProfile.findOne({
        _id: validated.headDoctorId,
        hospitalId: department.hospitalId,
        isDeleted: false,
      });

      if (!doctor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Head doctor profile not found in this hospital.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    const updated = await Department.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteDepartment(
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
          message: 'Provided department ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const department = await Department.findOne({ _id: id, isDeleted: false });
    if (!department) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DEPARTMENT_NOT_FOUND',
          message: 'Department not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && department.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot delete department in another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Soft delete
    department.isDeleted = true;
    await department.save();

    logger.info('Department soft deleted', { departmentId: id, hospitalId: department.hospitalId });

    res.status(200).json({
      success: true,
      data: { message: 'Department successfully deleted.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
