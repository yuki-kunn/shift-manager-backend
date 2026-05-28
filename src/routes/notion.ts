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

// 親ページ配下の子ページ一覧を取得（タイトルで既存ページを探すため）
notionRouter.get('/blocks/:pageId/children', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set' }, 500);

  const pageId = c.req.param('pageId');
  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    method: 'GET',
    headers: NOTION_HEADERS(token),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[Notion] GET /blocks/${pageId}/children failed:`, JSON.stringify(data));
    return c.json(data, res.status as any);
  }
  return c.json(data);
});

// ページのブロックを全削除（更新前にクリアするため）
notionRouter.delete('/blocks/:pageId/children', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set' }, 500);

  const pageId = c.req.param('pageId');

  // まず全ブロックを取得
  let cursor: string | undefined;
  const blockIds: string[] = [];
  do {
    const url = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await fetch(url, { method: 'GET', headers: NOTION_HEADERS(token) });
    const data = await res.json() as any;
    if (!res.ok) return c.json(data, res.status as any);
    for (const block of data.results ?? []) {
      blockIds.push(block.id);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  // 全ブロックを削除
  for (const blockId of blockIds) {
    await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
      method: 'DELETE',
      headers: NOTION_HEADERS(token),
    });
  }

  return c.json({ deleted: blockIds.length });
});

// ページのタイトルを検索（既存ページ検索用）
notionRouter.post('/search', async (c) => {
  const token = process.env.NOTION_TOKEN;
  if (!token) return c.json({ error: 'NOTION_TOKEN not set' }, 500);

  const body = await c.req.json();
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: NOTION_HEADERS(token),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[Notion] POST /search failed:', JSON.stringify(data));
    return c.json(data, res.status as any);
  }
  return c.json(data);
});
