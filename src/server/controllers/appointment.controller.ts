import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Appointment } from '../models/Appointment.js';
import { DoctorProfile } from '../models/DoctorProfile.js';
import { PatientProfile } from '../models/PatientProfile.js';
import { DoctorAvailability } from '../models/DoctorAvailability.js';
import {
  appointmentCreateSchema,
  appointmentStatusUpdateSchema,
} from '../../shared/schemas/index.js';
import { AppointmentStatus } from '../../shared/types/index.js';
import { timeToMinutes } from '../utils/slotGenerator.js';
import { logger } from '../utils/logger.js';
import { reminderScheduler } from '../services/reminderScheduler.service.js';

export async function createAppointment(
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
            message: 'Hospital context is required to book appointments.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (req.body.hospitalId && req.body.hospitalId !== userHospitalId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_ACCESS_DENIED',
            message: 'Access to resources of another hospital is strictly prohibited.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      payload.hospitalId = userHospitalId;
    }

    const validated = appointmentCreateSchema.parse(payload);

    // 1. Validate date is not in the past (allow 5-minute clock skew buffer)
    const nowWithBuffer = new Date(Date.now() - 5 * 60 * 1000);
    if (validated.startTime < nowWithBuffer) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATE',
          message: 'Cannot book appointments in the past.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 2. Validate patient exists in this hospital
    if (!mongoose.Types.ObjectId.isValid(validated.patientId)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PATIENT_ID',
          message: 'Provided patientId is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const patient = await PatientProfile.findOne({
      _id: validated.patientId,
      hospitalId: validated.hospitalId,
      isDeleted: false,
    });

    if (!patient) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PATIENT_NOT_FOUND',
          message: 'Patient profile not found in this hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Patient Role Security: A PATIENT can only book for their own profile
    if (userRole === 'PATIENT' && patient.userId?.toString() !== currentUserId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Patients may only book appointments for their own profile.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 3. Validate doctor exists in this hospital
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

    // Auto-associate department if not explicitly passed
    const departmentId = validated.departmentId || doctor.departmentId.toString();

    // 4. Validate Doctor Availability Schedule (unless emergency)
    const isEmergency = validated.isEmergency || validated.type === 'EMERGENCY';
    if (!isEmergency) {
      const dayOfWeek = validated.startTime.getDay();
      const startHours = String(validated.startTime.getHours()).padStart(2, '0');
      const startMins = String(validated.startTime.getMinutes()).padStart(2, '0');
      const reqStartStr = `${startHours}:${startMins}`;

      const endHours = String(validated.endTime.getHours()).padStart(2, '0');
      const endMins = String(validated.endTime.getMinutes()).padStart(2, '0');
      const reqEndStr = `${endHours}:${endMins}`;

      const reqStartMin = timeToMinutes(reqStartStr);
      const reqEndMin = timeToMinutes(reqEndStr);

      const activeShifts = await DoctorAvailability.find({
        hospitalId: validated.hospitalId,
        doctorId: validated.doctorId,
        dayOfWeek,
        isAvailable: true,
        isDeleted: false,
      });

      const fitsInShift = activeShifts.some((shift) => {
        const shiftStartMin = timeToMinutes(shift.startTime);
        const shiftEndMin = timeToMinutes(shift.endTime);
        return reqStartMin >= shiftStartMin && reqEndMin <= shiftEndMin;
      });

      if (!fitsInShift) {
        res.status(400).json({
          success: false,
          error: {
            code: 'OUTSIDE_DOCTOR_AVAILABILITY',
            message:
              'Selected appointment time is outside the doctor configured weekly working hours.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // 5. Gather all patient profile IDs for comprehensive patient scheduling scope
    const patientProfileIds: any[] = [validated.patientId];
    if (patient.userId && mongoose.connection.readyState === 1) {
      try {
        const siblingProfiles = await PatientProfile.find({
          userId: patient.userId,
          isDeleted: false,
        }).select('_id');
        siblingProfiles.forEach((p) => {
          if (!patientProfileIds.includes(p._id.toString())) {
            patientProfileIds.push(p._id);
          }
        });
      } catch {
        // Fallback to primary patientId
      }
    }

    // 6. Atomic Booking Engine with Mandatory Transaction & Multi-Profile Serialization
    const MAX_RETRIES = 3;
    let attempt = 0;
    let appointment: any = null;

    while (attempt < MAX_RETRIES) {
      attempt++;
      let session: mongoose.ClientSession | null = null;

      try {
        if (typeof mongoose.startSession === 'function') {
          session = await mongoose.startSession();
        }
      } catch (sessionErr: any) {
        logger.error('Failed to initialize database session for booking transaction', {
          error: sessionErr.message,
        });
        res.status(503).json({
          success: false,
          error: {
            code: 'TRANSACTION_UNAVAILABLE',
            message:
              'Database transactions are unavailable. Appointment booking cannot proceed without atomic concurrency protection.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (!session) {
        res.status(503).json({
          success: false,
          error: {
            code: 'TRANSACTION_UNAVAILABLE',
            message:
              'Database transactions are unavailable. Appointment booking cannot proceed without atomic concurrency protection.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      try {
        session.startTransaction();

        // 6.1 Serialize concurrent transactions on Doctor via document write lock
        await DoctorProfile.updateOne(
          { _id: validated.doctorId },
          { $inc: { bookingLockVersion: 1 } },
          { session },
        );

        // 6.2 Serialize concurrent transactions across ALL patient profiles of this user account
        if (patient.userId) {
          await PatientProfile.updateMany(
            { userId: patient.userId },
            { $inc: { bookingLockVersion: 1 } },
            { session },
          );
        } else {
          await PatientProfile.updateOne(
            { _id: validated.patientId },
            { $inc: { bookingLockVersion: 1 } },
            { session },
          );
        }

        // 6.3 Partial Interval Overlap Check for Doctor
        const docConflictQuery = Appointment.findOne({
          hospitalId: validated.hospitalId,
          doctorId: validated.doctorId,
          isDeleted: false,
          isCancelled: false,
          startTime: { $lt: validated.endTime },
          endTime: { $gt: validated.startTime },
        });
        if (typeof (docConflictQuery as any)?.session === 'function') {
          (docConflictQuery as any).session(session);
        }
        const doctorConflict = await docConflictQuery;

        if (doctorConflict) {
          await session.abortTransaction();
          await session.endSession();
          res.status(409).json({
            success: false,
            error: {
              code: 'DOCTOR_DOUBLE_BOOKING',
              message:
                'The requested doctor is already booked for an appointment during this time window.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 6.4 Partial Interval Overlap Check for Patient (across ALL sibling profiles)
        const patConflictQuery = Appointment.findOne({
          patientId: { $in: patientProfileIds },
          isDeleted: false,
          isCancelled: false,
          startTime: { $lt: validated.endTime },
          endTime: { $gt: validated.startTime },
        });
        if (typeof (patConflictQuery as any)?.session === 'function') {
          (patConflictQuery as any).session(session);
        }
        const patientConflict = await patConflictQuery;

        if (patientConflict) {
          await session.abortTransaction();
          await session.endSession();
          res.status(409).json({
            success: false,
            error: {
              code: 'PATIENT_OVERLAPPING_APPOINTMENT',
              message:
                'The patient already has another appointment scheduled during this time window.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 6.5 Initial status aligns with PRD lifecycle: PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
        const initialStatus: AppointmentStatus = isEmergency
          ? 'CONFIRMED'
          : userRole === 'PATIENT'
            ? 'PENDING'
            : 'CONFIRMED';

        const appointmentData = {
          ...validated,
          departmentId,
          status: initialStatus,
          isEmergency,
          isCancelled: false,
          isDeleted: false,
          statusHistory: [
            {
              status: initialStatus,
              changedBy: currentUserId,
              changedAt: new Date(),
              reason: isEmergency
                ? 'Emergency clinical booking'
                : 'Standard scheduled consultation',
            },
          ],
        };

        const createdArr = await Appointment.create([appointmentData], { session });
        if (Array.isArray(createdArr)) {
          appointment = createdArr[0];
        } else if (createdArr && (createdArr as any)[0]) {
          appointment = (createdArr as any)[0];
        } else {
          appointment = createdArr;
        }

        await session.commitTransaction();
        await session.endSession();
        break; // Successfully committed, exit retry loop!
      } catch (txErr: any) {
        if (session) {
          try {
            if (session.inTransaction && session.inTransaction()) {
              await session.abortTransaction();
            }
          } catch {}
          try {
            if (session.endSession) {
              await session.endSession();
            }
          } catch {}
        }

        // Check if duplicate key violation (code 11000)
        if (txErr.code === 11000 || (txErr.name === 'MongoServerError' && txErr.code === 11000)) {
          const isPatientIdx =
            txErr.keyPattern?.patientId ||
            (typeof txErr.message === 'string' && txErr.message.includes('patientId'));
          res.status(409).json({
            success: false,
            error: {
              code: isPatientIdx ? 'PATIENT_OVERLAPPING_APPOINTMENT' : 'DOCTOR_DOUBLE_BOOKING',
              message: isPatientIdx
                ? 'The patient already has another appointment scheduled at this exact time.'
                : 'The requested doctor is already booked for an appointment at this exact time.',
            },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Check for TransientTransactionError or WriteConflict
        const isTransient =
          (typeof txErr.hasErrorLabel === 'function' &&
            txErr.hasErrorLabel('TransientTransactionError')) ||
          (typeof txErr.message === 'string' && txErr.message.includes('WriteConflict')) ||
          txErr.code === 112;

        if (isTransient && attempt < MAX_RETRIES) {
          logger.warn(`Transient transaction conflict on attempt ${attempt}. Retrying booking...`, {
            attempt,
            error: txErr.message,
          });
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
          continue;
        }

        logger.error('Booking transaction failed', { error: txErr.message, attempt });
        res.status(isTransient ? 409 : 500).json({
          success: false,
          error: {
            code: isTransient ? 'CONCURRENT_BOOKING_CONFLICT' : 'INTERNAL_SERVER_ERROR',
            message: isTransient
              ? 'A concurrent booking conflict occurred. Please retry your request.'
              : 'Failed to create appointment due to a database error.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    if (!appointment) {
      res.status(500).json({
        success: false,
        error: {
          code: 'BOOKING_FAILED',
          message: 'Failed to complete appointment booking transaction.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const apptStartTime = appointment?.startTime || validated.startTime;

    logger.info('Appointment created successfully', {
      appointmentId: appointment?._id,
      hospitalId: appointment?.hospitalId || validated.hospitalId,
      doctorId: appointment?.doctorId || validated.doctorId,
      patientId: appointment?.patientId || validated.patientId,
      startTime: apptStartTime,
      isEmergency,
    });

    // Schedule actual 24-hour and 1-hour pre-appointment reminders
    reminderScheduler.scheduleAppointmentReminders({
      appointmentId: (appointment?._id || 'new-appt').toString(),
      appointmentTime: new Date(apptStartTime),
      recipientEmail: patient.email,
      recipientPhone: patient.phone,
    });

    res.status(201).json({
      success: true,
      data: appointment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAppointments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user?.role;
    let targetHospitalId = req.user?.hospitalId;
    const currentUserId = req.user?.userId;

    if (userRole === 'SUPER_ADMIN') {
      targetHospitalId = (req.query.hospitalId as string) || targetHospitalId;
    }

    const filter: Record<string, unknown> = { isDeleted: false };
    if (targetHospitalId) {
      filter.hospitalId = targetHospitalId;
    }

    // Role-based privacy filters
    if (userRole === 'PATIENT') {
      // Patient can only view their own appointments
      const patient = await PatientProfile.findOne({ userId: currentUserId, isDeleted: false });
      if (!patient) {
        res.status(200).json({
          success: true,
          data: [],
          timestamp: new Date().toISOString(),
        });
        return;
      }
      filter.patientId = patient._id;
    } else if (req.query.patientId) {
      filter.patientId = req.query.patientId;
    }

    if (req.query.doctorId) {
      filter.doctorId = req.query.doctorId;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.date) {
      const dateStr = req.query.date as string;
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);
      filter.startTime = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'firstName lastName mrn phone dateOfBirth')
      .populate({
        path: 'doctorId',
        select: 'specialization licenseNumber userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      })
      .populate('departmentId', 'name code')
      .sort({ startTime: -1 });

    res.status(200).json({
      success: true,
      data: appointments,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAppointmentById(
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
          message: 'Provided appointment ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const appointment = await Appointment.findOne({ _id: id, isDeleted: false })
      .populate('patientId')
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      })
      .populate('departmentId');

    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Appointment not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Cross-tenant check
    if (userRole !== 'SUPER_ADMIN' && appointment.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot access appointment belonging to another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Patient ownership check
    if (userRole === 'PATIENT') {
      const patient = await PatientProfile.findOne({ userId: currentUserId });
      if (!patient || appointment.patientId._id.toString() !== patient._id.toString()) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view your own appointments.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: appointment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(
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
          message: 'Provided appointment ID is invalid.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const appointment = await Appointment.findOne({ _id: id, isDeleted: false });
    if (!appointment) {
      res.status(404).json({
        success: false,
        error: {
          code: 'APPOINTMENT_NOT_FOUND',
          message: 'Appointment not found.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Cross-tenant check
    if (userRole !== 'SUPER_ADMIN' && appointment.hospitalId.toString() !== userHospitalId) {
      res.status(403).json({
        success: false,
        error: {
          code: 'CROSS_TENANT_ACCESS_DENIED',
          message: 'Cannot modify appointment in another hospital.',
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { status, reason, cancellationReason } = appointmentStatusUpdateSchema.parse(req.body);

    // Patient restrictions: Patients can only CANCEL their own appointments
    if (userRole === 'PATIENT') {
      const patient = await PatientProfile.findOne({ userId: currentUserId });
      if (!patient || appointment.patientId.toString() !== patient._id.toString()) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only cancel your own appointment.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (status !== 'CANCELLED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Patients may only cancel appointments, not change clinical statuses.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // Role-based clinical transition restrictions
    if (userRole === 'RECEPTIONIST') {
      if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'Receptionists cannot transition clinical consultation statuses (IN_PROGRESS/COMPLETED).',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    if (userRole === 'NURSE') {
      if (status === 'COMPLETED') {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only doctors or administrators may mark clinical encounters completed.',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // State transition rules:
    // PENDING -> CONFIRMED | CANCELLED
    // CONFIRMED -> IN_PROGRESS | CANCELLED | NO_SHOW
    // IN_PROGRESS -> COMPLETED | CANCELLED
    // COMPLETED -> Terminal (no further transitions)
    // CANCELLED -> Terminal
    // NO_SHOW -> Terminal
    const currentStatus = appointment.status;
    const validTransitions: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    };

    if (currentStatus !== status && !validTransitions[currentStatus]?.includes(status)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition appointment from '${currentStatus}' to '${status}'.`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    appointment.status = status;
    if (status === 'CANCELLED') {
      appointment.isCancelled = true;
      reminderScheduler.cancelAppointmentReminders(
        appointment._id.toString(),
        cancellationReason || reason || 'Appointment cancelled',
      );
    }
    if (cancellationReason) {
      appointment.cancellationReason = cancellationReason;
    }
    if (!appointment.statusHistory) {
      appointment.statusHistory = [] as any;
    }
    appointment.statusHistory.push({
      status,
      changedBy: currentUserId,
      changedAt: new Date(),
      reason: reason || cancellationReason,
    } as any);

    await appointment.save();

    logger.info('Appointment status updated', {
      appointmentId: id,
      previousStatus: currentStatus,
      newStatus: status,
      updatedBy: currentUserId,
    });

    res.status(200).json({
      success: true,
      data: appointment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
