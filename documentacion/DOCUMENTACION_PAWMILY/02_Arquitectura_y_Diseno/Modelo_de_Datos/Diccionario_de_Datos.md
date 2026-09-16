# Diccionario de Datos — PawMily

Fuente: `prisma/schema.prisma` (agosto 2026). Tipos lógicos; en BD PostgreSQL vía Prisma.

## User
| Campo | Tipo | Nulo | Descripción |
|-------|------|------|-------------|
| id | String (cuid) | No | PK |
| email | String | No | Único |
| password | String | No | Hash bcrypt |
| name | String | No | Nombre visible |
| role | String | No | `vet` \| `owner` (default vet) |
| phone, clinic, address, license, photo | String | Sí | Perfil |
| photoAssetId | String | Sí | Media asset |
| emailVerifiedAt | DateTime | Sí | Verificación |
| createdAt, updatedAt | DateTime | No | Auditoría |

## Patient
| Campo | Tipo | Nulo | Descripción |
|-------|------|------|-------------|
| id | String | No | PK interna |
| code | String | No | Único `PAW-…` |
| previousCode | String | Sí | Migración de códigos |
| barcodePayload | String | No | Payload Code128 |
| name, species, breed, age, sex | String | No | Ficha |
| weight, color, ownerPhone, ownerEmail, photo | String | Sí | Opcionales |
| microchip | String | No | Default "No" |
| ownerName | String | No | Nombre dueño en ficha |
| photoAssetId | String | Sí | Foto en storage |
| vetId | String | No | FK User vet |
| ownerUserId | String | Sí | FK User owner vinculado |
| createdAt, updatedAt | DateTime | No | |

## PatientAccess
| Campo | Descripción |
|-------|-------------|
| userId, patientId | Relación acceso |
| role | Rol de acceso |
| status | ACTIVE / etc. |
| grantedBy, revokedAt | Gobernanza |

## LinkRequest
| Campo | Descripción |
|-------|-------------|
| requesterId | Quien solicita |
| patientId | Paciente |
| requestedRole | p.ej. OWNER |
| status | PENDING / APPROVED / REJECTED |
| decidedBy, decidedAt | Decisión |

## MedicalRecord
Registro clínico (consulta): id, patientId, fecha, motivo, diagnóstico, tratamiento, vetName, status y campos ampliados de vitals/notas según esquema.

## Feeding / FeedingLog / FeedingMeal
Dieta del paciente, comidas y logs de cumplimiento.

## Reminder
Recordatorios: título, fecha, hora, tipo, prioridad, completed, notificationMessage, petId, appointmentId opcional.

## Appointment
Citas: petName, ownerName, date, time, notes, status, vetId, patientId, attendanceStatus, ownerConfirmedAt.

## ClinicConfig
Preferencias de clínica por vetId (1:1).

## RefreshToken / PasswordResetToken / EmailVerificationToken
Tokens de seguridad (hash, expiración, uso/revocación).

## MediaAsset / UserFavorite / AuditLog
Media, favoritos de usuario y auditoría.

---

## Relaciones principales
- User 1—N Patient (como vet)  
- User 0—N Patient (como owner)  
- Patient 1—N MedicalRecord, Reminder, Appointment, LinkRequest, PatientAccess  
- Patient 1—0..1 Feeding  
- User 1—0..1 ClinicConfig  
