import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import {
  doctorProfileCreateSchema,
  doctorProfileUpdateSchema,
  signatureUploadSchema,
} from '../../shared/schemas/index.js';
import { logger } from '../utils/logger.js';

export async function createDoctorProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    const payload = { ...req.body };
    if (userRole !== 'SUPER_ADMIN') {
      if (!userHospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_REQUIRED',
            message: 'Tenant context required to create doctor profile.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      payload.hospitalId = userHospitalId;
    }

    const validated = doctorProfileCreateSchema.parse(payload);

    // Verify user exists and has DOCTOR role in the same hospital
    if (!mongoose.Types.ObjectId.isValid(validated.userId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: 'Provided userId is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const targetUser = await User.findOne({ _id: validated.userId, isDeleted: false });
    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Referenced user account does not exist.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (targetUser.role !== 'DOCTOR') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ROLE',
          message: 'Referenced user must have the DOCTOR role.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && targetUser.hospitalId?.toString() !== validated.hospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Referenced user does not belong to this hospital tenant.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Verify department exists in the same hospital
    if (!mongoose.Types.ObjectId.isValid(validated.departmentId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DEPARTMENT_ID',
          message: 'Provided departmentId is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const dept = await Department.findOne({
      _id: validated.departmentId,
      hospitalId: validated.hospitalId,
      isDeleted: false,
    });

    if (!dept) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DEPARTMENT_NOT_FOUND',
          message: 'Department not found in this hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check unique doctor profile for this user
    const existingProfile = await DoctorProfile.findOne({
      userId: validated.userId,
      isDeleted: false,
    });

    if (existingProfile) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DOCTOR_PROFILE_EXISTS',
          message: 'A doctor profile already exists for this user account.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check unique license number
    const existingLicense = await DoctorProfile.findOne({
      licenseNumber: validated.licenseNumber,
      isDeleted: false,
    });

    if (existingLicense) {
      res.status(409).json({
        success: false,
        error: {
          code: 'LICENSE_EXISTS',
          message: `Doctor with license number '${validated.licenseNumber}' already exists.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const doctorProfile = await DoctorProfile.create({
      ...validated,
      isDeleted: false,
    });

    logger.info('Doctor profile created successfully', {
      doctorId: doctorProfile._id,
      userId: doctorProfile.userId,
      hospitalId: doctorProfile.hospitalId,
      departmentId: doctorProfile.departmentId,
    });

    res.status(201).json({
      success: true,
      data: doctorProfile,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorProfiles(
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
    if (req.query.departmentId) {
      filter.departmentId = req.query.departmentId;
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const doctors = await DoctorProfile.find(filter)
      .populate('userId', 'firstName lastName email phone')
      .populate('departmentId', 'name code')
      .sort({ specialization: 1 });

    res.status(200).json({
      success: true,
      data: doctors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDoctorProfileById(
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
          message: 'Provided doctor profile ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const doctor = await DoctorProfile.findOne({ _id: id, isDeleted: false })
      .populate('userId', 'firstName lastName email phone')
      .populate('departmentId', 'name code');

    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor profile not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && doctor.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot access doctor profile from another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: doctor,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateDoctorProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;
    const currentUserId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Provided doctor profile ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const doctor = await DoctorProfile.findOne({ _id: id, isDeleted: false });
    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor profile not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Permission check: Super Admin, Hospital Admin of same tenant, or Doctor self
    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    const isHospitalAdminSameTenant =
      userRole === 'HOSPITAL_ADMIN' && doctor.hospitalId.toString() === userHospitalId;
    const isSelfDoctor = userRole === 'DOCTOR' && doctor.userId.toString() === currentUserId;

    if (!isSuperAdmin && !isHospitalAdminSameTenant && !isSelfDoctor) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You are not authorized to update this doctor profile.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const validated = doctorProfileUpdateSchema.parse(req.body);

    if (validated.departmentId) {
      if (!mongoose.Types.ObjectId.isValid(validated.departmentId)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DEPARTMENT_ID',
            message: 'Provided departmentId is invalid.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const dept = await Department.findOne({
        _id: validated.departmentId,
        hospitalId: doctor.hospitalId,
        isDeleted: false,
      });

      if (!dept) {
        res.status(404).json({
          success: false,
          error: {
            code: 'DEPARTMENT_NOT_FOUND',
            message: 'Department not found in this hospital.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    const updated = await DoctorProfile.findByIdAndUpdate(
      id,
      { $set: validated },
      { new: true, runValidators: true },
    )
      .populate('userId', 'firstName lastName email phone')
      .populate('departmentId', 'name code');

    res.status(200).json({
      success: true,
      data: updated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteDoctorProfile(
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
          message: 'Provided doctor profile ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const doctor = await DoctorProfile.findOne({ _id: id, isDeleted: false });
    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor profile not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && doctor.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot delete doctor profile in another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    doctor.isDeleted = true;
    await doctor.save();

    logger.info('Doctor profile soft deleted', { doctorId: id, hospitalId: doctor.hospitalId });

    res.status(200).json({
      success: true,
      data: { message: 'Doctor profile successfully deleted.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Upload digital signature (PNG or SVG) for a doctor profile.
 * Doctors may only upload their own signature; admins can upload for doctors in their hospital.
 */
export async function uploadDoctorSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = req.params.id || req.body.doctorId;
    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCTOR_ID',
          message: 'Valid doctor ID is required to upload signature.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate payload first
    const validated = signatureUploadSchema.parse(req.body);

    // Verify Data URI MIME matches claimed mimeType if prefix exists
    const prefixMatch = validated.signatureData.match(/^data:([^;]+);base64,/);
    if (prefixMatch && prefixMatch[1] !== validated.mimeType) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MIME_TYPE_MISMATCH',
          message: `Signature data URI type (${prefixMatch[1]}) does not match specified mimeType (${validated.mimeType})`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Size limit check (max 500KB = 512,000 bytes)
    const rawData = validated.signatureData.replace(/^data:[^;]+;base64,/, '');
    const byteLength = Buffer.byteLength(rawData, 'base64');
    if (byteLength > 512 * 1024) {
      res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Signature image exceeds maximum allowed size of 500KB.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Deep binary verification & SVG sanitization
    const buffer = Buffer.from(rawData, 'base64');

    if (validated.mimeType === 'image/png') {
      const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngMagic)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_IMAGE_FORMAT',
            message: 'Uploaded file does not match PNG signature magic bytes',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } else if (validated.mimeType === 'image/svg+xml') {
      const svgContent = buffer.toString('utf8');

      if (!/<svg[\s>]/i.test(svgContent) || !/<\/svg>/i.test(svgContent)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SVG_FORMAT',
            message: 'Uploaded file is not a valid SVG document',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const dangerousPatterns = [
        /<script[\s>]/i,
        /javascript\s*:/i,
        /on\w+\s*=/i,
        /<iframe[\s>]/i,
        /<embed[\s>]/i,
        /<object[\s>]/i,
        /xlink:href\s*=\s*['"]?javascript:/i,
        /data:text\/html/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(svgContent)) {
          res.status(400).json({
            success: false,
            error: {
              code: 'MALICIOUS_SVG_PAYLOAD',
              message: 'SVG payload contains prohibited active scripts or executable vectors',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }
      }
    }

    const doctor = await DoctorProfile.findOne({ _id: doctorId, isDeleted: false });
    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor profile not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;

    // Cross-tenant check
    if (userRole !== 'SUPER_ADMIN' && doctor.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot manage signature for doctor in another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Role ownership check: DOCTOR can only upload for themselves
    if (userRole === 'DOCTOR' && doctor.userId.toString() !== req.user?.userId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Physicians may only upload their own digital signature.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    doctor.signatureData = validated.signatureData;
    doctor.signatureMimeType = validated.mimeType;
    doctor.signatureUploadedAt = new Date();
    await doctor.save();

    logger.info('Doctor digital signature uploaded successfully', {
      doctorId: doctor._id,
      userId: req.user?.userId,
      mimeType: validated.mimeType,
      sizeBytes: byteLength,
    });

    res.status(200).json({
      success: true,
      data: {
        doctorId: doctor._id,
        signatureUploadedAt: doctor.signatureUploadedAt,
        mimeType: doctor.signatureMimeType,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Convenience endpoint for logged-in doctor to upload their signature directly.
 */
export async function uploadMySignature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctor = await DoctorProfile.findOne({ userId: req.user?.userId, isDeleted: false });
    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'No doctor profile found for current user.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    req.params.id = doctor._id.toString();
    return uploadDoctorSignature(req, res, next);
  } catch (error) {
    next(error);
  }
}
