import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export const settingsRouter = new Hono();

settingsRouter.get('/business-hours', async (c) => {
  const [bh] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.id, 'default'));
  if (!bh) return c.json({ error: 'Not found' }, 404);
  return c.json(bh);
});

settingsRouter.put('/business-hours', async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.update(schema.businessHours)
    .set({
      openTime: body.openTime,
      closeTime: body.closeTime,
      longShiftThreshold: body.longShiftThreshold,
      minStaff: body.minStaff ?? 1,
      updatedAt: now,
    })
    .where(eq(schema.businessHours.id, 'default'));
  const [updated] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.id, 'default'));
  return c.json(updated);
});
