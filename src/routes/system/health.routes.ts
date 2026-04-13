import { Hono } from 'hono';
import { getDb } from '../../db';
import { sql } from 'drizzle-orm';
import { beijingIsoString } from '../../utils/time';
import { serverState } from '../../runtime/server-state';

const health = new Hono();

health.get('/', async (c) => {
  const status = serverState.status();

  if (!status.ready || status.shuttingDown) {
    return c.json({
      success: false,
      data: {
        status: status.shuttingDown ? 'shutting-down' : 'starting',
        deploySlot: status.deploySlot,
        shutdownSignal: status.shutdownSignal,
      },
    }, 503);
  }

  try {
    const db = getDb();
    db.run(sql`SELECT 1`);
    return c.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: beijingIsoString(),
        uptime: process.uptime(),
        deploySlot: status.deploySlot,
      },
    });
  } catch {
    return c.json({
      success: false,
      data: {
        status: 'error',
        deploySlot: status.deploySlot,
      },
    }, 503);
  }
});

export default health;
