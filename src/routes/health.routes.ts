import { Hono } from 'hono';
import { getDb } from '../db';
import { sql } from 'drizzle-orm';
import { beijingIsoString } from '../utils/time';

const health = new Hono();

health.get('/', async (c) => {
  try {
    const db = getDb();
    db.run(sql`SELECT 1`);
    return c.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: beijingIsoString(),
        uptime: process.uptime(),
      },
    });
  } catch {
    return c.json({
      success: false,
      data: { status: 'error' },
    }, 503);
  }
});

export default health;
