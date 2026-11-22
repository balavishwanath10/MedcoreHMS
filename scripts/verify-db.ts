import mongoose from 'mongoose';
import {
  connectDatabase,
  disconnectDatabase,
} from '../src/server/config/database.js';
import { logger } from '../src/server/utils/logger.js';
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

export async function verifyDatabaseFoundation(): Promise<{
  liveDbConnected: boolean;
  modelsRegistered: boolean;
  schemaValidationVerified: boolean;
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
      hospitalId: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId(),
      doctorId: new mongoose.Types.ObjectId(),
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

      // Synchronize / inspect indexes on live database
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
      logger.info('Live MongoDB Indexes Synchronized Successfully');
    } else {
      logger.warn('Live MongoDB Connection Check: BLOCKED (No active MongoDB server at URI)');
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
  };

  return {
    liveDbConnected,
    modelsRegistered,
    schemaValidationVerified,
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
