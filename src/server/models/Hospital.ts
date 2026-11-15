import mongoose, { Schema, Document, Model } from 'mongoose';
import { IHospital, HospitalStatus } from '../../shared/types/index.js';

export interface HospitalDocument extends Omit<IHospital, '_id'>, Document {}

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

const hospitalSettingsSchema = new Schema(
  {
    timezone: { type: String, default: 'UTC' },
    currency: { type: String, default: 'USD' },
    appointmentSlotDurationMinutes: { type: Number, default: 30, min: 10, max: 120 },
    allowPatientPortalRegistration: { type: Boolean, default: true },
  },
  { _id: false },
);

const hospitalSchema = new Schema<HospitalDocument>(
  {
    name: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
      minlength: [2, 'Hospital name must be at least 2 characters'],
      maxlength: [100, 'Hospital name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Hospital code is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Hospital code must be at least 2 characters'],
      maxlength: [10, 'Hospital code cannot exceed 10 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Hospital slug is required'],
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: [true, 'Hospital email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid hospital email address'],
    },
    phone: {
      type: String,
      required: [true, 'Hospital phone is required'],
      trim: true,
    },
    address: {
      type: addressSchema,
      required: [true, 'Hospital address is required'],
    },
    licenseNumber: {
      type: String,
      required: [true, 'Medical license number is required'],
      trim: true,
    },
    taxId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'SUSPENDED', 'ONBOARDING', 'INACTIVE'] as HospitalStatus[],
        message: '{VALUE} is not a valid hospital status',
      },
      default: 'ONBOARDING',
    },
    settings: {
      type: hospitalSettingsSchema,
      default: () => ({}),
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
hospitalSchema.index({ code: 1 }, { unique: true });
hospitalSchema.index({ slug: 1 }, { unique: true });
hospitalSchema.index({ licenseNumber: 1 }, { unique: true });
hospitalSchema.index({ status: 1 });
hospitalSchema.index({ isDeleted: 1 });

export const Hospital: Model<HospitalDocument> =
  mongoose.models.Hospital || mongoose.model<HospitalDocument>('Hospital', hospitalSchema);
