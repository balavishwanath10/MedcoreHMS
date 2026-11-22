import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Appointment } from '../../src/server/models/Appointment.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { notificationService } from '../../src/server/services/notification.service.js';
import { UserRole } from '../../src/shared/types/index.js';

describe('Day 10: Appointment Lifecycle, Transitions & Emergency Bookings Integration Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();

  const patientUserId = new mongoose.Types.ObjectId().toString();

  const patientProfileId = new mongoose.Types.ObjectId().toString();
  const otherPatientProfileId = new mongoose.Types.ObjectId().toString();

  const doctorProfileId = new mongoose.Types.ObjectId().toString();
  const appointmentId = new mongoose.Types.ObjectId().toString();

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
  // 1. Permitted Lifecycle Transitions
  // =========================================================================
  describe('Permitted Lifecycle Transitions (PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED)', () => {
    it('should allow Receptionist to confirm a PENDING appointment', async () => {
      const receptionistToken = createToken('RECEPTIONIST', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        patientId: new mongoose.Types.ObjectId(patientProfileId),
        status: 'PENDING',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: { status: 'CONFIRMED', reason: 'Patient confirmed attendance by phone' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('CONFIRMED');
      expect(fakeAppt.statusHistory).toHaveLength(1);
      expect(fakeAppt.statusHistory[0].status).toBe('CONFIRMED');
    });

    it('should allow Doctor to start encounter (CONFIRMED -> IN_PROGRESS)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'CONFIRMED',
        statusHistory: [{ status: 'CONFIRMED', changedAt: new Date() }],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: { status: 'IN_PROGRESS' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('IN_PROGRESS');
      expect(fakeAppt.statusHistory).toHaveLength(2);
    });

    it('should allow Doctor to finalize encounter (IN_PROGRESS -> COMPLETED)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'IN_PROGRESS',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: { status: 'COMPLETED' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('COMPLETED');
    });
  });

  // =========================================================================
  // 2. Invalid State Transitions Rejection
  // =========================================================================
  describe('Invalid Lifecycle Transitions', () => {
    it('should reject invalid transition from COMPLETED to IN_PROGRESS (400)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'COMPLETED', // Terminal
        statusHistory: [],
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: { status: 'IN_PROGRESS' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject invalid skip transition from PENDING directly to COMPLETED (400)', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'PENDING',
        statusHistory: [],
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: { status: 'COMPLETED' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // =========================================================================
  // 3. Cancellation & No-Show Handling
  // =========================================================================
  describe('Cancellation and No-Show Handling', () => {
    it('should record cancellation reason when an appointment is cancelled', async () => {
      const receptionistToken = createToken('RECEPTIONIST', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'CONFIRMED',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: {
          status: 'CANCELLED',
          cancellationReason: 'Patient rescheduled due to travel conflict',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('CANCELLED');
      expect(fakeAppt.cancellationReason).toBe('Patient rescheduled due to travel conflict');
    });

    it('should allow marking an appointment as NO_SHOW with audit reason', async () => {
      const receptionistToken = createToken('RECEPTIONIST', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'CONFIRMED',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: { status: 'NO_SHOW', reason: 'Patient did not arrive within 30 minutes of slot' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('NO_SHOW');
      expect(fakeAppt.statusHistory[0].reason).toContain('30 minutes');
    });
  });

  // =========================================================================
  // 4. Role Permissions & Patient Restrictions
  // =========================================================================
  describe('Role Permissions on Status Changes', () => {
    it('should allow patient to CANCEL their own appointment', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patientUserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patientProfileId),
        userId: new mongoose.Types.ObjectId(patientUserId),
      } as any);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        patientId: new mongoose.Types.ObjectId(patientProfileId),
        status: 'CONFIRMED',
        statusHistory: [],
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${patientToken}` },
        body: { status: 'CANCELLED', cancellationReason: 'Feeling better' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fakeAppt.status).toBe('CANCELLED');
    });

    it('should reject patient attempting to advance clinical status (e.g. to IN_PROGRESS or COMPLETED)', async () => {
      const patientToken = createToken('PATIENT', hospitalAId, patientUserId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patientProfileId),
        userId: new mongoose.Types.ObjectId(patientUserId),
      } as any);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        patientId: new mongoose.Types.ObjectId(patientProfileId),
        status: 'CONFIRMED',
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${patientToken}` },
        body: { status: 'IN_PROGRESS' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject patient attempting to cancel another patients appointment', async () => {
      const patient1Token = createToken('PATIENT', hospitalAId, patientUserId);

      // Patient Profile belongs to patient 1, but appointment belongs to other patient
      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patientProfileId),
        userId: new mongoose.Types.ObjectId(patientUserId),
      } as any);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        patientId: new mongoose.Types.ObjectId(otherPatientProfileId), // other patient!
        status: 'CONFIRMED',
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${patient1Token}` },
        body: { status: 'CANCELLED' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should reject Receptionist attempting to transition status to COMPLETED (403)', async () => {
      const receptionistToken = createToken('RECEPTIONIST', hospitalAId);

      const fakeAppt: any = {
        _id: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        status: 'IN_PROGRESS',
      };

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(fakeAppt);

      const res = await makeRequest(app, {
        method: 'PATCH',
        url: `/api/appointments/${appointmentId}/status`,
        headers: { authorization: `Bearer ${receptionistToken}` },
        body: { status: 'COMPLETED' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 5. Emergency Bookings & Shift Bypass
  // =========================================================================
  describe('Emergency Booking Behaviour', () => {
    it('should allow creating an EMERGENCY appointment bypassing weekly shifts', async () => {
      const doctorToken = createToken('DOCTOR', hospitalAId);

      vi.spyOn(PatientProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(patientProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
      } as any);

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(doctorProfileId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        departmentId: new mongoose.Types.ObjectId(),
      } as any);

      vi.spyOn(Appointment, 'findOne').mockResolvedValue(null); // No slot conflicts
      vi.spyOn(Appointment, 'create').mockImplementation(
        async (data: any) =>
          ({
            _id: new mongoose.Types.ObjectId(),
            ...data,
          }) as any,
      );

      const futureEmergency = new Date();
      futureEmergency.setHours(futureEmergency.getHours() + 1);
      const futureEmergencyEnd = new Date(futureEmergency.getTime() + 1800000);

      const res = await makeRequest(app, {
        method: 'POST',
        url: '/api/appointments',
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          patientId: patientProfileId,
          doctorId: doctorProfileId,
          startTime: futureEmergency.toISOString(),
          endTime: futureEmergencyEnd.toISOString(),
          type: 'EMERGENCY',
          isEmergency: true,
          reason: 'Acute chest pain and shortness of breath',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEmergency).toBe(true);
      expect(res.body.data.type).toBe('EMERGENCY');
    });
  });

  // =========================================================================
  // 6. Reminder Service Evaluation
  // =========================================================================
  describe('Appointment Reminder Service', () => {
    it('should safely evaluate appointment reminder delivery abstraction', async () => {
      const reminderSpy = vi.spyOn(notificationService, 'dispatchAppointmentReminder');

      const result = await notificationService.dispatchAppointmentReminder({
        appointmentId: appointmentId,
        recipientEmail: 'patient@example.com',
        recipientPhone: '+15551234567',
        appointmentTime: new Date(),
        reminderType: '24_HOUR',
      });

      expect(reminderSpy).toHaveBeenCalled();
      expect(result).toHaveProperty('emailDelivered');
      expect(result).toHaveProperty('smsDelivered');
    });
  });
});
