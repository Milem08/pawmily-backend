import request from 'supertest';
import { createApp } from '../../src/interfaces/http/createApp';

jest.setTimeout(60000);

describe('SEC-01 CORS', () => {
  const app = createApp();

  it('rechaza un origen vercel ajeno y permite el origen configurado', async () => {
    const blocked = await request(app).get('/api/health').set('Origin', 'https://atacante.vercel.app');
    expect(blocked.status).toBe(200);
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://pawmyli-one.vercel.app');
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://pawmyli-one.vercel.app');
  });

  it('sigue respondiendo si la petición no trae Origin', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('con CORS_ORIGINS vacío no abre el origen a cualquiera', async () => {
    const previous = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = '';
    jest.resetModules();
    try {
      const { createApp: createFreshApp } = await import('../../src/interfaces/http/createApp');
      const fresh = createFreshApp();
      const blocked = await request(fresh)
        .get('/api/health')
        .set('Origin', 'https://atacante.vercel.app');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
      const noOrigin = await request(fresh).get('/api/health');
      expect(noOrigin.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
      jest.resetModules();
    }
  });
});

describe('BE-24 entradas inválidas', () => {
  const app = createApp();

  it('responde 413 cuando el cuerpo supera 2 MB', async () => {
    const payload = `{"blob":"${'x'.repeat(Math.ceil(2.2 * 1024 * 1024))}"}`;
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/2 MB/);
  });

  it('responde 400 cuando el JSON está malformado', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(res.status).toBe(400);
  });
});

describe('BE-23 límite por IP y refresh', () => {
  async function appBehindProxy() {
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.TEST_AUTH_RATE_MAX = '30';
    jest.resetModules();
    const { createApp: createFreshApp } = await import('../../src/interfaces/http/createApp');
    return createFreshApp();
  }

  it('no comparte el límite de login entre dos IPs y el refresh tiene cupo propio', async () => {
    const app = await appBehindProxy();
    const login = (ip: string) =>
      request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'nadie@example.test', password: 'incorrecta' });

    const firstIp: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await login('203.0.113.10');
      firstIp.push(res.status);
    }
    expect(firstIp.filter((status) => status === 429).length).toBeGreaterThan(0);
    expect(firstIp[0]).not.toBe(429);

    const other = await login('203.0.113.20');
    expect(other.status).not.toBe(429);

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ refreshToken: '0123456789abcdef' });
    expect(refresh.status).not.toBe(429);
  });
});
