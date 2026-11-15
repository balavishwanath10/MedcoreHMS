import { z } from 'zod';
import { ALL_ROLES } from '../constants/roles.js';

export const addressSchema = z.object({
  street: z.string().trim().min(2, 'Street must be at least 2 characters'),
  city: z.string().trim().min(2, 'City must be at least 2 characters'),
  state: z.string().trim().min(2, 'State must be at least 2 characters'),
  postalCode: z.string().trim().min(3, 'Postal code must be at least 3 characters'),
  country: z.string().trim().min(2, 'Country must be at least 2 characters'),
});

export const hospitalCreateSchema = z.object({
  name: z.string().trim().min(2, 'Hospital name must be at least 2 characters').max(100),
  code: z
    .string()
    .trim()
    .min(2, 'Hospital code must be at least 2 characters')
    .max(10)
    .toUpperCase(),
  email: z.string().trim().email('Invalid hospital email address'),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
  address: addressSchema,
  licenseNumber: z.string().trim().min(3, 'License number is required'),
  taxId: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ONBOARDING', 'INACTIVE']).default('ONBOARDING'),
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
