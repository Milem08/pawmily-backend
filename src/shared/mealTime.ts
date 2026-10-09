/** Meal clock labels. Accepts 20:00, 8 pm and 8:30 p. m. */
export function parseMealHourMinute(raw?: string | null): { h: number; m: number } | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\./g, ' ')
    .toLowerCase()
    .replace(/hrs|horas/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withMarker = cleaned.match(
    /^(\d{1,2})\s*[:h]\s*(\d{2})(?::\s*\d{2})?\s*(a\s*m|p\s*m|am|pm)$/,
  );
  if (withMarker) {
    let h = Number(withMarker[1]);
    const m = Number(withMarker[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59 || h < 1 || h > 12) {
      return null;
    }
    const pm = withMarker[3].includes('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { h, m };
  }
  const hourOnly = cleaned.match(/^(\d{1,2})\s*(a\s*m|p\s*m|am|pm)$/);
  if (hourOnly) {
    let h = Number(hourOnly[1]);
    if (!Number.isFinite(h) || h < 1 || h > 12) return null;
    const pm = hourOnly[2].includes('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    return { h, m: 0 };
  }
  const twentyFour = cleaned.match(/^(\d{1,2})\s*[:h]\s*(\d{2})(?::\s*\d{2})?$/);
  if (!twentyFour) return null;
  const h = Number(twentyFour[1]);
  const m = Number(twentyFour[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return { h, m };
}

export function canonicalMealTime(raw?: string | null): string | null {
  const hm = parseMealHourMinute(raw);
  if (!hm) return null;
  return `${String(hm.h).padStart(2, '0')}:${String(hm.m).padStart(2, '0')}`;
}

/** Identity used when a client omits the meal id: name + clock, never list position. */
export function mealIdentityKey(label: string, time: string): string {
  const canon = canonicalMealTime(time) ?? time.trim().toLowerCase();
  return `${label.trim().toLowerCase()}|${canon}`;
}
