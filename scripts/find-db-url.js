/**
 * Prueba varias connection strings (IPv4 pooler) leyendo la password del .env actual.
 * No imprime secretos.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

function extractPassword(url) {
  try {
    const u = new URL(url.replace(/^postgresql:/, 'http:'));
    return decodeURIComponent(u.password || '');
  } catch {
    return '';
  }
}

const password = extractPassword(process.env.DATABASE_URL || '');
const ref = 'ghkrlpebwqqdynqmmsbv';
const encoded = encodeURIComponent(password);

const candidates = [
  {
    name: 'pooler-aws0-6543-user-ref',
    url: `postgresql://postgres.${ref}:${encoded}@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require`,
  },
  {
    name: 'pooler-aws1-6543-user-ref',
    url: `postgresql://postgres.${ref}:${encoded}@aws-1-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require`,
  },
  {
    name: 'pooler-aws0-5432-session',
    url: `postgresql://postgres.${ref}:${encoded}@aws-0-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`,
  },
  {
    name: 'pooler-aws1-5432-session',
    url: `postgresql://postgres.${ref}:${encoded}@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require`,
  },
  {
    name: 'direct-6543',
    url: `postgresql://postgres:${encoded}@db.${ref}.supabase.co:6543/postgres?sslmode=require&pgbouncer=true`,
  },
];

async function tryOne(name, url) {
  process.env.DATABASE_URL = url;
  const p = new PrismaClient();
  try {
    await p.$queryRawUnsafe('SELECT 1 as ok');
    console.log('OK', name);
    await p.$disconnect();
    return url;
  } catch (e) {
    const msg = String(e.message || e)
      .split('\n')
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ');
    console.log('FAIL', name, msg.slice(0, 200));
    await p.$disconnect().catch(() => {});
    return null;
  }
}

(async () => {
  if (!password || password === 'YOUR_PASSWORD') {
    console.log('NO_PASSWORD');
    process.exit(1);
  }
  for (const c of candidates) {
    const win = await tryOne(c.name, c.url);
    if (win) {
      console.log('WINNER', c.name);
      process.exit(0);
    }
  }
  process.exit(1);
})();
