import { startOfWeek, endOfWeek, subWeeks, format, isWithinInterval } from 'date-fns';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  startFormatted: string; // yyyy-MM-dd
  endFormatted: string;   // yyyy-MM-dd
  label: string;
}

/**
 * Returns Monday 00:00:00 to Sunday 23:59:59 for the current week
 */
export function getThisWeekMonSun(referenceDate = new Date()): DateRange {
  const start = startOfWeek(referenceDate, { weekStartsOn: 1 });
  start.setHours(0, 0, 0, 0);

  const end = endOfWeek(referenceDate, { weekStartsOn: 1 });
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start,
    endDate: end,
    startFormatted: format(start, 'yyyy-MM-dd'),
    endFormatted: format(end, 'yyyy-MM-dd'),
    label: `This Week (${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}) [Mon–Sun]`,
  };
}

/**
 * Returns Monday 00:00:00 to Sunday 23:59:59 for the previous week
 */
export function getLastWeekMonSun(referenceDate = new Date()): DateRange {
  const prevWeekRef = subWeeks(referenceDate, 1);
  const start = startOfWeek(prevWeekRef, { weekStartsOn: 1 });
  start.setHours(0, 0, 0, 0);

  const end = endOfWeek(prevWeekRef, { weekStartsOn: 1 });
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start,
    endDate: end,
    startFormatted: format(start, 'yyyy-MM-dd'),
    endFormatted: format(end, 'yyyy-MM-dd'),
    label: `Last Week (${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}) [Mon–Sun]`,
  };
}

/**
 * Formats a custom Monday–Sunday date range
 */
export function createCustomMonSunRange(startDateStr: string, endDateStr: string): DateRange {
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start,
    endDate: end,
    startFormatted: format(start, 'yyyy-MM-dd'),
    endFormatted: format(end, 'yyyy-MM-dd'),
    label: `${format(start, 'EEE, MMM d, yyyy')} – ${format(end, 'EEE, MMM d, yyyy')}`,
  };
}

/**
 * Checks if a timestamp falls within a range
 */
export function isTimestampInRange(timestamp: number, range: DateRange): boolean {
  return isWithinInterval(new Date(timestamp), {
    start: range.startDate,
    end: range.endDate,
  });
}
