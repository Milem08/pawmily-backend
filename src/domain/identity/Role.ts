export type Role = 'vet' | 'owner';

export function isRole(value: string): value is Role {
  return value === 'vet' || value === 'owner';
}

export function assertRole(value: string): Role {
  if (!isRole(value)) {
    throw new Error(`Invalid role: ${value}`);
  }
  return value;
}
