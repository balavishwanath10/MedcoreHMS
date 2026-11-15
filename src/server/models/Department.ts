import mongoose, { Schema, Document, Model } from 'mongoose';
import { IDepartment } from '../../shared/types/index.js';

export interface DepartmentDocument
  extends Omit<IDepartment, '_id' | 'hospitalId' | 'headDoctorId'>, Document {
  hospitalId: mongoose.Types.ObjectId;
  headDoctorId?: mongoose.Types.ObjectId | null;
}

const departmentSchema = new Schema<DepartmentDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required for department'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      minlength: [2, 'Department name must be at least 2 characters'],
      maxlength: [100, 'Department name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      trim: true,
      uppercase: true,
      minlength: [2, 'Department code must be at least 2 characters'],
      maxlength: [10, 'Department code cannot exceed 10 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    headDoctorId: {
      type: Schema.Types.ObjectId,
      ref: 'DoctorProfile',
      default: null,
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

// Unique compound index: Code must be unique within a hospital tenant
departmentSchema.index({ hospitalId: 1, code: 1 }, { unique: true });
departmentSchema.index({ hospitalId: 1, isActive: 1 });
departmentSchema.index({ hospitalId: 1, isDeleted: 1 });

export const Department: Model<DepartmentDocument> =
  mongoose.models.Department || mongoose.model<DepartmentDocument>('Department', departmentSchema);
