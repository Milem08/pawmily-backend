# Production checklist — Pawmily

- [x] Rate limiting on `/api` (100 req/min)
- [x] Pagination on patients and appointments lists (`page`, `limit`, default 20)
- [x] Request logging middleware
- [x] Helmet + CORS from `CORS_ORIGINS`
- [x] JWT secret required in production (`JWT_SECRET`)
- [x] Railway `Procfile` + `railway.toml`
- [x] Supabase tables created with indexes
- [x] Revoked `anon`/`authenticated` privileges on app tables (backend uses DB URL)

## Deploy steps

1. Set Railway env: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRATION`, `CORS_ORIGINS`, `NODE_ENV=production`, `PORT`
2. Deploy; start command generates Prisma client and builds
3. Point web `PAWMILY_API_BASE` / Android `BASE_URL` to the public API `/api`
4. Smoke: health → register → login → create patient
