import { Hono } from 'hono';
import { db, sqlite, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireFacility, type Env } from '../lib/auth.js';

export const shiftRequestsRouter = new Hono<Env>();
shiftRequestsRouter.use('*', requireFacility);

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

  const upsert = sqlite.prepare(`
    INSERT INTO shift_requests (id, employee_id, year, month, day, start_time, end_time, is_available, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(employee_id, year, month, day) DO UPDATE SET
      start_time=excluded.start_time,
      end_time=excluded.end_time,
      is_available=excluded.is_available,
      note=excluded.note,
      updated_at=excluded.updated_at
  `);

  const insertMany = sqlite.transaction((rows: unknown[][]) => {
    for (const row of rows) upsert.run(...row);
  });

  const rows = items.map(item => [
    randomUUID(),
    item.employeeId,
    item.year,
    item.month,
    item.day,
    item.startTime ?? null,
    item.endTime ?? null,
    (item.isAvailable ?? true) ? 1 : 0,
    item.note ?? null,
    now,
    now,
  ]);

  insertMany(rows);

  return c.json(items, 201);
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
