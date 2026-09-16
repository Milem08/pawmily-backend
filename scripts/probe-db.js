require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe('SELECT 1 as ok')
  .then(() => {
    console.log('DB_OK');
    return p.$disconnect();
  })
  .catch(async (e) => {
    console.error('DB_FAIL_NAME', e.name || 'unknown');
    console.error('DB_FAIL_CODE', e.code || 'none');
    const msg = String(e.message || e).replace(/:[^:@/]+@/g, ':***@');
    console.error('DB_FAIL_MSG', msg.slice(0, 300));
    await p.$disconnect();
    process.exit(1);
  });
