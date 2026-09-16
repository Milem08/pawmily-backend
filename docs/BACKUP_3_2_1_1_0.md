# Backups PawMily — política 3-2-1-1-0

**RPO objetivo:** 24 horas  
**RTO objetivo:** 8 horas  

## Inventario de datos críticos

| Activo | Ubicación | Criticidad |
|--------|-----------|------------|
| Postgres (usuarios, pacientes, clínica, access, audit) | Supabase project | Crítico |
| Object Storage (fotos / clinical-assets) | Supabase Storage buckets | Alto |
| Secrets (JWT, service role, Resend) | Railway / env | Crítico (no respaldar en claro en git) |

## 3-2-1-1-0 aplicado

1. **3 copias:** (a) primaria Supabase, (b) backup automático Supabase, (c) export offsite semanal (storage + `pg_dump`).
2. **2 medios:** cloud Supabase + objeto offsite (S3/GCS/disco cifrado).
3. **1 offsite:** copia fuera del proyecto Supabase principal.
4. **1 offline/inmutable (ideal):** snapshot semanal con retención/lock (WORM o bucket versionado).
5. **0 errores de restore:** prueba de restore documentada cada trimestre.

## Operación

### Postgres (Supabase)

- Activar **Point-in-Time Recovery** / backups diarios del plan Supabase.
- Export semanal:
  ```bash
  pg_dump "$DATABASE_URL_DIRECT" --format=custom --file=pawmily-$(date +%F).dump
  ```
- Guardar dump cifrado offsite (no en el repo).

### Storage

- Buckets `pet-photos` y `clinical-assets` con **versionado** habilitado.
- Copia semanal de objetos nuevos/cambiados a bucket externo.

### Restore test (checklist)

- [ ] Restaurar dump a proyecto staging
- [ ] `prisma migrate deploy` / schema alineado
- [ ] Login vet + owner smoke
- [ ] Lookup paciente por code + alias
- [ ] Abrir foto firmada
- [ ] Verificar AuditLog append-only intacto
- [ ] Medir tiempo real ≤ RTO 8h

## Contacto / ownership

Responsable operativo: equipo PawMily. Revisar esta política en cada cambio mayor de infra.
