import cron from 'node-cron';
import { runMonthEndRollover } from '../services/financeService';
import { getMonthKey } from '../utils/time';

export function startRolloverScheduler(): void {
  cron.schedule('10 0 1 * *', async () => {
    const previousMonth = new Date();
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    const monthKey = getMonthKey(previousMonth);
    await runMonthEndRollover(monthKey);
  });
}
