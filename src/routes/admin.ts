import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../lib/auth.js';
import { requireAdmin, type Env } from '../lib/auth.js';
import { randomUUID } from 'crypto';

export const adminRouter = new Hono<Env>();
adminRouter.use('*', requireAdmin);

// 施設一覧
adminRouter.get('/facilities', async (c) => {
  const list = await db.select({
    id: schema.facilities.id,
    name: schema.facilities.name,
    username: schema.facilities.username,
    createdAt: schema.facilities.createdAt,
  }).from(schema.facilities).where(
    eq(schema.facilities.id, schema.facilities.id) // all rows (no filter on 'default' to show all)
  );
  return c.json(list);
});

// 施設追加
adminRouter.post('/facilities', async (c) => {
  const { name, username, password } = await c.req.json();
  if (!name || !username || !password) return c.json({ error: 'name, username, password required' }, 400);

  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(schema.facilities).values({
    id, name, username,
    passwordHash: hashPassword(password),
    createdAt: now, updatedAt: now,
  });

  // 施設用の営業時間を初期作成
  await db.insert(schema.businessHours).values({
    id: randomUUID(), facilityId: id,
    openTime: '09:00', closeTime: '21:00',
    longShiftThreshold: 6, minStaff: 1,
    createdAt: now, updatedAt: now,
  });

  return c.json({ id, name, username }, 201);
});

// 施設削除
adminRouter.delete('/facilities/:id', async (c) => {
  const id = c.req.param('id');
  if (id === 'default') return c.json({ error: 'Cannot delete default facility' }, 400);
  await db.delete(schema.facilities).where(eq(schema.facilities.id, id));
  return c.json({ success: true });
});

// 施設パスワード変更
adminRouter.put('/facilities/:id/password', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.json();
  if (!password) return c.json({ error: 'password required' }, 400);
  const now = new Date().toISOString();
  await db.update(schema.facilities)
    .set({ passwordHash: hashPassword(password), updatedAt: now })
    .where(eq(schema.facilities.id, id));
  return c.json({ success: true });
});
