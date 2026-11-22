import mongoose, { Schema, Document, Model } from 'mongoose';
import { IPaymentTransaction } from '../../shared/types/index.js';

export interface PaymentTransactionDocument extends Omit<IPaymentTransaction, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const PaymentTransactionSchema = new Schema<PaymentTransactionDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    invoiceId: {
      type: String,
      ref: 'Invoice',
      required: [true, 'Invoice ID is required'],
      index: true,
    },
    patientId: {
      type: String,
      ref: 'PatientProfile',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'STRIPE', 'RAZORPAY', 'INSURANCE_TPA'],
      required: [true, 'Payment method is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be greater than 0'],
    },
    currency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    transactionReference: {
      type: String,
      required: [true, 'Transaction reference is required'],
      trim: true,
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED'],
      default: 'SUCCESS',
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    recordedBy: {
      type: String,
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

PaymentTransactionSchema.index({ hospitalId: 1, invoiceId: 1 });
PaymentTransactionSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
PaymentTransactionSchema.index(
  { hospitalId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);

export const PaymentTransaction: Model<PaymentTransactionDocument> =
  (mongoose.models.PaymentTransaction as Model<PaymentTransactionDocument>) ||
  mongoose.model<PaymentTransactionDocument>('PaymentTransaction', PaymentTransactionSchema);
