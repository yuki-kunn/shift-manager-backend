import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const employeesRouter = new Hono();

const COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
let colorIdx = 0;
function generateColor() { return COLORS[colorIdx++ % COLORS.length]; }

employeesRouter.get('/', async (c) => {
  const list = await db.select().from(schema.employees);
  return c.json(list);
});

employeesRouter.post('/', async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const employee = {
    id: randomUUID(),
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

employeesRouter.get('/:id', async (c) => {
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, c.req.param('id')));
  if (!emp) return c.json({ error: 'Not found' }, 404);
  return c.json(emp);
});

employeesRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.update(schema.employees).set({ ...body, updatedAt: now }).where(eq(schema.employees.id, id));
  const [updated] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  return c.json(updated);
});

employeesRouter.delete('/:id', async (c) => {
  await db.delete(schema.employees).where(eq(schema.employees.id, c.req.param('id')));
  return c.json({ success: true });
});
