import mongoose, { Schema, Document, Model } from 'mongoose';
import { ILabTest, ILabTestReferenceRange } from '../../shared/types/index.js';

export interface LabTestDocument extends Omit<ILabTest, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const LabTestReferenceRangeSchema = new Schema<ILabTestReferenceRange>(
  {
    parameterName: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    minNormal: { type: Number, required: false },
    maxNormal: { type: Number, required: false },
    textRange: { type: String, required: false, trim: true },
    genderSpecific: {
      type: String,
      enum: ['MALE', 'FEMALE', 'ALL'],
      default: 'ALL',
    },
    ageMinYears: { type: Number, required: false },
    ageMaxYears: { type: Number, required: false },
  },
  { _id: false },
);

const LabTestSchema = new Schema<LabTestDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    code: {
      type: String,
      required: [true, 'Test code is required'],
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    name: {
      type: String,
      required: [true, 'Test name is required'],
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      enum: [
        'Hematology',
        'Biochemistry',
        'Microbiology',
        'Pathology',
        'Immunology',
        'Radiology',
        'Other',
      ],
      required: [true, 'Category is required'],
      index: true,
    },
    sampleType: {
      type: String,
      enum: [
        'Blood',
        'Serum',
        'Plasma',
        'Urine',
        'Sputum',
        'Stool',
        'Swab',
        'Tissue',
        'CSF',
        'Other',
      ],
      required: [true, 'Sample type is required'],
    },
    turnaroundTimeHours: {
      type: Number,
      required: true,
      default: 24,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    referenceRanges: [LabTestReferenceRangeSchema],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Unique test code per hospital tenant
LabTestSchema.index({ hospitalId: 1, code: 1 }, { unique: true });
LabTestSchema.index({ hospitalId: 1, category: 1 });
LabTestSchema.index({ hospitalId: 1, isActive: 1 });

export const LabTest: Model<LabTestDocument> =
  (mongoose.models.LabTest as Model<LabTestDocument>) ||
  mongoose.model<LabTestDocument>('LabTest', LabTestSchema);
