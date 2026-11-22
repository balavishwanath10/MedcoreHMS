import mongoose, { Schema, Document, Model } from 'mongoose';
import { IInvoice, IInvoiceLineItem, ITpaClaimDetails } from '../../shared/types/index.js';

export interface InvoiceDocument extends Omit<IInvoice, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const InvoiceLineItemSchema = new Schema<IInvoiceLineItem>(
  {
    itemType: {
      type: String,
      enum: ['CONSULTATION', 'PHARMACY', 'LABORATORY', 'PROCEDURE', 'ROOM_BED', 'OTHER'],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    referenceId: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const TpaClaimSubSchema = new Schema<ITpaClaimDetails>(
  {
    providerName: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    preAuthCode: { type: String, trim: true },
    claimAmount: { type: Number, required: true, min: 0 },
    approvedAmount: { type: Number, min: 0 },
    claimStatus: {
      type: String,
      enum: ['SUBMITTED', 'PRE_AUTHORIZED', 'SETTLED', 'REJECTED'],
      default: 'SUBMITTED',
    },
    claimNotes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const InvoiceSchema = new Schema<InvoiceDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    patientId: {
      type: String,
      ref: 'PatientProfile',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    encounterId: {
      type: String,
      ref: 'Encounter',
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      trim: true,
      index: true,
    },
    lineItems: {
      type: [InvoiceLineItemSchema],
      validate: {
        validator: (v: IInvoiceLineItem[]) => Array.isArray(v) && v.length > 0,
        message: 'Invoice must contain at least one line item',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    balanceDue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'VOID'],
      default: 'ISSUED',
      index: true,
    },
    tpaClaim: {
      type: TpaClaimSubSchema,
    },
    dueDate: {
      type: Date,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

InvoiceSchema.index({ hospitalId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
InvoiceSchema.index({ hospitalId: 1, status: 1 });
InvoiceSchema.index({ hospitalId: 1, encounterId: 1 });

export const Invoice: Model<InvoiceDocument> =
  (mongoose.models.Invoice as Model<InvoiceDocument>) ||
  mongoose.model<InvoiceDocument>('Invoice', InvoiceSchema);
