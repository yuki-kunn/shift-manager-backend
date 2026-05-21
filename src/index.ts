import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { employeesRouter } from './routes/employees.js';
import { settingsRouter } from './routes/settings.js';
import { shiftRequestsRouter } from './routes/shift-requests.js';
import { schedulesRouter } from './routes/schedules.js';
import { aiRouter } from './routes/ai.js';
import { migrate } from './db/migrate.js';

migrate();

const app = new Hono();
app.use('*', cors({ origin: 'http://localhost:5173' }));
app.use('*', logger());

app.route('/api/employees', employeesRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/shift-requests', shiftRequestsRouter);
app.route('/api/schedules', schedulesRouter);
app.route('/api/ai', aiRouter);
app.get('/health', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env.PORT ?? '3001');
console.log(`Server running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
