# Informe del Sistema PawMily / PAWMYLI

**Versión del documento:** 1.0  
**Fecha de corte:** agosto 2026  
**Base:** estado real del código y despliegues actuales (API Railway, web Vercel, app Android, Postgres Supabase)  
**Nota:** Este informe describe lo que el sistema **es hoy**. Donde una sección del esquema pedía una capacidad que aún no existe, se indica explícitamente como *no implementada* o *propuesta*, para no mezclar visión con realidad.

---

## 1. Introducción

### 1.1 ¿Qué es PawMily?

PawMily (también referido como PAWMYLI en el portal web) es una plataforma híbrida para la gestión del cuidado clínico y operativo de mascotas. Está compuesta por:

- Una **aplicación móvil Android** orientada al **propietario** de la mascota.
- Un **portal web** orientado al **veterinario / clínica**.
- Una **API REST** central que concentra autenticación, expediente clínico, dieta, agenda y recordatorios.
- Una **base de datos PostgreSQL** hospedada en Supabase (usada como Postgres; la autenticación de la aplicación no es Supabase Auth).

La información clínica y administrativa no vive “cerrada” en cada cliente: web y móvil deben consumir la misma API.

### 1.2 Problema que resuelve

En la práctica veterinaria y en el hogar del dueño suelen coexistir:

- Expedientes en papel o archivos sueltos.
- Citas sin vínculo claro a un paciente.
- Indicaciones de alimentación poco estandarizadas.
- Dificultad para que el dueño consulte lo que el veterinario registró.

PawMily busca unificar ese ciclo: el veterinario registra al paciente y su expediente; el dueño se vincula a esa mascota mediante un código único y puede consultar (según permisos) la información relevante.

### 1.3 Objetivo general

Proveer una plataforma conectada (web + móvil + API + base de datos) que permita a clínicas gestionar pacientes, consultas, dieta y agenda, y a propietarios vincularse a sus mascotas y consultar su información clínica autorizada.

### 1.4 Objetivos específicos

1. Centralizar pacientes con código único `PAW-######` y representación en código de barras Code128.
2. Permitir al veterinario crear y mantener expediente (consultas ampliadas), dieta y citas.
3. Permitir al propietario autenticarse, vincular mascotas por código y leer expediente/dieta/recordatorios (según reglas).
4. Desplegar API y portal web en producción (Railway + Vercel) sobre Postgres en Supabase.
5. Mantener separación clara de roles (`vet` / `owner`) y acceso mediante JWT.

---

## 2. Alcance

### 2.1 Qué sí hace el sistema (estado actual)

| Área | Alcance actual |
|------|----------------|
| Autenticación | Registro e inicio de sesión con JWT (veterinario y propietario). |
| Pacientes | Alta, listado, edición, baja (vet); código PAW; barcode Code128. |
| Vínculo dueño | Asociación dueño↔mascota por código (`link` / `unlink` / `mine`) en API y web. |
| Expediente clínico | Consultas médicas con campos clínicos ampliados (vitals, examen, diagnóstico, tratamiento, receta, notas, seguimiento). |
| Alimentación / dieta | Cálculo y persistencia de dieta a partir del peso (y factor por especie); notas del veterinario. |
| Agenda | Citas del veterinario; opcionalmente vinculadas a paciente; generación automática de recordatorio tipo `cita`. |
| Recordatorios | Listado y gestión (escritura principalmente veterinaria); lectura para dueño autorizado. |
| Configuración clínica | Datos de clínica y preferencias del veterinario en el portal web. |
| Despliegue | API en Railway; web en Vercel; base en Supabase. |

### 2.2 Qué no hace el sistema (hoy)

| Fuera de alcance / no implementado | Comentario |
|------------------------------------|------------|
| Venta de productos / tienda | No existe. |
| Pagos / facturación | No existe. |
| Chat veterinario–dueño | No existe. |
| Rol administrador / aprobación de veterinarios | No existe (solo `vet` y `owner`). |
| GPS / geolocalización de mascotas | No implementado (solo menciones aspiracionales en textos de la app). |
| QR nativo | No; se usa **código de barras Code128** + código textual `PAW-…`. |
| Escáner de cámara | No; el código se ingresa manualmente. |
| Notificaciones push / email | No implementadas. |
| Grupo familiar multi-usuario | No en API/DB; en Android hay UI superficial sin backend real. |
| Módulo de vacunas / medicamentos / alergias / cirugías como entidades propias | No; parte de la info puede ir en texto de la consulta. |
| Wearables / IA clínica | No. |
| Portal web en React | No; el portal es HTML/CSS/JS estático. |

---

## 3. Tecnologías

### 3.1 Backend

- Node.js (motor ≥ 20)
- Express
- TypeScript
- Prisma (ORM)
- Zod (validación de entradas)
- JWT + bcrypt (sesión y contraseñas)
- Helmet, CORS, rate limiting
- Despliegue: **Railway**
- Arquitectura: Clean Architecture / DDD (capas dominio, aplicación, infraestructura, interfaces HTTP)

### 3.2 Base de datos

- **PostgreSQL**
- Hospedaje: **Supabase** (como servidor Postgres + pooler)
- Acceso de la app: solo a través del backend (políticas RLS que deniegan uso directo anónimo/autenticado de Supabase Auth para las tablas de negocio)

### 3.3 Frontend web (portal veterinario)

- **HTML + CSS + JavaScript vanilla** (multi-página estática)
- Consumo de API con `fetch` y sesión en almacenamiento local del navegador
- Despliegue tipico: **Vercel**
- API de producción configurada hacia Railway  
  (`https://api-production-66b1.up.railway.app/api`)
- Generación visual de barcode vía servicio TEC-IT (Code128)

> Aclaración respecto a stacks “tipo React/Vite/Tailwind”: **no es el stack actual del portal**. El portal en producción/código actual es estático.

### 3.4 Aplicación móvil

- **Android / Kotlin**
- AndroidX, Fragments, Material Design, ViewBinding
- Retrofit + OkHttp + Gson
- Coroutines
- Autenticación remota con JWT
- URL actual de API en la app: emulador local (`10.0.2.2:3000`), **no** Railway de producción

---

## 4. Arquitectura

### 4.1 Diagrama lógico (estado objetivo del producto)

```text
        App Android (Propietario)          Portal Web (Veterinario)
                   │                                   │
                   │              JWT                  │
                   └───────────────┬───────────────────┘
                                   │
                                   ▼
                            API Express
                          (Railway /api)
                                   │
                                   ▼
                         PostgreSQL (Supabase)
```

### 4.2 Diagrama de madurez de conexión (estado real)

```text
   Portal Web Vercel  ──────────────►  API Railway  ──────────►  Postgres Supabase
                                              ▲
                                              │  (parcial / incompleto)
                                   App Android (emulador local)
```

Hoy el circuito **web ↔ API ↔ DB** está cerrado en producción.  
El circuito **Android ↔ API de producción** aún no está cerrado: la app apunta a backend local y el vínculo por código no usa de forma completa el contrato `POST /patients/link`.

### 4.3 Componentes

| Componente | Responsabilidad |
|------------|-----------------|
| **Portal web** | Operación diaria de la clínica: pacientes, expediente, dieta, agenda, configuración. |
| **App Android** | Experiencia del dueño: login, ver mascotas, detalle, alimentación, recordatorios (parte aún no persistida en API). |
| **API Express** | Autenticación, autorización por rol, reglas de negocio, persistencia. |
| **PostgreSQL / Supabase** | Fuente de verdad de usuarios, pacientes, consultas, dieta, citas y recordatorios. |
| **Servicio barcode externo** | Imagen Code128 a partir del código `PAW-…` (no almacena expediente). |

---

## 5. Roles

El sistema actual reconoce **dos roles**. No hay administrador.

### 5.1 Administrador

**No implementado.**  
No existe rol `admin`, ni flujo de “aprobación de veterinarios”, ni panel de administración global.

### 5.2 Veterinario (`vet`)

**Puede:**

- Registrarse e iniciar sesión (portal web; registro web fuerza perfil clínico/vet).
- Crear, listar, editar y eliminar pacientes de su clínica.
- Generar y consultar código PAW y barcode.
- Crear, editar y eliminar consultas médicas de sus pacientes.
- Generar/actualizar dieta y alimentación.
- Crear, listar, actualizar y eliminar citas.
- Crear y eliminar recordatorios de pacientes propios.
- Consultar y actualizar configuración de clínica / perfil.

**No puede (por diseño actual):**

- Ver o modificar pacientes de otro veterinario.
- Operar como “admin” del sistema.
- (En la práctica del producto) usar la app Android como flujo principal de clínica: la app está orientada a propietario.

### 5.3 Propietario (`owner`)

**Puede (API / contrato):**

- Registrarse e iniciar sesión (especialmente vía app, con teléfono).
- Vincular una mascota por código si aún no está vinculada a otro dueño.
- Desvincular una mascota propia.
- Listar sus mascotas vinculadas (`/patients/mine`).
- Leer paciente, historial médico, alimentación y recordatorios de mascotas vinculadas.
- Consultar barcode de mascotas que puede leer.

**No puede:**

- Crear pacientes ni generar códigos.
- Crear, editar o eliminar consultas médicas (recibe error de autorización).
- Generar o editar dieta/alimentación en API.
- Crear/eliminar recordatorios en API (escritura reservada a veterinario).
- Gestionar citas ni configuración de clínica.

**Estado en clientes:**

- En **web**, hay soporte parcial de vínculo y perfil en solo lectura.
- En **Android**, el login/registro funciona contra API local; el vínculo real y la lectura completa en producción están incompletos.

---

## 6. Reglas de negocio

### 6.1 Usuarios

- Existen roles `vet` y `owner`.
- El correo, cuando se usa, identifica al usuario (unicidad a nivel de modelo).
- El registro puede hacerse con correo y/o teléfono según el flujo del cliente.
- Las contraseñas se almacenan hasheadas (no en texto plano).
- No hay aprobación administrativa de veterinarios: el registro de vet queda activo al crearse.

### 6.2 Mascotas / pacientes

- Cada paciente pertenece a un veterinario creador (`vetId`).
- Cada paciente tiene un código único con formato `PAW-` + 6 dígitos.
- El payload de barcode coincide con ese código (Code128).
- Un paciente puede tener como máximo un `ownerUserId` (dueño de cuenta vinculado).
- Si ya está vinculado a otro dueño, un nuevo link debe rechazarse.
- El veterinario crea la ficha; el dueño no “da de alta” la mascota en la clínica desde el contrato actual de API.
- Especie/raza/edad/sexo/peso/color/microchip y datos de contacto del propietario (nombre/teléfono/correo de ficha) forman parte del expediente demográfico.

### 6.3 Consultas médicas

- Solo veterinarios del paciente pueden crear, editar o eliminar consultas.
- Los dueños autorizados pueden leer el historial.
- Una consulta puede incluir motivo, diagnóstico, tratamiento, estado, signos vitales, examen físico, recetas, notas y fecha de seguimiento.
- **No** aplica la regla “nunca editar / nunca eliminar”: en el sistema actual el veterinario sí puede actualizar o borrar un registro médico.

### 6.4 Alimentación / dieta

- La generación automática usa peso en kg y un factor de actividad por especie (perro/gato por defecto; configurable).
- Fórmula de referencia: RER = 70 × peso^0.75; MER = RER × factor; se derivan kcal/día y texto de cantidad recomendada.
- Solo el veterinario puede generar (`/diet`) o editar feeding.
- El dueño puede leer el resultado.
- Edad y raza **no** entran hoy en la fórmula automática (pueden existir en la ficha, pero no alimentan el cálculo).

### 6.5 Citas y recordatorios

- Solo veterinarios gestionan citas.
- Si una cita se crea con `patientId` válido del vet, se crea automáticamente un recordatorio tipo `cita` asociado.
- Los recordatorios tienen tipos usados: `recordatorio` y `cita`.
- Escritura de recordatorios: veterinario. Lectura: vet y owner autorizado.

### 6.6 Identificación (código / barcode)

- El identificador de negocio es el código PAW textual.
- El barcode es representación Code128 de ese código.
- No hay QR de expediente embebido ni token firmado dentro de un QR.

### 6.7 Reglas que el esquema de informe pedía y que NO aplican hoy

- “Solo perros y gatos” → no está endurecido como restricción única en dominio (se acepta especie como texto).
- “Solo administrador aprueba veterinarios” → no existe.
- “Consultas inmutables” → no; son editables/eliminables por el vet.
- “Grupo familiar: solo el principal invita” → no implementado.
- “GPS / privacidad de ubicación” → no implementado.

---

## 7. Flujo completo

### 7.1 Registro e ingreso del veterinario (web)

```text
Landing
   ↓
Registro clínica / veterinario
   ↓
Login
   ↓
Dashboard
   ↓
Pacientes / Agenda / Configuración
```

No hay estado “pendiente de aprobación”.

### 7.2 Alta de paciente y código

```text
Veterinario autenticado
   ↓
Registrar mascota
   ↓
API asigna PAW-###### y barcodePayload
   ↓
Web muestra código + imagen barcode
   ↓
Opción “Ver expediente”
```

### 7.3 Consulta médica

```text
Veterinario
   ↓
Abrir expediente del paciente
   ↓
Nueva consulta (campos ampliados)
   ↓
Guardar
   ↓
Historial actualizado
   ↓
Dueño (si está vinculado) puede leerlo
```

### 7.4 Dieta

```text
Veterinario en expediente
   ↓
Ingresa peso (kg) y notas
   ↓
Generar dieta
   ↓
Se persiste Feeding (kcal, cantidad, comidas, notas)
   ↓
Dueño puede consultar (lectura)
```

### 7.5 Cita con recordatorio

```text
Veterinario en Agenda
   ↓
Selecciona paciente (opcional) + fecha/hora
   ↓
Confirmar cita
   ↓
Si hay patientId → Reminder tipo "cita"
   ↓
Visible en listados de recordatorios / dashboard
```

### 7.6 Registro del propietario y vínculo (contrato API / web)

```text
Registro owner
   ↓
Login
   ↓
Ingresar código PAW-######
   ↓
POST link
   ↓
Mascota aparece en “mis pacientes”
   ↓
Lectura de expediente / dieta / recordatorios
```

### 7.7 Flujo Android actual (realidad)

```text
Registro/Login owner (API local del emulador)
   ↓
Dashboard
   ↓
Ingreso de código (almacenamiento local de códigos)
   ↓
Intento de consulta por código
   ↓
Detalle / alimentación / recordatorios (UI; persistencia API incompleta)
```

El flujo Android **aún no replica de punta a punta** el contrato de producción descrito en 7.6.

---

## 8. Base de datos

Fuente de verdad: modelos Prisma sobre PostgreSQL.

### 8.1 User (usuarios)

Datos de cuenta: identidad, credenciales, rol, datos de perfil/clínica opcionales.  
Relaciones: pacientes como veterinario; pacientes como dueño vinculado; citas; configuración de clínica.

### 8.2 Patient (mascotas / pacientes)

Ficha clínica-demográfica + `code` + `barcodePayload` + `vetId` + `ownerUserId` opcional.  
Relaciones: historial médico, feeding 1:1, recordatorios, citas.

### 8.3 MedicalRecord (consultas)

Una fila por consulta/visita. Incluye campos clínicos ampliados.  
Relación: pertenece a un Patient.

### 8.4 Feeding (alimentación)

Una configuración de dieta por paciente. Incluye cantidad recomendada, comidas/día, peso usado, kcal, versión de fórmula, notas.  
Relación 1:1 con Patient.

### 8.5 Appointment (citas)

Agenda del veterinario; puede o no apuntar a un Patient.  
Relaciones: User (vet), Patient opcional, Reminders asociados.

### 8.6 Reminder (recordatorios)

Recordatorios de paciente; pueden vincularse a una cita.  
Tipos relevantes: `recordatorio`, `cita`.

### 8.7 ClinicConfig (clínica)

Preferencias y datos de la clínica por veterinario (1:1).

### 8.8 Tablas / módulos que el esquema pedía y no existen como entidades

- Vacunas  
- Medicamentos (como catálogo/tabla)  
- Grupo familiar  
- Peso histórico independiente (el peso vive en Patient y/o en consulta/dieta)  
- GPS / ubicaciones  
- Archivos adjuntos de estudios  

### 8.9 Relaciones principales (texto)

- Un User(vet) → muchos Patient  
- Un User(owner) → muchos Patient (vía ownerUserId)  
- Un Patient → muchos MedicalRecord  
- Un Patient → un Feeding  
- Un Patient → muchos Reminder  
- Un Patient → muchos Appointment (opcionales)  
- Un Appointment → muchos Reminder (típicamente el de tipo cita)  
- Un User(vet) → un ClinicConfig  

---

## 9. API

Prefijo base: `/api`  
Autenticación: Bearer JWT (excepto health, register y login).

### 9.1 Salud

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| GET `/health` | Verifica que el servicio responde | Público |

### 9.2 Autenticación y perfil

| Método y ruta | Descripción | Parámetros principales | Permisos |
|---------------|-------------|------------------------|----------|
| POST `/auth/register` | Alta de usuario | email/phone, password, name, role opcional, datos clínica | Público |
| POST `/auth/login` | Emite JWT | email/phone, password | Público |
| GET `/auth/profile` | Perfil del usuario autenticado | — | Autenticado |
| PUT `/auth/profile` | Actualiza perfil (y password opcional) | campos de perfil | Autenticado |

### 9.3 Pacientes

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| POST `/patients` | Crear paciente + código PAW | Vet |
| GET `/patients` | Listar pacientes del vet (paginado/búsqueda) | Vet |
| GET `/patients/mine` | Pacientes vinculados del owner | Owner |
| POST `/patients/link` | Vincular por `{ code }` | Owner |
| DELETE `/patients/:id/link` | Desvincular | Owner vinculado o vet dueño |
| GET `/patients/code/:code` | Obtener por código (si autorizado) | Vet/Owner autorizado |
| GET `/patients/:id` | Detalle | Lectura autorizada |
| PUT `/patients/:id` | Actualizar ficha | Vet |
| DELETE `/patients/:id` | Eliminar paciente | Vet |
| GET `/patients/:id/barcode` | Código + formato Code128 + URL de imagen | Lectura autorizada |

### 9.4 Consultas médicas

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| POST `/patients/:id/medical-records` | Crear consulta | Vet |
| GET `/patients/:id/medical-records` | Listar | Lectura autorizada |
| PUT `/patients/:id/medical-records/:recordId` | Editar | Vet |
| DELETE `/patients/:id/medical-records/:recordId` | Eliminar | Vet |

### 9.5 Dieta / feeding

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| POST `/patients/:id/diet` | Calcular y guardar dieta | Vet |
| PUT `/patients/:id/feeding` | Actualización manual | Vet |
| GET `/patients/:id/feeding` | Consultar | Lectura autorizada |

### 9.6 Recordatorios

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| POST `/patients/:id/reminders` | Crear | Vet |
| GET `/patients/:id/reminders` | Listar | Lectura autorizada |
| DELETE `/patients/reminders/:id` | Eliminar | Vet |

### 9.7 Citas

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| POST `/appointments` | Crear (puede incluir patientId) | Vet |
| GET `/appointments` | Listar (filtro fecha/paginación) | Vet |
| GET `/appointments/month` | Listar por mes | Vet |
| GET `/appointments/:id` | Detalle | Vet |
| PUT `/appointments/:id` | Actualizar | Vet |
| DELETE `/appointments/:id` | Eliminar | Vet |

### 9.8 Configuración

| Método y ruta | Descripción | Permisos |
|---------------|-------------|----------|
| GET `/config` | Obtener config de clínica del vet | Vet |
| PUT `/config` | Actualizar config | Vet |

### 9.9 Respuestas (patrón general)

- Éxito de creación: cuerpo del recurso y código HTTP 201 cuando aplica.  
- Lecturas: JSON del recurso o listas con `data` + `meta` en listados paginados.  
- Errores de negocio: mensaje + código HTTP (401 sesión, 403 permiso, 404 no encontrado, 409 conflicto de vínculo, 400 validación).

---

## 10. Aplicación móvil

Orientación: **propietario**.

### 10.1 Pantallas principales

| Pantalla | Qué muestra / hace (UI) | Estado frente a API |
|----------|-------------------------|---------------------|
| Entrada / Main | Arranque hacia login o dashboard según sesión | Local + token |
| Login | Teléfono/correo y contraseña | API login |
| Registro | Alta como `owner` | API register |
| Dashboard (shell) | Navegación inferior | Contenedor |
| Inicio (Home) | Mascotas “vinculadas” + ingreso de código | Parcial (códigos locales; no link completo) |
| Mascotas | Listado de mascotas | Depende del vínculo local/remoto |
| Detalle de mascota | Resumen / historial / alimentación / “familia” | Lectura parcial |
| Reporte médico | Vista de historial | Sobre datos traídos/embebidos; create API poco usada |
| Alimentación (detalle) | Plan / comidas | UI; escritura API no cerrada para owner |
| Recordatorios | Lista y alta de recordatorio | UI; persistencia API incompleta; además la API reserva escritura al vet |
| Perfil | Datos de usuario | Parcial |

### 10.2 Elementos típicos por pantalla

- **Login:** campos de credenciales, acción entrar, navegación a registro.  
- **Registro:** datos de propietario, alta como dueño.  
- **Home/Mascotas:** tarjetas de mascota, acción de agregar por código.  
- **Detalle:** pestañas de resumen, historial, alimentación.  
- **Recordatorios:** listado + formulario de nuevo recordatorio.  

### 10.3 Lo que la app aún no ofrece de forma real

- Conexión a API de producción.  
- Vínculo oficial `link`.  
- Barcode nativo.  
- GPS.  
- QR.  
- Grupo familiar real.  
- Push.

---

## 11. Portal veterinario

Orientación: **clínica / veterinario**. Stack: páginas estáticas conectadas a API.

### 11.1 Landing

Presentación del producto y acceso a autenticación.

### 11.2 Login / Registro

- Login de veterinario.  
- Registro de clínica/veterinario (rol vet).  
- No hay registro owner pensado como flujo principal del portal.

### 11.3 Dashboard

- Estadísticas simples del día/semana.  
- Próximas consultas del día.  
- Recordatorios (incluye destacados de tipo cita).  
- Acceso a búsqueda por código.

### 11.4 Pacientes

- Búsqueda y listado.  
- Alta de mascota.  
- Al crear: muestra código + barcode y acceso al expediente.  
- Si el usuario fuera owner: acción de vincular por código (soporte parcial de rol).

### 11.5 Perfil / expediente del paciente

- Datos demográficos y de propietario de ficha.  
- Código + barcode (descargar/imprimir).  
- Dieta: generar por peso y editar resultado.  
- Historial médico + modal de consulta ampliada.  
- Edición de ficha (vet).  
- Owner en solo lectura cuando aplica.

### 11.6 Agenda

- Calendario mensual.  
- Listado de citas del día.  
- Alta de cita con selector de paciente.  
- Eliminación de citas.  
- (La API permite update; la UI se centra en crear/eliminar.)

### 11.7 Configuración

- Perfil del veterinario.  
- Datos de clínica y preferencias (idioma, zona horaria, tema, flags de notificaciones/sonidos a nivel preferencia de UI — no push real).

### 11.8 Reportes

**No hay módulo de reportes analíticos** (PDF gerenciales, estadísticas avanzadas, exportación clínica masiva) como sección dedicada.

---

## 12. GPS

### 12.1 Estado

**No implementado.**

### 12.2 Cómo debería funcionar (propuesta de producto, no realidad actual)

1. El dispositivo del propietario obtiene ubicación con permiso del sistema.  
2. Se envía de forma controlada a la API (o se comparte solo en eventos).  
3. El dueño ve ubicación/historial en la app.  
4. El veterinario, por privacidad, no debería ver tracking continuo del hogar salvo consentimiento explícito y un caso de uso clínico justificado.

### 12.3 Qué ve / no ve hoy

- Usuario: no hay mapa ni tracking real.  
- Veterinario: no recibe GPS.

---

## 13. QR / identificación visual

### 13.1 Estado real

No hay QR de expediente.  
Hay **código textual PAW** + **barcode Code128**.

### 13.2 Qué contiene el identificador actual

- El valor `PAW-######` (también en `barcodePayload`).  
- La imagen Code128 es solo una codificación visual de ese texto.

### 13.3 Quién puede usarlo

- El veterinario lo genera al crear el paciente y lo visualiza/imprime en el portal.  
- El dueño lo usa para vincularse (ingreso manual del código).  
- Cualquier lectura de detalle exige autorización (vet dueño o owner vinculado).

### 13.4 Qué información muestra / oculta

- El código por sí solo no incluye diagnóstico ni datos sensibles embebidos.  
- La información clínica solo aparece después de autenticación y autorización vía API.  
- No hay “QR público” que abra el expediente completo sin login.

---

## 14. Alimentación

### 14.1 Cómo se calcula (actual)

1. El veterinario indica peso en kilogramos.  
2. Se calcula RER y luego MER con factor de actividad (perro ~1.6, gato ~1.2, u override).  
3. Se obtiene kcal/día y un texto de cantidad recomendada repartido en comidas/día.  
4. Se pueden guardar notas del veterinario.  
5. Todo queda en Feeding.

### 14.2 Datos que usa hoy

- Peso (obligatorio para generar).  
- Especie (para factor por defecto).  
- Comidas/día (opcional, default razonable).  
- Factor de actividad (opcional).  
- Notas del vet (opcional).

### 14.3 Datos del esquema de informe que aún no entran al cálculo

- Edad  
- Raza  
- Horario complejo automatizado (existe campo `schedule`, pero no es el núcleo del cálculo RER/MER)

### 14.4 Permisos

- Escribe: veterinario.  
- Lee: veterinario y propietario vinculado.

---

## 15. Historial médico

### 15.1 Qué contiene hoy (por consulta)

- Fecha, motivo, veterinario, estado.  
- Diagnóstico y tratamiento.  
- Peso en visita, temperatura, frecuencias cardíaca/respiratoria.  
- Examen físico, prescripciones, notas, fecha de seguimiento.

### 15.2 Qué no está modelado como módulos propios

| Elemento pedido en plantilla | Estado |
|------------------------------|--------|
| Vacunas | No como entidad; puede narrarse en consulta |
| Cirugías | Idem |
| Medicamentos (catálogo) | Idem (texto en receta/tratamiento) |
| Alergias | No entidad |
| Resultados de laboratorio estructurados | No |
| Archivos / adjuntos | No |

El “historial” actual es esencialmente la **lista de consultas médicas** (+ datos demográficos y dieta aparte).

---

## 16. Seguridad

### 16.1 Controles existentes

- Autenticación por JWT.  
- Contraseñas con hash.  
- Autorización por rol y pertenencia (vet del paciente / owner vinculado).  
- Validación de entradas.  
- Cabeceras de seguridad básicas (Helmet), CORS y rate limiting en API.  
- Base de datos no expuesta abiertamente a clientes finales para escritura de negocio (enfoque backend-only + RLS denegatoria en Supabase para roles anon/authenticated).  

### 16.2 Despliegue

- API pública HTTPS en Railway.  
- Web en Vercel (HTTPS).  
- Android hoy usa HTTP claro hacia emulador (aceptable solo en desarrollo).

### 16.3 Riesgos / pendientes de endurecimiento

- Rotación de secretos si alguna credencial se compartió en cleartext durante desarrollo.  
- Eliminar restos de telemetría/debug de desarrollo si quedaran en middleware.  
- Cerrar Android solo contra HTTPS de producción.  
- Definir política explícita de retención y borrado de expediente.  
- El flag “notifications” de clínica no implica seguridad push.

---

## 17. Casos de uso

A continuación, casos alineados al sistema real (y algunos marcados como futuros).

### CU-01 Registrar veterinario  
**Actor:** Veterinario  
**Precondición:** Ninguna  
**Flujo:** Abrir registro web → capturar datos → API register → login → dashboard.

### CU-02 Iniciar sesión veterinario  
**Actor:** Veterinario  
**Precondición:** Cuenta existente  
**Flujo:** Login → JWT → acceso a módulos clínicos.

### CU-03 Registrar paciente  
**Actor:** Veterinario  
**Precondición:** Sesión vet  
**Flujo:** Formulario de alta → API crea paciente con PAW → UI muestra código/barcode.

### CU-04 Consultar expediente  
**Actor:** Veterinario  
**Precondición:** Paciente propio  
**Flujo:** Lista pacientes → abrir perfil → ver datos, historial, dieta, barcode.

### CU-05 Editar ficha de paciente  
**Actor:** Veterinario  
**Precondición:** Paciente propio  
**Flujo:** Editar campos demográficos → guardar.

### CU-06 Eliminar paciente  
**Actor:** Veterinario  
**Precondición:** Paciente propio  
**Flujo:** Eliminar → desaparece de listados y relaciones asociadas según backend.

### CU-07 Registrar consulta médica  
**Actor:** Veterinario  
**Precondición:** Expediente abierto  
**Flujo:** Nueva consulta → completar campos ampliados → guardar → aparece en historial.

### CU-08 Editar / eliminar consulta  
**Actor:** Veterinario  
**Precondición:** Consulta existente  
**Flujo:** Actualizar o borrar vía API (UI de edición fina puede ser limitada; capacidad existe en API).

### CU-09 Generar dieta  
**Actor:** Veterinario  
**Precondición:** Paciente propio  
**Flujo:** Ingresar peso → generar → persistir Feeding → visualizar resultado.

### CU-10 Crear cita  
**Actor:** Veterinario  
**Precondición:** Sesión vet  
**Flujo:** Agenda → datos de cita (+ paciente opcional) → guardar.

### CU-11 Crear cita vinculada con recordatorio  
**Actor:** Veterinario  
**Precondición:** Paciente propio seleccionado  
**Flujo:** Crear cita con patientId → se crea reminder tipo cita.

### CU-12 Eliminar cita  
**Actor:** Veterinario  
**Precondición:** Cita propia  
**Flujo:** Eliminar desde agenda.

### CU-13 Configurar clínica  
**Actor:** Veterinario  
**Precondición:** Sesión vet  
**Flujo:** Configuración → actualizar datos/preferencias.

### CU-14 Registrar propietario  
**Actor:** Propietario  
**Precondición:** Ninguna  
**Flujo:** Registro en app (rol owner) → cuenta creada.

### CU-15 Login propietario  
**Actor:** Propietario  
**Precondición:** Cuenta  
**Flujo:** Credenciales → JWT → dashboard app.

### CU-16 Vincular mascota por código  
**Actor:** Propietario  
**Precondición:** Código PAW válido y libre  
**Flujo (contrato):** Ingresar código → link → mascota en “mías”.  
**Nota:** En Android producción este CU aún no está cerrado.

### CU-17 Ver historial como dueño  
**Actor:** Propietario  
**Precondición:** Mascota vinculada  
**Flujo:** Abrir mascota → leer consultas (sin poder crearlas).

### CU-18 Ver dieta como dueño  
**Actor:** Propietario  
**Precondición:** Mascota vinculada y Feeding existente  
**Flujo:** Consultar alimentación en solo lectura.

### CU-19 Desvincular mascota  
**Actor:** Propietario o veterinario autorizado  
**Precondición:** Vínculo existente  
**Flujo:** Unlink → ownerUserId queda vacío.

### CU-20 Intento no autorizado de crear consulta (dueño)  
**Actor:** Propietario  
**Precondición:** Sesión owner  
**Flujo:** Intento de POST consulta → rechazo 403.  
**Postcondición:** Historial intacto.

### CU-21 (Futuro) Compartir ubicación GPS  
No implementado.

### CU-22 (Futuro) Escanear QR/barcode con cámara  
No implementado (hoy ingreso manual).

### CU-23 (Futuro) Invitar familiar al grupo  
No implementado.

### CU-24 (Futuro) Aprobación admin de veterinarios  
No implementado.

---

## 18. Roadmap

### Versión 1 — Núcleo clínico (en gran parte logrado)

- Auth vet/owner  
- Pacientes + código PAW  
- Consultas ampliadas  
- Dieta por peso  
- Agenda + reminder de cita  
- Portal web en producción  
- API + DB en producción  

### Versión 1.1 — Cierre dueño (prioridad inmediata)

- Android contra API Railway (HTTPS)  
- `POST /patients/link` y `GET /patients/mine` desde la app  
- Lectura consistente de historial/dieta/recordatorios  
- Limpieza de flujos locales/mock  

### Versión 2 — Identificación y operación

- Escáner de cámara para código/barcode  
- Mejora de impresión/etiqueta  
- CRUD de recordatorios en web  
- Update de citas en UI  
- Reportes básicos de clínica  

### Versión 3 — Familia y comunicación

- Grupo familiar real  
- Notificaciones push/email de citas  
- (Opcional) mensajería acotada clínica–dueño  

### Versión 4 — Diferenciadores

- GPS con consentimiento y privacidad  
- Módulos de vacunas/alergias/archivos  
- IA de apoyo (no diagnóstica autónoma)  
- Wearables  

---

## 19. Pendientes (lista viva)

- [ ] Android apuntando a API de producción  
- [ ] Vínculo owner real desde Android (`link` / `mine`)  
- [ ] Alinear UI de recordatorios owner con reglas (hoy escritura es vet)  
- [ ] Escáner cámara  
- [ ] Push / email  
- [ ] GPS  
- [ ] QR (si se decide además del Code128)  
- [ ] Grupo familiar multi-usuario  
- [ ] Módulo vacunas / alergias / adjuntos  
- [ ] Reportes clínicos/administrativos  
- [ ] Rol administrador (solo si el negocio lo requiere)  
- [ ] Registro owner en portal web (si se desea)  
- [ ] Update de citas en UI web  
- [ ] Hardening de secretos y limpieza de debug de desarrollo  
- [ ] Documentación de usuario final y política de privacidad publicada  

---

## 20. Anexos

### 20.1 DER (descripción)

Entidades actuales y relaciones: ver sección 8.  
Un diagrama entidad-relación formal puede generarse a partir del esquema Prisma/PostgreSQL (User, Patient, MedicalRecord, Feeding, Reminder, Appointment, ClinicConfig).

### 20.2 Wireframes

- Portal: landing, login, dashboard, pacientes, perfil, agenda, configuración (implementados como pantallas HTML).  
- App: login, registro, dashboard con bottom navigation, detalle con tabs, alimentación, recordatorios, reporte médico.

### 20.3 Identidad visual (observada en producto)

- Portal clínico con sidebar, tipografía e iconografía Font Awesome.  
- App Material Design Android.  
- No se documenta aquí una brand book oficial completa (logo/paleta/fuentes corporativas versionadas) como entregable independiente; puede anexarse cuando el equipo de diseño la formalice.

### 20.4 Diagramas recomendados a adjuntar en presentación

1. Arquitectura de despliegue (Vercel / Railway / Supabase / Android).  
2. Diagrama de roles y permisos.  
3. Flujo de vínculo por código.  
4. Flujo consulta → historial → lectura dueño.  
5. DER.

### 20.5 Cronograma sugerido (alto nivel)

| Fase | Enfoque | Dependencia |
|------|---------|-------------|
| Ahora | Cerrar Android ↔ API prod | V1.1 |
| Corto plazo | Escáner + recordatorios web + reportes simples | V2 |
| Medio plazo | Familia + notificaciones | V3 |
| Largo plazo | GPS / IA / wearables | V4 |

### 20.6 Ambientes conocidos

| Ambiente | URL / nota |
|----------|------------|
| API producción | `https://api-production-66b1.up.railway.app/api` |
| Web | Proyecto Vercel tipo `pawmyli` / `pawmyli-one.vercel.app` |
| Base de datos | Supabase Postgres (proyecto `ghkrlpebwqqdynqmmsbv`) |
| Android | Desarrollo contra emulador local |

---

## Cierre

PawMily, en su estado actual, ya es una **plataforma clínica conectada** para el veterinario (web + API + base de datos en producción), con un **contrato claro de dueño** (vínculo por código y lectura). El mayor gap para hablar de sistema “al 100%” no está en la agenda o la dieta del vet, sino en **cerrar de verdad la experiencia del propietario en Android sobre la API de producción**, y después sumar las capacidades de producto aún no construidas (GPS, familia, push, vacunas, reportes, admin).

Este informe debe usarse como foto del sistema **tal como está**, no como promesa de features no desplegadas.
