import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireFacility, type Env } from '../lib/auth.js';

export const employeesRouter = new Hono<Env>();
employeesRouter.use('*', requireFacility);

employeesRouter.get('/', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const list = await db.select().from(schema.employees).where(eq(schema.employees.facilityId, facilityId));
  return c.json(list);
});

employeesRouter.post('/', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const body = await c.req.json();
  const now = new Date().toISOString();
  const employee = {
    id: randomUUID(),
    facilityId,
    name: body.name,
    reading: body.reading ?? null,
    type: body.type,
    hourlyWage: body.hourlyWage ?? 1177,
    color: body.color ?? '#6366f1',
    priority: body.priority ?? 'medium',
    incomeLower: body.incomeLower ?? null,
    incomeUpper: body.incomeUpper ?? null,
    smaregiEmployeeId: body.smaregiEmployeeId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.employees).values(employee);
  return c.json(employee, 201);
});

employeesRouter.put('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();
  // Drizzle の型に合わせてホワイトリスト更新
  await db.update(schema.employees).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.reading !== undefined && { reading: body.reading ?? null }),
    ...(body.type !== undefined && { type: body.type }),
    ...(body.hourlyWage !== undefined && { hourlyWage: body.hourlyWage }),
    ...(body.color !== undefined && { color: body.color }),
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.incomeLower !== undefined && { incomeLower: body.incomeLower ?? null }),
    ...(body.incomeUpper !== undefined && { incomeUpper: body.incomeUpper ?? null }),
    ...(body.smaregiEmployeeId !== undefined && { smaregiEmployeeId: body.smaregiEmployeeId ?? null }),
    updatedAt: now,
  }).where(and(eq(schema.employees.id, id), eq(schema.employees.facilityId, facilityId)));
  const [updated] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  return c.json(updated);
});

employeesRouter.delete('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  await db.delete(schema.employees)
    .where(and(eq(schema.employees.id, c.req.param('id')), eq(schema.employees.facilityId, facilityId)));
  return c.json({ success: true });
});
