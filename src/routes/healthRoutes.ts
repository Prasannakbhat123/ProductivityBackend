import { Router } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/', (_request, response) => {
  response.json({ ok: true, timestamp: new Date().toISOString() });
});
