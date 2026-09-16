# Variables de entorno — Plan Maestro

| Variable | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres pooler Supabase |
| `JWT_SECRET` | Obligatorio en production (≥16 chars) |
| `JWT_ACCESS_EXPIRATION` | Default `30m` |
| `JWT_REFRESH_DAYS` | Default `30` |
| `CORS_ORIGINS` | Orígenes web permitidos |
| `SUPABASE_URL` | Storage firmado |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor |
| `SUPABASE_STORAGE_BUCKET_PETS` | Default `pet-photos` |
| `SUPABASE_STORAGE_BUCKET_CLINICAL` | Default `clinical-assets` |
| `RESEND_API_KEY` | Email reset/verify (opcional; en dev se loguea) |
| `EMAIL_FROM` | Remitente |
| `APP_PUBLIC_URL` | Links de reset/verify |
| `CODE_ALIAS_DAYS` | Ventana alias códigos (doc; alias activo mientras exista `previousCode`) |

## Aplicar schema

```bash
npx prisma db push
npx tsx scripts/backfill-patient-access.ts
```

Buckets privados a crear en Supabase Storage: `pet-photos`, `clinical-assets`.

## Clientes

- Web: access en `localStorage` + refresh con rotación; logout revoca refresh.
- Android: `EncryptedSharedPreferences` para tokens; link vía `POST /patients/link-requests`.
