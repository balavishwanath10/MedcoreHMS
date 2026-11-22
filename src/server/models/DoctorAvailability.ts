import mongoose, { Schema, Document, Model } from 'mongoose';
import { IDoctorAvailability } from '../../shared/types/index.js';

export interface DoctorAvailabilityDocument
  extends Omit<IDoctorAvailability, '_id' | 'hospitalId' | 'doctorId'>, Document {
  hospitalId: mongoose.Types.ObjectId;
  doctorId: mongoose.Types.ObjectId;
}

const doctorAvailabilitySchema = new Schema<DoctorAvailabilityDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for doctor availability'],
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'DoctorProfile',
      required: [true, 'Doctor ID is required for availability schedule'],
      index: true,
    },
    dayOfWeek: {
      type: Number,
      required: [true, 'Day of week is required'],
      min: [0, 'Day of week must be between 0 (Sunday) and 6 (Saturday)'],
      max: [6, 'Day of week must be between 0 (Sunday) and 6 (Saturday)'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required (HH:mm format)'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be in HH:mm format'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required (HH:mm format)'],
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be in HH:mm format'],
    },
    slotDurationMinutes: {
      type: Number,
      required: [true, 'Slot duration is required'],
      min: [10, 'Slot duration cannot be less than 10 minutes'],
      max: [120, 'Slot duration cannot exceed 120 minutes'],
      default: 30,
    },
    isAvailable: {
      type: Boolean,
      default: true,
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

// Indexes
doctorAvailabilitySchema.index({ hospitalId: 1, doctorId: 1, dayOfWeek: 1 });
doctorAvailabilitySchema.index({ hospitalId: 1, isDeleted: 1 });

export const DoctorAvailability: Model<DoctorAvailabilityDocument> =
  mongoose.models.DoctorAvailability ||
  mongoose.model<DoctorAvailabilityDocument>('DoctorAvailability', doctorAvailabilitySchema);
