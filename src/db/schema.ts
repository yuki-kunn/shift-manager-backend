import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['contract', 'intern', 'part'] }).notNull(),
  hourlyWage: integer('hourly_wage').notNull().default(1173),
  color: text('color').notNull().default('#6366f1'),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const businessHours = sqliteTable('business_hours', {
  id: text('id').primaryKey(),
  openTime: text('open_time').notNull().default('09:00'),
  closeTime: text('close_time').notNull().default('21:00'),
  longShiftThreshold: integer('long_shift_threshold').notNull().default(6),
  minStaff: integer('min_staff').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const shiftRequests = sqliteTable('shift_requests', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  day: integer('day').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  isAvailable: integer('is_available', { mode: 'boolean' }).notNull().default(true),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const scheduleSlots = sqliteTable('schedule_slots', {
  id: text('id').primaryKey(),
  scheduleId: text('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
