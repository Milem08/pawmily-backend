import { DomainError } from '../../domain/shared/DomainError';
import { ClinicConfigRepository } from '../../domain/clinic/ClinicConfigRepository';
import { Role } from '../../domain/identity/Role';

export interface AuthActor {
  id: string;
  role: Role;
}

function assertVet(actor: AuthActor) {
  if (actor.role !== 'vet') {
    throw new DomainError('Solo veterinarios pueden gestionar la configuración', 403);
  }
}

export class GetClinicConfig {
  constructor(private readonly configs: ClinicConfigRepository) {}

  async execute(actor: AuthActor) {
    assertVet(actor);
    return this.configs.getOrCreate(actor.id);
  }
}

export class UpdateClinicConfig {
  constructor(private readonly configs: ClinicConfigRepository) {}

  async execute(actor: AuthActor, data: Record<string, unknown>) {
    assertVet(actor);
    return this.configs.update(actor.id, data as never);
  }
}
