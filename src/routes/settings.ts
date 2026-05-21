import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { requireFacility, type Env } from '../lib/auth.js';

export const settingsRouter = new Hono<Env>();
settingsRouter.use('*', requireFacility);

settingsRouter.get('/business-hours', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const [bh] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.facilityId, facilityId));
  if (!bh) return c.json({ error: 'Not found' }, 404);
  return c.json(bh);
});

settingsRouter.put('/business-hours', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
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
    .where(eq(schema.businessHours.facilityId, facilityId));
  const [updated] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.facilityId, facilityId));
  return c.json(updated);
});
