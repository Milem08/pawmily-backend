# Informe de estado actual — Sistema PawMily

**Fecha de corte:** 10 de agosto de 2026  
**Verificación en vivo:** API health `ok` · Supabase tablas presentes · repos locales revisados

---

## 1. Visión general

PawMily es una plataforma híbrida:

| Componente | Rol | Estado |
|------------|-----|--------|
| API Express (Railway) | Núcleo de negocio + JWT | **Operativa** (`/api/health` = ok) |
| PostgreSQL (Supabase) | Fuente de verdad | **Activa** (migración v2 aplicada) |
| Portal web (Vercel / GitHub PAWMYLI) | Veterinarios | **Operativo**; cambios recientes en draft PR |
| App Android | Propietarios | **Código listo** contra API prod; repo git local |

**Madurez estimada del sistema integral:** ~80–85%  
(núcleo clínico prod cerrado; dueño Android listo en código; faltan push, GPS, vacunas como módulo, admin, etc.)

---

## 2. Arquitectura y conexión

```text
Portal Web (Vercel)  ──JWT──►  API Railway  ──►  Postgres Supabase
App Android (owner)  ──JWT──►       ▲
                                    │
                         https://api-production-66b1.up.railway.app/api
```

- Auth: JWT propio (no Supabase Auth).  
- Roles: `vet` | `owner` (sin administrador).  
- Identificación de mascota: código `PAW-######` + barcode Code128 (no QR de expediente).

---

## 3. Base de datos (Supabase)

Proyecto: `ghkrlpebwqqdynqmmsbv` · tablas públicas verificadas:

| Tabla | # columnas (aprox.) | Contenido clave |
|-------|---------------------|-----------------|
| User | 12 | Cuenta, rol, perfil |
| Patient | 19 | Ficha, `code`, `barcodePayload`, `ownerUserId` |
| MedicalRecord | 17 | Consulta ampliada (vitals, notas, etc.) |
| Feeding | 18 | Dieta + campos ampliados (tipo, marca, alergias…) |
| Reminder | 20 | Personales + citas; completed, notificationMessage… |
| Appointment | 12 | Agenda + `attendanceStatus`, `ownerConfirmedAt` |
| ClinicConfig | 14 | Preferencias de clínica |

Migración `owner_reminders_feeding_appointments_v2`: **aplicada** (ago 2026).  
Smoke posterior a la migración: feeding ampliado, reminder owner, `appointments/mine`, confirm asistencia = OK.

---

## 4. API (Railway)

**URL:** `https://api-production-66b1.up.railway.app/api`  
**Stack:** Express + TypeScript + Prisma + Zod + JWT · Clean/DDD  
**Repo local:** `Documents\Default Project\pawmily-backend` (**sin git** aún)

### Módulos disponibles

| Área | Capacidad |
|------|-----------|
| Auth | register, login, profile GET/PUT |
| Pacientes | CRUD vet, mine/link/unlink owner, code, barcode |
| Consultas | medical-records CRUD (escritura vet) |
| Dieta | POST diet (vet), GET/PUT feeding (owner puede campos descriptivos) |
| Recordatorios | list/create; PUT + complete; delete con reglas por tipo |
| Citas | CRUD vet; mine + confirm para owner |
| Config | clínica GET/PUT (vet) |
| Health | público |

### Permisos (resumen)

- **Vet:** pacientes propios, consultas, dieta calculada, agenda, config, recordatorios.  
- **Owner:** link por código, lectura expediente/dieta/citas, CRUD recordatorios **personales**, confirmar asistencia; **no** crea consultas ni edita citas.

---

## 5. Portal web (PAWMYLI)

| Ítem | Estado |
|------|--------|
| Stack | HTML/CSS/JS estático + `PawApi` |
| Deploy | Vercel (proyecto tipo `pawmyli` / `pawmyli-one`) → API Railway |
| Rama actual | `cursor/pawmily-hid-barcode-branding` @ `b99680a` |
| Remoto | sincronizada con `origin` |
| Draft PR | https://github.com/danielalbertogomezmiguel-tech/PAWMYLI/pull/1 |

### Módulos UI

- Landing, login/registro **vet**, dashboard, pacientes, perfil/expediente, agenda, configuración.  
- Código + barcode, consulta ampliada, dieta, selector de paciente en citas.  
- Lector **HID USB** (teclado) en dashboard y pacientes.  
- Marca visible **PawMily**.  
- Helpers API: update/complete reminder, myAppointments, confirmAppointment.

### Gaps web

- CRUD visual de recordatorios personales incompleto vs API.  
- Update de citas en UI limitado (API sí permite PUT).  
- Sin módulo reportes / vacunas / push.  
- Registro owner no es flujo principal del portal.

---

## 6. App Android (PawMily)

| Ítem | Estado |
|------|--------|
| Ruta | `AndroidStudioProjects\PawMily` |
| Git | **Local** `main` @ `f92982c` (initial commit); **sin remote GitHub** |
| API | `https://api-production-66b1.up.railway.app/api/` |
| Rol | Owner-first |

### Implementado en código

- Auth JWT, sesión, reintentos, empty states.  
- Mascotas vía `/mine` + `/link` (sin mocks).  
- Recordatorios (formulario rico; personales vs citas).  
- Feeding ampliado.  
- Barcode cámara (ZXing) + HID.  
- Perfil desde API.  
- Tema teal/sage alineado al portal.

### Gaps Android / producto

- Sin remote GitHub aún.  
- Push FCM no implementado (solo texto `notificationMessage` en API).  
- No hay flujo vet completo (intencional).  
- GPS, grupo familiar real, vacunas: no existen en backend.

---

## 7. Matriz de capacidades (actual)

| Capacidad | API | DB | Web | Android |
|-----------|-----|----|-----|---------|
| Auth JWT | Listo | User | Listo (vet) | Listo (owner) |
| Pacientes + PAW | Listo | Listo | Listo | Link/lectura |
| Barcode Code128 | Listo | Listo | Listo + HID | Cámara + HID |
| Consultas ampliadas | Listo | Listo | Listo | Lectura |
| Dieta / feeding | Listo | Listo | Listo | Lectura/edición descriptiva |
| Citas + confirm | Listo | Listo | Agenda vet | Mine + confirm |
| Recordatorios personales | Listo | Listo | Parcial | Listo |
| Push / email | No | — | No | No |
| GPS / QR / familia / vacunas / pagos / chat / admin | No | — | No | No |

---

## 8. Repositorios y despliegues

| Proyecto | Git | Remoto | Deploy |
|----------|-----|--------|--------|
| Backend | No | — | Railway `api` |
| Web PAWMYLI | Sí | `danielalbertogomezmiguel-tech/PAWMYLI` | Vercel; PR #1 draft pendiente de merge |
| Android | Sí (local) | Ninguno | APK local / Studio |

---

## 9. Pendientes prioritarios

1. **Merge PR #1** del portal (HID + marca PawMily) a `main` y verificar Vercel.  
2. **Crear remoto GitHub** para Android y subir `main`.  
3. **Inicializar git** del backend (opcional pero recomendado) y alinear con Railway.  
4. Push notifications (FCM) si se quieren alertas reales.  
5. CRUD recordatorios en UI web.  
6. (Producto) vacunas, GPS, grupo familiar — solo si el negocio lo prioriza.

---

## 10. Conclusión

El sistema está **operativo en producción** en el eje clínica: API + Postgres + portal vet.  
La base ya incluye el esquema ampliado (feeding, reminders, citas/confirmación).  
Android quedó cableado a la API real y con las funciones de dueño principales; falta publicar su repo remoto y capas de producto avanzadas (push, etc.).  
El draft PR del web es el siguiente cierre natural del portal.
