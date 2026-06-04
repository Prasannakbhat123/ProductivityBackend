import mongoose from 'mongoose';
import { env } from '../config/env';
import { AnalyticsLog } from '../models/AnalyticsLog';
import { BudgetCategory } from '../models/BudgetCategory';
import { CalendarEvent } from '../models/CalendarEvent';
import { Category } from '../models/Category';
import { Expense } from '../models/Expense';
import { Goal } from '../models/Goal';
import { Income } from '../models/Income';
import { IncomePlan } from '../models/IncomePlan';
import { Notebook } from '../models/Notebook';
import { RecurringRule } from '../models/RecurringRule';
import { SavingsLedgerEntry } from '../models/SavingsLedgerEntry';

async function flushDatabase() {
  const force = process.argv.includes('--force') || process.env.ALLOW_FLUSH === 'true';
  if (!force) {
    console.error('Refusing to flush: this deletes ALL app data.');
    console.error('Run: npm run db:flush -- --force');
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);
  console.log('Connected. Flushing all LedgerFlow collections...');

  const results = await Promise.all([
    Expense.deleteMany({}),
    BudgetCategory.deleteMany({}),
    Income.deleteMany({}),
    IncomePlan.deleteMany({}),
    SavingsLedgerEntry.deleteMany({}),
    Goal.deleteMany({}),
    RecurringRule.deleteMany({}),
    CalendarEvent.deleteMany({}),
    AnalyticsLog.deleteMany({}),
    Category.deleteMany({}),
    Notebook.deleteMany({}),
  ]);

  const total = results.reduce((sum, r) => sum + r.deletedCount, 0);
  console.log(`Done. Deleted ${total} documents across 11 collections.`);
  console.log('You can start fresh from next month.');

  await mongoose.disconnect();
}

flushDatabase().catch(async (error) => {
  console.error('Flush failed', error);
  await mongoose.disconnect();
  process.exit(1);
});
