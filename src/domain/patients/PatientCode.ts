import { randomBytes } from 'crypto';

/** Alphabet without ambiguous I/O/0/1 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateSecurePatientCode(length = 7): string {
  const bytes = randomBytes(length);
  let body = '';
  for (let i = 0; i < length; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `PAW-${body}`;
}

export function isSecurePatientCode(code: string): boolean {
  return /^PAW-[A-Z2-9]{7}$/.test(code.toUpperCase());
}

/** Legacy sequential codes during migration window. */
export function isLegacyPatientCode(code: string): boolean {
  return /^PAW-\d{6}$/.test(code.toUpperCase());
}

export function normalizePatientCode(code: string): string {
  return code.trim().toUpperCase();
}
