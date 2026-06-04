import { Router } from 'express';
import { z } from 'zod';
import { CalendarEvent } from '../models/CalendarEvent';
import { Expense } from '../models/Expense';

export const calendarRoutes = Router();

calendarRoutes.get('/heatmap', async (request, response) => {
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : '';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    response.status(400).json({ message: 'monthKey query param is required as YYYY-MM' });
    return;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const expenses = await Expense.aggregate([
    { $match: { date: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: '$dateKey',
        totalRupees: { $sum: '$amountRupees' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  response.json(expenses);
});

calendarRoutes.get('/events', async (request, response) => {
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : '';
  const [year, month] = monthKey.split('-').map(Number);

  if (year && month) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const events = await CalendarEvent.find({ startsAt: { $gte: start, $lt: end } }).sort({ startsAt: 1 });
    response.json(events);
    return;
  }

  const events = await CalendarEvent.find().sort({ startsAt: 1 });
  response.json(events);
});

calendarRoutes.post('/events', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      startsAt: z.coerce.date(),
      reminderMinutesBefore: z.number().int().min(0).optional(),
      emailReminderEnabled: z.boolean().optional(),
      emailTo: z.string().trim().optional().or(z.literal('')),
    }).superRefine((value, context) => {
      if (value.emailReminderEnabled && (!value.emailTo || !z.string().email().safeParse(value.emailTo).success)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid email is required when email reminder is enabled',
          path: ['emailTo'],
        });
      }
    });

    const input = schema.parse(request.body);

    const event = await CalendarEvent.create({
      title: input.title,
      description: input.description ?? '',
      startsAt: input.startsAt,
      reminderMinutesBefore: input.reminderMinutesBefore ?? null,
      emailReminderEnabled: input.emailReminderEnabled ?? false,
      emailTo: input.emailReminderEnabled ? input.emailTo ?? '' : '',
    });

    response.json(event);
  } catch (error) {
    next(error);
  }
});

