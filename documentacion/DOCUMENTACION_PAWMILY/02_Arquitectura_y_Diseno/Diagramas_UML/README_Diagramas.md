# Diagramas UML — PawMily

Los diagramas fuente están en Mermaid (abajo) y como SVG en esta carpeta.

## 1. Componentes (`Componentes.svg`)

```mermaid
flowchart LR
  subgraph Clients
    WEB[Portal Web Vet]
    AND[App Android Owner]
  end
  subgraph API[API Express Clean/DDD]
    HTTP[HTTP Routes]
    UC[Application Use Cases]
    DOM[Domain]
    PRISMA[Prisma Adapters]
  end
  DB[(PostgreSQL Supabase)]
  STOR[Storage Media]
  WEB --> HTTP
  AND --> HTTP
  HTTP --> UC --> DOM
  UC --> PRISMA --> DB
  UC --> STOR
```

## 2. Despliegue (`Despliegue.svg`)

```mermaid
flowchart TB
  U1[Veterinario] --> Vercel[Vercel - PAWMYLI]
  U2[Propietario] --> Phone[Dispositivo Android]
  Vercel -->|HTTPS JWT| Railway[Railway - API Node]
  Phone -->|HTTPS JWT| Railway
  Railway --> Supa[(Supabase Postgres)]
  Railway --> Media[Supabase Storage]
```

## 3. Casos de uso (`Casos_de_Uso.svg`)

```mermaid
flowchart LR
  Vet((Veterinario))
  Owner((Propietario))
  Vet --> C1[Gestionar pacientes]
  Vet --> C2[Registrar consulta]
  Vet --> C3[Definir dieta]
  Vet --> C4[Gestionar agenda]
  Vet --> C5[Aprobar vínculos]
  Vet --> C6[Configurar clínica]
  Owner --> C7[Vincular mascota]
  Owner --> C8[Ver expediente]
  Owner --> C9[Gestionar recordatorios]
  Owner --> C10[Confirmar cita]
  Owner --> C11[Notificaciones locales]
```

## 4. Secuencias críticas

### 4.1 Login + refresh (`Secuencia_Procesos_Criticos.svg` — flujo A)

```mermaid
sequenceDiagram
  participant C as Cliente
  participant API as API
  participant DB as Postgres
  C->>API: POST /auth/login
  API->>DB: validar user+bcrypt
  API-->>C: access + refresh
  C->>API: GET recurso (Bearer)
  API-->>C: 401
  C->>API: POST /auth/refresh
  API->>DB: validar refresh hash
  API-->>C: nuevo access
  C->>API: reintento recurso
  API-->>C: 200
```

### 4.2 Vinculación por código (flujo B)

```mermaid
sequenceDiagram
  participant A as Android Owner
  participant API as API
  participant W as Web Vet
  A->>API: POST link-request {code}
  API-->>A: PENDING
  W->>API: GET link-requests/pending
  W->>API: POST approve
  A->>API: GET /patients/mine
  API-->>A: mascota vinculada
```
