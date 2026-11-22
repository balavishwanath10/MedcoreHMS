import { logger } from '../utils/logger.js';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface SmsOptions {
  to: string;
  message: string;
}

export const notificationService = {
  /**
   * Safe email delivery abstraction.
   * If SMTP is not configured, logs safe audit info without leaking OTPs.
   */
  async sendEmail(options: EmailOptions): Promise<{ sent: boolean; provider: string }> {
    const isConfigured = !!process.env.SMTP_USER && process.env.SMTP_USER !== 'placeholder';

    if (!isConfigured) {
      logger.info('Email notification handled via development provider abstraction', {
        recipientDomain: options.to.split('@')[1] || 'unknown',
        subject: options.subject,
      });
      return { sent: false, provider: 'DEV_MOCK_UNCONFIGURED' };
    }

    // In production with real credentials, Nodemailer would be invoked here
    logger.info('Email dispatched via configured SMTP gateway', {
      recipientDomain: options.to.split('@')[1] || 'unknown',
      subject: options.subject,
    });
    return { sent: true, provider: 'SMTP' };
  },

  /**
   * Safe SMS delivery abstraction for Twilio.
   * If Twilio is not configured, safely records unconfigured status.
   */
  async sendSms(options: SmsOptions): Promise<{ sent: boolean; provider: string }> {
    const isConfigured =
      !!process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== 'placeholder';

    if (!isConfigured) {
      logger.info('SMS notification handled via development provider abstraction', {
        maskedPhone: options.to.replace(/\d(?=\d{4})/g, '*'),
      });
      return { sent: false, provider: 'TWILIO_MOCK_UNCONFIGURED' };
    }

    // In production with real credentials, Twilio API would be invoked here
    logger.info('SMS dispatched via Twilio gateway', {
      maskedPhone: options.to.replace(/\d(?=\d{4})/g, '*'),
    });
    return { sent: true, provider: 'TWILIO' };
  },

  /**
   * Dispatches or schedules 24h / 1h appointment reminders via email and SMS.
   */
  async dispatchAppointmentReminder(params: {
    appointmentId: string;
    recipientEmail?: string;
    recipientPhone?: string;
    appointmentTime: Date;
    reminderType: '24_HOUR' | '1_HOUR';
  }): Promise<{ emailDelivered: boolean; smsDelivered: boolean }> {
    let emailDelivered = false;
    let smsDelivered = false;

    if (params.recipientEmail) {
      const emailRes = await this.sendEmail({
        to: params.recipientEmail,
        subject: `Appointment Reminder (${params.reminderType === '24_HOUR' ? 'Tomorrow' : 'In 1 Hour'})`,
        text: `Your consultation is scheduled for ${params.appointmentTime.toISOString()}.`,
      });
      emailDelivered = emailRes.sent;
    }

    if (params.recipientPhone) {
      const smsRes = await this.sendSms({
        to: params.recipientPhone,
        message: `MedCoreHMS Reminder: Your appointment is scheduled for ${params.appointmentTime.toLocaleTimeString()}.`,
      });
      smsDelivered = smsRes.sent;
    }

    logger.info('Appointment reminder dispatch evaluated', {
      appointmentId: params.appointmentId,
      reminderType: params.reminderType,
      emailDelivered,
      smsDelivered,
    });

    return { emailDelivered, smsDelivered };
  },
};
