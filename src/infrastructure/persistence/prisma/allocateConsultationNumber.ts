import { prisma } from './prismaClient';
import { formatConsultationNumber } from '../../../domain/patients/ConsultationTypes';

export async function allocateConsultationNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT nextval('consultation_number_seq') AS n
  `;
  const n = Number(rows[0]?.n ?? 0);
  return formatConsultationNumber(n);
}
