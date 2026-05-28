import { Hono } from 'hono';
import { requireFacility, type Env } from '../lib/auth.js';

export const notionRouter = new Hono<Env>();
notionRouter.use('*', requireFacility);

const NOTION_HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
});

// ページ作成
notionRouter.post('/pages', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set', hint: 'Railwayの環境変数にNOTION_TOKENを設定してください' }, 500);

  const body = await c.req.json();
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[Notion] POST /pages failed:', JSON.stringify(data));
    return c.json(data, res.status as any);
  }
  return c.json(data, 201);
});

// ブロック追加（100件超のシフトを複数リクエストに分割して追加）
notionRouter.post('/blocks/:pageId/children', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set', hint: 'Railwayの環境変数にNOTION_TOKENを設定してください' }, 500);

  const pageId = c.req.param('pageId');
  const body = await c.req.json();
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[Notion] PATCH /blocks/${pageId}/children failed:`, JSON.stringify(data));
    return c.json(data, res.status as any);
  }
  return c.json(data);
});
