import { Schema, model } from 'mongoose';

const expenseSchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    amountRupees: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, index: true },
    note: { type: String, default: '' },
    source: {
      type: String,
      enum: ['manual', 'recurring-auto', 'recurring-manual'],
      default: 'manual',
    },
    recurringRuleId: { type: Schema.Types.ObjectId, ref: 'RecurringRule', default: null },
  },
  { timestamps: true },
);

export const Expense = model('Expense', expenseSchema);

