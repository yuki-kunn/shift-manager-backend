import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireFacility, type Env } from '../lib/auth.js';

export const eventsRouter = new Hono<Env>();
eventsRouter.use('*', requireFacility);

// 年月でイベント一覧取得
eventsRouter.get('/', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const { year, month } = c.req.query();

  let events;
  if (year && month) {
    const y = year.padStart(4, '0');
    const m = month.padStart(2, '0');
    const prefix = `${y}-${m}`;
    events = await db.select().from(schema.events)
      .where(and(
        eq(schema.events.facilityId, facilityId),
      ));
    events = events.filter(e => e.date.startsWith(prefix));
  } else {
    events = await db.select().from(schema.events)
      .where(eq(schema.events.facilityId, facilityId));
  }

  // 各イベントに紐づく従業員を取得
  const result = await Promise.all(events.map(async (event) => {
    const members = await db.select({
      id: schema.eventEmployees.id,
      eventId: schema.eventEmployees.eventId,
      employeeId: schema.eventEmployees.employeeId,
      note: schema.eventEmployees.note,
      startTime: schema.eventEmployees.startTime,
      endTime: schema.eventEmployees.endTime,
      createdAt: schema.eventEmployees.createdAt,
    }).from(schema.eventEmployees)
      .where(eq(schema.eventEmployees.eventId, event.id));
    return { ...event, members };
  }));

  return c.json(result);
});

// イベント作成
eventsRouter.post('/', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const body = await c.req.json();
  const now = new Date().toISOString();
  const event = {
    id: randomUUID(),
    facilityId,
    date: body.date,
    title: body.title,
    description: body.description ?? null,
    color: body.color ?? '#6366f1',
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.events).values(event);
  return c.json({ ...event, members: [] }, 201);
});

// イベント更新
eventsRouter.put('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const id = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();
  await db.update(schema.events)
    .set({ title: body.title, description: body.description ?? null, color: body.color, date: body.date, updatedAt: now })
    .where(and(eq(schema.events.id, id), eq(schema.events.facilityId, facilityId)));
  const [updated] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  const members = await db.select({
    id: schema.eventEmployees.id,
    eventId: schema.eventEmployees.eventId,
    employeeId: schema.eventEmployees.employeeId,
    note: schema.eventEmployees.note,
    startTime: schema.eventEmployees.startTime,
    endTime: schema.eventEmployees.endTime,
    createdAt: schema.eventEmployees.createdAt,
  }).from(schema.eventEmployees).where(eq(schema.eventEmployees.eventId, id));
  return c.json({ ...updated, members });
});

// イベント削除
eventsRouter.delete('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  await db.delete(schema.events)
    .where(and(eq(schema.events.id, c.req.param('id')), eq(schema.events.facilityId, facilityId)));
  return c.json({ success: true });
});

// イベントに従業員を追加
eventsRouter.post('/:id/members', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const eventId = c.req.param('id');
  const body = await c.req.json();
  const now = new Date().toISOString();

  // イベントが自施設のものか確認
  const [event] = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.facilityId, facilityId)));
  if (!event) return c.json({ error: 'Not found' }, 404);

  const member = {
    id: randomUUID(),
    eventId,
    employeeId: body.employeeId,
    note: body.note ?? null,
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
    createdAt: now,
  };
  await db.insert(schema.eventEmployees).values(member);
  return c.json(member, 201);
});

// イベントから従業員を削除
eventsRouter.delete('/:id/members/:memberId', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const eventId = c.req.param('id');
  const memberId = c.req.param('memberId');

  const [event] = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.facilityId, facilityId)));
  if (!event) return c.json({ error: 'Not found' }, 404);

  await db.delete(schema.eventEmployees).where(eq(schema.eventEmployees.id, memberId));
  return c.json({ success: true });
});
