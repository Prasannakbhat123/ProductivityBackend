import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { startRecurringScheduler } from './scheduler/recurringScheduler';
import { startRolloverScheduler } from './scheduler/rolloverScheduler';

const app = createApp();

async function bootstrap() {
  await mongoose.connect(env.mongoUri);

  startRecurringScheduler();
  startRolloverScheduler();

  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
