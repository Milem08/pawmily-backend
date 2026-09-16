import { isRole, assertRole } from '../../../src/domain/identity/Role';

describe('Role', () => {
  it('accepts vet and owner', () => {
    expect(isRole('vet')).toBe(true);
    expect(isRole('owner')).toBe(true);
    expect(isRole('admin')).toBe(false);
  });

  it('assertRole throws on invalid', () => {
    expect(assertRole('vet')).toBe('vet');
    expect(() => assertRole('x')).toThrow();
  });
});
