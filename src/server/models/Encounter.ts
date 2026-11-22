import mongoose, { Schema, Document } from 'mongoose';
import {
  IEncounter,
  IVitals,
  ISymptom,
  IEncounterAddendum,
  IDiagnosis,
  ITreatmentPlan,
} from '../../shared/types/index.js';

export interface EncounterDocument extends Omit<IEncounter, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const DiagnosisSchema = new Schema<IDiagnosis>(
  {
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, enum: ['DIFFERENTIAL', 'CONFIRMED'], required: true },
    diagnosedAt: { type: Date, default: Date.now },
    diagnosedBy: { type: String, required: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const PrescriptionItemSchema = new Schema(
  {
    medicationName: { type: String, required: true, trim: true },
    dosage: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true },
  },
  { _id: false },
);

const TreatmentPlanSchema = new Schema<ITreatmentPlan>(
  {
    instructions: { type: String, required: true, trim: true },
    prescriptions: [PrescriptionItemSchema],
    followUpDate: { type: Date },
    lifestyleRecommendations: [{ type: String, trim: true }],
  },
  { _id: false },
);

const VitalsSchema = new Schema<IVitals>(
  {
    systolicBp: { type: Number, required: true },
    diastolicBp: { type: Number, required: true },
    pulseRate: { type: Number, required: true },
    temperatureF: { type: Number, required: true },
    respiratoryRate: { type: Number, required: true },
    oxygenSaturation: { type: Number, required: true },
    heightCm: { type: Number, required: true },
    weightKg: { type: Number, required: true },
    bmi: { type: Number },
    bmiCategory: {
      type: String,
      enum: ['UNDERWEIGHT', 'NORMAL', 'OVERWEIGHT', 'OBESE'],
    },
    abnormalFlags: [{ type: String }],
  },
  { _id: false },
);

const SymptomSchema = new Schema<ISymptom>(
  {
    name: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['MILD', 'MODERATE', 'SEVERE'],
      required: true,
      default: 'MODERATE',
    },
    onsetDate: { type: Date },
    duration: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const AddendumSchema = new Schema<IEncounterAddendum>(
  {
    authorId: { type: String, required: true },
    authorRole: { type: String, required: true },
    authorName: { type: String, required: true },
    amendmentReason: { type: String, required: true, trim: true },
    notes: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const EncounterSchema = new Schema<EncounterDocument>(
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
    doctorId: {
      type: String,
      ref: 'DoctorProfile',
      required: true,
      index: true,
    },
    appointmentId: {
      type: String,
      ref: 'Appointment',
      index: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'SIGNED', 'AMENDED'],
      default: 'OPEN',
      required: true,
      index: true,
    },
    chiefComplaint: {
      type: String,
      required: true,
      trim: true,
    },
    vitals: {
      type: VitalsSchema,
      required: false,
    },
    symptoms: [SymptomSchema],
    historyOfPresentIllness: {
      type: String,
      trim: true,
    },
    clinicalNotes: {
      type: String,
      trim: true,
    },
    assessment: {
      type: String,
      trim: true,
    },
    diagnoses: [DiagnosisSchema],
    treatmentPlan: {
      type: TreatmentPlanSchema,
      required: false,
    },
    signedAt: {
      type: Date,
      default: null,
    },
    signedBy: {
      type: String,
      ref: 'User',
      default: null,
    },
    addenda: [AddendumSchema],
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

// Compound indexes for tenant isolation and optimized clinical lookups
EncounterSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
EncounterSchema.index({ hospitalId: 1, doctorId: 1, createdAt: -1 });
EncounterSchema.index({ hospitalId: 1, appointmentId: 1 });

export const Encounter =
  (mongoose.models.Encounter as mongoose.Model<EncounterDocument>) ||
  mongoose.model<EncounterDocument>('Encounter', EncounterSchema);
