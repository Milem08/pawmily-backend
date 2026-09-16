# Fase 0 — Checklist diagnóstico (plan vs código)

**Fecha:** 2026-08-11  
**Referencia:** Plan Maestro PawMily + `AUDITORIA_INTEGRAL_PAWMILY.md`  
**Alcance:** solo documentación (sin cambios de producto en esta fase).

## Decisiones cerradas

| Decisión | Valor |
|----------|--------|
| Primer OWNER sin dueño | Aprueba **VET** |
| CO_OWNER / CAREGIVER | Aprueba **OWNER** |
| petCode | Migrar todos a `PAW-` + 7 chars `[A-Z2-9]` + alias temporal |
| ADMIN_CLINIC | No |
| Stack | Incremental Express + Prisma + JWT + Web + Android |

## Matriz plan vs código (baseline)

| Área | Plan | Código actual | Acción |
|------|------|---------------|--------|
| Roles cuenta | `vet` \| `owner` | `Role.ts` OK | Mantener |
| Roles mascota | OWNER / CO_OWNER / CAREGIVER | Solo `ownerUserId` | Fase 1 `PatientAccess` |
| Autorización | `authorizePatientAction` | Checks ad-hoc en use cases | Fase 1 |
| petCode | No predecible + alias | `PAW-######` secuencial | Fase 2 |
| Vinculación | LinkRequest + aprobación | Auto-claim `POST /patients/link` | Fase 2 |
| JWT | Access corto + refresh + logout revoke | Access 24h | Fase 3 |
| Rate limit auth | Estricto en login/register/reset | Global 100/min | Fase 3 |
| Imágenes | Supabase Storage + MediaAsset | Data URL en String | Fase 4 |
| AuditLog | Append-only | Ausente | Fase 5 |
| Recordatorios | Permisos por rol mascota | Vet/owner por `ownerUserId` | Fase 6 |
| Cuentas | Reset + verify email | Solo register/login | Fase 7 |
| Perf | Lean list + índices + paginación | Listas con includes pesados | Fase 8 |
| UI | Polish sin cambiar identidad | Parcial | Fase 9 |
| Demo | Quitar mocks visibles | Avatares / familia fake | Fase 10 |
| Backup | 3-2-1-1-0 RPO/RTO | No documentado | Fase 11 |
| Tests | Auth/roles/link/media/reminders | Parcial unit | Fase 12 |

## Conflictos (migración no destructiva)

1. `ownerUserId` ↔ `PatientAccess` con **dual-read**.
2. Tokens JWT `vet`/`owner` con clientes en fallback.
3. Auto-link → link-request (contrato nuevo; deprecar claim directo).
4. Data URL ↔ Object Storage con lectura dual.
5. petCodes: `previousCode` alias 90 días + reimpresión.

## Gates por fase

Tras cada fase: `tsc` / Prisma · smoke API · smoke Web · compile Android cuando toque · sin regresiones visuales · sin demos.
