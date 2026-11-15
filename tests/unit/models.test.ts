import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Hospital } from '../../src/server/models/Hospital.js';
import { User } from '../../src/server/models/User.js';
import { Department } from '../../src/server/models/Department.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';

describe('Foundational Mongoose Models Unit Tests', () => {
  const dummyHospitalId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyDeptId = new mongoose.Types.ObjectId();

  describe('Hospital Model Schema & Validation', () => {
    it('should validate a valid hospital document successfully', () => {
      const hospital = new Hospital({
        name: 'General Hospital',
        code: 'GENHOSP',
        slug: 'general-hospital',
        email: 'info@genhosp.com',
        phone: '123-456-7890',
        address: {
          street: '100 Main St',
          city: 'Metropolis',
          state: 'NY',
          postalCode: '10001',
          country: 'USA',
        },
        licenseNumber: 'LIC-12345',
        status: 'ACTIVE',
      });

      const err = hospital.validateSync();
      expect(err).toBeUndefined();
      expect(hospital.code).toBe('GENHOSP');
    });

    it('should fail validation when required fields are missing', () => {
      const hospital = new Hospital({
        name: 'Incomplete Hospital',
      });

      const err = hospital.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors.code).toBeDefined();
      expect(err?.errors.slug).toBeDefined();
      expect(err?.errors.email).toBeDefined();
      expect(err?.errors.phone).toBeDefined();
      expect(err?.errors.licenseNumber).toBeDefined();
    });

    it('should reject invalid hospital status enum value', () => {
      const hospital = new Hospital({
        name: 'Bad Status Hospital',
        code: 'BADSTAT',
        slug: 'bad-status',
        email: 'test@hospital.com',
        phone: '123-456-7890',
        licenseNumber: 'LIC-999',
        status: 'INVALID_STATUS',
      });

      const err = hospital.validateSync();
      expect(err?.errors.status).toBeDefined();
    });
  });

  describe('User Model Schema & Security Safeguards', () => {
    it('should validate a valid hospital-scoped user', () => {
      const user = new User({
        hospitalId: dummyHospitalId,
        email: 'doctor@metro.local',
        passwordHash: '$2b$10$hashed_password_string_example',
        role: 'DOCTOR',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '555-0101',
        status: 'ACTIVE',
      });

      const err = user.validateSync();
      expect(err).toBeUndefined();
    });

    it('should allow SUPER_ADMIN with null hospitalId', () => {
      const superAdmin = new User({
        hospitalId: null,
        email: 'superadmin@medcore.local',
        passwordHash: '$2b$10$hashed_password_string_example',
        role: 'SUPER_ADMIN',
        firstName: 'System',
        lastName: 'Admin',
      });

      const err = superAdmin.validateSync();
      expect(err).toBeUndefined();
    });

    it('should reject hospital-scoped roles when hospitalId is missing or null', () => {
      const doctor = new User({
        hospitalId: null, // Invalid for DOCTOR role
        email: 'doctor.orphan@example.com',
        passwordHash: '$2b$10$hashed_password_string_example',
        role: 'DOCTOR',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      const err = doctor.validateSync();
      expect(err?.errors.hospitalId).toBeDefined();
      expect(err?.errors.hospitalId.message).toContain('hospitalId is required');
    });

    it('should reject invalid email format', () => {
      const user = new User({
        hospitalId: dummyHospitalId,
        email: 'not-an-email',
        passwordHash: 'hash',
        role: 'NURSE',
        firstName: 'Mary',
        lastName: 'Nurse',
      });

      const err = user.validateSync();
      expect(err?.errors.email).toBeDefined();
    });

    it('should reject non-PRD roles', () => {
      const user = new User({
        hospitalId: dummyHospitalId,
        email: 'hacker@example.com',
        passwordHash: 'hash',
        role: 'UNAUTHORIZED_CUSTOM_ROLE',
        firstName: 'Hacker',
        lastName: 'User',
      });

      const err = user.validateSync();
      expect(err?.errors.role).toBeDefined();
    });

    it('CRITICAL SECURITY: passwordHash must be stripped from toJSON and toObject', () => {
      const user = new User({
        hospitalId: dummyHospitalId,
        email: 'secure@hospital.local',
        passwordHash: '$2b$10$secret_bcrypt_hash_that_must_never_leak',
        role: 'RECEPTIONIST',
        firstName: 'Alice',
        lastName: 'Frontdesk',
      });

      const jsonOutput = user.toJSON();
      const objOutput = user.toObject();

      expect(jsonOutput.passwordHash).toBeUndefined();
      expect(objOutput.passwordHash).toBeUndefined();
      expect(jsonOutput.email).toBe('secure@hospital.local');
    });
  });

  describe('Department Model Schema & Validation', () => {
    it('should validate a valid department document', () => {
      const dept = new Department({
        hospitalId: dummyHospitalId,
        name: 'Cardiology',
        code: 'CARD',
        description: 'Heart and cardiovascular clinic',
        isActive: true,
      });

      const err = dept.validateSync();
      expect(err).toBeUndefined();
      expect(dept.code).toBe('CARD');
    });

    it('should reject department without hospitalId', () => {
      const dept = new Department({
        name: 'Orphan Department',
        code: 'ORPH',
      });

      const err = dept.validateSync();
      expect(err?.errors.hospitalId).toBeDefined();
    });

    it('should reject department code exceeding 10 characters', () => {
      const dept = new Department({
        hospitalId: dummyHospitalId,
        name: 'Neurology Department',
        code: 'LONGDEPARTMENTCODE',
      });

      const err = dept.validateSync();
      expect(err?.errors.code).toBeDefined();
    });
  });

  describe('DoctorProfile Model Schema & Validation', () => {
    it('should validate a valid doctor profile', () => {
      const doc = new DoctorProfile({
        hospitalId: dummyHospitalId,
        userId: dummyUserId,
        departmentId: dummyDeptId,
        licenseNumber: 'MD-NY-12345',
        specialization: 'Pediatric Cardiology',
        qualifications: ['MBBS', 'MD Pediatrics', 'Fellowship Cardiology'],
        experienceYears: 10,
        consultationFee: 200,
        isActive: true,
      });

      const err = doc.validateSync();
      expect(err).toBeUndefined();
    });

    it('should reject doctor profile with negative consultation fee or experience years', () => {
      const doc = new DoctorProfile({
        hospitalId: dummyHospitalId,
        userId: dummyUserId,
        departmentId: dummyDeptId,
        licenseNumber: 'MD-999',
        specialization: 'General',
        qualifications: ['MBBS'],
        experienceYears: -5,
        consultationFee: -100,
      });

      const err = doc.validateSync();
      expect(err?.errors.experienceYears).toBeDefined();
      expect(err?.errors.consultationFee).toBeDefined();
    });

    it('should reject doctor profile with empty qualifications array', () => {
      const doc = new DoctorProfile({
        hospitalId: dummyHospitalId,
        userId: dummyUserId,
        departmentId: dummyDeptId,
        licenseNumber: 'MD-888',
        specialization: 'General',
        qualifications: [],
      });

      const err = doc.validateSync();
      expect(err?.errors.qualifications).toBeDefined();
    });
  });

  describe('PatientProfile Model Schema & Validation', () => {
    it('should validate a valid patient profile', () => {
      const patient = new PatientProfile({
        hospitalId: dummyHospitalId,
        mrn: 'MRN-2026-0001',
        firstName: 'Robert',
        lastName: 'Taylor',
        dateOfBirth: new Date('1975-04-12'),
        gender: 'MALE',
        bloodGroup: 'B+',
        phone: '555-987-6543',
        emergencyContact: {
          name: 'Sarah Taylor',
          relationship: 'Daughter',
          phone: '555-987-6544',
        },
        address: {
          street: '789 Pine Rd',
          city: 'Metropolis',
          state: 'NY',
          postalCode: '10003',
          country: 'USA',
        },
      });

      const err = patient.validateSync();
      expect(err).toBeUndefined();
      expect(patient.bloodGroup).toBe('B+');
    });

    it('should reject future date of birth', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 5);

      const patient = new PatientProfile({
        hospitalId: dummyHospitalId,
        mrn: 'MRN-FUT',
        firstName: 'Future',
        lastName: 'Person',
        dateOfBirth: futureDate,
        gender: 'FEMALE',
        phone: '555-0000',
        emergencyContact: { name: 'Contact', relationship: 'Parent', phone: '555-0001' },
        address: { street: '1 St', city: 'City', state: 'ST', postalCode: '12345', country: 'USA' },
      });

      const err = patient.validateSync();
      expect(err?.errors.dateOfBirth).toBeDefined();
      expect(err?.errors.dateOfBirth.message).toContain('cannot be in the future');
    });

    it('should reject invalid gender or blood group enums', () => {
      const patient = new PatientProfile({
        hospitalId: dummyHospitalId,
        mrn: 'MRN-BAD',
        firstName: 'Test',
        lastName: 'Patient',
        dateOfBirth: new Date('2000-01-01'),
        gender: 'NOT_A_GENDER',
        bloodGroup: 'INVALID_BLOOD',
        phone: '555-1111',
        emergencyContact: { name: 'Contact', relationship: 'Friend', phone: '555-2222' },
        address: { street: '1 St', city: 'City', state: 'ST', postalCode: '12345', country: 'USA' },
      });

      const err = patient.validateSync();
      expect(err?.errors.gender).toBeDefined();
      expect(err?.errors.bloodGroup).toBeDefined();
    });
  });
});
