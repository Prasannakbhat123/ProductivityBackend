import { Schema, model } from 'mongoose';

const budgetCategorySchema = new Schema(
  {
    monthKey: { type: String, required: true, index: true },
    category: { type: String, required: true },
    limitRupees: { type: Number, required: true, min: 0 },
    spentRupees: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

budgetCategorySchema.index({ monthKey: 1, category: 1 }, { unique: true });

export const BudgetCategory = model('BudgetCategory', budgetCategorySchema);

