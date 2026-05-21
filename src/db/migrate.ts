import { client } from './index.js';

export async function migrate() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('contract','intern','part')),
      hourly_wage INTEGER NOT NULL DEFAULT 1173,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_hours (
      id TEXT PRIMARY KEY,
      open_time TEXT NOT NULL DEFAULT '09:00',
      close_time TEXT NOT NULL DEFAULT '21:00',
      long_shift_threshold INTEGER NOT NULL DEFAULT 6,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shift_requests (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_slots (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const result = await client.execute('SELECT COUNT(*) as c FROM business_hours');
  const count = result.rows[0].c as number;
  if (count === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO business_hours (id, open_time, close_time, long_shift_threshold, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      args: ['default', '09:00', '21:00', 6, now, now],
    });
  }
}
