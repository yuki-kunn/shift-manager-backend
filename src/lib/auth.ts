import { SignJWT, jwtVerify } from 'jose';
import { createHash } from 'crypto';
import type { Context, Next } from 'hono';

export type AuthPayload = { sub: string; role: 'admin' | 'facility'; facilityId?: string };
export type Env = { Variables: { auth: AuthPayload } };

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'shift-manager-secret-key-change-in-prod');

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function signToken(payload: AuthPayload) {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as AuthPayload;
}

function getToken(c: Context): string | null {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function requireAdmin(c: Context<Env>, next: Next) {
  const token = getToken(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verifyToken(token);
    if (payload.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
    c.set('auth', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export async function requireFacility(c: Context<Env>, next: Next) {
  const token = getToken(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const payload = await verifyToken(token);
    if (payload.role !== 'facility') return c.json({ error: 'Forbidden' }, 403);
    c.set('auth', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}
