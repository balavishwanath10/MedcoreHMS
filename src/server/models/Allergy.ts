import mongoose, { Schema, Document } from 'mongoose';
import { IAllergy } from '../../shared/types/index.js';

export interface AllergyDocument extends Omit<IAllergy, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const AllergySchema = new Schema<AllergyDocument>(
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
    allergen: {
      type: String,
      required: true,
      trim: true,
    },
    reaction: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING'],
      required: true,
      default: 'MODERATE',
    },
    isAdverseDrugReaction: {
      type: Boolean,
      default: false,
    },
    diagnosedDate: {
      type: Date,
      default: Date.now,
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

AllergySchema.index({ hospitalId: 1, patientId: 1, isDeleted: 1 });

export const Allergy =
  (mongoose.models.Allergy as mongoose.Model<AllergyDocument>) ||
  mongoose.model<AllergyDocument>('Allergy', AllergySchema);
