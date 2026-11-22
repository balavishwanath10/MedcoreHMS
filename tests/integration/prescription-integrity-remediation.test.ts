import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { app } from '../../src/server/app.js';
import { makeRequest } from '../utils/inMemoryTestClient.js';
import { DoctorProfile } from '../../src/server/models/DoctorProfile.js';
import { generateAccessToken } from '../../src/server/utils/jwt.js';
import { ROLES, UserRole } from '../../src/shared/constants/roles.js';

describe('Doctor Digital Signature Integrity & Vector Sanitization Remediation Tests', () => {
  const hospitalAId = new mongoose.Types.ObjectId().toString();
  const doctorUserId = new mongoose.Types.ObjectId().toString();
  const doctorProfileId = new mongoose.Types.ObjectId().toString();

  const otherDoctorUserId = new mongoose.Types.ObjectId().toString();

  // 1x1 valid PNG
  const validPngDataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Valid Clean SVG
  const validCleanSvgContent =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><path d="M10 10 L90 40" stroke="black"/></svg>';
  const validSvgDataUri = `data:image/svg+xml;base64,${Buffer.from(validCleanSvgContent).toString('base64')}`;

  const createToken = (
    role: UserRole,
    hospitalId: string | null = hospitalAId,
    userId: string = doctorUserId,
  ) => {
    return generateAccessToken({
      userId,
      email: `${role.toLowerCase()}@hospital-medcore.com`,
      role,
      hospitalId,
    });
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('PNG Magic Bytes Verification', () => {
    it('should accept valid PNG signature containing genuine PNG magic bytes (200)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(mockDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: validPngDataUri,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDoctor.signatureData).toBe(validPngDataUri);
      expect(mockDoctor.save).toHaveBeenCalled();
    });

    it('SECURITY: should reject fake PNG payload missing PNG magic bytes (400 INVALID_IMAGE_FORMAT)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      // Fraudulent text file encoded as base64 claiming to be image/png
      const fakePngContent = 'THIS_IS_A_PLAIN_TEXT_PAYLOAD_NOT_A_PNG_FILE';
      const fakePngDataUri = `data:image/png;base64,${Buffer.from(fakePngContent).toString('base64')}`;

      const mockDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(mockDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: fakePngDataUri,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IMAGE_FORMAT');
      expect(res.body.error.message).toContain('magic bytes');
    });
  });

  describe('SVG Payload Sanitization & Malicious Script Vector Rejection', () => {
    it('should accept valid clean SVG signature (200)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const mockDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId,
        hospitalId: hospitalAId,
        isDeleted: false,
        save: vi.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(mockDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: validSvgDataUri,
          mimeType: 'image/svg+xml',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockDoctor.save).toHaveBeenCalled();
    });

    it('SECURITY: should reject SVG containing embedded <script> tags (400 MALICIOUS_SVG_PAYLOAD)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const maliciousSvg =
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>';
      const maliciousDataUri = `data:image/svg+xml;base64,${Buffer.from(maliciousSvg).toString('base64')}`;

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: maliciousDataUri,
          mimeType: 'image/svg+xml',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MALICIOUS_SVG_PAYLOAD');
      expect(res.body.error.message).toContain('prohibited active scripts');
    });

    it('SECURITY: should reject SVG containing onload event handlers (400 MALICIOUS_SVG_PAYLOAD)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const maliciousSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'/steal\')"><rect width="100" height="50"/></svg>';
      const maliciousDataUri = `data:image/svg+xml;base64,${Buffer.from(maliciousSvg).toString('base64')}`;

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: maliciousDataUri,
          mimeType: 'image/svg+xml',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MALICIOUS_SVG_PAYLOAD');
    });

    it('SECURITY: should reject SVG containing javascript: protocol (400 MALICIOUS_SVG_PAYLOAD)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      const maliciousSvg =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>Click</text></a></svg>';
      const maliciousDataUri = `data:image/svg+xml;base64,${Buffer.from(maliciousSvg).toString('base64')}`;

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: maliciousDataUri,
          mimeType: 'image/svg+xml',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MALICIOUS_SVG_PAYLOAD');
    });
  });

  describe('Data URI MIME Mismatch & Role Boundary', () => {
    it('should reject payload when data URI prefix mismatches claimed mimeType (400 MIME_TYPE_MISMATCH)', async () => {
      const doctorToken = createToken(ROLES.DOCTOR, hospitalAId, doctorUserId);

      // Data URI header says image/jpeg, but body says image/png
      const mismatchedDataUri = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${doctorToken}` },
        body: {
          signatureData: mismatchedDataUri,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('MIME_TYPE_MISMATCH');
    });

    it('should deny DOCTOR from uploading signature to another doctor profile (403 FORBIDDEN)', async () => {
      const otherDoctorToken = createToken(ROLES.DOCTOR, hospitalAId, otherDoctorUserId);

      const targetDoctor: any = {
        _id: doctorProfileId,
        userId: doctorUserId, // Owned by doctorUserId, NOT otherDoctorUserId!
        hospitalId: hospitalAId,
        isDeleted: false,
      };

      vi.spyOn(DoctorProfile, 'findOne').mockResolvedValue(targetDoctor);

      const res = await makeRequest(app, {
        method: 'POST',
        url: `/api/doctors/${doctorProfileId}/signature`,
        headers: { authorization: `Bearer ${otherDoctorToken}` },
        body: {
          signatureData: validPngDataUri,
          mimeType: 'image/png',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('only upload their own digital signature');
    });
  });
});
