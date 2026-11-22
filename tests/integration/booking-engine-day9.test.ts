import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Appointment } from '../../src/server/models/Appointment.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { DoctorAvailability } from '../../src/server/models/DoctorAvailability.js';
import { UserRole } from '../../src/shared/types/index.js';

describe('Day 9: Appointment Booking Engine & Concurrency Conflict Prevention Tests [Mocked Controller & Schema Suite]', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const patient1UserId = new mongoose.Types.ObjectId().toString();
  const patient2UserId = new mongoose.Types.ObjectId().toString();

  const patient1ProfileId = new mongoose.Types.ObjectId().toString();
  const patient2ProfileId = new mongoose.Types.ObjectId().toString();

  const doctor1ProfileId = new mongoose.Types.ObjectId().toString();
  const doctor2ProfileId = new mongoose.Types.ObjectId().toString();

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = new mongoose.Types.ObjectId().toString(),
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@test.hospital`,
      role,
      hospitalId,
    });
  };

  // 7 days in the future to ensure valid future time
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7);
  futureDate.setHours(10, 0, 0, 0);

  const futureEndDate = new Date(futureDate);
  futureEndDate.setMinutes(futureEndDate.getMinutes() + 30);

  const createMockSession = () => ({
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    inTransaction: () => true,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(mongoose, 'startSession').mockImplementation(async () => createMockSession() as any);
    vi.spyOn(DoctorProfile, 'updateOne').mockResolvedValue({} as any);
    vi.spyOn(PatientProfile, 'updateMany').mockResolvedValue({} as any);
    vi.spyOn(PatientProfile, 'updateOne').mockResolvedValue({} as any);
  });

  // =========================================================================
  // 1. Database-Level Schema Constraints Exercise (In-Memory Schema Tests)
  // =========================================================================
  describe('Database Compound Index Constraints Verification [In-Memory Schema Test]', () => {
    it('[In-Memory Schema Test] should have compound unique partial index defined for doctor double-booking prevention', () => {
      const indexes = Appointment.schema.indexes();
      const doctorIndex = indexes.find(
        (idx) => idx[0].hospitalId === 1 && idx[0].doctorId === 1 && idx[0].startTime === 1,
      );
      expect(doctorIndex).toBeDefined();
      expect(doctorIndex![1]?.unique).toBe(true);
      expect(doctorIndex![1]?.partialFilterExpression).toEqual({
        isDeleted: false,
        isCancelled: false,
      });
    });

    it('[In-Memory Schema Test] should have compound unique partial index defined for patient overlap prevention', () => {
      const indexes = Appointment.schema.indexes();
      const patientIndex = indexes.find(
        (idx) => idx[0].hospitalId === 1 && idx[0].patientId === 1 && idx[0].startTime === 1,
      );
      expect(patientIndex).toBeDefined();
      expect(patientIndex![1]?.unique).toBe(true);
      expect(patientIndex![1]?.partialFilterExpression).toEqual({
        isDeleted: false,
        isCancelled: false,
      });
    });
  });

  // =========================================================================
  // 2. Concurrency: Two Patients Attempting to Book Same Slot Simultaneously
  // =========================================================================
  describe('Concurrent Double-Booking Prevention [Mocked Controller Tests]', () => {
    it('[Mocked Controller Test] Two patients attempt to book the same doctor slot simultaneously — mocked E11000 duplicate key translates to 409 DOCTOR_DOUBLE_BOOKING', async () => {
      const token1 = createToken('PATIENT', hospitalAId, patient1UserId);
      const token2 = createToken('PATIENT', hospitalAId, patient2UserId);

      // Patient 1 profile lookup
      (vi.spyOn(PatientProfile, 'findOne') as any).mockImplementation(async (query: any) => {
        if (query._id?.toString() === patient1ProfileId) {
          return {
            _id: new mongoose.Types.ObjectId(patient1ProfileId),
            userId: new mongoose.Types.ObjectId(patient1UserId),
            hospitalId: new mongoose.Types.ObjectId(hospitalAId),
          } as any;
        }
        if (query._id?.toString() === patient2ProfileId) {
          return {
            _id: new mongoose.Types.ObjectId(patient2ProfileId),
            userId: new mongoose.Types.ObjectId(patient2UserId),
            hospitalId: new mongoose.Types.ObjectId(hospitalAId),
          } as any;
        }
        return null;
      });

      // Doctor Profile lookup
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      // Active weekly schedule covers the slot
      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          hospitalId: new mongoose.Types.ObjectId(hospitalAId),
          doctorId: new mongoose.Types.ObjectId(doctor1ProfileId),
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      // Atomic simulation of concurrent database insertion:
      // First call succeeds; second call hits Duplicate Key Code 11000
      let insertCount = 0;
      vi.spyOn(Appointment, 'findOne').mockResolvedValue(null);
      vi.spyOn(Appointment, 'create').mockImplementation(async (docData: any) => {
        insertCount++;
        if (insertCount === 1) {
          return {
            _id: new mongoose.Types.ObjectId(),
            ...docData,
          } as any;
        } else {
          const err: any = new Error('E11000 duplicate key error collection: appointments');
          err.code = 11000;
          err.name = 'MongoServerError';
          err.keyPattern = { doctorId: 1, startTime: 1 };
          throw err;
        }
      });

      // Send both requests concurrently via Promise.all
      const [res1, res2] = await Promise.all([
        makeRequest(app, {
          method: 'POST',
          url: '/api/appointments',
          headers: { authorization: `Bearer ${token1}` },
          body: {
            patientId: patient1ProfileId,
            doctorId: doctor1ProfileId,
            startTime: futureDate.toISOString(),
            endTime: futureEndDate.toISOString(),
          },
        }),
        makeRequest(app, {
          method: 'POST',
          url: '/api/appointments',
          headers: { authorization: `Bearer ${token2}` },
          body: {
            patientId: patient2ProfileId,
            doctorId: doctor1ProfileId,
            startTime: futureDate.toISOString(),
            endTime: futureEndDate.toISOString(),
          },
        }),
      ]);

      const successResponses = [res1, res2].filter((r) => r.statusCode === 201);
      const conflictResponses = [res1, res2].filter((r) => r.statusCode === 409);

      // Exactly ONE succeeds, the concurrent one fails with 409 DOCTOR_DOUBLE_BOOKING
      expect(successResponses).toHaveLength(1);
      expect(conflictResponses).toHaveLength(1);
      expect(conflictResponses[0].body.error.code).toBe('DOCTOR_DOUBLE_BOOKING');
    });

    it('[Mocked Controller Test] One patient attempts overlapping appointments with two different doctors — pre-flight conflict check returns 409 PATIENT_OVERLAPPING_APPOINTMENT', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        userId: new mongoose.Types.ObjectId(patient1UserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor2ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      // Pre-flight detects patient conflict: patient already has an active appointment at that time
      (vi.spyOn(Appointment, 'findOne') as any).mockImplementation(async (query: any) => {
        if (query.patientId) {
          return {
            _id: new mongoose.Types.ObjectId(),
            patientId: new mongoose.Types.ObjectId(patient1ProfileId),
            doctorId: new mongoose.Types.ObjectId(doctor1ProfileId), // Doctor 1
            startTime: futureDate,
            endTime: futureEndDate,
          } as any;
        }
        return null;
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor2ProfileId, // Attempt with Doctor 2 at same time
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PATIENT_OVERLAPPING_APPOINTMENT');
    });

    it('[Mocked Controller Test] should safely reject booking with 503 if database transactions are unavailable (no non-transactional fallback)', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        userId: new mongoose.Types.ObjectId(patient1UserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      // Simulate transaction capability completely unavailable
      vi.spyOn(mongoose, 'startSession').mockRejectedValue(
        new Error('Transactions not supported on standalone server'),
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TRANSACTION_UNAVAILABLE');
    });

    it('[Mocked Controller Test] should reject booking when partial interval overlap detected for doctor', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        userId: new mongoose.Types.ObjectId(patient1UserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      // Query returns an existing overlapping appointment for this doctor
      (vi.spyOn(Appointment, 'findOne') as any).mockImplementation(async (query: any) => {
        if (query.doctorId) {
          return {
            _id: new mongoose.Types.ObjectId(),
            doctorId: new mongoose.Types.ObjectId(doctor1ProfileId),
            startTime: futureDate,
            endTime: futureEndDate,
          } as any;
        }
        return null;
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DOCTOR_DOUBLE_BOOKING');
    });

    it('[Mocked Controller Test] should reject cross-profile booking when sibling patient profile under same user account has overlapping appointment', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);
      const siblingProfileId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        userId: new mongoose.Types.ObjectId(patient1UserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      // Patient has sibling profiles under the same account
      vi.spyOn(PatientProfile, 'find').mockResolvedValue([
        { _id: new mongoose.Types.ObjectId(patient1ProfileId) } as any,
        { _id: new mongoose.Types.ObjectId(siblingProfileId) } as any,
      ]);

      // Query returns an existing overlapping appointment for the sibling profile
      (vi.spyOn(Appointment, 'findOne') as any).mockImplementation(async (query: any) => {
        if (query.patientId && query.patientId.$in) {
          return {
            _id: new mongoose.Types.ObjectId(),
            patientId: new mongoose.Types.ObjectId(siblingProfileId),
            doctorId: new mongoose.Types.ObjectId(doctor2ProfileId),
            startTime: futureDate,
            endTime: futureEndDate,
          } as any;
        }
        return null;
      });

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PATIENT_OVERLAPPING_APPOINTMENT');
    });
  });

  // =========================================================================
  // 3. Availability, Dates & Tenant Isolation
  // =========================================================================
  describe('Booking Engine Business Rule Validations', () => {
    it('should reject a slot that falls outside doctor weekly availability', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        userId: new mongoose.Types.ObjectId(patient1UserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      // Doctor is NOT available on this day (empty shifts)
      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([]);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('OUTSIDE_DOCTOR_AVAILABILITY');
    });

    it('should reject appointment booked in the past', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patient1UserId);

      const pastStart = new Date(Date.now() - 3600000); // 1 hour ago
      const pastEnd = new Date(pastStart.getTime() + 1800000);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: pastStart.toISOString(),
          endTime: pastEnd.toISOString(),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_DATE');
    });

    it('should reject cross-hospital appointment creation', async () => {
      // Patient from Hospital B tries to book doctor in Hospital A
      const patientHospitalBToken = createToken('PATIENT', hospitalBId, patient1UserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patientHospitalBToken}` },
        body: {
          hospitalId: hospitalAId, // Attempting to target Hospital A
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      // requireTenant intercepts cross-tenant hospitalId in body and throws 403
      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should reject patient attempting to create appointment for another patient', async () => {
      const patient1Token = createToken('PATIENT', hospitalAId, patient1UserId);

      // PatientProfile lookup returns a record belonging to patient 2, not patient 1
      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient2ProfileId),
        userId: new mongoose.Types.ObjectId(patient2UserId), // Different user!
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${patient1Token}` },
        body: {
          patientId: patient2ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow valid appointment booking to persist correctly', async () => {
      const receptionistToken = createToken('RECEPTIONIST', hospitalAId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patient1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctor1ProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          dayOfWeek: futureDate.getDay(),
          startTime: '08:00',
          endTime: '18:00',
          isAvailable: true,
        } as any,
      ]);

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(null); // No conflicts
      vi.spyOn(Appointment, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
          }) as any,
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: {
          patientId: patient1ProfileId,
          doctorId: doctor1ProfileId,
          startTime: futureDate.toISOString(),
          endTime: futureEndDate.toISOString(),
          reason: 'General annual checkup',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONFIRMED');
      expect(res.body.data.reason).toBe('General annual checkup');
    });
  });
});
