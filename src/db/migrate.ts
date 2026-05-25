import { sqlite } from './index.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employee_types (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL DEFAULT 'default',
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'part',
      hourly_wage INTEGER NOT NULL DEFAULT 1177,
      color TEXT NOT NULL DEFAULT '#6366f1',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS business_hours (
      id TEXT PRIMARY KEY,
      facility_id TEXT NOT NULL DEFAULT 'default',
      open_time TEXT NOT NULL DEFAULT '09:00',
      close_time TEXT NOT NULL DEFAULT '21:00',
      long_shift_threshold INTEGER NOT NULL DEFAULT 6,
      min_staff INTEGER NOT NULL DEFAULT 1,
      max_staff INTEGER NOT NULL DEFAULT 5,
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
      facility_id TEXT NOT NULL DEFAULT 'default',
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

  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  addColumnIfMissing('employees', 'priority', `TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low'))`);
  addColumnIfMissing('employees', 'facility_id', `TEXT NOT NULL DEFAULT 'default'`);
  addColumnIfMissing('business_hours', 'min_staff', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('business_hours', 'max_staff', 'INTEGER NOT NULL DEFAULT 5');
  addColumnIfMissing('business_hours', 'facility_id', `TEXT NOT NULL DEFAULT 'default'`);
  addColumnIfMissing('schedules', 'facility_id', `TEXT NOT NULL DEFAULT 'default'`);

  // shift_requests の複合UNIQUEインデックス（INSERT OR REPLACE用）
  const addIndexIfMissing = (indexName: string, ddl: string) => {
    const exists = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
    ).get(indexName);
    if (!exists) {
      sqlite.exec(ddl);
    }
  };
  addIndexIfMissing(
    'idx_shift_requests_unique',
    `CREATE UNIQUE INDEX idx_shift_requests_unique ON shift_requests(employee_id, year, month, day)`
  );

  const now = new Date().toISOString();

  // デフォルト施設（既存データの移行先）
  const defaultFacility = sqlite.prepare('SELECT id FROM facilities WHERE id = ?').get('default') as { id: string } | undefined;
  if (!defaultFacility) {
    sqlite.prepare(
      `INSERT INTO facilities (id, name, username, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)`
    ).run('default', 'デフォルト施設', 'default', hashPassword('changeme'), now, now);
  }

  // 営業時間の初期データ
  const bhCount = sqlite.prepare('SELECT COUNT(*) as c FROM business_hours').get() as { c: number };
  if (bhCount.c === 0) {
    sqlite.prepare(
      `INSERT INTO business_hours (id, facility_id, open_time, close_time, long_shift_threshold, min_staff, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run('default', 'default', '09:00', '21:00', 6, 1, now, now);
  }

  // 従業員タイプの初期データ
  const etCount = sqlite.prepare('SELECT COUNT(*) as c FROM employee_types').get() as { c: number };
  if (etCount.c === 0) {
    const seedTypes = [
      { id: randomUUID(), facilityId: 'default', name: '契約社員', color: '#3b82f6', createdAt: now, updatedAt: now },
      { id: randomUUID(), facilityId: 'default', name: 'インターン', color: '#10b981', createdAt: now, updatedAt: now },
      { id: randomUUID(), facilityId: 'default', name: 'パート', color: '#f59e0b', createdAt: now, updatedAt: now },
    ];
    for (const t of seedTypes) {
      sqlite.prepare(
        `INSERT INTO employee_types (id, facility_id, name, color, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).run(t.id, t.facilityId, t.name, t.color, t.createdAt, t.updatedAt);
    }
  }

  // admin初期アカウント
  const adminCount = sqlite.prepare('SELECT COUNT(*) as c FROM admins').get() as { c: number };
  if (adminCount.c === 0) {
    sqlite.prepare(
      `INSERT INTO admins (id, username, password_hash, created_at, updated_at) VALUES (?,?,?,?,?)`
    ).run(randomUUID(), 'admin', hashPassword('adminpass'), now, now);
    console.log('[migrate] Admin created: admin / adminpass');
  }
}
