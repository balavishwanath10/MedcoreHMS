import mongoose from 'mongoose';
import { env } from '../src/server/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/server/config/database.js';
import { logger } from '../src/server/utils/logger.js';
import { Hospital } from '../src/server/models/Hospital.js';
import { User } from '../src/server/models/User.js';
import { Department } from '../src/server/models/Department.js';
import { DoctorProfile } from '../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../src/server/models/PatientProfile.js';

export async function runSeed(): Promise<{ success: boolean; counts: Record<string, number> }> {
  logger.info('--- Commencing MedCoreHMS Development Seed ---');

  const connection = await connectDatabase();
  if (!connection) {
    logger.warn('MongoDB connection is unavailable. Cannot run database seed.');
    return { success: false, counts: {} };
  }

  const counts: Record<string, number> = {
    hospitalsCreated: 0,
    usersCreated: 0,
    departmentsCreated: 0,
    doctorsCreated: 0,
    patientsCreated: 0,
  };

  try {
    // 1. Seed Global Super Admin
    const existingSuperAdmin = await User.findOne({ email: 'superadmin@medcorehms.local' });
    if (!existingSuperAdmin) {
      await User.create({
        hospitalId: null,
        email: 'superadmin@medcorehms.local',
        passwordHash: '$2b$10$demo_hash_development_only_not_for_production',
        role: 'SUPER_ADMIN',
        firstName: 'System',
        lastName: 'SuperAdmin',
        status: 'ACTIVE',
        isEmailVerified: true,
      });
      counts.usersCreated++;
      logger.info('Created Super Admin account');
    }

    // 2. Seed Hospital Tenant A: Metro Health
    let hospitalA = await Hospital.findOne({ code: 'METRO' });
    if (!hospitalA) {
      hospitalA = await Hospital.create({
        name: 'Metro Health General Hospital',
        code: 'METRO',
        slug: 'metro-health-general',
        email: 'contact@metrohealth.local',
        phone: '+1-555-0100',
        address: {
          street: '100 Medical Center Blvd',
          city: 'Metropolis',
          state: 'NY',
          postalCode: '10001',
          country: 'USA',
        },
        licenseNumber: 'HOSP-LIC-METRO-001',
        status: 'ACTIVE',
        settings: {
          timezone: 'America/New_York',
          currency: 'USD',
          appointmentSlotDurationMinutes: 30,
          allowPatientPortalRegistration: true,
        },
      });
      counts.hospitalsCreated++;
      logger.info('Created Hospital Tenant: Metro Health');
    }

    // 3. Seed Hospital Tenant B: St. Jude Community
    let hospitalB = await Hospital.findOne({ code: 'STJUDE' });
    if (!hospitalB) {
      hospitalB = await Hospital.create({
        name: 'St. Jude Community Hospital',
        code: 'STJUDE',
        slug: 'st-jude-community',
        email: 'info@stjude.local',
        phone: '+1-555-0200',
        address: {
          street: '500 Hope Avenue',
          city: 'Star City',
          state: 'CA',
          postalCode: '90210',
          country: 'USA',
        },
        licenseNumber: 'HOSP-LIC-STJUDE-002',
        status: 'ACTIVE',
        settings: {
          timezone: 'America/Los_Angeles',
          currency: 'USD',
          appointmentSlotDurationMinutes: 20,
          allowPatientPortalRegistration: true,
        },
      });
      counts.hospitalsCreated++;
      logger.info('Created Hospital Tenant: St. Jude');
    }

    // 4. Seed Departments for Hospital A
    const deptAData = [
      { name: 'Cardiology', code: 'CARD', description: 'Cardiac care and diagnostics' },
      { name: 'Pediatrics', code: 'PED', description: 'Children medical care' },
      { name: 'Emergency', code: 'EMERG', description: '24/7 Acute trauma care' },
    ];

    for (const d of deptAData) {
      const exists = await Department.findOne({ hospitalId: hospitalA._id, code: d.code });
      if (!exists) {
        await Department.create({
          hospitalId: hospitalA._id,
          name: d.name,
          code: d.code,
          description: d.description,
          isActive: true,
        });
        counts.departmentsCreated++;
      }
    }

    // 5. Seed Departments for Hospital B (demonstrates intra-tenant namespace autonomy)
    const deptBData = [
      { name: 'Cardiology', code: 'CARD', description: 'St. Jude Heart Institute' },
      { name: 'General Medicine', code: 'GENMED', description: 'Primary outpatient consultations' },
    ];

    for (const d of deptBData) {
      const exists = await Department.findOne({ hospitalId: hospitalB._id, code: d.code });
      if (!exists) {
        await Department.create({
          hospitalId: hospitalB._id,
          name: d.name,
          code: d.code,
          description: d.description,
          isActive: true,
        });
        counts.departmentsCreated++;
      }
    }

    // 6. Seed Doctor for Hospital A
    const doctorAEmail = 'dr.chen@metrohealth.local';
    let doctorAUser = await User.findOne({ email: doctorAEmail });
    if (!doctorAUser) {
      doctorAUser = await User.create({
        hospitalId: hospitalA._id,
        email: doctorAEmail,
        passwordHash: '$2b$10$demo_hash_development_only_not_for_production',
        role: 'DOCTOR',
        firstName: 'Sarah',
        lastName: 'Chen',
        phone: '+1-555-0101',
        status: 'ACTIVE',
        isEmailVerified: true,
      });
      counts.usersCreated++;
    }

    const cardDeptA = await Department.findOne({ hospitalId: hospitalA._id, code: 'CARD' });
    if (cardDeptA) {
      const existingDocProfile = await DoctorProfile.findOne({ userId: doctorAUser._id });
      if (!existingDocProfile) {
        await DoctorProfile.create({
          hospitalId: hospitalA._id,
          userId: doctorAUser._id,
          departmentId: cardDeptA._id,
          licenseNumber: 'MD-LIC-NY-98765',
          specialization: 'Interventional Cardiology',
          qualifications: ['MD', 'FACC'],
          experienceYears: 12,
          consultationFee: 250,
          isActive: true,
        });
        counts.doctorsCreated++;
      }
    }

    // 7. Seed Patients for Hospital A and B (demonstrates MRN isolation)
    const patientA = await PatientProfile.findOne({ hospitalId: hospitalA._id, mrn: 'MRN-1001' });
    if (!patientA) {
      await PatientProfile.create({
        hospitalId: hospitalA._id,
        mrn: 'MRN-1001',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1985-06-15'),
        gender: 'MALE',
        bloodGroup: 'O+',
        phone: '+1-555-0301',
        email: 'john.doe.demo@example.com',
        emergencyContact: {
          name: 'Jane Doe',
          relationship: 'Spouse',
          phone: '+1-555-0302',
        },
        address: {
          street: '123 Elm Street',
          city: 'Metropolis',
          state: 'NY',
          postalCode: '10002',
          country: 'USA',
        },
      });
      counts.patientsCreated++;
    }

    // Identical MRN-1001 in Hospital B (proves multi-tenant uniqueness without collision)
    const patientB = await PatientProfile.findOne({ hospitalId: hospitalB._id, mrn: 'MRN-1001' });
    if (!patientB) {
      await PatientProfile.create({
        hospitalId: hospitalB._id,
        mrn: 'MRN-1001',
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: new Date('1990-11-20'),
        gender: 'FEMALE',
        bloodGroup: 'A+',
        phone: '+1-555-0401',
        email: 'alice.smith.demo@example.com',
        emergencyContact: {
          name: 'Bob Smith',
          relationship: 'Father',
          phone: '+1-555-0402',
        },
        address: {
          street: '456 Oak Avenue',
          city: 'Star City',
          state: 'CA',
          postalCode: '90211',
          country: 'USA',
        },
      });
      counts.patientsCreated++;
    }

    logger.info('Seed completed successfully', counts);
    return { success: true, counts };
  } catch (error) {
    logger.error('Error during database seed', { error: (error as Error).message });
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

// Allow standalone script execution via tsx
if (process.argv[1]?.endsWith('seed.ts')) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
