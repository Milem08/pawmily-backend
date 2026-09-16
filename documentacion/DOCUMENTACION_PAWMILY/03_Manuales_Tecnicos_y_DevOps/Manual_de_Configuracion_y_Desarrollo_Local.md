# Manual de Configuración y Desarrollo Local — PawMily

## 1. Prerrequisitos
| Herramienta | Versión sugerida |
|-------------|------------------|
| Node.js | ≥ 20 |
| npm | incluido |
| Android Studio | Ladybug+ / JDK 17 |
| Git | opcional |
| PostgreSQL / Supabase | proyecto cloud o local |
| Navegador | Chrome/Edge |

Rutas locales típicas:
- Backend: `...\pawmily-backend`
- Web: `...\PAWMYLI`
- Android: `...\AndroidStudioProjects\PawMily`

---

## 2. Backend API

### 2.1 Instalar
```bash
cd "C:\Users\LENOVO\Documents\Default Project\pawmily-backend"
npm install
npx prisma generate
```

### 2.2 Variables de entorno
Copiar `.env.example` → `.env` y completar:

| Variable | Uso |
|----------|-----|
| DATABASE_URL | Postgres (pooler Supabase recomendado) |
| JWT_SECRET | ≥ 16 caracteres |
| JWT_ACCESS_EXPIRATION | p.ej. 30m |
| JWT_REFRESH_DAYS | p.ej. 30 |
| PORT | 3000 |
| CORS_ORIGINS | orígenes web locales + Vercel |
| SUPABASE_URL / SERVICE_ROLE_KEY | media storage |
| NODE_ENV | development |

### 2.3 Base de datos
```bash
npx prisma db push
# o migraciones si aplica
```

### 2.4 Ejecutar
```bash
npm run dev
# Health: GET http://127.0.0.1:3000/api/health
```

### 2.5 Tests
```bash
npm test
```

---

## 3. Portal web (PAWMYLI)

### 3.1 Configuración API
`js/config.js` / `js/env.js`:
- Producción por defecto: `https://api-production-66b1.up.railway.app/api`
- Override local: `localStorage.pawmyliApiBase = "http://127.0.0.1:3000/api"`

### 3.2 Servir estáticos
Abrir con Live Server (puerto 5500/8080) o:
```bash
npx serve .
```
Asegurar que el origen esté en `CORS_ORIGINS` del backend.

### 3.3 Flujos a probar
Login vet → pacientes → crear mascota → agenda → configuración.

---

## 4. App Android

### 4.1 Abrir proyecto
Android Studio → `C:\Users\LENOVO\AndroidStudioProjects\PawMily`

### 4.2 API
`RetrofitClient.BASE_URL` =  
`https://api-production-66b1.up.railway.app/api/`  
(para local emulador: `http://10.0.2.2:3000/api/`)

### 4.3 Permisos
Cámara, notificaciones (API 33+), internet — declarados en `AndroidManifest.xml`.

### 4.4 Run
Sync Gradle → Run en dispositivo/emulador.  
Probar: login owner → vincular código → perfil mascota (Resumen/Historial/Alimentación).

---

## 5. Solución de problemas locales
| Problema | Acción |
|----------|--------|
| CORS blocked | Añadir origen a `CORS_ORIGINS` y reiniciar API |
| Prisma P1001 | Revisar `DATABASE_URL` / VPN / pooler |
| Android cleartext | Usar HTTPS o `network_security_config` para IP local |
| 401 continuo | Logout y login; verificar refresh |
| Perfil mascota crashea | Asegurar ImmersiveMode **después** de `setContentView` |

---

## 6. Estructura útil del backend
```
src/
  domain/
  application/
  infrastructure/
  interfaces/http/
prisma/schema.prisma
```
