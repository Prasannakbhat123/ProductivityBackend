import { Router } from 'express';
import { getActivityLogs } from '../services/activityLogService';

export const activityRoutes = Router();

activityRoutes.get('/logs', async (request, response) => {
  const monthKey = typeof request.query.monthKey === 'string' ? request.query.monthKey : undefined;
  const dateKey = typeof request.query.dateKey === 'string' ? request.query.dateKey : undefined;
  const category = typeof request.query.category === 'string' ? request.query.category.trim() : undefined;
  const entityType = typeof request.query.entityType === 'string' ? request.query.entityType.trim() : undefined;
  const action = typeof request.query.action === 'string' ? request.query.action.trim() : undefined;
  const search = typeof request.query.search === 'string' ? request.query.search : undefined;
  const limit = Number(typeof request.query.limit === 'string' ? request.query.limit : 30);
  const page = Number(typeof request.query.page === 'string' ? request.query.page : 1);

  const logs = await getActivityLogs({
    monthKey,
    dateKey,
    category,
    entityType,
    action,
    search,
    limit,
    page,
  });

  response.json(logs);
});
