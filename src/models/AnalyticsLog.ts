import { Schema, model } from 'mongoose';

const analyticsLogSchema = new Schema(
  {
    logType: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true, index: true },
    periodKey: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

analyticsLogSchema.index({ logType: 1, periodKey: 1 }, { unique: true });

export const AnalyticsLog = model('AnalyticsLog', analyticsLogSchema);
