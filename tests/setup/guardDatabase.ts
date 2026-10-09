import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const realExistsSync = fs.existsSync.bind(fs);
fs.existsSync = (target: fs.PathLike) => {
  const base = path.basename(String(target));
  if (base === '.env' || base === '.env.local') return false;
  return realExistsSync(target);
};

dotenv.config({ path: '.env.test' });

const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
if (!databaseUrl) {
  // Sin DATABASE_URL las pruebas que necesitan base de datos se omiten.
} else {
  const lower = databaseUrl.toLowerCase();
  if (lower.includes('supabase') || lower.includes('railway') || lower.includes('rlwy')) {
    throw new Error(
      'Las pruebas se niegan a usar esta DATABASE_URL porque apunta a Supabase, Railway o rlwy.',
    );
  }
  let host = '';
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL de prueba no es una URL válida.');
  }
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(
      `Las pruebas se niegan a usar DATABASE_URL con host "${host}". Solo se permite localhost o 127.0.0.1.`,
    );
  }
}
