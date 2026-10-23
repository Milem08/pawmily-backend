import { ZodIssue } from 'zod';
import { DomainError } from '../../../src/domain/shared/DomainError';
import {
  detectImageType,
  MAX_PHOTO_BYTES,
  PHOTO_EXTERNAL_URL_MESSAGE,
  validatePhotoValue,
} from '../../../src/domain/shared/imageValidation';
import {
  createPatientSchema,
  registerSchema,
  updatePatientSchema,
  updateProfileSchema,
} from '../../../src/interfaces/http/dto/schemas';
import { validateBody } from '../../../src/interfaces/http/middleware/validate';

const INVALID = 'La foto debe ser una imagen JPG, PNG o WebP.';
const TOO_LARGE = 'La foto supera 1.5 MB; usa una imagen más pequeña.';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function imageBuffer(kind: 'jpeg' | 'png' | 'webp', size = 16): Buffer {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  if (kind === 'jpeg') {
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    return buf;
  }
  if (kind === 'png') {
    PNG_SIG.copy(buf);
    return buf;
  }
  buf.write('RIFF', 0, 'ascii');
  buf.write('WEBP', 8, 'ascii');
  return buf;
}

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

const patientBase = {
  name: 'Luna',
  species: 'Pez',
  age: '1',
  sex: 'hembra',
  ownerName: 'Ana',
};

function photoIssue(issues: ZodIssue[]): string | undefined {
  return issues.find((issue) => issue.path[0] === 'photo')?.message;
}

describe('detectImageType', () => {
  it('reconoce JPEG, PNG y WebP y rechaza otros binarios', () => {
    expect(detectImageType(imageBuffer('jpeg'))).toBe('jpeg');
    expect(detectImageType(imageBuffer('png'))).toBe('png');
    expect(detectImageType(imageBuffer('webp'))).toBe('webp');
    expect(detectImageType(Buffer.from([0x4d, 0x5a]))).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.4'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
  });
});

describe('validatePhotoValue', () => {
  const signed =
    'https://abc.supabase.co/storage/v1/object/sign/pet-photos/luna.jpg?token=eyJhbGciOiJIUzI1NiJ9.firma';

  it('acepta vacío y asset:<id>, y rechaza una URL http(s)', () => {
    expect(validatePhotoValue(undefined)).toEqual({ ok: true });
    expect(validatePhotoValue(null)).toEqual({ ok: true });
    expect(validatePhotoValue('')).toEqual({ ok: true });
    expect(validatePhotoValue('asset:abc')).toEqual({ ok: true });
    expect(validatePhotoValue(signed)).toEqual({ ok: false, message: PHOTO_EXTERNAL_URL_MESSAGE });
    expect(validatePhotoValue('https://cdn.example.com/placeholder.png')).toEqual({
      ok: false,
      message: PHOTO_EXTERNAL_URL_MESSAGE,
    });
    expect(validatePhotoValue('http://localhost/placeholder.png')).toEqual({
      ok: false,
      message: PHOTO_EXTERNAL_URL_MESSAGE,
    });
  });

  it('acepta el placeholder estático de la web sin descargarlo ni convertirlo', () => {
    const placeholders = [
      '../assets/placeholder-pet.svg',
      'assets/placeholder-pet.svg',
      '/assets/placeholder-pet.svg',
    ];
    for (const value of placeholders) {
      expect(validatePhotoValue(value)).toEqual({ ok: true });
    }
  });

  it('rechaza assets con .. extra, barras de más o esquema', () => {
    const rejected = [
      '../../assets/placeholder-pet.svg',
      '../assets/../placeholder-pet.svg',
      'assets/../placeholder-pet.svg',
      'assets/placeholder-pet.svg/extra',
      './assets/placeholder-pet.svg',
      'javascript:../assets/placeholder-pet.svg',
    ];
    for (const value of rejected) {
      expect(validatePhotoValue(value)).toEqual({ ok: false, message: INVALID });
    }
  });

  it('acepta data URL de JPG, PNG y WebP cuyo contenido coincide', () => {
    expect(validatePhotoValue(dataUrl('image/jpeg', imageBuffer('jpeg')))).toEqual({ ok: true });
    expect(validatePhotoValue(dataUrl('image/png', imageBuffer('png')))).toEqual({ ok: true });
    expect(validatePhotoValue(dataUrl('image/webp', imageBuffer('webp')))).toEqual({ ok: true });
    expect(validatePhotoValue(dataUrl('image/jpeg', imageBuffer('jpeg', MAX_PHOTO_BYTES)))).toEqual({
      ok: true,
    });
  });

  it('rechaza pdf, exe, svg con script, gif, exe renombrado, base64 corrupto y javascript:', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const pdf = Buffer.from('%PDF-1.4\n');
    const gif = Buffer.from('GIF89a');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    const rejected = [
      dataUrl('application/pdf', pdf),
      dataUrl('application/x-msdownload', exe),
      dataUrl('image/svg+xml', svg),
      dataUrl('image/gif', gif),
      dataUrl('image/jpeg', exe),
      'data:image/jpeg;base64,****',
      'data:image/jpeg;base64,abc',
      'javascript:alert(1)',
    ];

    for (const value of rejected) {
      expect(validatePhotoValue(value)).toEqual({ ok: false, message: INVALID });
    }
  });

  it('rechaza una imagen válida de más de 1.5 MB', () => {
    const huge = dataUrl('image/jpeg', imageBuffer('jpeg', MAX_PHOTO_BYTES + 1));
    expect(validatePhotoValue(huge)).toEqual({ ok: false, message: TOO_LARGE });
  });
});

describe('schemas de foto', () => {
  const cases = [
    {
      name: 'createPatientSchema',
      parse: (photo?: string) => createPatientSchema.safeParse({ ...patientBase, photo }),
    },
    {
      name: 'updatePatientSchema',
      parse: (photo?: string) => updatePatientSchema.safeParse({ photo }),
    },
    {
      name: 'updateProfileSchema',
      parse: (photo?: string) => updateProfileSchema.safeParse({ photo }),
    },
  ];

  const exeAsJpeg = dataUrl('image/jpeg', Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
  const validJpeg = dataUrl('image/jpeg', imageBuffer('jpeg'));

  it.each(cases)('$name acepta asset y JPG', ({ parse }) => {
    expect(parse('asset:abc').success).toBe(true);
    expect(parse(validJpeg).success).toBe(true);
    expect(parse('').success).toBe(true);
  });

  it('create rechaza una URL firmada o externa y el update la deja pasar', () => {
    const signed =
      'https://abc.supabase.co/storage/v1/object/sign/pet-photos/luna.jpg?token=eyJhbGciOiJIUzI1NiJ9.firma';
    const external = 'https://cdn.example.com/luna.png?X-Amz-Signature=abc';

    for (const photo of [signed, external]) {
      const created = createPatientSchema.safeParse({ ...patientBase, photo });
      expect(created.success).toBe(false);
      if (!created.success) expect(photoIssue(created.error.issues)).toBe(PHOTO_EXTERNAL_URL_MESSAGE);

      const registered = registerSchema.safeParse({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'secreto1',
        photo,
      });
      expect(registered.success).toBe(false);

      expect(updatePatientSchema.safeParse({ photo }).success).toBe(true);
      expect(updateProfileSchema.safeParse({ photo }).success).toBe(true);
    }

    const byAlias = createPatientSchema.safeParse({ ...patientBase, photoUrl: signed });
    expect(byAlias.success).toBe(false);
    if (!byAlias.success) {
      expect(byAlias.error.issues.find((issue) => issue.path[0] === 'photoUrl')?.message).toBe(
        PHOTO_EXTERNAL_URL_MESSAGE,
      );
    }
    expect(updatePatientSchema.safeParse({ photoUrl: signed, name: 'Luna' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ photoUrl: external }).success).toBe(true);
  });

  it('createPatientSchema acepta el placeholder estático', () => {
    for (const photo of [
      '../assets/placeholder-pet.svg',
      'assets/placeholder-pet.svg',
      '/assets/placeholder-pet.svg',
    ]) {
      expect(createPatientSchema.safeParse({ ...patientBase, photo }).success).toBe(true);
    }
  });

  it('createPatientSchema rechaza javascript, exe renombrado y foto de más de 1.5 MB', () => {
    const parse = (photo?: string) => createPatientSchema.safeParse({ ...patientBase, photo });
    const script = parse('javascript:alert(1)');
    const renamed = parse(exeAsJpeg);
    const huge = parse(dataUrl('image/png', imageBuffer('png', MAX_PHOTO_BYTES + 1)));

    expect(script.success).toBe(false);
    expect(renamed.success).toBe(false);
    expect(huge.success).toBe(false);
    if (!script.success) expect(photoIssue(script.error.issues)).toBe(INVALID);
    if (!renamed.success) expect(photoIssue(renamed.error.issues)).toBe(INVALID);
    if (!huge.success) expect(photoIssue(huge.error.issues)).toBe(TOO_LARGE);
  });

  it('los schemas de update dejan pasar un gif o svg antiguo', () => {
    const gif = dataUrl('image/gif', Buffer.from('GIF89a'));
    const svg = dataUrl('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    expect(updatePatientSchema.safeParse({ photo: gif }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ photo: svg }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ photo: gif }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ photo: svg }).success).toBe(true);
  });

  it('createPatientSchema responde con el formato de validación 400', () => {
    const req = { body: { ...patientBase, photo: 'javascript:alert(1)' } };
    let captured: unknown;
    validateBody(createPatientSchema)(
      req as never,
      {} as never,
      ((err?: unknown) => {
        captured = err;
      }) as never,
    );

    expect(captured).toBeInstanceOf(DomainError);
    const error = captured as DomainError;
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe(INVALID);
  });
});
