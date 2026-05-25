import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
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
      maxStaff: body.maxStaff ?? 5,
      fixedPrompt: body.fixedPrompt ?? null,
      updatedAt: now,
    })
    .where(eq(schema.businessHours.facilityId, facilityId));
  const [updated] = await db.select().from(schema.businessHours).where(eq(schema.businessHours.facilityId, facilityId));
  return c.json(updated);
});

settingsRouter.get('/employee-types', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const list = await db.select().from(schema.employeeTypes).where(eq(schema.employeeTypes.facilityId, facilityId));
  return c.json(list);
});

settingsRouter.post('/employee-types', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const body = await c.req.json();
  const now = new Date().toISOString();
  const newType = {
    id: randomUUID(),
    facilityId,
    name: body.name,
    color: body.color ?? '#6366f1',
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.employeeTypes).values(newType);
  return c.json(newType, 201);
});

settingsRouter.put('/employee-types/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.update(schema.employeeTypes)
    .set({ name: body.name, color: body.color, updatedAt: now })
    .where(and(eq(schema.employeeTypes.id, id), eq(schema.employeeTypes.facilityId, facilityId)));
  const [updated] = await db.select().from(schema.employeeTypes).where(eq(schema.employeeTypes.id, id));
  return c.json(updated);
});

settingsRouter.delete('/employee-types/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  await db.delete(schema.employeeTypes)
    .where(and(eq(schema.employeeTypes.id, c.req.param('id')), eq(schema.employeeTypes.facilityId, facilityId)));
  return c.json({ success: true });
});
