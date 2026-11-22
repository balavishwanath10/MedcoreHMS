import mongoose, { Schema, Document } from 'mongoose';
import { IVaccination } from '../../shared/types/index.js';

export interface VaccinationDocument extends Omit<IVaccination, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const VaccinationSchema = new Schema<VaccinationDocument>(
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
    vaccineName: {
      type: String,
      required: true,
      trim: true,
    },
    batchNumber: {
      type: String,
      trim: true,
    },
    administeredDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    administeredBy: {
      type: String,
      trim: true,
    },
    nextDueDate: {
      type: Date,
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

VaccinationSchema.index({ hospitalId: 1, patientId: 1, isDeleted: 1 });

export const Vaccination =
  (mongoose.models.Vaccination as mongoose.Model<VaccinationDocument>) ||
  mongoose.model<VaccinationDocument>('Vaccination', VaccinationSchema);
