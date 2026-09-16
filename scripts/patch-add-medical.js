const fs = require('fs');
const p = 'src/infrastructure/persistence/prisma/PrismaPatientRepository.ts';
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
if (s.includes('consultationNumber')) {
  console.log('ALREADY');
  process.exit(0);
}
const start = s.indexOf('  async addMedicalRecord(petId: string, data: CreateMedicalRecordData) {');
const end = s.indexOf('  async updateMedicalRecord(recordId: string, data: UpdateMedicalRecordData) {');
if (start < 0 || end < 0) {
  console.log('BOUNDS_FAIL', start, end);
  process.exit(1);
}
const neu = `  async addMedicalRecord(petId: string, data: CreateMedicalRecordData) {
    const { allocateConsultationNumber } = await import('./allocateConsultationNumber');
    const consultationNumber = await allocateConsultationNumber();
    return prisma.medicalRecord.create({
      data: {
        petId,
        consultationNumber,
        type: data.type ?? 'GENERAL',
        date: data.date,
        time: data.time ?? null,
        reason: data.reason,
        diagnosis: data.diagnosis ?? null,
        treatment: data.treatment ?? null,
        vetName: data.vetName,
        ownerName: data.ownerName ?? null,
        responsibleName: data.responsibleName ?? null,
        status: data.status ?? 'En Proceso',
        weightAtVisit: data.weightAtVisit ?? null,
        temperature: data.temperature ?? null,
        heartRate: data.heartRate ?? null,
        respiratoryRate: data.respiratoryRate ?? null,
        physicalExam: data.physicalExam ?? null,
        prescriptions: data.prescriptions ?? null,
        medication: data.medication ?? null,
        results: data.results ?? null,
        observations: data.observations ?? null,
        notes: data.notes ?? null,
        privateNotes: data.privateNotes ?? null,
        typePayload: (data.typePayload as object | undefined) ?? undefined,
        followUpDate: data.followUpDate ?? null,
        followUpTime: data.followUpTime ?? null,
        relatedConsultationId: data.relatedConsultationId ?? null,
        followUpAppointmentId: data.followUpAppointmentId ?? null,
      },
    });
  }

`;
s = s.slice(0, start) + neu + s.slice(end);
fs.writeFileSync(p, s);
console.log('OK');
