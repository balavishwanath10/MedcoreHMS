import mongoose, { Schema, Document, Model } from 'mongoose';
import { IDoctorProfile } from '../../shared/types/index.js';

export interface DoctorProfileDocument
  extends Omit<IDoctorProfile, '_id' | 'hospitalId' | 'userId' | 'departmentId'>, Document {
  hospitalId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  departmentId: mongoose.Types.ObjectId;
}

const doctorProfileSchema = new Schema<DoctorProfileDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for doctor profile'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required for doctor profile'],
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department ID is required for doctor profile'],
    },
    licenseNumber: {
      type: String,
      required: [true, 'Medical license number is required'],
      trim: true,
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
    },
    qualifications: {
      type: [String],
      required: [true, 'At least one medical qualification is required'],
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'Doctor must have at least one qualification',
      },
    },
    experienceYears: {
      type: Number,
      required: [true, 'Experience years is required'],
      min: [0, 'Experience years cannot be negative'],
      default: 0,
    },
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: [0, 'Consultation fee cannot be negative'],
      default: 0,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, 'Bio cannot exceed 1000 characters'],
    },
    signatureData: {
      type: String,
      required: false,
    },
    signatureMimeType: {
      type: String,
      enum: ['image/png', 'image/svg+xml'],
      required: false,
    },
    signatureUploadedAt: {
      type: Date,
      required: false,
    },
    bookingLockVersion: {
      type: Number,
      default: 0,
    },
    isActive: {
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
doctorProfileSchema.index({ userId: 1 }, { unique: true });
doctorProfileSchema.index({ licenseNumber: 1 }, { unique: true });
doctorProfileSchema.index({ hospitalId: 1, departmentId: 1 });
doctorProfileSchema.index({ hospitalId: 1, isActive: 1 });
doctorProfileSchema.index({ hospitalId: 1, isDeleted: 1 });

export const DoctorProfile: Model<DoctorProfileDocument> =
  mongoose.models.DoctorProfile ||
  mongoose.model<DoctorProfileDocument>('DoctorProfile', doctorProfileSchema);
