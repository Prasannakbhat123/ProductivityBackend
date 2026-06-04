import { Schema, model } from 'mongoose';

const incomeSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    amountRupees: { type: Number, required: true, min: 0 },
    source: { type: String, required: true, index: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Income = model('Income', incomeSchema);
