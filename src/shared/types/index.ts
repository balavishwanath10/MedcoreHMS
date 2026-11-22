import { UserRole } from '../constants/roles.js';

export * from '../constants/roles.js';

export type HospitalStatus = 'ACTIVE' | 'SUSPENDED' | 'ONBOARDING' | 'INACTIVE';

export interface IHospital {
  _id?: string;
  name: string;
  code: string;
  slug: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  licenseNumber: string;
  taxId?: string;
  status: HospitalStatus;
  settings?: {
    timezone: string;
    currency: string;
    appointmentSlotDurationMinutes: number;
    allowPatientPortalRegistration: boolean;
  };
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED';

export interface IUser {
  _id?: string;
  hospitalId?: string | null; // null only for SUPER_ADMIN
  email: string;
  passwordHash?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone?: string;
  status: UserStatus;
  isEmailVerified: boolean;
  isPhoneVerified?: boolean;
  passwordResetTokenHash?: string | null;
  passwordResetExpires?: Date | null;
  emailOtpHash?: string | null;
  emailOtpExpires?: Date | null;
  emailOtpAttempts?: number;
  phoneOtpHash?: string | null;
  phoneOtpExpires?: Date | null;
  phoneOtpAttempts?: number;
  lastLoginAt?: Date | null;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IDepartment {
  _id?: string;
  hospitalId: string;
  name: string;
  code: string;
  description?: string;
  headDoctorId?: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IDoctorProfile {
  _id?: string;
  hospitalId: string;
  userId: string;
  departmentId: string;
  licenseNumber: string;
  specialization: string;
  qualifications: string[];
  experienceYears: number;
  consultationFee: number;
  bio?: string;
  signatureData?: string;
  signatureMimeType?: 'image/png' | 'image/svg+xml';
  signatureUploadedAt?: string | Date;
  bookingLockVersion?: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IDoctorAvailability {
  _id?: string;
  hospitalId: string;
  doctorId: string;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  startTime: string; // "09:00" (HH:mm)
  endTime: string; // "17:00" (HH:mm)
  slotDurationMinutes: number; // e.g. 15, 30, 45, 60
  isAvailable: boolean;
  isDeleted?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ITimeSlot {
  startTime: string; // "09:00"
  endTime: string; // "09:30"
  isBooked: boolean;
  slotDurationMinutes: number;
}

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'UNKNOWN';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface IPatientProfile {
  _id?: string;
  hospitalId: string;
  userId?: string | null; // Optional user account link
  mrn: string; // Medical Record Number - unique per hospital
  firstName: string;
  lastName: string;
  dateOfBirth: Date | string;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  bookingLockVersion?: number;
  isDeleted: boolean; // Soft delete flag (EMR records are immutable / never hard deleted)
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type AppointmentStatus =
  'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type AppointmentType = 'ROUTINE' | 'EMERGENCY' | 'FOLLOW_UP' | 'TELEMEDICINE';

export interface IAppointment {
  _id?: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  departmentId?: string;
  startTime: Date | string;
  endTime: Date | string;
  status: AppointmentStatus;
  type: AppointmentType;
  isEmergency?: boolean;
  reason?: string;
  cancellationReason?: string;
  isCancelled?: boolean;
  statusHistory?: Array<{
    status: AppointmentStatus;
    changedBy: string;
    changedAt: Date | string;
    reason?: string;
  }>;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

// EMR Types (Day 11 & Day 12)
export type EncounterStatus = 'OPEN' | 'SIGNED' | 'AMENDED';
export type VitalsBmiCategory = 'UNDERWEIGHT' | 'NORMAL' | 'OVERWEIGHT' | 'OBESE';
export type SymptomSeverity = 'MILD' | 'MODERATE' | 'SEVERE';

export interface IVitals {
  systolicBp: number;
  diastolicBp: number;
  pulseRate: number;
  temperatureF: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  heightCm: number;
  weightKg: number;
  bmi?: number;
  bmiCategory?: VitalsBmiCategory;
  abnormalFlags?: string[];
}

export interface ISymptom {
  name: string;
  severity: SymptomSeverity;
  onsetDate?: string | Date;
  duration?: string;
  notes?: string;
}

export interface IEncounterAddendum {
  authorId: string;
  authorRole: string;
  authorName: string;
  amendmentReason: string;
  notes: string;
  createdAt: string | Date;
}

export interface IClinicalRevision {
  revisionNumber: number;
  authorId: string;
  authorRole: string;
  authorName?: string;
  reasonForChange: string;
  previousSnapshot: Record<string, any>;
  revisedSnapshot?: Record<string, any>;
  changedFields: string[];
  createdAt: string | Date;
}

export interface IEncounter {
  _id?: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  status: EncounterStatus;
  chiefComplaint: string;
  vitals?: IVitals;
  symptoms?: ISymptom[];
  historyOfPresentIllness?: string;
  clinicalNotes?: string;
  assessment?: string;
  diagnoses?: IDiagnosis[];
  treatmentPlan?: ITreatmentPlan;
  signedAt?: string | Date | null;
  signedBy?: string | null;
  addenda?: IEncounterAddendum[];
  revisions?: IClinicalRevision[];
  originalRecord?: Record<string, any>;
  currentClinicalView?: Record<string, any>;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// Day 12 Clinical History Types
export type DiagnosisType = 'DIFFERENTIAL' | 'CONFIRMED';
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';

export interface IDiagnosis {
  code: string; // ICD-10
  description: string;
  type: DiagnosisType;
  diagnosedAt: string | Date;
  diagnosedBy: string;
  notes?: string;
}

export interface ITreatmentPlan {
  instructions: string;
  prescriptions?: Array<{
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions?: string;
  }>;
  followUpDate?: string | Date;
  lifestyleRecommendations?: string[];
}

// =========================================================================
// Day 13: Prescription & Medicine Types
// =========================================================================
export type MedicineDosageForm = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'topical';
export type PrescriptionFrequency = 'OD' | 'BD' | 'TDS' | 'QID' | 'SOS';
export type PrescriptionStatus = 'ISSUED' | 'DISPENSED' | 'CANCELLED' | 'AMENDED';

export interface IMedicine {
  _id?: string;
  hospitalId: string;
  name: string;
  genericName: string;
  category: string;
  dosageForm: MedicineDosageForm;
  strength: string;
  unitPrice: number;
  reorderLevel: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IPrescriptionItem {
  medicineId?: string;
  medicineName: string;
  form: MedicineDosageForm;
  dosage: string;
  frequency: PrescriptionFrequency;
  durationDays: number;
  specialInstructions?: string;
}

export interface IPrescriptionAmendment {
  amendmentNumber: number;
  previousItems: IPrescriptionItem[];
  revisedItems: IPrescriptionItem[];
  authorId: string;
  authorRole: string;
  authorName: string;
  reason: string;
  amendedAt: string | Date;
}

export interface IPrescription {
  _id?: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  encounterId: string;
  diagnosis?: string;
  items: IPrescriptionItem[];
  notes?: string;
  status: PrescriptionStatus;
  signatureUrl?: string; // Digital signature asset URL
  digitalSignature?: string;
  signedAt?: string | Date;
  signedBy?: string;
  amendments?: IPrescriptionAmendment[];
  issuedAt: string | Date;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IAuditLog {
  _id?: string;
  hospitalId?: string | null;
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  diff?: { before?: any; after?: any };
  timestamp: string | Date;
}

export interface IAllergy {
  _id?: string;
  hospitalId: string;
  patientId: string;
  allergen: string;
  reaction: string;
  severity: AllergySeverity;
  isAdverseDrugReaction: boolean;
  diagnosedDate?: string | Date;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IVaccination {
  _id?: string;
  hospitalId: string;
  patientId: string;
  vaccineName: string;
  batchNumber?: string;
  administeredDate: string | Date;
  administeredBy?: string;
  nextDueDate?: string | Date;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IFamilyHistory {
  _id?: string;
  hospitalId: string;
  patientId: string;
  relationship: string;
  condition: string;
  hasDiabetes?: boolean;
  hasHypertension?: boolean;
  hasCancer?: boolean;
  hasCardiacDisease?: boolean;
  notes?: string;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface HealthCheckData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  environment: string;
  database: {
    status: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
    readyState: number;
    host?: string;
    name?: string;
  };
}

// ==========================================
// Laboratory Diagnostic System Types (Day 15 & 16)
// ==========================================

export type LabTestCategory =
  | 'Hematology'
  | 'Biochemistry'
  | 'Microbiology'
  | 'Pathology'
  | 'Immunology'
  | 'Radiology'
  | 'Other';

export type LabSampleType =
  'Blood' | 'Serum' | 'Plasma' | 'Urine' | 'Sputum' | 'Stool' | 'Swab' | 'Tissue' | 'CSF' | 'Other';

export type LabOrderPriority = 'ROUTINE' | 'URGENT' | 'STAT';

export type LabOrderStatus =
  'ORDERED' | 'SAMPLE_COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ILabTestReferenceRange {
  parameterName: string;
  unit: string;
  minNormal?: number;
  maxNormal?: number;
  textRange?: string; // e.g. "Negative", "< 5.7"
  genderSpecific?: 'MALE' | 'FEMALE' | 'ALL';
  ageMinYears?: number;
  ageMaxYears?: number;
}

export interface ILabTest {
  _id?: string;
  hospitalId: string;
  code: string;
  name: string;
  category: LabTestCategory;
  sampleType: LabSampleType;
  turnaroundTimeHours: number;
  price: number;
  referenceRanges: ILabTestReferenceRange[];
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ILabOrderItem {
  testId: string;
  testCode: string;
  testName: string;
  sampleType: LabSampleType;
  status: LabOrderStatus;
  collectedAt?: string | Date;
  collectedBy?: string;
}

export interface ILabOrder {
  _id?: string;
  hospitalId: string;
  patientId: string;
  doctorId: string;
  encounterId?: string;
  orderNumber: string;
  tests: ILabOrderItem[];
  priority: LabOrderPriority;
  clinicalNotes?: string;
  status: LabOrderStatus;
  orderedAt: string | Date;
  sampleCollectedAt?: string | Date;
  sampleCollectedBy?: string;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type LabResultStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type AbnormalFlag =
  'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';

export interface ILabParameterResult {
  parameterName: string;
  value: number | string;
  unit: string;
  referenceRangeMin?: number;
  referenceRangeMax?: number;
  textRange?: string;
  isAbnormal: boolean;
  abnormalFlag: AbnormalFlag;
  notes?: string;
}

export interface ILabResult {
  _id?: string;
  hospitalId: string;
  orderId: string;
  testId: string;
  patientId: string;
  technicianId: string;
  results: ILabParameterResult[];
  technicianNotes?: string;
  status: LabResultStatus;
  submittedAt?: string | Date;
  reviewedBy?: string;
  reviewedAt?: string | Date;
  reviewNotes?: string;
  pdfAttachmentUrl?: string;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

// ==========================================
// Pharmacy & Inventory Management Types (Day 17)
// ==========================================

export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'QUARANTINED' | 'DEPLETED';

export interface IInventoryBatch {
  _id?: string;
  hospitalId: string;
  medicineId: string;
  medicineName?: string;
  batchNumber: string;
  expiryDate: string | Date;
  manufactureDate?: string | Date;
  quantityReceived: number;
  quantityAvailable: number;
  unitCost: number;
  mrp: number;
  status: BatchStatus;
  reorderThreshold: number;
  locationRack?: string;
  supplier?: string;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IDispensedBatchAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  mrp: number;
  expiryDate: string | Date;
}

export interface IDispenseItemResult {
  medicineId: string;
  medicineName: string;
  requestedQuantity: number;
  dispensedQuantity: number;
  allocatedBatches: IDispensedBatchAllocation[];
  totalItemPrice: number;
}

export interface IDispenseReceipt {
  prescriptionId: string;
  patientId: string;
  hospitalId: string;
  dispensedBy: string;
  dispensedAt: string | Date;
  items: IDispenseItemResult[];
  grandTotal: number;
  notes?: string;
}
