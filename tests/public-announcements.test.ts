import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { initDatabase } from '../src/db';
import { registerRoutes } from '../src/routes';

beforeAll(() => {
  initDatabase();
});

describe('public announcements route', () => {
  it('GET /api/public/announcements should return announcements without auth', async () => {
    const app = new Hono();
    registerRoutes(app);

    const res = await app.request('http://localhost/api/public/announcements');
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const announcement = body.data[0];
    expect(typeof announcement.id).toBe('string');
    expect(typeof announcement.title).toBe('string');
    expect(typeof announcement.content).toBe('string');
    expect(typeof announcement.date).toBe('string');
    expect(['info', 'warning', 'error']).toContain(announcement.type);
  });

  it('GET /api/schedule should still require auth', async () => {
    const app = new Hono();
    registerRoutes(app);

    const res = await app.request('http://localhost/api/schedule');
    expect(res.status).toBe(401);

    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(4001);
  });
});
