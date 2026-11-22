import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Hospital } from '../../src/server/models/Hospital.js';
import { User } from '../../src/server/models/User.js';
import { Department } from '../../src/server/models/Department.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { DoctorAvailability } from '../../src/server/models/DoctorAvailability.js';
import { Appointment } from '../../src/server/models/Appointment.js';

describe('Real MongoDB Replica-Set Booking Concurrency Integration Tests', () => {
  let isConnectedToReplicaSet = false;
  let testHospitalId: mongoose.Types.ObjectId | null = null;
  let testDoctor1Id: mongoose.Types.ObjectId | null = null;
  let testDoctor2Id: mongoose.Types.ObjectId | null = null;
  let testPatient1Id: mongoose.Types.ObjectId | null = null;
  let testPatient2Id: mongoose.Types.ObjectId | null = null;
  let patientUserId: mongoose.Types.ObjectId | null = null;
  let doctor1UserId: mongoose.Types.ObjectId | null = null;
  let doctor2UserId: mongoose.Types.ObjectId | null = null;

  let patientToken: string = '';
  let receptionistToken: string = '';

  const testSuffix = Date.now().toString();

  beforeAll(async () => {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_TEST_URI;
    if (!mongoUri) {
      console.log(
        '[SKIP: Real MongoDB Replica Set not connected. Set MONGODB_URI to an active replica set to execute live concurrency integration tests.]',
      );
      return;
    }

    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
      }

      if (mongoose.connection.readyState === 1) {
        const adminDb = mongoose.connection.db?.admin();
        if (adminDb) {
          try {
            const serverStatus: any = await adminDb.command({ hello: 1 });
            isConnectedToReplicaSet = Boolean(serverStatus.setName || serverStatus.hosts);
          } catch {
            const isMasterStatus: any = await adminDb.command({ isMaster: 1 });
            isConnectedToReplicaSet = Boolean(isMasterStatus.setName || isMasterStatus.hosts);
          }
        }
      }

      if (!isConnectedToReplicaSet) {
        console.log('[SKIP: Connected MongoDB instance is not a replica set. Transactions required.]');
        return;
      }

      // Synchronize indexes on live replica set
      await Promise.all([
        Hospital.syncIndexes(),
        User.syncIndexes(),
        Department.syncIndexes(),
        DoctorProfile.syncIndexes(),
        PatientProfile.syncIndexes(),
        DoctorAvailability.syncIndexes(),
        Appointment.syncIndexes(),
      ]);

      // Create test hospital tenant
      const hospital = await Hospital.create({
        name: `Replica Concurrency Test Hospital ${testSuffix}`,
        code: `HOSP-REP-${testSuffix.slice(-6)}`,
        licenseNumber: `LIC-REP-${testSuffix.slice(-6)}`,
        email: `replica-${testSuffix}@hospital.test`,
        phone: '555-0199',
        address: { street: '100 Replica Way', city: 'Test City', state: 'TS', postalCode: '99999', country: 'USA' },
        status: 'ACTIVE',
      });
      testHospitalId = hospital._id;

      const dept = await Department.create({
        hospitalId: testHospitalId,
        name: 'General Medicine Replica',
        code: `GEN-REP-${testSuffix.slice(-4)}`,
        isActive: true,
      });

      // Doctor 1
      const docUser1 = await User.create({
        hospitalId: testHospitalId,
        email: `doc1-${testSuffix}@hospital.test`,
        passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
        role: 'DOCTOR',
      });
      doctor1UserId = docUser1._id;

      const doctor1 = await DoctorProfile.create({
        hospitalId: testHospitalId,
        userId: doctor1UserId,
        departmentId: dept._id,
        licenseNumber: `DOC-REP1-${testSuffix.slice(-6)}`,
        specialization: 'Internal Medicine',
        qualifications: ['MD'],
        experienceYears: 10,
        consultationFee: 150,
        isActive: true,
      });
      testDoctor1Id = doctor1._id;

      // Doctor 2
      const docUser2 = await User.create({
        hospitalId: testHospitalId,
        email: `doc2-${testSuffix}@hospital.test`,
        passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
        role: 'DOCTOR',
      });
      doctor2UserId = docUser2._id;

      const doctor2 = await DoctorProfile.create({
        hospitalId: testHospitalId,
        userId: doctor2UserId,
        departmentId: dept._id,
        licenseNumber: `DOC-REP2-${testSuffix.slice(-6)}`,
        specialization: 'Cardiology',
        qualifications: ['MD'],
        experienceYears: 12,
        consultationFee: 200,
        isActive: true,
      });
      testDoctor2Id = doctor2._id;

      // Weekly availability for both doctors
      await DoctorAvailability.create([
        {
          hospitalId: testHospitalId,
          doctorId: testDoctor1Id,
          dayOfWeek: 1, // Monday
          startTime: '08:00',
          endTime: '18:00',
          slotDurationMinutes: 30,
          isAvailable: true,
        },
        {
          hospitalId: testHospitalId,
          doctorId: testDoctor2Id,
          dayOfWeek: 1, // Monday
          startTime: '08:00',
          endTime: '18:00',
          slotDurationMinutes: 30,
          isAvailable: true,
        },
      ]);

      // Patient User (Account)
      const patUser = await User.create({
        hospitalId: testHospitalId,
        email: `patient-${testSuffix}@hospital.test`,
        passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
        role: 'PATIENT',
      });
      patientUserId = patUser._id;

      // Sibling Patient Profile 1 (Primary)
      const patient1 = await PatientProfile.create({
        hospitalId: testHospitalId,
        userId: patientUserId,
        mrn: `MRN-P1-${testSuffix.slice(-5)}`,
        firstName: 'Primary',
        lastName: 'Patient',
        dateOfBirth: new Date('1985-05-15'),
        gender: 'MALE',
        bloodGroup: 'O+',
        phone: '555-0188',
        emergencyContact: { name: 'Kin', relationship: 'Spouse', phone: '555-0189' },
        address: { street: '200 Test St', city: 'Test City', state: 'TS', postalCode: '99999', country: 'USA' },
      });
      testPatient1Id = patient1._id;

      // Sibling Patient Profile 2 (Dependent under same user account)
      const patient2 = await PatientProfile.create({
        hospitalId: testHospitalId,
        userId: patientUserId,
        mrn: `MRN-P2-${testSuffix.slice(-5)}`,
        firstName: 'Dependent',
        lastName: 'Patient',
        dateOfBirth: new Date('2018-09-20'),
        gender: 'FEMALE',
        bloodGroup: 'O+',
        phone: '555-0188',
        emergencyContact: { name: 'Parent', relationship: 'Parent', phone: '555-0189' },
        address: { street: '200 Test St', city: 'Test City', state: 'TS', postalCode: '99999', country: 'USA' },
      });
      testPatient2Id = patient2._id;

      // Generate tokens
      patientToken = generateAccessToken({
        userId: patientUserId.toString(),
        email: `patient-${testSuffix}@hospital.test`,
        role: 'PATIENT',
        hospitalId: testHospitalId.toString(),
      });

      receptionistToken = generateAccessToken({
        userId: new mongoose.Types.ObjectId().toString(),
        email: `receptionist-${testSuffix}@hospital.test`,
        role: 'RECEPTIONIST',
        hospitalId: testHospitalId.toString(),
      });
    } catch (setupErr: any) {
      console.warn('Real replica set setup failed or skipped:', setupErr.message);
    }
  });

  afterAll(async () => {
    if (isConnectedToReplicaSet && testHospitalId) {
      await Promise.all([
        Hospital.deleteOne({ _id: testHospitalId }),
        Department.deleteMany({ hospitalId: testHospitalId }),
        DoctorProfile.deleteMany({ hospitalId: testHospitalId }),
        PatientProfile.deleteMany({ hospitalId: testHospitalId }),
        DoctorAvailability.deleteMany({ hospitalId: testHospitalId }),
        Appointment.deleteMany({ hospitalId: testHospitalId }),
        User.deleteMany({ hospitalId: testHospitalId }),
      ]);
    }
  });

  // -------------------------------------------------------------------------
  // 1. Simultaneous requests for same doctor exact slot
  // -------------------------------------------------------------------------
  it('Simultaneous API requests for the same doctor and exact time slot — exactly one succeeds', async () => {
    if (!isConnectedToReplicaSet) {
      console.log('Skipping real replica-set concurrency test: No live replica set connected.');
      return;
    }

    // Schedule 7 days in future on Monday
    const targetSlotStart = new Date(Date.now() + 7 * 86400000);
    // Find next Monday
    const day = targetSlotStart.getDay();
    const diff = (1 + 7 - day) % 7 || 7;
    targetSlotStart.setDate(targetSlotStart.getDate() + diff);
    targetSlotStart.setHours(10, 0, 0, 0);
    const targetSlotEnd = new Date(targetSlotStart.getTime() + 30 * 60000);

    const body1 = {
      patientId: testPatient1Id!.toString(),
      doctorId: testDoctor1Id!.toString(),
      startTime: targetSlotStart.toISOString(),
      endTime: targetSlotEnd.toISOString(),
      reason: 'Patient 1 simultaneous checkup request',
    };

    const body2 = {
      patientId: testPatient2Id!.toString(),
      doctorId: testDoctor1Id!.toString(),
      startTime: targetSlotStart.toISOString(),
      endTime: targetSlotEnd.toISOString(),
      reason: 'Patient 2 simultaneous checkup request',
    };

    // Invoke actual appointment booking controller via Express API simultaneously
    const [res1, res2] = await Promise.all([
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: body1,
      }),
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: body2,
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    expect(statusCodes).toEqual([201, 409]);

    const conflictResponse = res1.statusCode === 409 ? res1 : res2;
    expect(conflictResponse.body.success).toBe(false);
    expect(
      ['DOCTOR_DOUBLE_BOOKING', 'PATIENT_OVERLAPPING_APPOINTMENT'].includes(
        conflictResponse.body.error?.code,
      ),
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2. Simultaneous requests for same doctor with partial interval overlap
  // -------------------------------------------------------------------------
  it('Simultaneous API requests for the same doctor with partial interval overlap — exactly one succeeds', async () => {
    if (!isConnectedToReplicaSet) {
      console.log('Skipping real replica-set partial overlap test: No live replica set connected.');
      return;
    }

    const slotStart1 = new Date(Date.now() + 14 * 86400000);
    const day = slotStart1.getDay();
    const diff = (1 + 7 - day) % 7 || 7;
    slotStart1.setDate(slotStart1.getDate() + diff);
    slotStart1.setHours(11, 0, 0, 0); // 11:00
    const slotEnd1 = new Date(slotStart1.getTime() + 30 * 60000); // 11:30

    // Overlapping slot: 11:15 to 11:45
    const slotStart2 = new Date(slotStart1.getTime() + 15 * 60000); // 11:15
    const slotEnd2 = new Date(slotStart2.getTime() + 30 * 60000); // 11:45

    const [res1, res2] = await Promise.all([
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: {
          patientId: testPatient1Id!.toString(),
          doctorId: testDoctor1Id!.toString(),
          startTime: slotStart1.toISOString(),
          endTime: slotEnd1.toISOString(),
          reason: 'Slot 1: 11:00 - 11:30',
        },
      }),
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: {
          patientId: testPatient2Id!.toString(),
          doctorId: testDoctor1Id!.toString(),
          startTime: slotStart2.toISOString(),
          endTime: slotEnd2.toISOString(),
          reason: 'Slot 2 (Overlapping): 11:15 - 11:45',
        },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    expect(statusCodes).toEqual([201, 409]);

    const conflictResponse = res1.statusCode === 409 ? res1 : res2;
    expect(conflictResponse.body.error?.code).toBe('DOCTOR_DOUBLE_BOOKING');
  });

  // -------------------------------------------------------------------------
  // 3. Simultaneous requests for same patient across sibling profiles
  // -------------------------------------------------------------------------
  it('Simultaneous API requests for same patient across sibling profiles for overlapping times with different doctors — exactly one succeeds', async () => {
    if (!isConnectedToReplicaSet) {
      console.log('Skipping real replica-set cross-profile test: No live replica set connected.');
      return;
    }

    const slotStart = new Date(Date.now() + 21 * 86400000);
    const day = slotStart.getDay();
    const diff = (1 + 7 - day) % 7 || 7;
    slotStart.setDate(slotStart.getDate() + diff);
    slotStart.setHours(14, 0, 0, 0); // 14:00
    const slotEnd = new Date(slotStart.getTime() + 30 * 60000); // 14:30

    // Sibling profile 1 books Doctor 1 at 14:00 - 14:30
    // Sibling profile 2 books Doctor 2 at 14:15 - 14:45 (partially overlapping)
    const overlapSlotStart = new Date(slotStart.getTime() + 15 * 60000); // 14:15
    const overlapSlotEnd = new Date(overlapSlotStart.getTime() + 30 * 60000); // 14:45

    const [res1, res2] = await Promise.all([
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: testPatient1Id!.toString(),
          doctorId: testDoctor1Id!.toString(), // Doctor 1
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          reason: 'Primary profile consultation',
        },
      }),
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: testPatient2Id!.toString(),
          doctorId: testDoctor2Id!.toString(), // Doctor 2 (different doctor!)
          startTime: overlapSlotStart.toISOString(),
          endTime: overlapSlotEnd.toISOString(),
          reason: 'Sibling profile consultation during overlapping time',
        },
      }),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    expect(statusCodes).toEqual([201, 409]);

    const conflictResponse = res1.statusCode === 409 ? res1 : res2;
    expect(conflictResponse.body.error?.code).toBe('PATIENT_OVERLAPPING_APPOINTMENT');
  });
});
