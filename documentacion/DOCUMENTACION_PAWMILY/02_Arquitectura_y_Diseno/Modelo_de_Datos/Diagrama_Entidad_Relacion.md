# Diagrama Entidad-Relación — PawMily

Ver también `Diagrama_Entidad_Relacion.svg`.

```mermaid
erDiagram
  User ||--o{ Patient : "vetId"
  User ||--o{ Patient : "ownerUserId"
  User ||--o| ClinicConfig : has
  User ||--o{ Appointment : schedules
  User ||--o{ LinkRequest : requests
  User ||--o{ PatientAccess : granted
  Patient ||--o{ MedicalRecord : has
  Patient ||--o| Feeding : has
  Patient ||--o{ Reminder : has
  Patient ||--o{ Appointment : has
  Patient ||--o{ LinkRequest : targeted
  Patient ||--o{ PatientAccess : shared
  Feeding ||--o{ FeedingMeal : contains
  Feeding ||--o{ FeedingLog : logs
  User ||--o{ RefreshToken : sessions
  User ||--o{ MediaAsset : owns
  User ||--o{ UserFavorite : favorites
  User ||--o{ AuditLog : audits

  User {
    string id PK
    string email UK
    string role
  }
  Patient {
    string id PK
    string code UK
    string barcodePayload
    string vetId FK
    string ownerUserId FK
  }
  LinkRequest {
    string id PK
    string status
    string requestedRole
  }
  MedicalRecord {
    string id PK
    string patientId FK
  }
  Feeding {
    string id PK
    string patientId FK
  }
  Reminder {
    string id PK
    string patientId FK
    string priority
  }
  Appointment {
    string id PK
    string vetId FK
    string patientId FK
  }
```

## Notas de diseño
- `code` es el identificador de negocio visible.  
- `ownerUserId` refleja vínculo owner aprobado.  
- `PatientAccess` permite roles adicionales sin duplicar pacientes.  
- Refresh tokens se almacenan hasheados.
