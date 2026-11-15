import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';

export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  tokenHash: string;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface RefreshTokenDocument extends IRefreshToken, Document {}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
    },
    familyId: {
      type: String,
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.index({ familyId: 1 });
// TTL index: automatically remove documents after expiresAt
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken: Model<RefreshTokenDocument> =
  mongoose.models.RefreshToken ||
  mongoose.model<RefreshTokenDocument>('RefreshToken', refreshTokenSchema);
