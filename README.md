# Pawmily Backend

Express + TypeScript API with Clean Architecture and DDD.

## Stack

- Express HTTP adapter
- Prisma + PostgreSQL (Supabase)
- JWT auth (app-owned; Supabase is DB only)
- Zod validation, helmet, CORS, rate limiting

## Quick start

```bash
cp .env.example .env
# set DATABASE_URL, JWT_SECRET
npm install
npx prisma generate
npm run dev
```

Health: `GET http://localhost:3000/api/health`

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode |
| `npm run build` / `npm start` | Production |
| `npm test` | Unit + health integration |
| `npx prisma db push` | Sync schema to DB |

## Deploy (Railway)

`Procfile` and `railway.toml` included. Set `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRATION`, `CORS_ORIGINS`, `NODE_ENV=production`.

## Security note

Tables are accessed by the backend via the Postgres connection string. Do not use the Supabase anon key from web/Android clients for these tables. Prefer enabling RLS and/or revoking `anon`/`authenticated` privileges if you expose the Data API.
