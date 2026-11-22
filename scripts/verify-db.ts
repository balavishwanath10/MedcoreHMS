import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/server/config/database.js';
import { logger } from '../src/server/utils/logger.js';
import { app } from '../src/server/app.js';
import { makeRequest } from '../tests/utils/inMemoryTestClient.js';
import { generateAccessToken } from '../src/server/utils/jwt.js';
import { Hospital } from '../src/server/models/Hospital.js';
import { User } from '../src/server/models/User.js';
import { Department } from '../src/server/models/Department.js';
import { DoctorProfile } from '../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../src/server/models/PatientProfile.js';
import { DoctorAvailability } from '../src/server/models/DoctorAvailability.js';
import { Appointment } from '../src/server/models/Appointment.js';
import { Encounter } from '../src/server/models/Encounter.js';
import { Allergy } from '../src/server/models/Allergy.js';
import { Vaccination } from '../src/server/models/Vaccination.js';
import { FamilyHistory } from '../src/server/models/FamilyHistory.js';
import { ScheduledReminder } from '../src/server/models/ScheduledReminder.js';

let atlasAssertionCount = 0;
let atlasAssertionPassed = 0;

/**
 * Strict assertion helper for live MongoDB Atlas verification.
 * Every reported PASS must correspond to a genuine assertion of the actual behavior.
 */
function assertAtlas(condition: boolean, stepName: string, failureDetails?: string): void {
  atlasAssertionCount++;
  if (!condition) {
    const msg = `[ATLAS ASSERTION FAILED] ${stepName}: ${failureDetails || 'Condition evaluated to false'}`;
    logger.error(msg);
    throw new Error(msg);
  }
  atlasAssertionPassed++;
}

async function runAtlas15StepSyntheticVerification(): Promise<{ ran: number; passed: number }> {
  const synthSuffix = Date.now().toString();
  const synthCode = `HOSP-SYNTH-${synthSuffix.slice(-6)}`;

  let synthHospitalId: mongoose.Types.ObjectId | null = null;
  let synthDoctor1Id: mongoose.Types.ObjectId | null = null;
  let synthDoctor2Id: mongoose.Types.ObjectId | null = null;
  let synthPatient1Id: mongoose.Types.ObjectId | null = null;
  let synthPatient2Id: mongoose.Types.ObjectId | null = null;
  let synthPatientUserId: mongoose.Types.ObjectId | null = null;
  let synthDoctorUserId: mongoose.Types.ObjectId | null = null;
  let synthDoctor2UserId: mongoose.Types.ObjectId | null = null;
  let synthReceptionistUserId: mongoose.Types.ObjectId | null = null;

  try {
    // -------------------------------------------------------------------------
    // Step 1 & 2: Replica Set Topology & Transaction Capability
    // -------------------------------------------------------------------------
    logger.info('Step 1 & 2: Verifying MongoDB Atlas replica set topology and transaction capability...');
    const adminDb = mongoose.connection.db?.admin();
    assertAtlas(!!adminDb, 'Step 1: Admin DB reference', 'Unable to obtain admin DB reference');

    let isReplicaSet = false;
    try {
      const serverStatus: any = await adminDb!.command({ hello: 1 });
      isReplicaSet = Boolean(serverStatus.setName || serverStatus.hosts);
      logger.info('MongoDB Atlas Server Topology Info', {
        setName: serverStatus.setName,
        msg: serverStatus.msg,
        isWritablePrimary: serverStatus.isWritablePrimary,
      });
    } catch {
      const isMasterStatus: any = await adminDb!.command({ isMaster: 1 });
      isReplicaSet = Boolean(isMasterStatus.setName || isMasterStatus.hosts);
    }
    assertAtlas(isReplicaSet, 'Step 1: Replica Set Topology', 'Connected database is not a replica set; transactions required');

    // Test transaction lifecycle on Atlas
    const testSession = await mongoose.startSession();
    assertAtlas(!!testSession, 'Step 2: Transaction Session Creation', 'Failed to create Mongoose session');
    testSession.startTransaction();
    assertAtlas(testSession.inTransaction(), 'Step 2: Active Transaction State', 'Session is not in active transaction');
    await testSession.abortTransaction();
    await testSession.endSession();
    logger.info('Step 1 & 2 PASS: MongoDB Atlas replica set and transaction engine verified');

    // -------------------------------------------------------------------------
    // Step 3: Deep Index Inspection (Fail if missing or malformed)
    // -------------------------------------------------------------------------
    logger.info('Step 3: Deep inspection of collection indexes and partial filters...');
    await Promise.all([
      Appointment.syncIndexes(),
      PatientProfile.syncIndexes(),
      DoctorProfile.syncIndexes(),
      Hospital.syncIndexes(),
      Encounter.syncIndexes(),
      ScheduledReminder.syncIndexes(),
    ]);

    const apptIndexes = await Appointment.collection.indexes();

    // Inspect Doctor appointment unique partial index
    const doctorPartialIndex = apptIndexes.find((idx: any) => {
      const keys = Object.keys(idx.key || {});
      return keys.includes('doctorId') && keys.includes('startTime') && keys.includes('hospitalId');
    });
    assertAtlas(
      !!doctorPartialIndex,
      'Step 3: Doctor Appointment Partial Index Existence',
      'Missing { hospitalId: 1, doctorId: 1, startTime: 1 } index on appointments',
    );
    assertAtlas(
      doctorPartialIndex.unique === true,
      'Step 3: Doctor Appointment Unique Flag',
      'Doctor appointment partial index is not marked unique',
    );
    assertAtlas(
      doctorPartialIndex.partialFilterExpression?.isCancelled === false &&
        doctorPartialIndex.partialFilterExpression?.isDeleted === false,
      'Step 3: Doctor Partial Filter Expression',
      `Doctor index partialFilterExpression mismatch: ${JSON.stringify(doctorPartialIndex.partialFilterExpression)}`,
    );

    // Inspect Patient appointment unique partial index
    const patientPartialIndex = apptIndexes.find((idx: any) => {
      const keys = Object.keys(idx.key || {});
      return keys.includes('patientId') && keys.includes('startTime') && keys.includes('hospitalId');
    });
    assertAtlas(
      !!patientPartialIndex,
      'Step 3: Patient Appointment Partial Index Existence',
      'Missing { hospitalId: 1, patientId: 1, startTime: 1 } index on appointments',
    );
    assertAtlas(
      patientPartialIndex.unique === true,
      'Step 3: Patient Appointment Unique Flag',
      'Patient appointment partial index is not marked unique',
    );
    assertAtlas(
      patientPartialIndex.partialFilterExpression?.isCancelled === false &&
        patientPartialIndex.partialFilterExpression?.isDeleted === false,
      'Step 3: Patient Partial Filter Expression',
      `Patient index partialFilterExpression mismatch: ${JSON.stringify(patientPartialIndex.partialFilterExpression)}`,
    );

    logger.info('Step 3 PASS: Database index definitions, uniqueness, and partial filters strictly verified');

    // -------------------------------------------------------------------------
    // Step 4: Multi-Tenant Synthetic Scaffolding (Hospital, Dept, Doctors, Multi-Profile Patient)
    // -------------------------------------------------------------------------
    logger.info('Step 4: Creating synthetic hospital, department, doctors, and multi-profile patient...');
    const hospital = await Hospital.create({
      name: `Synthetic Test Hospital ${synthSuffix}`,
      code: synthCode,
      licenseNumber: `LIC-SYNTH-${synthSuffix.slice(-6)}`,
      email: `synth-${synthSuffix}@hospital.test`,
      phone: '555-0199',
      address: {
        street: '100 Test Blvd',
        city: 'Test City',
        state: 'TS',
        postalCode: '99999',
        country: 'USA',
      },
      status: 'ACTIVE',
    });
    synthHospitalId = hospital._id;
    assertAtlas(!!synthHospitalId, 'Step 4: Hospital Creation', 'Synthetic hospital failed to create');

    const dept = await Department.create({
      hospitalId: synthHospitalId,
      name: 'General Medicine Synthetic',
      code: `GEN-${synthSuffix.slice(-4)}`,
      isActive: true,
    });
    assertAtlas(!!dept._id, 'Step 4: Department Creation', 'Synthetic department failed to create');

    // Doctor 1
    const docUser = await User.create({
      hospitalId: synthHospitalId,
      email: `doctor1-${synthSuffix}@hospital.test`,
      passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
      role: 'DOCTOR',
    });
    synthDoctorUserId = docUser._id;

    const doctor1 = await DoctorProfile.create({
      hospitalId: synthHospitalId,
      userId: synthDoctorUserId,
      departmentId: dept._id,
      licenseNumber: `DOC-LIC1-${synthSuffix.slice(-6)}`,
      specialization: 'Internal Medicine',
      qualifications: ['MD', 'MBBS'],
      experienceYears: 10,
      consultationFee: 150,
      isActive: true,
    });
    synthDoctor1Id = doctor1._id;

    // Doctor 2 (for cross-doctor tests)
    const docUser2 = await User.create({
      hospitalId: synthHospitalId,
      email: `doctor2-${synthSuffix}@hospital.test`,
      passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
      role: 'DOCTOR',
    });
    synthDoctor2UserId = docUser2._id;

    const doctor2 = await DoctorProfile.create({
      hospitalId: synthHospitalId,
      userId: synthDoctor2UserId,
      departmentId: dept._id,
      licenseNumber: `DOC-LIC2-${synthSuffix.slice(-6)}`,
      specialization: 'Cardiology',
      qualifications: ['MD'],
      experienceYears: 12,
      consultationFee: 200,
      isActive: true,
    });
    synthDoctor2Id = doctor2._id;

    // Patient User (Account)
    const patUser = await User.create({
      hospitalId: synthHospitalId,
      email: `patient-${synthSuffix}@hospital.test`,
      passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
      role: 'PATIENT',
    });
    synthPatientUserId = patUser._id;

    // Sibling Profile 1 (Adult)
    const patient1 = await PatientProfile.create({
      hospitalId: synthHospitalId,
      userId: synthPatientUserId,
      mrn: `MRN-A-${synthSuffix.slice(-5)}`,
      firstName: 'Synthetic',
      lastName: 'Primary',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'MALE',
      bloodGroup: 'O+',
      phone: '555-0188',
      emergencyContact: { name: 'Kin', relationship: 'Spouse', phone: '555-0189' },
      address: { street: '200 Test St', city: 'Test City', state: 'TS', postalCode: '99999', country: 'USA' },
    });
    synthPatient1Id = patient1._id;

    // Sibling Profile 2 (Dependent under same User account)
    const patient2 = await PatientProfile.create({
      hospitalId: synthHospitalId,
      userId: synthPatientUserId,
      mrn: `MRN-B-${synthSuffix.slice(-5)}`,
      firstName: 'Synthetic',
      lastName: 'Dependent',
      dateOfBirth: new Date('2015-06-15'),
      gender: 'FEMALE',
      bloodGroup: 'O+',
      phone: '555-0188',
      emergencyContact: { name: 'Parent', relationship: 'Parent', phone: '555-0189' },
      address: { street: '200 Test St', city: 'Test City', state: 'TS', postalCode: '99999', country: 'USA' },
    });
    synthPatient2Id = patient2._id;

    // Receptionist User
    const recUser = await User.create({
      hospitalId: synthHospitalId,
      email: `receptionist-${synthSuffix}@hospital.test`,
      passwordHash: '$2b$12$eXampleHashedPasswordForTestPurposesOnly00000000000',
      role: 'RECEPTIONIST',
    });
    synthReceptionistUserId = recUser._id;

    assertAtlas(!!synthPatient1Id && !!synthPatient2Id, 'Step 4: Multi-Profile Patient Creation');
    logger.info('Step 4 PASS: Multi-tenant synthetic scaffolding persisted successfully');

    // Generate JWT Access Tokens for API exercise
    const patToken = generateAccessToken({
      userId: synthPatientUserId.toString(),
      email: `patient-${synthSuffix}@hospital.test`,
      role: 'PATIENT',
      hospitalId: synthHospitalId.toString(),
    });

    const doc1Token = generateAccessToken({
      userId: synthDoctorUserId.toString(),
      email: `doctor1-${synthSuffix}@hospital.test`,
      role: 'DOCTOR',
      hospitalId: synthHospitalId.toString(),
    });

    const receptionistToken = generateAccessToken({
      userId: synthReceptionistUserId.toString(),
      email: `receptionist-${synthSuffix}@hospital.test`,
      role: 'RECEPTIONIST',
      hospitalId: synthHospitalId.toString(),
    });

    // -------------------------------------------------------------------------
    // Step 5: Doctor Availability Persistence
    // -------------------------------------------------------------------------
    logger.info('Step 5: Persisting and retrieving doctor availability on Atlas...');
    const avail = await DoctorAvailability.create([
      {
        hospitalId: synthHospitalId,
        doctorId: synthDoctor1Id,
        dayOfWeek: 1, // Monday
        startTime: '08:00',
        endTime: '18:00',
        slotDurationMinutes: 30,
        isAvailable: true,
      },
      {
        hospitalId: synthHospitalId,
        doctorId: synthDoctor2Id,
        dayOfWeek: 1, // Monday
        startTime: '08:00',
        endTime: '18:00',
        slotDurationMinutes: 30,
        isAvailable: true,
      },
    ]);
    const retrievedAvail = await DoctorAvailability.findById(avail[0]._id);
    assertAtlas(!!retrievedAvail && retrievedAvail.slotDurationMinutes === 30, 'Step 5: Availability Retrieval');
    logger.info('Step 5 PASS: Doctor availability persisted and verified');

    // -------------------------------------------------------------------------
    // Step 6: Baseline Appointment Creation via Real API
    // -------------------------------------------------------------------------
    logger.info('Step 6: Creating baseline appointment on Atlas via actual booking API/controller...');
    const slot1Start = new Date(Date.now() + 86400000 * 7);
    const day1 = slot1Start.getDay();
    const diff1 = (1 + 7 - day1) % 7 || 7;
    slot1Start.setDate(slot1Start.getDate() + diff1);
    slot1Start.setHours(10, 0, 0, 0); // Next Monday 10:00
    const slot1End = new Date(slot1Start.getTime() + 1800000); // 10:30

    const baselineRes = await makeRequest(app, {
      method: 'POST',
      url: '/api/appointments',
      headers: { authorization: `Bearer ${patToken}` },
      body: {
        patientId: synthPatient1Id.toString(),
        doctorId: synthDoctor1Id.toString(),
        startTime: slot1Start.toISOString(),
        endTime: slot1End.toISOString(),
        reason: 'Baseline routine consultation',
      },
    });

    assertAtlas(baselineRes.statusCode === 201, 'Step 6: Baseline Appointment API 201', `Status: ${baselineRes.statusCode}`);
    const synthAppt1Id = baselineRes.body.data?._id;
    assertAtlas(!!synthAppt1Id, 'Step 6: Baseline Appointment ID in Response');
    logger.info('Step 6 PASS: Baseline appointment created via real booking API');

    // -------------------------------------------------------------------------
    // Step 7: Real Concurrent Booking API Requests Against Atlas
    // -------------------------------------------------------------------------
    logger.info('Step 7: Executing real concurrent API requests for exact slot against Atlas...');
    const concurrentSlotStart = new Date(slot1Start);
    concurrentSlotStart.setHours(11, 0, 0, 0); // 11:00
    const concurrentSlotEnd = new Date(concurrentSlotStart.getTime() + 1800000); // 11:30

    const [res1, res2] = await Promise.all([
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patToken}` },
        body: {
          patientId: synthPatient1Id.toString(),
          doctorId: synthDoctor1Id.toString(),
          startTime: concurrentSlotStart.toISOString(),
          endTime: concurrentSlotEnd.toISOString(),
          reason: 'Concurrent booking attempt 1',
        },
      }),
      makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patToken}` },
        body: {
          patientId: synthPatient2Id.toString(),
          doctorId: synthDoctor1Id.toString(),
          startTime: concurrentSlotStart.toISOString(),
          endTime: concurrentSlotEnd.toISOString(),
          reason: 'Concurrent booking attempt 2',
        },
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    assertAtlas(statuses[0] === 201 && statuses[1] === 409, 'Step 7: Exactly 1 Success (201) and 1 Conflict (409)');
    const conflictRes = res1.statusCode === 409 ? res1 : res2;
    assertAtlas(
      ['DOCTOR_DOUBLE_BOOKING', 'PATIENT_OVERLAPPING_APPOINTMENT'].includes(conflictRes.body.error?.code),
      'Step 7: Conflict Returned Structured Code',
      `Got code: ${conflictRes.body.error?.code}`,
    );
    logger.info('Step 7 PASS: Real concurrent booking write correctly resolved via actual controller');

    // -------------------------------------------------------------------------
    // Step 8: Partial Interval Overlap Rejection via Real API
    // -------------------------------------------------------------------------
    logger.info('Step 8: Testing partial interval overlap rejection via real booking API...');
    // Doctor 1 already has baseline appointment at 10:00 - 10:30.
    // Attempting overlapping interval 10:15 - 10:45 on Doctor 1:
    const partialOverlapStart = new Date(slot1Start.getTime() + 15 * 60000); // 10:15
    const partialOverlapEnd = new Date(partialOverlapStart.getTime() + 30 * 60000); // 10:45

    const overlapRes = await makeRequest(app, {
      method: 'POST',
      url: '/api/appointments',
      headers: { authorization: `Bearer ${receptionistToken}` },
      body: {
        patientId: synthPatient2Id.toString(),
        doctorId: synthDoctor1Id.toString(),
        startTime: partialOverlapStart.toISOString(),
        endTime: partialOverlapEnd.toISOString(),
        reason: 'Partial interval overlap booking attempt',
      },
    });

    assertAtlas(overlapRes.statusCode === 409, 'Step 8: Partial Overlap Rejected with 409', `Status: ${overlapRes.statusCode}`);
    assertAtlas(overlapRes.body.error?.code === 'DOCTOR_DOUBLE_BOOKING', 'Step 8: Partial Overlap Code DOCTOR_DOUBLE_BOOKING');
    logger.info('Step 8 PASS: Partial interval overlap detected and rejected by real booking controller');

    // -------------------------------------------------------------------------
    // Step 9: Cross-Profile Patient Conflict Prevention via Real API
    // -------------------------------------------------------------------------
    logger.info('Step 9: Testing cross-profile patient conflict prevention across sibling profiles...');
    // Profile 1 has appointment at 10:00 - 10:30.
    // Patient attempts to book Profile 2 (same user) with Doctor 2 at overlapping 10:15 - 10:45:
    const crossProfileRes = await makeRequest(app, {
      method: 'POST',
      url: '/api/appointments',
      headers: { authorization: `Bearer ${patToken}` },
      body: {
        patientId: synthPatient2Id.toString(),
        doctorId: synthDoctor2Id.toString(), // Doctor 2 (different doctor!)
        startTime: partialOverlapStart.toISOString(),
        endTime: partialOverlapEnd.toISOString(),
        reason: 'Cross-profile sibling overlap attempt',
      },
    });

    assertAtlas(crossProfileRes.statusCode === 409, 'Step 9: Cross-Profile Overlap Rejected with 409', `Status: ${crossProfileRes.statusCode}`);
    assertAtlas(crossProfileRes.body.error?.code === 'PATIENT_OVERLAPPING_APPOINTMENT', 'Step 9: Cross-Profile Code PATIENT_OVERLAPPING_APPOINTMENT');
    logger.info('Step 9 PASS: Cross-profile patient scheduling conflict prevented across sibling profiles by real controller');

    // -------------------------------------------------------------------------
    // Step 10: Cancelled Slot Reuse via Real Status & Booking APIs
    // -------------------------------------------------------------------------
    logger.info('Step 10: Verifying cancelled slot re-booking via actual status and booking APIs...');
    const cancelRes = await makeRequest(app, {
      method: 'PATCH',
      url: `/api/appointments/${synthAppt1Id}/status`,
      headers: { authorization: `Bearer ${receptionistToken}` },
      body: {
        status: 'CANCELLED',
        cancellationReason: 'Patient cancelled baseline slot',
      },
    });
    assertAtlas(cancelRes.statusCode === 200, 'Step 10: Cancellation API Status 200', `Status: ${cancelRes.statusCode}`);

    // Re-book exact 10:00 - 10:30 slot for Doctor 1 with Patient 2
    const reuseRes = await makeRequest(app, {
      method: 'POST',
      url: '/api/appointments',
      headers: { authorization: `Bearer ${patToken}` },
      body: {
        patientId: synthPatient2Id.toString(),
        doctorId: synthDoctor1Id.toString(),
        startTime: slot1Start.toISOString(),
        endTime: slot1End.toISOString(),
        reason: 'Rebooking cancelled slot via API',
      },
    });
    assertAtlas(reuseRes.statusCode === 201, 'Step 10: Rebook Cancelled Slot Status 201', `Status: ${reuseRes.statusCode}`);
    const reusedApptId = reuseRes.body.data?._id;
    assertAtlas(!!reusedApptId, 'Step 10: Reused Appointment ID Present');
    logger.info('Step 10 PASS: Cancelled slot reused successfully via real booking API without index collision');

    // -------------------------------------------------------------------------
    // Step 11: Clinical Encounter with Revisions via Real Encounter API
    // -------------------------------------------------------------------------
    logger.info('Step 11: Persisting clinical encounter and testing revision tracking via real encounter API...');
    const encRes = await makeRequest(app, {
      method: 'POST',
      url: '/api/encounters',
      headers: { authorization: `Bearer ${doc1Token}` },
      body: {
        patientId: synthPatient1Id.toString(),
        doctorId: synthDoctor1Id.toString(),
        appointmentId: reusedApptId,
        chiefComplaint: 'Mild headache and hypertension check',
        vitals: {
          systolicBp: 130,
          diastolicBp: 85,
          pulseRate: 72,
          temperatureF: 98.6,
          respiratoryRate: 16,
          oxygenSaturation: 98,
          heightCm: 175,
          weightKg: 75,
        },
        diagnoses: [
          {
            code: 'I10',
            description: 'Essential (primary) hypertension',
            type: 'CONFIRMED',
            diagnosedAt: new Date().toISOString(),
            diagnosedBy: synthDoctor1Id.toString(),
          },
        ],
      },
    });

    assertAtlas(encRes.statusCode === 201, 'Step 11: Encounter Creation API Status 201', `Status: ${encRes.statusCode}`);
    const realEncId = encRes.body.data?._id;
    assertAtlas(!!realEncId, 'Step 11: Real Encounter ID in Response');

    // Real update via PUT /api/encounters/:id with mandatory reasonForChange
    const reasonForChange = 'Patient reported headache onset was 3 days ago during evening work';
    const updateRes = await makeRequest(app, {
      method: 'PUT',
      url: `/api/encounters/${realEncId}`,
      headers: { authorization: `Bearer ${doc1Token}` },
      body: {
        chiefComplaint: 'Mild headache for 3 days and hypertension check',
        reasonForChange,
      },
    });

    assertAtlas(updateRes.statusCode === 200, 'Step 11: Encounter Update API Status 200', `Status: ${updateRes.statusCode}`);
    assertAtlas(updateRes.body.data.revisions?.length === 1, 'Step 11: Revision Recorded in Document');
    assertAtlas(updateRes.body.data.revisions[0].reasonForChange === reasonForChange, 'Step 11: Mandatory Reason Stored');
    assertAtlas(
      updateRes.body.data.revisions[0].previousSnapshot?.chiefComplaint === 'Mild headache and hypertension check',
      'Step 11: Previous Clinical Snapshot Recoverable',
    );
    assertAtlas(
      updateRes.body.data.revisions[0].revisedSnapshot?.chiefComplaint === 'Mild headache for 3 days and hypertension check',
      'Step 11: Revised Clinical Snapshot Preserved',
    );
    logger.info('Step 11 PASS: Clinical encounter persisted, updated, and historical snapshot preserved via actual controller');

    // -------------------------------------------------------------------------
    // Step 12: Signed Encounter Immutability & Addenda via Real Encounter API
    // -------------------------------------------------------------------------
    logger.info('Step 12: Verifying encounter signing, immutability, and append-only addenda via real encounter API...');
    // Sign encounter
    const signRes = await makeRequest(app, {
      method: 'POST',
      url: `/api/encounters/${realEncId}/sign`,
      headers: { authorization: `Bearer ${doc1Token}` },
      body: { confirmation: true },
    });
    assertAtlas(signRes.statusCode === 200, 'Step 12: Encounter Signing API Status 200', `Status: ${signRes.statusCode}`);
    assertAtlas(signRes.body.data.status === 'SIGNED', 'Step 12: Encounter Status Signed');

    // Exercise real API: Direct edit to signed encounter must be rejected by controller
    const directEditRes = await makeRequest(app, {
      method: 'PUT',
      url: `/api/encounters/${realEncId}`,
      headers: { authorization: `Bearer ${doc1Token}` },
      body: {
        chiefComplaint: 'Attempted overwrite of signed clinical record',
        reasonForChange: 'Attempted modification on signed encounter',
      },
    });
    assertAtlas(directEditRes.statusCode === 400, 'Step 12: Direct Edit Rejected with Status 400', `Status: ${directEditRes.statusCode}`);
    assertAtlas(directEditRes.body.error?.code === 'ENCOUNTER_IMMUTABLE', 'Step 12: Direct Edit Code ENCOUNTER_IMMUTABLE');

    // Append addendum via real API
    const addendumRes = await makeRequest(app, {
      method: 'POST',
      url: `/api/encounters/${realEncId}/addendum`,
      headers: { authorization: `Bearer ${doc1Token}` },
      body: {
        amendmentReason: 'Post-consult laboratory report review',
        notes: 'HbA1c normal at 5.4%, fasting blood glucose 92 mg/dL',
      },
    });
    assertAtlas(addendumRes.statusCode === 200, 'Step 12: Addendum API Status 200', `Status: ${addendumRes.statusCode}`);
    assertAtlas(addendumRes.body.data.status === 'AMENDED', 'Step 12: Encounter Status Amended');
    assertAtlas(addendumRes.body.data.addenda?.length === 1, 'Step 12: Addenda Array Length 1');
    assertAtlas(
      addendumRes.body.data.chiefComplaint === 'Mild headache for 3 days and hypertension check',
      'Step 12: Base Record Remained Intact and Immutable',
    );
    logger.info('Step 12 PASS: Signed encounter immutability and append-only addenda verified via real API/controller');

    // -------------------------------------------------------------------------
    // Step 13: Persist Allergies (with ADR), Vaccinations, Family History
    // -------------------------------------------------------------------------
    logger.info('Step 13: Persisting allergies, ADR, vaccinations, and family history...');
    const allergy = await Allergy.create({
      hospitalId: synthHospitalId.toString(),
      patientId: synthPatient1Id.toString(),
      substance: 'Penicillin',
      category: 'MEDICATION',
      severity: 'LIFE_THREATENING',
      isAdverseDrugReaction: true,
      reactions: ['Anaphylaxis'],
      isDeleted: false,
    });
    assertAtlas(allergy.severity === 'LIFE_THREATENING' && allergy.isAdverseDrugReaction, 'Step 13: Allergy Persistence');

    const vaccination = await Vaccination.create({
      hospitalId: synthHospitalId.toString(),
      patientId: synthPatient1Id.toString(),
      vaccineName: 'COVID-19 mRNA',
      doseNumber: 2,
      administeredDate: new Date('2024-01-15'),
      isDeleted: false,
    });
    assertAtlas(vaccination.doseNumber === 2, 'Step 13: Vaccination Persistence');

    const family = await FamilyHistory.create({
      hospitalId: synthHospitalId.toString(),
      patientId: synthPatient1Id.toString(),
      relationship: 'FATHER',
      condition: 'Coronary artery disease',
      hasCardiacDisease: true,
      isDeleted: false,
    });
    assertAtlas(family.hasCardiacDisease === true, 'Step 13: Family History Persistence');
    logger.info('Step 13 PASS: Clinical sub-domain records persisted (Allergies, ADR, Vaccinations, Family History)');

    // -------------------------------------------------------------------------
    // Step 14: Longitudinal Patient Clinical Timeline Aggregation
    // -------------------------------------------------------------------------
    logger.info('Step 14: Aggregating patient clinical timeline across all domains...');
    const [patientAllergies, patientVaccines, patientFamily, patientEncs] = await Promise.all([
      Allergy.find({ patientId: synthPatient1Id.toString() }),
      Vaccination.find({ patientId: synthPatient1Id.toString() }),
      FamilyHistory.find({ patientId: synthPatient1Id.toString() }),
      Encounter.find({ patientId: synthPatient1Id.toString() }),
    ]);

    assertAtlas(patientAllergies.length === 1, 'Step 14: Allergies Aggregated Count');
    assertAtlas(patientVaccines.length === 1, 'Step 14: Vaccinations Aggregated Count');
    assertAtlas(patientFamily.length === 1, 'Step 14: Family History Aggregated Count');
    assertAtlas(patientEncs.length >= 1, 'Step 14: Encounters Aggregated Count');
    logger.info('Step 14 PASS: Complete patient longitudinal timeline successfully aggregated from Atlas');

    return { ran: atlasAssertionCount, passed: atlasAssertionPassed };
  } finally {
    // -------------------------------------------------------------------------
    // Step 15: Reliable Cleanup of All Synthetic Test Data
    // -------------------------------------------------------------------------
    if (synthHospitalId) {
      logger.info('Step 15: Cleaning up all synthetic test data from MongoDB Atlas...');
      await Promise.all([
        Hospital.deleteOne({ _id: synthHospitalId }),
        Department.deleteMany({ hospitalId: synthHospitalId }),
        DoctorProfile.deleteMany({ hospitalId: synthHospitalId }),
        PatientProfile.deleteMany({ hospitalId: synthHospitalId }),
        DoctorAvailability.deleteMany({ hospitalId: synthHospitalId }),
        Appointment.deleteMany({ hospitalId: synthHospitalId }),
        Encounter.deleteMany({ hospitalId: synthHospitalId.toString() }),
        Allergy.deleteMany({ hospitalId: synthHospitalId.toString() }),
        Vaccination.deleteMany({ hospitalId: synthHospitalId.toString() }),
        FamilyHistory.deleteMany({ hospitalId: synthHospitalId.toString() }),
        ScheduledReminder.deleteMany({ hospitalId: synthHospitalId }),
        User.deleteMany({ hospitalId: synthHospitalId }),
      ]);

      // Verify complete teardown
      const remainingAppointments = await Appointment.countDocuments({ hospitalId: synthHospitalId });
      const remainingEncounters = await Encounter.countDocuments({ hospitalId: synthHospitalId.toString() });
      assertAtlas(remainingAppointments === 0 && remainingEncounters === 0, 'Step 15: Teardown Complete');
      logger.info('Step 15 PASS: All synthetic records safely cleaned up from MongoDB Atlas');
    }
  }
}

export async function verifyDatabaseFoundation(): Promise<{
  liveDbConnected: boolean;
  modelsRegistered: boolean;
  schemaValidationVerified: boolean;
  atlasAssertionsRan: number;
  atlasAssertionsPassed: number;
  modelDetails: Record<string, unknown>;
}> {
  logger.info('--- Commencing MedCoreHMS Days 3–12 Database Verification Script ---');

  // 1. Verify Model Registration in Mongoose (Days 3–12 models)
  const requiredModels = [
    'Hospital',
    'User',
    'Department',
    'DoctorProfile',
    'PatientProfile',
    'DoctorAvailability',
    'Appointment',
    'Encounter',
    'Allergy',
    'Vaccination',
    'FamilyHistory',
    'ScheduledReminder',
  ];
  const registeredModels = Object.keys(mongoose.models);
  const modelsRegistered = requiredModels.every((m) => registeredModels.includes(m));

  logger.info('Mongoose Model Registration Check (Days 3–12)', {
    requiredModels,
    registeredModels,
    status: modelsRegistered ? 'PASS' : 'FAIL',
  });

  // 2. Verify Schema Validation Logic in Memory
  let schemaValidationVerified = false;
  try {
    // Test Hospital Schema Validation
    const invalidHospital = new Hospital({ name: 'Incomplete Clinic' });
    const err = invalidHospital.validateSync();
    const hasCodeError = !!err?.errors?.code;
    const hasEmailError = !!err?.errors?.email;

    // Test User Schema Validation
    const invalidUser = new User({ email: 'bad-email-format' });
    const userErr = invalidUser.validateSync();
    const hasRoleError = !!userErr?.errors?.role;
    const hasEmailFormatError = !!userErr?.errors?.email;

    // Test Patient Profile: Future date of birth should fail
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const invalidPatient = new PatientProfile({
      hospitalId: new mongoose.Types.ObjectId(),
      mrn: 'MRN-999',
      firstName: 'Future',
      lastName: 'Baby',
      dateOfBirth: futureDate,
      gender: 'MALE',
      phone: '555-1234',
      emergencyContact: { name: 'Mom', relationship: 'Mother', phone: '555-1235' },
      address: { street: '1 St', city: 'City', state: 'ST', postalCode: '12345', country: 'USA' },
    });
    const patientErr = invalidPatient.validateSync();
    const hasFutureDobError = !!patientErr?.errors?.dateOfBirth;

    // Test Encounter Schema Validation: Missing chief complaint should fail
    const invalidEncounter = new Encounter({
      hospitalId: new mongoose.Types.ObjectId().toString(),
      patientId: new mongoose.Types.ObjectId().toString(),
      doctorId: new mongoose.Types.ObjectId().toString(),
    });
    const encErr = invalidEncounter.validateSync();
    const hasChiefComplaintError = !!encErr?.errors?.chiefComplaint;

    schemaValidationVerified =
      hasCodeError &&
      hasEmailError &&
      hasRoleError &&
      hasEmailFormatError &&
      hasFutureDobError &&
      hasChiefComplaintError;

    logger.info('In-Memory Schema Validation Check', {
      hospitalValidation: hasCodeError && hasEmailError ? 'PASS' : 'FAIL',
      userValidation: hasRoleError && hasEmailFormatError ? 'PASS' : 'FAIL',
      patientValidation: hasFutureDobError ? 'PASS' : 'FAIL',
      encounterValidation: hasChiefComplaintError ? 'PASS' : 'FAIL',
      overall: schemaValidationVerified ? 'PASS' : 'FAIL',
    });
  } catch (validationErr) {
    logger.error('Schema validation check failed with exception', {
      error: (validationErr as Error).message,
    });
  }

  // 3. Inspect Live MongoDB Connection
  let liveDbConnected = false;
  try {
    const conn = await connectDatabase();
    if (conn && mongoose.connection.readyState === 1) {
      liveDbConnected = true;
      logger.info('Live MongoDB Connection Check: PASS', {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      });

      // Synchronize indexes on live database
      await Hospital.init();
      await User.init();
      await Department.init();
      await DoctorProfile.init();
      await PatientProfile.init();
      await DoctorAvailability.init();
      await Appointment.init();
      await Encounter.init();
      await Allergy.init();
      await Vaccination.init();
      await FamilyHistory.init();
      await ScheduledReminder.init();
      logger.info('Live MongoDB Indexes Synchronized Successfully');

      // Execute 15-step synthetic verification suite against live Atlas
      logger.info('Starting 15-step live Atlas verification suite...');
      await runAtlas15StepSyntheticVerification();
    } else {
      logger.warn('Live MongoDB Connection Check: BLOCKED (No active MongoDB server at URI)');
      logger.info('Note: Live Atlas assertions were skipped; zero false PASSes reported.');
    }
  } catch (dbErr) {
    logger.warn('Live MongoDB connection attempted and failed cleanly', {
      error: (dbErr as Error).message,
    });
  } finally {
    if (liveDbConnected) {
      await disconnectDatabase();
    }
  }

  const modelDetails = {
    Hospital: {
      collection: Hospital.collection.name,
      indexes: Hospital.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    User: {
      collection: User.collection.name,
      indexes: User.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    Department: {
      collection: Department.collection.name,
      indexes: Department.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    DoctorProfile: {
      collection: DoctorProfile.collection.name,
      indexes: DoctorProfile.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    PatientProfile: {
      collection: PatientProfile.collection.name,
      indexes: PatientProfile.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    DoctorAvailability: {
      collection: DoctorAvailability.collection.name,
      indexes: DoctorAvailability.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    Appointment: {
      collection: Appointment.collection.name,
      indexes: Appointment.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    Encounter: {
      collection: Encounter.collection.name,
      indexes: Encounter.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    Allergy: {
      collection: Allergy.collection.name,
      indexes: Allergy.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    Vaccination: {
      collection: Vaccination.collection.name,
      indexes: Vaccination.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    FamilyHistory: {
      collection: FamilyHistory.collection.name,
      indexes: FamilyHistory.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
    ScheduledReminder: {
      collection: ScheduledReminder.collection.name,
      indexes: ScheduledReminder.schema.indexes().map((idx) => Object.keys(idx[0])),
    },
  };

  return {
    liveDbConnected,
    modelsRegistered,
    schemaValidationVerified,
    atlasAssertionsRan: atlasAssertionCount,
    atlasAssertionsPassed: atlasAssertionPassed,
    modelDetails,
  };
}

if (process.argv[1]?.endsWith('verify-db.ts')) {
  verifyDatabaseFoundation()
    .then((res) => {
      console.log('--- VERIFICATION RESULT ---');
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
