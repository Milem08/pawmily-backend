import dotenv from 'dotenv';

if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
} else {
  dotenv.config();
}

function resolveJwtSecret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === 'test') return 'test-only-jwt-secret';
  throw new Error(
    'Falta JWT_SECRET. Define la variable de entorno JWT_SECRET antes de arrancar el servidor.',
  );
}

function resolveTrustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw !== undefined && raw.trim() !== '') {
    const hops = Number(raw);
    if (!Number.isInteger(hops) || hops < 0) {
      throw new Error('TRUST_PROXY_HOPS debe ser un entero mayor o igual a 0');
    }
    return hops;
  }
  return process.env.NODE_ENV === 'production' ? 1 : 0;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: resolveJwtSecret(),
  /** @deprecated use jwtAccessExpiration */
  jwtExpiration: process.env.JWT_EXPIRATION ?? process.env.JWT_ACCESS_EXPIRATION ?? '30m',
  jwtAccessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? process.env.JWT_EXPIRATION ?? '30m',
  jwtRefreshDays: Number(process.env.JWT_REFRESH_DAYS ?? 30),
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080,http://127.0.0.1:8080,https://pawmyli-one.vercel.app'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  supabaseStorageBucketPets: process.env.SUPABASE_STORAGE_BUCKET_PETS ?? 'pet-photos',
  supabaseStorageBucketClinical: process.env.SUPABASE_STORAGE_BUCKET_CLINICAL ?? 'clinical-assets',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'PawMily <noreply@pawmily.app>',
  barcodeNotifyEmail: process.env.BARCODE_NOTIFY_EMAIL ?? '',
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'https://pawmyli-one.vercel.app',
  codeAliasDays: Number(process.env.CODE_ALIAS_DAYS ?? 90),
  trustProxyHops: resolveTrustProxyHops(),
};
