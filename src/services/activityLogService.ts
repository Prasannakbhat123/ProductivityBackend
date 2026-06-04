import { ActivityLog } from '../models/ActivityLog';
import { getDateKey, getMonthKey } from '../utils/time';
import { escapeRegex, parsePagination, toPaginatedResult } from '../utils/pagination';

export type ActivityLogInput = {
  action: string;
  entityType: string;
  message: string;
  entityId?: string;
  monthKey?: string;
  dateKey?: string;
  category?: string;
  label?: string;
  amountRupees?: number;
};

export function formatRupeesForLog(amountRupees: number): string {
  return `₹${amountRupees.toLocaleString('en-IN')}`;
}

export async function recordActivityLog(input: ActivityLogInput): Promise<void> {
  const now = new Date();
  await ActivityLog.create({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? '',
    monthKey: input.monthKey ?? getMonthKey(now),
    dateKey: input.dateKey ?? getDateKey(now),
    category: input.category ?? '',
    label: input.label ?? '',
    amountRupees: typeof input.amountRupees === 'number' ? input.amountRupees : undefined,
    message: input.message,
  });
}

export async function getActivityLogs(params: {
  monthKey?: string;
  dateKey?: string;
  category?: string;
  entityType?: string;
  action?: string;
  search?: string;
  limit?: number;
  page?: number;
}) {
  const { limit, page, skip } = parsePagination(params.limit, params.page, 25, 200);

  const query: Record<string, unknown> = {};
  if (params.monthKey) query.monthKey = params.monthKey;
  if (params.dateKey) query.dateKey = params.dateKey;
  if (params.category) query.category = params.category;
  if (params.entityType) query.entityType = params.entityType;
  if (params.action) query.action = params.action;

  if (params.search?.trim()) {
    query.message = { $regex: escapeRegex(params.search.trim()), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    ActivityLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ActivityLog.countDocuments(query),
  ]);

  return toPaginatedResult(items, total, page, limit);
}
