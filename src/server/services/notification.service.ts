import nodemailer from 'nodemailer';
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

export interface DeliveryResult {
  sent: boolean;
  provider: string;
  messageId?: string;
  reason?: string;
  error?: string;
}

export const notificationService = {
  /**
   * Safe email delivery abstraction using Nodemailer SMTP client.
   * If SMTP is not configured, safely reports delivery unavailable without claiming success.
   * When configured, authenticates and submits message to SMTP gateway.
   * Returns sent: true only after the SMTP server accepts the message.
   */
  async sendEmail(options: EmailOptions): Promise<DeliveryResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || `"MedCoreHMS" <${user || 'no-reply@medcorehms.local'}>`;

    const isConfigured = Boolean(
      host &&
      host !== 'placeholder' &&
      user &&
      user !== 'placeholder' &&
      pass &&
      pass !== 'placeholder',
    );

    if (!isConfigured) {
      logger.warn(
        'Email notification unavailable: SMTP provider credentials absent or placeholder',
        {
          recipientDomain: options.to.split('@')[1] || 'unknown',
          subject: options.subject,
        },
      );
      return {
        sent: false,
        provider: 'SMTP_UNAVAILABLE',
        reason: 'SMTP provider credentials absent or placeholder',
      };
    }

    try {
      const secure = port === 465;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });

      const info = await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      logger.info('Email accepted for delivery by SMTP gateway', {
        recipientDomain: options.to.split('@')[1] || 'unknown',
        subject: options.subject,
        messageId: info.messageId,
      });

      return {
        sent: true,
        provider: 'SMTP',
        messageId: info.messageId,
      };
    } catch (smtpErr: any) {
      // Strictly prevent credential or sensitive data leakage in logs
      logger.error('SMTP provider error during email delivery', {
        error: smtpErr.message,
        code: smtpErr.code,
        host,
        port,
      });
      return {
        sent: false,
        provider: 'SMTP',
        error: smtpErr.message,
      };
    }
  },

  /**
   * Safe SMS delivery abstraction for Twilio.
   * If Twilio is not configured, safely reports delivery unavailable without claiming success.
   * When configured, issues actual HTTP REST API call to Twilio before reporting success.
   */
  async sendSms(options: SmsOptions): Promise<DeliveryResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    const isConfigured = Boolean(
      accountSid &&
      accountSid !== 'placeholder' &&
      authToken &&
      authToken !== 'placeholder' &&
      fromPhone &&
      fromPhone !== 'placeholder',
    );

    if (!isConfigured) {
      logger.warn(
        'SMS notification unavailable: Twilio provider credentials absent or placeholder',
        {
          maskedPhone: options.to.replace(/\d(?=\d{4})/g, '*'),
        },
      );
      return {
        sent: false,
        provider: 'TWILIO_UNAVAILABLE',
        reason: 'Twilio provider credentials absent or placeholder',
      };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const bodyParams = new URLSearchParams({
        To: options.to,
        From: fromPhone!,
        Body: options.message,
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Twilio API rejected SMS dispatch request', {
          statusCode: response.status,
          error: errorText,
        });
        return {
          sent: false,
          provider: 'TWILIO',
          error: `Twilio API returned status ${response.status}: ${errorText}`,
        };
      }

      const data: any = await response.json();
      logger.info('SMS dispatched via Twilio gateway', {
        messageSid: data.sid,
        maskedPhone: options.to.replace(/\d(?=\d{4})/g, '*'),
      });
      return { sent: true, provider: 'TWILIO', messageId: data.sid };
    } catch (twilioErr: any) {
      logger.error('Twilio provider error during SMS dispatch', {
        error: twilioErr.message,
      });
      return {
        sent: false,
        provider: 'TWILIO',
        error: twilioErr.message,
      };
    }
  },

  /**
   * Dispatches or schedules 24h / 1h appointment reminders via email and SMS.
   * Isolates failures between channels and records precise delivery states.
   */
  async dispatchAppointmentReminder(params: {
    appointmentId: string;
    recipientEmail?: string;
    recipientPhone?: string;
    appointmentTime: Date;
    reminderType: '24_HOUR' | '1_HOUR';
  }): Promise<{
    emailDelivered: boolean;
    smsDelivered: boolean;
    emailResult?: DeliveryResult;
    smsResult?: DeliveryResult;
  }> {
    let emailDelivered = false;
    let smsDelivered = false;
    let emailResult: DeliveryResult | undefined = undefined;
    let smsResult: DeliveryResult | undefined = undefined;

    // Failure isolation: Email channel
    if (params.recipientEmail) {
      try {
        emailResult = await this.sendEmail({
          to: params.recipientEmail,
          subject: `Appointment Reminder (${params.reminderType === '24_HOUR' ? 'Tomorrow' : 'In 1 Hour'})`,
          text: `Your consultation is scheduled for ${params.appointmentTime.toISOString()}.`,
        });
        emailDelivered = emailResult.sent;
      } catch (emailErr: any) {
        logger.error('Email provider error during reminder dispatch (channel isolated)', {
          appointmentId: params.appointmentId,
          error: emailErr.message,
        });
        emailResult = { sent: false, provider: 'SMTP_ERROR', error: emailErr.message };
        emailDelivered = false;
      }
    }

    // Failure isolation: SMS channel
    if (params.recipientPhone) {
      try {
        smsResult = await this.sendSms({
          to: params.recipientPhone,
          message: `MedCoreHMS Reminder: Your appointment is scheduled for ${params.appointmentTime.toLocaleTimeString()}.`,
        });
        smsDelivered = smsResult.sent;
      } catch (smsErr: any) {
        logger.error('SMS provider error during reminder dispatch (channel isolated)', {
          appointmentId: params.appointmentId,
          error: smsErr.message,
        });
        smsResult = { sent: false, provider: 'TWILIO_ERROR', error: smsErr.message };
        smsDelivered = false;
      }
    }

    logger.info('Appointment reminder dispatch evaluated', {
      appointmentId: params.appointmentId,
      reminderType: params.reminderType,
      emailDelivered,
      smsDelivered,
    });

    return { emailDelivered, smsDelivered, emailResult, smsResult };
  },
};
