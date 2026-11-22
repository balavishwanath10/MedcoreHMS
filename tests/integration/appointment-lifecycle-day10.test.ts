import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { Appointment } from '../../src/server/models/Appointment.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { PatientProfile } from '../../src/server/models/PatientProfile.js';
import { notificationService } from '../../src/server/services/notification.service.js';
import { reminderScheduler } from '../../src/server/services/reminderScheduler.service.js';
import { ScheduledReminder } from '../../src/server/models/ScheduledReminder.js';
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

  const createMockSession = () => ({
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    inTransaction: () => true,
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    reminderScheduler.clearAll();
    vi.spyOn(mongoose, 'startSession').mockImplementation(async () => createMockSession() as any);
    vi.spyOn(DoctorProfile, 'updateOne').mockResolvedValue({} as any);
    vi.spyOn(PatientProfile, 'updateMany').mockResolvedValue({} as any);
    vi.spyOn(PatientProfile, 'updateOne').mockResolvedValue({} as any);
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
  // 6. Reminder Service & Scheduler Evaluation
  // =========================================================================
  describe('Appointment Reminder Service & Scheduler', () => {
    it('should schedule both 24-hour and 1-hour reminders for future appointments without immediate invocation', async () => {
      const futureAppt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h in future

      const scheduleResult = await reminderScheduler.scheduleAppointmentReminders({
        appointmentId,
        appointmentTime: futureAppt,
        recipientEmail: 'patient@example.com',
        recipientPhone: '+15551234567',
      });

      expect(scheduleResult.scheduledCount).toBe(2);
      const jobs = reminderScheduler.getJobs(appointmentId);
      expect(jobs).toHaveLength(2);

      const job24h = jobs.find((j) => j.reminderType === '24_HOUR');
      const job1h = jobs.find((j) => j.reminderType === '1_HOUR');

      expect(job24h).toBeDefined();
      expect(job24h!.status).toBe('SCHEDULED');
      expect(job24h!.timer).toBeDefined();

      expect(job1h).toBeDefined();
      expect(job1h!.status).toBe('SCHEDULED');
      expect(job1h!.timer).toBeDefined();
    });

    it('should prevent duplicate reminder scheduling for the same appointment and window', async () => {
      const futureAppt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      // First scheduling
      await reminderScheduler.scheduleAppointmentReminders({
        appointmentId,
        appointmentTime: futureAppt,
        recipientEmail: 'patient@example.com',
      });

      // Second identical scheduling attempt
      await reminderScheduler.scheduleAppointmentReminders({
        appointmentId,
        appointmentTime: futureAppt,
        recipientEmail: 'patient@example.com',
      });

      const jobs = reminderScheduler.getJobs(appointmentId);
      // Still only 2 jobs total (no duplicate entries)
      expect(jobs).toHaveLength(2);
    });

    it('should cancel pending reminders and clear timers when appointment is cancelled', async () => {
      const futureAppt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await reminderScheduler.scheduleAppointmentReminders({
        appointmentId,
        appointmentTime: futureAppt,
        recipientEmail: 'patient@example.com',
      });

      const cancelResult = await reminderScheduler.cancelAppointmentReminders(
        appointmentId,
        'Patient requested cancellation',
      );

      expect(cancelResult.cancelledCount).toBe(2);
      const jobs = reminderScheduler.getJobs(appointmentId);
      expect(jobs.every((j) => j.status === 'CANCELLED')).toBe(true);
      expect(jobs.every((j) => j.timer === null)).toBe(true);
    });

    it('should reschedule reminders when appointment time is updated', async () => {
      const originalTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const newTime = new Date(Date.now() + 72 * 60 * 60 * 1000);

      await reminderScheduler.scheduleAppointmentReminders({
        appointmentId,
        appointmentTime: originalTime,
        recipientEmail: 'patient@example.com',
      });

      await reminderScheduler.rescheduleAppointmentReminders({
        appointmentId,
        newAppointmentTime: newTime,
        recipientEmail: 'patient@example.com',
      });

      const jobs = reminderScheduler.getJobs(appointmentId);
      const activeJobs = jobs.filter((j) => j.status === 'SCHEDULED');
      expect(activeJobs).toHaveLength(2);
      expect(activeJobs[0].appointmentTime.getTime()).toBe(newTime.getTime());
    });

    it('should isolate email failure so it does not abort SMS delivery', async () => {
      // Mock sendEmail to throw error
      vi.spyOn(notificationService, 'sendEmail').mockRejectedValue(
        new Error('SMTP connection timeout'),
      );
      // Mock sendSms to succeed with unconfigured mock
      const smsSpy = vi.spyOn(notificationService, 'sendSms');

      const result = await notificationService.dispatchAppointmentReminder({
        appointmentId,
        recipientEmail: 'fail@example.com',
        recipientPhone: '+15551234567',
        appointmentTime: new Date(),
        reminderType: '24_HOUR',
      });

      expect(result.emailDelivered).toBe(false);
      expect(smsSpy).toHaveBeenCalled();
    });

    it('should accurately report BullMQ/Redis infrastructure readiness', () => {
      const report = reminderScheduler.getInfrastructureReport();
      expect(report.hasBullMQ).toBe(false);
      expect(report.engine).toBe('MONGO_PERSISTED_DURABLE_SCHEDULER');
      expect(report.message).toContain('ScheduledReminder');
    });

    it('DURABLE RECOVERY: should recover pending reminders and re-arm timers following server restart', async () => {
      const futureTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours ahead
      const overdueTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      // Mock ScheduledReminder.find to simulate database persisted state after restart
      const mockPendingDocs = [
        {
          _id: new mongoose.Types.ObjectId(),
          appointmentId: new mongoose.Types.ObjectId(appointmentId),
          hospitalId: new mongoose.Types.ObjectId(hospitalAId),
          reminderType: '1_HOUR',
          recipientEmail: 'recovery-patient@test.com',
          recipientPhone: '+15559876543',
          appointmentTime: new Date(Date.now() + 3 * 3600000),
          scheduledFor: futureTime,
          status: 'PENDING',
        },
        {
          _id: new mongoose.Types.ObjectId(),
          appointmentId: new mongoose.Types.ObjectId(appointmentId),
          hospitalId: new mongoose.Types.ObjectId(hospitalAId),
          reminderType: '24_HOUR',
          recipientEmail: 'overdue-patient@test.com',
          appointmentTime: new Date(Date.now() + 10 * 3600000),
          scheduledFor: overdueTime,
          status: 'PENDING',
        },
      ];

      const origReadyState = (mongoose.connection as any)._readyState;
      (mongoose.connection as any)._readyState = 1;
      vi.spyOn(ScheduledReminder, 'find').mockResolvedValue(mockPendingDocs as any);
      vi.spyOn(ScheduledReminder, 'findOneAndUpdate').mockResolvedValue(mockPendingDocs[1] as any);
      vi.spyOn(ScheduledReminder, 'findByIdAndUpdate').mockResolvedValue({} as any);

      try {
        // Simulate clean restart by clearing in-memory state
        reminderScheduler.clearAll();
        expect(reminderScheduler.getJobs()).toHaveLength(0);

        // Execute recovery
        const recoveryResult = await reminderScheduler.recoverPendingReminders();

        expect(recoveryResult.recoveredCount).toBe(2);
        expect(recoveryResult.rearmedFuture).toBe(1);
        expect(recoveryResult.dispatchedImmediate).toBe(1);

        // Verify future job is restored in memory with active timer
        const recoveredJobs = reminderScheduler.getJobs();
        expect(recoveredJobs.length).toBeGreaterThanOrEqual(1);
        expect(recoveredJobs.some((j) => j.status === 'SCHEDULED' && j.timer !== null)).toBe(true);
      } finally {
        (mongoose.connection as any)._readyState = origReadyState;
      }
    });

    it('DURABLE SCHEDULER AUDIT: should refuse to claim durable scheduling when MongoDB persistence fails', async () => {
      const origReadyState = (mongoose.connection as any)._readyState;
      (mongoose.connection as any)._readyState = 1;
      vi.spyOn(ScheduledReminder, 'create').mockRejectedValue(
        new Error('MongoNetworkError: failed to connect to server'),
      );

      try {
        reminderScheduler.clearAll();

        const futureAppt = new Date(Date.now() + 48 * 3600000);
        const scheduleResult = await reminderScheduler.scheduleAppointmentReminders({
          appointmentId,
          hospitalId: hospitalAId,
          appointmentTime: futureAppt,
          recipientEmail: 'patient@example.com',
        });

        // Refuses to claim durable success when database persistence failed
        expect(scheduleResult.scheduledCount).toBe(0);
        const jobs = reminderScheduler.getJobs(appointmentId);
        expect(jobs.every((j) => j.status === 'FAILED')).toBe(true);
      } finally {
        (mongoose.connection as any)._readyState = origReadyState;
      }
    });

    it('DURABLE RECOVERY AUDIT: should never dispatch the same reminder twice when concurrent worker already claimed it', async () => {
      const origReadyState = (mongoose.connection as any)._readyState;
      (mongoose.connection as any)._readyState = 1;
      const overdueDoc: any = {
        _id: new mongoose.Types.ObjectId(),
        appointmentId: new mongoose.Types.ObjectId(appointmentId),
        hospitalId: new mongoose.Types.ObjectId(hospitalAId),
        reminderType: '24_HOUR',
        scheduledFor: new Date(Date.now() - 3600000),
        status: 'PENDING',
      };

      vi.spyOn(ScheduledReminder, 'find').mockResolvedValue([overdueDoc] as any);
      // Atomic claim returns null (simulating concurrent worker already acquired this reminder)
      vi.spyOn(ScheduledReminder, 'findOneAndUpdate').mockResolvedValue(null);
      const dispatchSpy = vi.spyOn(notificationService, 'dispatchAppointmentReminder');

      try {
        reminderScheduler.clearAll();
        const recoveryResult = await reminderScheduler.recoverPendingReminders();

        expect(recoveryResult.recoveredCount).toBe(1);
        expect(recoveryResult.dispatchedImmediate).toBe(1);
        // Notification dispatch was skipped because another worker claimed the record
        expect(dispatchSpy).not.toHaveBeenCalled();
      } finally {
        (mongoose.connection as any)._readyState = origReadyState;
      }
    });

    it('PROVIDER CREDENTIALS ABSENT: should report delivery as unavailable without claiming success', async () => {
      // Save existing env
      const origSmtp = process.env.SMTP_USER;
      const origTwilio = process.env.TWILIO_ACCOUNT_SID;

      delete process.env.SMTP_USER;
      delete process.env.TWILIO_ACCOUNT_SID;

      try {
        const emailResult = await notificationService.sendEmail({
          to: 'test@unconfigured.org',
          subject: 'Unconfigured Test',
        });
        expect(emailResult.sent).toBe(false);
        expect(emailResult.provider).toBe('SMTP_UNAVAILABLE');

        const smsResult = await notificationService.sendSms({
          to: '+15550001111',
          message: 'Unconfigured SMS test',
        });
        expect(smsResult.sent).toBe(false);
        expect(smsResult.provider).toBe('TWILIO_UNAVAILABLE');
      } finally {
        if (origSmtp) process.env.SMTP_USER = origSmtp;
        if (origTwilio) process.env.TWILIO_ACCOUNT_SID = origTwilio;
      }
    });
  });
});
