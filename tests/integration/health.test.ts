import request from 'supertest';
import { createApp } from '../../src/interfaces/http/createApp';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = createApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
