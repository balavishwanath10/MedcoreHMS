import mongoose, { Schema, Document, Model } from 'mongoose';
import { IInventoryBatch } from '../../shared/types/index.js';

export interface InventoryBatchDocument extends Omit<IInventoryBatch, '_id'>, Document {
  _id: mongoose.Types.ObjectId;
}

const InventoryBatchSchema = new Schema<InventoryBatchDocument>(
  {
    hospitalId: {
      type: String,
      ref: 'Hospital',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    medicineId: {
      type: String,
      ref: 'Medicine',
      required: [true, 'Medicine ID is required'],
      index: true,
    },
    medicineName: {
      type: String,
      trim: true,
    },
    batchNumber: {
      type: String,
      required: [true, 'Batch number is required'],
      trim: true,
      maxlength: 100,
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
      index: true,
    },
    manufactureDate: {
      type: Date,
    },
    quantityReceived: {
      type: Number,
      required: [true, 'Quantity received is required'],
      min: [1, 'Quantity received must be at least 1'],
    },
    quantityAvailable: {
      type: Number,
      required: [true, 'Quantity available is required'],
      min: [0, 'Quantity available cannot be negative'],
    },
    unitCost: {
      type: Number,
      required: [true, 'Unit cost is required'],
      min: [0, 'Unit cost cannot be negative'],
    },
    mrp: {
      type: Number,
      required: [true, 'Maximum Retail Price (MRP) is required'],
      min: [0, 'MRP cannot be negative'],
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'QUARANTINED', 'DEPLETED'],
      default: 'ACTIVE',
      index: true,
    },
    reorderThreshold: {
      type: Number,
      default: 20,
      min: 0,
    },
    locationRack: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    supplier: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
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

// Compound indexes for FEFO & FIFO sorting and efficient multi-tenant querying
InventoryBatchSchema.index({ hospitalId: 1, medicineId: 1, expiryDate: 1, receivedAt: 1 });
InventoryBatchSchema.index({ hospitalId: 1, medicineId: 1, receivedAt: 1, expiryDate: 1 });
InventoryBatchSchema.index({ hospitalId: 1, status: 1, expiryDate: 1 });
InventoryBatchSchema.index({ hospitalId: 1, batchNumber: 1, medicineId: 1 }, { unique: true });

export const InventoryBatch: Model<InventoryBatchDocument> =
  (mongoose.models.InventoryBatch as Model<InventoryBatchDocument>) ||
  mongoose.model<InventoryBatchDocument>('InventoryBatch', InventoryBatchSchema);
