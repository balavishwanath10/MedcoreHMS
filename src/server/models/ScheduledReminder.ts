import mongoose, { Schema, Document, Model } from 'mongoose';

export type ReminderType = '24_HOUR' | '1_HOUR';
export type ReminderStatus = 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'FAILED' | 'CANCELLED';

export interface IScheduledReminder {
  _id?: string;
  hospitalId: mongoose.Types.ObjectId | string;
  appointmentId: mongoose.Types.ObjectId | string;
  patientId?: mongoose.Types.ObjectId | string;
  doctorId?: mongoose.Types.ObjectId | string;
  reminderType: ReminderType;
  recipientEmail?: string;
  recipientPhone?: string;
  appointmentTime: Date;
  scheduledFor: Date;
  status: ReminderStatus;
  attempts: number;
  lastError?: string;
  dispatchedAt?: Date;
  deliveryResult?: {
    emailDelivered?: boolean;
    smsDelivered?: boolean;
    emailProvider?: string;
    smsProvider?: string;
    reason?: string;
  };
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ScheduledReminderDocument extends Omit<IScheduledReminder, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const scheduledReminderSchema = new Schema<ScheduledReminderDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for scheduled reminder'],
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: [true, 'Appointment ID is required for scheduled reminder'],
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'PatientProfile',
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'DoctorProfile',
      index: true,
    },
    reminderType: {
      type: String,
      enum: ['24_HOUR', '1_HOUR'],
      required: true,
    },
    recipientEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    recipientPhone: {
      type: String,
      trim: true,
    },
    appointmentTime: {
      type: Date,
      required: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'DISPATCHED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      trim: true,
    },
    dispatchedAt: {
      type: Date,
      default: null,
    },
    deliveryResult: {
      type: Schema.Types.Mixed,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Compound Unique Index: Prevent duplicate scheduled reminders for same appointment & interval
scheduledReminderSchema.index(
  { hospitalId: 1, appointmentId: 1, reminderType: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      status: { $in: ['PENDING', 'PROCESSING', 'DISPATCHED'] },
    },
  },
);

// Query Index for Polling & Server Recovery
scheduledReminderSchema.index({ status: 1, scheduledFor: 1, isDeleted: 1 });

export const ScheduledReminder: Model<ScheduledReminderDocument> =
  mongoose.models.ScheduledReminder ||
  mongoose.model<ScheduledReminderDocument>('ScheduledReminder', scheduledReminderSchema);
