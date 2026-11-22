import mongoose, { Schema, Document, Model } from 'mongoose';
import { IMedicine } from '../../shared/types/index.js';

export interface MedicineDocument extends Omit<IMedicine, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const MedicineSchema = new Schema<MedicineDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      maxlength: 200,
    },
    genericName: {
      type: String,
      required: [true, 'Generic name is required'],
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      maxlength: 100,
    },
    dosageForm: {
      type: String,
      enum: ['tablet', 'capsule', 'syrup', 'injection', 'topical'],
      required: [true, 'Dosage form is required'],
    },
    strength: {
      type: String,
      required: [true, 'Strength is required'],
      trim: true,
      maxlength: 100,
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: 0,
      default: 0,
    },
    reorderLevel: {
      type: Number,
      min: 0,
      default: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Compound indexes for tenant-scoped formulary and fast search
MedicineSchema.index({ hospitalId: 1, name: 1 });
MedicineSchema.index({ hospitalId: 1, genericName: 1 });
MedicineSchema.index({ hospitalId: 1, category: 1 });

export const Medicine: Model<MedicineDocument> =
  (mongoose.models.Medicine as Model<MedicineDocument>) ||
  mongoose.model<MedicineDocument>('Medicine', MedicineSchema);
