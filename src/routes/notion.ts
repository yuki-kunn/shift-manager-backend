import { Hono } from 'hono';
import { requireFacility, type Env } from '../lib/auth.js';

export const notionRouter = new Hono<Env>();
notionRouter.use('*', requireFacility);

notionRouter.post('/pages', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set' }, 500);

  const body = await c.req.json();
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) return c.json(data, res.status as any);
  return c.json(data, 201);
});
