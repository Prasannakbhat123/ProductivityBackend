import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { env } from './config/env';
import { activityRoutes } from './routes/activityRoutes';
import { calendarRoutes } from './routes/calendarRoutes';
import { financeRoutes } from './routes/financeRoutes';
import { healthRoutes } from './routes/healthRoutes';
import { notesRoutes } from './routes/notesRoutes';
import { realtimeRoutes } from './routes/realtimeRoutes';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.frontendOrigin }));
  app.use(express.json());

  app.use('/api/health', healthRoutes);
  app.use('/api/realtime', realtimeRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use('/api/notes', notesRoutes);

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'Validation failed',
        details: error.issues,
      });
      return;
    }

    console.error(error);
    response.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
