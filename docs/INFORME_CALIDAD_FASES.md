# Informe de calidad por fases — PawMily

**Fecha:** 2026-08-10  
**Sesión debug:** `f5b708`  
**Alcance:** Backend/API/DB → Web → Android → datos (códigos, fotos, identidad vet)

---

## 1. Resumen ejecutivo

| Fase | Resultado | Evidencia |
|------|-----------|-----------|
| Backend / API / DB | **PASS** | Smoke producción: create→link `match=True` |
| Auth perfil vet | **PASS (API)** / **FAIL parcial (UI)** | Profile API correcto; HTML hardcodeaba “Dr. Daniel Ozuna” |
| Web códigos de barras | **FAIL → FIX** | TEC-IT timeout; migrado a JsBarcode local |
| Web escáner HID | **FAIL → FIX** | Listener ignoraba INPUT (p. ej. búsqueda) |
| Web fotos paciente | **FAIL → FIX** | `#foto` no se leía; siempre `DEFAULT_FOTO` |
| Android fotos API | **FAIL → FIX** | Solo URI local; ahora carga `photo` remota |
| Integridad link código | **PASS (API)** | Mismo id/nombre/código tras vincular |

---

## 2. Métricas de calidad

| Métrica | Valor | Notas |
|---------|-------|-------|
| Disponibilidad API (`/health`) | 100% (muestra) | `{"status":"ok"}` |
| Integridad create→link | 100% | id+code+name idénticos en smoke |
| Autenticidad sidebar (pre-fix) | Parcial | Nombre se pintaba en JS; placeholder HTML + foto no unificados |
| Dependencia barcode externo | Crítica (pre-fix) | `barcode.tec-it.com` → timeout en runtime |
| Cobertura roles | vet + owner | Sin admin (diseño) |
| Límite JSON fotos | 2 MB | `express.json({ limit: '2mb' })` |
| Riesgo reuso códigos PAW | Alto (pre-fix) | `count()+1`; corregido a `maxCodeSequence()+1` |

### Severidad de defectos hallados

| ID | Severidad | Estado |
|----|-----------|--------|
| H1 Sidebar / identidad vet falsa | Alta (UX/confianza) | Corregido en web |
| H2 HID en campos INPUT | Alta (flujo clínico) | Corregido en web |
| H3 Fotos no persistidas / no leídas | Alta | Corregido web + Android loader |
| H4 Barcode desaparece (CDN externo) | Alta | Corregido render local |
| H5 Datos distintos al vincular | Media | API OK; generación de códigos endurecida |

---

## 3. Evidencia runtime (pre-fix)

### 3.1 API smoke

```
health=ok
created code=PAW-000008 name=Rocky Unique …
linked match=True
mine_count=1 first_code=PAW-000008
```

### 3.2 Logs sesión `f5b708`

- **H1 CONFIRMADA (parcial):** `titleBefore: "Dr. Daniel Ozuna"` → `titleAfter: "José Alberto Lemus Mijango"`; en pacientes/perfil `photoUpdated: false` hasta que hubo foto en sesión.
- **H3 CONFIRMADA:** perfil `fotoIsDefault: true` para Horchata / PAW-000001.
- **H4 CONFIRMADA (probe):** TEC-IT `timeout` desde el entorno de prueba.
- **H2 sin eventos en esa corrida:** no hubo flush HID; el defecto de “return early en INPUT” quedó confirmado por código + reporte de usuario; fix verificado en post-fix.
- **H5 API REJECTED** como causa: link retorna el mismo paciente.

---

## 4. Correcciones aplicadas (instrumentación aún activa)

1. `PawApi.applySidebar` + `syncProfileToSession` en todas las páginas vet.
2. Placeholders HTML “Usuario” (sin “Dr. Daniel Ozuna”); `consultaVet` toma el nombre de sesión.
3. `barcode-hid.js`: captura en fase capture; bursts rápidos también dentro de INPUT.
4. `JsBarcode` + `barcode-local.js` para Code128 offline.
5. Alta de paciente lee `#foto` como data URL (máx. 1.5 MB cliente).
6. Backend: `maxCodeSequence()`; barcode API ya no depende de TEC-IT.
7. Android: `PetImageLoader` para `http(s)` y `data:` desde API.

---

## 5. Pendientes / riesgos residuales

- Redeploy Railway del backend para activar `maxCodeSequence` y cambio de `imageUrl`.
- Desplegar web (Vercel/PR) con scripts locales de barcode.
- Fotos como data URL en Postgres escalan mal a largo plazo → Storage (Supabase) recomendado.
- Escáner HID: validar con el hardware real (post-fix).
- App Android: rebuild/install para ver fotos remotas.

---

## 6. Criterios de aceptación post-fix

1. Sidebar muestra nombre real del vet (no “Daniel Ozuna”) y foto de perfil si existe.
2. Al crear paciente con foto, la tarjeta muestra esa foto (no solo icono default).
3. Modal/expediente muestra Code128 sin depender de TEC-IT (`Local JsBarcode render OK` en logs).
4. Lector USB con foco en búsqueda abre/vincula `PAW-######`.
5. Owner que vincula el código ve el mismo nombre/código que el vet.
