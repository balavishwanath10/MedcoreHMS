import mongoose, { Schema, Document } from 'mongoose';
import { IFamilyHistory } from '../../shared/types/index.js';

export interface FamilyHistoryDocument extends Omit<IFamilyHistory, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const FamilyHistorySchema = new Schema<FamilyHistoryDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: true,
      index: true,
    },
    patientId: {
      type: String,
      ref: 'PatientProfile',
      required: true,
      index: true,
    },
    relationship: {
      type: String,
      required: true,
      trim: true,
    },
    condition: {
      type: String,
      required: true,
      trim: true,
    },
    hasDiabetes: {
      type: Boolean,
      default: false,
    },
    hasHypertension: {
      type: Boolean,
      default: false,
    },
    hasCancer: {
      type: Boolean,
      default: false,
    },
    hasCardiacDisease: {
      type: Boolean,
      default: false,
    },
    notes: {
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

FamilyHistorySchema.index({ hospitalId: 1, patientId: 1, isDeleted: 1 });

export const FamilyHistory =
  (mongoose.models.FamilyHistory as mongoose.Model<FamilyHistoryDocument>) ||
  mongoose.model<FamilyHistoryDocument>('FamilyHistory', FamilyHistorySchema);
