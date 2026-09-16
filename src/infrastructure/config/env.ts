import dotenv from 'dotenv';

dotenv.config();

function requiredInProd(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env var: ${name}`);
    }
    return fallback ?? '';
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: requiredInProd('JWT_SECRET', 'pawmily-dev-secret'),
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
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'https://pawmyli-one.vercel.app',
  codeAliasDays: Number(process.env.CODE_ALIAS_DAYS ?? 90),
};
