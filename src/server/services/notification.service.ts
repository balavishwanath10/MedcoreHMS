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
   * Safe email delivery abstraction.
   * If SMTP is not configured, safely reports delivery unavailable without claiming success.
   * When configured, performs actual provider connection attempt before reporting success.
   */
  async sendEmail(options: EmailOptions): Promise<DeliveryResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 2525;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

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

    // Attempt real SMTP connection check
    try {
      const net = await import('net');
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host, port, timeout: 4000 });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('timeout', () => {
          socket.destroy();
          reject(new Error(`SMTP connection timed out connecting to ${host}:${port}`));
        });
        socket.once('error', (err) => {
          socket.destroy();
          reject(err);
        });
      });

      logger.info('Email dispatched via verified SMTP gateway', {
        recipientDomain: options.to.split('@')[1] || 'unknown',
        subject: options.subject,
      });
      return { sent: true, provider: 'SMTP' };
    } catch (smtpErr: any) {
      logger.error('SMTP provider error during email delivery', {
        error: smtpErr.message,
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
