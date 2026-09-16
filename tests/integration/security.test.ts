import request from 'supertest';
import { createApp } from '../../src/interfaces/http/createApp';

describe('Security: authz and surface', () => {
  const app = createApp();

  it('rejects protected routes without Bearer token', async () => {
    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/autorizado/i);
  });

  it('rejects protected routes with invalid JWT', async () => {
    const res = await request(app)
      .get('/api/patients')
      .set('Authorization', 'Bearer invalid.token.value');
    expect(res.status).toBe(401);
  });

  it('does not expose stack traces on domain errors', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).toHaveProperty('message');
  });

  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Performance: health latency', () => {
  const app = createApp();

  it('responds to health under 200ms locally', async () => {
    const started = Date.now();
    const res = await request(app).get('/api/health');
    const ms = Date.now() - started;
    expect(res.status).toBe(200);
    expect(ms).toBeLessThan(200);
  });
});
