import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';

export const schedulesRouter = new Hono();

schedulesRouter.get('/', async (c) => {
  const year = c.req.query('year');
  const month = c.req.query('month');
  const conditions = [];
  if (year) conditions.push(eq(schema.schedules.year, parseInt(year)));
  if (month) conditions.push(eq(schema.schedules.month, parseInt(month)));
  const list = conditions.length > 0
    ? await db.select().from(schema.schedules).where(and(...conditions))
    : await db.select().from(schema.schedules);
  const result = await Promise.all(list.map(async (s) => {
    const slots = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.scheduleId, s.id));
    return { ...s, slots };
  }));
  return c.json(result);
});

schedulesRouter.get('/:id', async (c) => {
  const [s] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, c.req.param('id')));
  if (!s) return c.json({ error: 'Not found' }, 404);
  const slots = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.scheduleId, s.id));
  return c.json({ ...s, slots });
});

schedulesRouter.put('/:id/slots/:slotId', async (c) => {
  const { id: scheduleId, slotId } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();
  const [schedule] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, scheduleId));
  if (!schedule) return c.json({ error: 'Schedule not found' }, 404);
  await db.update(schema.scheduleSlots).set({
    startTime: body.startTime,
    endTime: body.endTime,
    note: body.note ?? null,
    updatedAt: now,
  }).where(and(eq(schema.scheduleSlots.id, slotId), eq(schema.scheduleSlots.scheduleId, scheduleId)));
  const [updated] = await db.select().from(schema.scheduleSlots).where(eq(schema.scheduleSlots.id, slotId));
  if (!updated) return c.json({ error: 'Slot not found' }, 404);
  return c.json(updated);
});

schedulesRouter.delete('/:id', async (c) => {
  const [s] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, c.req.param('id')));
  if (!s) return c.json({ error: 'Not found' }, 404);
  await db.delete(schema.schedules).where(eq(schema.schedules.id, c.req.param('id')));
  return c.json({ success: true });
});
