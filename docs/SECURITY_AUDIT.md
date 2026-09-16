# Evaluación de seguridad y rendimiento — Pawmily

Fecha: 2026-07-29 · Evidencia: run `security-perf-1` (`debug-991ff0.log`)

## Hipótesis y veredicto

| ID | Hipótesis | Resultado | Evidencia |
|----|-----------|-----------|-----------|
| A | API sin TLS (HTTP) | **CONFIRMADA** | `protocol:"http"`, `secure:false`, `tlsConfigured:false`; HTTPS local falla |
| B | RLS desactivado | **CONFIRMADA → mitigada** | Antes `rls_enabled:false`; ahora RLS ON + políticas en español |
| C | JWT débil / default | **PARCIAL OK** | `jwtSecretIsDefault:false`; expiración `24h` (aceptable en dev) |
| D | Rutas protegidas sin auth | **RECHAZADA (auth funciona)** | Sin Bearer / token inválido → `401` en 1–4 ms |
| E | Latencia alta | **INCONCLUSA en CRUD** | Health ~11 ms server / ~108 ms cliente; CRUD bloqueado por DB |
| F | `DATABASE_URL` inválida | **CONFIRMADA** | Prisma: `Can't reach database server at db.your-project.supabase.co:5432` |

## Cifrado de rutas

- **En tránsito (local):** las rutas **no están cifradas** — el servidor escucha solo `http://` (sin certificado TLS).
- **En producción:** debes terminar TLS en el reverse proxy (Railway/Nginx/Cloudflare). El API Node no monta HTTPS nativo.
- **Hacia Supabase:** usa `DATABASE_URL` con `sslmode=require` (conexión Postgres cifrada).

## Malas prácticas detectadas

1. `DATABASE_URL` con host placeholder (`your-project`) → registro/login fallan (antes 500; ahora 503 con mensaje claro).
2. Exposición potencial vía Data API si RLS estaba off (ahora mitigado).
3. JWT de 24h sin refresh/revocación de sesión.
4. Android/web en cleartext HTTP hacia el emulador/local (solo aceptable en debug).

## Políticas RLS (español)

Por tabla: `denegar_todo_acceso_anonimo`, `denegar_todo_acceso_autenticado` (`USING (false)`).
El backend usa connection string privilegiada; clientes no deben usar la anon key contra estas tablas.

## Rendimiento (muestra)

| Endpoint | Status | ms (server log) |
|----------|--------|-----------------|
| GET /api/health | 200 | 11 |
| GET /api/patients (sin auth) | 401 | 4 |
| GET /api/patients (token malo) | 401 | 4 |
| POST /api/auth/register | 500→DB | 87 |

Índices existen pero advisors los marca “unused” por falta de tráfico real.

## Acción requerida del operador

Actualizar `.env` `DATABASE_URL` al host real:
`db.ghkrlpebwqqdynqmmsbv.supabase.co` + password de Database Settings + `?sslmode=require`.
