import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

// libsql:// → https:// に変換してHTTPクライアントを強制使用 (WebSocketが通らない環境対策)
const rawUrl = process.env.TURSO_DATABASE_URL ?? 'file:./data/shift.db';
const url = rawUrl.startsWith('libsql://') ? rawUrl.replace('libsql://', 'https://') : rawUrl;
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });
export { schema };
