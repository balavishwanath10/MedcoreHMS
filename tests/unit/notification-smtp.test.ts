import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { notificationService } from '../../src/server/services/notification.service.js';

describe('Notification Service — SMTP Delivery Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // 1. MOCKED SMTP PROVIDER TESTS (Clearly Distinguished)
  // =========================================================================
  describe('Mocked SMTP Provider Unit Tests (Nodemailer)', () => {
    it('MOCKED: should return sent: true with messageId when SMTP gateway accepts message', async () => {
      process.env.SMTP_HOST = 'smtp.hospital.local';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'notifications@hospital.local';
      process.env.SMTP_PASS = 'mock_secret_password';

      const mockSendMail = vi.fn().mockResolvedValue({
        messageId: '<20261122-accepted-id-123@smtp.hospital.local>',
        response: '250 OK: message queued',
      });

      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: mockSendMail,
      } as any);

      const result = await notificationService.sendEmail({
        to: 'patient@example.com',
        subject: 'Appointment Confirmation',
        text: 'Your appointment is confirmed for tomorrow.',
      });

      expect(result.sent).toBe(true);
      expect(result.provider).toBe('SMTP');
      expect(result.messageId).toBe('<20261122-accepted-id-123@smtp.hospital.local>');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'patient@example.com',
          subject: 'Appointment Confirmation',
          text: 'Your appointment is confirmed for tomorrow.',
        }),
      );
    });

    it('MOCKED: should return sent: false and capture error when SMTP authentication fails (535)', async () => {
      process.env.SMTP_HOST = 'smtp.hospital.local';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'notifications@hospital.local';
      process.env.SMTP_PASS = 'invalid_password';

      const mockSendMail = vi.fn().mockRejectedValue({
        code: 'EAUTH',
        response: '535 5.7.8 Authentication credentials invalid',
        message: 'Invalid login: 535 5.7.8 Authentication credentials invalid',
      });

      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: mockSendMail,
      } as any);

      const result = await notificationService.sendEmail({
        to: 'patient@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      });

      expect(result.sent).toBe(false);
      expect(result.provider).toBe('SMTP');
      expect(result.error).toContain('Invalid login');
    });

    it('MOCKED: should return sent: false when SMTP gateway connection times out', async () => {
      process.env.SMTP_HOST = 'smtp.hospital.local';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'notifications@hospital.local';
      process.env.SMTP_PASS = 'mock_secret_password';

      const mockSendMail = vi.fn().mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Connection timeout connecting to smtp.hospital.local:587',
      });

      vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: mockSendMail,
      } as any);

      const result = await notificationService.sendEmail({
        to: 'patient@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      });

      expect(result.sent).toBe(false);
      expect(result.provider).toBe('SMTP');
      expect(result.error).toContain('Connection timeout');
    });

    it('MOCKED: should return SMTP_UNAVAILABLE when credentials are unconfigured or placeholder without claiming success', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      const result = await notificationService.sendEmail({
        to: 'patient@example.com',
        subject: 'Test Subject',
        text: 'Test Body',
      });

      expect(result.sent).toBe(false);
      expect(result.provider).toBe('SMTP_UNAVAILABLE');
      expect(result.reason).toContain('absent or placeholder');
    });
  });

  // =========================================================================
  // 2. LIVE SMTP PROVIDER VERIFICATION (Clearly Distinguished)
  // =========================================================================
  describe('Live SMTP Provider Delivery Tests (Real External Gateway)', () => {
    it('LIVE: reports BLOCKED / SKIPPED when real external SMTP credentials are not configured', async () => {
      const hasRealSmtp = Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_HOST !== 'placeholder' &&
        process.env.SMTP_USER &&
        process.env.SMTP_USER !== 'placeholder' &&
        process.env.SMTP_PASS &&
        process.env.SMTP_PASS !== 'placeholder' &&
        process.env.RUN_LIVE_PROVIDER_TESTS === 'true',
      );

      if (!hasRealSmtp) {
        console.log(
          '[STATUS: BLOCKED / SKIPPED] Live SMTP delivery verification skipped because external SMTP credentials are not configured in test environment.',
        );
        expect(true).toBe(true);
        return;
      }

      // If RUN_LIVE_PROVIDER_TESTS=true and credentials present, execute live dispatch
      const liveResult = await notificationService.sendEmail({
        to: process.env.SMTP_USER!,
        subject: 'MedCoreHMS Live SMTP Verification',
        text: 'Automated test verifying real SMTP transmission.',
      });

      expect(liveResult.sent).toBe(true);
    });
  });
});
