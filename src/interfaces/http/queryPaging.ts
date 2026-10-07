export function parsePage(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseLimit(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  const capped = Math.min(Math.floor(n), 100);
  return capped < 1 ? fallback : capped;
}
