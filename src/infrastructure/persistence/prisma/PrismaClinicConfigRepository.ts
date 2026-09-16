import { ClinicConfig } from '../../../domain/clinic/ClinicConfig';
import {
  ClinicConfigRepository,
  UpdateClinicConfigData,
} from '../../../domain/clinic/ClinicConfigRepository';
import { prisma } from './prismaClient';

function mapConfig(row: any): ClinicConfig {
  return new ClinicConfig(row);
}

export class PrismaClinicConfigRepository implements ClinicConfigRepository {
  async getOrCreate(vetId: string): Promise<ClinicConfig> {
    let row = await prisma.clinicConfig.findUnique({ where: { vetId } });
    if (!row) {
      row = await prisma.clinicConfig.create({ data: { vetId } });
    }
    return mapConfig(row);
  }

  async update(vetId: string, data: UpdateClinicConfigData): Promise<ClinicConfig> {
    const row = await prisma.clinicConfig.upsert({
      where: { vetId },
      update: data,
      create: { vetId, ...data },
    });
    return mapConfig(row);
  }
}
