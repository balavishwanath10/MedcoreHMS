import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import {
  doctorAvailabilityCreateSchema,
  doctorAvailabilityUpdateSchema,
} from '../../shared/schemas/index.js';
import { generateSlotsFromSchedule, hasIntervalOverlap } from '../utils/slotGenerator.js';
import { logger } from '../utils/logger.js';

export async function createAvailability(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;
    const currentUserId = req.user?.userId;

    const payload = { ...req.body };
    if (userRole !== 'SUPER_ADMIN') {
      if (!userHospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'TENANT_REQUIRED',
            message: 'Hospital context required.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
      payload.hospitalId = userHospitalId;
    }

    const validated = doctorAvailabilityCreateSchema.parse(payload);

    // Verify doctor exists and belongs to this hospital
    if (!mongoose.Types.ObjectId.isValid(validated.doctorId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCTOR_ID',
          message: 'Provided doctorId is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const doctor = await DoctorProfile.findOne({
      _id: validated.doctorId,
      hospitalId: validated.hospitalId,
      isDeleted: false,
    });

    if (!doctor) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCTOR_NOT_FOUND',
          message: 'Doctor profile not found in this hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Role check: A DOCTOR can only create availability for their own profile
    if (userRole === 'DOCTOR' && doctor.userId.toString() !== currentUserId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Doctors can only manage their own availability schedule.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Overlap prevention on the same day for this doctor
    const existingSchedules = await DoctorAvailability.find({
      hospitalId: validated.hospitalId,
      doctorId: validated.doctorId,
      dayOfWeek: validated.dayOfWeek,
      isDeleted: false,
    });

    const isOverlapping = existingSchedules.some((s) =>
      hasIntervalOverlap(validated.startTime, validated.endTime, s.startTime, s.endTime),
    );

    if (isOverlapping) {
      res.status(409).json({
        success: false,
        error: {
          code: 'AVAILABILITY_OVERLAP',
          message: `Doctor already has an overlapping schedule defined for day ${validated.dayOfWeek}.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const availability = await DoctorAvailability.create({
      ...validated,
      isDeleted: false,
    });

    logger.info('Doctor availability schedule created', {
      availabilityId: availability._id,
      doctorId: availability.doctorId,
      dayOfWeek: availability.dayOfWeek,
      startTime: availability.startTime,
      endTime: availability.endTime,
    });

    res.status(201).json({
      success: true,
      data: availability,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAvailability(
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
    if (req.query.doctorId) {
      filter.doctorId = req.query.doctorId;
    }
    if (req.query.dayOfWeek !== undefined) {
      filter.dayOfWeek = Number(req.query.dayOfWeek);
    }
    if (req.query.isAvailable !== undefined) {
      filter.isAvailable = req.query.isAvailable === 'true';
    }

    const schedules = await DoctorAvailability.find(filter)
      .populate({
        path: 'doctorId',
        select: 'specialization licenseNumber userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      })
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      data: schedules,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAvailableSlots(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userHospitalId = req.user?.hospitalId;
    const doctorId = req.query.doctorId as string;
    const dateStr = req.query.date as string;

    if (!doctorId || !mongoose.Types.ObjectId.isValid(doctorId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DOCTOR_ID',
          message: 'Valid doctorId is required in query parameters.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Valid date in YYYY-MM-DD format is required.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Doctor profile lookup
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

    // Tenant boundary check
    if (userRole !== 'SUPER_ADMIN' && doctor.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Access to doctor from another hospital is prohibited.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Compute day of week from date (0=Sunday ... 6=Saturday)
    // Parse in UTC/Local safely
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    // Query active availability for this doctor on this day
    const schedules = await DoctorAvailability.find({
      hospitalId: doctor.hospitalId,
      doctorId,
      dayOfWeek,
      isAvailable: true,
      isDeleted: false,
    });

    if (schedules.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          doctorId,
          date: dateStr,
          dayOfWeek,
          slots: [],
          message: 'No availability schedule configured for this day.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Generate slots across all valid schedules for that day
    let allSlots: any[] = [];
    for (const schedule of schedules) {
      const generated = generateSlotsFromSchedule(
        schedule.startTime,
        schedule.endTime,
        schedule.slotDurationMinutes,
        [], // Booked appointments will be integrated in Day 9
      );
      allSlots = allSlots.concat(generated);
    }

    res.status(200).json({
      success: true,
      data: {
        doctorId,
        date: dateStr,
        dayOfWeek,
        slots: allSlots,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAvailabilityById(
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
          message: 'Provided availability ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const availability = await DoctorAvailability.findOne({
      _id: id,
      isDeleted: false,
    }).populate('doctorId');

    if (!availability) {
      res.status(404).json({
        success: false,
        error: {
          code: 'AVAILABILITY_NOT_FOUND',
          message: 'Availability schedule not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (userRole !== 'SUPER_ADMIN' && availability.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot access availability from another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: availability,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAvailability(
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
          message: 'Provided availability ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const availability = await DoctorAvailability.findOne({ _id: id, isDeleted: false });
    if (!availability) {
      res.status(404).json({
        success: false,
        error: {
          code: 'AVAILABILITY_NOT_FOUND',
          message: 'Availability schedule not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Tenant check
    if (userRole !== 'SUPER_ADMIN' && availability.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot modify availability of another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Role check: DOCTOR can only modify own availability
    if (userRole === 'DOCTOR') {
      const doctor = await DoctorProfile.findById(availability.doctorId);
      if (!doctor || doctor.userId.toString() !== currentUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only update your own availability schedule.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    const validated = doctorAvailabilityUpdateSchema.parse(req.body);

    const newStartTime = validated.startTime || availability.startTime;
    const newEndTime = validated.endTime || availability.endTime;

    if (newStartTime >= newEndTime) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TIME_RANGE',
          message: 'End time must be later than start time.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check overlap with other schedules on that day
    const otherSchedules = await DoctorAvailability.find({
      _id: { $ne: id },
      hospitalId: availability.hospitalId,
      doctorId: availability.doctorId,
      dayOfWeek: availability.dayOfWeek,
      isDeleted: false,
    });

    const hasConflict = otherSchedules.some((s) =>
      hasIntervalOverlap(newStartTime, newEndTime, s.startTime, s.endTime),
    );

    if (hasConflict) {
      res.status(409).json({
        success: false,
        error: {
          code: 'AVAILABILITY_OVERLAP',
          message: 'Updated times overlap with another schedule on this day.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const updated = await DoctorAvailability.findByIdAndUpdate(
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

export async function deleteAvailability(
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
          message: 'Provided availability ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const availability = await DoctorAvailability.findOne({ _id: id, isDeleted: false });
    if (!availability) {
      res.status(404).json({
        success: false,
        error: {
          code: 'AVAILABILITY_NOT_FOUND',
          message: 'Availability schedule not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Tenant check
    if (userRole !== 'SUPER_ADMIN' && availability.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot delete availability in another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Role check: DOCTOR can only delete own availability
    if (userRole === 'DOCTOR') {
      const doctor = await DoctorProfile.findById(availability.doctorId);
      if (!doctor || doctor.userId.toString() !== currentUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only delete your own availability schedule.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    availability.isDeleted = true;
    await availability.save();

    res.status(200).json({
      success: true,
      data: { message: 'Availability schedule deleted successfully.' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
