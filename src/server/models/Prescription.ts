import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  IPrescription,
  IPrescriptionItem,
  IPrescriptionAmendment,
} from '../../shared/types/index.js';

export interface PrescriptionDocument extends Omit<IPrescription, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const PrescriptionItemSchema = new Schema<IPrescriptionItem>(
  {
    medicineId: {
      type: String,
      ref: 'Medicine',
      required: false,
    },
    medicineName: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      maxlength: 200,
    },
    form: {
      type: String,
      enum: ['tablet', 'capsule', 'syrup', 'injection', 'topical'],
      required: [true, 'Form is required'],
    },
    dosage: {
      type: String,
      required: [true, 'Dosage is required (e.g. 500mg)'],
      trim: true,
      maxlength: 100,
    },
    frequency: {
      type: String,
      enum: ['OD', 'BD', 'TDS', 'QID', 'SOS'],
      required: [true, 'Frequency is required'],
    },
    durationDays: {
      type: Number,
      required: [true, 'Duration in days is required'],
      min: [1, 'Duration must be at least 1 day'],
      max: [365, 'Duration cannot exceed 365 days'],
    },
    specialInstructions: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: false },
);

const PrescriptionAmendmentSchema = new Schema<IPrescriptionAmendment>(
  {
    amendmentNumber: {
      type: Number,
      required: true,
    },
    previousItems: [PrescriptionItemSchema],
    revisedItems: [PrescriptionItemSchema],
    authorId: {
      type: String,
      required: true,
    },
    authorRole: {
      type: String,
      required: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: [true, 'Amendment reason is mandatory'],
      trim: true,
      minlength: 3,
      maxlength: 500,
    },
    amendedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const PrescriptionSchema = new Schema<PrescriptionDocument>(
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
      required: [true, 'Encounter ID is required'],
      index: true,
    },
    diagnosis: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    items: {
      type: [PrescriptionItemSchema],
      validate: {
        validator: (v: IPrescriptionItem[]) => Array.isArray(v) && v.length > 0,
        message: 'Prescription must contain at least one medicine item',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['ISSUED', 'DISPENSED', 'CANCELLED', 'AMENDED'],
      default: 'ISSUED',
      required: true,
      index: true,
    },
    signatureUrl: {
      type: String,
      trim: true,
    },
    digitalSignature: {
      type: String,
      trim: true,
    },
    signedAt: {
      type: Date,
      index: true,
    },
    signedBy: {
      type: String,
      trim: true,
    },
    amendments: [PrescriptionAmendmentSchema],
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
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

// Compound indexes for tenant isolation, patient medical history, and clinical lookup
PrescriptionSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
PrescriptionSchema.index({ hospitalId: 1, doctorId: 1, createdAt: -1 });
PrescriptionSchema.index({ hospitalId: 1, encounterId: 1 });
PrescriptionSchema.index({ hospitalId: 1, status: 1 });

export const Prescription: Model<PrescriptionDocument> =
  (mongoose.models.Prescription as Model<PrescriptionDocument>) ||
  mongoose.model<PrescriptionDocument>('Prescription', PrescriptionSchema);
