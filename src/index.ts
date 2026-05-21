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
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(s => s.trim()) : []),
];
console.log('Allowed origins:', allowedOrigins);
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (allowedOrigins.includes(origin)) return origin;
    // Vercelのプレビューデプロイも許可
    if (origin.endsWith('.vercel.app')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', logger());

app.route('/api/employees', employeesRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/shift-requests', shiftRequestsRouter);
app.route('/api/schedules', schedulesRouter);
app.route('/api/ai', aiRouter);
app.get('/health', (c) => c.json({ status: 'ok' }));

const port = parseInt(process.env.PORT ?? '3001');
console.log(`Server running on http://0.0.0.0:${port}`);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
