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

// =========================================================================
// Day 13: Prescription & Medicine Schemas
// =========================================================================
export const medicineDosageForms = ['tablet', 'capsule', 'syrup', 'injection', 'topical'] as const;

export const prescriptionFrequencies = ['OD', 'BD', 'TDS', 'QID', 'SOS'] as const;

export const medicineCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  name: z.string().trim().min(1, 'Medicine name is required').max(200),
  genericName: z.string().trim().min(1, 'Generic name is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(100),
  dosageForm: z.enum(medicineDosageForms, {
    errorMap: () => ({
      message: 'Dosage form must be tablet, capsule, syrup, injection, or topical',
    }),
  }),
  strength: z.string().trim().min(1, 'Strength is required (e.g., 500mg)').max(100),
  unitPrice: z.number().min(0, 'Unit price cannot be negative').default(0),
  reorderLevel: z.number().int().min(0).default(50),
  isActive: z.boolean().default(true),
});

export const prescriptionItemInputSchema = z
  .object({
    medicineId: z.string().optional(),
    medicineName: z.string().trim().min(1, 'Medicine name is required').max(200),
    genericName: z.string().trim().optional(),
    form: z
      .enum(medicineDosageForms, {
        errorMap: () => ({
          message: 'Form must be tablet, capsule, syrup, injection, or topical',
        }),
      })
      .optional(),
    dosageForm: z.enum(medicineDosageForms).optional(),
    dosage: z.string().trim().min(1, 'Dosage is required (e.g., 500mg, 1 tablet)').max(100),
    frequency: z.enum(prescriptionFrequencies, {
      errorMap: () => ({
        message: 'Frequency must be OD, BD, TDS, QID, or SOS',
      }),
    }),
    durationDays: z
      .number({ required_error: 'Duration in days is required' })
      .int('Duration must be a whole number of days')
      .min(1, 'Duration must be at least 1 day')
      .max(365, 'Duration cannot exceed 365 days'),
    instructions: z.string().trim().max(1000).optional(),
    specialInstructions: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.form || data.dosageForm, {
    message: 'Form must be tablet, capsule, syrup, injection, or topical',
    path: ['form'],
  })
  .transform((data) => ({
    ...data,
    form: (data.form || data.dosageForm)!,
    dosageForm: (data.dosageForm || data.form)!,
    specialInstructions: data.specialInstructions || data.instructions,
    instructions: data.instructions || data.specialInstructions,
  }));

export const prescriptionCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  encounterId: z.string().min(1, 'Encounter ID is required'),
  diagnosis: z.string().trim().optional(),
  items: z
    .array(prescriptionItemInputSchema)
    .min(1, 'At least one medicine item is required in a prescription'),
  notes: z.string().trim().max(2000).optional(),
});

export const prescriptionAmendSchema = z.object({
  items: z
    .array(prescriptionItemInputSchema)
    .min(1, 'At least one medicine item is required in the amended prescription'),
  reason: z
    .string({ required_error: 'A non-empty reason for amendment is mandatory' })
    .trim()
    .min(3, 'Amendment reason must be at least 3 characters')
    .max(500),
});

export const signatureUploadSchema = z.object({
  signatureData: z
    .string({ required_error: 'Signature data is required' })
    .min(10, 'Signature data must be at least 10 characters')
    .max(1024 * 1024, 'Signature image exceeds maximum allowed size of 1MB'),
  mimeType: z.enum(['image/png', 'image/svg+xml'], {
    errorMap: () => ({
      message: 'Signature must be a valid PNG (image/png) or SVG (image/svg+xml) file',
    }),
  }),
});

export const prescriptionSignSchema = z.object({
  signatureData: z.string().optional(),
});

// ==========================================
// Laboratory Diagnostic Schemas (Day 15 & 16)
// ==========================================

export const labTestCategories = [
  'Hematology',
  'Biochemistry',
  'Microbiology',
  'Pathology',
  'Immunology',
  'Radiology',
  'Other',
] as const;

export const labSampleTypes = [
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
] as const;

export const labOrderPriorities = ['ROUTINE', 'URGENT', 'STAT'] as const;

export const labOrderStatuses = [
  'ORDERED',
  'SAMPLE_COLLECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export const labTestReferenceRangeSchema = z.object({
  parameterName: z.string().trim().min(1, 'Parameter name is required'),
  unit: z.string().trim().min(1, 'Unit of measurement is required'),
  minNormal: z.number().optional(),
  maxNormal: z.number().optional(),
  textRange: z.string().trim().optional(),
  genderSpecific: z.enum(['MALE', 'FEMALE', 'ALL']).default('ALL'),
  ageMinYears: z.number().int().min(0).optional(),
  ageMaxYears: z.number().int().min(0).optional(),
});

export const labTestCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  code: z.string().trim().min(2, 'Test code is required').max(30).toUpperCase(),
  name: z.string().trim().min(2, 'Test name is required').max(200),
  category: z.enum(labTestCategories),
  sampleType: z.enum(labSampleTypes),
  turnaroundTimeHours: z.number().int().min(1).default(24),
  price: z.number().min(0, 'Price cannot be negative').default(0),
  referenceRanges: z.array(labTestReferenceRangeSchema).default([]),
  isActive: z.boolean().default(true),
});

export const labOrderCreateSchema = z.object({
  hospitalId: z.string().min(1, 'Hospital ID is required'),
  patientId: z.string().min(1, 'Patient ID is required'),
  doctorId: z.string().min(1, 'Doctor ID is required'),
  encounterId: z.string().optional(),
  testIds: z.array(z.string().min(1)).min(1, 'At least one test must be ordered'),
  priority: z.enum(labOrderPriorities).default('ROUTINE'),
  clinicalNotes: z.string().trim().max(1000).optional(),
});

export const sampleCollectedSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const abnormalFlags = [
  'NORMAL',
  'LOW',
  'HIGH',
  'CRITICAL_LOW',
  'CRITICAL_HIGH',
  'ABNORMAL',
] as const;

export const labResultStatuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'] as const;

export const labParameterResultInputSchema = z.object({
  parameterName: z.string().trim().min(1, 'Parameter name is required'),
  value: z.union([z.number(), z.string().trim().min(1)]),
  unit: z.string().trim().default(''),
  referenceRangeMin: z.number().optional(),
  referenceRangeMax: z.number().optional(),
  textRange: z.string().trim().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const labResultSubmitSchema = z.object({
  testId: z.string().min(1, 'Test ID is required'),
  results: z
    .array(labParameterResultInputSchema)
    .min(1, 'At least one parameter result is required'),
  technicianNotes: z.string().trim().max(1000).optional(),
  pdfAttachmentUrl: z.string().trim().optional(),
});

export const labResultReviewSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT']),
    notes: z.string().trim().max(1000).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.action !== 'REJECT' || (data.reason && data.reason.trim().length >= 3), {
    message: 'A mandatory reason of at least 3 characters is required to reject a lab result',
    path: ['reason'],
  });

// ==========================================
// Pharmacy & Inventory Schemas (Day 17)
// ==========================================

export const batchStatuses = ['ACTIVE', 'EXPIRED', 'QUARANTINED', 'DEPLETED'] as const;

export const inventoryBatchCreateSchema = z.object({
  hospitalId: z.string().optional(),
  medicineId: z.string().min(1, 'Medicine ID is required'),
  batchNumber: z.string().trim().min(1, 'Batch number is required').max(100),
  expiryDate: z.coerce.date({ required_error: 'Valid expiry date is required' }),
  manufactureDate: z.coerce.date().optional(),
  quantityReceived: z.number().int().min(1, 'Quantity received must be at least 1'),
  quantityAvailable: z.number().int().min(0).optional(),
  unitCost: z.number().min(0, 'Unit cost cannot be negative'),
  mrp: z.number().min(0, 'MRP cannot be negative'),
  reorderThreshold: z.number().int().min(0).default(20),
  locationRack: z.string().trim().max(100).optional(),
  supplier: z.string().trim().max(200).optional(),
});

export const inventoryBatchUpdateSchema = z.object({
  unitCost: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  reorderThreshold: z.number().int().min(0).optional(),
  locationRack: z.string().trim().max(100).optional(),
  status: z.enum(batchStatuses).optional(),
});

export const dispenseItemInputSchema = z.object({
  medicineId: z.string().min(1, 'Medicine ID is required'),
  quantity: z.number().int().min(1, 'Quantity to dispense must be at least 1'),
});

export const dispensePrescriptionSchema = z.object({
  items: z.array(dispenseItemInputSchema).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const batchQuarantineSchema = z.object({
  reason: z.string().trim().min(3, 'Quarantine reason must be at least 3 characters').max(500),
});

// ==========================================
// Billing, Invoices & Payment Schemas (Day 18)
// ==========================================

export const invoiceStatuses = [
  'DRAFT',
  'ISSUED',
  'PAID',
  'PARTIALLY_PAID',
  'CANCELLED',
  'VOID',
] as const;

export const invoiceLineItemTypes = [
  'CONSULTATION',
  'PHARMACY',
  'LABORATORY',
  'PROCEDURE',
  'ROOM_BED',
  'OTHER',
] as const;

export const paymentMethods = ['CASH', 'STRIPE', 'RAZORPAY', 'INSURANCE_TPA'] as const;

export const paymentStatuses = ['PENDING', 'SUCCESS', 'FAILED'] as const;

export const invoiceLineItemSchema = z.object({
  itemType: z.enum(invoiceLineItemTypes),
  description: z.string().trim().min(1, 'Description is required').max(200),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').default(1),
  unitPrice: z.number().min(0, 'Unit price cannot be negative'),
  amount: z.number().min(0).optional(),
  referenceId: z.string().optional(),
});

export const tpaClaimSchema = z.object({
  providerName: z.string().trim().min(1, 'Insurance provider name is required'),
  policyNumber: z.string().trim().min(1, 'Policy number is required'),
  preAuthCode: z.string().trim().optional(),
  claimAmount: z.number().min(0, 'Claim amount cannot be negative'),
  approvedAmount: z.number().min(0).optional(),
  claimStatus: z.enum(['SUBMITTED', 'PRE_AUTHORIZED', 'SETTLED', 'REJECTED']).default('SUBMITTED'),
  claimNotes: z.string().trim().max(1000).optional(),
});

export const invoiceCreateSchema = z.object({
  hospitalId: z.string().optional(),
  patientId: z.string().min(1, 'Patient ID is required'),
  encounterId: z.string().optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1, 'Invoice must contain at least one line item'),
  discountAmount: z.number().min(0).default(0),
  taxRatePercent: z.number().min(0).max(100).default(5),
  tpaClaim: tpaClaimSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

export const paymentRecordSchema = z.object({
  paymentMethod: z.enum(paymentMethods),
  amount: z.number().min(0.01, 'Payment amount must be greater than 0'),
  currency: z.string().trim().default('USD'),
  transactionReference: z.string().trim().optional(),
  gatewayTransactionId: z.string().trim().optional(),
  idempotencyKey: z.string().trim().optional(),
  tpaClaim: tpaClaimSchema.optional(),
});
