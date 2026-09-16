type IdempotencyEntry =
  | { status: 'pending'; createdAt: number }
  | { status: 'done'; createdAt: number; statusCode: number; body: unknown };

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, IdempotencyEntry>();

function prune(now = Date.now()) {
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(key);
  }
}

export function idempotencyLookup(scopeKey: string): IdempotencyEntry | undefined {
  prune();
  return store.get(scopeKey);
}

export function idempotencyBegin(scopeKey: string): boolean {
  prune();
  const existing = store.get(scopeKey);
  if (existing) return false;
  store.set(scopeKey, { status: 'pending', createdAt: Date.now() });
  return true;
}

export function idempotencyComplete(scopeKey: string, statusCode: number, body: unknown) {
  store.set(scopeKey, {
    status: 'done',
    createdAt: Date.now(),
    statusCode,
    body,
  });
}

export function idempotencyFail(scopeKey: string) {
  const entry = store.get(scopeKey);
  if (entry?.status === 'pending') store.delete(scopeKey);
}
