import { Types } from 'mongoose';
import { AnalyticsLog } from '../models/AnalyticsLog';
import { BudgetCategory } from '../models/BudgetCategory';
import { Category } from '../models/Category';
import { Expense } from '../models/Expense';
import { Income } from '../models/Income';
import { IncomePlan } from '../models/IncomePlan';
import { SavingsLedgerEntry } from '../models/SavingsLedgerEntry';
import { parsePagination, toPaginatedResult } from '../utils/pagination';
import { getDateKey, getMonthKey, getWeekKey } from '../utils/time';
import { formatRupeesForLog, recordActivityLog } from './activityLogService';
import { publishRealtimeEvent } from './realtime';

type AddExpenseInput = {
  amountRupees: number;
  category: string;
  note?: string;
  date?: Date;
  source?: 'manual' | 'recurring-auto' | 'recurring-manual';
  recurringRuleId?: string;
};

type UpdateExpenseInput = {
  amountRupees?: number;
  category?: string;
  note?: string;
  date?: Date;
};

type AddIncomeInput = {
  amountRupees: number;
  source: string;
  note?: string;
  date?: Date;
};

type UpdateIncomeInput = {
  amountRupees?: number;
  source?: string;
  note?: string;
  date?: Date;
};

async function sumIncomeRupees(filter: Record<string, unknown>): Promise<number> {
  const rows = await Income.find(filter).select('amountRupees');
  return rows.reduce((sum, row) => sum + row.amountRupees, 0);
}

type ScopeMode = 'full' | 'todate' | 'auto';

function getMonthBounds(monthKey: string): { start: Date; endExclusive: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  return { start, endExclusive };
}

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return getMonthKey(date);
}

function resolveScopedEndExclusive(monthKey: string, scope: ScopeMode, dateKey?: string): Date {
  const { endExclusive } = getMonthBounds(monthKey);
  const isCurrentMonth = monthKey === getMonthKey(new Date());

  let scopedEndExclusive = endExclusive;
  if (scope === 'todate' || (scope === 'auto' && isCurrentMonth)) {
    const now = new Date();
    scopedEndExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  }

  if (dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const dateScoped = new Date(Date.UTC(year, month - 1, day + 1));
      scopedEndExclusive = new Date(Math.min(scopedEndExclusive.getTime(), dateScoped.getTime()));
    }
  }

  return scopedEndExclusive;
}

async function getIncomeAndSpentForMonth(monthKey: string): Promise<{ incomeRupees: number; spentRupees: number }> {
  const [incomeRupees, expenses] = await Promise.all([
    sumIncomeRupees({ monthKey }),
    Expense.find({ monthKey }).select('amountRupees'),
  ]);

  return {
    incomeRupees,
    spentRupees: expenses.reduce((sum, item) => sum + item.amountRupees, 0),
  };
}

async function ensureCategoryExists(categoryName: string): Promise<void> {
  const name = categoryName.trim();
  if (!name) return;
  await Category.updateOne(
    { name },
    { $setOnInsert: { name } },
    { upsert: true },
  );
}

function buildEffectiveBudgetLimitMap(params: {
  currentMonthBudgets: Array<{ category: string; limitRupees: number }>;
  previousMonthBudgets: Array<{ category: string; limitRupees: number }>;
}): Map<string, number> {
  const effectiveLimitByCategory = new Map<string, number>();

  for (const budget of params.previousMonthBudgets) {
    effectiveLimitByCategory.set(budget.category, budget.limitRupees);
  }

  for (const budget of params.currentMonthBudgets) {
    effectiveLimitByCategory.set(budget.category, budget.limitRupees);
  }

  return effectiveLimitByCategory;
}

async function getSavingsBalance(): Promise<number> {
  const latest = await SavingsLedgerEntry.findOne().sort({ createdAt: -1 });
  return latest?.balanceAfterRupees ?? 0;
}

async function appendSavingsLedgerEntry(params: {
  date: Date;
  reason: 'overspend-adjustment' | 'month-end-rollover' | 'goal-allocation' | 'goal-release' | 'manual-correction';
  deltaRupees: number;
  note?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const currentBalance = await getSavingsBalance();
  const balanceAfterRupees = currentBalance + params.deltaRupees;
  const monthKey = getMonthKey(params.date);

  await SavingsLedgerEntry.create({
    date: params.date,
    monthKey,
    reason: params.reason,
    deltaRupees: params.deltaRupees,
    balanceAfterRupees,
    note: params.note ?? '',
    referenceType: params.referenceType ?? '',
    referenceId: params.referenceId ?? '',
    metadata: params.metadata ?? {},
  });
}

const MONTHLY_SALARY_SOURCE = 'Salary';

function isMonthlySalarySource(source: string): boolean {
  return source.trim().toLowerCase() === MONTHLY_SALARY_SOURCE.toLowerCase();
}

export async function setIncomeForMonth(monthKey: string, amountRupees: number, note = '') {
  await IncomePlan.findOneAndUpdate(
    { monthKey },
    { monthKey, amountRupees, note },
    { returnDocument: 'after', upsert: true },
  );

  await Income.deleteMany({ monthKey, source: { $regex: /^salary$/i } });

  const date = new Date(`${monthKey}-01T12:00:00.000Z`);
  const income = await Income.create({
    date,
    dateKey: getDateKey(date),
    monthKey,
    amountRupees,
    source: MONTHLY_SALARY_SOURCE,
    note: note || 'Monthly salary',
  });

  publishRealtimeEvent('income.updated', income);
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(monthKey));
  await recordActivityLog({
    action: 'salary.updated',
    entityType: 'salary',
    entityId: String(income._id),
    monthKey,
    dateKey: getDateKey(date),
    amountRupees,
    message: `Set monthly salary to ${formatRupeesForLog(amountRupees)} for ${monthKey}`,
  });
  return income;
}

export async function addIncome(input: AddIncomeInput) {
  const date = input.date ?? new Date();
  const monthKey = getMonthKey(date);
  const dateKey = getDateKey(date);

  if (isMonthlySalarySource(input.source)) {
    return setIncomeForMonth(monthKey, input.amountRupees, input.note ?? '');
  }

  const income = await Income.create({
    date,
    dateKey,
    monthKey,
    amountRupees: input.amountRupees,
    source: input.source.trim(),
    note: input.note ?? '',
  });

  publishRealtimeEvent('income.created', income);
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(monthKey));
  await recordActivityLog({
    action: 'income.created',
    entityType: 'income',
    entityId: String(income._id),
    monthKey,
    dateKey,
    label: income.source,
    amountRupees: income.amountRupees,
    message: `Added one-time income ${income.source} ${formatRupeesForLog(income.amountRupees)} on ${dateKey}`,
  });
  return income;
}

export async function updateIncome(incomeId: string, input: UpdateIncomeInput) {
  const existing = await Income.findById(incomeId);
  if (!existing) {
    return null;
  }

  const date = input.date ?? existing.date;
  existing.date = date;
  existing.dateKey = getDateKey(date);
  existing.monthKey = getMonthKey(date);
  if (typeof input.amountRupees === 'number') existing.amountRupees = input.amountRupees;
  if (typeof input.source === 'string') existing.source = input.source.trim();
  if (typeof input.note === 'string') existing.note = input.note;

  await existing.save();
  publishRealtimeEvent('income.updated', existing);
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(existing.monthKey));
  const entityType = isMonthlySalarySource(existing.source) ? 'salary' : 'income';
  await recordActivityLog({
    action: entityType === 'salary' ? 'salary.updated' : 'income.updated',
    entityType,
    entityId: String(existing._id),
    monthKey: existing.monthKey,
    dateKey: existing.dateKey,
    label: existing.source,
    amountRupees: existing.amountRupees,
    message: `Updated ${entityType === 'salary' ? 'monthly salary' : `income ${existing.source}`} to ${formatRupeesForLog(existing.amountRupees)} on ${existing.dateKey}`,
  });
  return existing;
}

export async function deleteIncome(incomeId: string) {
  const existing = await Income.findById(incomeId);
  if (!existing) {
    return null;
  }

  const monthKey = existing.monthKey;
  const entityType = isMonthlySalarySource(existing.source) ? 'salary' : 'income';
  await recordActivityLog({
    action: entityType === 'salary' ? 'salary.deleted' : 'income.deleted',
    entityType,
    entityId: incomeId,
    monthKey,
    dateKey: existing.dateKey,
    label: existing.source,
    amountRupees: existing.amountRupees,
    message: `Deleted ${entityType === 'salary' ? 'monthly salary' : `income ${existing.source}`} ${formatRupeesForLog(existing.amountRupees)} from ${existing.dateKey}`,
  });
  await existing.deleteOne();
  publishRealtimeEvent('income.deleted', { incomeId, monthKey });
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(monthKey));
  return { ok: true };
}

export async function setBudgetForMonth(monthKey: string, category: string, limitRupees: number) {
  await ensureCategoryExists(category);
  const budget = await BudgetCategory.findOneAndUpdate(
    { monthKey, category },
    { monthKey, category, limitRupees },
    { returnDocument: 'after', upsert: true },
  );
  publishRealtimeEvent('budget.updated', budget);
  await recordActivityLog({
    action: 'budget.updated',
    entityType: 'budget',
    entityId: String(budget?._id ?? ''),
    monthKey,
    dateKey: `${monthKey}-01`,
    category,
    amountRupees: limitRupees,
    message: `Set ${category} budget to ${formatRupeesForLog(limitRupees)} for ${monthKey}`,
  });
  return budget;
}

export async function addExpense(input: AddExpenseInput) {
  await ensureCategoryExists(input.category);
  const date = input.date ?? new Date();
  const monthKey = getMonthKey(date);
  const dateKey = getDateKey(date);

  const expense = await Expense.create({
    date,
    dateKey,
    monthKey,
    amountRupees: input.amountRupees,
    category: input.category,
    note: input.note ?? '',
    source: input.source ?? 'manual',
    recurringRuleId: input.recurringRuleId ? new Types.ObjectId(input.recurringRuleId) : null,
  });

  await reconcileCategoryOverspend(monthKey, input.category, date, String(expense._id), 'expense-created');

  await refreshAnalyticsForDate(date);

  publishRealtimeEvent('expense.created', expense);
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(monthKey));
  await recordActivityLog({
    action: 'expense.created',
    entityType: 'expense',
    entityId: String(expense._id),
    monthKey,
    dateKey,
    category: input.category,
    amountRupees: input.amountRupees,
    message: `Added expense ${input.category} ${formatRupeesForLog(input.amountRupees)} on ${dateKey}`,
  });

  return expense;
}

async function reconcileCategoryOverspend(
  monthKey: string,
  category: string,
  referenceDate: Date,
  referenceId: string,
  action: 'expense-created' | 'expense-updated' | 'expense-deleted',
) {
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const [currentMonthBudget, previousMonthBudget, spendRows] = await Promise.all([
    BudgetCategory.findOne({ monthKey, category }),
    BudgetCategory.findOne({ monthKey: previousMonthKey, category }).select('limitRupees'),
    Expense.find({ monthKey, category }).select('amountRupees'),
  ]);

  const spentRupees = spendRows.reduce((sum, row) => sum + row.amountRupees, 0);
  if (currentMonthBudget) {
    currentMonthBudget.spentRupees = spentRupees;
    await currentMonthBudget.save();
  }

  const effectiveLimitRupees = currentMonthBudget?.limitRupees ?? previousMonthBudget?.limitRupees ?? 0;

  const desiredOverspendRupees = effectiveLimitRupees > 0 ? Math.max(0, spentRupees - effectiveLimitRupees) : 0;
  const existingOverspendSum = await SavingsLedgerEntry.aggregate([
    {
      $match: {
        monthKey,
        reason: 'overspend-adjustment',
        'metadata.category': category,
      },
    },
    { $group: { _id: null, totalDelta: { $sum: '$deltaRupees' } } },
  ]);

  const appliedOverspendRupees = Math.max(0, -(existingOverspendSum[0]?.totalDelta ?? 0));
  const overspendDiff = desiredOverspendRupees - appliedOverspendRupees;
  if (overspendDiff === 0) {
    return;
  }

  await appendSavingsLedgerEntry({
    date: referenceDate,
    reason: 'overspend-adjustment',
    deltaRupees: -overspendDiff,
    note: `Overspend reconciliation in ${category}`,
    referenceType: 'expense',
    referenceId,
    metadata: {
      category,
      action,
      effectiveLimitRupees,
      inheritedFromPreviousMonth: !currentMonthBudget && Boolean(previousMonthBudget),
      desiredOverspendRupees,
      previouslyAppliedOverspendRupees: appliedOverspendRupees,
    },
  });
}

export async function updateExpense(expenseId: string, input: UpdateExpenseInput) {
  const existing = await Expense.findById(expenseId);
  if (!existing) {
    return null;
  }

  const prevMonthKey = existing.monthKey;
  const prevCategory = existing.category;
  const prevDate = existing.date;

  if (typeof input.amountRupees === 'number') {
    existing.amountRupees = input.amountRupees;
  }
  if (typeof input.category === 'string' && input.category.trim()) {
    existing.category = input.category.trim();
    await ensureCategoryExists(existing.category);
  }
  if (typeof input.note === 'string') {
    existing.note = input.note;
  }
  if (input.date) {
    existing.date = input.date;
    existing.dateKey = getDateKey(input.date);
    existing.monthKey = getMonthKey(input.date);
  }

  await existing.save();

  await reconcileCategoryOverspend(prevMonthKey, prevCategory, new Date(), String(existing._id), 'expense-updated');
  await reconcileCategoryOverspend(existing.monthKey, existing.category, new Date(), String(existing._id), 'expense-updated');

  await refreshAnalyticsForDate(prevDate);
  if (getDateKey(prevDate) !== existing.dateKey) {
    await refreshAnalyticsForDate(existing.date);
  }

  publishRealtimeEvent('expense.updated', existing);
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(prevMonthKey));
  if (prevMonthKey !== existing.monthKey) {
    publishRealtimeEvent('month.summary.updated', await getMonthSummary(existing.monthKey));
  }

  await recordActivityLog({
    action: 'expense.updated',
    entityType: 'expense',
    entityId: String(existing._id),
    monthKey: existing.monthKey,
    dateKey: existing.dateKey,
    category: existing.category,
    amountRupees: existing.amountRupees,
    message: `Updated expense ${existing.category} to ${formatRupeesForLog(existing.amountRupees)} on ${existing.dateKey}`,
  });

  return existing;
}

export async function deleteExpense(expenseId: string) {
  const existing = await Expense.findById(expenseId);
  if (!existing) {
    return null;
  }

  const monthKey = existing.monthKey;
  const category = existing.category;
  const date = existing.date;

  await recordActivityLog({
    action: 'expense.deleted',
    entityType: 'expense',
    entityId: expenseId,
    monthKey,
    dateKey: existing.dateKey,
    category,
    amountRupees: existing.amountRupees,
    message: `Deleted expense ${category} ${formatRupeesForLog(existing.amountRupees)} from ${existing.dateKey}`,
  });

  await Expense.deleteOne({ _id: existing._id });

  await reconcileCategoryOverspend(monthKey, category, new Date(), String(existing._id), 'expense-deleted');
  await refreshAnalyticsForDate(date);

  publishRealtimeEvent('expense.deleted', { expenseId, monthKey, category });
  publishRealtimeEvent('month.summary.updated', await getMonthSummary(monthKey));

  return { ok: true };
}

export async function getMonthSummary(monthKey: string, scope: ScopeMode = 'full') {
  const { start, endExclusive } = getMonthBounds(monthKey);
  const scopedEndExclusive = resolveScopedEndExclusive(monthKey, scope);

  const expenseQuery = {
    date: {
      $gte: start,
      $lt: scopedEndExclusive,
    },
  };

  const ledgerQuery = {
    monthKey,
    date: {
      $gte: start,
      $lt: scopedEndExclusive,
    },
  };

  const incomeQuery = {
    date: {
      $gte: start,
      $lt: scopedEndExclusive,
    },
  };

  const previousMonthKey = getPreviousMonthKey(monthKey);
  const [budgets, previousMonthBudgets, expenses, incomes, ledger, incomePlan] = await Promise.all([
    BudgetCategory.find({ monthKey }).sort({ category: 1 }),
    BudgetCategory.find({ monthKey: previousMonthKey }).select('category limitRupees'),
    Expense.find(expenseQuery).sort({ date: -1 }),
    Income.find(incomeQuery).sort({ date: -1 }),
    SavingsLedgerEntry.find(ledgerQuery).sort({ date: -1, createdAt: -1 }),
    IncomePlan.findOne({ monthKey }),
  ]);

  const previousMonthTotals = await getIncomeAndSpentForMonth(previousMonthKey);
  const carryForwardFromPrevMonthRupees = previousMonthTotals.incomeRupees - previousMonthTotals.spentRupees;

  const effectiveBudgetLimitByCategory = buildEffectiveBudgetLimitMap({
    currentMonthBudgets: budgets,
    previousMonthBudgets: previousMonthBudgets as Array<{ category: string; limitRupees: number }>,
  });

  const totalIncomeRupees = incomes.reduce((sum, item) => sum + item.amountRupees, 0);
  const totalBudgetRupees = Array.from(effectiveBudgetLimitByCategory.values()).reduce((sum, limitRupees) => sum + limitRupees, 0);
  const totalSpentRupees = expenses.reduce((sum, item) => sum + item.amountRupees, 0);
  const totalOverspendAdjustmentsRupees = ledger
    .filter((item) => item.reason === 'overspend-adjustment')
    .reduce((sum, item) => sum + item.deltaRupees, 0);

  return {
    monthKey,
    scope,
    monthlySalaryRupees: incomePlan?.amountRupees ?? 0,
    totalIncomeRupees,
    totalBudgetRupees,
    totalSpentRupees,
    projectedCarryForwardRupees: totalIncomeRupees - totalSpentRupees,
    selectedMonthCarryForwardRupees: totalIncomeRupees - totalSpentRupees,
    carryForwardFromPrevMonthRupees,
    effectiveAvailableRupees: totalIncomeRupees + carryForwardFromPrevMonthRupees,
    totalOverspendAdjustmentsRupees,
    budgets,
    expenses,
    incomes,
    hasFutureDaysExcluded: scopedEndExclusive.getTime() < endExclusive.getTime(),
  };
}

export async function getLedgerEntries(params: {
  monthKey?: string;
  scope?: ScopeMode;
  limit?: number;
  page?: number;
  reason?: string;
  category?: string;
}) {
  const scope = params.scope ?? 'full';
  const { limit, page, skip } = parsePagination(params.limit, params.page, 25, 500);

  const query: Record<string, unknown> = {};
  if (params.monthKey) {
    const { start } = getMonthBounds(params.monthKey);
    const scopedEndExclusive = resolveScopedEndExclusive(params.monthKey, scope);
    query.monthKey = params.monthKey;
    query.date = {
      $gte: start,
      $lt: scopedEndExclusive,
    };
  }

  if (params.reason) {
    query.reason = params.reason;
  }

  if (params.category) {
    query['metadata.category'] = params.category;
  }

  const [items, total] = await Promise.all([
    SavingsLedgerEntry.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    SavingsLedgerEntry.countDocuments(query),
  ]);

  return toPaginatedResult(items, total, page, limit);
}

export async function getCategoryPerformance(params: {
  monthKey: string;
  mode: 'cumulative' | 'date';
  dateKey?: string;
  scope?: ScopeMode;
}) {
  const scope = params.scope ?? 'auto';
  const { start } = getMonthBounds(params.monthKey);
  const scopedEndExclusive =
    params.mode === 'date' && params.dateKey
      ? resolveScopedEndExclusive(params.monthKey, 'full', params.dateKey)
      : resolveScopedEndExclusive(params.monthKey, scope, params.dateKey);

  const expenseQuery: Record<string, unknown> = {
    date: {
      $gte: start,
      $lt: scopedEndExclusive,
    },
  };

  if (params.mode === 'date' && params.dateKey) {
    expenseQuery.dateKey = params.dateKey;
  }

  const previousMonthKey = getPreviousMonthKey(params.monthKey);
  const [budgets, previousMonthBudgets, expenses] = await Promise.all([
    BudgetCategory.find({ monthKey: params.monthKey }).sort({ category: 1 }),
    BudgetCategory.find({ monthKey: previousMonthKey }).select('category limitRupees'),
    Expense.find(expenseQuery).sort({ date: -1 }),
  ]);

  const spentByCategory = expenses.reduce<Record<string, number>>((accumulator, expense) => {
    accumulator[expense.category] = (accumulator[expense.category] ?? 0) + expense.amountRupees;
    return accumulator;
  }, {});

  const budgetByCategory = buildEffectiveBudgetLimitMap({
    currentMonthBudgets: budgets,
    previousMonthBudgets: previousMonthBudgets as Array<{ category: string; limitRupees: number }>,
  });
  const categoryNames = new Set<string>([
    ...budgetByCategory.keys(),
    ...Object.keys(spentByCategory),
  ]);

  return Array.from(categoryNames)
    .map((category) => {
      const allocatedRupees = budgetByCategory.get(category) ?? 0;
      const spentRupees = spentByCategory[category] ?? 0;
      const overspentRupees = Math.max(0, spentRupees - allocatedRupees);
      const savedRupees = Math.max(0, allocatedRupees - spentRupees);

      return {
        category,
        allocatedRupees,
        spentRupees,
        overspentRupees,
        savedRupees,
        status: overspentRupees > 0 ? 'overspent' : savedRupees > 0 ? 'saved' : 'on-track',
      };
    })
    .sort((left, right) => right.spentRupees - left.spentRupees);
}

export async function runMonthEndRollover(monthKey: string) {
  const summary = await getMonthSummary(monthKey);
  const existingRollover = await SavingsLedgerEntry.findOne({ monthKey, reason: 'month-end-rollover' });
  if (existingRollover) {
    return existingRollover;
  }

  const overspendDelta = summary.totalOverspendAdjustmentsRupees;
  const targetDelta = summary.projectedCarryForwardRupees;
  const reconciliationDelta = targetDelta - overspendDelta;

  await appendSavingsLedgerEntry({
    date: new Date(`${monthKey}-28T23:59:59.000Z`),
    reason: 'month-end-rollover',
    deltaRupees: reconciliationDelta,
    note: 'Month-end rollover reconciliation',
    referenceType: 'month',
    referenceId: monthKey,
    metadata: {
      totalIncomeRupees: summary.totalIncomeRupees,
      totalSpentRupees: summary.totalSpentRupees,
      overspendDeltaRupees: overspendDelta,
      projectedCarryForwardRupees: targetDelta,
    },
  });

  publishRealtimeEvent('rollover.completed', { monthKey, reconciliationDelta });
  await recordActivityLog({
    action: 'system.rollover',
    entityType: 'system',
    monthKey,
    dateKey: `${monthKey}-28`,
    amountRupees: Math.abs(reconciliationDelta),
    message: `Ran month-end rollover for ${monthKey} (${formatRupeesForLog(reconciliationDelta)} adjustment)`,
  });
  return SavingsLedgerEntry.findOne({ monthKey, reason: 'month-end-rollover' });
}

export async function refreshAnalyticsForDate(date: Date): Promise<void> {
  const dateKey = getDateKey(date);
  const weekKey = getWeekKey(date);
  const monthKey = getMonthKey(date);

  const [dailyExpenses, weeklyExpenses, monthlyExpenses] = await Promise.all([
    Expense.find({ dateKey }),
    Expense.find({
      date: {
        $gte: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000),
        $lte: date,
      },
    }),
    Expense.find({ monthKey }),
  ]);

  const dailyTotalRupees = dailyExpenses.reduce((sum, item) => sum + item.amountRupees, 0);
  const weeklyTotalRupees = weeklyExpenses.reduce((sum, item) => sum + item.amountRupees, 0);
  const monthlyTotalRupees = monthlyExpenses.reduce((sum, item) => sum + item.amountRupees, 0);

  await Promise.all([
    AnalyticsLog.findOneAndUpdate(
      { logType: 'daily', periodKey: dateKey },
      {
        logType: 'daily',
        periodKey: dateKey,
        payload: {
          totalRupees: dailyTotalRupees,
          transactions: dailyExpenses.length,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ),
    AnalyticsLog.findOneAndUpdate(
      { logType: 'weekly', periodKey: weekKey },
      {
        logType: 'weekly',
        periodKey: weekKey,
        payload: {
          totalRupees: weeklyTotalRupees,
          transactions: weeklyExpenses.length,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ),
    AnalyticsLog.findOneAndUpdate(
      { logType: 'monthly', periodKey: monthKey },
      {
        logType: 'monthly',
        periodKey: monthKey,
        payload: {
          totalRupees: monthlyTotalRupees,
          transactions: monthlyExpenses.length,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ),
  ]);

  publishRealtimeEvent('analytics.updated', { dateKey, weekKey, monthKey });
}


