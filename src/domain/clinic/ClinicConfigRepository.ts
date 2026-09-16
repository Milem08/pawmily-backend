import { ClinicConfig, ClinicConfigProps } from './ClinicConfig';

export type UpdateClinicConfigData = Partial<
  Omit<ClinicConfigProps, 'id' | 'vetId'>
>;

export interface ClinicConfigRepository {
  getOrCreate(vetId: string): Promise<ClinicConfig>;
  update(vetId: string, data: UpdateClinicConfigData): Promise<ClinicConfig>;
}
