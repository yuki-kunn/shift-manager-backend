import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword, signToken } from '../lib/auth.js';
import { randomUUID } from 'crypto';

export const authRouter = new Hono();

// admin ログイン
authRouter.post('/admin/login', async (c) => {
  const { username, password } = await c.req.json();
  const [admin] = await db.select().from(schema.admins).where(eq(schema.admins.username, username));
  if (!admin || admin.passwordHash !== hashPassword(password)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const token = await signToken({ sub: admin.id, role: 'admin' });
  return c.json({ token, role: 'admin' });
});

// 施設ログイン
authRouter.post('/facility/login', async (c) => {
  const { username, password } = await c.req.json();
  const [facility] = await db.select().from(schema.facilities).where(eq(schema.facilities.username, username));
  if (!facility || facility.passwordHash !== hashPassword(password)) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const token = await signToken({ sub: facility.id, role: 'facility', facilityId: facility.id });
  return c.json({ token, role: 'facility', facilityId: facility.id, facilityName: facility.name });
});
