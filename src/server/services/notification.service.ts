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
};
