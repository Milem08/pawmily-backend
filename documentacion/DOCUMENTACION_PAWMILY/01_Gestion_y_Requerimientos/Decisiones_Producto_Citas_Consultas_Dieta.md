# Decisiones de producto — Citas, consultas, medicamentos y dieta

**Fecha:** 4 de septiembre de 2026  
**Estado:** Aprobadas por el equipo  
**Alcance:** Modelo clínico coherente (proyecto escolar). Familia/cuidadores: **fuera de alcance**.

---

## 1. Decisiones cortas (bloqueadas)

| # | Tema | Decisión |
|---|------|----------|
| 1 | **Aplazar cita** | Queda como **propuesta** hasta que el **veterinario acepte**. No se reagenda al instante. |
| 2 | **Medicamentos** | **Un recordatorio por cada dosis** (igual que cada comida del día). |
| 3 | **Comidas a medianoche** | Si no se marcaron, pasan a estado **`UNLOGGED`**. Correcto. |
| 4 | **Solicitar cita** | **Must-have** en la demo (dueño puede solicitar). |
| 5 | **Tipos de consulta** | Los **6** acordados (ver §3). |

---

## 2. Citas — reglas

### Estados
| Estado | Quién | Significado |
|--------|-------|-------------|
| `Solicitada` | Dueño | Pide cita o propone aplazamiento; espera al vet |
| `Programada` | Vet | Fecha/hora en agenda |
| `Confirmada` | Dueño | Acepta asistencia |
| `Reagendada` | Tras OK del vet a una propuesta | Nueva fecha vigente |
| `Completada` | Vet / post-consulta | Ya ocurrió |
| `Cancelada` | Vet o dueño (regla simple) | No aplica |
| `No asistió` | Vet | Faltó |

### Acciones dueño (app)
- Ver citas próximas / pasadas.
- **Confirmar** asistencia (`Programada` → `Confirmada`).
- **Aplazar:** elige entre **fechas sugeridas** → crea/actualiza a `Solicitada` (propuesta). El vet acepta en web → nueva `Programada` / `Reagendada`.
- **Solicitar cita:** motivo + preferencia (must-have).

### Origen de citas
1. Vet crea en agenda.
2. Consulta con **seguimiento** → cita automática + recordatorio tipo `cita`.
3. Dueño **solicita** → vet acepta y asigna slot.

---

## 3. Consultas — tipos (6)

1. General  
2. Preventiva / chequeo  
3. Vacunación  
4. Desparasitación  
5. Enfermedad  
6. Seguimiento  

### Identidad visible (vet y dueño)
- Número de consulta  
- Tipo  
- Veterinario  
- Fecha y hora  
- Estado  

### Dueño ve
Motivo, diagnóstico, tratamiento, medicación, indicaciones, seguimiento.  
**No** ve notas privadas.

### Auto-relleno
Datos de dueño capturados al crear la mascota (`ownerName` / teléfono / email) rellenan consulta y cita; vet logueado rellena `vetName`.

---

## 4. Medicamentos → recordatorios

Al guardar consulta con medicación estructurada (fármaco, dosis, frecuencia, duración):

- Generar **un recordatorio por cada dosis** del ciclo (ej. cada 12 h × 7 días → 14 recordatorios).
- Categoría / tipo: medicamento.
- Dueño puede marcar cada dosis **completada** o ver **atrasada** si pasó la hora sin completar.

Misma filosofía que comidas: **una instancia = un evento a cumplir**.

---

## 5. Alimentación

- Vet define plan + comidas (`FeedingMeal`).
- Dueño marca del día: hecha / no hecha.
- Estados de log: `PENDING` → `EATEN` o, si llega medianoche sin marcar → **`UNLOGGED`**.
- UI puede mostrar **atrasada** si `PENDING` y ya pasó la hora programada (cálculo en cliente o API).
- Cierre a medianoche: **job en backend** (no solo en el teléfono).

---

## 6. Fuera de alcance (confirmado)

- Módulo familia / cuidadores / co-owners en producto.
- Agenda libre del dueño sin aceptación del vet.
- Un solo “tratamiento activo” en lugar de dosis individuales.

---

## 7. Orden de implementación sugerido

1. Limpiar familia de UI/docs + separar Citas vs Historial en app. ✅  
2. Citas dueño: listar, confirmar, **solicitar**; seguimiento de consulta → aparece. ✅  
3. Aplazar con fechas sugeridas + aceptación vet en web. ✅  
4. Consulta dueño: nº, tipo, vet, fecha/hora + campos públicos. ✅  
5. Rx estructurada → recordatorios **por dosis**. ✅  
6. Comidas: marcar + atraso + job `UNLOGGED` a medianoche. ✅  
7. Auto-relleno dueño/vet en formularios. ✅  
8. Actualizar SRS / backlog / manuales con estas reglas (pendiente documental).

**Nota deploy:** redesplegar API en Railway para exponer `request` / `postpone` / `accept` y el job de medianoche.

