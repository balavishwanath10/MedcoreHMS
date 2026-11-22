import mongoose, { Schema, Document, Model } from 'mongoose';
import { ILabResult, ILabParameterResult } from '../../shared/types/index.js';

export interface LabResultDocument extends Omit<ILabResult, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const LabParameterResultSchema = new Schema<ILabParameterResult>(
  {
    parameterName: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    unit: { type: String, default: '', trim: true },
    referenceRangeMin: { type: Number, required: false },
    referenceRangeMax: { type: Number, required: false },
    textRange: { type: String, required: false, trim: true },
    isAbnormal: { type: Boolean, default: false },
    abnormalFlag: {
      type: String,
      enum: ['NORMAL', 'LOW', 'HIGH', 'CRITICAL_LOW', 'CRITICAL_HIGH', 'ABNORMAL'],
      default: 'NORMAL',
    },
    notes: { type: String, required: false, trim: true },
  },
  { _id: false },
);

const LabResultSchema = new Schema<LabResultDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    orderId: {
      type: String,
      ref: 'LabOrder',
      required: [true, 'Lab Order ID is required'],
      index: true,
    },
    testId: {
      type: String,
      ref: 'LabTest',
      required: [true, 'Test ID is required'],
      index: true,
    },
    patientId: {
      type: String,
      ref: 'PatientProfile',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    technicianId: {
      type: String,
      ref: 'User',
      required: [true, 'Technician ID is required'],
    },
    results: {
      type: [LabParameterResultSchema],
      validate: {
        validator: (v: ILabParameterResult[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one parameter result must be recorded',
      },
    },
    technicianNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
      default: 'SUBMITTED',
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: String,
      ref: 'User',
      required: false,
    },
    reviewedAt: {
      type: Date,
      required: false,
    },
    reviewNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    pdfAttachmentUrl: {
      type: String,
      trim: true,
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

LabResultSchema.index({ hospitalId: 1, orderId: 1 });
LabResultSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
LabResultSchema.index({ hospitalId: 1, status: 1 });
LabResultSchema.index({ hospitalId: 1, testId: 1 });

export const LabResult: Model<LabResultDocument> =
  (mongoose.models.LabResult as Model<LabResultDocument>) ||
  mongoose.model<LabResultDocument>('LabResult', LabResultSchema);
