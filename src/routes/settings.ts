import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { requireFacility, type Env } from '../lib/auth.js';
import { randomUUID } from 'crypto';

export const settingsRouter = new Hono<Env>();
settingsRouter.use('*', requireFacility);

settingsRouter.get('/business-hours', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  let [bh] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.facilityId, facilityId));
  if (!bh) {
    const now = new Date().toISOString();
    const newBh = {
      id: randomUUID(), facilityId,
      openTime: '09:00', closeTime: '21:00',
      longShiftThreshold: 6, minStaff: 1,
      createdAt: now, updatedAt: now,
    };
    await db.insert(schema.businessHours).values(newBh);
    bh = newBh as typeof bh;
  }
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
