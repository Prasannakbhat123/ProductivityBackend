import { Router } from 'express';
import { z } from 'zod';
import { AnalyticsLog } from '../models/AnalyticsLog';
import { BudgetCategory } from '../models/BudgetCategory';
import { Category } from '../models/Category';
import { Expense } from '../models/Expense';
import { Goal } from '../models/Goal';
import { RecurringRule } from '../models/RecurringRule';
import { Income } from '../models/Income';
import {
  addExpense,
  addIncome,
  deleteExpense,
  deleteIncome,
  getCategoryPerformance,
  getLedgerEntries,
  getMonthSummary,
  runMonthEndRollover,
  setBudgetForMonth,
  setIncomeForMonth,
  updateExpense,
  updateIncome,
} from '../services/financeService';
import { escapeRegex, parsePagination, toPaginatedResult } from '../utils/pagination';

export const financeRoutes = Router();

const rupeesSchema = z.number().min(0);
const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

async function syncCategoryMasterFromUsage(): Promise<void> {
  const [expenseCategories, budgetCategories, recurringCategories] = await Promise.all([
    Expense.distinct('category'),
    BudgetCategory.distinct('category'),
    RecurringRule.distinct('category'),
  ]);

  const allNames = new Set<string>([
    ...expenseCategories,
    ...budgetCategories,
    ...recurringCategories,
  ]);

  const operations = Array.from(allNames)
    .map((raw) => String(raw ?? '').trim())
    .filter(Boolean)
    .map((name) => ({
      updateOne: {
        filter: { name },
        update: { $setOnInsert: { name } },
        upsert: true,
      },
    }));

  if (operations.length === 0) return;
  await Category.bulkWrite(operations, { ordered: false });
}

financeRoutes.post('/income', async (request, response, next) => {
  try {
    const schema = z.object({
      monthKey: monthKeySchema,
      amountRupees: rupeesSchema,
      note: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const income = await setIncomeForMonth(input.monthKey, input.amountRupees, input.note ?? '');
    response.json(income);
  } catch (error) {
    next(error);
  }
});

financeRoutes.post('/budgets', async (request, response, next) => {
  try {
    const schema = z.object({
      monthKey: monthKeySchema,
      category: z.string().min(1),
      limitRupees: rupeesSchema,
    });
    const input = schema.parse(request.body);
    const budget = await setBudgetForMonth(input.monthKey, input.category, input.limitRupees);
    response.json(budget);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/budgets/:monthKey', async (request, response) => {
  const budgets = await BudgetCategory.find({ monthKey: request.params.monthKey }).sort({ category: 1 });
  response.json(budgets);
});

financeRoutes.delete('/budgets/:id', async (request, response) => {
  const budget = await BudgetCategory.findByIdAndDelete(request.params.id);
  if (!budget) {
    response.status(404).json({ message: 'Budget not found' });
    return;
  }
  response.json({ message: 'Budget deleted' });
});

financeRoutes.post('/incomes', async (request, response, next) => {
  try {
    const schema = z.object({
      amountRupees: rupeesSchema,
      source: z.string().min(1),
      note: z.string().optional(),
      date: z.coerce.date().optional(),
    });
    const input = schema.parse(request.body);
    const income = await addIncome(input);
    response.json(income);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/incomes', async (request, response) => {
  const dateKey = typeof request.query.dateKey === 'string' ? request.query.dateKey : '';
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : '';
  const source = typeof request.query.source === 'string' ? request.query.source.trim() : '';
  const note = typeof request.query.note === 'string' ? request.query.note.trim() : '';
  const { limit, page, skip } = parsePagination(request.query.limit, request.query.page, 25, 500);

  const query: Record<string, unknown> = {};
  if (dateKey) query.dateKey = dateKey;
  if (monthKey) query.monthKey = monthKey;
  if (source) query.source = source;
  if (note) query.note = { $regex: escapeRegex(note), $options: 'i' };

  const [items, total] = await Promise.all([
    Income.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Income.countDocuments(query),
  ]);

  response.json(toPaginatedResult(items, total, page, limit));
});

financeRoutes.patch('/incomes/:id', async (request, response, next) => {
  try {
    const schema = z.object({
      amountRupees: z.number().min(0).optional(),
      source: z.string().min(1).optional(),
      note: z.string().optional(),
      date: z.coerce.date().optional(),
    });
    const input = schema.parse(request.body);
    const updated = await updateIncome(request.params.id, input);
    if (!updated) {
      response.status(404).json({ message: 'Income not found' });
      return;
    }
    response.json(updated);
  } catch (error) {
    next(error);
  }
});

financeRoutes.delete('/incomes/:id', async (request, response, next) => {
  try {
    const result = await deleteIncome(request.params.id);
    if (!result) {
      response.status(404).json({ message: 'Income not found' });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

financeRoutes.post('/expenses', async (request, response, next) => {
  try {
    const schema = z.object({
      amountRupees: rupeesSchema,
      category: z.string().min(1),
      note: z.string().optional(),
      date: z.coerce.date().optional(),
      source: z.enum(['manual', 'recurring-auto', 'recurring-manual']).optional(),
      recurringRuleId: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const expense = await addExpense(input);
    response.json(expense);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/expenses', async (request, response) => {
  const dateKey = typeof request.query.dateKey === 'string' ? request.query.dateKey : '';
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : '';
  const category = typeof request.query.category === 'string' ? request.query.category.trim() : '';
  const note = typeof request.query.note === 'string' ? request.query.note.trim() : '';
  const minAmountRaw = typeof request.query.minAmount === 'string' ? request.query.minAmount : '';
  const maxAmountRaw = typeof request.query.maxAmount === 'string' ? request.query.maxAmount : '';
  const { limit, page, skip } = parsePagination(request.query.limit, request.query.page, 25, 500);

  const query: Record<string, unknown> = {};
  if (dateKey) query.dateKey = dateKey;
  if (monthKey) query.monthKey = monthKey;
  if (category) query.category = category;
  if (note) query.note = { $regex: escapeRegex(note), $options: 'i' };

  const minAmount = minAmountRaw === '' ? undefined : Number(minAmountRaw);
  const maxAmount = maxAmountRaw === '' ? undefined : Number(maxAmountRaw);
  if (minAmount !== undefined || maxAmount !== undefined) {
    const amountFilter: Record<string, number> = {};
    if (minAmount !== undefined && !Number.isNaN(minAmount)) amountFilter.$gte = minAmount;
    if (maxAmount !== undefined && !Number.isNaN(maxAmount)) amountFilter.$lte = maxAmount;
    if (Object.keys(amountFilter).length > 0) query.amountRupees = amountFilter;
  }

  const [expenses, total] = await Promise.all([
    Expense.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Expense.countDocuments(query),
  ]);

  response.json(toPaginatedResult(expenses, total, page, limit));
});

financeRoutes.patch('/expenses/:id', async (request, response, next) => {
  try {
    const schema = z.object({
      amountRupees: z.number().min(0).optional(),
      category: z.string().min(1).optional(),
      note: z.string().optional(),
      date: z.coerce.date().optional(),
    });
    const input = schema.parse(request.body);
    const updated = await updateExpense(request.params.id, input);
    if (!updated) {
      response.status(404).json({ message: 'Expense not found' });
      return;
    }
    response.json(updated);
  } catch (error) {
    next(error);
  }
});

financeRoutes.delete('/expenses/:id', async (request, response, next) => {
  try {
    const result = await deleteExpense(request.params.id);
    if (!result) {
      response.status(404).json({ message: 'Expense not found' });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/summary/:monthKey', async (request, response) => {
  const scopeQuery = typeof request.query.scope === 'string' ? request.query.scope : 'full';
  const scope = scopeQuery === 'todate' || scopeQuery === 'auto' ? scopeQuery : 'full';
  const summary = await getMonthSummary(request.params.monthKey, scope);
  response.json(summary);
});

financeRoutes.post('/rollover', async (request, response, next) => {
  try {
    const schema = z.object({ monthKey: monthKeySchema });
    const input = schema.parse(request.body);
    const entry = await runMonthEndRollover(input.monthKey);
    response.json(entry);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/ledger', async (request, response) => {
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : undefined;
  const reason = typeof request.query.reason === 'string' ? request.query.reason : undefined;
  const category = typeof request.query.category === 'string' ? request.query.category : undefined;
  const scopeQuery = typeof request.query.scope === 'string' ? request.query.scope : 'full';
  const scope = scopeQuery === 'todate' || scopeQuery === 'auto' ? scopeQuery : 'full';
  const limit = Number(typeof request.query.limit === 'string' ? request.query.limit : 100);
  const page = Number(typeof request.query.page === 'string' ? request.query.page : 1);

  const ledger = await getLedgerEntries({
    monthKey,
    scope,
    limit,
    page,
    reason,
    category,
  });
  response.json(ledger);
});

financeRoutes.get('/category-performance', async (request, response, next) => {
  try {
    const schema = z.object({
      monthKey: monthKeySchema,
      mode: z.enum(['cumulative', 'date']).default('cumulative'),
      dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      scope: z.enum(['full', 'todate', 'auto']).default('auto'),
    });

    const input = schema.parse({
      monthKey: request.query.monthKey,
      mode: request.query.mode,
      dateKey: request.query.dateKey,
      scope: request.query.scope,
    });

    const data = await getCategoryPerformance({
      monthKey: input.monthKey,
      mode: input.mode,
      dateKey: input.dateKey,
      scope: input.scope,
    });
    response.json(data);
  } catch (error) {
    next(error);
  }
});

financeRoutes.post('/goals', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      targetRupees: rupeesSchema.optional().default(0),
      dueDate: z.coerce.date().optional(),
    });
    const input = schema.parse(request.body);
    const goal = await Goal.create({
      title: input.title,
      targetRupees: input.targetRupees ?? 0,
      dueDate: input.dueDate ?? null,
    });
    response.json(goal);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/goals', async (_request, response) => {
  const goals = await Goal.find().sort({ createdAt: -1 });
  response.json(goals);
});

financeRoutes.post('/goals/:id/complete', async (request, response) => {
  const goal = await Goal.findByIdAndUpdate(
    request.params.id,
    { isCompleted: true, completedAt: new Date() },
    { new: true },
  );
  if (!goal) {
    response.status(404).json({ message: 'Goal not found' });
    return;
  }
  response.json(goal);
});

financeRoutes.patch('/goals/:id/status', async (request, response, next) => {
  try {
    const schema = z.object({ isCompleted: z.boolean() });
    const input = schema.parse(request.body);
    const goal = await Goal.findByIdAndUpdate(
      request.params.id,
      {
        isCompleted: input.isCompleted,
        completedAt: input.isCompleted ? new Date() : null,
      },
      { new: true },
    );
    if (!goal) {
      response.status(404).json({ message: 'Goal not found' });
      return;
    }
    response.json(goal);
  } catch (error) {
    next(error);
  }
});

financeRoutes.post('/recurring', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      amountRupees: rupeesSchema,
      category: z.string().min(1),
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      mode: z.enum(['reminder', 'auto-add']).default('reminder'),
      startDate: z.coerce.date(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
    });

    const input = schema.parse(request.body);
    const rule = await RecurringRule.create({
      ...input,
      isActive: true,
    });
    response.json(rule);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/recurring', async (_request, response) => {
  const rules = await RecurringRule.find().sort({ createdAt: -1 });
  response.json(rules);
});

financeRoutes.patch('/recurring/:id', async (request, response, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).optional(),
      amountRupees: rupeesSchema.optional(),
      category: z.string().min(1).optional(),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
      mode: z.enum(['reminder', 'auto-add']).optional(),
      dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
      dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
      startDate: z.coerce.date().optional(),
    });
    const input = schema.parse(request.body);
    const rule = await RecurringRule.findByIdAndUpdate(request.params.id, input, {
      returnDocument: 'after',
    });
    if (!rule) {
      response.status(404).json({ message: 'Recurring rule not found' });
      return;
    }
    response.json(rule);
  } catch (error) {
    next(error);
  }
});

financeRoutes.delete('/recurring/:id', async (request, response) => {
  const rule = await RecurringRule.findByIdAndDelete(request.params.id);
  if (!rule) {
    response.status(404).json({ message: 'Recurring rule not found' });
    return;
  }
  response.json({ message: 'Recurring rule deleted' });
});

financeRoutes.patch('/recurring/:id/toggle', async (request, response, next) => {
  try {
    const schema = z.object({ isActive: z.boolean() });
    const input = schema.parse(request.body);
    const rule = await RecurringRule.findByIdAndUpdate(
      request.params.id,
      { isActive: input.isActive },
      { returnDocument: 'after' },
    );
    if (!rule) {
      response.status(404).json({ message: 'Recurring rule not found' });
      return;
    }
    response.json(rule);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/analytics/logs', async (_request, response) => {
  const logs = await AnalyticsLog.find().sort({ updatedAt: -1 }).limit(200);
  response.json(logs);
});

// Category management endpoints
financeRoutes.get('/categories', async (_request, response) => {
  await syncCategoryMasterFromUsage();
  const categories = await Category.find().sort({ name: 1 });
  response.json(categories);
});

financeRoutes.post('/categories', async (request, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(50),
      color: z.string().optional(),
      icon: z.string().optional(),
      description: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const category = await Category.create(input);
    response.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

financeRoutes.get('/categories/:id', async (request, response) => {
  const category = await Category.findById(request.params.id);
  if (!category) {
    response.status(404).json({ message: 'Category not found' });
    return;
  }
  response.json(category);
});

financeRoutes.patch('/categories/:id', async (request, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(50).optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      description: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const category = await Category.findByIdAndUpdate(request.params.id, input, { returnDocument: 'after' });
    if (!category) {
      response.status(404).json({ message: 'Category not found' });
      return;
    }
    response.json(category);
  } catch (error) {
    next(error);
  }
});

financeRoutes.delete('/categories/:id', async (request, response, next) => {
  try {
    const category = await Category.findByIdAndDelete(request.params.id);
    if (!category) {
      response.status(404).json({ message: 'Category not found' });
      return;
    }
    response.json({ message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
});

// Get spending summary by category for a month
financeRoutes.get('/categories/:name/spending/:monthKey', async (request, response) => {
  const { name, monthKey } = request.params;
  const expenses = await Expense.find({ category: name, monthKey });
  const totalRupees = expenses.reduce((sum, exp) => sum + exp.amountRupees, 0);
  const count = expenses.length;
  response.json({ category: name, monthKey, totalRupees, count });
});

