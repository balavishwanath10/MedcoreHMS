import { z } from 'zod';
import { ALL_ROLES } from '../constants/roles.js';

export const addressSchema = z.object({
  street: z.string().trim().min(2, 'Street must be at least 2 characters'),
  city: z.string().trim().min(2, 'City must be at least 2 characters'),
  state: z.string().trim().min(2, 'State must be at least 2 characters'),
  postalCode: z.string().trim().min(3, 'Postal code must be at least 3 characters'),
  country: z.string().trim().min(2, 'Country must be at least 2 characters'),
});

export const hospitalSettingsSchema = z.object({
  timezone: z.string().default('UTC'),
  currency: z.string().default('USD'),
  appointmentSlotDurationMinutes: z.number().min(10).max(120).default(30),
  allowPatientPortalRegistration: z.boolean().default(true),
});

export const hospitalCreateSchema = z.object({
  name: z.string().trim().min(2, 'Hospital name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Hospital code must be at least 2 characters')
    .max(10)
    .toUpperCase(),
  slug: z.string().trim().toLowerCase().optional(),
  email: z.string().trim().email('Invalid hospital email address'),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
  address: addressSchema,
  licenseNumber: z.string().trim().min(3, 'License number is required'),
  taxId: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING', 'INACTIVE']).default('ONBOARDING'),
  settings: hospitalSettingsSchema.partial().optional(),
});

export const hospitalUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(7).optional(),
  email: z.string().trim().email().optional(),
  address: addressSchema.optional(),
  taxId: z.string().trim().optional(),
  settings: hospitalSettingsSchema.partial().optional(),
});

export const hospitalStatusUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING', 'INACTIVE']),
  reason: z.string().trim().optional(),
});

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters'),
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters').optional(),
  hospitalId: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32, 'Password reset token is invalid or malformed'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password cannot exceed 100 characters'),
});

export const sendEmailOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
});

export const verifyEmailOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address format'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be exactly 6 numeric digits'),
});

export const sendPhoneOtpSchema = z.object({
  phone: z.string().trim().min(7, 'Phone number must be at least 7 digits'),
});

export const verifyPhoneOtpSchema = z.object({
  phone: z.string().trim().min(7, 'Phone number must be at least 7 digits'),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be exactly 6 numeric digits'),
});

export const userCreateSchema = z.object({
  hospitalId: z.string().optional().nullable(),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  role: z.enum(ALL_ROLES as [string, ...string[]]),
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  phone: z.string().trim().min(7).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED']).default('ACTIVE'),
});

export const departmentCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Department code must be at least 2 characters')
    .max(10)
    .toUpperCase(),
  description: z.string().trim().max(500).optional(),
  headDoctorId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const departmentUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Department name must be at least 2 characters')
    .max(100)
    .optional(),
  description: z.string().trim().max(500).optional(),
  headDoctorId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const doctorProfileCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  departmentId: z.string().min(1, 'Department ID is required'),
  licenseNumber: z.string().trim().min(3, 'Medical license number is required'),
  specialization: z.string().trim().min(2, 'Specialization is required'),
  qualifications: z.array(z.string().trim()).min(1, 'At least one qualification is required'),
  experienceYears: z.number().int().min(0, 'Experience years cannot be negative'),
  consultationFee: z.number().min(0, 'Consultation fee cannot be negative'),
  bio: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const doctorProfileUpdateSchema = z.object({
  departmentId: z.string().min(1, 'Department ID is required').optional(),
  specialization: z.string().trim().min(2, 'Specialization is required').optional(),
  qualifications: z
    .array(z.string().trim())
    .min(1, 'At least one qualification is required')
    .optional(),
  experienceYears: z.number().int().min(0, 'Experience years cannot be negative').optional(),
  consultationFee: z.number().min(0, 'Consultation fee cannot be negative').optional(),
  bio: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const doctorAvailabilityCreateSchema = z
  .object({
    hospitalId: z.string().min(1, 'Hospital ID is required'),
    doctorId: z.string().min(1, 'Doctor ID is required'),
    dayOfWeek: z
      .number()
      .int()
      .min(0, 'Day of week must be between 0 (Sunday) and 6 (Saturday)')
      .max(6, 'Day of week must be between 0 (Sunday) and 6 (Saturday)'),
    startTime: z.string().regex(timeRegex, 'Start time must be in HH:mm format (00:00 to 23:59)'),
    endTime: z.string().regex(timeRegex, 'End time must be in HH:mm format (00:00 to 23:59)'),
    slotDurationMinutes: z
      .number()
      .int()
      .min(10, 'Slot duration must be at least 10 minutes')
      .max(120, 'Slot duration cannot exceed 120 minutes')
      .default(30),
    isAvailable: z.boolean().default(true),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'End time must be later than start time',
    path: ['endTime'],
  });

export const doctorAvailabilityUpdateSchema = z
  .object({
    startTime: z
      .string()
      .regex(timeRegex, 'Start time must be in HH:mm format (00:00 to 23:59)')
      .optional(),
    endTime: z
      .string()
      .regex(timeRegex, 'End time must be in HH:mm format (00:00 to 23:59)')
      .optional(),
    slotDurationMinutes: z
      .number()
      .int()
      .min(10, 'Slot duration must be at least 10 minutes')
      .max(120, 'Slot duration cannot exceed 120 minutes')
      .optional(),
    isAvailable: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return data.startTime < data.endTime;
      }
      return true;
    },
    {
      message: 'End time must be later than start time',
      path: ['endTime'],
    },
  );

export const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN'] as const;
export const genders = ['MALE', 'FEMALE', 'OTHER'] as const;

export const patientProfileCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  userId: z.string().optional().nullable(),
  mrn: z.string().trim().min(3, 'MRN is required').max(30),
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(genders),
  bloodGroup: z.enum(bloodGroups).default('UNKNOWN'),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
  email: z.string().trim().email().optional(),
  emergencyContact: z.object({
    name: z.string().trim().min(1, 'Emergency contact name is required'),
    relationship: z.string().trim().min(1, 'Relationship is required'),
    phone: z.string().trim().min(7, 'Emergency contact phone is required'),
  }),
  address: addressSchema,
});

export const appointmentTypes = ['ROUTINE', 'EMERGENCY', 'FOLLOW_UP', 'TELEMEDICINE'] as const;
export const appointmentStatuses = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const appointmentCreateSchema = z
  .object({
    hospitalId: z.string().min(1, 'Hospital ID is required'),
    patientId: z.string().min(1, 'Patient ID is required'),
    doctorId: z.string().min(1, 'Doctor ID is required'),
    departmentId: z.string().min(1, 'Department ID is required').optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    type: z.enum(appointmentTypes).default('ROUTINE'),
    isEmergency: z.boolean().default(false),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'Appointment end time must be after start time',
    path: ['endTime'],
  });

export const appointmentStatusUpdateSchema = z.object({
  status: z.enum(appointmentStatuses),
  reason: z.string().trim().max(500).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
});

// Day 11 EMR Vitals & Encounter Schemas
export const vitalsSchema = z.object({
  systolicBp: z
    .number()
    .int()
    .min(40, 'Systolic BP must be >= 40')
    .max(300, 'Systolic BP must be <= 300'),
  diastolicBp: z
    .number()
    .int()
    .min(20, 'Diastolic BP must be >= 20')
    .max(200, 'Diastolic BP must be <= 200'),
  pulseRate: z
    .number()
    .int()
    .min(30, 'Pulse rate must be >= 30')
    .max(250, 'Pulse rate must be <= 250'),
  temperatureF: z
    .number()
    .min(85, 'Temperature must be >= 85°F')
    .max(115, 'Temperature must be <= 115°F'),
  respiratoryRate: z
    .number()
    .int()
    .min(5, 'Respiratory rate must be >= 5')
    .max(80, 'Respiratory rate must be <= 80'),
  oxygenSaturation: z.number().min(50, 'SpO2 must be >= 50%').max(100, 'SpO2 must be <= 100%'),
  heightCm: z.number().min(30, 'Height must be >= 30 cm').max(300, 'Height must be <= 300 cm'),
  weightKg: z.number().min(1, 'Weight must be >= 1 kg').max(500, 'Weight must be <= 500 kg'),
  bmi: z.number().optional(),
  bmiCategory: z.enum(['UNDERWEIGHT', 'NORMAL', 'OVERWEIGHT', 'OBESE']).optional(),
  abnormalFlags: z.array(z.string()).optional(),
});

export const symptomSchema = z.object({
  name: z.string().trim().min(1, 'Symptom name is required').max(200),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE']),
  onsetDate: z.coerce.date().optional(),
  duration: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

// Day 12 Clinical History Schemas (Diagnoses, Treatment, Allergies, Vaccinations, Family History)
export const diagnosisSchema = z.object({
  code: z.string().trim().min(2, 'ICD-10 code required').max(10),
  description: z.string().trim().min(2, 'Diagnosis description required').max(250),
  type: z.enum(['DIFFERENTIAL', 'CONFIRMED']),
  notes: z.string().trim().max(1000).optional(),
});

export const prescriptionItemSchema = z.object({
  medicationName: z.string().trim().min(2, 'Medication name required').max(200),
  dosage: z.string().trim().min(1, 'Dosage required').max(100),
  frequency: z.string().trim().min(1, 'Frequency required').max(100),
  duration: z.string().trim().min(1, 'Duration required').max(100),
  instructions: z.string().trim().max(500).optional(),
});

export const treatmentPlanSchema = z.object({
  instructions: z.string().trim().min(2, 'Treatment instructions required').max(5000),
  prescriptions: z.array(prescriptionItemSchema).optional(),
  followUpDate: z.coerce.date().optional(),
  lifestyleRecommendations: z.array(z.string().trim()).optional(),
});

export const encounterCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  appointmentId: z.string().optional(),
  chiefComplaint: z
    .string()
    .trim()
    .min(2, 'Chief complaint must be at least 2 characters')
    .max(1000),
  vitals: vitalsSchema.optional(),
  symptoms: z.array(symptomSchema).optional(),
  historyOfPresentIllness: z.string().trim().max(5000).optional(),
  clinicalNotes: z.string().trim().max(5000).optional(),
  assessment: z.string().trim().max(5000).optional(),
  diagnoses: z.array(diagnosisSchema).optional(),
  treatmentPlan: treatmentPlanSchema.optional(),
});

export const encounterUpdateSchema = z.object({
  chiefComplaint: z.string().trim().min(2).max(1000).optional(),
  vitals: vitalsSchema.optional(),
  symptoms: z.array(symptomSchema).optional(),
  historyOfPresentIllness: z.string().trim().max(5000).optional(),
  clinicalNotes: z.string().trim().max(5000).optional(),
  assessment: z.string().trim().max(5000).optional(),
  diagnoses: z.array(diagnosisSchema).optional(),
  treatmentPlan: treatmentPlanSchema.optional(),
  reasonForChange: z
    .string({ required_error: 'A non-empty reason for clinical correction is mandatory' })
    .trim()
    .min(3, 'Reason for correction must be at least 3 characters')
    .max(500),
});

export const encounterAddendumSchema = z.object({
  amendmentReason: z
    .string()
    .trim()
    .min(3, 'Reason for amendment is required (min 3 chars)')
    .max(500),
  notes: z.string().trim().min(3, 'Addendum notes are required (min 3 chars)').max(5000),
});

export const encounterSignSchema = z.object({
  confirmation: z.literal(true, {
    errorMap: () => ({
      message: 'Explicit confirmation is required to finalize and sign encounter',
    }),
  }),
});

export const allergyCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  allergen: z.string().trim().min(2, 'Allergen name is required').max(200),
  reaction: z.string().trim().min(2, 'Reaction description is required').max(500),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING']),
  isAdverseDrugReaction: z.boolean().default(false),
  diagnosedDate: z.coerce.date().optional(),
});

export const vaccinationCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  vaccineName: z.string().trim().min(2, 'Vaccine name is required').max(200),
  batchNumber: z.string().trim().max(100).optional(),
  administeredDate: z.coerce.date().default(() => new Date()),
  administeredBy: z.string().trim().max(200).optional(),
  nextDueDate: z.coerce.date().optional(),
});

export const familyHistoryCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  relationship: z.string().trim().min(2, 'Relationship is required').max(100),
  condition: z.string().trim().min(2, 'Condition is required').max(200),
  hasDiabetes: z.boolean().default(false),
  hasHypertension: z.boolean().default(false),
  hasCancer: z.boolean().default(false),
  hasCardiacDisease: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
});
