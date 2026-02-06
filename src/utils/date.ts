import { format } from 'date-fns';

export function todayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}
