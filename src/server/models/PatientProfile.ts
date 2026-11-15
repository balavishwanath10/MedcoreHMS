import mongoose, { Schema, Document, Model } from 'mongoose';
import { IPatientProfile, Gender, BloodGroup } from '../../shared/types/index.js';

export interface PatientProfileDocument
  extends Omit<IPatientProfile, '_id' | 'hospitalId' | 'userId'>, Document {
  hospitalId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId | null;
}

const addressSchema = new Schema(
  {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true, default: 'USA' },
  },
  { _id: false },
);

const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    relationship: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const patientProfileSchema = new Schema<PatientProfileDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for patient profile'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    mrn: {
      type: String,
      required: [true, 'Medical Record Number (MRN) is required'],
      trim: true,
      uppercase: true,
      minlength: [3, 'MRN must be at least 3 characters'],
      maxlength: [30, 'MRN cannot exceed 30 characters'],
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: (v: Date) => v <= new Date(),
        message: 'Date of birth cannot be in the future',
      },
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: ['MALE', 'FEMALE', 'OTHER'] as Gender[],
        message: '{VALUE} is not a valid gender',
      },
    },
    bloodGroup: {
      type: String,
      enum: {
        values: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as BloodGroup[],
        message: '{VALUE} is not a valid blood group',
      },
      default: 'UNKNOWN',
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    emergencyContact: {
      type: emergencyContactSchema,
      required: [true, 'Emergency contact is required'],
    },
    address: {
      type: addressSchema,
      required: [true, 'Patient address is required'],
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
// Unique compound index: MRN is unique within a hospital tenant
patientProfileSchema.index({ hospitalId: 1, mrn: 1 }, { unique: true });
patientProfileSchema.index({ hospitalId: 1, phone: 1 });
patientProfileSchema.index({ hospitalId: 1, lastName: 1, firstName: 1 });
patientProfileSchema.index({ hospitalId: 1, isDeleted: 1 });

export const PatientProfile: Model<PatientProfileDocument> =
  mongoose.models.PatientProfile ||
  mongoose.model<PatientProfileDocument>('PatientProfile', patientProfileSchema);
