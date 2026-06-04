import { Schema, model } from 'mongoose';

const calendarEventSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    startsAt: { type: Date, required: true, index: true },
    reminderMinutesBefore: { type: Number, min: 0, default: null },
    emailReminderEnabled: { type: Boolean, default: false },
    emailTo: { type: String, default: '' },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CalendarEvent = model('CalendarEvent', calendarEventSchema);
