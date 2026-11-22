import mongoose, { Schema, Document, Model } from 'mongoose';
import { IAppointment, AppointmentStatus, AppointmentType } from '../../shared/types/index.js';

export interface AppointmentDocument
  extends
    Omit<
      IAppointment,
      '_id' | 'hospitalId' | 'patientId' | 'doctorId' | 'departmentId' | 'statusHistory'
    >,
    Document {
  hospitalId: mongoose.Types.ObjectId;
  patientId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId | null;
  statusHistory: Array<{
    status: AppointmentStatus;
    changedBy: mongoose.Types.ObjectId | string;
    changedAt: Date;
    reason?: string;
  }>;
}

const statusHistorySchema = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const appointmentSchema = new Schema<AppointmentDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for appointment'],
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientProfile',
      required: [true, 'Patient ID is required for appointment'],
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'DoctorProfile',
      required: [true, 'Doctor ID is required for appointment'],
      index: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    startTime: {
      type: Date,
      required: [true, 'Appointment start time is required'],
      index: true,
    },
    endTime: {
      type: Date,
      required: [true, 'Appointment end time is required'],
    },
    status: {
      type: String,
      enum: {
        values: [
          'PENDING',
          'CONFIRMED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
          'NO_SHOW',
        ] as AppointmentStatus[],
        message: '{VALUE} is not a valid appointment status',
      },
      default: 'CONFIRMED',
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['ROUTINE', 'EMERGENCY', 'FOLLOW_UP', 'TELEMEDICINE'] as AppointmentType[],
        message: '{VALUE} is not a valid appointment type',
      },
      default: 'ROUTINE',
    },
    isEmergency: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Cancellation reason cannot exceed 500 characters'],
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: () => [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Compound Unique Indexes to Prevent Race Conditions & Double-Booking
// 1. Doctor Double-Booking Prevention: A doctor cannot have two active appointments at the exact same startTime
appointmentSchema.index(
  { hospitalId: 1, doctorId: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      status: { $nin: ['CANCELLED'] },
    },
  },
);

// 2. Patient Overlap Prevention: A patient cannot have two active appointments at the exact same startTime across any doctor
appointmentSchema.index(
  { hospitalId: 1, patientId: 1, startTime: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      status: { $nin: ['CANCELLED'] },
    },
  },
);

// 3. Operational query indexes
appointmentSchema.index({ hospitalId: 1, patientId: 1, startTime: -1 });
appointmentSchema.index({ hospitalId: 1, status: 1, startTime: 1 });
appointmentSchema.index({ hospitalId: 1, isDeleted: 1 });

export const Appointment: Model<AppointmentDocument> =
  mongoose.models.Appointment ||
  mongoose.model<AppointmentDocument>('Appointment', appointmentSchema);
