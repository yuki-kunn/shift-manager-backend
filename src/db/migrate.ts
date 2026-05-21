import { sqlite } from './index.js';

export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('contract','intern','part')),
      hourly_wage INTEGER NOT NULL DEFAULT 1173,
      color TEXT NOT NULL DEFAULT '#6366f1',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_hours (
      id TEXT PRIMARY KEY,
      open_time TEXT NOT NULL DEFAULT '09:00',
      close_time TEXT NOT NULL DEFAULT '21:00',
      long_shift_threshold INTEGER NOT NULL DEFAULT 6,
      min_staff INTEGER NOT NULL DEFAULT 1,
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

  // 既存DBへのカラム追加（ALTER TABLE IF NOT EXISTS はSQLiteで未対応のため個別に試みる）
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  addColumnIfMissing('employees', 'priority', `TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low'))`);
  addColumnIfMissing('business_hours', 'min_staff', 'INTEGER NOT NULL DEFAULT 1');

  const count = sqlite.prepare('SELECT COUNT(*) as c FROM business_hours').get() as { c: number };
  if (count.c === 0) {
    const now = new Date().toISOString();
    sqlite.prepare(
      `INSERT INTO business_hours (id, open_time, close_time, long_shift_threshold, min_staff, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run('default', '09:00', '21:00', 6, 1, now, now);
  }
}
