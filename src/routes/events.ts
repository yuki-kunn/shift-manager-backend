import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, and, like } from 'drizzle-orm';
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
    const prefix = `${y}-${m}-%`;
    events = await db.select().from(schema.events)
      .where(and(eq(schema.events.facilityId, facilityId), like(schema.events.date, prefix)));
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
    startTime: body.startTime ?? null,
    endTime: body.endTime ?? null,
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
    .set({
      title: body.title,
      description: body.description ?? null,
      color: body.color,
      date: body.date,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      updatedAt: now,
    })
    .where(and(eq(schema.events.id, id), eq(schema.events.facilityId, facilityId)));
  const [updated] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  const members = await db.select({
    id: schema.eventEmployees.id,
    eventId: schema.eventEmployees.eventId,
    employeeId: schema.eventEmployees.employeeId,
    note: schema.eventEmployees.note,
    createdAt: schema.eventEmployees.createdAt,
  }).from(schema.eventEmployees).where(eq(schema.eventEmployees.eventId, id));
  return c.json({ ...updated, members });
});

// イベント削除
eventsRouter.delete('/:id', async (c) => {
  const { facilityId } = c.get('auth') as { facilityId: string };
  const eventId = c.req.param('id');

  // 削除前にイベント情報・メンバー一覧を取得してシフトスロットを先に削除
  const [event] = await db.select().from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.facilityId, facilityId)));

  if (event && event.startTime && event.endTime) {
    const members = await db.select().from(schema.eventEmployees)
      .where(eq(schema.eventEmployees.eventId, eventId));

    if (members.length > 0) {
      const [y, m] = event.date.split('-').map(Number);
      const [sched] = await db.select().from(schema.schedules).where(
        and(
          eq(schema.schedules.facilityId, facilityId),
          eq(schema.schedules.year, y),
          eq(schema.schedules.month, m),
        )
      );
      if (sched) {
        for (const member of members) {
          await db.delete(schema.scheduleSlots).where(
            and(
              eq(schema.scheduleSlots.scheduleId, sched.id),
              eq(schema.scheduleSlots.employeeId, member.employeeId),
              eq(schema.scheduleSlots.date, event.date),
            )
          );
        }
      }
    }
  }

  // event_employees は ON DELETE CASCADE で自動削除される
  await db.delete(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.facilityId, facilityId)));
  return c.json({ success: true });
});

/** イベントの日付から year/month を取得してスケジュールを upsert し scheduleId を返す */
async function getOrCreateSchedule(facilityId: string, date: string, now: string): Promise<string> {
  const [y, m] = date.split('-').map(Number);
  const [existing] = await db.select().from(schema.schedules).where(
    and(
      eq(schema.schedules.facilityId, facilityId),
      eq(schema.schedules.year, y),
      eq(schema.schedules.month, m),
    )
  );
  if (existing) return existing.id;
  const scheduleId = randomUUID();
  await db.insert(schema.schedules).values({
    id: scheduleId, facilityId, year: y, month: m,
    status: 'draft', createdAt: now, updatedAt: now,
  });
  return scheduleId;
}

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
    createdAt: now,
  };
  await db.insert(schema.eventEmployees).values(member);

  // イベントにシフト時間が設定されている場合はスケジュールスロットを即時追加
  if (event.startTime && event.endTime) {
    const scheduleId = await getOrCreateSchedule(facilityId, event.date, now);
    // 同日・同従業員の重複チェック（既存スロットがあれば上書き）
    const [existingSlot] = await db.select().from(schema.scheduleSlots).where(
      and(
        eq(schema.scheduleSlots.scheduleId, scheduleId),
        eq(schema.scheduleSlots.employeeId, body.employeeId),
        eq(schema.scheduleSlots.date, event.date),
      )
    );
    if (existingSlot) {
      // 既存スロットをイベント時間で上書き
      await db.update(schema.scheduleSlots).set({
        startTime: event.startTime,
        endTime: event.endTime,
        note: `イベント: ${event.title}`,
        updatedAt: now,
      }).where(eq(schema.scheduleSlots.id, existingSlot.id));
    } else {
      await db.insert(schema.scheduleSlots).values({
        id: randomUUID(), scheduleId,
        employeeId: body.employeeId,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        note: `イベント: ${event.title}`,
        createdAt: now, updatedAt: now,
      });
    }
  }

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

  // 削除するメンバーの employeeId を取得
  const [member] = await db.select().from(schema.eventEmployees)
    .where(eq(schema.eventEmployees.id, memberId));

  await db.delete(schema.eventEmployees).where(eq(schema.eventEmployees.id, memberId));

  // 対応するスケジュールスロットも削除（イベント由来のもののみ）
  if (member && event.startTime && event.endTime) {
    const [y, m] = event.date.split('-').map(Number);
    const [sched] = await db.select().from(schema.schedules).where(
      and(
        eq(schema.schedules.facilityId, facilityId),
        eq(schema.schedules.year, y),
        eq(schema.schedules.month, m),
      )
    );
    if (sched) {
      await db.delete(schema.scheduleSlots).where(
        and(
          eq(schema.scheduleSlots.scheduleId, sched.id),
          eq(schema.scheduleSlots.employeeId, member.employeeId),
          eq(schema.scheduleSlots.date, event.date),
        )
      );
    }
  }

  return c.json({ success: true });
});
