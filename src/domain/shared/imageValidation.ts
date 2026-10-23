import { DomainError } from './DomainError';

/** Tamaño máximo del binario decodificado de una foto embebida: 1.5 MiB. */
export const MAX_PHOTO_BYTES = 1_572_864;

export const PHOTO_INVALID_MESSAGE = 'La foto debe ser una imagen JPG, PNG o WebP.';
export const PHOTO_TOO_LARGE_MESSAGE = 'La foto supera 1.5 MB; usa una imagen más pequeña.';
export const PHOTO_EXTERNAL_URL_MESSAGE =
  'No se puede usar una URL http(s) como foto. Envía una imagen JPG, PNG o WebP, o el avatar de la aplicación.';

export type ImageType = 'jpeg' | 'png' | 'webp';

export type PhotoValidationResult = { ok: true } | { ok: false; message: string };

const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,([\s\S]*)$/i;

/**
 * Identifica JPEG, PNG o WebP por magic bytes.
 * JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A. WebP: RIFF....WEBP.
 */
export function detectImageType(buffer: Buffer): ImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** URL http(s) firmada o de otro host. No es una foto que se pueda guardar. */
export function isExternalHttpPhoto(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) && isHttpUrl(trimmed);
}

/**
 * Crear paciente o usuario con una URL http(s) en photo/photoUrl responde 400.
 * No sustituye la validación de data URL, asset: ni avatar estático.
 */
export function rejectExternalPhotoOnCreate(photo: unknown, photoUrl?: unknown): void {
  if (isExternalHttpPhoto(photo) || isExternalHttpPhoto(photoUrl)) {
    throw new DomainError(PHOTO_EXTERNAL_URL_MESSAGE, 400, 'VALIDATION_ERROR');
  }
  if (typeof photoUrl === 'string' && /^https?:\/\//i.test(photoUrl.trim())) {
    throw new DomainError(PHOTO_EXTERNAL_URL_MESSAGE, 400, 'VALIDATION_ERROR');
  }
  if (typeof photo === 'string' && /^https?:\/\//i.test(photo.trim()) && !isExternalHttpPhoto(photo)) {
    throw new DomainError(PHOTO_EXTERNAL_URL_MESSAGE, 400, 'VALIDATION_ERROR');
  }
}

function isAssetRef(value: string): boolean {
  return /^asset:[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Ruta relativa al avatar estático de la web (`../assets/…`, `/assets/…` o `assets/…`).
 * Un solo segmento de archivo: sin `..` extra, sin esquema y sin barras adicionales.
 * No se descarga ni se convierte a data URL; se guarda tal cual.
 */
const STATIC_ASSET_PHOTO_RE = /^(\.\.\/|\/)?assets\/[A-Za-z0-9._-]+$/;

function isStaticAssetPath(value: string): boolean {
  return STATIC_ASSET_PHOTO_RE.test(value);
}

/** Base64 estándar con padding. Rechaza alfabeto inválido y relleno que no decodifica igual. */
function decodeBase64Strict(payload: string): Buffer | null {
  const compact = payload.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  if ((compact.match(/=/g) ?? []).length > 2) return null;
  const decoded = Buffer.from(compact, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== compact) return null;
  return decoded;
}

/**
 * Acepta vacío, `asset:<id>` o una ruta relativa a un asset estático.
 * Una URL http(s) (firmada o de otro host) no se acepta al validar una foto nueva.
 * Un data URL solo pasa si el tipo declarado es JPEG, PNG o WebP, el base64 decodifica,
 * los magic bytes coinciden con ese tipo y el binario no supera 1.5 MB.
 */
export function validatePhotoValue(value: unknown): PhotoValidationResult {
  if (value === undefined || value === null || value === '') {
    return { ok: true };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: PHOTO_INVALID_MESSAGE };
  }

  const trimmed = value.trim();
  if (trimmed === '') return { ok: true };
  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: PHOTO_EXTERNAL_URL_MESSAGE };
  }
  if (trimmed.startsWith('asset:')) {
    return isAssetRef(trimmed) ? { ok: true } : { ok: false, message: PHOTO_INVALID_MESSAGE };
  }
  if (isStaticAssetPath(trimmed)) {
    return { ok: true };
  }

  const match = DATA_IMAGE_RE.exec(trimmed);
  if (!match) return { ok: false, message: PHOTO_INVALID_MESSAGE };

  const declared = match[1].toLowerCase() as ImageType;
  const decoded = decodeBase64Strict(match[2]);
  if (!decoded || detectImageType(decoded) !== declared) {
    return { ok: false, message: PHOTO_INVALID_MESSAGE };
  }
  if (decoded.length > MAX_PHOTO_BYTES) {
    return { ok: false, message: PHOTO_TOO_LARGE_MESSAGE };
  }
  return { ok: true };
}

/**
 * En un update, no se reescribe la foto guardada si llega la misma referencia
 * o una URL http(s) (la web reenvía la URL firmada de Supabase u otro host).
 * `photoUrl` nunca se persiste. Solo un valor distinto y no http pasa por `validatePhotoValue`.
 */
export function photoPayloadForUpdate<T extends { photo?: unknown; photoUrl?: unknown }>(
  data: T,
  storedPhoto: string | null | undefined,
): T {
  const hasPhoto = Object.prototype.hasOwnProperty.call(data, 'photo');
  const hasPhotoUrl = Object.prototype.hasOwnProperty.call(data, 'photoUrl');
  if (!hasPhoto && !hasPhotoUrl) return data;

  const next = { ...data };
  if (hasPhotoUrl) delete next.photoUrl;
  if (!hasPhoto) return next;

  const incoming = next.photo;
  const sameAsStored = (incoming ?? null) === (storedPhoto ?? null);
  if (incoming === undefined || sameAsStored || isExternalHttpPhoto(incoming)) {
    delete next.photo;
    return next;
  }
  if (typeof incoming === 'string' && /^https?:\/\//i.test(incoming.trim())) {
    delete next.photo;
    return next;
  }

  const result = validatePhotoValue(incoming);
  if (!result.ok) {
    throw new DomainError(result.message, 400, 'VALIDATION_ERROR');
  }
  return next;
}
