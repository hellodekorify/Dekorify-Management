import { addMonths, addWeeks, addYears, endOfDay, isAfter, isBefore, setDate } from "date-fns";
import type { RecurringFrequency } from "./constants";

export interface RecurringSchedule {
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  dayOfMonth: number | null;
  lastGeneratedDate: Date | null;
}

const STEP: Record<RecurringFrequency, (date: Date, count: number) => Date> = {
  WEEKLY: (date, count) => addWeeks(date, count),
  MONTHLY: (date, count) => addMonths(date, count),
  QUARTERLY: (date, count) => addMonths(date, count * 3),
  YEARLY: (date, count) => addYears(date, count),
};

/**
 * Every date this schedule should have posted on, up to and including today,
 * that has not been posted already.
 *
 * Generation is driven by `lastGeneratedDate` rather than by counting rows, so
 * deleting a posted expense does not cause it to silently reappear.
 */
export function dueOccurrences(schedule: RecurringSchedule, now: Date = new Date()): Date[] {
  const step = STEP[schedule.frequency as RecurringFrequency];
  if (!step) return [];

  const limit = endOfDay(now);
  const hardStop = schedule.endDate ? endOfDay(schedule.endDate) : null;

  const occurrences: Date[] = [];
  let index = 0;

  // A cap keeps a misconfigured schedule (say, weekly since 2015) from
  // generating thousands of rows in one go.
  const MAX_OCCURRENCES = 500;

  while (occurrences.length < MAX_OCCURRENCES) {
    let occurrence = step(schedule.startDate, index);
    index += 1;

    if (schedule.dayOfMonth && schedule.frequency !== "WEEKLY") {
      occurrence = alignToDayOfMonth(occurrence, schedule.dayOfMonth);
    }

    if (isAfter(occurrence, limit)) break;
    if (hardStop && isAfter(occurrence, hardStop)) break;

    const alreadyPosted =
      schedule.lastGeneratedDate !== null &&
      !isAfter(occurrence, endOfDay(schedule.lastGeneratedDate));

    if (!alreadyPosted && !isBefore(occurrence, schedule.startDate)) {
      occurrences.push(occurrence);
    }

    if (index > MAX_OCCURRENCES * 2) break;
  }

  return occurrences;
}

/** The 31st in a 30-day month lands on the 30th, not on the 1st of the next. */
function alignToDayOfMonth(date: Date, dayOfMonth: number): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return setDate(date, Math.min(dayOfMonth, lastDay));
}

export function nextOccurrence(schedule: RecurringSchedule, now: Date = new Date()): Date | null {
  const step = STEP[schedule.frequency as RecurringFrequency];
  if (!step) return null;

  const hardStop = schedule.endDate ? endOfDay(schedule.endDate) : null;

  for (let index = 0; index < 1000; index++) {
    let occurrence = step(schedule.startDate, index);
    if (schedule.dayOfMonth && schedule.frequency !== "WEEKLY") {
      occurrence = alignToDayOfMonth(occurrence, schedule.dayOfMonth);
    }
    if (hardStop && isAfter(occurrence, hardStop)) return null;
    if (isAfter(occurrence, now)) return occurrence;
  }

  return null;
}

export function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case "WEEKLY":
      return "Every week";
    case "MONTHLY":
      return "Every month";
    case "QUARTERLY":
      return "Every 3 months";
    case "YEARLY":
      return "Every year";
    default:
      return frequency;
  }
}
