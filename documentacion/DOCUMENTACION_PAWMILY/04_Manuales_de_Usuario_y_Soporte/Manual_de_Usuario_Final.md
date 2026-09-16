# Manual de Usuario Final — PawMily

**Audiencias:** Propietario (app Android) y Veterinario (portal web).  
**Versión:** 1.0 · Agosto 2026

> **Nota para entrega:** incluir capturas anotadas de la GUI al exportar a PDF (pantallas reales del dispositivo/navegador).

---

## A. App Android (Propietario)

### A.1 Instalación e inicio
1. Instalar la app PawMily.  
2. Registrarse como **owner** o iniciar sesión.  
3. Acceder al tablero con pestañas: Inicio, Mascotas, Recordatorios, Perfil.

### A.2 Vincular una mascota
1. En **Inicio** o **Mascotas**, tocar agregar / código.  
2. **Opción 1:** escribir el código `PAW-…` y confirmar.  
3. **Opción 2:** **Escanear con cámara** (permitir cámara).  
4. Esperar mensaje de solicitud enviada.  
5. Cuando el veterinario apruebe, la mascota aparece en la lista.

**Errores comunes**
| Mensaje | Qué hacer |
|---------|-----------|
| Código no encontrado | Verificar código sin espacios; mayúsculas automáticas |
| Permiso de cámara denegado | Activar en Ajustes del sistema |
| No se pudo cargar mascotas | Revisar internet; volver a entrar |

### A.3 Ver perfil de mascota
1. En **Mascotas**, tocar la tarjeta.  
2. Pestañas: **Resumen**, **Historial**, **Alimentación**.  
3. Resumen: datos generales, código, recordatorios prioritarios.  
4. Historial: consultas médicas.  
5. Alimentación: dieta indicada por la clínica.

### A.4 Recordatorios y notificaciones
1. En **Recordatorios**, abrir una mascota.  
2. Crear recordatorio (fecha/hora/prioridad).  
3. En **Perfil**, activar/desactivar notificaciones.  
4. Si el sistema pide permiso, aceptar para recibir alertas.

### A.5 Perfil de usuario
Ver nombre, email y teléfono. Cerrar sesión limpia la sesión local.

---

## B. Portal Web (Veterinario)

### B.1 Acceso
1. Abrir el sitio PawMily (Vercel).  
2. Login con cuenta **vet**.  
3. Dashboard con accesos a pacientes, agenda y configuración.

### B.2 Pacientes
1. Crear paciente (nombre, especie, raza, dueño…).  
2. El sistema asigna código `PAW-…` y barcode.  
3. Mostrar/imprimir código para el dueño.  
4. Usar lector HID USB si está disponible (escribe el código y Enter).

### B.3 Expediente
Desde el paciente: historial/consultas, dieta, datos de contacto.

### B.4 Agenda
Ver citas del mes, crear/editar según permisos de UI, revisar confirmaciones del dueño.

### B.5 Solicitudes de vínculo
Revisar pendientes y aprobar/rechazar dueños que solicitaron acceso.

### B.6 Configuración
Actualizar datos de clínica visibles en el perfil clínico.

---

## C. FAQ cruzado
1. **¿El dueño usa la web?** Flujo principal owner = Android.  
2. **¿Se pierde la sesión?** Re-login; la app intenta refresh automático.  
3. **¿Sin foto?** Se muestra placeholder; no es error.  
4. **¿API caída?** Probar más tarde; clínica contacta soporte técnico.
