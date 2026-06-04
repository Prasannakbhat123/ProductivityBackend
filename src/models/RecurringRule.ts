import { Schema, model } from 'mongoose';

const recurringRuleSchema = new Schema(
  {
    title: { type: String, required: true },
    amountRupees: { type: Number, required: true, min: 0 },
    category: { type: String, required: true },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    mode: { type: String, enum: ['reminder', 'auto-add'], default: 'reminder' },
    startDate: { type: Date, required: true },
    dayOfMonth: { type: Number, min: 1, max: 31, default: null },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    isActive: { type: Boolean, default: true, index: true },
    lastProcessedDateKey: { type: String, default: '' },
  },
  { timestamps: true },
);

export const RecurringRule = model('RecurringRule', recurringRuleSchema);

