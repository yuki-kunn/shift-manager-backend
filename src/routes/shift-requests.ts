import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const shiftRequestsRouter = new Hono();

shiftRequestsRouter.get('/', async (c) => {
  const employeeId = c.req.query('employeeId');
  const year = c.req.query('year');
  const month = c.req.query('month');
  const conditions = [];
  if (employeeId) conditions.push(eq(schema.shiftRequests.employeeId, employeeId));
  if (year) conditions.push(eq(schema.shiftRequests.year, parseInt(year)));
  if (month) conditions.push(eq(schema.shiftRequests.month, parseInt(month)));
  const list = conditions.length > 0
    ? await db.select().from(schema.shiftRequests).where(and(...conditions))
    : await db.select().from(schema.shiftRequests);
  return c.json(list);
});

shiftRequestsRouter.post('/bulk', async (c) => {
  const items: Array<{
    employeeId: string; year: number; month: number; day: number;
    startTime?: string | null; endTime?: string | null;
    isAvailable?: boolean; note?: string | null;
  }> = await c.req.json();
  const now = new Date().toISOString();
  const results = [];
  for (const item of items) {
    const [existing] = await db.select().from(schema.shiftRequests).where(and(
      eq(schema.shiftRequests.employeeId, item.employeeId),
      eq(schema.shiftRequests.year, item.year),
      eq(schema.shiftRequests.month, item.month),
      eq(schema.shiftRequests.day, item.day),
    ));
    if (existing) {
      await db.update(schema.shiftRequests).set({
        startTime: item.startTime ?? null,
        endTime: item.endTime ?? null,
        isAvailable: item.isAvailable ?? true,
        note: item.note ?? null,
        updatedAt: now,
      }).where(eq(schema.shiftRequests.id, existing.id));
      const [updated] = await db.select().from(schema.shiftRequests).where(eq(schema.shiftRequests.id, existing.id));
      results.push(updated);
    } else {
      const newReq = {
        id: randomUUID(), employeeId: item.employeeId,
        year: item.year, month: item.month, day: item.day,
        startTime: item.startTime ?? null, endTime: item.endTime ?? null,
        isAvailable: item.isAvailable ?? true, note: item.note ?? null,
        createdAt: now, updatedAt: now,
      };
      await db.insert(schema.shiftRequests).values(newReq);
      results.push(newReq);
    }
  }
  return c.json(results, 201);
});

shiftRequestsRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.update(schema.shiftRequests).set({ ...body, updatedAt: now }).where(eq(schema.shiftRequests.id, id));
  const [updated] = await db.select().from(schema.shiftRequests).where(eq(schema.shiftRequests.id, id));
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});
