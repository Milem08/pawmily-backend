# Guía de Despliegue en Producción — PawMily (Runbook)

## 1. Arquitectura de producción
- **API:** Railway (`Procfile` + `railway.toml`)  
- **BD:** Supabase PostgreSQL  
- **Web:** Vercel (PAWMYLI)  
- **Android:** builds firmados apuntando a API Railway  

URL API: `https://api-production-66b1.up.railway.app/api`

---

## 2. Variables de entorno (API)
Obligatorias en producción:
- `DATABASE_URL`
- `JWT_SECRET` (fuerte)
- `NODE_ENV=production`
- `PORT` (asignado por Railway)
- `CORS_ORIGINS` (dominios Vercel reales)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (si media)
- Opcionales email: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_PUBLIC_URL`

---

## 3. Pasos de despliegue API
1. Configurar variables en Railway.  
2. Conectar repo / deploy desde build (`prisma generate && tsc`).  
3. Start: `node dist/server.js` (según Procfile).  
4. Smoke:
   - `GET /api/health` → `{ "status": "ok" }`
   - register → login → create patient → list mine

---

## 4. Despliegue Web
1. Proyecto Vercel ligado a GitHub PAWMYLI.  
2. `PAWMYLI_API_BASE` → API Railway `/api`.  
3. Verificar login vet y listado pacientes.

---

## 5. Publicación Android
1. `BASE_URL` producción en `RetrofitClient`.  
2. Build release / debug interno.  
3. Probar vínculo, detalle, notificaciones en dispositivo real.

---

## 6. Base de datos
- Preferir `prisma migrate` en prod controlado; `db push` solo entornos controlados.  
- Índices ya definidos en schema (code, vetId, ownerUserId, reminders…).  
- Revocar privilegios anon innecesarios (backend usa connection string privilegiada).

---

## 7. Respaldos y recuperación
Seguir estrategia 3-2-1 documentada en `docs/BACKUP_3_2_1_1_0.md` del backend:
1. Snapshot Supabase periódico.  
2. Copia export SQL fuera de la nube.  
3. Credenciales JWT rotables.  

**Recuperación ante fallo API:** redeploy Railway; verificar env; health.  
**Recuperación BD:** restore snapshot Supabase; validar Prisma client.  
**Rollback web:** redeploy commit anterior en Vercel.

---

## 8. Checklist post-deploy
- [ ] Health OK  
- [ ] CORS web OK  
- [ ] Login vet + owner OK  
- [ ] Crear paciente + barcode OK  
- [ ] Link owner OK  
- [ ] Citas mes OK  
- [ ] Android perfil mascota no crashea  

## 9. Contacto operativo
Soporte técnico = equipo de desarrollo (sin consola admin SaaS). Uso de logs Railway + `AuditLog` en BD.
