/** Prisma cuid(). Real display names are not this shape. */
const STORED_USER_ID = /^c[a-z0-9]{24}$/;

export function looksLikeStoredUserId(value: string): boolean {
  return STORED_USER_ID.test(value);
}

export async function resolveStoredVetNames<T extends { vetName?: string | null }>(
  records: T[],
  findName: (id: string) => Promise<string | null>,
): Promise<T[]> {
  const cache = new Map<string, string | null>();
  const resolved: T[] = [];
  for (const record of records) {
    const raw = record.vetName?.trim() || '';
    if (!looksLikeStoredUserId(raw)) {
      resolved.push(record);
      continue;
    }
    if (!cache.has(raw)) {
      const name = (await findName(raw))?.trim() || null;
      cache.set(raw, name);
    }
    const name = cache.get(raw);
    resolved.push(name ? { ...record, vetName: name } : record);
  }
  return resolved;
}
