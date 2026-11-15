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
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
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
  isDeleted: boolean; // Soft delete flag (EMR records are immutable / never hard deleted)
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
