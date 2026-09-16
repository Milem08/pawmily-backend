# PawMily — Expediente de Documentación Técnica

**Proyecto:** PawMily (plataforma veterinaria híbrida)  
**Entrega:** Módulo 3.4 — Documentación Técnica y Manuales de Usuario  
**Fecha de corte documental:** 25 de agosto de 2026  
**Fecha límite Classroom:** 31 de agosto de 2026 (23:59)  
**Defensa oral:** 2 de septiembre de 2026 (15 min)

---

## 1. Ficha técnica del equipo / proyecto

| Campo | Valor |
|-------|--------|
| Nombre del sistema | **PawMily** |
| Tipo | Plataforma clínica + dueños de mascotas |
| Backend | Express + TypeScript + Prisma + PostgreSQL (Supabase) |
| Portal web | HTML/CSS/JS estático (PAWMYLI) — rol veterinario |
| App móvil | Android (Kotlin) — rol propietario |
| API producción | `https://api-production-66b1.up.railway.app/api` |
| Auth | JWT propio (access + refresh); roles `vet` y `owner` |

### Ubicaciones locales del código

| Componente | Ruta |
|------------|------|
| Backend | `C:\Users\LENOVO\Documents\Default Project\pawmily-backend` |
| App Android | `C:\Users\LENOVO\AndroidStudioProjects\PawMily` |
| Sitio web | `C:\Users\LENOVO\Downloads\pawlyni\PAWMYLI` |

---

## 2. Resumen del sistema (estado actual)

PawMily conecta **clínicas veterinarias** (web) y **dueños** (Android) sobre una **API única** en Railway y una **base PostgreSQL** en Supabase.

```text
Portal Web (vet)  ──JWT──►  API Railway  ──►  Postgres Supabase
App Android (owner) ──JWT──►       ▲
                                   │
                        /api (REST)
```

**Madurez estimada:** núcleo clínico y flujos dueño/vínculo **operativos en producción**; faltan módulos avanzados (admin dedicado, GPS, vacunas como módulo, push cloud).

---

## 3. Índice del expediente (estructura exigida)

| Carpeta | Contenido |
|---------|-----------|
| [01_Gestion_y_Requerimientos](./01_Gestion_y_Requerimientos/) | SRS, matriz de trazabilidad, backlog e historias, [decisiones de producto](./01_Gestion_y_Requerimientos/Decisiones_Producto_Citas_Consultas_Dieta.md) |
| [02_Arquitectura_y_Diseno](./02_Arquitectura_y_Diseno/) | SAD, diagramas UML, modelo de datos |
| [03_Manuales_Tecnicos_y_DevOps](./03_Manuales_Tecnicos_y_DevOps/) | Config local, OpenAPI, despliegue |
| [04_Manuales_de_Usuario_y_Soporte](./04_Manuales_de_Usuario_y_Soporte/) | Manual usuario final y administrador/soporte |

Cada carpeta incluye fuentes en **Markdown** (editables) y, cuando aplica, **PDF / CSV / YAML / SQL / SVG** listos para entrega en Classroom.

---

## 4. Protocolo de defensa (guía rápida 15 min)

| Minutos | Bloque | Usar carpeta |
|---------|--------|--------------|
| 0–4 | Arquitectura, despliegue, DER | 02 |
| 4–9 | Config local, APIs, diccionario | 03 (+ modelo datos) |
| 9–15 | Demo guiada por manual de usuario + preguntas | 04 |

---

## 5. Nota sobre formatos

La guía solicita `.pdf` / `.png` / `.xlsx`. Este expediente incluye:

- Documentos narrativos en `.md` **y** `.pdf` generados.
- Matriz en `.csv` (compatible con Excel → guardar como `.xlsx` si se requiere).
- Diagramas en `.svg` / `.mmd` (exportables a PNG).
- API en OpenAPI `.yaml`.
- Scripts DDL derivados del esquema Prisma.
