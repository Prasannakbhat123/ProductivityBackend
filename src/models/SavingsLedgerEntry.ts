import { Schema, model } from 'mongoose';

const savingsLedgerEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    monthKey: { type: String, required: true, index: true },
    reason: {
      type: String,
      enum: [
        'overspend-adjustment',
        'month-end-rollover',
        'goal-allocation',
        'goal-release',
        'manual-correction',
      ],
      required: true,
    },
    deltaRupees: { type: Number, required: true },
    balanceAfterRupees: { type: Number, required: true },
    referenceType: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    note: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const SavingsLedgerEntry = model('SavingsLedgerEntry', savingsLedgerEntrySchema);

