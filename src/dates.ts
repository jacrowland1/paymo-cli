/**
 * Date utility functions for the Paymo timesheet CLI.
 */

/** Parse a YYYY-MM-DD string into a Date (local time, midnight) */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a Date as YYYY-MM-DD */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Check if a Date falls on a weekend (Saturday=6, Sunday=0) */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Generate an array of YYYY-MM-DD date strings between start and end (inclusive).
 */
export function getDateRange(start: string, end: string): string[] {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const days: string[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    days.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/**
 * Generate an array of YYYY-MM-DD date strings between start and end (inclusive),
 * excluding weekends and any explicitly excluded dates.
 */
export function getWorkingDays(
  start: string,
  end: string,
  excludeDates: string[] = [],
): string[] {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  const excludeSet = new Set(excludeDates);
  const days: string[] = [];

  const current = new Date(startDate);
  while (current <= endDate) {
    const formatted = formatDate(current);
    if (!isWeekend(current) && !excludeSet.has(formatted)) {
      days.push(formatted);
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}
