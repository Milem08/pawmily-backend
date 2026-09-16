# Backlog e Historias de Usuario — PawMily

**Formato:** Como [rol], quiero [acción], para [beneficio].  
**Cada historia incluye criterios de aceptación (CA).**

---

## Épico A — Identidad

### HU-A01 Registro
**Como** futuro usuario (vet u owner), **quiero** registrarme con email y contraseña, **para** acceder al sistema.  
**CA:**
- [ ] Campos validados (email, password mínima).  
- [ ] Rol asignado correctamente.  
- [ ] Error claro si el email ya existe.

### HU-A02 Login
**Como** usuario registrado, **quiero** iniciar sesión, **para** obtener tokens y usar la API.  
**CA:**
- [ ] Devuelve access + refresh.  
- [ ] Credenciales inválidas → mensaje no técnico.  
- [ ] Rate limit ante abuso.

### HU-A03 Sesión persistente
**Como** usuario de la app, **quiero** que mi sesión se renueve, **para** no re-login constante.  
**CA:**
- [ ] 401 recuperable dispara refresh.  
- [ ] Refresh inválido cierra sesión de forma limpia.

---

## Épico B — Pacientes (Veterinario — Web)

### HU-B01 Crear paciente
**Como** veterinario, **quiero** crear una ficha de mascota, **para** llevar su expediente clínico.  
**CA:**
- [ ] Se genera código `PAW-…` único.  
- [ ] Aparece en listado de pacientes.  
- [ ] Idempotencia opcional evita dobles altas.

### HU-B02 Buscar / editar paciente
**Como** veterinario, **quiero** buscar y editar pacientes, **para** mantener datos actualizados.  
**CA:**
- [ ] Solo ve pacientes de su clínica/vetId.  
- [ ] Edición persiste en BD.

### HU-B03 Código de barras
**Como** veterinario, **quiero** ver/imprimir el código de la mascota, **para** vincular dueños.  
**CA:**
- [ ] Payload Code128 coherente con el código.  
- [ ] Lectura HID funciona en dashboard/pacientes.

---

## Épico C — Vinculación (Owner — Android)

### HU-C01 Vincular por código escrito
**Como** propietario, **quiero** ingresar el código de mi mascota, **para** solicitar vínculo.  
**CA:**
- [ ] Código trim + mayúsculas.  
- [ ] Mensaje si no existe / ya vinculado.  
- [ ] Solicitud PENDING visible.

### HU-C02 Escanear con cámara
**Como** propietario, **quiero** escanear el código, **para** no escribirlo.  
**CA:**
- [ ] Solicita permiso de cámara.  
- [ ] Si se deniega, mensaje claro y no crashea.  
- [ ] Tras escanear, llama al mismo flujo de link.

### HU-C03 Aprobar vínculo
**Como** veterinario (o dueño según rol pedido), **quiero** aprobar/rechazar solicitudes, **para** controlar accesos.  
**CA:**
- [ ] Approve/reject vía API.  
- [ ] Tras approve, owner ve la mascota en `/mine`.

---

## Épico D — Expediente

### HU-D01 Resumen de mascota
**Como** propietario, **quiero** ver el resumen (especie, raza, peso, código…), **para** consultar datos básicos.  
**CA:**
- [ ] Datos desde API remota (no mock).  
- [ ] Foto o placeholder.

### HU-D02 Historial
**Como** propietario/vet, **quiero** ver el historial clínico, **para** conocer tratamientos previos.  
**CA:**
- [ ] Lista registros médicos del paciente.  
- [ ] Navegación no sale al listado por error.

### HU-D03 Alimentación
**Como** propietario, **quiero** ver la dieta, **para** seguir indicaciones del vet.  
**CA:**
- [ ] Carga feeding del paciente seleccionado.  
- [ ] Vacío muestra mensaje amigable.

---

## Épico E — Recordatorios y citas

### HU-E01 Recordatorios personales
**Como** propietario, **quiero** crear recordatorios, **para** no olvidar cuidados.  
**CA:**
- [ ] CRUD vía API.  
- [ ] Notificación local si están activadas.

### HU-E02 Confirmar cita
**Como** propietario, **quiero** confirmar asistencia, **para** avisar a la clínica.  
**CA:**
- [ ] Endpoint confirm actualiza estado.  
- [ ] Visible en agenda del vet.

### HU-E03 Agenda vet
**Como** veterinario, **quiero** ver citas del mes, **para** organizar la clínica.  
**CA:**
- [ ] Filtro mensual.  
- [ ] CRUD disponible en API; UI cubre flujo principal.

---

## Épico F — Perfil y notificaciones (Android)

### HU-F01 Perfil legible
**Como** owner, **quiero** ver nombre, email y teléfono, **para** verificar mi cuenta.  
**CA:**
- [ ] Contraste suficiente día/noche.  
- [ ] Datos desde `/auth/profile` o caché de sesión.

### HU-F02 Interruptor de notificaciones
**Como** owner, **quiero** activar/desactivar notificaciones, **para** controlar alertas.  
**CA:**
- [ ] Estado persistente.  
- [ ] Pide `POST_NOTIFICATIONS` en Android 13+.  
- [ ] Rechazo de permiso no crashea.

---

## Backlog priorizado (MoSCoW)

| Prioridad | Ítems |
|-----------|--------|
| Must | Auth, pacientes, link, historial, feeding, recordatorios básicos, agenda |
| Should | Favoritos, barcode HID, refresh token, notificaciones locales |
| Could | Media upload UX completa, reportes, vacunas módulo |
| Won't (ahora) | Admin multi-tenant SaaS, GPS tracking, push FCM cloud |

---

## Dependencias entre historias
`HU-A02` → resto  
`HU-B01` → `HU-C01` / `HU-C02` → `HU-D*`  
`HU-E01` depende de paciente vinculado.
