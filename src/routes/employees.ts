import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireFacility, type Env } from '../lib/auth.js';

export const employeesRouter = new Hono<Env>();
employeesRouter.use('*', requireFacility);

const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
let colorIdx = 0;
function generateColor() { return COLORS[colorIdx++ % COLORS.length]; }

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
    type: body.type,
    hourlyWage: body.hourlyWage ?? 1173,
    color: body.color ?? generateColor(),
    priority: body.priority ?? 'medium',
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
  await db.update(schema.employees).set({ ...body, updatedAt: now })
    .where(and(eq(schema.employees.id, id), eq(schema.employees.facilityId, facilityId)));
  const [updated] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  return c.json(updated);
});

employeesRouter.delete('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  await db.delete(schema.employees)
    .where(and(eq(schema.employees.id, c.req.param('id')), eq(schema.employees.facilityId, facilityId)));
  return c.json({ success: true });
});
