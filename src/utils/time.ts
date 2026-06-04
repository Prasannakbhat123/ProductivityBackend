export function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekKey(date: Date): string {
  const work = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (work.getUTCDay() + 6) % 7;
  work.setUTCDate(work.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(work.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNo = 1 + Math.round((work.getTime() - firstThursday.getTime()) / 604800000);
  return `${work.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return getDateKey(a) === getDateKey(b);
}
