/**
 * One-shot: create PatientAccess OWNER rows from legacy ownerUserId.
 * Run: npx tsx scripts/backfill-patient-access.ts
 */
import { prisma } from '../src/infrastructure/persistence/prisma/prismaClient';

async function main() {
  const patients = await prisma.patient.findMany({
    where: { ownerUserId: { not: null } },
    select: { id: true, ownerUserId: true },
  });
  let upserted = 0;
  for (const p of patients) {
    if (!p.ownerUserId) continue;
    await prisma.patientAccess.upsert({
      where: { userId_patientId: { userId: p.ownerUserId, patientId: p.id } },
      create: {
        userId: p.ownerUserId,
        patientId: p.id,
        role: 'OWNER',
        status: 'ACTIVE',
        grantedBy: null,
      },
      update: { role: 'OWNER', status: 'ACTIVE', revokedAt: null },
    });
    upserted += 1;
  }
  console.log(`Backfilled PatientAccess for ${upserted} patients`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
