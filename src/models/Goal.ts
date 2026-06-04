import { Schema, model } from 'mongoose';

const goalSchema = new Schema(
  {
    title: { type: String, required: true },
    targetRupees: { type: Number, required: true, min: 0 },
    currentRupees: { type: Number, required: true, min: 0, default: 0 },
    isCompleted: { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Goal = model('Goal', goalSchema);

