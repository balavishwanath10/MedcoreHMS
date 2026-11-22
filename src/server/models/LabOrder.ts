import mongoose, { Schema, Document, Model } from 'mongoose';
import { ILabOrder, ILabOrderItem } from '../../shared/types/index.js';

export interface LabOrderDocument extends Omit<ILabOrder, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const LabOrderItemSchema = new Schema<ILabOrderItem>(
  {
    testId: {
      type: String,
      ref: 'LabTest',
      required: [true, 'Test ID is required'],
    },
    testCode: {
      type: String,
      required: true,
      trim: true,
    },
    testName: {
      type: String,
      required: true,
      trim: true,
    },
    sampleType: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['ORDERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'ORDERED',
    },
    collectedAt: { type: Date, required: false },
    collectedBy: { type: String, required: false },
  },
  { _id: false },
);

const LabOrderSchema = new Schema<LabOrderDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    patientId: {
      type: String,
      ref: 'PatientProfile',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    doctorId: {
      type: String,
      ref: 'DoctorProfile',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    encounterId: {
      type: String,
      ref: 'Encounter',
      required: false,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    tests: {
      type: [LabOrderItemSchema],
      validate: {
        validator: (v: ILabOrderItem[]) => Array.isArray(v) && v.length > 0,
        message: 'Lab order must contain at least one diagnostic test',
      },
    },
    priority: {
      type: String,
      enum: ['ROUTINE', 'URGENT', 'STAT'],
      default: 'ROUTINE',
      index: true,
    },
    clinicalNotes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['ORDERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'ORDERED',
      index: true,
    },
    orderedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sampleCollectedAt: {
      type: Date,
      required: false,
    },
    sampleCollectedBy: {
      type: String,
      required: false,
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

LabOrderSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
LabOrderSchema.index({ hospitalId: 1, status: 1 });
LabOrderSchema.index({ hospitalId: 1, doctorId: 1, createdAt: -1 });
LabOrderSchema.index({ hospitalId: 1, orderNumber: 1 });

export const LabOrder: Model<LabOrderDocument> =
  (mongoose.models.LabOrder as Model<LabOrderDocument>) ||
  mongoose.model<LabOrderDocument>('LabOrder', LabOrderSchema);
