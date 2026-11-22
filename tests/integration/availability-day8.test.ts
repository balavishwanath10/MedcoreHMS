import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { DoctorAvailability } from '../../src/server/models/DoctorAvailability.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import {
  generateSlotsFromSchedule,
  hasIntervalOverlap,
} from '../../src/server/utils/slotGenerator.js';
import { UserRole } from '../../src/shared/types/index.js';

describe('Day 8: Doctor Availability & Weekly Schedule Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const hospitalBId = new mongoose.Types.ObjectId().toString();

  const doctorAUserId = new mongoose.Types.ObjectId().toString();
  const doctorBUserId = new mongoose.Types.ObjectId().toString();

  const doctorAProfileId = new mongoose.Types.ObjectId().toString();

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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Slot Generator Utility Unit Verification
  // =========================================================================
  describe('Slot Generator Utility', () => {
    it('should correctly detect overlapping time intervals', () => {
      // (09:00 - 12:00) overlaps with (11:00 - 13:00)
      expect(hasIntervalOverlap('09:00', '12:00', '11:00', '13:00')).toBe(true);
      // (09:00 - 12:00) overlaps with (10:00 - 11:00)
      expect(hasIntervalOverlap('09:00', '12:00', '10:00', '11:00')).toBe(true);
      // (09:00 - 12:00) does NOT overlap with (12:00 - 15:00)
      expect(hasIntervalOverlap('09:00', '12:00', '12:00', '15:00')).toBe(false);
      // (09:00 - 12:00) does NOT overlap with (07:00 - 09:00)
      expect(hasIntervalOverlap('09:00', '12:00', '07:00', '09:00')).toBe(false);
    });

    it('should split working hours into discrete time slots based on slot duration', () => {
      const slots = generateSlotsFromSchedule('09:00', '11:00', 30);
      expect(slots).toHaveLength(4);
      expect(slots[0]).toEqual({
        startTime: '09:00',
        endTime: '09:30',
        isBooked: false,
        slotDurationMinutes: 30,
      });
      expect(slots[3]).toEqual({
        startTime: '10:30',
        endTime: '11:00',
        isBooked: false,
        slotDurationMinutes: 30,
      });
    });

    it('should mark booked intervals correctly in generated slots', () => {
      const booked = [{ startTime: '09:30', endTime: '10:00' }];
      const slots = generateSlotsFromSchedule('09:00', '10:30', 30, booked);
      expect(slots).toHaveLength(3);
      expect(slots[0].isBooked).toBe(false);
      expect(slots[1].isBooked).toBe(true); // 09:30 - 10:00 is booked
      expect(slots[2].isBooked).toBe(false);
    });
  });

  // =========================================================================
  // 2. Doctor Weekly Schedule Creation (POST /api/availability)
  // =========================================================================
  describe('Weekly Schedule Creation (POST /api/availability)', () => {
    it('should allow DOCTOR to define their own weekly availability schedule', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId, doctorAUserId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorAProfileId,
        userId: new mongoose.Types.ObjectId(doctorAUserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([]); // No existing schedules
      vi.spyOn(DoctorAvailability, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
          }) as any,
      );

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/availability',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          doctorId: doctorAProfileId,
          dayOfWeek: 1, // Monday
          startTime: '09:00',
          endTime: '17:00',
          slotDurationMinutes: 30,
          isAvailable: true,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.startTime).toBe('09:00');
      expect(res.body.data.endTime).toBe('17:00');
    });

    it('should reject schedule creation if doctor attempts to manage another doctors availability', async () => {
      const doctorBToken = createToken('DOCTOR', hospitalAId, doctorBUserId);

      // Doctor Profile belongs to Doctor A, but request is sent by Doctor B
      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorAProfileId,
        userId: new mongoose.Types.ObjectId(doctorAUserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/availability',
        headers: { authorization: `Bearer ${doctorBToken}` },
        body: {
          doctorId: doctorAProfileId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject invalid time range where endTime <= startTime', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId, doctorAUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/availability',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          doctorId: doctorAProfileId,
          dayOfWeek: 1,
          startTime: '17:00',
          endTime: '09:00', // Invalid: end time earlier than start time
          slotDurationMinutes: 30,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid slot duration (< 10 or > 120 mins)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId, doctorAUserId);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/availability',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          doctorId: doctorAProfileId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '12:00',
          slotDurationMinutes: 5, // Invalid: min is 10
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should prevent overlapping availability schedules on the same day (409 Conflict)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId, doctorAUserId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorAProfileId,
        userId: new mongoose.Types.ObjectId(doctorAUserId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      // Existing shift on Monday from 08:00 to 12:00
      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '12:00',
        } as any,
      ]);

      // Attempting to define overlapping shift from 10:00 to 14:00 on Monday
      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/availability',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          doctorId: doctorAProfileId,
          dayOfWeek: 1,
          startTime: '10:00',
          endTime: '14:00',
          slotDurationMinutes: 30,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AVAILABILITY_OVERLAP');
    });
  });

  // =========================================================================
  // 3. Time Slots Inspection & Retrieval (GET /api/availability/slots)
  // =========================================================================
  describe('Available Slots Generation Endpoint (GET /api/availability/slots)', () => {
    it('should return computed time slots for an authorized doctor and date', async () => {
      const patientToken = createToken('PATIENT', hospitalAId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorAProfileId,
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      // Suppose the date is a Monday (e.g. 2026-11-23)
      // Return schedule: 09:00 to 11:00 with 30-min slots
      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([
        {
          _id: new mongoose.Types.ObjectId(),
          startTime: '09:00',
          endTime: '11:00',
          slotDurationMinutes: 30,
          isAvailable: true,
        } as any,
      ]);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/availability/slots?doctorId=${doctorAProfileId}&date=2026-11-23`,
        headers: { authorization: `Bearer ${patientToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots).toHaveLength(4); // 09:00-09:30, 09:30-10:00, 10:00-10:30, 10:30-11:00
      expect(res.body.data.slots[0].startTime).toBe('09:00');
      expect(res.body.data.slots[0].endTime).toBe('09:30');
    });

    it('should deny cross-tenant slot inspection', async () => {
      // Patient from Hospital B tries to inspect slots for Doctor in Hospital A
      const patientHospitalBToken = createToken('PATIENT', hospitalBId);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: doctorAProfileId,
        hospitalId: new mongoose.Types.ObjectId(hospitalAId), // Hospital A
      } as any);

      const res = await makeRequest(app, {
        method: 'GET',
        url: `/api/availability/slots?doctorId=${doctorAProfileId}&date=2026-11-23`,
        headers: { authorization: `Bearer ${patientHospitalBToken}` },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 4. Schedule Updates & Cross-Tenant Boundary
  // =========================================================================
  describe('Schedule Update & Modification (PATCH /api/availability/:id)', () => {
    it('should prevent unauthorized users from modifying availability', async () => {
      const nurseToken = createToken('NURSE', hospitalAId);
      const schedId = new mongoose.Types.ObjectId().toString();

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/availability/${schedId}`,
        headers: { authorization: `Bearer ${nurseToken}` },
        body: { startTime: '10:00' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow Hospital Admin to update doctor availability in their hospital', async () => {
      const adminToken = createToken('HOSPITAL_ADMIN', hospitalAId);
      const schedId = new mongoose.Types.ObjectId().toString();

      vi.spyOn(DoctorAvailability, 'findOne').mockResolvedValue({
        _id: schedId,
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        doctorId: doctorAProfileId,
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '17:00',
      } as any);

      vi.spyOn(DoctorAvailability, 'find').mockResolvedValue([]); // No conflicting schedules
      vi.spyOn(DoctorAvailability, 'findByIdAndUpdate').mockResolvedValue({
        _id: schedId,
        startTime: '10:00',
        endTime: '18:00',
      } as any);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/availability/${schedId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        body: { startTime: '10:00', endTime: '18:00' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.startTime).toBe('10:00');
    });
  });
});
