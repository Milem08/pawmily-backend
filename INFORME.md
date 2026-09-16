# PAWMILY - Informe Completo del Proyecto

## 1. ¿Dónde estamos?

### Estado actual del backend

El backend NestJS está creado en:
```
C:\Users\LENOVO\Documents\Default Project\pawmily-backend
```

**Lo que ya está listo:**
- ✅ Estructura del proyecto NestJS completa
- ✅ Prisma schema (`prisma/schema.prisma`) con todas las tablas
- ✅ Auth module (registro, login, JWT, perfil)
- ✅ Patients module (CRUD pacientes, records médicos, alimentación, recordatorios)
- ✅ Appointments module (CRUD citas, filtro por fecha/mes)
- ✅ Config module (configuración de clínica)
- ✅ Dependencias npm instaladas
- ✅ Prisma Client generado

**Lo que falta:**
- ❌ Conectar a Supabase (necesito la contraseña de la DB)
- ❌ Pushear el schema a la base de datos (`prisma db push`)
- ❌ Actualizar la página web (vanilla JS) para que use la API en vez de localStorage
- ❌ Hacer deploy en Railway

---

## 2. Diagrama Entidad-Relación (DER)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PAWMILY - DER                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐       ┌──────────────────┐                        │
│  │     User      │       │     Patient      │                        │
│  ├──────────────┤       ├──────────────────┤                        │
│  │ id (PK)      │◄──────│ vetId (FK)       │                        │
│  │ email (UQ)   │  1:N  │ id (PK)          │                        │
│  │ password     │       │ code (UQ)        │                        │
│  │ name         │       │ name             │                        │
│  │ role          │       │ species          │                        │
│  │ phone        │       │ breed            │                        │
│  │ clinic       │       │ age              │                        │
│  │ address      │       │ sex              │                        │
│  │ license      │       │ weight           │                        │
│  │ photo        │       │ color            │                        │
│  │ createdAt    │       │ microchip        │                        │
│  └──────┬───────┘       │ ownerName        │                        │
│         │               │ ownerPhone       │                        │
│         │               │ ownerEmail       │                        │
│         │               │ photo            │                        │
│         │               │ createdAt        │                        │
│         │               └────────┬─────────┘                        │
│         │                        │                                   │
│         │               ┌────────┼────────────┬─────────────┐        │
│         │               │        │            │             │        │
│         │               ▼        ▼            ▼             ▼        │
│         │        ┌──────────┐ ┌──────┐ ┌──────────┐ ┌──────────┐   │
│         │        │Medical   │ │Feedi │ │Reminder  │ │          │   │
│         │        │Record    │ │ng    │ │          │ │          │   │
│         │        ├──────────┤ ├──────┤ ├──────────┤ │          │   │
│         │        │ id (PK)  │ │id(PK)│ │ id (PK)  │ │          │   │
│         │        │ petId(FK)│ │petId │ │ petId(FK)│ │          │   │
│         │        │ date     │ │(FK)  │ │ title    │ │          │   │
│         │        │ reason   │ │recAmt│ │ date     │ │          │   │
│         │        │ diagnosis│ │meals │ │ time     │ │          │   │
│         │        │ treatment│ │perDay│ │ type     │ │          │   │
│         │        │ vetName  │ │spec. │ │ createdAt│ │          │   │
│         │        │ status   │ │instr │ └──────────┘ │          │   │
│         │        │ createdAt│ │sched │              │          │   │
│         │        └──────────┘ └──────┘              │          │   │
│         │                                           │          │   │
│         │          ┌─────────────────┐              │          │   │
│         │          │  Appointment    │              │          │   │
│         └──────────┤                 │              │          │   │
│              1:N   │ id (PK)         │              │          │   │
│                    │ petName         │              │          │   │
│                    │ ownerName       │              │          │   │
│                    │ date            │              │          │   │
│                    │ time            │              │          │   │
│                    │ notes           │              │          │   │
│                    │ status          │              │          │   │
│                    │ vetId (FK)      │              │          │   │
│                    │ createdAt       │              │          │   │
│                    └────────┬────────┘              │          │   │
│                             │                       │          │   │
│                    ┌────────┘                       │          │   │
│                    ▼                                │          │   │
│         ┌──────────────────┐                        │          │   │
│         │  ClinicConfig    │                        │          │   │
│         ├──────────────────┤                        │          │   │
│         │ id (PK)          │◄───────────────────────┘          │   │
│         │ vetId (FK, UQ)   │  1:1                               │   │
│         │ clinicName       │                                    │   │
│         │ clinicAddress    │                                    │   │
│         │ clinicPhone      │                                    │   │
│         │ clinicEmail      │                                    │   │
│         │ clinicHours      │                                    │   │
│         │ mapUrl           │                                    │   │
│         │ language         │                                    │   │
│         │ timezone         │                                    │   │
│         │ dateFormat       │                                    │   │
│         │ theme            │                                    │   │
│         │ notifications    │                                    │   │
│         │ sounds           │                                    │   │
│         └──────────────────┘                                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 3. Normalización (3NF)

### Primera Forma Normal (1NF)
- Cada tabla tiene una clave primaria (`id`)
- No hay grupos repetitivos (arrays se hicieron tablas separadas)
- Todos los valores son atómicos

### Segunda Forma Normal (2NF)
- Dependencias parciales eliminadas:
  - `Patient` depende solo del `vetId` (no de datos del vet)
  - `MedicalRecord`, `Feeding`, `Reminder` dependen solo del `petId`
  - `Appointment`, `ClinicConfig` dependen solo del `vetId`

### Tercera Forma Normal (3NF)
- Dependencias transitivas eliminadas:
  - Datos del vet están en `User`, no repetidos en cada paciente
  - Datos del paciente están en `Patient`, no repetidos en cada consulta
  - `ClinicConfig` separado de `User` (datos de configuración vs datos de autenticación)

## 4. Índices (para consultas rápidas)

```sql
-- Para búsquedas por código de paciente (escaneo de código de barras)
CREATE INDEX idx_patient_code ON "Patient" ("code");

-- Para búsquedas en la agenda por fecha
CREATE INDEX idx_appointment_vet_date ON "Appointment" ("vetId", "date");

-- Para búsquedas en el calendario por mes
CREATE INDEX idx_appointment_month ON "Appointment" ("vetId", "date", "time");

-- Para filtrar pacientes del mismo veterinario
CREATE INDEX idx_patient_vet ON "Patient" ("vetId");

-- Para búsqueda de texto en pacientes (nombre, dueño, especie)
CREATE INDEX idx_patient_search ON "Patient" ("vetId", "name", "ownerName");

-- Para historial médico del paciente
CREATE INDEX idx_medical_record_pet ON "MedicalRecord" ("petId", "date");

-- Para recordatorios activos
CREATE INDEX idx_reminder_pet ON "Reminder" ("petId");

-- Para config por veterinario
CREATE INDEX idx_config_vet ON "ClinicConfig" ("vetId");

-- Para login por email
CREATE INDEX idx_user_email ON "User" ("email");

-- Para estadísticas de consultas mensuales
CREATE INDEX idx_appointment_stats ON "Appointment" ("vetId", "date", "status");
```

## 5. Estrategia de Caché y Tiempo de Respuesta

### Caché planeado (a implementar en Fase 3):
- **Redis** para endpoints de alta consulta:
  - Lista de pacientes (TTL: 5 min)
  - Configuración de clínica (TTL: 30 min)
  - Próximas citas (TTL: 1 min)
- **ETag/Last-Modified** en respuestas HTTP para evitar re-descargas

### Prevención de consultas mal formadas:
- **Validación** con `class-validator` (ya en `package.json`)
- **DTOs** tipados con decoradores
- **Rate limiting** (a implementar):
  - 100 req/min por usuario autenticado
  - 20 req/min para endpoints de búsqueda
- **Paginación** obligatoria en listas (límite default: 20 items)

### Estadísticas de consultas:
Para reflejar las consultas en estadísticas sin usar Supabase Auth, implementaré un **middleware** que registre:
- Endpoint solicitado
- Usuario (ID)
- Tiempo de respuesta
- Código de estado
- Timestamp

Esto se puede almacenar en una tabla `QueryLog` o enviarse a un servicio externo.

## 6. Plan por Fases

### FASE 1: Configuración de Base de Datos ⬅️ **ESTAMOS AQUÍ**
**Duración estimada: 30 min**
- [ ] Obtener contraseña de Supabase DB
- [ ] Configurar `.env` con connection string
- [ ] Ejecutar `npx prisma db push` para crear las tablas
- [ ] Verificar en Supabase Table Editor que las tablas existen

### FASE 2: Conectar la Página Web a la API
**Duración estimada: 2-3 horas**
- [ ] Agregar `api.js` con funciones fetch para cada endpoint
- [ ] Reemplazar `localStorage` en `auth.js` por llamadas API
- [ ] Reemplazar `localStorage` en `paciente.js` por llamadas API
- [ ] Reemplazar `localStorage` en `perfil.js` por llamadas API
- [ ] Reemplazar `localStorage` en `agenda.js` por llamadas API
- [ ] Reemplazar `localStorage` en `configuracion.js` por llamadas API
- [ ] Agregar manejo de token JWT (guardar en localStorage, enviar en headers)
- [ ] Probar flujo completo: registro → login → CRUD pacientes → agenda → perfil

### FASE 3: Optimización y Producción
**Duración estimada: 1-2 días**
- [ ] Agregar rate limiting
- [ ] Agregar paginación
- [ ] Implementar caché (Redis opcional)
- [ ] Configurar logging de consultas para estadísticas
- [ ] Hacer deploy en Railway
- [ ] Configurar variable de entorno JWT_SECRET en Railway
- [ ] Conectar dominio personalizado (opcional)

### FASE 4: Integración con App Móvil
**Duración estimada: 1-2 días**
- [ ] Crear módulos de API en la app Android (modificar `ApiService.kt` y `RetrofitClient.kt`)
- [ ] Reemplazar `MockPetRepository` por llamadas API reales
- [ ] Implementar autenticación JWT en la app
- [ ] Adaptar modelos de datos para que coincidan con la API

---

## 7. ¿Dónde se hace cada cosa en Supabase?

| Acción | Dónde en Supabase |
|--------|-------------------|
| Ver tablas creadas | **Table Editor** (sidebar izquierdo) |
| Connection string | **Project Settings → Database → Connection string → URI** |
| Database password | **Project Settings → Database → Database password** |
| API URL | **Project Settings → API → Project URL** |
| Anon/Public key | **Project Settings → API → anon public** |
| Service role key | **Project Settings → API → service_role secret** |
| SQL queries | **SQL Editor** (para índices manuales) |
| Ver queries lentos | **Project Settings → Database → Query performance** |
| Logs de consultas | **Logs → Database** |

---

## Resumen de lo que necesito de ti

Para continuar solo necesito **la contraseña de la base de datos** de Supabase. La encuentras en:

**Project Settings → Database → Database password** (dale a "Reveal" si está oculta)

Con eso armo la connection string y pusheo todas las tablas a la base de datos.
