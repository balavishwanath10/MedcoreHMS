import { logger } from '../utils/logger.js';
import { notificationService } from './notification.service.js';

export interface ScheduledReminderJob {
  id: string; // `${appointmentId}:${reminderType}`
  appointmentId: string;
  reminderType: '24_HOUR' | '1_HOUR';
  scheduledFor: Date;
  status: 'SCHEDULED' | 'DISPATCHED' | 'CANCELLED' | 'SKIPPED_PAST';
  recipientEmail?: string;
  recipientPhone?: string;
  appointmentTime: Date;
  timer?: NodeJS.Timeout | null;
  executedAt?: Date;
  cancellationReason?: string;
  result?: { emailDelivered: boolean; smsDelivered: boolean };
}

export interface ReminderInfrastructureReport {
  hasRedis: boolean;
  hasBullMQ: boolean;
  engine: 'IN_PROCESS_MANAGED_SCHEDULER' | 'BULLMQ_REDIS';
  status: 'INFRASTRUCTURE_UNAVAILABLE' | 'ACTIVE';
  message: string;
}

class ReminderSchedulerService {
  private jobs: Map<string, ScheduledReminderJob> = new Map();

  /**
   * Reports infrastructure readiness for scheduled reminders.
   * Accurately reports when Redis/BullMQ are not configured.
   */
  getInfrastructureReport(): ReminderInfrastructureReport {
    const hasRedis = !!process.env.REDIS_URL && process.env.REDIS_URL !== 'placeholder';
    const hasBullMQ = false; // Not in package.json dependencies

    return {
      hasRedis,
      hasBullMQ,
      engine: 'IN_PROCESS_MANAGED_SCHEDULER',
      status: hasRedis && hasBullMQ ? 'ACTIVE' : 'INFRASTRUCTURE_UNAVAILABLE',
      message:
        'Redis / BullMQ distributed queue infrastructure is not installed or configured in dependencies. Operating with resilient in-process managed reminder registry with precise timers, duplicate prevention, cancellation, and rescheduling.',
    };
  }

  /**
   * Schedule both 24-hour and 1-hour reminders for an appointment.
   * Does NOT dispatch immediately unless the scheduled time has arrived.
   */
  scheduleAppointmentReminders(params: {
    appointmentId: string;
    appointmentTime: Date;
    recipientEmail?: string;
    recipientPhone?: string;
  }): { scheduledCount: number; jobs: ScheduledReminderJob[] } {
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

      // Duplicate prevention: do not re-schedule if already active
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

      // If scheduled time is in the past, record as SKIPPED_PAST (do not fire prematurely)
      if (scheduledFor.getTime() <= now.getTime()) {
        const pastJob: ScheduledReminderJob = {
          id: jobId,
          appointmentId: params.appointmentId,
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
   * Cancel all scheduled reminders for an appointment (e.g. on cancellation).
   */
  cancelAppointmentReminders(appointmentId: string, reason: string): { cancelledCount: number } {
    let cancelledCount = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.appointmentId === appointmentId && job.status === 'SCHEDULED') {
        if (job.timer) {
          clearTimeout(job.timer);
          job.timer = null;
        }
        job.status = 'CANCELLED';
        job.cancellationReason = reason;
        cancelledCount++;

        logger.info('Scheduled appointment reminder cancelled', {
          jobId,
          appointmentId,
          reason,
        });
      }
    }

    return { cancelledCount };
  }

  /**
   * Reschedule reminders when appointment time changes.
   */
  rescheduleAppointmentReminders(params: {
    appointmentId: string;
    newAppointmentTime: Date;
    recipientEmail?: string;
    recipientPhone?: string;
  }): { scheduledCount: number; jobs: ScheduledReminderJob[] } {
    this.cancelAppointmentReminders(params.appointmentId, 'Appointment rescheduled');
    return this.scheduleAppointmentReminders({
      appointmentId: params.appointmentId,
      appointmentTime: params.newAppointmentTime,
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
      const result = await notificationService.dispatchAppointmentReminder({
        appointmentId: job.appointmentId,
        recipientEmail: job.recipientEmail,
        recipientPhone: job.recipientPhone,
        appointmentTime: job.appointmentTime,
        reminderType: job.reminderType,
      });
      job.result = result;
    } catch (err: any) {
      logger.error('Unexpected failure executing reminder job', {
        jobId,
        error: err.message,
      });
      job.result = { emailDelivered: false, smsDelivered: false };
    }

    return job;
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
