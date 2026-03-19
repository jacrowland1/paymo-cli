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

export type Period =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month";

export const VALID_PERIODS: Period[] = [
  "today",
  "yesterday",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
];

/** Return the { start, end } date strings for a named period */
export function getPeriodRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: formatDate(today), end: formatDate(today) };

    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { start: formatDate(y), end: formatDate(y) };
    }

    case "this-week": {
      // Week runs Mon–Fri
      const dow = today.getDay(); // 0=Sun … 6=Sat
      const daysFromMon = dow === 0 ? 6 : dow - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysFromMon);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      return { start: formatDate(monday), end: formatDate(friday) };
    }

    case "last-week": {
      const dow = today.getDay();
      const daysFromMon = dow === 0 ? 6 : dow - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - daysFromMon);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastFriday = new Date(lastMonday);
      lastFriday.setDate(lastMonday.getDate() + 4);
      return { start: formatDate(lastMonday), end: formatDate(lastFriday) };
    }

    case "this-month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: formatDate(start), end: formatDate(end) };
    }

    case "last-month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: formatDate(start), end: formatDate(end) };
    }
  }
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
