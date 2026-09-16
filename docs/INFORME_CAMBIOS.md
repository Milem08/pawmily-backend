# Informe de cambios — PawMily

**Fecha:** 7 de agosto de 2026  
**Objetivo de la sesión:** Analizar el sistema completo e igualar/ampliar la app Android respecto al portal y la API, con recordatorios, alimentación, barcode, marca y notificaciones.

---

## 1. Resumen

Se trabajó en **tres capas** (API, Android, web). Gran parte del código quedó implementado y alineado al contrato nuevo.  
**Pendiente crítico:** aplicar la migración SQL en Supabase (la base remota no aceptó conexiones DDL en el momento: error `tenant/user not found`). Hasta migrar y redesplegar Railway, los campos/rutas nuevas no estarán activos en producción.

---

## 2. Backend (API Express + Prisma)

### 2.1 Modelo de datos (schema)

**Feeding — campos nuevos**
- `foodType`, `brand`, `quantity`, `frequency`
- `restrictions`, `allergies`, `observations`, `vetRecommendations`

**Reminder — campos nuevos**
- `description`, `category`, `priority`, `color`, `icon`
- `notifyEnabled`, `notes`, `recurrence`
- `completed`, `completedAt`, `createdByUserId`, `notificationMessage`

**Appointment — campos nuevos**
- `attendanceStatus` (default `Pendiente`)
- `ownerConfirmedAt`

Archivo SQL listo para aplicar a mano:  
`docs/migration_owner_reminders_feeding_v2.sql`

### 2.2 Reglas de negocio nuevas / ajustadas

| Acción | Vet | Owner vinculado |
|--------|-----|-----------------|
| Crear recordatorio personal (`recordatorio`) | Sí | Sí |
| Editar / completar / eliminar recordatorio personal | Sí (de su paciente) | Sí (solo los que él creó) |
| Crear / editar / eliminar `cita` | Sí | No |
| Actualizar feeding descriptivo | Sí (completo) | Sí (campos de alimento; no pisa fórmula kcal del vet) |
| Generar dieta RER/MER | Sí | No |
| Listar citas propias | — | Sí (`/appointments/mine`) |
| Confirmar asistencia a cita | — | Sí (`/appointments/:id/confirm`) |

### 2.3 Endpoints nuevos o ampliados

| Método | Ruta | Descripción |
|--------|------|-------------|
| PUT | `/api/patients/reminders/:id` | Editar recordatorio personal |
| POST | `/api/patients/reminders/:id/complete` | Marcar como completado |
| GET | `/api/appointments/mine` | Citas del dueño (pacientes vinculados) |
| POST | `/api/appointments/:id/confirm` | Confirmar asistencia |
| POST/PUT body | feeding / reminders | Aceptan campos ampliados (Zod) |

### 2.4 Notificaciones (texto)

Nuevo generador de mensajes en español (`NotificationMessage`), por ejemplo:
- “Hoy tienes una cita veterinaria con {mascota}…”
- “Es hora del baño de {mascota}.”
- “Recuerda darle el medicamento a {mascota}.”

Se guarda en `reminder.notificationMessage` al crear/actualizar.

### 2.5 Archivos backend tocados (principales)

- `prisma/schema.prisma`
- `src/domain/patients/Patient.ts`, `PatientRepository.ts`, `NotificationMessage.ts`
- `src/application/patients/PatientUseCases.ts`
- `src/application/scheduling/AppointmentUseCases.ts`
- `src/infrastructure/persistence/prisma/PrismaPatientRepository.ts`
- `src/infrastructure/persistence/prisma/PrismaAppointmentRepository.ts`
- `src/infrastructure/container.ts`
- `src/interfaces/http/dto/schemas.ts`
- `src/interfaces/http/routes/patientRoutes.ts`
- `src/interfaces/http/routes/appointmentRoutes.ts`
- `docs/migration_owner_reminders_feeding_v2.sql`
- `scripts/apply-schema-v2.js`
- Tests unitarios ajustados (`patient.features.test.ts`)

---

## 3. Aplicación Android

### 3.1 Integración API

- `BASE_URL` → `https://api-production-66b1.up.railway.app/api/`
- JWT en interceptor, timeouts, logging en debug, reintento ante `IOException`
- Cleartext desactivado (solo HTTPS prod)
- Fuente de verdad de mascotas: `GET /patients/mine` + vínculo `POST /patients/link`
- Eliminado uso de datos mock / SQLite legado

### 3.2 UI y funcionalidades

- Empty states reales (“Aún no tienes mascotas…”, etc.)
- Formulario completo de recordatorios (título, descripción, mascota, categoría, fecha/hora, recurrencia, prioridad, color, icono, notificación, notas)
- Separación recordatorios personales vs citas médicas
- Completar / editar / eliminar personales; citas solo lectura + confirmar asistencia
- Perfil de mascota / alimentación con campos ampliados editables
- Escaneo de código: cámara (ZXing) + entrada tipo teclado HID
- Perfil de usuario desde `GET /auth/profile`
- Tema visual (teal/sage) más cercano al portal web
- Marca **PawMily**

### 3.3 Código eliminado

- `MockPetRepository.kt`
- `DatabaseHelper.kt`
- `User.kt` (legado SQLite)

### 3.4 Archivos Android tocados (principales)

- Capa red: `ApiService.kt`, `RetrofitClient.kt`, `RemotePetRepository.kt`, `PetModels.kt`, `SessionManager.kt`
- Pantallas: Home, Pets, Reminders, NewReminder, PetReminders, Feeding, Profile, PetDetail, `BarcodeScanActivity` (nueva)
- Recursos: layouts, `colors.xml`, `themes.xml`, `strings.xml`, `AndroidManifest.xml`, Gradle

---

## 4. Portal web

### 4.1 Marca

- Textos visibles **Pawmyli / PawMyli** → **PawMily** (landing y HTML asociados).
- Claves técnicas internas (`PAWMYLI_*`, `pawmyliAccessToken`) se mantuvieron para no romper sesión/config.

### 4.2 Lector de códigos USB (HID)

- Nuevo `js/barcode-hid.js`: captura ráfagas de teclado + Enter (lectores USB tipo teclado).
- Integrado en **dashboard** y **pacientes** (abre expediente / vincula según rol).

### 4.3 Cliente API

En `js/api.js` se añadieron:
- `updateReminder`, `completeReminder`
- `myAppointments`, `confirmAppointment`

---

## 5. Qué no quedó cerrado

| Ítem | Motivo |
|------|--------|
| Migración aplicada en Postgres Supabase | Conexión remota falló (`ENOTFOUND` / timeouts) |
| Deploy Railway de esta versión de API | Depende de migrar DB primero |
| Vacunas, push FCM, GPS, grupo familiar, chat, pagos | No existían en el sistema; no se inventaron módulos completos |
| App Android como clon total del portal vet | La app sigue orientada a **dueño**; clínica vet permanece en web |
| Rename profundo de variables `PAWMYLI_*` / repo | Evitar romper localStorage y despliegues |

---

## 6. Pruebas realizadas

- Unit tests backend de dieta y features de paciente: **OK** tras ajustar mock de `findByPatientIds`.
- Compilación debug Android: **OK** (sesión de implementación Android).
- Smoke E2E contra producción con columnas nuevas: **no ejecutado** (DB sin migrar).

---

## 7. Pasos pendientes recomendados

1. Ejecutar en Supabase SQL Editor el archivo  
   `docs/migration_owner_reminders_feeding_v2.sql`
2. Redesplegar API en Railway (`railway up` servicio `api`).
3. Probar Android: registro/login owner → vincular `PAW-…` → recordatorio → alimentación → confirmar cita.
4. Publicar web (push/Vercel) con HID + marca PawMily.
5. (Opcional) push FCM y módulo vacunas en una siguiente iteración.

---

## 8. Conclusión

Los cambios dejan el sistema más cerca de una experiencia dueño–clínica conectada: Android deja de depender de mocks, consume la API real, y el backend incorpora permisos y datos para recordatorios personales, citas confirmables, alimentación enriquecida y textos de notificación.  
El bloqueo actual no es de diseño de código, sino de **aplicar la migración de base de datos y redesplegar la API**.
