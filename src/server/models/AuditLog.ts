import mongoose, { Schema, Document, Model } from 'mongoose';
import { IAuditLog } from '../../shared/types/index.js';

export interface AuditLogDocument extends Omit<IAuditLog, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const AuditLogSchema = new Schema<AuditLogDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      default: null,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    details: {
      type: Schema.Types.Mixed,
    },
    diff: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  },
);

// Compound indexes for tenant audit querying
AuditLogSchema.index({ hospitalId: 1, timestamp: -1 });
AuditLogSchema.index({ hospitalId: 1, entityType: 1, entityId: 1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });

export const AuditLog: Model<AuditLogDocument> =
  (mongoose.models.AuditLog as Model<AuditLogDocument>) ||
  mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
