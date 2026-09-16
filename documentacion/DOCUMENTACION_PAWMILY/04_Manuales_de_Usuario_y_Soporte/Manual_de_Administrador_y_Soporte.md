# Manual de Administrador y Soporte — PawMily

**Alcance:** operación técnica y de clínica.  
**Nota:** no existe rol `admin` SaaS; la administración se reparte entre **veterinario** (datos clínicos) y **soporte técnico** (infraestructura).

---

## 1. Roles y permisos

| Rol | Canal | Puede | No puede |
|-----|-------|-------|----------|
| vet | Web | Pacientes propios, consultas, dieta, agenda, config, aprobar links OWNER | Ver pacientes de otra clínica |
| owner | Android | Vincular, leer expediente vinculado, recordatorios personales, confirmar citas | Crear consultas / editar agenda ajena |
| soporte | Railway/Supabase/Vercel | Logs, env, restores, redeploys | Alterar historia clínica sin proceso |

---

## 2. Gestión de usuarios (clínica)
1. Alta de veterinarios vía registro (controlar dominio/email internos).  
2. Dueños se auto-registran en la app.  
3. Vínculos: el vet aprueba solicitudes pendientes.  
4. Revocación: desvincular / revoke member vía API según caso.

---

## 3. Revisión de logs y auditoría
- **API:** logs de request en Railway; tabla `AuditLog` en Postgres.  
- **Errores cliente:** mensajes amigables; detalles en Logcat (Android) / consola (web).  
- Buscar picos 401/429 (auth / rate limit).

---

## 4. Operaciones de soporte frecuentes

| Incidente | Procedimiento |
|-----------|---------------|
| API no responde | Health check → redeploy Railway → verificar env |
| Web CORS | Añadir origen a `CORS_ORIGINS` y redeploy |
| Login falla masivo | Revisar JWT_SECRET / BD / rate limit |
| Dueño no ve mascota | Verificar LinkRequest APPROVED y `ownerUserId` |
| Foto no carga | Verificar photo/photoAssetId; placeholder esperado si vacío |
| BD sospechosa | Snapshot Supabase; no ejecutar wipe sin autorización |

---

## 5. Respaldos
- Snapshots Supabase periódicos.  
- Export SQL adicional fuera de la nube.  
- No commitear `.env` ni secretos.  
- Rotación de `JWT_SECRET` implica re-login global.

---

## 6. Checklist de auditoría de acceso
- [ ] Solo el vet correcto ve sus pacientes.  
- [ ] Owner solo ve mascotas vinculadas.  
- [ ] Refresh tokens se revocan en logout.  
- [ ] Service role Supabase no expuesto al cliente.

---

## 7. Contacto y escalamiento
1. Reproducir con usuario de prueba.  
2. Capturar request-id/hora y endpoint.  
3. Revisar Railway + Supabase.  
4. Si es bug de app, correlacionar con build Android / commit web.
