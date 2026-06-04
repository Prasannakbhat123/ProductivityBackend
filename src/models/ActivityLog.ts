import { Schema, model } from 'mongoose';

const activityLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, default: '' },
    monthKey: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    category: { type: String, default: '', index: true },
    label: { type: String, default: '' },
    amountRupees: { type: Number, min: 0 },
    message: { type: String, required: true },
  },
  { timestamps: true },
);

activityLogSchema.index({ createdAt: -1 });

export const ActivityLog = model('ActivityLog', activityLogSchema);
