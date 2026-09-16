-- PawMily — Scripts BD (DDL resumido + seeds de prueba)
-- Fuente de verdad: prisma/schema.prisma
-- Uso: referencia documental. En entornos reales preferir: npx prisma db push / migrate

-- Extensiones útiles (Supabase suele incluirlas)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Nota: Prisma genera tablas con nombres de modelo.
-- Ejemplos de semillas lógicas (NO ejecutar en producción con datos reales):

-- 1) Usuario veterinario de prueba (password debe ir hasheado bcrypt en API register)
-- INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
-- VALUES ('vet_demo', 'vet.demo@pawmily.local', '<BCRYPT>', 'Vet Demo', 'vet', NOW(), NOW());

-- 2) Usuario owner de prueba
-- INSERT INTO "User" (id, email, password, name, role, "createdAt", "updatedAt")
-- VALUES ('owner_demo', 'owner.demo@pawmily.local', '<BCRYPT>', 'Owner Demo', 'owner', NOW(), NOW());

-- 3) Paciente de prueba
-- INSERT INTO "Patient" (
--   id, code, "barcodePayload", name, species, breed, age, sex, microchip,
--   "ownerName", "vetId", "createdAt", "updatedAt"
-- ) VALUES (
--   'pat_demo', 'PAW-DEMO01', 'PAW-DEMO01', 'Siete', 'Canino', 'Pitbull', '3', 'M', 'No',
--   'Owner Demo', 'vet_demo', NOW(), NOW()
-- );

-- 4) Solicitud de vínculo
-- INSERT INTO "LinkRequest" (id, "requesterId", "patientId", "requestedRole", status, "createdAt", "updatedAt")
-- VALUES ('link_demo', 'owner_demo', 'pat_demo', 'OWNER', 'PENDING', NOW(), NOW());

-- Índices críticos (ya definidos en Prisma):
-- Patient: code, previousCode, vetId, ownerUserId, (vetId, name, ownerName)
-- LinkRequest: (patientId, status), requesterId, status
-- Reminder: (petId, priority) según migraciones aplicadas
-- User: email

-- Semilla recomendada vía API (seguro):
-- 1. POST /api/auth/register { role: vet }
-- 2. POST /api/auth/register { role: owner }
-- 3. POST /api/patients (vet)
-- 4. POST link-request (owner) + approve (vet)

SELECT 'PawMily DDL/Seeds documentation placeholder — use Prisma for real schema sync' AS info;
