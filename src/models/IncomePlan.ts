import { Schema, model } from 'mongoose';

const incomePlanSchema = new Schema(
  {
    monthKey: { type: String, required: true, index: true, unique: true },
    amountRupees: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

export const IncomePlan = model('IncomePlan', incomePlanSchema);

