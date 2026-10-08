import { prisma } from './prismaClient';
import { formatConsultationNumber } from '../../../domain/patients/ConsultationTypes';

const SEQUENCE_NAME = 'consultation_number_seq';

function isMissingSequence(err: unknown): boolean {
  const meta = (err as { meta?: { code?: string; message?: string } } | null)?.meta;
  const message = `${meta?.message ?? ''} ${(err as { message?: string } | null)?.message ?? ''}`;
  return meta?.code === '42P01' || message.includes(SEQUENCE_NAME);
}

async function sequenceExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ seq: string | null }>>`
    SELECT to_regclass(${SEQUENCE_NAME})::text AS seq
  `;
  return Boolean(rows[0]?.seq);
}

async function highestConsultationNumber(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT COALESCE(MAX(
      CASE
        WHEN "consultationNumber" ~ '^CONS-[0-9]+$'
        THEN CAST(SUBSTRING("consultationNumber" FROM 6) AS INTEGER)
        ELSE NULL
      END
    ), 0)::int AS max
    FROM "MedicalRecord"
  `;
  return Number(rows[0]?.max ?? 0);
}

/** db push does not create this sequence; Railway does not run SQL migrations. */
export async function ensureConsultationNumberSequence(): Promise<void> {
  if (await sequenceExists()) return;
  const highest = await highestConsultationNumber();
  const start = Math.max(1, (Number.isFinite(highest) ? highest : 0) + 1);
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS ${SEQUENCE_NAME} START WITH ${start}`,
  );
}

async function nextConsultationNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT nextval('consultation_number_seq') AS n
  `;
  const n = Number(rows[0]?.n ?? 0);
  return formatConsultationNumber(n);
}

export async function allocateConsultationNumber(): Promise<string> {
  await ensureConsultationNumberSequence();
  try {
    return await nextConsultationNumber();
  } catch (err) {
    if (!isMissingSequence(err)) throw err;
    await ensureConsultationNumberSequence();
    return nextConsultationNumber();
  }
}
