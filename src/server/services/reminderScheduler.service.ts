import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { notificationService, DeliveryResult } from './notification.service.js';
import { ScheduledReminder } from '../models/ScheduledReminder.js';

export interface ScheduledReminderJob {
  id: string; // `${appointmentId}:${reminderType}`
  appointmentId: string;
  hospitalId?: string;
  reminderType: '24_HOUR' | '1_HOUR';
  scheduledFor: Date;
  status: 'SCHEDULED' | 'DISPATCHED' | 'CANCELLED' | 'SKIPPED_PAST' | 'FAILED';
  recipientEmail?: string;
  recipientPhone?: string;
  appointmentTime: Date;
  timer?: NodeJS.Timeout | null;
  executedAt?: Date;
  cancellationReason?: string;
  result?: {
    emailDelivered: boolean;
    smsDelivered: boolean;
    emailResult?: DeliveryResult;
    smsResult?: DeliveryResult;
  };
}

export interface ReminderInfrastructureReport {
  hasRedis: boolean;
  hasBullMQ: boolean;
  engine: 'MONGO_PERSISTED_DURABLE_SCHEDULER';
  status: 'ACTIVE_DURABLE' | 'INFRASTRUCTURE_UNAVAILABLE';
  isDatabaseConnected: boolean;
  message: string;
  limitations: string[];
}

class ReminderSchedulerService {
  private jobs: Map<string, ScheduledReminderJob> = new Map();

  /**
   * Reports infrastructure readiness for scheduled reminders.
   * Accurately reports persistent MongoDB-backed durable scheduler with restart recovery and limitations.
   */
  getInfrastructureReport(): ReminderInfrastructureReport {
    const isDbConnected = mongoose.connection.readyState === 1;
    const hasRedis = !!process.env.REDIS_URL && process.env.REDIS_URL !== 'placeholder';
    const hasBullMQ = false; // Not in package.json dependencies

    return {
      hasRedis,
      hasBullMQ,
      engine: 'MONGO_PERSISTED_DURABLE_SCHEDULER',
      status: isDbConnected ? 'ACTIVE_DURABLE' : 'INFRASTRUCTURE_UNAVAILABLE',
      isDatabaseConnected: isDbConnected,
      message: isDbConnected
        ? 'Durable appointment reminder scheduler backed by persistent MongoDB ScheduledReminder collection with atomic restart recovery, exact timer execution, duplicate suppression, and channel failure isolation.'
        : 'MongoDB connection is not active; durable reminder persistence via ScheduledReminder collection cannot be guaranteed. Scheduled jobs will be limited to process memory.',
      limitations: [
        'Requires active MongoDB connection for persistence; jobs will not survive server restart if database is disconnected.',
        'Single-instance timers coordinate via MongoDB atomic state transitions (status: PENDING -> PROCESSING) to prevent duplicate dispatch across recovery cycles.',
        'External distributed message queues (BullMQ/Redis) are not configured; horizontally scaled multi-worker clusters require Redis for distributed job coordination.',
        'Email transmission requires SMTP credentials; returns SMTP_UNAVAILABLE without claiming delivery when unconfigured.',
        'SMS transmission requires Twilio credentials; returns TWILIO_UNAVAILABLE without claiming delivery when unconfigured.',
      ],
    };
  }

  /**
   * Schedule both 24-hour and 1-hour reminders for an appointment.
   * Persists records to MongoDB for durability across server restarts.
   */
  async scheduleAppointmentReminders(params: {
    appointmentId: string;
    appointmentTime: Date;
    hospitalId?: string;
    patientId?: string;
    doctorId?: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<{ scheduledCount: number; jobs: ScheduledReminderJob[] }> {
    const now = new Date();
    const apptTime = new Date(params.appointmentTime);
    const scheduledJobs: ScheduledReminderJob[] = [];

    const reminderWindows: Array<{ type: '24_HOUR' | '1_HOUR'; offsetHours: number }> = [
      { type: '24_HOUR', offsetHours: 24 },
      { type: '1_HOUR', offsetHours: 1 },
    ];

    for (const window of reminderWindows) {
      const jobId = `${params.appointmentId}:${window.type}`;
      const scheduledFor = new Date(apptTime.getTime() - window.offsetHours * 60 * 60 * 1000);

      // In-memory duplicate prevention
      const existing = this.jobs.get(jobId);
      if (existing && existing.status === 'SCHEDULED') {
        logger.warn('Duplicate appointment reminder schedule attempt prevented', {
          jobId,
          appointmentId: params.appointmentId,
          reminderType: window.type,
        });
        scheduledJobs.push(existing);
        continue;
      }

      // Persist to MongoDB with atomic duplicate prevention if database is connected
      if (mongoose.connection.readyState === 1 && params.hospitalId) {
        try {
          // Atomic insertion relying on unique compound index { hospitalId, appointmentId, reminderType }
          await ScheduledReminder.create({
            hospitalId: params.hospitalId,
            appointmentId: params.appointmentId,
            patientId: params.patientId,
            doctorId: params.doctorId,
            reminderType: window.type,
            recipientEmail: params.recipientEmail,
            recipientPhone: params.recipientPhone,
            appointmentTime: apptTime,
            scheduledFor,
            status: scheduledFor.getTime() <= now.getTime() ? 'CANCELLED' : 'PENDING',
            lastError:
              scheduledFor.getTime() <= now.getTime()
                ? 'Target time already past at schedule time'
                : undefined,
            isDeleted: false,
          });
        } catch (dbErr: any) {
          if (dbErr.code === 11000) {
            // Atomic duplicate prevented by unique compound index in MongoDB
            logger.warn('Atomic duplicate scheduled reminder prevented by unique database index', {
              jobId,
              appointmentId: params.appointmentId,
              reminderType: window.type,
            });
            continue;
          }

          // Persistence genuinely failed: DO NOT claim durable scheduling or silently fall back!
          logger.error(
            'Failed to durably persist ScheduledReminder to MongoDB; refusing to claim durable schedule',
            {
              jobId,
              error: dbErr.message,
            },
          );

          const failedJob: ScheduledReminderJob = {
            id: jobId,
            appointmentId: params.appointmentId,
            hospitalId: params.hospitalId,
            reminderType: window.type,
            scheduledFor,
            status: 'FAILED',
            recipientEmail: params.recipientEmail,
            recipientPhone: params.recipientPhone,
            appointmentTime: apptTime,
            timer: null,
          };
          this.jobs.set(jobId, failedJob);
          scheduledJobs.push(failedJob);
          continue;
        }
      }

      // If scheduled time is in the past, record as SKIPPED_PAST (do not fire prematurely)
      if (scheduledFor.getTime() <= now.getTime()) {
        const pastJob: ScheduledReminderJob = {
          id: jobId,
          appointmentId: params.appointmentId,
          hospitalId: params.hospitalId,
          reminderType: window.type,
          scheduledFor,
          status: 'SKIPPED_PAST',
          recipientEmail: params.recipientEmail,
          recipientPhone: params.recipientPhone,
          appointmentTime: apptTime,
          timer: null,
        };
        this.jobs.set(jobId, pastJob);
        scheduledJobs.push(pastJob);
        logger.info('Appointment reminder target window is already past; marking skipped', {
          jobId,
          scheduledFor: scheduledFor.toISOString(),
          now: now.toISOString(),
        });
        continue;
      }

      // Schedule future execution via timer
      const delayMs = scheduledFor.getTime() - now.getTime();
      const job: ScheduledReminderJob = {
        id: jobId,
        appointmentId: params.appointmentId,
        hospitalId: params.hospitalId,
        reminderType: window.type,
        scheduledFor,
        status: 'SCHEDULED',
        recipientEmail: params.recipientEmail,
        recipientPhone: params.recipientPhone,
        appointmentTime: apptTime,
        timer: null,
      };

      const timer = setTimeout(async () => {
        await this.executeReminderJob(jobId);
      }, delayMs);

      if (timer && typeof timer.unref === 'function') {
        timer.unref();
      }

      job.timer = timer;
      this.jobs.set(jobId, job);
      scheduledJobs.push(job);

      logger.info('Appointment reminder scheduled successfully', {
        jobId,
        appointmentId: params.appointmentId,
        reminderType: window.type,
        scheduledFor: scheduledFor.toISOString(),
        delayMinutes: Math.round(delayMs / 60000),
      });
    }

    return {
      scheduledCount: scheduledJobs.filter((j) => j.status === 'SCHEDULED').length,
      jobs: scheduledJobs,
    };
  }

  /**
   * Recovers pending reminders from MongoDB after server restart.
   * Restores timers for future reminders and immediately dispatches overdue ones.
   */
  async recoverPendingReminders(): Promise<{
    recoveredCount: number;
    dispatchedImmediate: number;
    rearmedFuture: number;
  }> {
    if (mongoose.connection.readyState !== 1) {
      logger.warn('Cannot recover pending reminders: MongoDB not connected');
      return { recoveredCount: 0, dispatchedImmediate: 0, rearmedFuture: 0 };
    }

    try {
      const pendingReminders = await ScheduledReminder.find({
        status: 'PENDING',
        isDeleted: false,
      });

      const now = new Date();
      let dispatchedImmediate = 0;
      let rearmedFuture = 0;

      for (const reminder of pendingReminders) {
        const jobId = `${reminder.appointmentId.toString()}:${reminder.reminderType}`;

        // If reminder target time is already reached or overdue, dispatch immediately
        if (reminder.scheduledFor.getTime() <= now.getTime()) {
          dispatchedImmediate++;
          logger.info('Dispatching overdue reminder recovered from database restart', {
            jobId,
            scheduledFor: reminder.scheduledFor.toISOString(),
          });
          await this.executeReminderRecord(reminder);
        } else {
          // Re-arm timer for future execution
          rearmedFuture++;
          const delayMs = reminder.scheduledFor.getTime() - now.getTime();
          const job: ScheduledReminderJob = {
            id: jobId,
            appointmentId: reminder.appointmentId.toString(),
            hospitalId: reminder.hospitalId?.toString(),
            reminderType: reminder.reminderType as '24_HOUR' | '1_HOUR',
            scheduledFor: reminder.scheduledFor,
            status: 'SCHEDULED',
            recipientEmail: reminder.recipientEmail,
            recipientPhone: reminder.recipientPhone,
            appointmentTime: reminder.appointmentTime,
            timer: null,
          };

          const timer = setTimeout(async () => {
            await this.executeReminderRecord(reminder);
          }, delayMs);

          if (timer && typeof timer.unref === 'function') {
            timer.unref();
          }

          job.timer = timer;
          this.jobs.set(jobId, job);

          logger.info('Re-armed pending reminder timer following server restart', {
            jobId,
            delayMinutes: Math.round(delayMs / 60000),
          });
        }
      }

      logger.info('Completed durable reminder recovery from MongoDB', {
        recoveredCount: pendingReminders.length,
        dispatchedImmediate,
        rearmedFuture,
      });

      return {
        recoveredCount: pendingReminders.length,
        dispatchedImmediate,
        rearmedFuture,
      };
    } catch (err: any) {
      logger.error('Failed to recover pending reminders from MongoDB', { error: err.message });
      return { recoveredCount: 0, dispatchedImmediate: 0, rearmedFuture: 0 };
    }
  }

  /**
   * Cancel all scheduled reminders for an appointment (e.g. on cancellation).
   * Updates persistent database records and clears memory timers.
   */
  async cancelAppointmentReminders(
    appointmentId: string,
    reason: string,
  ): Promise<{ cancelledCount: number }> {
    let cancelledCount = 0;

    // Clear in-memory timers
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.appointmentId === appointmentId && job.status === 'SCHEDULED') {
        if (job.timer) {
          clearTimeout(job.timer);
          job.timer = null;
        }
        job.status = 'CANCELLED';
        job.cancellationReason = reason;
        cancelledCount++;

        logger.info('Scheduled appointment reminder cancelled in memory', {
          jobId,
          appointmentId,
          reason,
        });
      }
    }

    // Update persistent database records if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      try {
        const updateResult = await ScheduledReminder.updateMany(
          {
            appointmentId,
            status: { $in: ['PENDING', 'PROCESSING'] },
            isDeleted: false,
          },
          {
            $set: {
              status: 'CANCELLED',
              lastError: `Cancelled: ${reason}`,
            },
          },
        );
        logger.info('Scheduled reminders cancelled in MongoDB', {
          appointmentId,
          modifiedCount: updateResult.modifiedCount,
        });
      } catch (dbErr: any) {
        logger.error('Failed to cancel reminders in MongoDB', {
          appointmentId,
          error: dbErr.message,
        });
      }
    }

    return { cancelledCount };
  }

  /**
   * Reschedule reminders when appointment time changes.
   */
  async rescheduleAppointmentReminders(params: {
    appointmentId: string;
    newAppointmentTime: Date;
    hospitalId?: string;
    patientId?: string;
    doctorId?: string;
    recipientEmail?: string;
    recipientPhone?: string;
  }): Promise<{ scheduledCount: number; jobs: ScheduledReminderJob[] }> {
    await this.cancelAppointmentReminders(params.appointmentId, 'Appointment rescheduled');
    return this.scheduleAppointmentReminders({
      appointmentId: params.appointmentId,
      appointmentTime: params.newAppointmentTime,
      hospitalId: params.hospitalId,
      patientId: params.patientId,
      doctorId: params.doctorId,
      recipientEmail: params.recipientEmail,
      recipientPhone: params.recipientPhone,
    });
  }

  /**
   * Executes a scheduled reminder with failure isolation between channels.
   */
  async executeReminderJob(jobId: string): Promise<ScheduledReminderJob | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'SCHEDULED') {
      return null;
    }

    job.status = 'DISPATCHED';
    job.executedAt = new Date();
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }

    try {
      // If connected to MongoDB, ensure atomic state acquisition to prevent double-firing
      if (mongoose.connection.readyState === 1) {
        const claimed = await ScheduledReminder.findOneAndUpdate(
          {
            appointmentId: job.appointmentId,
            reminderType: job.reminderType,
            status: 'PENDING',
          },
          {
            $set: { status: 'PROCESSING' },
            $inc: { attempts: 1 },
          },
          { new: true },
        );

        if (!claimed) {
          logger.info(
            'Persistent reminder already processed or claimed, skipping in-memory dispatch',
            {
              jobId,
            },
          );
          return job;
        }
      }

      const result = await notificationService.dispatchAppointmentReminder({
        appointmentId: job.appointmentId,
        recipientEmail: job.recipientEmail,
        recipientPhone: job.recipientPhone,
        appointmentTime: job.appointmentTime,
        reminderType: job.reminderType,
      });
      job.result = result;

      // Update persistent database document if connected
      if (mongoose.connection.readyState === 1) {
        await ScheduledReminder.findOneAndUpdate(
          {
            appointmentId: job.appointmentId,
            reminderType: job.reminderType,
            status: 'PROCESSING',
          },
          {
            $set: {
              status: result.emailDelivered || result.smsDelivered ? 'DISPATCHED' : 'FAILED',
              dispatchedAt: new Date(),
              deliveryResult: result,
            },
          },
        );
      }
    } catch (err: any) {
      logger.error('Unexpected failure executing reminder job', {
        jobId,
        error: err.message,
      });
      job.result = { emailDelivered: false, smsDelivered: false };
      job.status = 'FAILED';
    }

    return job;
  }

  /**
   * Helper to execute a database reminder document.
   */
  private async executeReminderRecord(reminder: any): Promise<void> {
    const jobId = `${reminder.appointmentId.toString()}:${reminder.reminderType}`;
    try {
      // Atomic acquisition: only proceed if status is still PENDING.
      // Guarantees server restart recovery or concurrent workers never dispatch the same reminder twice!
      const claimed = await ScheduledReminder.findOneAndUpdate(
        {
          _id: reminder._id,
          status: 'PENDING',
        },
        {
          $set: { status: 'PROCESSING' },
          $inc: { attempts: 1 },
        },
        { new: true },
      );

      if (!claimed) {
        logger.info(
          'Reminder record already claimed or processed, skipping duplicate recovery dispatch',
          {
            jobId,
            reminderId: reminder._id,
          },
        );
        return;
      }

      const result = await notificationService.dispatchAppointmentReminder({
        appointmentId: reminder.appointmentId.toString(),
        recipientEmail: reminder.recipientEmail,
        recipientPhone: reminder.recipientPhone,
        appointmentTime: reminder.appointmentTime,
        reminderType: reminder.reminderType,
      });

      await ScheduledReminder.findByIdAndUpdate(reminder._id, {
        $set: {
          status: result.emailDelivered || result.smsDelivered ? 'DISPATCHED' : 'FAILED',
          dispatchedAt: new Date(),
          deliveryResult: result,
        },
      });

      const inMem = this.jobs.get(jobId);
      if (inMem) {
        inMem.status = result.emailDelivered || result.smsDelivered ? 'DISPATCHED' : 'FAILED';
        inMem.result = result;
      }
    } catch (dispatchErr: any) {
      logger.error('Failed executing reminder document', {
        jobId,
        error: dispatchErr.message,
      });
      await ScheduledReminder.findByIdAndUpdate(reminder._id, {
        $set: { status: 'FAILED', lastError: dispatchErr.message },
      });
    }
  }

  /**
   * Retrieve scheduled jobs (for inspection and tests).
   */
  getJobs(appointmentId?: string): ScheduledReminderJob[] {
    const all = Array.from(this.jobs.values());
    if (appointmentId) {
      return all.filter((j) => j.appointmentId === appointmentId);
    }
    return all;
  }

  /**
   * Reset all in-memory jobs and timers (for clean test teardown).
   */
  clearAll(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearTimeout(job.timer);
        job.timer = null;
      }
    }
    this.jobs.clear();
  }
}

export const reminderScheduler = new ReminderSchedulerService();
