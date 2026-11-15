import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser, UserRole, UserStatus, ALL_ROLES } from '../../shared/types/index.js';

export interface UserDocument extends Omit<IUser, '_id' | 'hospitalId'>, Document {
  hospitalId?: mongoose.Types.ObjectId | null;
}

const userSchema = new Schema<UserDocument>(
  {
    hospitalId: {
      type: Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
      validate: {
        validator: function (this: UserDocument, val: mongoose.Types.ObjectId | null) {
          // SUPER_ADMIN has null hospitalId; all other roles MUST have a hospitalId
          if (this.role === 'SUPER_ADMIN') {
            return val === null || val === undefined;
          }
          return val !== null && val !== undefined;
        },
        message: 'hospitalId is required for all hospital-scoped roles',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address format'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false, // Omit from default queries
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ALL_ROLES as UserRole[],
        message: '{VALUE} is not a recognized PRD role',
      },
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    phone: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'INACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED'] as UserStatus[],
        message: '{VALUE} is not a valid user status',
      },
      default: 'ACTIVE',
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
      default: null,
    },
    emailOtpHash: {
      type: String,
      select: false,
      default: null,
    },
    emailOtpExpires: {
      type: Date,
      select: false,
      default: null,
    },
    emailOtpAttempts: {
      type: Number,
      select: false,
      default: 0,
    },
    phoneOtpHash: {
      type: String,
      select: false,
      default: null,
    },
    phoneOtpExpires: {
      type: Date,
      select: false,
      default: null,
    },
    phoneOtpAttempts: {
      type: Number,
      select: false,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash; // Critical security safeguard
        delete ret.passwordResetTokenHash;
        delete ret.emailOtpHash;
        delete ret.phoneOtpHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash; // Critical security safeguard
        delete ret.passwordResetTokenHash;
        delete ret.emailOtpHash;
        delete ret.phoneOtpHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ hospitalId: 1, role: 1 });
userSchema.index({ hospitalId: 1, isDeleted: 1 });

export const User: Model<UserDocument> =
  mongoose.models.User || mongoose.model<UserDocument>('User', userSchema);
