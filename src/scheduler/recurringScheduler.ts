import cron from 'node-cron';
import { CalendarEvent } from '../models/CalendarEvent';
import { RecurringRule } from '../models/RecurringRule';
import { addExpense } from '../services/financeService';
import { sendReminderMail } from '../services/emailService';
import { publishRealtimeEvent } from '../services/realtime';
import { env } from '../config/env';
import { getDateKey } from '../utils/time';

function shouldRunRuleToday(rule: {
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
}, now: Date): boolean {
  if (rule.frequency === 'daily') {
    return true;
  }

  if (rule.frequency === 'weekly') {
    return rule.dayOfWeek === now.getUTCDay();
  }

  const day = now.getUTCDate();
  if (rule.dayOfMonth) {
    return day === rule.dayOfMonth;
  }

  return day === 1;
}

export function startRecurringScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    const todayKey = getDateKey(now);

    const rules = await RecurringRule.find({ isActive: true });

    for (const rule of rules) {
      if (rule.lastProcessedDateKey === todayKey) {
        continue;
      }

      if (!shouldRunRuleToday(rule, now)) {
        continue;
      }

      if (rule.mode === 'auto-add') {
        await addExpense({
          amountRupees: rule.amountRupees,
          category: rule.category,
          note: `Recurring: ${rule.title}`,
          date: now,
          source: 'recurring-auto',
          recurringRuleId: String(rule._id),
        });
      } else {
        publishRealtimeEvent('recurring.reminder', {
          title: rule.title,
          amountRupees: rule.amountRupees,
          category: rule.category,
        });

        const recipient = env.defaultReminderEmail;
        if (recipient) {
          await sendReminderMail({
            to: recipient,
            subject: `Recurring reminder: ${rule.title}`,
            text: `Reminder for recurring expense ${rule.title} (${rule.category}) amount INR ${rule.amountRupees}.`,
          });
        }
      }

      rule.lastProcessedDateKey = todayKey;
      await rule.save();
    }

    const reminderEvents = await CalendarEvent.find({
      emailReminderEnabled: true,
      reminderSentAt: null,
      reminderMinutesBefore: { $ne: null },
    });

    for (const event of reminderEvents) {
      if (!event.emailTo) {
        continue;
      }

      const reminderTime = new Date(event.startsAt.getTime() - (event.reminderMinutesBefore ?? 0) * 60000);
      if (reminderTime <= now) {
        await sendReminderMail({
          to: event.emailTo,
          subject: `Event reminder: ${event.title}`,
          text: `Your event starts at ${event.startsAt.toISOString()}. ${event.description ?? ''}`,
        });
        event.reminderSentAt = now;
        await event.save();
      }
    }
  });
}

