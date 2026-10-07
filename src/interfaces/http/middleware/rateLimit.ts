import rateLimit from 'express-rate-limit';

function maxFor(envName: string, productionMax: number): number {
  if (process.env.NODE_ENV !== 'test') return productionMax;
  const override = Number(process.env[envName]);
  if (Number.isFinite(override) && override > 0) return override;
  return 10000;
}

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: maxFor('TEST_API_RATE_MAX', 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT', message: 'Too many requests' },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: maxFor('TEST_AUTH_RATE_MAX', 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT', message: 'Too many auth attempts' },
});

export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: maxFor('TEST_REFRESH_RATE_MAX', 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT', message: 'Too many refresh attempts' },
});

export const linkRequestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: maxFor('TEST_LINK_RATE_MAX', 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMIT', message: 'Too many link requests' },
});
