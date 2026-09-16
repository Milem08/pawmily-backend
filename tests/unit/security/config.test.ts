import { env } from '../../../src/infrastructure/config/env';

describe('Configuración de seguridad', () => {
  it('no usa el secreto JWT por defecto en production', () => {
    if (env.nodeEnv === 'production') {
      expect(env.jwtSecret).not.toBe('pawmily-dev-secret');
      expect(env.jwtSecret.length).toBeGreaterThanOrEqual(16);
    } else {
      expect(env.jwtSecret.length).toBeGreaterThan(0);
    }
  });

  it('DATABASE_URL debe usar pooler Supabase con SSL y pgbouncer', () => {
    expect(env.databaseUrl.length).toBeGreaterThan(0);
    expect(env.databaseUrl).not.toMatch(/your-project/i);
    expect(env.databaseUrl).not.toMatch(/YOUR_PASSWORD/);
    expect(env.databaseUrl).toMatch(/pooler\.supabase\.com|supabase\.co/i);
    expect(env.databaseUrl).toMatch(/sslmode=require/i);
    expect(env.databaseUrl).toMatch(/pgbouncer=true/i);
  });
});
