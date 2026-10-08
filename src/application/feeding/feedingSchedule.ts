import { parseMealHourMinute } from '../../shared/mealTime';
import {
  addCalendarDays,
  businessNow,
  isBusinessDate,
  isBusinessTime,
  todayInBusinessZone,
} from '../../shared/businessTime';

/** How many elapsed business days to close when this process has no watermark yet. */
export const FEEDING_CLOSE_LOOKBACK_DAYS = 7;

export interface FeedingClock {
  refDate: string;
  refMinutes: number;
  realToday: string;
}

/**
 * Clock used to decide which meals are already due.
 * A past asOf date is the end of that business day. A future asOf stays on the real clock
 * so meals that have not happened are never treated as missed.
 */
export function feedingClock(asOf?: string, now: Date = new Date()): FeedingClock {
  const clock = businessNow(now);
  const realToday = clock.date;
  const live = { refDate: realToday, refMinutes: clock.minutes, realToday };
  if (!asOf) return live;

  const timed = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(asOf.trim());
  if (timed && isBusinessDate(timed[1]) && isBusinessTime(`${timed[2]}:${timed[3]}`)) {
    const date = timed[1];
    if (date > realToday) return live;
    return {
      refDate: date,
      refMinutes: Number(timed[2]) * 60 + Number(timed[3]),
      realToday,
    };
  }

  const datePart = asOf.trim().slice(0, 10);
  if (!isBusinessDate(datePart) || datePart === realToday || datePart > realToday) return live;
  return { refDate: datePart, refMinutes: 24 * 60, realToday };
}

/** Due only after the meal clock on that business day. An unreadable hour is not due at 00:00. */
export function isMealDue(
  mealTime: string | null | undefined,
  day: string,
  ref: { date: string; minutes: number },
): boolean {
  if (day > ref.date) return false;
  if (day < ref.date) return true;
  const hm = parseMealHourMinute(mealTime);
  if (!hm) return false;
  return ref.minutes > hm.h * 60 + hm.m;
}

/** A removed meal still belongs to days before the business date it was archived. */
export function mealOnPlanForDay(archivedAt: Date | null | undefined, day: string): boolean {
  if (!archivedAt) return true;
  return day < todayInBusinessZone(archivedAt);
}

export interface MealCloseInput {
  day: string;
  mealTime?: string | null;
  planStatus?: string | null;
  startDate?: string | null;
  archivedAt?: Date | null;
  existingStatus?: string | null;
  now?: Date;
}

/** 'mark' writes UNLOGGED. A second call with that status is 'skip'. */
export function closeActionForMeal(input: MealCloseInput): 'skip' | 'mark' {
  const now = input.now ?? new Date();
  const planStatus = input.planStatus || 'ACTIVE';
  if (planStatus !== 'ACTIVE') return 'skip';
  if (input.startDate && isBusinessDate(input.startDate) && input.day < input.startDate) {
    return 'skip';
  }
  if (!mealOnPlanForDay(input.archivedAt, input.day)) return 'skip';
  const clock = businessNow(now);
  if (!isMealDue(input.mealTime, input.day, { date: clock.date, minutes: clock.minutes })) {
    return 'skip';
  }
  const status = input.existingStatus;
  if (status === 'EATEN' || status === 'UNLOGGED' || status === 'PARTIAL') return 'skip';
  return 'mark';
}

export function planFeedingClose(
  now: Date = new Date(),
  closedThrough: string | null = null,
): { dates: string[]; closedThrough: string } {
  const today = todayInBusinessZone(now);
  const yesterday = addCalendarDays(today, -1);
  if (closedThrough && closedThrough >= yesterday) {
    return { dates: [], closedThrough };
  }
  const start = closedThrough
    ? addCalendarDays(closedThrough, 1)
    : addCalendarDays(yesterday, -(FEEDING_CLOSE_LOOKBACK_DAYS - 1));
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= yesterday && dates.length < 62) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return { dates, closedThrough: yesterday };
}

export interface FeedingComplianceMeal {
  id: string;
  label: string;
  time: string;
  sortOrder: number;
  archivedAt?: Date | null;
}

export interface FeedingComplianceLog {
  mealId: string;
  scheduledDate: string;
  status: string;
}

export function enumerateBusinessDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
    if (out.length > 62) break;
  }
  return out;
}

function missedStatus(day: string, clock: FeedingClock): 'UNLOGGED' | 'PENDING' {
  if (day < clock.refDate) return 'UNLOGGED';
  if (day === clock.refDate && clock.refDate < clock.realToday) return 'UNLOGGED';
  return 'PENDING';
}

export function summarizeFeeding(input: {
  meals: FeedingComplianceMeal[];
  logs: FeedingComplianceLog[];
  from: string;
  to: string;
  weekDays: string[];
  startDate?: string | null;
  asOf?: string;
  now?: Date;
}): {
  scheduled: number;
  eaten: number;
  partial: number;
  unlogged: number;
  pending: number;
  percent: number | null;
  weekMeals: Array<{ id: string; label: string; time: string; cells: string[] }>;
} {
  const clock = feedingClock(input.asOf, input.now ?? new Date());
  const startDate =
    input.startDate && isBusinessDate(input.startDate) ? input.startDate : null;
  const countFrom = startDate && startDate > input.from ? startDate : input.from;
  const countTo = input.to < clock.refDate ? input.to : clock.refDate;
  const byKey = new Map(input.logs.map((log) => [`${log.mealId}|${log.scheduledDate}`, log]));
  const ref = { date: clock.refDate, minutes: clock.refMinutes };

  let eaten = 0;
  let partial = 0;
  let unlogged = 0;
  let pending = 0;
  let scheduled = 0;

  if (countFrom <= countTo) {
    for (const day of enumerateBusinessDays(countFrom, countTo)) {
      for (const meal of input.meals) {
        if (!mealOnPlanForDay(meal.archivedAt, day)) continue;
        if (!isMealDue(meal.time, day, ref)) continue;
        scheduled += 1;
        const log = byKey.get(`${meal.id}|${day}`);
        const status = log?.status || missedStatus(day, clock);
        if (status === 'EATEN') eaten += 1;
        else if (status === 'PARTIAL') partial += 1;
        else if (status === 'UNLOGGED') unlogged += 1;
        else pending += 1;
      }
    }
  }

  const done = eaten + partial;
  const percent = scheduled > 0 ? Math.round((done / scheduled) * 100) : null;

  const weekMeals = input.meals
    .filter(
      (meal) =>
        input.weekDays.some((day) => mealOnPlanForDay(meal.archivedAt, day)) ||
        input.logs.some((log) => log.mealId === meal.id),
    )
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((meal) => ({
      id: meal.id,
      label: meal.label,
      time: meal.time,
      cells: input.weekDays.map((day) => {
        const log = byKey.get(`${meal.id}|${day}`);
        if (log?.status) return log.status;
        if (!mealOnPlanForDay(meal.archivedAt, day)) return 'PENDING';
        if (startDate && day < startDate) return 'PENDING';
        if (!isMealDue(meal.time, day, ref)) return 'PENDING';
        return missedStatus(day, clock);
      }),
    }));

  return { scheduled, eaten, partial, unlogged, pending, percent, weekMeals };
}
