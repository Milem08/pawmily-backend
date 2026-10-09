/** Clinic clock. El Salvador has no daylight saving time; the host may still run in UTC. */
export const DEFAULT_BUSINESS_TIME_ZONE = 'America/El_Salvador';

export function businessTimeZone(): string {
  const configured = process.env.APP_TZ?.trim();
  return configured || DEFAULT_BUSINESS_TIME_ZONE;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '0';
}

/** Calendar fields of an instant in a zone. Hour 24 from Intl is midnight of the next day. */
export function zonedParts(instant: Date, timeZone = businessTimeZone()): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  let year = Number(readPart(parts, 'year'));
  let month = Number(readPart(parts, 'month'));
  let day = Number(readPart(parts, 'day'));
  let hour = Number(readPart(parts, 'hour'));
  const minute = Number(readPart(parts, 'minute'));
  const second = Number(readPart(parts, 'second'));

  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day) + 24 * 60 * 60 * 1000);
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }

  return { year, month, day, hour, minute, second };
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Milliseconds to add to UTC to obtain the zone's wall clock, at that instant. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallAsUtc - instant.getTime();
}

export function isBusinessDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function isBusinessTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function instantToLocalDateTime(
  instant: Date,
  timeZone = businessTimeZone(),
): { date: string; time: string } {
  const parts = zonedParts(instant, timeZone);
  return {
    date: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    time: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
  };
}

export function localDateTimeToInstant(
  date: string,
  time: string,
  timeZone = businessTimeZone(),
): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  let epoch = utcGuess - offset;
  const offsetAfter = timeZoneOffsetMs(new Date(epoch), timeZone);
  if (offsetAfter !== offset) epoch = utcGuess - offsetAfter;
  return new Date(epoch);
}

export function todayInBusinessZone(now: Date = new Date(), timeZone = businessTimeZone()): string {
  return instantToLocalDateTime(now, timeZone).date;
}

export function businessNow(
  now: Date = new Date(),
  timeZone = businessTimeZone(),
): { date: string; time: string; minutes: number } {
  const local = instantToLocalDateTime(now, timeZone);
  const [hour, minute] = local.time.split(':').map(Number);
  return { date: local.date, time: local.time, minutes: hour * 60 + minute };
}

export function addHoursToLocalDateTime(
  date: string,
  time: string,
  hours: number,
  timeZone = businessTimeZone(),
): { date: string; time: string } {
  const instant = localDateTimeToInstant(date, time, timeZone);
  const next = new Date(instant.getTime() + Math.round(hours * 60 * 60 * 1000));
  return instantToLocalDateTime(next, timeZone);
}

export function addCalendarDays(date: string, days: number, timeZone = businessTimeZone()): string {
  return addHoursToLocalDateTime(date, '12:00', days * 24, timeZone).date;
}

export const FIRST_DOSE_PAST_MARGIN_MINUTES = 5;

export function isLocalDateTimeInPast(
  date: string,
  time: string,
  now: Date = new Date(),
  marginMinutes = FIRST_DOSE_PAST_MARGIN_MINUTES,
  timeZone = businessTimeZone(),
): boolean {
  const instant = localDateTimeToInstant(date, time, timeZone);
  return instant.getTime() < now.getTime() - marginMinutes * 60 * 1000;
}
